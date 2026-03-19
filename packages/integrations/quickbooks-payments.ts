/**
 * QuickBooks Payments API integration
 *
 * Separate from the QB Accounting API (invoices/bills/vendors).
 * Used for ACH bank debit — collecting from COR clients 3 business days
 * before contractor payout.
 *
 * Docs: https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/payment
 * Payments API base: https://api.intuit.com/quickbooks/v4/payments/
 */

const QB_PAYMENTS_BASE = "https://api.intuit.com/quickbooks/v4/payments";

// ─── Types ────────────────────────────────────────────────────────────────────

export type QBBankAccount = {
  routingNumber: string;
  accountNumber: string;
  accountType: "PERSONAL_CHECKING" | "PERSONAL_SAVINGS" | "BUSINESS_CHECKING" | "BUSINESS_SAVINGS";
  name: string;
  phone?: string;
};

export type QBBankToken = {
  token: string;
};

export type QBChargeStatus =
  | "PENDING"
  | "AUTHORIZED"
  | "CAPTURE"
  | "SETTLED"
  | "DECLINED"
  | "REFUNDED"
  | "VOIDED"
  | "CANCELLED";

export type QBCharge = {
  id: string;
  status: QBChargeStatus;
  amount: string;
  currency: string;
  description?: string;
  created: string;
  paymentMode?: string;
  token?: string;
};

// ─── Bank Account Tokenization ────────────────────────────────────────────────

/**
 * Tokenize a bank account via QB Payments API.
 * Store the returned token — never store raw routing/account numbers.
 *
 * Called during COR client onboarding when they provide bank details.
 */
export async function tokenizeBankAccount(
  bankAccount: QBBankAccount,
  accessToken: string,
  idempotencyKey: string,
): Promise<QBBankToken> {
  const res = await fetch(`${QB_PAYMENTS_BASE}/bankaccounts/tokens`, {
    method: "POST",
    signal: AbortSignal.timeout(10000),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "Request-Id": idempotencyKey,
    },
    body: JSON.stringify({ bankAccount }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`QB Payments tokenize failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  if (!data?.token) {
    throw new Error("QB Payments returned no token");
  }

  return { token: data.token };
}

// ─── ACH Charge ───────────────────────────────────────────────────────────────

/**
 * Initiate an ACH bank debit charge against a tokenized bank account.
 *
 * idempotencyKey must be unique per attempt — use `${collectionId}-${retryCount}`
 * so retries get a fresh key but the same attempt never double-charges.
 */
export async function createAchCharge(
  opts: {
    amount: string;        // e.g. "4500.00"
    currency?: string;     // defaults to USD
    bankToken: string;     // from tokenizeBankAccount
    description: string;   // shown on bank statement
    idempotencyKey: string;
  },
  accessToken: string,
): Promise<QBCharge> {
  const res = await fetch(`${QB_PAYMENTS_BASE}/charges`, {
    method: "POST",
    signal: AbortSignal.timeout(15000),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "Request-Id": opts.idempotencyKey,
    },
    body: JSON.stringify({
      amount: opts.amount,
      currency: opts.currency ?? "USD",
      capture: true,
      token: opts.bankToken,
      description: opts.description,
      paymentMode: "ACH",
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`QB Payments charge failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  if (!data?.id) {
    throw new Error("QB Payments returned no charge id");
  }

  return {
    id: data.id,
    status: data.status ?? "PENDING",
    amount: data.amount ?? opts.amount,
    currency: data.currency ?? "USD",
    description: data.description,
    created: data.created ?? new Date().toISOString(),
    paymentMode: data.paymentMode,
    token: opts.bankToken,
  };
}

// ─── Fetch Charge Status ──────────────────────────────────────────────────────

/**
 * Fetch the current status of a charge.
 * Used in the webhook handler to confirm SETTLED or DECLINED.
 */
export async function getCharge(
  chargeId: string,
  accessToken: string,
): Promise<QBCharge> {
  const res = await fetch(`${QB_PAYMENTS_BASE}/charges/${chargeId}`, {
    signal: AbortSignal.timeout(10000),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`QB Payments getCharge failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return {
    id: data.id,
    status: data.status,
    amount: data.amount,
    currency: data.currency,
    description: data.description,
    created: data.created,
    paymentMode: data.paymentMode,
  };
}

// ─── Business Day Helpers ─────────────────────────────────────────────────────

/**
 * Subtract N business days from a date (Mon–Fri, no holiday awareness).
 * Used to compute ACH collection date = 3bd before payout.
 */
export function subtractBusinessDays(date: Date, n: number): Date {
  const d = new Date(date);
  let count = 0;
  while (count < n) {
    d.setDate(d.getDate() - 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) count++; // skip Sun(0), Sat(6)
  }
  return d;
}

/**
 * Add N business days to a date. Used for retry rescheduling.
 */
export function addBusinessDays(date: Date, n: number): Date {
  const d = new Date(date);
  let count = 0;
  while (count < n) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return d;
}

/**
 * Given a pay period string ("A-2026-03" or "B-2026-03"), return the payout date.
 *
 * Cycle A (6th–20th): payout = 30th of same month
 * Cycle B (21st–5th): payout = 15th of next month
 */
export function getPayoutDate(payPeriod: string): Date {
  const [cycle, year, month] = payPeriod.split("-");
  const y = parseInt(year!);
  const m = parseInt(month!) - 1; // JS months 0-indexed

  if (cycle === "A") {
    // Payout 30th of same month
    return new Date(y, m, 30);
  } else {
    // Cycle B: payout 15th of next month
    const nextMonth = m + 1 > 11 ? 0 : m + 1;
    const nextYear = m + 1 > 11 ? y + 1 : y;
    return new Date(nextYear, nextMonth, 15);
  }
}

/**
 * Build the pay period string for a given date.
 * 6th–20th = Cycle A, 21st–5th = Cycle B
 */
export function getPayPeriodForDate(date: Date): string {
  const day = date.getDate();
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed

  const monthStr = String(month + 1).padStart(2, "0");

  if (day >= 6 && day <= 20) {
    return `A-${year}-${monthStr}`;
  } else if (day >= 21) {
    return `B-${year}-${monthStr}`;
  } else {
    // 1st–5th = still Cycle B from previous month
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    return `B-${prevYear}-${String(prevMonth + 1).padStart(2, "0")}`;
  }
}
