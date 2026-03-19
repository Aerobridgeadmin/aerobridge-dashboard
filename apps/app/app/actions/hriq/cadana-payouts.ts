"use server";

import { database } from "@repo/database";
import { requireRole } from "@repo/auth/session";
import { revalidatePath } from "next/cache";
import { HriqError } from "@/lib/hriq/errors";
import { RL_ORG_ID } from "./constants";

// ─── Preview ──────────────────────────────────────────────────────────────────

/** Preview a Cadana payout — checks readiness and returns summary */
export async function previewCadanaPayout(paymentId: string) {
  try {
    await requireRole("super_admin");

    const payment = await database.payment.findUnique({
      where: { id: paymentId },
      include: {
        employee: {
          select: {
            id: true,
            legalFirstName: true,
            legalLastName: true,
            personalEmail: true,
            workEmail: true,
            country: true,
            currency: true,
            bankName: true,
            bankAccountNumber: true,
            bankAccountName: true,
            bankRoutingNumber: true,
            bankSwiftCode: true,
            bankExtraData: true,
            cadanaPersonId: true,
            cadanaPersonStatus: true,
            preferredPaymentMethod: true,
            organizationId: true,
          },
        },
      },
    });

    if (!payment) throw new HriqError("HRIQ-0801", "Payment not found");
    if (payment.status === "completed") throw new HriqError("HRIQ-0802", "Payment already completed");

    const emp = payment.employee;
    const amount = Number(payment.amount);
    const hasBankDetails = !!(emp.bankAccountNumber && emp.bankName);
    const hasCadanaPerson = !!emp.cadanaPersonId;
    const hasEmail = !!(emp.personalEmail ?? emp.workEmail);
    const canAutomate = hasCadanaPerson || hasBankDetails || hasEmail; // Wallet pay: just need to onboard via email

    return {
      paymentId: payment.id,
      contractorName: `${emp.legalFirstName} ${emp.legalLastName}`,
      amount,
      currency: payment.currency ?? "USD",
      country: emp.country,
      bankName: emp.bankName,
      hasCadanaPerson,
      cadanaPersonId: emp.cadanaPersonId,
      hasBankDetails,
      canAutomate,
      // Info about what will happen
      willOnboard: !hasCadanaPerson && (hasBankDetails || hasEmail),
      usesWalletPay: !hasBankDetails || hasCadanaPerson, // Will use Cadana wallet rather than bank transfer
      dryRun: process.env.CADANA_DRY_RUN === "true",
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[cadana-payouts:previewCadanaPayout]", msg);
    return { error: msg };
  }
}

// ─── Execute ──────────────────────────────────────────────────────────────────

/** Execute an automated Cadana payout: onboard if needed → set payment info → create payroll → approve */
export async function executeCadanaPayout(data: {
  paymentId: string;
  notes?: string;
  managementPassword?: string;
}) {
  const session = await requireRole("super_admin");
  const { verifyManagementPassword } = await import("./management-auth");
  if (data.managementPassword) await verifyManagementPassword(data.managementPassword);

  try {
    const cadana = await import("@repo/integrations/cadana");

    // 1. Load payment + employee
    const payment = await database.payment.findUnique({
      where: { id: data.paymentId },
      include: {
        employee: {
          include: {
            organization: { include: { profile: true } },
          },
        },
      },
    });

    if (!payment) throw new HriqError("HRIQ-0801", "Payment not found");
    if (payment.status === "completed") throw new HriqError("HRIQ-0802", "Payment already completed");

    const emp = payment.employee;
    const amount = Number(payment.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new HriqError("HRIQ-0804", `Invalid payment amount: ${payment.amount}`);
    }

    if (!emp.cadanaPersonId && (!emp.bankAccountNumber || !emp.bankName)) {
      // Without a cadanaPersonId, we need at least an email to onboard them to Cadana.
      // Bank details are optional — Cadana wallet pay doesn't require them.
      const hasEmail = !!(emp.personalEmail ?? emp.workEmail);
      if (!hasEmail) {
        throw new HriqError("HRIQ-0810", `${emp.legalFirstName} ${emp.legalLastName} has no email address and isn't onboarded to Cadana yet. Add an email so they can be onboarded for wallet pay.`);
      }
      console.log(`[Cadana Payout] ${emp.legalFirstName} ${emp.legalLastName} has no bank details — will proceed with Cadana wallet pay`);
    }

    const dryRun = process.env.CADANA_DRY_RUN === "true";

    // 2. Atomically claim payment
    const claimed = await database.payment.updateMany({
      where: { id: data.paymentId, status: "pending" },
      data: { status: "processing" },
    });
    if (claimed.count === 0) {
      throw new HriqError("HRIQ-0802", "Payment is already being processed or completed");
    }

    let payoutSuccess = false;
    try {
      // 3. Check client invoice is paid (same gate as Wise)
      const empOrgId = emp.organizationId;
      if (payment.periodStart && payment.periodEnd && empOrgId && empOrgId !== RL_ORG_ID) {
        const clientInvoice = await database.clientInvoice.findFirst({
          where: {
            organizationId: empOrgId,
            periodStart: payment.periodStart,
            periodEnd: payment.periodEnd,
          },
          select: { status: true, invoiceNumber: true },
        });
        if (clientInvoice && clientInvoice.status !== "paid" && clientInvoice.status !== "void" && clientInvoice.status !== "cancelled") {
          throw new HriqError("HRIQ-0805",
            `Client invoice ${clientInvoice.invoiceNumber} must be paid before releasing contractor payment (current status: ${clientInvoice.status})`);
        }
      }

      // 4. Ensure contractor is onboarded to Cadana
      let cadanaPersonId = emp.cadanaPersonId;

      if (!cadanaPersonId) {
        const emails = [emp.personalEmail, emp.workEmail].filter(Boolean) as string[];

        // ALWAYS search by email first to avoid creating duplicates
        // Search BOTH personal and work email — person may have signed up with either
        const existingPerson = emails.length > 0 ? await cadana.findCadanaPersonByEmails(emails) : null;
        if (existingPerson) {
          console.log(`[Cadana Payout] Found existing Cadana person for ${emp.legalFirstName} ${emp.legalLastName}: ${existingPerson.id} (email: ${existingPerson.email})`);
          cadanaPersonId = existingPerson.id;
          await database.employee.update({
            where: { id: emp.id },
            data: { cadanaPersonId: existingPerson.id, cadanaPersonStatus: existingPerson.status, cadanaSyncedAt: new Date() },
          });
        } else {
          // No existing person — onboard them
          const INVALID_COUNTRIES = ["other", "n/a", "na", "unknown", "none", "tbd", ""];
          if (!emp.country || INVALID_COUNTRIES.includes(emp.country.trim().toLowerCase())) {
            throw new HriqError("HRIQ-0814", `${emp.legalFirstName} ${emp.legalLastName} has no valid country set (current: "${emp.country ?? "null"}"). Please update their profile before paying via Cadana.`);
          }

          console.log(`[Cadana Payout] Onboarding ${emp.legalFirstName} ${emp.legalLastName} to Cadana (${emp.country})...`);

          let person;
          try {
            person = await cadana.onboardToCadana({
              firstName: emp.legalFirstName,
              lastName: emp.legalLastName,
              email: emp.personalEmail ?? emp.workEmail ?? "",
              country: emp.country,
              streetAddress: emp.streetAddress ?? undefined,
              city: emp.city ?? undefined,
              state: emp.stateProvince ?? undefined,
              postalCode: emp.postalCode ?? undefined,
              jobTitle: emp.jobTitle ?? undefined,
              department: emp.department ?? undefined,
              hourlyRate: emp.hourlyRate ? Number(emp.hourlyRate) : undefined,
              currency: emp.currency ?? "USD",
            });
          } catch (createErr: any) {
            // If person already exists in Cadana (race condition), look them up
            if (createErr?.message?.includes("already exists") || createErr?.message?.includes("400")) {
              console.log(`[Cadana Payout] Person may already exist, searching by emails...`);
              const found = await cadana.findCadanaPersonByEmails(emails);
              if (found) {
                person = found;
                console.log(`[Cadana Payout] Found existing person: ${found.id}`);
              } else {
                throw createErr;
              }
            } else {
              throw createErr;
            }
          }

          cadanaPersonId = person.id;
          await database.employee.update({
            where: { id: emp.id },
            data: { cadanaPersonId: person.id, cadanaPersonStatus: person.status, cadanaSyncedAt: new Date() },
          });
          console.log(`[Cadana Payout] Onboarded → personId: ${person.id}`);
        }
      }

      // 4.5. Ensure payment method is set on the Cadana person
      // Cadana requires every person to have an explicit payment method before payroll.
      // Default to wallet (virtual wallet) — fall back to bank only if wallet setup fails.
      if (cadanaPersonId) {
        let existingMethod: string | null = null;
        try {
          const existingPaymentInfo = await cadana.getCadanaPaymentInfo(cadanaPersonId);
          existingMethod = existingPaymentInfo?.preferredMethod ?? null;
        } catch {
          // 404 or error means no payment info set yet
        }

        if (existingMethod) {
          // Person already has payment info (wallet, bank, or momo) — don't touch it
          console.log(`[Cadana Payout] Payment method already set: ${existingMethod} — using as-is`);
        } else {
          // No payment method on Cadana — try wallet first, then bank fallback
          console.log(`[Cadana Payout] No payment method on Cadana for ${cadanaPersonId}, setting wallet as preferred...`);
          const walletEmail = emp.personalEmail ?? emp.workEmail ?? "";
          try {
            await cadana.updateCadanaPaymentInfo(cadanaPersonId, {
              preferredMethod: "wallet",
              wallet: {
                type: "cadana",
                identifier: walletEmail,
                currency: emp.currency ?? "USD",
              },
            });
            console.log(`[Cadana Payout] Wallet payment method set for ${cadanaPersonId} (email: ${walletEmail})`);
          } catch (walletErr) {
            console.warn(`[Cadana Payout] Wallet setup failed, trying bank fallback...`, walletErr);
            // Fallback: try bank details if available
            if (emp.bankAccountNumber && emp.bankName) {
              try {
                await cadana.updateCadanaPaymentInfo(cadanaPersonId, {
                  preferredMethod: "bank",
                  bank: {
                    accountName: emp.bankAccountName ?? `${emp.legalFirstName} ${emp.legalLastName}`,
                    accountNumber: emp.bankAccountNumber,
                    bankCode: emp.bankRoutingNumber ?? emp.bankSwiftCode ?? "",
                    bankName: emp.bankName,
                  },
                });
                console.log(`[Cadana Payout] Bank fallback set for ${cadanaPersonId}`);
              } catch (bankErr) {
                console.error(`[Cadana Payout] Both wallet and bank payment setup failed for ${cadanaPersonId}:`, bankErr);
                throw new HriqError("HRIQ-0813", `Could not set payment method for ${emp.legalFirstName} ${emp.legalLastName}. Neither wallet nor bank setup succeeded on Cadana. Bank error: ${bankErr instanceof Error ? bankErr.message : "Unknown"}`);
              }
            } else {
              throw new HriqError("HRIQ-0813", `Could not set wallet payment method for ${emp.legalFirstName} ${emp.legalLastName} on Cadana and no bank details available as fallback.`);
            }
          }
        }
      }

      // 5. Execute the payroll (Create → Save → Approve)
      const amountCents = cadana.toCadanaCents(amount);
      const payrollDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

      if (dryRun) {
        // In dry-run, just validate but don't actually create the payroll
        console.log(`[Cadana Payout] DRY RUN: Would create payroll for ${amountCents} cents to ${cadanaPersonId}`);

        await database.payment.updateMany({
          where: { id: data.paymentId, status: "processing" },
          data: { status: "pending" },
        });

        payoutSuccess = true;

        return {
          success: true,
          dryRun: true,
          cadanaPersonId,
          amount,
          currency: payment.currency ?? "USD",
          status: "dry_run",
        };
      }

      const result = await cadana.executeCadanaPayroll({
        type: "ONE_OFF",
        payrollDate,
        payPeriod: payment.periodStart && payment.periodEnd
          ? {
              fromDate: new Date(payment.periodStart).toISOString().slice(0, 10),
              toDate: new Date(payment.periodEnd).toISOString().slice(0, 10),
            }
          : { fromDate: payrollDate, toDate: payrollDate }, // Cadana requires payPeriod
        entries: [
          {
            personId: cadanaPersonId,
            salary: { amount: amountCents, currency: payment.currency ?? "USD" },
          },
        ],
        autoApprove: true,
      });

      console.log(`[Cadana Payout] Payroll ${result.payroll.payrollId} → ${result.status}`);

      // ⚠️ CRITICAL: Money has now left via Cadana. Set payoutSuccess BEFORE DB writes
      // so a DB failure doesn't revert to "pending" (which would allow double-pay).
      payoutSuccess = true;

      // 7. Update payment record
      const now = new Date();
      await database.payment.updateMany({
        where: { id: data.paymentId, status: "processing" },
        data: {
          status: "completed",
          paymentDate: now,
          paymentMethod: "cadana",
          transactionId: result.payroll.payrollId,
          notes: data.notes ?? null,
          payoutProvider: "cadana",
          payoutReference: result.payroll.payrollId,
          payoutConfirmedAt: now,
          payoutConfirmedBy: session.userId,
          processedByUserId: session.userId,
          processedByName: session.name ?? undefined,
        },
      });

      // 8. Generate invoice & paystub
      try {
        const { generateAndDeliverPaystub } = await import("./paystub");
        await generateAndDeliverPaystub(data.paymentId);
      } catch (e) {
        console.error("[Cadana Payout] Paystub generation failed:", e);
      }

      // 8b. Sync to QuickBooks (RL internal only, non-blocking)
      const isRL = emp.organizationId === (process.env.RL_ORGANIZATION_ID ?? "org_rl_001");
      if (isRL) {
        try {
          const { syncPaymentToQuickBooks } = await import("./quickbooks");
          const qbResult = await syncPaymentToQuickBooks(data.paymentId);
          if (qbResult.success) {
            console.info(`[Cadana Payout] QB synced — Bill: ${qbResult.qbBillId}`);
          } else if (qbResult.error !== "QuickBooks not connected") {
            console.warn(`[Cadana Payout] QB sync failed: ${qbResult.error}`);
          }
        } catch (e) {
          console.error("[Cadana Payout] QB sync error:", e);
        }
      }

      // 9. Audit log
      try {
        await database.auditLog.create({
          data: {
            action: "cadana_payout_completed",
            objectType: "payment",
            objectId: data.paymentId,
            actorType: "user",
            actorUserId: session.userId,
            actorDescription: session.name ?? session.userId,
            newValue: {
              cadanaPayrollId: result.payroll.payrollId,
              cadanaPersonId,
              amount,
              currency: payment.currency,
              status: result.status,
              debit: result.payroll.debit,
              employeeId: emp.id,
              employeeName: `${emp.legalFirstName} ${emp.legalLastName}`,
            },
            organizationId: emp.organization?.id ?? null,
          },
        });
      } catch (e) {
        console.error("[Cadana Payout] Audit log failed:", e);
      }

      revalidatePath("/[orgSlug]/payments", "page");
      revalidatePath("/[orgSlug]/payroll", "page");
      revalidatePath("/[orgSlug]/payments/external", "page");
      revalidatePath("/[orgSlug]/payroll/external", "page");

      return {
        success: true,
        dryRun: false,
        cadanaPayrollId: result.payroll.payrollId,
        cadanaPersonId,
        amount,
        currency: payment.currency ?? "USD",
        debitAmount: cadana.fromCadanaCents(result.payroll.debit.amount),
        debitCurrency: result.payroll.debit.currency,
        status: result.status,
      };
    } catch (err: unknown) {
      if (payoutSuccess) {
        // ⚠️ CRITICAL: Money was sent but post-transfer step failed. Don't revert to pending.
        console.error("[Cadana Payout] POST-TRANSFER FAILURE — money sent but DB/post-processing failed:", err);
        import("@/lib/hriq/sentry").then(({ captureServerException }) =>
          captureServerException(err, { action: "executeCadanaPayout_POST_TRANSFER", paymentId: data.paymentId, extra: { critical: true } })
        ).catch(() => {});
        return { error: "Payment was sent via Cadana but failed to update records. Please contact engineering — do NOT retry this payment." };
      }

      // Pre-transfer failure — safe to revert to pending
      await database.payment.updateMany({
        where: { id: data.paymentId, status: "processing" },
        data: { status: "pending" },
      }).catch((e) => console.error("[background task failed]", e));
      throw err;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[cadana-payouts:executeCadanaPayout]", msg);
    import("@/lib/hriq/sentry").then(({ captureServerException }) => captureServerException(err, { action: "executeCadanaPayout", paymentId: data.paymentId })).catch(() => {});
    return { error: msg };
  }
}
