/**
 * Splitit Payment Integration — Hosted Form Redirect (SAQ-A compliant)
 *
 * Auth:    OAuth2 client_credentials  →  https://id.splitit.com/connect/token
 * API:     https://webapi.production.splitit.com/api/InstallmentPlan/Initiate
 *
 * IMPORTANT — field quirks discovered via live testing:
 *   - The v3 base (api.production.splitit.com) returns 404 for /installmentplan/initiate
 *   - The working host is webapi.production.splitit.com with the v1-style path
 *   - Terminal ID must be passed as RequestHeader.ApiKey — NOT BillerData.TerminalId
 *   - 12-installment plans return error 5051 (not supported on this merchant account)
 *     Supported: 3 and 6 installments confirmed working in production
 *
 * Required env vars:
 *   SPLITIT_CLIENT_ID      — Username from Merchant Hub > Credentials
 *   SPLITIT_CLIENT_SECRET  — Active Password from Merchant Hub > Credentials
 *   SPLITIT_TERMINAL_ID    — Terminal UUID from Merchant Hub > Terminals (used as ApiKey)
 */

const TOKEN_URL = "https://id.splitit.com/connect/token";
const API_BASE  = "https://webapi.production.splitit.com";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface SplititPlanInput {
  /** Total amount INCLUDING the financing fee (already computed by caller) */
  totalAmount: number;
  currency: string;
  numberOfInstallments: number;
  /** Merchant order reference */
  refOrderNumber: string;
  customerEmail?: string;
  customerName?: string;
  customerPhone?: string;
  /** Customer billing address — required for funded plans */
  billingAddress?: {
    addressLine1?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  };
  successUrl: string;
  cancelUrl: string;
  failUrl?: string;
}

export interface SplititPlanResult {
  installmentPlanNumber: string;
  checkoutUrl: string;
  status: string;
}

// ─── Auth ───────────────────────────────────────────────────────────────────

async function getAccessToken(): Promise<string> {
  const clientId     = process.env.SPLITIT_CLIENT_ID;
  const clientSecret = process.env.SPLITIT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Splitit credentials not configured. Set SPLITIT_CLIENT_ID and SPLITIT_CLIENT_SECRET."
    );
  }

  const body = new URLSearchParams({
    grant_type:    "client_credentials",
    scope:         "api.v1 api.v3",
    client_id:     clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(TOKEN_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    body.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Splitit auth failed (HTTP ${res.status}): ${text}`);
  }

  const data = await res.json();
  if (!data.access_token) throw new Error("Splitit auth returned no access_token");
  return data.access_token as string;
}

// ─── Create Hosted Checkout plan ─────────────────────────────────────────────

/**
 * Creates a Splitit installment plan via the Hosted Checkout method.
 * Returns a CheckoutUrl the customer visits to enter their card details.
 *
 * Terminal ID is passed as RequestHeader.ApiKey (confirmed working in production).
 * Supported installment counts: 3 and 6 (12 returns error 5051 on this account).
 */
export async function createSplititInstallmentPlan(
  input: SplititPlanInput
): Promise<SplititPlanResult> {
  const terminalId = process.env.SPLITIT_TERMINAL_ID;
  if (!terminalId) {
    throw new Error(
      "SPLITIT_TERMINAL_ID is not set. Get it from hub.splitit.com → Merchants Management → Terminals."
    );
  }

  const token = await getAccessToken();

  const payload: Record<string, unknown> = {
    // Terminal ID goes here — NOT in BillerData (confirmed via live API testing)
    RequestHeader: { ApiKey: terminalId },
    PlanData: {
      Amount:               { Value: input.totalAmount, CurrencyCode: input.currency },
      NumberOfInstallments: input.numberOfInstallments,
      RefOrderNumber:       input.refOrderNumber,
      AutoCapture:          true,
    },
    PaymentWizardData: {
      RequestedNumberOfInstallments: String(input.numberOfInstallments),
      SuccessExitURL: input.successUrl,
      CancelExitURL:  input.cancelUrl,
      ErrorExitURL:   input.failUrl ?? input.cancelUrl,
    },
  };

  if (input.customerName || input.customerEmail) {
    payload.ConsumerData = {
      FullName:    input.customerName  ?? "",
      Email:       input.customerEmail ?? "",
      PhoneNumber: input.customerPhone ?? "",
      CultureName: "en-us",
    };
  }

  if (input.billingAddress) {
    payload.BillingAddress = {
      AddressLine: input.billingAddress.addressLine1 ?? "",
      City:        input.billingAddress.city         ?? "",
      State:       input.billingAddress.state        ?? "",
      Zip:         input.billingAddress.zip          ?? "",
      Country:     input.billingAddress.country      ?? "USA",
    };
  }

  const crypto = await import("crypto");
  const idempotencyKey = crypto.randomUUID();

  const res = await fetch(`${API_BASE}/api/InstallmentPlan/Initiate`, {
    method:  "POST",
    headers: {
      "Authorization":          `Bearer ${token}`,
      "Content-Type":           "application/json",
      "Splitit-IdempotencyKey": idempotencyKey,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  const rh = (data.ResponseHeader ?? {}) as { Succeeded?: boolean; Errors?: Array<{ ErrorCode: string; Message: string }> };

  if (!rh.Succeeded) {
    const errors = rh.Errors ?? [];
    const errStr = errors.map((e) => `[${e.ErrorCode}] ${e.Message}`).join("; ");
    if (errors.some((e) => e.ErrorCode === "5051")) {
      throw new Error(
        `Splitit: ${input.numberOfInstallments} installments not supported on this merchant account. ` +
        `Supported options: 3 or 6 installments.`
      );
    }
    throw new Error(`Splitit initiate failed (HTTP ${res.status}): ${errStr || JSON.stringify(data)}`);
  }

  const plan        = (data.InstallmentPlan ?? {}) as Record<string, unknown>;
  const planNumber  = (plan.InstallmentPlanNumber as string) ?? "";
  const checkoutUrl = (data.CheckoutUrl as string) ?? (plan.CheckoutUrl as string) ?? "";
  const status      = ((plan.InstallmentPlanStatus as Record<string,string>)?.Code) ?? "Initializing";

  if (!checkoutUrl) {
    throw new Error(`Splitit returned no CheckoutUrl. Response: ${JSON.stringify(data)}`);
  }

  return { installmentPlanNumber: planNumber, checkoutUrl, status };
}

// ─── Fee helpers ─────────────────────────────────────────────────────────────

/** Returns total amount after applying financing fee */
export function applyFinancingFee(baseAmount: number, feePercent = 10): number {
  return Math.round(baseAmount * (1 + feePercent / 100) * 100) / 100;
}

/** Returns dollar amount of the financing fee only */
export function financingFeeAmount(baseAmount: number, feePercent = 10): number {
  return Math.round(baseAmount * (feePercent / 100) * 100) / 100;
}

// ─── Installment options ──────────────────────────────────────────────────────

/**
 * Supported installment counts confirmed working in production on this account.
 * 12 installments returns error 5051 — not enabled on this merchant account.
 */
export const SPLITIT_INSTALLMENT_OPTIONS = [3, 6] as const;
export type SplititInstallments = typeof SPLITIT_INSTALLMENT_OPTIONS[number];
