"use server";

import { database } from "@repo/database";
import { requireRole } from "@repo/auth/session";
import { revalidatePath } from "next/cache";
import { HriqError } from "@/lib/hriq/errors";
import { RL_ORG_ID } from "./constants";
import { randomUUID } from "crypto";

// ─── Wise Balance & Status ──────────────────────────────────────────────────────

/** Get Wise business account status — balance, recent transfers */

// ─── Exchange Rate Preview ──────────────────────────────────────────────────────

/** Get live exchange rates for contractor countries */

// ─── Payout Preview (Quote without executing) ───────────────────────────────────

/** Preview a Wise payout — shows fees, rate, estimated delivery */
export async function previewWisePayout(paymentId: string, overrideCurrency?: string) {
  try {
    await requireRole("super_admin");

    const wise = await import("@repo/integrations/wise");

    const payment = await database.payment.findUnique({
      where: { id: paymentId },
      include: {
        employee: {
          select: {
            id: true,
            legalFirstName: true,
            legalLastName: true,
            currency: true,
            country: true,
            wiseRecipientId: true,
            wiseRecipientCurrency: true,
            bankAccountNumber: true,
            bankRoutingNumber: true,
            wiseTag: true,
          },
        },
      },
    });

    if (!payment) throw new HriqError("HRIQ-0801", "Payment not found");
    if (payment.status === "completed") throw new HriqError("HRIQ-0802", "Payment already completed");

    const amount = Number(payment.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new HriqError("HRIQ-0804", `Invalid payment amount: ${payment.amount}`);
    }
    const targetCurrency = overrideCurrency ?? payment.employee.wiseRecipientCurrency ?? payment.employee.currency ?? "USD";

    // -1 is a placeholder (bank details saved locally, no real Wise recipient created yet)
    const hasRealRecipient = payment.employee.wiseRecipientId !== null && payment.employee.wiseRecipientId !== -1;
    const hasBankDetails = !!payment.employee.bankAccountNumber && !!payment.employee.bankRoutingNumber;
    const hasWiseTag = !!payment.employee.wiseTag;

    // If no recipient, no bank details, AND no Wise tag — return not ready
    if (payment.employee.wiseRecipientId === null && !hasBankDetails && !hasWiseTag) {
      return {
        paymentId: payment.id,
        contractorName: `${payment.employee.legalFirstName} ${payment.employee.legalLastName}`,
        sourceAmount: amount,
        sourceCurrency: "USD",
        targetAmount: null,
        targetCurrency,
        exchangeRate: null,
        fee: null,
        feeCurrency: null,
        estimatedDelivery: null,
        hasWiseRecipient: false,
        dryRun: process.env.WISE_DRY_RUN === "true",
      };
    }

    const preview = await wise.getPayoutPreview({
      sourceCurrency: "USD",
      targetCurrency,
      sourceAmount: amount,
      // Pass real recipient ID if available; omit for -1 placeholder (quote still works)
      ...(hasRealRecipient ? { recipientId: payment.employee.wiseRecipientId! } : {}),
    });

    return {
      paymentId: payment.id,
      contractorName: `${payment.employee.legalFirstName} ${payment.employee.legalLastName}`,
      sourceAmount: preview.sourceAmount,
      sourceCurrency: "USD",
      targetAmount: preview.targetAmount,
      targetCurrency,
      exchangeRate: preview.rate,
      fee: preview.fee,
      feeCurrency: preview.feeCurrency,
      estimatedDelivery: preview.estimatedDelivery,
      hasWiseRecipient: true,
      dryRun: process.env.WISE_DRY_RUN === "true",
    };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[wise-payouts.ts:previewWisePayout]", _msg);
    return { error: _msg };
  }
}

// ─── Recipient Management ───────────────────────────────────────────────────────

/** Set up a Wise recipient for a contractor based on their bank details */
export async function setupWiseRecipient(employeeId: string, overrides?: {
  currency?: string;
  type?: string;
  details?: Record<string, unknown>;
  address?: Record<string, unknown>;
}) {
  await requireRole("super_admin");

  const wise = await import("@repo/integrations/wise");

  const employee = await database.employee.findUnique({
    where: { id: employeeId },
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
      bankSwiftCode: true,
      bankRoutingNumber: true,
      bankAddress: true,
      bankExtraData: true,
      streetAddress: true,
      city: true,
      stateProvince: true,
      postalCode: true,
      wiseRecipientId: true,
      wiseRecipientCurrency: true,
      wiseTag: true,
    },
  });

  if (!employee) throw new HriqError("HRIQ-0201", "Employee not found");

  // Use bankAccountName only if it looks like an actual person name.
  // Reject: all-digit strings, IBAN patterns (XX1234...), very short (<5 chars),
  // or strings that are mostly digits (>60% numeric).
  const legalFallback = `${employee.legalFirstName} ${employee.legalLastName}`;
  const rawBankName = employee.bankAccountName?.trim();
  const looksLikeName = rawBankName
    && rawBankName.length >= 5
    && !/^\d+$/.test(rawBankName)
    && !/^[A-Z]{2}\d/.test(rawBankName)
    && (rawBankName.replace(/[^0-9]/g, "").length / rawBankName.length) < 0.6;
  const fullName = looksLikeName ? rawBankName : legalFallback;
  const email = employee.personalEmail ?? employee.workEmail ?? "";

  // Wise tag — create email recipient (no bank details needed)
  if (employee.wiseTag && !overrides?.details) {
    console.log(`[Wise] Creating email recipient for ${fullName} via Wise tag: ${employee.wiseTag}`);
    const recipient = await wise.createWiseEmailRecipient({
      accountHolderName: fullName,
      email: employee.wiseTag,
      currency: employee.wiseRecipientCurrency ?? employee.currency ?? "USD",
    });

    await database.employee.update({
      where: { id: employeeId },
      data: {
        wiseRecipientId: recipient.id,
        wiseRecipientCurrency: recipient.currency,
        wiseRecipientType: "email",
        wiseRecipientSyncedAt: new Date(),
      },
    });

    revalidatePath("/[orgSlug]/people", "page");
    return recipient;
  }

  // If overrides are provided, use them directly (for custom/complex setups)
  if (overrides?.details) {
    const recipient = await wise.createRecipient({
      currency: overrides.currency ?? employee.currency ?? "USD",
      type: overrides.type ?? "aba",
      accountHolderName: fullName,
      details: overrides.details,
      address: overrides.address,
    });

    await database.employee.update({
      where: { id: employeeId },
      data: {
        wiseRecipientId: recipient.id,
        wiseRecipientCurrency: recipient.currency,
        wiseRecipientType: recipient.type,
        wiseRecipientSyncedAt: new Date(),
      },
    });

    revalidatePath("/[orgSlug]/people", "page");
    return recipient;
  }

  // Auto-detect recipient type based on country/currency
  const country = employee.country?.toUpperCase();
  const extra = (employee.bankExtraData ?? {}) as {
    accountType?: string;
    rut?: string;
    idType?: string;
    idNumber?: string;
    phoneNumber?: string;
    bankCode?: string;
  };
  let recipient;

  // Bank name → Wise bank code mapping for countries that need it
  const CHILE_BANK_CODES: Record<string, string> = {
    "Banco de Chile": "001", "BancoEstado": "012", "Banco Estado": "012",
    "Banco Santander Chile": "037", "BCI (Banco de Crédito e Inversiones)": "016",
    "Itaú Chile": "039", "BBVA Chile": "504", "Scotiabank Chile": "014",
    "Banco Falabella": "051", "Banco Ripley": "053", "Tanner": "059",
  };
  const COLOMBIA_BANK_CODES: Record<string, string> = {
    "Bancolombia": "007", "Banco Davivienda": "051", "Banco de Bogotá": "001",
    "BBVA Colombia": "013", "Banco Popular": "002", "Banco Caja Social": "032",
    "Scotiabank Colpatria": "019", "Nequi": "507", "Daviplata": "551",
  };
  const PHILIPPINES_BANK_CODES: Record<string, string> = {
    "BDO Unibank": "010030667", "BPI (Bank of the Philippine Islands)": "010040018",
    "Metrobank": "010269996", "UnionBank": "010421703", "Security Bank": "010219061",
    "Landbank of the Philippines": "010522101", "PNB (Philippine National Bank)": "010350335",
  };

  if (country === "CL" || country === "CHILE") {
    if (!employee.bankAccountNumber) throw new HriqError("HRIQ-0810", `${fullName} has no bank account number saved. Ask them to complete payment setup.`);
    if (!extra.rut) throw new HriqError("HRIQ-0810", `${fullName} is missing their RUT (Chilean tax ID). Ask them to update payment details.`);
    if (!extra.accountType) throw new HriqError("HRIQ-0810", `${fullName} is missing their account type. Ask them to update payment details.`);
    const bankCode = extra.bankCode ?? CHILE_BANK_CODES[employee.bankName ?? ""] ?? "";
    if (!bankCode) throw new HriqError("HRIQ-0810", `Cannot determine bank code for ${employee.bankName}. Contact support.`);
    recipient = await wise.createChileanRecipient({
      accountHolderName: fullName,
      bankCode,
      accountNumber: employee.bankAccountNumber.replace(/\D/g, ""),
      accountType: extra.accountType as "CHECKING" | "SAVINGS" | "CUENTA_VISTA" | "CUENTA_RUT",
      rut: extra.rut,
      phoneNumber: extra.phoneNumber ?? "",
      email,
      address: {
        firstLine: employee.streetAddress ?? "",
        city: employee.city ?? "",
        postCode: employee.postalCode ?? "",
      },
    });
  } else if (country === "CO" || country === "COLOMBIA") {
    if (!employee.bankAccountNumber) throw new HriqError("HRIQ-0811", `${fullName} has no bank account number saved.`);
    if (!extra.idNumber) throw new HriqError("HRIQ-0811", `${fullName} is missing their national ID number. Ask them to update payment details.`);
    const bankCode = extra.bankCode ?? COLOMBIA_BANK_CODES[employee.bankName ?? ""] ?? "";
    if (!bankCode) throw new HriqError("HRIQ-0811", `Cannot determine bank code for ${employee.bankName}. Contact support.`);
    recipient = await wise.createColombianRecipient({
      accountHolderName: fullName,
      bankCode,
      accountNumber: employee.bankAccountNumber.replace(/\D/g, ""),
      accountType: (extra.accountType ?? "SAVINGS") as "CHECKING" | "SAVINGS",
      phoneNumber: extra.phoneNumber ?? "",
      idType: extra.idType ?? "CC",
      idNumber: extra.idNumber,
      email,
      address: {
        firstLine: employee.streetAddress ?? "",
        city: employee.city ?? "",
        postCode: employee.postalCode ?? "",
      },
    });
  } else if (country === "PH" || country === "PHILIPPINES") {
    if (!employee.bankAccountNumber) throw new HriqError("HRIQ-0812", `${fullName} has no bank account number saved.`);
    const bankCode = extra.bankCode ?? PHILIPPINES_BANK_CODES[employee.bankName ?? ""] ?? "";
    if (!bankCode) throw new HriqError("HRIQ-0812", `Cannot determine bank code for ${employee.bankName}. Contact support.`);
    recipient = await wise.createPhilippineRecipient({
      accountHolderName: fullName,
      bankCode,
      accountNumber: employee.bankAccountNumber.replace(/\D/g, ""),
      email,
      address: {
        firstLine: employee.streetAddress ?? "",
        city: employee.city ?? "",
        postCode: employee.postalCode ?? "",
      },
    });
  } else if (country === "US" || country === "UNITED STATES") {
    // US recipient — we can auto-fill from existing bank details
    if (!employee.bankRoutingNumber || !employee.bankAccountNumber) {
      throw new HriqError("HRIQ-0813", "US recipients require routing number and account number");
    }
    recipient = await wise.createUSRecipient({
      accountHolderName: fullName,
      routingNumber: employee.bankRoutingNumber,
      accountNumber: employee.bankAccountNumber,
      accountType: (extra.accountType ?? "CHECKING") as "CHECKING" | "SAVINGS",
      email,
      address: {
        firstLine: employee.streetAddress ?? "",
        city: employee.city ?? "",
        stateCode: employee.stateProvince ?? "",
        postCode: employee.postalCode ?? "",
      },
    });
  } else if (country === "AR" || country === "ARGENTINA") {
    const targetCurrency = employee.wiseRecipientCurrency ?? employee.currency ?? "ARS";
    if (targetCurrency === "USD") {
      // USD recipient via US bank — needs routing + account number
      if (!employee.bankRoutingNumber || !employee.bankAccountNumber) {
        throw new HriqError("HRIQ-0813",
          `${fullName} is set up for USD payments but is missing their ${!employee.bankRoutingNumber ? "routing number" : "account number"}. Ask them to update payment details.`);
      }
      // AR contractor with US bank account — use createRecipient (not createUSRecipient)
      // because the contractor's address is Argentine, not US
      recipient = await wise.createRecipient({
        currency: "USD",
        type: "aba",
        accountHolderName: fullName,
        details: {
          abartn: employee.bankRoutingNumber,
          accountNumber: employee.bankAccountNumber,
          accountType: (extra.accountType ?? "CHECKING") as "CHECKING" | "SAVINGS",
          email,
        },
        address: {
          firstLine: employee.streetAddress ?? "",
          city: employee.city ?? "",
          postCode: employee.postalCode ?? "",
          countryCode: "AR",
        },
      });
    } else {
      // Argentine ARS recipient — CBU/CVU + CUIL/CUIT
      if (!employee.bankAccountNumber) throw new HriqError("HRIQ-0814", `${fullName} has no bank account number (CBU/CVU) saved.`);
      const taxId = extra.idNumber ?? extra.rut ?? "";
      if (!taxId) throw new HriqError("HRIQ-0814", `${fullName} is missing their CUIL/CUIT. Ask them to update payment details.`);
      recipient = await wise.createRecipient({
        currency: "ARS",
        type: "argentina",
        accountHolderName: fullName,
        details: {
          legalType: "PRIVATE",
          taxId,
          accountNumber: employee.bankAccountNumber.replace(/\D/g, ""),
          email,
        },
        address: {
          country: "AR",
          city: employee.city ?? "",
          firstLine: employee.streetAddress ?? "",
          postCode: employee.postalCode ?? "",
        },
      });
    }
  } else {
    // ── Fallback: route by target currency if country isn't directly supported ──
    // Covers cases like someone living in Country X but banking in USD via a US bank
    const targetCurrency = employee.wiseRecipientCurrency ?? employee.currency;
    if (targetCurrency === "USD") {
      if (!employee.bankRoutingNumber || !employee.bankAccountNumber) {
        throw new HriqError("HRIQ-0813",
          `${fullName} is set up for USD payments but is missing their ${!employee.bankRoutingNumber ? "routing number" : "account number"}. Ask them to update payment details.`);
      }
      // Use generic createRecipient with aba type — don't hardcode US address
      // Person may live abroad but have a US bank account
      const COUNTRY_ISO: Record<string, string> = {
        "UNITED STATES": "US", "COSTA RICA": "CR", "ARGENTINA": "AR", "CHILE": "CL",
        "COLOMBIA": "CO", "PHILIPPINES": "PH", "DOMINICAN REPUBLIC": "DO", "MEXICO": "MX",
        "BRAZIL": "BR", "PERU": "PE", "CANADA": "CA", "UNITED KINGDOM": "GB", "SPAIN": "ES",
        "VENEZUELA": "VE", "ECUADOR": "EC", "HONDURAS": "HN", "GUATEMALA": "GT",
        "EL SALVADOR": "SV", "NICARAGUA": "NI", "PANAMA": "PA", "PUERTO RICO": "PR",
      };
      const addressCountry = (country?.length === 2 ? country : COUNTRY_ISO[country ?? ""] ?? country?.slice(0, 2)) ?? "US";
      const isUSAddress = addressCountry === "US";
      recipient = await wise.createRecipient({
        currency: "USD",
        type: "aba",
        accountHolderName: fullName,
        details: {
          abartn: employee.bankRoutingNumber,
          accountNumber: employee.bankAccountNumber,
          accountType: (extra.accountType ?? "CHECKING") as "CHECKING" | "SAVINGS",
          email,
        },
        address: {
          firstLine: employee.streetAddress ?? "",
          city: employee.city ?? "",
          ...(isUSAddress ? { state: employee.stateProvince ?? "" } : {}),
          postCode: employee.postalCode ?? "",
          countryCode: addressCountry,
        },
      });
    } else {
      throw new HriqError("HRIQ-0814",
        `Cannot auto-setup Wise recipient for country: ${country}. Please provide explicit details override.`);
    }
  }

  if (recipient) {
    await database.employee.update({
      where: { id: employeeId },
      data: {
        wiseRecipientId: recipient.id,
        wiseRecipientCurrency: recipient.currency,
        wiseRecipientType: recipient.type,
        wiseRecipientSyncedAt: new Date(),
      },
    });

    revalidatePath("/[orgSlug]/people", "page");
    return recipient;
  }
}

/** Get Wise recipient status for a contractor */

/** List all contractors with their Wise recipient status */

// ─── Execute Wise Payout ────────────────────────────────────────────────────────

/**
 * Execute a contractor payout via Wise API.
 *
 * Full flow:
 * 1. Validate payment & contractor
 * 2. Check client invoice is paid
 * 3. Create Wise quote (locks exchange rate)
 * 4. Create Wise transfer
 * 5. Fund from USD balance
 * 6. Update payment record with Wise details
 * 7. Generate invoice + paystub
 * 8. Email contractor
 */
export async function executeWisePayout(data: {
  paymentId: string;
  targetCurrency?: string; // Override — defaults to contractor's currency
  notes?: string;
  managementPassword?: string;
}) {
  const session = await requireRole("super_admin");
  const { verifyManagementPassword } = await import("./management-auth");
  if (data.managementPassword) await verifyManagementPassword(data.managementPassword);

  const wise = await import("@repo/integrations/wise");

  try {
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

  // ── ACH gate: COR orgs must have collected client funds before paying contractors ──
  const orgPaymentMethod = emp.organization?.profile?.paymentMethod ?? (emp.organization as any)?.paymentMethod;
  if (orgPaymentMethod === "cor" || orgPaymentMethod === "COR") {
    if (payment.periodStart && payment.periodEnd) {
      const { getPayPeriodForDate } = await import("@repo/integrations/quickbooks-payments");
      const payPeriod = getPayPeriodForDate(new Date(payment.periodStart as any));
      const collection = await database.achCollection.findFirst({
        where: { organizationId: emp.organizationId!, payPeriod, status: "COLLECTED" },
      });
      if (!collection) {
        throw new HriqError(
          "HRIQ-0830",
          `ACH collection for ${emp.organization?.name ?? "client"} period ${payPeriod} has not settled. Cannot release payout until client funds are confirmed.`,
        );
      }
    }
  }
  if (!emp.wiseRecipientId && !emp.wiseTag) {
    throw new HriqError("HRIQ-0815", `Contractor ${emp.legalFirstName} ${emp.legalLastName} has no Wise recipient or Wise tag. Please set up their Wise recipient first.`);
  }

  // Auto-create recipient from Wise tag if no recipient exists
  if (!emp.wiseRecipientId && emp.wiseTag) {
    console.log(`[Wise Payout] Creating email recipient from Wise tag: ${emp.wiseTag}`);
    try {
      const recipient = await setupWiseRecipient(emp.id);
      if (!recipient || !recipient.id) {
        throw new HriqError("HRIQ-0815", `Could not create Wise recipient from tag ${emp.wiseTag}`);
      }
      (emp as any).wiseRecipientId = recipient.id;
    } catch (e: any) {
      if (e?.code?.startsWith("HRIQ-")) throw e;
      throw new HriqError("HRIQ-0815", `Failed to create Wise recipient from tag: ${e.message ?? "Unknown error"}`);
    }
  }

  // If recipient ID is the placeholder (-1), create the real Wise recipient now using saved bank details or Wise tag
  if (emp.wiseRecipientId === -1) {
    if (!emp.bankAccountNumber || !emp.country) {
      throw new HriqError("HRIQ-0815", `Contractor ${emp.legalFirstName} ${emp.legalLastName} has incomplete bank details. Ask them to complete payment setup.`);
    }
    try {
      // Call setupWiseRecipient which handles all country-specific logic (CL/CO/PH/US/etc.)
      // Note: setupWiseRecipient has requireRole("super_admin") which is satisfied since
      // executeWisePayout already called requireRole("super_admin") above.
      const recipient = await setupWiseRecipient(emp.id);
      if (!recipient || !recipient.id) {
        throw new HriqError("HRIQ-0815", `Could not create Wise recipient for ${emp.legalFirstName} ${emp.legalLastName}`);
      }
      (emp as any).wiseRecipientId = recipient.id;
    } catch (e: any) {
      if (e?.code?.startsWith("HRIQ-")) throw e;
      throw new HriqError("HRIQ-0815", `Failed to create Wise recipient: ${e.message ?? "Unknown error"}`);
    }
  }

  // 2. Atomically claim the payment
  const claimed = await database.payment.updateMany({
    where: { id: data.paymentId, status: "pending" },
    data: { status: "processing" },
  });
  if (claimed.count === 0) {
    throw new HriqError("HRIQ-0802", "Payment is already being processed or completed");
  }

  let payoutSuccess = false;
  try {
    // 3. Check client invoice is paid
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

    // 4. RL absorbs the Wise fee — use targetAmount so contractor gets exact pay
    const amount = Number(payment.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new HriqError("HRIQ-0804", `Invalid payment amount: ${payment.amount}`);
    }
    const targetCurrency = data.targetCurrency ?? emp.wiseRecipientCurrency ?? emp.currency ?? "USD";
    const dryRun = process.env.WISE_DRY_RUN === "true";

    // Preview to get fee estimate for balance check and UI display.
    // The actual fee comes from the execution quote (may differ slightly due to rate changes).
    const feePreview = await wise.getPayoutPreview({
      sourceCurrency: "USD",
      targetCurrency,
      sourceAmount: amount,
      ...(emp.wiseRecipientId ? { recipientId: emp.wiseRecipientId } : {}),
    });
    const estimatedFee = feePreview.fee ?? 0;
    const estimatedTotal = Math.round((amount + estimatedFee) * 100) / 100;

    // Check balance against estimated total (amount + fee)
    const usdBalance = await wise.getUsdBalance();
    if (!dryRun && (!usdBalance || usdBalance.amount.value < estimatedTotal)) {
      throw new HriqError("HRIQ-0816",
        `Insufficient Wise USD balance. Need ~$${estimatedTotal.toFixed(2)} ($${amount.toFixed(2)} + ~$${estimatedFee.toFixed(2)} fee), have $${(usdBalance?.amount.value ?? 0).toFixed(2)}`);
    }

    // 5. Execute with targetAmount so Wise guarantees the contractor receives the exact amount.
    // For USD→USD: targetAmount = amount → contractor gets $amount, we pay amount + fee.
    // For USD→CLP: targetAmount = amount * rate (in CLP) → contractor gets full converted amount.
    const isSameCurrency = targetCurrency === "USD";
    const desiredTargetAmount = isSameCurrency
      ? amount
      : Math.round(amount * (feePreview.rate ?? 1) * 100) / 100;

    const idempotencyKey = crypto.randomUUID();

    const result = await wise.executeContractorPayout({
      recipientId: emp.wiseRecipientId!,
      sourceCurrency: "USD",
      targetCurrency,
      targetAmount: desiredTargetAmount, // Wise calculates sourceAmount = targetAmount/rate + fee
      reference: `HQ${payment.id.slice(-8)}`,
      idempotencyKey,
    });

    // ⚠️ CRITICAL: Money has now left our Wise balance. Set payoutSuccess BEFORE any DB writes
    // so a DB failure doesn't revert the payment to "pending" (which would allow double-pay).
    payoutSuccess = true;

    // 6. Get delivery estimate
    let estimatedDelivery: Date | null = null;
    try {
      const estimate = await wise.getDeliveryEstimate(result.transfer.id);
      estimatedDelivery = new Date(estimate.estimatedDeliveryDate);
    } catch (err) { console.warn("[wise-payouts:executeWisePayout] non-critical:", err); }

    // Find actual fee from executed quote (may differ slightly from preview)
    const balanceOption = result.quote.paymentOptions.find(
      (o: any) => o.payIn === "BALANCE" && !o.disabled,
    );
    const fee = balanceOption?.fee?.total ?? 0;

    // 7. Update payment record (precondition: still in processing state from atomic claim)
    const now = new Date();
    await database.payment.updateMany({
      where: { id: data.paymentId, status: "processing" },
      data: {
        status: dryRun ? "pending" : "completed",
        paymentDate: dryRun ? undefined : now,
        paymentMethod: "wise",
        transactionId: String(result.transfer.id),
        notes: dryRun
          ? `[DRY RUN] Test payout at ${now.toISOString()}. Fee $${fee.toFixed(2)} absorbed by RL. ${data.notes ?? ""}`
          : (data.notes ? `${data.notes} | Fee $${fee.toFixed(2)} absorbed by RL` : `Fee $${fee.toFixed(2)} absorbed by RL`),
        payoutProvider: "wise",
        payoutReference: String(result.transfer.id),
        payoutConfirmedAt: dryRun ? undefined : now,
        payoutConfirmedBy: dryRun ? undefined : session.userId,
        processedByUserId: session.userId,
        processedByName: session.name ?? undefined,
        // Wise-specific fields (always record for visibility)
        wiseTransferId: result.transfer.id,
        wiseQuoteId: result.quote.id,
        wiseTransferStatus: dryRun ? "dry_run" : result.transfer.status,
        wiseSourceAmount: result.transfer.sourceValue, // amount + fee (what left RL's balance)
        wiseTargetAmount: result.transfer.targetValue, // what contractor receives
        wiseTargetCurrency: result.transfer.targetCurrency,
        wiseExchangeRate: result.quote.rate,
        wiseFee: fee,
        wiseEstimatedDelivery: estimatedDelivery,
        wiseFundedAt: dryRun ? undefined : now,
      },
    });

    // 8. Generate invoice & paystub (skip in dry-run)
    if (!dryRun) {
      try {
        const { generateAndDeliverPaystub } = await import("./paystub");
        await generateAndDeliverPaystub(data.paymentId);
      } catch (e) {
        console.error("[Wise Payout] Paystub generation failed:", e);
      }

      // 8b. Sync to QuickBooks (RL internal only, non-blocking)
      const isRL = emp.organizationId === (process.env.RL_ORGANIZATION_ID ?? "org_rl_001");
      if (isRL) {
        try {
          const { syncPaymentToQuickBooks } = await import("./quickbooks");
          const qbResult = await syncPaymentToQuickBooks(data.paymentId);
          if (qbResult.success) {
            console.info(`[Wise Payout] QB synced — Bill: ${qbResult.qbBillId}`);
          } else if (qbResult.error !== "QuickBooks not connected") {
            console.warn(`[Wise Payout] QB sync failed: ${qbResult.error}`);
          }
        } catch (e) {
          console.error("[Wise Payout] QB sync error:", e);
        }
      }
    }

    // 9. Audit log
    try {
      await database.auditLog.create({
        data: {
          action: dryRun ? "wise_payout_dry_run" : "wise_payout_completed",
          objectType: "payment",
          objectId: data.paymentId,
          actorType: "user",
          actorUserId: session.userId,
          actorDescription: session.name ?? session.userId,
          newValue: {
            wiseTransferId: result.transfer.id,
            sourceAmount: result.transfer.sourceValue,
            targetAmount: result.transfer.targetValue,
            targetCurrency: result.transfer.targetCurrency,
            exchangeRate: result.quote.rate,
            fee,
            status: result.transfer.status,
            employeeId: emp.id,
            employeeName: `${emp.legalFirstName} ${emp.legalLastName}`,
          },
          organizationId: emp.organization?.id ?? null,
        },
      });
    } catch (e) {
      console.error("[Wise Payout] Audit log failed:", e);
    }

    revalidatePath("/[orgSlug]/payments", "page");
    revalidatePath("/[orgSlug]/payroll", "page");
    revalidatePath("/[orgSlug]/payments/external", "page");
    revalidatePath("/[orgSlug]/payroll/external", "page");

    return {
      success: true,
      dryRun,
      wiseTransferId: result.transfer.id,
      sourceAmount: result.transfer.sourceValue,
      targetAmount: result.transfer.targetValue,
      targetCurrency: result.transfer.targetCurrency,
      exchangeRate: result.quote.rate,
      fee,
      status: dryRun ? "dry_run" : result.transfer.status,
      estimatedDelivery: estimatedDelivery?.toISOString() ?? null,
    };
  } catch (err: unknown) {
    if (payoutSuccess) {
      // ⚠️ CRITICAL: Money was already sent via Wise but a post-transfer step failed
      // (DB update, paystub, audit log). DO NOT revert to "pending" — that risks double-pay.
      // Leave status as "processing" so it's visible and can be manually resolved.
      console.error("[executeWisePayout] POST-TRANSFER FAILURE — money sent but DB/post-processing failed:", err);
      import("@/lib/hriq/sentry").then(({ captureServerException }) =>
        captureServerException(err, { action: "executeWisePayout_POST_TRANSFER", paymentId: data.paymentId, extra: { critical: true } })
      ).catch(() => {});
      return { error: "Payment was sent via Wise but failed to update records. Please contact engineering — do NOT retry this payment." };
    }

    // Pre-transfer failure — safe to revert to pending
    await database.payment.updateMany({
      where: { id: data.paymentId, status: "processing" },
      data: { status: "pending" },
    }).catch((e: unknown) => console.error("[background task failed]", e));

    const msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[executeWisePayout]", msg);
    import("@/lib/hriq/sentry").then(({ captureServerException }) => captureServerException(err, { action: "executeWisePayout", paymentId: data.paymentId })).catch(() => {});
    return { error: msg };
  }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[executeWisePayout]", msg);
    import("@/lib/hriq/sentry").then(({ captureServerException }) => captureServerException(err, { action: "executeWisePayout", paymentId: data.paymentId })).catch(() => {});
    return { error: msg };
  }
}

// ─── Batch Wise Payout ──────────────────────────────────────────────────────────

/** Execute Wise payouts for multiple payments */

// ─── Wise Transfer Status Sync ──────────────────────────────────────────────────

/** Sync Wise transfer statuses for recent payments */

// ─── Wise Account Requirements ──────────────────────────────────────────────────

/** Get Wise account requirements for a specific currency route */
