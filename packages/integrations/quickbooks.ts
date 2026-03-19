/**
 * QuickBooks Online API Integration
 *
 * Handles OAuth 2.0 token management and accounting API calls
 * for recording contractor payments, creating vendors, and syncing
 * financial data with QuickBooks Online.
 *
 * OAuth flow:
 *   1. User visits /api/quickbooks/connect → redirected to Intuit
 *   2. Intuit redirects back to /api/quickbooks/callback with auth code
 *   3. We exchange code for access + refresh tokens → store in DB
 *   4. Access token refreshed automatically (1hr expiry, 101-day refresh)
 */

// ─── Configuration ──────────────────────────────────────────────────────────────

const QB_CLIENT_ID = process.env.QB_CLIENT_ID!;
const QB_CLIENT_SECRET = process.env.QB_CLIENT_SECRET!;
const QB_COMPANY_ID = process.env.QB_COMPANY_ID!;

const QB_AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
const QB_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const QB_API_BASE = "https://quickbooks.api.intuit.com/v3/company";
const QB_SCOPE = "com.intuit.quickbooks.accounting com.intuit.quickbooks.payment";

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface QBTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
}

export interface QBVendor {
  Id: string;
  DisplayName: string;
  GivenName?: string;
  FamilyName?: string;
  PrimaryEmailAddr?: { Address: string };
  BillAddr?: {
    Line1?: string;
    City?: string;
    Country?: string;
    PostalCode?: string;
  };
  CurrencyRef?: { value: string; name?: string };
  Active: boolean;
}

export interface QBBill {
  Id: string;
  DocNumber?: string;
  TxnDate: string;
  DueDate?: string;
  TotalAmt: number;
  Balance: number;
  VendorRef: { value: string; name?: string };
  CurrencyRef?: { value: string };
  Line: QBBillLine[];
  PrivateNote?: string;
}

export interface QBBillLine {
  Amount: number;
  DetailType: "AccountBasedExpenseLineDetail";
  AccountBasedExpenseLineDetail: {
    AccountRef: { value: string; name?: string };
  };
  Description?: string;
}

export interface QBBillPayment {
  Id: string;
  TotalAmt: number;
  VendorRef: { value: string; name?: string };
  PayType: "Check" | "CreditCard";
  CheckPayment?: {
    BankAccountRef: { value: string; name?: string };
  };
  Line: {
    Amount: number;
    LinkedTxn: { TxnId: string; TxnType: "Bill" }[];
  }[];
}

export interface QBAccount {
  Id: string;
  Name: string;
  AccountType: string;
  AccountSubType?: string;
  CurrentBalance?: number;
  CurrencyRef?: { value: string };
  Active: boolean;
}

export interface QBQueryResponse<T> {
  QueryResponse: {
    [key: string]: T[];
    startPosition: any;
    maxResults: any;
    totalCount?: any;
  };
}

// ─── OAuth 2.0 ──────────────────────────────────────────────────────────────────

/**
 * Generate the OAuth authorization URL for QuickBooks
 */
export function getAuthorizationUrl(redirectUri: string, state?: string): string {
  const params = new URLSearchParams({
    client_id: QB_CLIENT_ID,
    scope: QB_SCOPE,
    redirect_uri: redirectUri,
    response_type: "code",
    state: state ?? "hriq-qb-connect",
  });
  return `${QB_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange authorization code for access + refresh tokens
 */
export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
): Promise<QBTokens> {
  const basicAuth = Buffer.from(`${QB_CLIENT_ID}:${QB_CLIENT_SECRET}`).toString("base64");

  const res = await fetch(QB_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }).toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`QB token exchange failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const now = new Date();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    accessTokenExpiresAt: new Date(now.getTime() + data.expires_in * 1000),
    refreshTokenExpiresAt: new Date(now.getTime() + data.x_refresh_token_expires_in * 1000),
  };
}

/**
 * Refresh an expired access token using the refresh token
 */
export async function refreshAccessToken(refreshToken: string): Promise<QBTokens> {
  const basicAuth = Buffer.from(`${QB_CLIENT_ID}:${QB_CLIENT_SECRET}`).toString("base64");

  const res = await fetch(QB_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }).toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`QB token refresh failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const now = new Date();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token, // Always store the latest!
    accessTokenExpiresAt: new Date(now.getTime() + data.expires_in * 1000),
    refreshTokenExpiresAt: new Date(now.getTime() + data.x_refresh_token_expires_in * 1000),
  };
}

// ─── API Client ─────────────────────────────────────────────────────────────────

/**
 * Make an authenticated request to the QuickBooks API.
 * Caller must provide a valid access token.
 */
async function qbRequest<T>(
  endpoint: string,
  accessToken: string,
  options?: {
    method?: string;
    body?: any;
  },
): Promise<T> {
  const companyId = QB_COMPANY_ID;
  const url = `${QB_API_BASE}/${companyId}/${endpoint}${endpoint.includes("?") ? "&" : "?"}minorversion=75`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
  };

  const fetchOptions: RequestInit = {
    method: options?.method ?? "GET",
    headers,
  };

  if (options?.body) {
    headers["Content-Type"] = "application/json";
    fetchOptions.body = JSON.stringify(options.body);
  }

  const res = await fetch(url, fetchOptions);

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`QB API error ${res.status} [${endpoint}]: ${errText}`);
  }

  return res.json();
}

// ─── Query Helpers ──────────────────────────────────────────────────────────────

/**
 * Run a SQL-like query against QuickBooks
 */
export async function query<T>(
  sql: string,
  accessToken: string,
): Promise<T[]> {
  const encoded = encodeURIComponent(sql);
  const result = await qbRequest<any>(`query?query=${encoded}`, accessToken);
  // QB returns { QueryResponse: { Vendor: [...], ... } }
  const qr = result.QueryResponse;
  // Find the first array in QueryResponse
  for (const key of Object.keys(qr)) {
    if (Array.isArray(qr[key])) return qr[key];
  }
  return [];
}

// ─── Vendor (Contractor) Management ─────────────────────────────────────────────

/**
 * Find a vendor by display name
 */
export async function findVendor(
  displayName: string,
  accessToken: string,
): Promise<QBVendor | null> {
  const escaped = displayName.replace(/'/g, "\\'");
  const results = await query<QBVendor>(
    `SELECT * FROM Vendor WHERE DisplayName = '${escaped}'`,
    accessToken,
  );
  return results[0] ?? null;
}

/**
 * Create a vendor (contractor) in QuickBooks
 */
export async function createVendor(
  data: {
    displayName: string;
    givenName?: string;
    familyName?: string;
    email?: string;
    country?: string;
    address?: string;
    city?: string;
    currencyCode?: string;
  },
  accessToken: string,
): Promise<QBVendor> {
  const body: any = {
    DisplayName: data.displayName,
  };
  if (data.givenName) body.GivenName = data.givenName;
  if (data.familyName) body.FamilyName = data.familyName;
  if (data.email) body.PrimaryEmailAddr = { Address: data.email };
  if (data.address || data.city || data.country) {
    body.BillAddr = {
      Line1: data.address,
      City: data.city,
      Country: data.country,
    };
  }
  if (data.currencyCode) {
    body.CurrencyRef = { value: data.currencyCode };
  }

  const result = await qbRequest<{ Vendor: QBVendor }>(
    "vendor",
    accessToken,
    { method: "POST", body },
  );
  return result.Vendor;
}

/**
 * Find or create a vendor for a contractor
 */
export async function findOrCreateVendor(
  data: {
    displayName: string;
    givenName?: string;
    familyName?: string;
    email?: string;
    country?: string;
    address?: string;
    city?: string;
    currencyCode?: string;
  },
  accessToken: string,
): Promise<QBVendor> {
  const existing = await findVendor(data.displayName, accessToken);
  if (existing) return existing;
  return createVendor(data, accessToken);
}

// ─── Account Lookup ─────────────────────────────────────────────────────────────

/**
 * Find an expense account by name or type
 */
export async function findAccount(
  nameOrType: string,
  accessToken: string,
): Promise<QBAccount | null> {
  const escaped = nameOrType.replace(/'/g, "\\'");
  // Try by name first
  let results = await query<QBAccount>(
    `SELECT * FROM Account WHERE Name = '${escaped}' AND Active = true`,
    accessToken,
  );
  if (results[0]) return results[0];

  // Try by account sub-type
  results = await query<QBAccount>(
    `SELECT * FROM Account WHERE AccountSubType = '${escaped}' AND Active = true`,
    accessToken,
  );
  return results[0] ?? null;
}

/**
 * Get all expense accounts
 */
export async function getExpenseAccounts(
  accessToken: string,
): Promise<QBAccount[]> {
  return query<QBAccount>(
    "SELECT * FROM Account WHERE AccountType = 'Expense' AND Active = true",
    accessToken,
  );
}

/**
 * Get all bank accounts (for bill payments)
 */
export async function getBankAccounts(
  accessToken: string,
): Promise<QBAccount[]> {
  return query<QBAccount>(
    "SELECT * FROM Account WHERE AccountType = 'Bank' AND Active = true",
    accessToken,
  );
}

// ─── Bills (Contractor Payment Records) ─────────────────────────────────────────

/**
 * Create a Bill in QuickBooks (represents money owed to contractor)
 */
export async function createBill(
  data: {
    vendorId: string;
    vendorName?: string;
    amount: number;
    expenseAccountId: string;
    expenseAccountName?: string;
    txnDate: string; // YYYY-MM-DD
    dueDate?: string;
    description?: string;
    docNumber?: string;
    privateNote?: string;
    currencyCode?: string;
  },
  accessToken: string,
): Promise<QBBill> {
  const body: any = {
    VendorRef: { value: data.vendorId, name: data.vendorName },
    TxnDate: data.txnDate,
    Line: [
      {
        Amount: data.amount,
        DetailType: "AccountBasedExpenseLineDetail",
        AccountBasedExpenseLineDetail: {
          AccountRef: {
            value: data.expenseAccountId,
            name: data.expenseAccountName,
          },
        },
        Description: data.description,
      },
    ],
  };

  if (data.dueDate) body.DueDate = data.dueDate;
  if (data.docNumber) body.DocNumber = data.docNumber;
  if (data.privateNote) body.PrivateNote = data.privateNote;
  if (data.currencyCode) body.CurrencyRef = { value: data.currencyCode };

  const result = await qbRequest<{ Bill: QBBill }>(
    "bill",
    accessToken,
    { method: "POST", body },
  );
  return result.Bill;
}

/**
 * Create a Bill Payment (marks the bill as paid)
 */
export async function createBillPayment(
  data: {
    vendorId: string;
    vendorName?: string;
    billId: string;
    amount: number;
    bankAccountId: string;
    bankAccountName?: string;
    txnDate?: string;
    privateNote?: string;
  },
  accessToken: string,
): Promise<QBBillPayment> {
  const body: any = {
    VendorRef: { value: data.vendorId, name: data.vendorName },
    TotalAmt: data.amount,
    PayType: "Check",
    CheckPayment: {
      BankAccountRef: {
        value: data.bankAccountId,
        name: data.bankAccountName,
      },
    },
    Line: [
      {
        Amount: data.amount,
        LinkedTxn: [
          {
            TxnId: data.billId,
            TxnType: "Bill",
          },
        ],
      },
    ],
  };

  if (data.txnDate) body.TxnDate = data.txnDate;
  if (data.privateNote) body.PrivateNote = data.privateNote;

  const result = await qbRequest<{ BillPayment: QBBillPayment }>(
    "billpayment",
    accessToken,
    { method: "POST", body },
  );
  return result.BillPayment;
}

// ─── High-Level: Record a Contractor Payout ─────────────────────────────────────

/**
 * Records a completed contractor payout in QuickBooks:
 *   1. Find or create a Vendor for the contractor
 *   2. Create a Bill (the payment obligation)
 *   3. Create a BillPayment (marks it as paid)
 *
 * This results in a clean accounting trail:
 *   - Expense recorded against the right account
 *   - Vendor ledger updated
 *   - Bank account debited
 */
export async function recordContractorPayout(
  data: {
    contractorName: string;
    contractorFirstName?: string;
    contractorLastName?: string;
    contractorEmail?: string;
    contractorCountry?: string;
    amount: number;
    description: string;
    paymentDate: string; // YYYY-MM-DD
    paymentReference?: string;
    expenseAccountId: string;
    expenseAccountName?: string;
    bankAccountId: string;
    bankAccountName?: string;
    docNumber?: string;
    currencyCode?: string;
  },
  accessToken: string,
): Promise<{
  vendor: QBVendor;
  bill: QBBill;
  billPayment: QBBillPayment;
}> {
  // 1. Find or create vendor
  const vendor = await findOrCreateVendor(
    {
      displayName: data.contractorName,
      givenName: data.contractorFirstName,
      familyName: data.contractorLastName,
      email: data.contractorEmail,
      country: data.contractorCountry,
      currencyCode: data.currencyCode,
    },
    accessToken,
  );

  // 2. Create bill
  const bill = await createBill(
    {
      vendorId: vendor.Id,
      vendorName: vendor.DisplayName,
      amount: data.amount,
      expenseAccountId: data.expenseAccountId,
      expenseAccountName: data.expenseAccountName,
      txnDate: data.paymentDate,
      dueDate: data.paymentDate,
      description: data.description,
      docNumber: data.docNumber,
      privateNote: data.paymentReference
        ? `Wise transfer: ${data.paymentReference}`
        : undefined,
    },
    accessToken,
  );

  // 3. Pay the bill
  const billPayment = await createBillPayment(
    {
      vendorId: vendor.Id,
      vendorName: vendor.DisplayName,
      billId: bill.Id,
      amount: data.amount,
      bankAccountId: data.bankAccountId,
      bankAccountName: data.bankAccountName,
      txnDate: data.paymentDate,
      privateNote: data.paymentReference
        ? `Paid via Wise — ref ${data.paymentReference}`
        : "Paid via Wise",
    },
    accessToken,
  );

  return { vendor, bill, billPayment };
}

// ─── Company Info (connection test) ─────────────────────────────────────────────

export async function getCompanyInfo(
  accessToken: string,
): Promise<any> {
  const companyId = QB_COMPANY_ID;
  return qbRequest(`companyinfo/${companyId}`, accessToken);
}

// ─── Customer (Client) Management ───────────────────────────────────────────────

export interface QBCustomer {
  Id: string;
  DisplayName: string;
  CompanyName?: string;
  PrimaryEmailAddr?: { Address: string };
  BillAddr?: { Line1?: string; City?: string; Country?: string; PostalCode?: string };
  CurrencyRef?: { value: string; name?: string };
  Active: boolean;
}

/**
 * Find a QuickBooks customer by display name.
 */
export async function findCustomer(
  displayName: string,
  accessToken: string,
): Promise<QBCustomer | null> {
  const escaped = displayName.replace(/'/g, "\\'");
  const results = await query<QBCustomer>(
    `SELECT * FROM Customer WHERE DisplayName = '${escaped}'`,
    accessToken,
  );
  return results[0] ?? null;
}

/**
 * Create a QuickBooks customer for a client organization.
 */
export async function createCustomer(
  data: {
    displayName: string;
    companyName?: string;
    email?: string;
    currencyCode?: string;
  },
  accessToken: string,
): Promise<QBCustomer> {
  const body: Record<string, any> = {
    DisplayName: data.displayName,
    CompanyName: data.companyName ?? data.displayName,
  };
  if (data.email) body.PrimaryEmailAddr = { Address: data.email };
  if (data.currencyCode) body.CurrencyRef = { value: data.currencyCode };

  const resp = await qbRequest<{ Customer: any }>("customer", accessToken, { method: "POST", body });
  return resp.Customer;
}

/**
 * Find or create a QB customer by display name.
 */
export async function findOrCreateCustomer(
  data: {
    displayName: string;
    companyName?: string;
    email?: string;
    currencyCode?: string;
  },
  accessToken: string,
): Promise<QBCustomer> {
  // Try to find existing customer first
  const existing = await findCustomer(data.displayName, accessToken);
  if (existing) return existing;

  // Try to create — handle "Duplicate Name Exists" by re-searching
  try {
    return await createCustomer(data, accessToken);
  } catch (err: any) {
    if (err?.message?.includes("Duplicate Name") || err?.message?.includes("6240")) {
      console.warn(`[HRIQ] Duplicate name "${data.displayName}" — searching for existing customer or vendor collision`);

      // QB DisplayName must be unique across Customers AND Vendors.
      // LIKE is NOT supported on Customer.DisplayName — only exact match works.
      // Try by CompanyName (which does support LIKE)
      const escaped = data.displayName.replace(/'/g, "\\'");
      try {
        const byCompany = await query<QBCustomer>(
          `SELECT * FROM Customer WHERE CompanyName LIKE '%${escaped}%'`,
          accessToken,
        );
        if (byCompany[0]) {
          console.log(`[HRIQ] Found customer by CompanyName LIKE: ${byCompany[0].DisplayName} (${byCompany[0].Id})`);
          return byCompany[0];
        }
      } catch { /* LIKE query failed, continue */ }

      // Check if the name collides with a Vendor
      try {
        const vendors = await query<any>(
          `SELECT Id,DisplayName FROM Vendor WHERE DisplayName = '${escaped}'`,
          accessToken,
        );
        if (vendors[0]) {
          console.warn(`[HRIQ] Name collision with Vendor "${vendors[0].DisplayName}" (${vendors[0].Id}) — appending "(Client)" suffix`);
          // Create with a unique suffix to avoid vendor name collision
          return await createCustomer(
            { ...data, displayName: `${data.displayName} (Client)` },
            accessToken,
          );
        }
      } catch { /* vendor check failed, continue */ }

      // Last resort: try creating with a timestamp suffix
      console.warn(`[HRIQ] Could not resolve duplicate — creating with unique suffix`);
      try {
        return await createCustomer(
          { ...data, displayName: `${data.displayName} - ${new Date().toISOString().split("T")[0]}` },
          accessToken,
        );
      } catch { /* fall through to original error */ }
    }
    throw err;
  }
}

// ─── Client Invoicing ───────────────────────────────────────────────────────────

export interface QBInvoice {
  Id: string;
  DocNumber?: string;
  TxnDate: string;
  DueDate?: string;
  TotalAmt: number;
  Balance: number;
  CustomerRef: { value: string; name?: string };
  CurrencyRef?: { value: string };
  Line: QBInvoiceLine[];
  PrivateNote?: string;
  EmailStatus?: string;
}

export interface QBInvoiceLine {
  Amount: number;
  DetailType: "SalesItemLineDetail";
  SalesItemLineDetail: {
    ItemRef: { value: string; name?: string };
    Qty?: number;
    UnitPrice?: number;
  };
  Description?: string;
}

/**
 * Find the default "Services" or "Contractor Services" income item.
 * Falls back to first Service-type item.
 */
export async function findServiceItem(
  accessToken: string,
): Promise<{ Id: string; Name: string } | null> {
  for (const name of ["Contractor Services", "Services", "Consulting", "Service"]) {
    const escaped = name.replace(/'/g, "\\'");
    const results = await query<any>(
      `SELECT Id, Name FROM Item WHERE Name = '${escaped}' AND Type = 'Service'`,
      accessToken,
    );
    const item = results[0];
    if (item) return { Id: item.Id, Name: item.Name };
  }
  // Fallback: first service item
  const results = await query<any>(
    "SELECT Id, Name FROM Item WHERE Type = 'Service' MAXRESULTS 1",
    accessToken,
  );
  const item = results[0];
  return item ? { Id: item.Id, Name: item.Name } : null;
}

/**
 * Create a QuickBooks Invoice for a client organization.
 *
 * Each line item represents a contractor's hours/payment for the period.
 */
export async function createInvoice(
  data: {
    customerId: string;
    invoiceNumber?: string;
    invoiceDate?: string;
    dueDate?: string;
    lineItems: {
      description: string;
      amount: number;
      quantity?: number;
      unitPrice?: number;
    }[];
    rlFeeDescription?: string;
    rlFeeAmount?: number;
    memo?: string;
    currencyCode?: string;
    billEmail?: string;
    allowOnlinePayment?: boolean;
  },
  accessToken: string,
): Promise<QBInvoice> {
  // Find a service item for the line items
  const serviceItem = await findServiceItem(accessToken);
  const serviceItemRef = serviceItem
    ? { value: serviceItem.Id, name: serviceItem.Name }
    : { value: "1", name: "Services" };

  const lines: any[] = data.lineItems.map((li) => ({
    Amount: li.amount,
    DetailType: "SalesItemLineDetail",
    SalesItemLineDetail: {
      ItemRef: serviceItemRef,
      Qty: li.quantity ?? 1,
      UnitPrice: li.unitPrice ?? li.amount,
    },
    Description: li.description,
  }));

  // Add RL service fee as a separate line item
  if (data.rlFeeAmount && data.rlFeeAmount > 0) {
    lines.push({
      Amount: data.rlFeeAmount,
      DetailType: "SalesItemLineDetail",
      SalesItemLineDetail: {
        ItemRef: serviceItemRef,
        Qty: 1,
        UnitPrice: data.rlFeeAmount,
      },
      Description: data.rlFeeDescription ?? "Remote Leverage — Management Fee",
    });
  }

  const body: Record<string, any> = {
    CustomerRef: { value: data.customerId },
    Line: lines,
    AllowOnlineCreditCardPayment: data.allowOnlinePayment !== false,
    AllowOnlineACHPayment: data.allowOnlinePayment !== false,
  };
  if (data.billEmail) body.BillEmail = { Address: data.billEmail };
  if (data.invoiceNumber) body.DocNumber = data.invoiceNumber;
  if (data.invoiceDate) body.TxnDate = data.invoiceDate;
  if (data.dueDate) body.DueDate = data.dueDate;
  if (data.memo) body.PrivateNote = data.memo;
  if (data.currencyCode) body.CurrencyRef = { value: data.currencyCode };

  const resp = await qbRequest<{ Invoice: any }>("invoice", accessToken, { method: "POST", body });
  return resp.Invoice;
}

/**
 * Get the payment link for a QuickBooks invoice.
 * Uses `?include=invoiceLink` query parameter.
 * Requires: invoice has a BillEmail set and Accept Credit Cards / ACH enabled in QB settings.
 */
export async function getInvoicePaymentLink(
  invoiceId: string,
  accessToken: string,
): Promise<string | null> {
  const companyId = QB_COMPANY_ID;
  const url = `${QB_API_BASE}/${companyId}/invoice/${invoiceId}?minorversion=75&include=invoiceLink`;

  // Retry up to 3 times with delay — QB sometimes needs a moment to generate the link
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      console.warn(`[HRIQ] getInvoicePaymentLink attempt ${attempt} failed: HTTP ${res.status}`);
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 1500 * attempt));
        continue;
      }
      return null;
    }

    const data = await res.json();
    const link = data?.Invoice?.InvoiceLink ?? null;

    if (link) {
      console.log(`[HRIQ] Got QB payment link on attempt ${attempt}: ${link}`);
      return link;
    }

    // Log what we got for debugging
    console.warn(
      `[HRIQ] getInvoicePaymentLink attempt ${attempt}: InvoiceLink is null. ` +
      `AllowOnlineCreditCardPayment=${data?.Invoice?.AllowOnlineCreditCardPayment}, ` +
      `AllowOnlineACHPayment=${data?.Invoice?.AllowOnlineACHPayment}, ` +
      `BillEmail=${JSON.stringify(data?.Invoice?.BillEmail)}, ` +
      `Balance=${data?.Invoice?.Balance}`
    );

    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }

  // If no InvoiceLink after retries, construct the share link as fallback
  // QB share link format: https://app.qbo.intuit.com/app/customerportal?txnId=<invoiceId>&token=<companyId>
  // Or use the customer-facing invoice viewer
  const viewerLink = `https://app.qbo.intuit.com/app/invoices/${invoiceId}`;
  console.warn(`[HRIQ] No InvoiceLink after 3 attempts — QB Payments may not be enabled. Viewer link: ${viewerLink}`);
  return null;
}

/**
 * Send a QuickBooks invoice via email (triggers QB's built-in email with payment link).
 */
export async function sendInvoiceEmail(
  invoiceId: string,
  email: string,
  accessToken: string,
): Promise<boolean> {
  const companyId = QB_COMPANY_ID;
  const url = `${QB_API_BASE}/${companyId}/invoice/${invoiceId}/send?sendTo=${encodeURIComponent(email)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });

  return res.ok;
}
