"use server";

/**
 * Payment method validation — two layers:
 *
 * 1. Local field check: are required fields present in our DB?
 * 2. API verification: actually hit Wise or Cadana to confirm the
 *    contractor is set up and payable on the platform.
 *
 * Returns { valid, issues, apiStatus } where apiStatus shows the
 * result of the live API check.
 */

type BankInfo = {
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankSwiftCode: string | null;
  bankRoutingNumber: string | null;
  bankAddress: string | null;
  country: string | null;
  currency: string | null;
};

export type ValidationResult = {
  valid: boolean;
  issues: string[];
  apiStatus?: "verified" | "not_configured" | "error" | "skipped";
  apiDetail?: string;
};

// ─── Local Field Checks ───────────────────────────────────────────

function validateCadanaLocal(info: BankInfo): ValidationResult {
  const issues: string[] = [];
  if (!info.bankAccountName?.trim()) issues.push("Account holder name is required");
  if (!info.country?.trim()) issues.push("Country is required");
  return { valid: issues.length === 0, issues };
}

function validateWiseLocal(info: BankInfo): ValidationResult {
  const issues: string[] = [];
  if (!info.bankAccountName?.trim()) issues.push("Account holder name is required for Wise");
  if (!info.bankAccountNumber?.trim()) issues.push("Account/IBAN number is required for Wise");

  const country = (info.country ?? "").trim();
  const routing = (info.bankRoutingNumber ?? "").trim();
  const swift = (info.bankSwiftCode ?? "").trim();

  const routingCountries = ["United States", "US", "USA", "United Kingdom", "UK", "Canada", "CA", "Australia", "AU"];
  if (routingCountries.includes(country)) {
    if (!routing || routing === "N/A") {
      issues.push(`Routing/sort code is required for Wise (${country})`);
    }
  } else {
    if ((!swift || swift === "N/A") && (!routing || routing === "N/A")) {
      issues.push("SWIFT/BIC code or routing number is required for Wise");
    }
  }

  return { valid: issues.length === 0, issues };
}

export async function validatePaymentMethod(
  method: "cadana" | "wise",
  bankInfo: BankInfo
): Promise<ValidationResult> {
  if (method === "cadana") return validateCadanaLocal(bankInfo);
  if (method === "wise") return validateWiseLocal(bankInfo);
  return { valid: false, issues: ["Unknown payment method"] };
}

// ─── API Verification: Wise ───────────────────────────────────────

async function verifyWiseViaAPI(employee: {
  id: string;
  legalFirstName: string | null;
  legalLastName: string | null;
  wiseRecipientId: number | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankSwiftCode: string | null;
  bankRoutingNumber: string | null;
  bankAddress: string | null;
  country: string | null;
  currency: string | null;
  wiseRecipientCurrency: string | null;
  bankExtraData: Record<string, unknown> | null;
  streetAddress: string | null;
  city: string | null;
  stateProvince: string | null;
  postalCode: string | null;
}): Promise<{ apiStatus: ValidationResult["apiStatus"]; apiDetail: string; recipientId?: number; recipientCurrency?: string; recipientType?: string }> {
  try {
    // If we already have a Wise recipient ID, check if it's still active
    if (employee.wiseRecipientId && employee.wiseRecipientId !== -1) {
      const { getRecipient } = await import("@repo/integrations/wise");
      try {
        const recipient = await getRecipient(employee.wiseRecipientId);
        if (recipient.active) {
          return {
            apiStatus: "verified",
            apiDetail: `Wise recipient #${recipient.id} is active (${recipient.accountHolderName}, ${recipient.currency}, type: ${recipient.type})`,
            recipientId: recipient.id,
            recipientCurrency: recipient.currency,
            recipientType: recipient.type,
          };
        } else {
          return {
            apiStatus: "not_configured",
            apiDetail: `Wise recipient #${recipient.id} exists but is INACTIVE — may need to recreate`,
          };
        }
      } catch (err: any) {
        return {
          apiStatus: "not_configured",
          apiDetail: `Wise recipient #${employee.wiseRecipientId} not found on Wise: ${err.message}`,
        };
      }
    }

    // No existing recipient — try to validate bank details by creating one
    const { validateBankDetails } = await import("@repo/integrations/wise");

    const extra = (employee.bankExtraData ?? {}) as Record<string, string | undefined>;
    const country = (employee.country ?? "").trim();

    // Use wiseRecipientCurrency (what the contractor receives) over pay currency
    const currency = (employee.wiseRecipientCurrency ?? employee.currency ?? "USD").toUpperCase();

    // Map country → Wise recipient type (depends on target currency)
    const countryTypeMap: Record<string, string> = {
      "United States": "aba", "US": "aba", "USA": "aba",
      "Chile": "chile", "CL": "chile",
      "Colombia": "colombia", "CO": "colombia",
      "Philippines": "philippines", "PH": "philippines",
      "Brazil": "brazil", "BR": "brazil",
      "Argentina": "argentina", "AR": "argentina",
      "India": "indian", "IN": "indian",
      "Mexico": "swift_code", "MX": "swift_code",
      "Nigeria": "nigeria", "NG": "nigeria",
      "Kenya": "kenya", "KE": "kenya",
      "Peru": "peru", "PE": "peru",
      "Costa Rica": "costa_rica", "CR": "costa_rica",
      "United Kingdom": "sort_code", "UK": "sort_code", "GB": "sort_code",
      "Canada": "canadian", "CA": "canadian",
      "Australia": "australian", "AU": "australian",
      "Ukraine": "swift_code", "UA": "swift_code",
      "Nicaragua": "swift_code", "NI": "swift_code",
      "Jamaica": "swift_code", "JM": "swift_code",
      "Venezuela": "swift_code", "VE": "swift_code",
      "Panama": "swift_code", "PA": "swift_code",
      "Ecuador": "swift_code", "EC": "swift_code",
      "Honduras": "swift_code", "HN": "swift_code",
      "Guatemala": "swift_code", "GT": "swift_code",
      "El Salvador": "swift_code", "SV": "swift_code",
      "Dominican Republic": "swift_code", "DO": "swift_code",
      "Pakistan": "swift_code", "PK": "swift_code",
    };
    const recipientType = countryTypeMap[country] ?? "swift_code";

    // Build country-specific details from DB fields + bankExtraData
    const details: Record<string, unknown> = {};

    if (recipientType === "aba") {
      details.abartn = employee.bankRoutingNumber;
      details.accountNumber = employee.bankAccountNumber;
      details.accountType = extra.accountType ?? "CHECKING";
    } else if (recipientType === "chile") {
      details.bankCode = extra.bankCode ?? employee.bankRoutingNumber;
      details.accountNumber = employee.bankAccountNumber;
      details.accountType = extra.accountType ?? "CHECKING";
      details.rut = extra.rut;
      details.phoneNumber = extra.phoneNumber;
      details.email = extra.email;
    } else if (recipientType === "colombia") {
      details.bankCode = extra.bankCode ?? employee.bankRoutingNumber;
      details.accountNumber = employee.bankAccountNumber;
      details.accountType = extra.accountType ?? "CHECKING";
      details.phoneNumber = extra.phoneNumber;
      details.idType = extra.idType ?? "CC";
      details.idNumber = extra.idNumber;
      details.email = extra.email;
    } else if (recipientType === "philippines") {
      details.bankCode = extra.bankCode ?? employee.bankRoutingNumber;
      details.accountNumber = employee.bankAccountNumber;
      details.email = extra.email;
    } else if (recipientType === "brazil") {
      details.bankCode = extra.bankCode ?? employee.bankRoutingNumber;
      details.branchCode = extra.branchCode;
      details.accountNumber = employee.bankAccountNumber;
      details.accountType = extra.accountType ?? "CHECKING";
      details.cpf = extra.cpf ?? extra.rut;
      details.phoneNumber = extra.phoneNumber;
    } else if (recipientType === "argentina") {
      details.taxId = extra.rut ?? extra.idNumber;
      details.accountNumber = employee.bankAccountNumber;
    } else if (recipientType === "indian") {
      details.ifscCode = extra.bankCode ?? employee.bankRoutingNumber;
      details.accountNumber = employee.bankAccountNumber;
    } else if (recipientType === "sort_code") {
      details.sortCode = employee.bankRoutingNumber;
      details.accountNumber = employee.bankAccountNumber;
    } else if (recipientType === "canadian") {
      details.institutionNumber = extra.bankCode;
      details.transitNumber = employee.bankRoutingNumber;
      details.accountNumber = employee.bankAccountNumber;
      details.accountType = extra.accountType ?? "CHECKING";
    } else if (recipientType === "australian") {
      details.bsbCode = employee.bankRoutingNumber;
      details.accountNumber = employee.bankAccountNumber;
    } else if (recipientType === "nigeria" || recipientType === "kenya" || recipientType === "peru" || recipientType === "costa_rica") {
      details.bankCode = extra.bankCode ?? employee.bankRoutingNumber;
      details.accountNumber = employee.bankAccountNumber;
      if (extra.accountType) details.accountType = extra.accountType;
      if (extra.phoneNumber) details.phoneNumber = extra.phoneNumber;
      if (extra.idType) details.idDocumentType = extra.idType;
      if (extra.idNumber) details.idDocumentNumber = extra.idNumber;
    } else {
      // swift_code fallback — use accountNumber (NOT IBAN), BIC for SWIFT code
      details.accountNumber = employee.bankAccountNumber;
      if (employee.bankSwiftCode) details.BIC = employee.bankSwiftCode;
    }

    // Strip undefined/null values from details to avoid Wise "not permitted" errors
    for (const key of Object.keys(details)) {
      if (details[key] === undefined || details[key] === null || details[key] === "") {
        delete details[key];
      }
    }

    // Build country code for address
    const countryCodeMap: Record<string, string> = {
      "United States": "US", "Chile": "CL", "Colombia": "CO", "Philippines": "PH",
      "Brazil": "BR", "Argentina": "AR", "India": "IN", "Mexico": "MX",
      "Nigeria": "NG", "Kenya": "KE", "Peru": "PE", "Costa Rica": "CR",
      "United Kingdom": "GB", "Canada": "CA", "Australia": "AU", "Ukraine": "UA",
      "Nicaragua": "NI", "Jamaica": "JM", "Venezuela": "VE", "Panama": "PA",
      "Ecuador": "EC", "Honduras": "HN", "Guatemala": "GT", "El Salvador": "SV",
      "Dominican Republic": "DO", "Pakistan": "PK",
    };
    const countryCode = country.length === 2 ? country : countryCodeMap[country];

    // Build address from structured fields, falling back to bankAddress.
    // Only include `state` for countries where Wise requires a short state/province code.
    const STATE_COUNTRIES = new Set(["US", "CA", "AU", "IN", "BR"]);
    const includeState = countryCode ? STATE_COUNTRIES.has(countryCode) : false;

    let address: { country?: string; city?: string; firstLine?: string; state?: string; postCode?: string } | undefined;
    if (employee.streetAddress || employee.city || employee.postalCode) {
      address = {
        country: countryCode,
        firstLine: employee.streetAddress ?? undefined,
        city: employee.city ?? undefined,
        postCode: employee.postalCode || undefined,
        ...(includeState && employee.stateProvince ? { state: employee.stateProvince } : {}),
      };
    } else if (employee.bankAddress) {
      address = {
        country: countryCode,
        firstLine: employee.bankAddress,
      };
    }

    // Sanitize accountHolderName — reject values that look like account numbers
    const rawName = employee.bankAccountName?.trim();
    const nameLooksValid = rawName
      && rawName.length >= 5
      && !/^\d+$/.test(rawName)
      && !/^[A-Z]{2}\d/.test(rawName)
      && (rawName.replace(/[^0-9]/g, "").length / rawName.length) < 0.6;
    const holderName = nameLooksValid ? rawName : `${employee.legalFirstName ?? ""} ${employee.legalLastName ?? ""}`.trim();

    const result = await validateBankDetails({
      currency,
      type: recipientType,
      accountHolderName: holderName || "",
      details,
      address,
    });

    if (result.valid) {
      // Save the new recipient ID
      const db = await import("@repo/database");
      if (result.recipientId) {
        await db.database.employee.update({
          where: { id: employee.id },
          data: {
            wiseRecipientId: result.recipientId,
            wiseRecipientCurrency: result.recipientCurrency ?? null,
            wiseRecipientType: result.recipientType ?? null,
            wiseRecipientSyncedAt: new Date(),
          },
        });
      }
      return {
        apiStatus: "verified",
        apiDetail: `Wise created recipient #${result.recipientId} (${result.recipientCurrency}, ${result.recipientType})`,
        recipientId: result.recipientId,
        recipientCurrency: result.recipientCurrency,
        recipientType: result.recipientType,
      };
    }

    const errorSummary = result.errors.map((e) => `${e.field}: ${e.message}`).join("; ");
    return { apiStatus: "not_configured", apiDetail: `Wise rejected: ${errorSummary}` };

  } catch (err: any) {
    return { apiStatus: "error", apiDetail: `Wise API error: ${err.message}` };
  }
}

// ─── API Verification: Cadana ─────────────────────────────────────

async function verifyCadanaViaAPI(employee: {
  id: string;
  cadanaPersonId: string | null;
  personalEmail: string | null;
  workEmail: string | null;
}): Promise<{ apiStatus: ValidationResult["apiStatus"]; apiDetail: string }> {
  try {
    const { getCadanaPerson, getCadanaPaymentInfo, findCadanaPersonByEmail } = await import("@repo/integrations/cadana");

    let personId = employee.cadanaPersonId;

    // If no cadanaPersonId, try to find by email
    if (!personId) {
      const email = employee.personalEmail ?? employee.workEmail;
      if (!email) {
        return { apiStatus: "not_configured", apiDetail: "No Cadana person ID and no email to search by" };
      }
      const found = await findCadanaPersonByEmail(email);
      if (found) {
        personId = found.id;
        const db = await import("@repo/database");
        await db.database.employee.update({
          where: { id: employee.id },
          data: { cadanaPersonId: found.id },
        });
      } else {
        return { apiStatus: "not_configured", apiDetail: `No Cadana person found for ${email}. Needs to be onboarded to Cadana first.` };
      }
    }

    // Check person status
    const person = await getCadanaPerson(personId);
    if (person.status !== "Active") {
      return { apiStatus: "not_configured", apiDetail: `Cadana person status is "${person.status}" (expected "Active")` };
    }

    // Check payment info
    try {
      const paymentInfo = await getCadanaPaymentInfo(personId);
      const method = paymentInfo.preferredMethod;

      if (method === "bank" && paymentInfo.bank) {
        const bankName = paymentInfo.bank.bankName || "Unknown";
        const lastFour = paymentInfo.bank.accountNumber?.slice(-4) || "****";
        return { apiStatus: "verified", apiDetail: `Cadana: Active, bank (${bankName} ****${lastFour})` };
      } else if (method === "wallet" && paymentInfo.wallet) {
        return { apiStatus: "verified", apiDetail: `Cadana: Active, wallet (${paymentInfo.wallet.type} — ${paymentInfo.wallet.currency})` };
      } else if (method === "momo" && paymentInfo.momo) {
        return { apiStatus: "verified", apiDetail: `Cadana: Active, mobile money (${paymentInfo.momo.provider})` };
      } else {
        return { apiStatus: "not_configured", apiDetail: `Cadana person Active but no payment method configured (preferred: ${method || "none"})` };
      }
    } catch (payErr: any) {
      return { apiStatus: "not_configured", apiDetail: `Cadana person Active but payment info check failed: ${payErr.message}` };
    }

  } catch (err: any) {
    return { apiStatus: "error", apiDetail: `Cadana API error: ${err.message}` };
  }
}

// ─── Main Server Action ───────────────────────────────────────────

import { database } from "@repo/database";
import { requireOrg } from "@repo/auth/session";
import { revalidatePath } from "next/cache";

/**
 * Full payment verification: local field check + live API check.
 *
 * Layer 1: Are the required fields present in our database?
 * Layer 2: Does the Wise/Cadana API confirm the contractor is payable?
 */
export async function verifyPaymentMethodCompliance(employeeId: string): Promise<ValidationResult> {
  const session = await requireOrg();

  const employee = await database.employee.findFirst({
    where: session.orgRole === "super_admin" ? { id: employeeId } : { id: employeeId, organizationId: session.orgId },
    select: {
      id: true,
      legalFirstName: true,
      legalLastName: true,
      personalEmail: true,
      workEmail: true,
      preferredPaymentMethod: true,
      bankName: true,
      bankAccountName: true,
      bankAccountNumber: true,
      bankSwiftCode: true,
      bankRoutingNumber: true,
      bankAddress: true,
      bankExtraData: true,
      country: true,
      currency: true,
      wiseRecipientId: true,
      wiseRecipientCurrency: true,
      cadanaPersonId: true,
      streetAddress: true,
      city: true,
      stateProvince: true,
      postalCode: true,
    },
  });

  if (!employee) return { valid: false, issues: ["Employee not found"], apiStatus: "skipped" };
  if (!employee.preferredPaymentMethod) return { valid: false, issues: ["No payment method selected"], apiStatus: "skipped" };

  const method = employee.preferredPaymentMethod as "cadana" | "wise";
  const allIssues: string[] = [];

  // Layer 1: Local field check
  const bankInfo = {
    bankName: employee.bankName, bankAccountName: employee.bankAccountName,
    bankAccountNumber: employee.bankAccountNumber, bankSwiftCode: employee.bankSwiftCode,
    bankRoutingNumber: employee.bankRoutingNumber, bankAddress: employee.bankAddress,
    country: employee.country, currency: employee.currency,
  };
  const localResult = method === "cadana" ? validateCadanaLocal(bankInfo) : validateWiseLocal(bankInfo);
  if (!localResult.valid) allIssues.push(...localResult.issues);

  // Layer 2: Live API check
  let apiStatus: ValidationResult["apiStatus"] = "skipped";
  let apiDetail: string | undefined;

  if (method === "wise") {
    const r = await verifyWiseViaAPI({
      id: employee.id, legalFirstName: employee.legalFirstName, legalLastName: employee.legalLastName,
      wiseRecipientId: employee.wiseRecipientId,
      bankAccountName: employee.bankAccountName, bankAccountNumber: employee.bankAccountNumber,
      bankSwiftCode: employee.bankSwiftCode, bankRoutingNumber: employee.bankRoutingNumber,
      bankAddress: employee.bankAddress, country: employee.country, currency: employee.currency,
      wiseRecipientCurrency: employee.wiseRecipientCurrency,
      bankExtraData: employee.bankExtraData as Record<string, unknown> | null,
      streetAddress: employee.streetAddress, city: employee.city,
      stateProvince: employee.stateProvince, postalCode: employee.postalCode,
    });
    apiStatus = r.apiStatus;
    apiDetail = r.apiDetail;
    if (apiStatus !== "verified") allIssues.push(r.apiDetail);
  } else if (method === "cadana") {
    const r = await verifyCadanaViaAPI({
      id: employee.id, cadanaPersonId: employee.cadanaPersonId,
      personalEmail: employee.personalEmail, workEmail: employee.workEmail,
    });
    apiStatus = r.apiStatus;
    apiDetail = r.apiDetail;
    if (apiStatus !== "verified") allIssues.push(r.apiDetail);
  }

  const isValid = allIssues.length === 0 && apiStatus === "verified";

  await database.employee.update({
    where: { id: employeeId },
    data: { paymentMethodVerified: isValid },
  });

  revalidatePath("/[orgSlug]/employees/[id]", "page");

  return { valid: isValid, issues: allIssues, apiStatus, apiDetail };
}
