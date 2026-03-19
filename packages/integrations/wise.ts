/**
 * Wise (TransferWise) API Integration for HRIQ
 *
 * Handles international contractor payouts via Wise Business account.
 * Flow: Quote → Recipient → Transfer → Fund from Balance
 *
 * Business Profile ID: 11727753
 * API Docs: https://docs.wise.com/api-reference
 */

const WISE_API_BASE = "https://api.wise.com";
const WISE_BUSINESS_PROFILE_ID = 11727753;

/**
 * When true, the payout flow will create quotes and transfers but
 * skip the actual funding step (no money moves).
 * Set WISE_DRY_RUN=true in env to enable.
 */
function isDryRun(): boolean {
  return process.env.WISE_DRY_RUN === "true";
}

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface WiseProfile {
  id: number;
  type: "personal" | "business";
  details: {
    name?: string;
    firstName?: string;
    lastName?: string;
  };
}

export interface WiseBalance {
  id: number;
  currency: string;
  amount: { value: number; currency: string };
  reservedAmount: { value: number; currency: string };
  cashAmount: { value: number; currency: string };
  totalWorth: { value: number; currency: string };
  type: string;
  investmentState: string;
}

export interface WiseRate {
  rate: number;
  source: string;
  target: string;
  time: string;
}

export interface WiseQuote {
  id: string;
  sourceCurrency: string;
  targetCurrency: string;
  sourceAmount: number;
  targetAmount: number;
  rate: number;
  createdTime: string;
  expirationTime: string;
  status: string;
  paymentOptions: WisePaymentOption[];
}

export interface WisePaymentOption {
  payIn: string;
  payOut: string;
  disabled: boolean;
  estimatedDelivery: string;
  sourceAmount: number;
  targetAmount: number;
  fee: { total: number; currency: string };
  price: {
    total: { type: string; value: { amount: number; currency: string } };
  };
}

export interface WiseRecipient {
  id: number;
  profile: number;
  accountHolderName: string;
  currency: string;
  country: string;
  type: string;
  details: Record<string, unknown>;
  active: boolean;
}

export interface WiseTransfer {
  id: number;
  user: number;
  targetAccount: number;
  sourceAccount: number;
  quote: number;
  quoteUuid: string;
  status: string;
  reference: string;
  rate: number;
  created: string;
  sourceCurrency: string;
  sourceValue: number;
  targetCurrency: string;
  targetValue: number;
  customerTransactionId: string;
  hasActiveIssues: boolean;
}

export interface WiseTransferFunding {
  type: string;
  status: string;
  errorCode: string | null;
}

export interface WiseDeliveryEstimate {
  estimatedDeliveryDate: string;
}

// Recipient creation types for different countries
export interface WiseRecipientCLP {
  currency: "CLP";
  type: "chile";
  profile: number;
  accountHolderName: string;
  details: {
    bankCode: string;      // Chilean bank code
    accountNumber: string;
    accountType: string;   // CHECKING or SAVINGS
    rut: string;           // Chilean tax ID
    email: string;
  };
}

export interface WiseRecipientCOP {
  currency: "COP";
  type: "colombia";
  profile: number;
  accountHolderName: string;
  details: {
    bankCode: string;
    accountNumber: string;
    accountType: string;
    phoneNumber: string;
    idType: string;        // CC (Cedula), CE, PASSPORT, etc.
    idNumber: string;
    email: string;
  };
}

export interface WiseRecipientPHP {
  currency: "PHP";
  type: "philippines";
  profile: number;
  accountHolderName: string;
  details: {
    bankCode: string;
    accountNumber: string;
    email: string;
  };
  address?: {
    firstLine: string;
    city: string;
    countryCode: string;
    postCode: string;
  };
}

export interface WiseRecipientUSD {
  currency: "USD";
  type: "aba";
  profile: number;
  accountHolderName: string;
  details: {
    abartn: string;         // ABA routing number
    accountNumber: string;
    accountType: string;    // CHECKING or SAVINGS
    email: string;
  };
  address: {
    firstLine: string;
    city: string;
    countryCode: string;
    stateCode: string;
    postCode: string;
  };
}

// ─── API Client ─────────────────────────────────────────────────────────────────

function getWiseToken(): string {
  const token = process.env.WISE_API_TOKEN;
  if (!token) throw new Error("[Wise] WISE_API_TOKEN environment variable is not set");
  return token;
}

async function wiseRequest<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    timeout?: number;
  } = {},
): Promise<T> {
  const { method = "GET", body, timeout = 30000 } = options;
  const token = getWiseToken();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(`${WISE_API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const text = await res.text();

    if (!res.ok) {
      let errorDetail: string;
      try {
        const err = JSON.parse(text);
        errorDetail = err.message || err.error || text;
      } catch {
        errorDetail = text;
      }
      throw new Error(`[Wise] ${method} ${path} → ${res.status}: ${errorDetail}`);
    }

    return text ? JSON.parse(text) : ({} as T);
  } finally {
    clearTimeout(timer);
  }
}

// ─── Profile & Balance ──────────────────────────────────────────────────────────

/** Get all profiles (personal + business) */
export async function getProfiles(): Promise<WiseProfile[]> {
  return wiseRequest<WiseProfile[]>("/v1/profiles");
}

/** Get business profile ID */
export function getBusinessProfileId(): number {
  return WISE_BUSINESS_PROFILE_ID;
}

/** Get all balances for the business profile */
export async function getBalances(): Promise<WiseBalance[]> {
  return wiseRequest<WiseBalance[]>(
    `/v4/profiles/${WISE_BUSINESS_PROFILE_ID}/balances?types=STANDARD`,
  );
}

/** Get USD balance specifically */
export async function getUsdBalance(): Promise<WiseBalance | null> {
  const balances = await getBalances();
  return balances.find((b) => b.currency === "USD") ?? null;
}

// ─── Exchange Rates ─────────────────────────────────────────────────────────────

/** Get current exchange rate */
export async function getRate(
  source: string,
  target: string,
): Promise<WiseRate> {
  const rates = await wiseRequest<WiseRate[]>(
    `/v1/rates?source=${source}&target=${target}`,
  );
  if (!rates.length) throw new Error(`[Wise] No rate found for ${source}→${target}`);
  return rates[0];
}

/** Get multiple exchange rates */
export async function getRates(
  pairs: { source: string; target: string }[],
): Promise<WiseRate[]> {
  const results = await Promise.all(
    pairs.map((p) => getRate(p.source, p.target)),
  );
  return results;
}

// ─── Quotes ─────────────────────────────────────────────────────────────────────

/**
 * Create an authenticated quote.
 * Locks the mid-market rate for ~30 minutes.
 *
 * Set sourceAmount OR targetAmount, never both.
 */
export async function createQuote(params: {
  sourceCurrency: string;
  targetCurrency: string;
  sourceAmount?: number;
  targetAmount?: number;
  targetAccount?: number;
  payOut?: string;
}): Promise<WiseQuote> {
  if (params.sourceAmount && params.targetAmount) {
    throw new Error("[Wise] Set sourceAmount OR targetAmount, not both");
  }

  return wiseRequest<WiseQuote>(
    `/v3/profiles/${WISE_BUSINESS_PROFILE_ID}/quotes`,
    {
      method: "POST",
      body: {
        sourceCurrency: params.sourceCurrency,
        targetCurrency: params.targetCurrency,
        sourceAmount: params.sourceAmount ?? null,
        targetAmount: params.targetAmount ?? null,
        targetAccount: params.targetAccount ?? null,
        payOut: params.payOut ?? null,
        preferredPayIn: "BALANCE",
      },
    },
  );
}

/** Update a quote with a target recipient (for accurate fees) */
export async function updateQuoteRecipient(
  quoteId: string,
  recipientId: number,
): Promise<WiseQuote> {
  return wiseRequest<WiseQuote>(
    `/v3/profiles/${WISE_BUSINESS_PROFILE_ID}/quotes/${quoteId}`,
    {
      method: "PATCH",
      body: { targetAccount: recipientId },
    },
  );
}

/** Get an existing quote by ID */
export async function getQuote(quoteId: string): Promise<WiseQuote> {
  return wiseRequest<WiseQuote>(
    `/v3/profiles/${WISE_BUSINESS_PROFILE_ID}/quotes/${quoteId}`,
  );
}

/**
 * Accept (commit) a quote by patching it to include paymentMetadata.
 * Required when the Wise business account has approval rules — moves
 * the quote status from PENDING to ACCEPTED before transfer creation.
 */
export async function acceptQuote(
  quoteId: string,
  recipientId: number,
): Promise<WiseQuote> {
  return wiseRequest<WiseQuote>(
    `/v3/profiles/${WISE_BUSINESS_PROFILE_ID}/quotes/${quoteId}`,
    {
      method: "PATCH",
      body: {
        targetAccount: recipientId,
        paymentMetadata: { transferNature: "MOVING_MONEY_BETWEEN_OWN_ACCOUNTS" },
      },
    },
  );
}

// ─── Recipients ─────────────────────────────────────────────────────────────────

/** List all recipients for the business profile */
export async function listRecipients(currency?: string): Promise<WiseRecipient[]> {
  let path = `/v1/accounts?profile=${WISE_BUSINESS_PROFILE_ID}`;
  if (currency) path += `&currency=${currency}`;
  return wiseRequest<WiseRecipient[]>(path);
}

/** Get a single recipient by ID */
export async function getRecipient(recipientId: number): Promise<WiseRecipient> {
  return wiseRequest<WiseRecipient>(`/v1/accounts/${recipientId}`);
}

/**
 * Get account requirements for a currency route.
 * Returns dynamic form fields needed to create a recipient.
 */
export async function getAccountRequirements(
  sourceCurrency: string,
  targetCurrency: string,
  sourceAmount: number,
): Promise<unknown[]> {
  return wiseRequest<unknown[]>(
    `/v1/account-requirements?source=${sourceCurrency}&target=${targetCurrency}&sourceAmount=${sourceAmount}`,
  );
}

/**
 * Create a recipient account.
 * The shape of `details` varies by target currency. See types above.
 */
export async function createRecipient(data: {
  currency: string;
  type: string;
  profile?: number;
  accountHolderName: string;
  ownedByCustomer?: boolean;
  details: Record<string, unknown>;
  address?: Record<string, unknown>;
}): Promise<WiseRecipient> {
  // Wise API expects address nested inside details, not at the top level
  const details: Record<string, unknown> = { legalType: "PRIVATE", ...data.details };
  if (data.address) {
    details.address = data.address;
  }
  const { address: _, ...rest } = data;
  return wiseRequest<WiseRecipient>("/v1/accounts", {
    method: "POST",
    body: {
      ...rest,
      details,
      profile: data.profile ?? WISE_BUSINESS_PROFILE_ID,
      ownedByCustomer: data.ownedByCustomer ?? false,
    },
  });
}

/** Delete (deactivate) a recipient */
export async function deleteRecipient(recipientId: number): Promise<void> {
  await wiseRequest<void>(`/v1/accounts/${recipientId}`, { method: "DELETE" });
}

/**
 * Create a Wise recipient via email/Wise tag.
 * No bank details needed — money goes to their Wise account.
 */
export async function createWiseEmailRecipient(data: {
  accountHolderName: string;
  email: string;
  currency?: string;
}): Promise<WiseRecipient> {
  return createRecipient({
    currency: data.currency ?? "USD",
    type: "email",
    accountHolderName: data.accountHolderName,
    details: {
      email: data.email,
    },
  });
}

// ─── Transfers ──────────────────────────────────────────────────────────────────

/**
 * Create a transfer.
 * Requires a valid quoteUuid and targetAccount (recipientId).
 */
export async function createTransfer(params: {
  targetAccount: number;
  quoteUuid: string;
  customerTransactionId: string;
  reference?: string;
  transferPurpose?: string;
  sourceOfFunds?: string;
}): Promise<WiseTransfer> {
  return wiseRequest<WiseTransfer>("/v1/transfers", {
    method: "POST",
    body: {
      targetAccount: params.targetAccount,
      quoteUuid: params.quoteUuid,
      customerTransactionId: params.customerTransactionId,
      details: {
        reference: params.reference ?? "HRIQ Pay",
        transferPurpose:
          params.transferPurpose ??
          "verification.transfers.purpose.pay.bills",
        sourceOfFunds:
          params.sourceOfFunds ??
          "verification.source.of.funds.other",
      },
    },
  });
}

/**
 * Fund a transfer from the Wise balance.
 * This triggers actual money movement.
 * In dry-run mode, returns a simulated success response.
 */
export async function fundTransfer(
  transferId: number,
): Promise<WiseTransferFunding> {
  if (isDryRun()) {
    console.log(`[Wise DRY RUN] Skipping funding for transfer ${transferId} — no money moved`);
    return {
      type: "BALANCE",
      status: "COMPLETED",
      errorCode: null,
    };
  }
  return wiseRequest<WiseTransferFunding>(
    `/v3/profiles/${WISE_BUSINESS_PROFILE_ID}/transfers/${transferId}/payments`,
    {
      method: "POST",
      body: { type: "BALANCE" },
    },
  );
}

/** Get transfer by ID */
export async function getTransfer(transferId: number): Promise<WiseTransfer> {
  return wiseRequest<WiseTransfer>(`/v1/transfers/${transferId}`);
}

/** List transfers for the business profile */
export async function listTransfers(params?: {
  limit?: number;
  offset?: number;
  status?: string;
  createdDateStart?: string;
  createdDateEnd?: string;
}): Promise<WiseTransfer[]> {
  const qs = new URLSearchParams();
  qs.set("profile", String(WISE_BUSINESS_PROFILE_ID));
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));
  if (params?.status) qs.set("status", params.status);
  if (params?.createdDateStart) qs.set("createdDateStart", params.createdDateStart);
  if (params?.createdDateEnd) qs.set("createdDateEnd", params.createdDateEnd);

  return wiseRequest<WiseTransfer[]>(`/v1/transfers?${qs.toString()}`);
}

/** Get delivery estimate for a transfer */
export async function getDeliveryEstimate(
  transferId: number,
): Promise<WiseDeliveryEstimate> {
  return wiseRequest<WiseDeliveryEstimate>(
    `/v1/delivery-estimates/${transferId}`,
  );
}

/** Cancel a transfer (only if status allows) */
export async function cancelTransfer(transferId: number): Promise<WiseTransfer> {
  return wiseRequest<WiseTransfer>(
    `/v1/transfers/${transferId}/cancel`,
    { method: "PUT" },
  );
}

// ─── High-Level Payout Helpers ──────────────────────────────────────────────────

/**
 * Full payout flow: Quote → Transfer → Fund
 *
 * Assumes recipient already exists in Wise.
 * Returns the funded transfer with all details.
 *
 * In dry-run mode (WISE_DRY_RUN=true), creates a real quote and transfer
 * but skips the funding step — no money is debited.
 */
export async function executeContractorPayout(params: {
  recipientId: number;
  sourceCurrency: string;
  targetCurrency: string;
  sourceAmount?: number;
  targetAmount?: number;
  reference: string;
  idempotencyKey: string;
}): Promise<{
  quote: WiseQuote;
  transfer: WiseTransfer;
  funding: WiseTransferFunding;
  dryRun: boolean;
}> {
  // 1. Create & lock quote (always real — no cost)
  const quote = await createQuote({
    sourceCurrency: params.sourceCurrency,
    targetCurrency: params.targetCurrency,
    sourceAmount: params.sourceAmount,
    targetAmount: params.targetAmount,
    targetAccount: params.recipientId,
  });

  if (isDryRun()) {
    // In dry-run mode, simulate transfer + funding using quote data.
    // Real transfer creation requires business approval, so we skip it.
    const balanceOption = quote.paymentOptions?.find(
      (o: any) => o.payIn === "BALANCE",
    );
    const simulatedTransfer: WiseTransfer = {
      id: Math.floor(Math.random() * 900000000) + 100000000,
      user: 0,
      targetAccount: params.recipientId,
      sourceAccount: 0,
      quote: 0,
      quoteUuid: quote.id,
      status: "dry_run",
      reference: params.reference,
      rate: quote.rate,
      created: new Date().toISOString(),
      sourceCurrency: params.sourceCurrency,
      sourceValue: balanceOption?.sourceAmount ?? params.sourceAmount ?? quote.sourceAmount ?? 0,
      targetCurrency: params.targetCurrency,
      targetValue: balanceOption?.targetAmount ?? params.targetAmount ?? quote.targetAmount ?? 0,
      customerTransactionId: params.idempotencyKey,
      hasActiveIssues: false,
    };
    const simulatedFunding: WiseTransferFunding = {
      type: "BALANCE",
      status: "COMPLETED",
      errorCode: null,
    };
    console.log(`[Wise DRY RUN] Simulated transfer from quote ${quote.id}. No real transfer created.`);
    return { quote, transfer: simulatedTransfer, funding: simulatedFunding, dryRun: true };
  }

  // 2. Accept the quote (moves status PENDING → ACCEPTED, required for approval-enabled accounts)
  await acceptQuote(quote.id, params.recipientId);

  // 3. Create transfer
  const transfer = await createTransfer({
    targetAccount: params.recipientId,
    quoteUuid: quote.id,
    customerTransactionId: params.idempotencyKey,
    reference: params.reference,
  });

  // 4. Fund from balance
  const funding = await fundTransfer(transfer.id);

  return { quote, transfer, funding, dryRun: false };
}

/**
 * Get a fee preview for a payout without executing it.
 * Useful for showing contractors estimated delivery + fees before confirming.
 */
export async function getPayoutPreview(params: {
  sourceCurrency: string;
  targetCurrency: string;
  sourceAmount?: number;
  targetAmount?: number;
  recipientId?: number;
}): Promise<{
  rate: number;
  sourceAmount: number;
  targetAmount: number;
  fee: number;
  feeCurrency: string;
  estimatedDelivery: string | null;
}> {
  const quote = await createQuote({
    sourceCurrency: params.sourceCurrency,
    targetCurrency: params.targetCurrency,
    sourceAmount: params.sourceAmount,
    targetAmount: params.targetAmount,
    targetAccount: params.recipientId,
  });

  // Find the BALANCE pay-in option
  const balanceOption = quote.paymentOptions.find(
    (o) => o.payIn === "BALANCE" && !o.disabled,
  );
  const bestOption = balanceOption ?? quote.paymentOptions.find((o) => !o.disabled);

  return {
    rate: quote.rate,
    sourceAmount: bestOption?.sourceAmount ?? quote.sourceAmount,
    targetAmount: bestOption?.targetAmount ?? quote.targetAmount,
    fee: bestOption?.fee?.total ?? 0,
    feeCurrency: bestOption?.fee?.currency ?? quote.sourceCurrency,
    estimatedDelivery: bestOption?.estimatedDelivery ?? null,
  };
}

// ─── Country-Specific Recipient Helpers ─────────────────────────────────────────

/** Create a Chilean (CLP) recipient */
export async function createChileanRecipient(data: {
  accountHolderName: string;
  bankCode: string;
  accountNumber: string;
  accountType: "CHECKING" | "SAVINGS" | "CUENTA_VISTA" | "CUENTA_RUT";
  rut: string;
  phoneNumber: string;
  email: string;
  address: {
    firstLine: string;
    city: string;
    postCode: string;
  };
}): Promise<WiseRecipient> {
  return createRecipient({
    currency: "CLP",
    type: "chile",
    accountHolderName: data.accountHolderName,
    details: {
      bankCode: data.bankCode,
      accountNumber: data.accountNumber,
      accountType: data.accountType,
      rut: data.rut,
      phoneNumber: data.phoneNumber,
      email: data.email,
    },
    address: {
      ...data.address,
      countryCode: "CL",
    },
  });
}

/** Create a Colombian (COP) recipient */
export async function createColombianRecipient(data: {
  accountHolderName: string;
  bankCode: string;
  accountNumber: string;
  accountType: "CHECKING" | "SAVINGS";
  phoneNumber: string;
  idType: string;
  idNumber: string;
  email: string;
  address: {
    firstLine: string;
    city: string;
    postCode: string;
  };
}): Promise<WiseRecipient> {
  return createRecipient({
    currency: "COP",
    type: "colombia",
    accountHolderName: data.accountHolderName,
    details: {
      bankCode: data.bankCode,
      accountNumber: data.accountNumber,
      accountType: data.accountType,
      phoneNumber: data.phoneNumber,
      idType: data.idType,
      idNumber: data.idNumber,
      email: data.email,
    },
    address: {
      ...data.address,
      countryCode: "CO",
    },
  });
}

/** Create a Philippine (PHP) recipient */
export async function createPhilippineRecipient(data: {
  accountHolderName: string;
  bankCode: string;
  accountNumber: string;
  email: string;
  address: {
    firstLine: string;
    city: string;
    postCode: string;
  };
}): Promise<WiseRecipient> {
  return createRecipient({
    currency: "PHP",
    type: "philippines",
    accountHolderName: data.accountHolderName,
    details: {
      bankCode: data.bankCode,
      accountNumber: data.accountNumber,
      email: data.email,
    },
    address: {
      ...data.address,
      countryCode: "PH",
    },
  });
}

/** Create a US (USD) recipient */
export async function createUSRecipient(data: {
  accountHolderName: string;
  routingNumber: string;
  accountNumber: string;
  accountType: "CHECKING" | "SAVINGS";
  email: string;
  address: {
    firstLine: string;
    city: string;
    stateCode: string;
    postCode: string;
  };
}): Promise<WiseRecipient> {
  return createRecipient({
    currency: "USD",
    type: "aba",
    accountHolderName: data.accountHolderName,
    details: {
      abartn: data.routingNumber,
      accountNumber: data.accountNumber,
      accountType: data.accountType,
      email: data.email,
    },
    address: {
      firstLine: data.address.firstLine,
      city: data.address.city,
      state: data.address.stateCode,
      postCode: data.address.postCode,
      countryCode: "US",
    },
  });
}

// ─── Bank Detail Validation ─────────────────────────────────────────────────────

export interface WiseAccountRequirement {
  type: string;
  fields: {
    group: {
      key: string;
      name: string;
      type: string;
      required: boolean;
      refreshRequirementsOnChange?: boolean;
      displayFormat?: string;
      example?: string;
      minLength?: number;
      maxLength?: number;
      validationRegexp?: string;
      valuesAllowed?: { key: string; name: string }[] | { regex: string };
    }[];
  }[];
}

export interface BankValidationResult {
  valid: boolean;
  recipientId?: number;
  recipientCurrency?: string;
  recipientType?: string;
  errors: { field: string; message: string; code?: string }[];
}

/**
 * Validate a contractor's bank details by attempting to create a Wise recipient.
 *
 * If the details are valid:
 *   - Creates the recipient in Wise (ready for payments)
 *   - Returns { valid: true, recipientId, ... }
 *
 * If invalid:
 *   - Returns { valid: false, errors: [...] } with specific field errors
 *   - No recipient is created
 *
 * This is the gold standard for validation — Wise's own systems check
 * bank codes, account number formats, RUT/ID numbers, etc.
 */
export async function validateBankDetails(params: {
  currency: string;
  type: string;
  accountHolderName: string;
  details: Record<string, unknown>;
  address?: {
    country?: string;
    city?: string;
    firstLine?: string;
    state?: string;
    postCode?: string;
  };
}): Promise<BankValidationResult> {
  try {
    const recipientData: any = {
      currency: params.currency,
      type: params.type,
      profile: WISE_BUSINESS_PROFILE_ID,
      accountHolderName: params.accountHolderName,
      ownedByCustomer: false,
      details: {
        legalType: "PRIVATE",
        ...params.details,
      },
    };

    // Attach address inside details (Wise requires it there for most currencies)
    if (params.address) {
      recipientData.details.address = {
        country: params.address.country,
        city: params.address.city,
        firstLine: params.address.firstLine,
        ...(params.address.state ? { state: params.address.state } : {}),
        postCode: params.address.postCode,
      };
    }

    const res = await fetch(`${WISE_API_BASE}/v1/accounts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getWiseToken()}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(recipientData),
    });

    const body = await res.json();

    if (res.ok && body.id) {
      return {
        valid: true,
        recipientId: body.id,
        recipientCurrency: body.currency,
        recipientType: body.type,
        errors: [],
      };
    }

    // Parse validation errors from Wise
    const errors: BankValidationResult["errors"] = [];
    if (body.errors && Array.isArray(body.errors)) {
      for (const e of body.errors) {
        errors.push({
          field: e.path ?? e.field ?? e.arguments?.[0] ?? "unknown",
          message: e.message ?? "Validation failed",
          code: e.code,
        });
      }
    } else if (body.error) {
      errors.push({
        field: "general",
        message: typeof body.error === "string" ? body.error : JSON.stringify(body.error),
      });
    }

    return { valid: false, errors };
  } catch (err: any) {
    return {
      valid: false,
      errors: [{ field: "general", message: err.message ?? "Validation request failed" }],
    };
  }
}
