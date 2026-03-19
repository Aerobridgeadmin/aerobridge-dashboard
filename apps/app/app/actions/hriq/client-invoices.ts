"use server";

import { requireOrg } from "@repo/auth/session";
import { database } from "@repo/database";
import { revalidatePath } from "next/cache";
import { HriqError } from "@/lib/hriq/errors";
import { RL_ORG_ID } from "./constants";

/**
 * Generate a unique invoice number: INV-YYYYMMDD-XXXX
 * Retries with a new random suffix if the first attempt collides.
 */
async function generateUniqueInvoiceNumber(): Promise<string> {
  const d = new Date();
  const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  for (let attempt = 0; attempt < 5; attempt++) {
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    const num = `INV-${date}-${rand}`;
    const exists = await database.clientInvoice.findUnique({ where: { invoiceNumber: num }, select: { id: true } });
    if (!exists) return num;
  }
  // Fallback: use timestamp-based suffix
  return `INV-${date}-${Date.now().toString(36).slice(-6).toUpperCase()}`;
}

/**
 * Generate client invoices from approved timesheets for a given period.
 *
 * Groups all approved timesheets by their contractor's client organization,
 * then creates one ClientInvoice per client org with line items for each contractor.
 *
 * Applies RL service fee from the client's ServiceAgreement if one exists.
 */
export async function generateClientInvoicesForPeriod(periodId: string): Promise<{ created: number; skipped: number; periodName: string; invoices: unknown[] } | { error: string }> {
  try {
    const session = await requireOrg();
    if (session.orgId !== RL_ORG_ID) throw new HriqError("HRIQ-0901", "Only RL admin can generate client invoices");

    const period = await database.timesheetPeriod.findFirst({
      where: { id: periodId },
      include: {
        submissions: {
          where: { status: { in: ["approved", "auto_approved"] } },
          include: {
            employee: {
              select: {
                id: true,
                legalFirstName: true,
                legalLastName: true,
                hourlyRate: true,
                currency: true,
                organizationId: true,
              },
            },
          },
        },
      },
    });

    if (!period) throw new HriqError("HRIQ-0901", "Period not found");

    // Check for existing invoices for this period
    const existingInvoices = await database.clientInvoice.findMany({
      where: {
        periodStart: period.startDate,
        periodEnd: period.endDate,
        // Void invoices do NOT block re-generation (e.g. after timesheet rejection+re-approval)
        status: { not: "void" },
      },
      select: { organizationId: true },
    });
    const alreadyInvoiced = new Set(existingInvoices.map((i: any) => i.organizationId));

    // Group submissions by client org (excluding RL org contractors or unassigned)
    const orgGroups = new Map<string, typeof period.submissions>();
    for (const sub of period.submissions) {
      const orgId = sub.employee.organizationId;
      if (!orgId || orgId === RL_ORG_ID) {
        // RL contractors go under RL org for internal tracking
        const key = RL_ORG_ID;
        if (!orgGroups.has(key)) orgGroups.set(key, []);
        orgGroups.get(key)!.push(sub);
      } else {
        if (!orgGroups.has(orgId)) orgGroups.set(orgId, []);
        orgGroups.get(orgId)!.push(sub);
      }
    }

    // Load service agreements for fee calculation
    const agreements = await database.serviceAgreement.findMany({
      where: {
        organizationId: { in: Array.from(orgGroups.keys()) },
        status: "active",
      },
    });
    const agreementMap = new Map<string, { organizationId: string; feeType: string | null; feeAmount: string | null }>(agreements.map((a: any) => [a.organizationId, a]));

    // Load org profiles to identify PPP orgs (no RL fee for PPP)
    const orgProfiles = await database.organizationProfile.findMany({
      where: { organizationId: { in: Array.from(orgGroups.keys()) } },
      select: { organizationId: true, paymentMethod: true },
    });
    const pppOrgIds = new Set(orgProfiles.filter((p: any) => p.paymentMethod === "ppp").map((p: any) => p.organizationId));

    let created = 0;
    let skipped = 0;
    const invoices: { orgId: string; invoiceNumber: string; total: number; lineItems: number }[] = [];

    for (const [orgId, submissions] of orgGroups) {
      if (alreadyInvoiced.has(orgId)) {
        skipped++;
        continue;
      }

      // Build line items
      const lineItems: {
        employeeId: string;
        description: string;
        hoursWorked: number;
        hourlyRate: number;
        amount: number;
        currency: string;
      }[] = [];

      let subtotal = 0;

      for (const sub of submissions) {
        const hours = Number(sub.totalHours);
        const rate = sub.employee.hourlyRate ? Number(sub.employee.hourlyRate) : 0;
        const bonusAmt = Number((sub as any).bonusTotal ?? 0);
        const amount = Math.round((hours * rate + bonusAmt) * 100) / 100;
        subtotal += amount;

        lineItems.push({
          employeeId: sub.employee.id,
          description: `${sub.employee.legalFirstName} ${sub.employee.legalLastName} — ${hours}h @ $${rate}/hr${bonusAmt > 0 ? ` + $${bonusAmt} bonus` : ""}`,
          hoursWorked: hours,
          hourlyRate: rate,
          amount,
          currency: sub.employee.currency ?? "USD",
        });
      }

      if (lineItems.length === 0) continue;

      // Calculate RL service fee (PPP orgs: no fee — client pays contractors directly via Stripe Connect)
      let rlFeeType: string | null = null;
      let rlFeeAmount: number | null = null;
      let rlFeeTotal = 0;

      if (!pppOrgIds.has(orgId)) {
        const agreement = agreementMap.get(orgId);
        if (agreement) {
          rlFeeType = agreement.feeType;
          rlFeeAmount = Number(agreement.feeAmount);

          switch (agreement.feeType) {
            case "percentage":
              rlFeeTotal = Math.round(subtotal * (rlFeeAmount / 100) * 100) / 100;
              break;
            case "flat":
              rlFeeTotal = rlFeeAmount;
              break;
            case "per_contractor":
              rlFeeTotal = Math.round(rlFeeAmount * lineItems.length * 100) / 100;
              break;
          }
        }
      }

      const totalAmount = Math.round((subtotal + rlFeeTotal) * 100) / 100;
      const invoiceNumber = await generateUniqueInvoiceNumber();

      // Create invoice with line items inside a transaction to prevent duplicates.
      // Re-check for existing invoice inside the transaction (TOCTOU protection).
      const invoice = await database.$transaction(async (tx: any) => {
        const existing = await tx.clientInvoice.findFirst({
          where: {
            organizationId: orgId,
            periodStart: period.startDate,
            periodEnd: period.endDate,
            status: { not: "void" }, // Void invoices don't block re-generation
          },
          select: { id: true },
        });
        if (existing) return null; // Already created by concurrent request

        return tx.clientInvoice.create({
          data: {
            organizationId: orgId,
            invoiceNumber,
            periodStart: period.startDate,
            periodEnd: period.endDate,
            periodName: period.name,
            subtotal,
            rlFeeType,
            rlFeeAmount: rlFeeAmount !== null ? rlFeeAmount : undefined,
            rlFeeTotal,
            totalAmount,
            currency: "USD",
            status: "draft",
            createdByUserId: session.userId,
            createdByName: session.name ?? undefined,
            lineItems: {
              create: lineItems.map((li) => ({
                id: `cli_${Math.random().toString(36).substring(2, 14)}`,
                employeeId: li.employeeId,
                description: li.description,
                hoursWorked: li.hoursWorked,
                hourlyRate: li.hourlyRate,
                amount: li.amount,
                currency: li.currency,
              })),
            },
          },
        });
      });

      if (!invoice) {
        skipped++;
        continue;
      }

      created++;
      invoices.push({ orgId, invoiceNumber, total: totalAmount, lineItems: lineItems.length });

      // Auto-sync to QuickBooks (non-blocking)
      try {
        const { syncClientInvoiceToQuickBooks } = await import("./quickbooks");
        syncClientInvoiceToQuickBooks(invoice.id).catch((err) =>
          console.error("[Client Invoices] QB sync failed for", invoice.id, err)
        );
      } catch (err) { console.warn("[client-invoices:generateClientInvoicesForPeriod] Suppressed error:", err); }
    }

    revalidatePath("/[orgSlug]/payments", "page");
    revalidatePath("/[orgSlug]/payroll", "page");

    return { created, skipped, periodName: period.name, invoices };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[client-invoices.ts:generateClientInvoicesForPeriod]", _msg);
    return { error: _msg };
  }
}

/**
 * Update client invoice status.
 */
export async function updateClientInvoiceStatus(
  invoiceId: string,
  status: "draft" | "sent" | "paid" | "void",
  paymentDetails?: { paymentMethod?: string; paymentReference?: string }
) {
  const session = await requireOrg();
  if (session.orgId !== RL_ORG_ID) throw new HriqError("HRIQ-0901", "Only RL admin can update invoices");

  // Build the set of statuses that are valid predecessors for the target status
  const VALID_FROM: Record<string, string[]> = {
    sent: ["draft"],
    paid: ["draft", "sent"],
    void: ["draft", "sent"],
  };
  const validFromStatuses = VALID_FROM[status];
  if (!validFromStatuses) {
    throw new HriqError("HRIQ-0803", `Invalid target status: "${status}"`);
  }

  const data: any = { status };
  if (status === "paid") {
    data.paidAt = new Date();
    if (paymentDetails?.paymentMethod) data.paymentMethod = paymentDetails.paymentMethod;
    if (paymentDetails?.paymentReference) data.paymentReference = paymentDetails.paymentReference;
  }
  if (status === "void") {
    data.paymentLink = null; // Clear payment link so expired link can't be used
  }

  // Atomic status transition — only succeeds if invoice is in a valid predecessor status
  const result = await database.clientInvoice.updateMany({
    where: { id: invoiceId, status: { in: validFromStatuses } },
    data,
  });
  if (result.count === 0) {
    // Check if invoice exists to give a better error message
    const invoice = await database.clientInvoice.findUnique({ where: { id: invoiceId }, select: { status: true } });
    if (!invoice) throw new HriqError("HRIQ-0801", "Invoice not found");
    throw new HriqError("HRIQ-0803", `Cannot change invoice from "${invoice.status}" to "${status}"`);
  }

  // Re-fetch for downstream logic (Wise payout trigger)
  const invoice = await database.clientInvoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) throw new HriqError("HRIQ-0801", "Invoice not found after update");

  // When invoice is paid, check if org uses cor/Wise and trigger contractor payouts
  if (status === "paid") {
    try {
      const orgProfile = await database.organizationProfile.findUnique({
        where: { organizationId: invoice.organizationId },
        select: { paymentMethod: true },
      });
      const pm = orgProfile?.paymentMethod;
      if (pm === "cor" || pm === "both") {
        const { triggerWisePayoutsForPaidInvoice } = await import("./quickbooks");
        const result = await triggerWisePayoutsForPaidInvoice(invoiceId);
        console.info(`[Client Invoices] Wise payouts triggered for invoice ${invoiceId}: ${result.triggered} sent, ${result.failed} failed`);
      }
    } catch (err) {
      console.error("[Client Invoices] Failed to trigger Wise payouts for paid invoice:", err);
      // Don't fail the status update — payouts can be retried manually
    }
  }

  revalidatePath("/[orgSlug]/payments", "page");
  revalidatePath("/[orgSlug]/payroll", "page");
  revalidatePath("/[orgSlug]/payments/external", "page");
  revalidatePath("/[orgSlug]/payroll/external", "page");
  return { success: true };
}

/**
 * Scan all periods that have pending payments but no client invoices, and generate them.
 * Used as a manual "catch-up" when invoices weren't auto-generated.
 */
export async function generateMissingClientInvoices(): Promise<{ created: number; message: string } | { error: string }> {
  try {
    const session = await requireOrg();
    if (session.orgId !== RL_ORG_ID) throw new HriqError("HRIQ-0901", "Only RL admin can generate client invoices");

    // Find all distinct periods that have pending payments
    const pendingPayments = await database.payment.findMany({
      where: { status: "pending" },
      select: { periodStart: true, periodEnd: true, employeeId: true },
    });

    if (pendingPayments.length === 0) return { created: 0, message: "No pending payments found" };

    // Get unique period date ranges
    const periodKeys = new Set<string>();
    const periodDates: { start: Date; end: Date }[] = [];
    for (const p of pendingPayments) {
      if (!p.periodStart || !p.periodEnd) continue;
      const key = `${p.periodStart.toISOString()}|${p.periodEnd.toISOString()}`;
      if (!periodKeys.has(key)) {
        periodKeys.add(key);
        periodDates.push({ start: p.periodStart, end: p.periodEnd });
      }
    }

    // Find matching timesheet periods (from any org)
    let totalCreated = 0;
    for (const { start, end } of periodDates) {
      const periods = await database.timesheetPeriod.findMany({
        where: { startDate: start, endDate: end },
        select: { id: true },
      });
      for (const period of periods) {
        try {
          const innerResult = await generateClientInvoicesForPeriod(period.id);
          if (!("error" in innerResult)) totalCreated += innerResult.created;
        } catch (err) {
          console.error("[Client Invoices] Failed for period", period.id, err);
        }
      }
    }

    revalidatePath("/[orgSlug]/payments", "page");
    revalidatePath("/[orgSlug]/payroll", "page");
    revalidatePath("/[orgSlug]/payments/external", "page");
    revalidatePath("/[orgSlug]/payroll/external", "page");
    return { created: totalCreated, message: `Generated ${totalCreated} invoice(s)` };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[client-invoices.ts:generateMissingClientInvoices]", _msg);
    return { error: _msg };
  }
}

// ─── Indirect Pay: Auto-Generate Invoice + Email Client ─────────────────────────

/**
 * For cor orgs: generate (or update) the client invoice for an org+period
 * with all currently-approved timesheets, sync to QB, get a payment link, and
 * email the client.
 *
 * Safe to call multiple times — idempotent. If the invoice is already paid/void,
 * it returns early. If it's draft/sent, it refreshes the line items and resends.
 *
 * Called non-blocking from timesheets.ts on approval.
 */
export async function generateAndSendClientInvoiceForOrg(
  orgId: string,
  periodId: string,
): Promise<{ invoiceId: string; emailSent: boolean; paymentLink: string | null }> {
  // 1. Load period
  const period = await database.timesheetPeriod.findFirst({
    where: { id: periodId },
  });
  if (!period) throw new HriqError("HRIQ-0901", "Period not found");

  // 2. All currently-approved submissions for this org+period
  const submissions = await database.timesheetSubmission.findMany({
    where: {
      periodId,
      status: { in: ["approved", "auto_approved"] },
      employee: { organizationId: orgId },
    },
    include: {
      employee: {
        select: {
          id: true,
          legalFirstName: true,
          legalLastName: true,
          hourlyRate: true,
          currency: true,
        },
      },
    },
  });

  if (submissions.length === 0) {
    return { invoiceId: "", emailSent: false, paymentLink: null };
  }

  // 3. Build line items
  const lineItems = submissions.map((sub) => {
    const hours = Number(sub.totalHours);
    const rate = sub.employee.hourlyRate ? Number(sub.employee.hourlyRate) : 0;
    const bonusAmt = Number((sub as any).bonusTotal ?? 0);
    const amount = Math.round((hours * rate + bonusAmt) * 100) / 100;
    return {
      employeeId: sub.employee.id,
      employeeName: `${sub.employee.legalFirstName} ${sub.employee.legalLastName}`,
      description: `${sub.employee.legalFirstName} ${sub.employee.legalLastName} — ${hours}h @ $${rate}/hr${bonusAmt > 0 ? ` + $${bonusAmt} bonus` : ""}`,
      hoursWorked: hours,
      hourlyRate: rate,
      amount,
      currency: sub.employee.currency ?? "USD",
      bonusAmount: bonusAmt,
    };
  });

  const subtotal = lineItems.reduce((sum, li) => sum + li.amount, 0);

  // 4. RL service fee from active service agreement
  const agreement = await database.serviceAgreement.findFirst({
    where: { organizationId: orgId, status: "active" },
    orderBy: { createdAt: "desc" },
    select: { feeType: true, feeAmount: true },
  });

  let rlFeeType: string | null = null;
  let rlFeeAmount: number | null = null;
  let rlFeeTotal = 0;

  if (agreement) {
    rlFeeType = agreement.feeType;
    rlFeeAmount = Number(agreement.feeAmount);
    switch (agreement.feeType) {
      case "percentage":
        rlFeeTotal = Math.round(subtotal * (rlFeeAmount / 100) * 100) / 100;
        break;
      case "flat":
        rlFeeTotal = rlFeeAmount;
        break;
      case "per_contractor":
        rlFeeTotal = Math.round(rlFeeAmount * lineItems.length * 100) / 100;
        break;
    }
  }

  const totalAmount = Math.round((subtotal + rlFeeTotal) * 100) / 100;

  // 5. Load org billing contact
  const org = await database.organization.findUnique({
    where: { id: orgId },
    include: {
      profile: { select: { billingEmail: true, adminEmail: true, adminName: true } },
    },
  });
  if (!org) throw new HriqError("HRIQ-0901", "Organization not found");

  const billingEmail = org.profile?.billingEmail ?? org.profile?.adminEmail ?? null;
  const billingName = org.profile?.adminName ?? org.name;

  // 6. Upsert the client invoice
  // Prefer non-void invoice; fall back to void so we know to create a fresh one
  const existingInvoice = await database.clientInvoice.findFirst({
    where: { organizationId: orgId, periodStart: period.startDate, periodEnd: period.endDate },
    select: {
      id: true,
      status: true,
      paymentLink: true,
      qbInvoiceId: true,
      invoiceNumber: true,
    },
    orderBy: { createdAt: "desc" }, // Latest first — if non-void exists, it comes first
  });

  let invoiceId: string;
  let existingPaymentLink: string | null = null;
  let existingQbId: string | null = null;

  if (existingInvoice) {
    // Already paid — don't touch it; voided invoices can be superseded
    if (existingInvoice.status === "paid") {
      return {
        invoiceId: existingInvoice.id,
        emailSent: false,
        paymentLink: existingInvoice.paymentLink ?? null,
      };
    }

    // Voided invoice: create a fresh one (don't re-activate the void record)
    if (existingInvoice.status === "void") {
      const invoiceNumber = await generateUniqueInvoiceNumber();
      const newInvoice = await database.clientInvoice.create({
        data: {
          organizationId: orgId,
          invoiceNumber,
          periodStart: period.startDate,
          periodEnd: period.endDate,
          periodName: period.name,
          subtotal,
          rlFeeType,
          rlFeeAmount: rlFeeAmount !== null ? rlFeeAmount : undefined,
          rlFeeTotal,
          totalAmount,
          currency: "USD",
          status: "draft",
          lineItems: {
            create: lineItems.map((li) => ({
              id: `cli_${Math.random().toString(36).substring(2, 14)}`,
              employeeId: li.employeeId,
              description: li.description,
              hoursWorked: li.hoursWorked,
              hourlyRate: li.hourlyRate,
              amount: li.amount,
              currency: li.currency,
            })),
          },
        },
        select: { id: true },
      });
      invoiceId = newInvoice.id;
    } else {

    existingPaymentLink = existingInvoice.paymentLink ?? null;
    existingQbId = existingInvoice.qbInvoiceId ?? null;

    // Refresh line items and totals
    await database.$transaction(async (tx: any) => {
      await tx.clientInvoiceLineItem.deleteMany({ where: { clientInvoiceId: existingInvoice.id } });
      await tx.clientInvoice.update({
        where: { id: existingInvoice.id },
        data: {
          subtotal,
          rlFeeType: rlFeeType ?? undefined,
          rlFeeAmount: rlFeeAmount !== null ? rlFeeAmount : undefined,
          rlFeeTotal,
          totalAmount,
          lineItems: {
            create: lineItems.map((li) => ({
              id: `cli_${Math.random().toString(36).substring(2, 14)}`,
              employeeId: li.employeeId,
              description: li.description,
              hoursWorked: li.hoursWorked,
              hourlyRate: li.hourlyRate,
              amount: li.amount,
              currency: li.currency,
            })),
          },
        },
      });
    });

    invoiceId = existingInvoice.id;
    } // end else (not void)
  } else {
    const invoiceNumber = await generateUniqueInvoiceNumber();
    const newInvoice = await database.clientInvoice.create({
      data: {
        organizationId: orgId,
        invoiceNumber,
        periodStart: period.startDate,
        periodEnd: period.endDate,
        periodName: period.name,
        subtotal,
        rlFeeType,
        rlFeeAmount: rlFeeAmount !== null ? rlFeeAmount : undefined,
        rlFeeTotal,
        totalAmount,
        currency: "USD",
        status: "draft",
        lineItems: {
          create: lineItems.map((li) => ({
            id: `cli_${Math.random().toString(36).substring(2, 14)}`,
            employeeId: li.employeeId,
            description: li.description,
            hoursWorked: li.hoursWorked,
            hourlyRate: li.hourlyRate,
            amount: li.amount,
            currency: li.currency,
          })),
        },
      },
      select: { id: true },
    });
    invoiceId = newInvoice.id;
  }

  // 7. Sync to QB (always re-sync to pick up refreshed line items)
  let paymentLink: string | null = existingPaymentLink;

  try {
    const { syncClientInvoiceToQuickBooks, getQBAccessToken } = await import("./quickbooks");

    // Force re-sync if we already have a QB ID by passing the invoiceId —
    // syncClientInvoiceToQuickBooks skips if qbInvoiceId exists, so clear it first
    // for updates so QB sees the latest totals.
    if (existingQbId) {
      // Update QB invoice in place (void + recreate is complex; simpler is to let it stand
      // and just re-fetch the payment link)
      const accessToken = await getQBAccessToken();
      if (accessToken) {
        const qb = await import("@repo/integrations/quickbooks");
        const freshLink = await qb.getInvoicePaymentLink(existingQbId, accessToken);
        if (freshLink) paymentLink = freshLink;
      }
    } else {
      const qbResult = await syncClientInvoiceToQuickBooks(invoiceId);
      if (qbResult.success && qbResult.qbInvoiceId) {
        const accessToken = await getQBAccessToken();
        if (accessToken) {
          const qb = await import("@repo/integrations/quickbooks");
          const freshLink = await qb.getInvoicePaymentLink(qbResult.qbInvoiceId, accessToken);
          if (freshLink) paymentLink = freshLink;
        }
      }
    }

    if (paymentLink) {
      await database.clientInvoice.update({
        where: { id: invoiceId },
        data: { paymentLink, status: "sent" },
      });
    }
  } catch (qbErr) {
    console.error("[Indirect Pay] QB sync failed for invoice", invoiceId, qbErr);
  }

  // 8. Email the client
  let emailSent = false;
  if (billingEmail) {
    try {
      const { sendViaGmailSystem } = await import("./send-email");
      const templates = await import("./email-templates");

      const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // Net 7
      const invoiceRecord = await database.clientInvoice.findUnique({
        where: { id: invoiceId },
        select: { invoiceNumber: true },
      });

      const html = templates.layout(
        templates.clientInvoicePaymentRequestEmail({
          clientName: billingName,
          invoiceNumber: invoiceRecord?.invoiceNumber ?? invoiceId,
          periodName: period.name,
          periodStart: period.startDate,
          periodEnd: period.endDate,
          lineItems,
          subtotal,
          rlFeeTotal,
          totalAmount,
          currency: "USD",
          paymentLink: paymentLink ?? undefined,
          dueDate,
        }),
        "This is an automated invoice from Remote Leverage.",
      );

      const fmtMoney = (n: number) =>
        `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      try {
        await sendViaGmailSystem(
          billingEmail,
          `Invoice ${invoiceRecord?.invoiceNumber} — ${period.name} — ${fmtMoney(totalAmount)} Due`,
          html,
        );
      } catch (emailErr) {
        console.error("[HRIQ] Email send failed (non-blocking):", emailErr);
      }

      emailSent = true;
      await database.clientInvoice.update({
        where: { id: invoiceId },
        data: { status: "sent" },
      }).catch(() => {});
    } catch (emailErr) {
      console.error("[Indirect Pay] Client invoice email failed for", invoiceId, emailErr);
    }
  }

  revalidatePath("/[orgSlug]/payments", "page");
  revalidatePath("/[orgSlug]/payroll", "page");

  return { invoiceId, emailSent, paymentLink };
}

/**
 * Manually sync a draft client invoice to QuickBooks and email the payment link.
 * Used by the RL admin dashboard "Sync QB Invoice & Send" button for COR orgs.
 */
export async function syncInvoiceToQBAndSendEmail(
  invoiceId: string,
): Promise<{ invoiceId: string; emailSent: boolean; paymentLink: string | null } | { error: string }> {
  try {
    const session = await requireOrg();
    if (session.orgId !== RL_ORG_ID) throw new HriqError("HRIQ-0901", "Only RL admin can sync client invoices");

    const invoice = await database.clientInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        organization: {
          include: {
            profile: { select: { billingEmail: true, adminEmail: true, adminName: true } },
          },
        },
        lineItems: {
          include: {
            employee: { select: { legalFirstName: true, legalLastName: true, hourlyRate: true, currency: true } },
          },
        },
      },
    });
    if (!invoice) return { error: "Invoice not found" };
    if (invoice.status === "paid") return { error: "Invoice is already paid" };
    if (invoice.status === "void") return { error: "Cannot sync a voided invoice" };

    let paymentLink: string | null = invoice.paymentLink ?? null;

    // Sync to QB (creates or updates the QB invoice)
    try {
      const { syncClientInvoiceToQuickBooks, getQBAccessToken } = await import("./quickbooks");

      if (invoice.qbInvoiceId) {
        // Already in QB — just refresh the payment link
        const accessToken = await getQBAccessToken();
        if (accessToken) {
          const qb = await import("@repo/integrations/quickbooks");
          const freshLink = await qb.getInvoicePaymentLink(invoice.qbInvoiceId, accessToken);
          if (freshLink) paymentLink = freshLink;
        }
      } else {
        const qbResult = await syncClientInvoiceToQuickBooks(invoiceId);
        if (qbResult.success && qbResult.qbInvoiceId) {
          const accessToken = await getQBAccessToken();
          if (accessToken) {
            const qb = await import("@repo/integrations/quickbooks");
            const freshLink = await qb.getInvoicePaymentLink(qbResult.qbInvoiceId, accessToken);
            if (freshLink) paymentLink = freshLink;
          }
        }
      }
    } catch (qbErr) {
      console.error("[syncInvoiceToQBAndSendEmail] QB sync failed:", qbErr);
    }

    // Persist the payment link and mark as sent
    if (paymentLink) {
      await database.clientInvoice.update({
        where: { id: invoiceId },
        data: { paymentLink, status: "sent" },
      });
    }

    // Email the billing contact
    let emailSent = false;
    const billingEmail = invoice.organization.profile?.billingEmail ?? invoice.organization.profile?.adminEmail ?? null;
    const billingName = invoice.organization.profile?.adminName ?? invoice.organization.name;

    if (billingEmail) {
      try {
        const { sendViaGmailSystem } = await import("./send-email");
        const templates = await import("./email-templates");

        const lineItemsForEmail = invoice.lineItems.map((li) => {
          const hours = Number((li as any).hoursWorked ?? 0);
          const rate = li.employee.hourlyRate ? Number(li.employee.hourlyRate) : 0;
          return {
            employeeId: li.employeeId,
            employeeName: `${li.employee.legalFirstName} ${li.employee.legalLastName}`,
            description: li.description ?? `${li.employee.legalFirstName} ${li.employee.legalLastName} — ${hours}h`,
            hoursWorked: hours,
            hourlyRate: rate,
            amount: Number(li.amount),
            currency: li.employee.currency ?? "USD",
            bonusAmount: 0,
          };
        });

        const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const html = templates.layout(
          templates.clientInvoicePaymentRequestEmail({
            clientName: billingName,
            invoiceNumber: invoice.invoiceNumber,
            periodName: invoice.periodName ?? "",
            periodStart: invoice.periodStart,
            periodEnd: invoice.periodEnd,
            lineItems: lineItemsForEmail,
            subtotal: Number(invoice.subtotal),
            rlFeeTotal: Number(invoice.rlFeeTotal),
            totalAmount: Number(invoice.totalAmount),
            currency: "USD",
            paymentLink: paymentLink ?? undefined,
            dueDate,
          }),
          "This is an automated invoice from Remote Leverage.",
        );

        try {
          await sendViaGmailSystem(
            billingEmail,
            `Invoice ${invoice.invoiceNumber} — ${invoice.periodName ?? "Payment Due"}`,
            html,
          );
        } catch (emailErr) {
          console.error("[HRIQ] Email send failed (non-blocking):", emailErr);
        }
        emailSent = true;
      } catch (emailErr) {
        console.error("[syncInvoiceToQBAndSendEmail] Email failed:", emailErr);
      }
    }

    revalidatePath("/[orgSlug]/payments", "page");
    revalidatePath("/[orgSlug]/payroll", "page");
    revalidatePath("/[orgSlug]/payments/external", "page");
    revalidatePath("/[orgSlug]/payroll/external", "page");

    return { invoiceId, emailSent, paymentLink };
  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[client-invoices.ts:syncInvoiceToQBAndSendEmail]", _msg);
    return { error: _msg };
  }
}

/**
 * Generate a ClientInvoice for an org+period WITHOUT syncing to QB or sending email.
 * Returns the invoiceId, or null if no approved submissions exist or invoice is already paid.
 */
export async function generateClientInvoiceForOrg(orgId: string, periodId: string): Promise<string | null> {
  try {
  const period = await database.timesheetPeriod.findFirst({ where: { id: periodId } });
  if (!period) return null;

  const submissions = await database.timesheetSubmission.findMany({
    where: {
      periodId,
      status: { in: ["approved", "auto_approved"] },
      employee: { organizationId: orgId },
    },
    include: {
      employee: { select: { id: true, legalFirstName: true, legalLastName: true, hourlyRate: true, currency: true } },
    },
  });

  if (submissions.length === 0) return null;

  const lineItems = submissions.map((sub: any) => {
    const hours = Number(sub.totalHours);
    const rate = sub.employee.hourlyRate ? Number(sub.employee.hourlyRate) : 0;
    const bonusAmt = Number(sub.bonusTotal ?? 0);
    const amount = Math.round((hours * rate + bonusAmt) * 100) / 100;
    return {
      employeeId: sub.employee.id,
      description: `${sub.employee.legalFirstName} ${sub.employee.legalLastName} — ${hours}h @ $${rate}/hr${bonusAmt > 0 ? ` + $${bonusAmt} bonus` : ""}`,
      hoursWorked: hours,
      hourlyRate: rate,
      amount,
      currency: sub.employee.currency ?? "USD",
    };
  });

  const subtotal = lineItems.reduce((sum: number, li: any) => sum + li.amount, 0);

  // PPP orgs: no RL management fee — client pays contractors directly via Stripe Connect
  const orgProfile = await database.organizationProfile.findUnique({
    where: { organizationId: orgId },
    select: { paymentMethod: true },
  });
  const isPPP = orgProfile?.paymentMethod === "ppp";

  let rlFeeType: string | null = null;
  let rlFeeAmount: number | null = null;
  let rlFeeTotal = 0;

  if (!isPPP) {
    const agreement = await database.serviceAgreement.findFirst({
      where: { organizationId: orgId, status: "active" },
      orderBy: { createdAt: "desc" },
      select: { feeType: true, feeAmount: true },
    });

    if (agreement) {
      rlFeeType = agreement.feeType;
      rlFeeAmount = Number(agreement.feeAmount);
      switch (agreement.feeType) {
        case "percentage": rlFeeTotal = Math.round(subtotal * (rlFeeAmount / 100) * 100) / 100; break;
        case "flat": rlFeeTotal = rlFeeAmount; break;
        case "per_contractor": rlFeeTotal = Math.round(rlFeeAmount * lineItems.length * 100) / 100; break;
      }
    }
  }

  const totalAmount = Math.round((subtotal + rlFeeTotal) * 100) / 100;

  // Check for existing invoice
  const existing = await database.clientInvoice.findFirst({
    where: { organizationId: orgId, periodStart: period.startDate, periodEnd: period.endDate },
    select: { id: true, status: true },
    orderBy: { createdAt: "desc" },
  });

  if (existing?.status === "paid") return null; // Already paid

  if (existing && existing.status !== "void") {
    // Update existing
    await database.$transaction(async (tx: any) => {
      await tx.clientInvoiceLineItem.deleteMany({ where: { clientInvoiceId: existing.id } });
      await tx.clientInvoice.update({
        where: { id: existing.id },
        data: {
          subtotal, rlFeeType: rlFeeType ?? undefined, rlFeeAmount: rlFeeAmount !== null ? rlFeeAmount : undefined,
          rlFeeTotal, totalAmount,
          lineItems: {
            create: lineItems.map((li: any) => ({
              id: `cli_${Math.random().toString(36).substring(2, 14)}`,
              employeeId: li.employeeId, description: li.description,
              hoursWorked: li.hoursWorked, hourlyRate: li.hourlyRate,
              amount: li.amount, currency: li.currency,
            })),
          },
        },
      });
    });
    return existing.id;
  }

  // Create new
  const invoiceNumber = await generateUniqueInvoiceNumber();
  const newInvoice = await database.clientInvoice.create({
    data: {
      organizationId: orgId, invoiceNumber,
      periodStart: period.startDate, periodEnd: period.endDate, periodName: period.name,
      subtotal, rlFeeType, rlFeeAmount: rlFeeAmount !== null ? rlFeeAmount : undefined,
      rlFeeTotal, totalAmount, currency: "USD", status: "draft",
      lineItems: {
        create: lineItems.map((li: any) => ({
          id: `cli_${Math.random().toString(36).substring(2, 14)}`,
          employeeId: li.employeeId, description: li.description,
          hoursWorked: li.hoursWorked, hourlyRate: li.hourlyRate,
          amount: li.amount, currency: li.currency,
        })),
      },
    },
    select: { id: true },
  });

  return newInvoice.id;
  } catch (err) {
    console.error("[client-invoices.ts:generateClientInvoiceForOrg]", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Email the client admin with a Stripe Checkout payment link for a ClientInvoice.
 */
export async function emailClientInvoiceStripeLink(invoiceId: string, stripeUrl: string): Promise<boolean> {
  try {
  const invoice = await database.clientInvoice.findUnique({
    where: { id: invoiceId },
    include: {
      organization: { include: { profile: { select: { billingEmail: true, adminEmail: true, adminName: true } } } },
      lineItems: { include: { employee: { select: { legalFirstName: true, legalLastName: true } } } },
    },
  });

  if (!invoice) return false;

  const billingEmail = invoice.organization.profile?.billingEmail ?? invoice.organization.profile?.adminEmail;
  if (!billingEmail) return false;

  const orgName = invoice.organization.name;
  const billingName = invoice.organization.profile?.adminName ?? orgName;

  const { sendViaGmailSystem } = await import("./send-email");
  const templates = await import("./email-templates");

  const contractorLines = invoice.lineItems.map((li: any) =>
    `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee">${li.employee.legalFirstName} ${li.employee.legalLastName}</td>` +
    `<td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right">$${Number(li.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}</td></tr>`
  ).join("");

  const rlFeeRow = Number(invoice.rlFeeTotal) > 0
    ? `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee">Management Fee${invoice.rlFeeType === "percentage" ? ` (${Number(invoice.rlFeeAmount)}%)` : ""}</td><td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right">$${Number(invoice.rlFeeTotal).toLocaleString("en-US", { minimumFractionDigits: 2 })}</td></tr>`
    : "";

  const body =
    templates.heading(`Invoice ${invoice.invoiceNumber}`) +
    templates.greeting(billingName) +
    templates.paragraph(`A new contractor invoice is ready for payment for <strong>${orgName}</strong>.`) +
    `<table style="width:100%;border-collapse:collapse;margin:16px 0"><thead><tr><th style="padding:8px 12px;text-align:left;border-bottom:2px solid #ddd">Contractor</th><th style="padding:8px 12px;text-align:right;border-bottom:2px solid #ddd">Amount</th></tr></thead><tbody>${contractorLines}${rlFeeRow}<tr style="font-weight:bold"><td style="padding:8px 12px">Total</td><td style="padding:8px 12px;text-align:right">$${Number(invoice.totalAmount).toLocaleString("en-US", { minimumFractionDigits: 2 })}</td></tr></tbody></table>` +
    templates.paragraph(`Period: <strong>${invoice.periodName ?? ""}</strong>`) +
    templates.primaryButton("Pay Now via Stripe", stripeUrl) +
    templates.paragraph("<small>This link expires in 30 minutes. If it expires, a new link can be generated from your dashboard.</small>");

  try {
    await sendViaGmailSystem(
      billingEmail,
      `Invoice ${invoice.invoiceNumber} — $${Number(invoice.totalAmount).toLocaleString("en-US", { minimumFractionDigits: 2 })} — ${orgName}`,
      templates.layout(body, "This is an automated invoice from Remote Leverage."),
    );
  } catch (emailErr) {
    console.error("[HRIQ] Email send failed (non-blocking):", emailErr);
  }

  await database.clientInvoice.update({
    where: { id: invoiceId },
    data: { status: "sent" },
  });

  return true;
  } catch (err) {
    console.error("[client-invoices.ts:emailClientInvoiceStripeLink]", err instanceof Error ? err.message : err);
    return false;
  }
}
