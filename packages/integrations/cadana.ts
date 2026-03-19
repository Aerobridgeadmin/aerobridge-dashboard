/**
 * Cadana API Integration for HRIQ
 *
 * Handles global contractor payroll via Cadana's Workforce Management platform.
 * Supports worker onboarding, payroll creation, and payment processing for
 * contractors in 100+ countries with local payment rails.
 *
 * Flow: Onboard Person → Set Payment Info → Create Payroll → Save → Approve
 *
 * Business: Remote Leverage (293753eb-3bb5-4c66-8741-9285f89e7a38)
 * API Docs: https://docs.cadanapay.com
 * Dashboard: https://app.cadanapay.com
 */

const CADANA_BASE = "https://api.cadanapay.com/v1";

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface CadanaPhoneNumber {
  countryCode: string;
  number: string;
}

export interface CadanaAddress {
  line1: string;
  line2?: string;
  city: string;
  postalCode: string;
  state: string;
  countryCode: string; // ISO 3166-1 alpha-2
}

export interface CadanaJobInfo {
  employeeNumber?: string;
  title: string;
  titleId?: string;
  departmentId?: string;
  department?: string;
  startDate?: string; // YYYY-MM-DD
  description?: string;
  managerId?: string;
}

export interface CadanaCompInfo {
  frequency: "hourly" | "monthly" | "annually" | "weekly" | "biweekly" | "semimonthly";
  type: "net" | "gross";
  salary: {
    amount: number; // in cents (900 = $9.00)
    currency: string;
  };
}

export interface CadanaPerson {
  id: string;
  status: "Active" | "Former" | "On Leave" | "Pending";
  type: "CONTRACTOR" | "EMPLOYEE";
  firstName: string;
  lastName: string;
  businessName?: string;
  contractorType?: "individual" | "business";
  email: string;
  phoneNumber?: CadanaPhoneNumber;
  address?: CadanaAddress;
  jobInfo?: CadanaJobInfo;
  compInfo?: CadanaCompInfo;
  offboardingDetails?: {
    exitDate?: string;
    reason?: string;
    includeInRegularPayroll?: boolean;
  };
}

export interface CadanaPaymentInfo {
  preferredMethod: "bank" | "wallet" | "momo";
  bank?: {
    accountName: string;
    accountNumber: string;
    bankCode: string;
    bankName: string;
    branchName?: string;
  };
  wallet?: {
    type: string;
    identifier: string;
    currency: string;
  };
  momo?: {
    accountName: string;
    provider: string;
    providerCode: string;
    phoneNumber: CadanaPhoneNumber;
  };
}

export interface CadanaPayrollEntry {
  personId: string;
  salary: {
    amount: number; // cents
    currency: string;
  };
  bonus?: {
    amount: number;
    currency: string;
  };
  commission?: {
    amount: number;
    currency: string;
  };
  reimbursement?: {
    amount: number;
    currency: string;
  };
}

export interface CadanaPayroll {
  payrollId: string;
  status: "Created" | "Draft" | "Pending Submission" | "Saved" | "Scheduled" | "Awaiting Funds" | "Processing" | "Completed" | "Cancelled" | "Failed" | "Rejected";
  workerType: "CONTRACTOR" | "EMPLOYEE" | "Contractor" | "Employee";
  type: "REGULAR" | "ONE_OFF" | "SUPPLEMENTAL" | "Regular" | "One_off" | "Supplemental";
  payrollDate: string;
  invoiceId?: string;
  debit: { amount: number; currency: string };
  gross: { amount: number; currency: string };
  net: { amount: number; currency: string };
  tax: { amount: number; currency: string };
  pension: { amount: number; currency: string };
  payPeriod?: { fromDate: string; toDate: string };
  entries?: CadanaPayrollEntry[];
}

export interface CadanaBalance {
  id: string;
  currency: string;
  balance: number; // cents
  available: number; // cents
  processing: number; // cents
}

export interface CadanaBusiness {
  id: string;
  tenantKey: string;
  country: string;
  currency: string;
  name: string;
  admin: { name: string; email: string };
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  address: CadanaAddress;
}

export interface CadanaPaginatedResponse<T> {
  data: T[];
  meta?: {
    currentPage: number;
    limit: number;
    itemCount: number;
    skipped: number;
    pages: number;
  };
}

// ─── Auth ────────────────────────────────────────────────────────────────────────

function getToken(): string {
  const token = process.env.CADANA_API_KEY ?? process.env.CADANA_API_TOKEN ?? process.env.CADANA_TOKEN;
  if (!token) throw new Error("CADANA_API_KEY not configured — set CADANA_API_KEY, CADANA_API_TOKEN, or CADANA_TOKEN in environment variables");
  return token;
}

async function cadanaFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const url = `${CADANA_BASE}${path}`;

  // Log outgoing request body for debugging
  if (options.body) {
    console.log(`[Cadana] ${options.method ?? "GET"} ${path} → body:`, options.body);
  }

  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[Cadana] ERROR ${res.status} ${path} → response:`, body);
    let detail = body;
    try {
      const json = JSON.parse(body);
      // Include field-level errors from params if present
      const params = json.params ? Object.entries(json.params).map(([k, v]) => `${k}: ${v}`).join(", ") : "";
      detail = params ? `${json.message || json.error} [${params}]` : (json.message || json.error || JSON.stringify(json));
    } catch {}
    throw new Error(`Cadana API error (${res.status} ${path}): ${detail}`);
  }

  // Handle empty responses (204 No Content)
  if (res.status === 204) return {} as T;

  return res.json() as Promise<T>;
}

// ─── Business ────────────────────────────────────────────────────────────────────

export async function getCadanaBusiness(): Promise<CadanaBusiness> {
  return cadanaFetch<CadanaBusiness>("/businesses/me");
}

export async function getCadanaBalances(
  businessId?: string
): Promise<CadanaBalance[]> {
  const id = businessId ?? (await getCadanaBusiness()).id;
  const res = await cadanaFetch<CadanaPaginatedResponse<CadanaBalance>>(
    `/businesses/${id}/balances`
  );
  return res.data;
}

export async function getCadanaFundingDetails(businessId?: string) {
  const id = businessId ?? (await getCadanaBusiness()).id;
  return cadanaFetch<{
    data: Array<{
      type: string;
      bankName: string;
      bankAddress: string;
      accountName: string;
      accountNumber: string;
      accountType: string;
      routingNumber: string;
      swiftCode: string;
      currency: string;
    }>;
  }>(`/businesses/${id}/funding-details`);
}

// ─── Persons (Workers) ──────────────────────────────────────────────────────────

export async function listCadanaPersons(opts?: {
  limit?: number;
  page?: number;
  status?: string;
}): Promise<CadanaPaginatedResponse<CadanaPerson>> {
  const params = new URLSearchParams();
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.page) params.set("page", String(opts.page));
  if (opts?.status) params.set("status", opts.status);
  const qs = params.toString() ? `?${params}` : "";
  return cadanaFetch<CadanaPaginatedResponse<CadanaPerson>>(`/persons${qs}`);
}

export async function getCadanaPerson(personId: string): Promise<CadanaPerson> {
  return cadanaFetch<CadanaPerson>(`/persons/${personId}`);
}

/**
 * Onboard a new contractor/employee into Cadana.
 * This creates the person record — they still need payment info configured.
 */
export async function createCadanaPerson(data: {
  type: "CONTRACTOR" | "EMPLOYEE";
  firstName: string;
  lastName: string;
  email: string;
  contractorType?: "individual" | "business";
  businessName?: string;
  phoneNumber?: CadanaPhoneNumber;
  address?: CadanaAddress;
  jobInfo?: Partial<CadanaJobInfo>;
  compInfo?: CadanaCompInfo;
}): Promise<CadanaPerson> {
  return cadanaFetch<CadanaPerson>("/persons", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateCadanaPersonBasicInfo(
  personId: string,
  data: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phoneNumber?: CadanaPhoneNumber;
    address?: CadanaAddress;
  }
): Promise<CadanaPerson> {
  return cadanaFetch<CadanaPerson>(`/persons/${personId}/basicInfo`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function updateCadanaPersonJobInfo(
  personId: string,
  data: Partial<CadanaJobInfo>
): Promise<CadanaPerson> {
  return cadanaFetch<CadanaPerson>(`/persons/${personId}/jobInfo`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

// ─── Payment Info ───────────────────────────────────────────────────────────────

export async function getCadanaPaymentInfo(
  personId: string
): Promise<CadanaPaymentInfo> {
  return cadanaFetch<CadanaPaymentInfo>(`/persons/${personId}/paymentInfo`);
}

export async function updateCadanaPaymentInfo(
  personId: string,
  data: Partial<CadanaPaymentInfo>
): Promise<CadanaPaymentInfo> {
  return cadanaFetch<CadanaPaymentInfo>(`/persons/${personId}/paymentInfo`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

// ─── Payrolls ───────────────────────────────────────────────────────────────────

export async function listCadanaPayrolls(opts?: {
  limit?: number;
  page?: number;
}): Promise<CadanaPaginatedResponse<CadanaPayroll>> {
  const params = new URLSearchParams();
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.page) params.set("page", String(opts.page));
  const qs = params.toString() ? `?${params}` : "";
  return cadanaFetch<CadanaPaginatedResponse<CadanaPayroll>>(`/payrolls${qs}`);
}

export async function getCadanaPayroll(payrollId: string): Promise<CadanaPayroll> {
  return cadanaFetch<CadanaPayroll>(`/payrolls/${payrollId}`);
}

/**
 * Create a new payroll batch in Cadana.
 * Returns the payroll in Draft status — must be saved then approved.
 *
 * @param type - "Regular" for scheduled, "One_off" for ad-hoc, "Supplemental" for bonus/reimbursement
 * @param entries - Array of person payments { personId, salary: { amount (cents), currency } }
 * @param payPeriod - Pay period dates { fromDate, toDate } in YYYY-MM-DD
 * @param payrollDate - Date the payroll should be processed (YYYY-MM-DD)
 */
export async function createCadanaPayroll(data: {
  type: "REGULAR" | "ONE_OFF" | "SUPPLEMENTAL";
  workerType?: "CONTRACTOR" | "EMPLOYEE";
  payrollDate: string;
  payPeriod?: { fromDate: string; toDate: string };
  entries: CadanaPayrollEntry[];
}): Promise<CadanaPayroll> {
  return cadanaFetch<CadanaPayroll>("/payrolls", {
    method: "POST",
    body: JSON.stringify({
      workerType: data.workerType ?? "CONTRACTOR",
      ...data,
    }),
  });
}

/**
 * Save a payroll — this is where entries, dates, and amounts are actually set.
 * Create just makes an empty shell; save populates it and locks amounts.
 * Returns 204 (no content) on success.
 */
export async function saveCadanaPayroll(payrollId: string, data: {
  payrollDate: string;
  payPeriod?: { fromDate: string; toDate: string };
  entries: CadanaPayrollEntry[];
}): Promise<void> {
  await cadanaFetch<void>(`/payrolls/${payrollId}/save`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * Approve a payroll to trigger actual payouts.
 * Payroll must be in "Pending Submission" status (after save).
 * This is irreversible — ensure amounts are correct before approving.
 * Returns 204 on success.
 */
export async function approveCadanaPayroll(payrollId: string): Promise<void> {
  await cadanaFetch<void>(`/payrolls/${payrollId}/approve`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

/**
 * Delete a payroll (only works for Created/Pending Submission status).
 */
export async function deleteCadanaPayroll(payrollId: string): Promise<void> {
  await cadanaFetch<void>(`/payrolls/${payrollId}`, { method: "DELETE" });
}

// ─── Full Payroll Execution ─────────────────────────────────────────────────────

/**
 * Execute a full payroll: Create (shell) → Save (with data) → Approve
 * 
 * Cadana flow:
 * 1. POST /payrolls — creates empty shell, returns { payrollId }
 * 2. POST /payrolls/{id}/save — passes entries, dates; validates and locks amounts (204)
 * 3. POST /payrolls/{id}/approve — triggers actual payouts (204)
 *
 * @returns The payroll ID and status
 */
export async function executeCadanaPayroll(data: {
  type?: "REGULAR" | "ONE_OFF" | "SUPPLEMENTAL";
  payrollDate: string;
  payPeriod?: { fromDate: string; toDate: string };
  entries: CadanaPayrollEntry[];
  autoApprove?: boolean;
}): Promise<{
  payroll: CadanaPayroll;
  status: "saved" | "approved";
}> {
  // Step 1: Create empty shell
  const created = await createCadanaPayroll({
    type: data.type ?? "ONE_OFF",
    payrollDate: data.payrollDate,
    payPeriod: data.payPeriod,
    entries: data.entries,
  });

  console.log(`[Cadana] Payroll created: ${created.payrollId}`);

  // Step 2: Save with actual data (entries, dates)
  await saveCadanaPayroll(created.payrollId, {
    payrollDate: data.payrollDate,
    payPeriod: data.payPeriod,
    entries: data.entries,
  });

  console.log(`[Cadana] Payroll saved: ${created.payrollId}`);

  // Save is async — poll until status transitions from "Created" to "Pending Submission"
  let saved: CadanaPayroll;
  const maxWait = 15_000; // 15 seconds max
  const pollInterval = 1_000; // check every 1s
  const start = Date.now();
  const payrollId = created.payrollId;
  while (true) {
    saved = await getCadanaPayroll(payrollId);
    saved.payrollId = payrollId; // GET response doesn't include payrollId
    if (saved.status !== "Created") break;
    if (Date.now() - start > maxWait) {
      throw new Error(`Cadana payroll ${payrollId} stuck in "Created" status after ${maxWait / 1000}s — save may have failed`);
    }
    console.log(`[Cadana] Waiting for save to process... (${saved.status})`);
    await new Promise((r) => setTimeout(r, pollInterval));
  }
  console.log(`[Cadana] Payroll status: ${saved.status}, debit: ${saved.debit.amount / 100} ${saved.debit.currency}`);

  if (data.autoApprove === false) {
    return { payroll: saved, status: "saved" };
  }

  // Step 3: Approve (triggers payouts)
  await approveCadanaPayroll(payrollId);
  console.log(`[Cadana] Payroll approved: ${payrollId}`);

  const approved = await getCadanaPayroll(payrollId);
  approved.payrollId = payrollId; // GET response doesn't include payrollId
  return { payroll: approved, status: "approved" };
}

// ─── Country Name → ISO 3166-1 alpha-2 ──────────────────────────────────────

const COUNTRY_TO_ISO: Record<string, string> = {
  "Argentina": "AR", "Australia": "AU", "Bolivia": "BO", "Brazil": "BR",
  "Canada": "CA", "Chile": "CL", "Colombia": "CO", "Costa Rica": "CR",
  "Dominican Republic": "DO", "Ecuador": "EC", "Egypt": "EG",
  "El Salvador": "SV", "France": "FR", "Germany": "DE", "Ghana": "GH",
  "Guatemala": "GT", "Honduras": "HN", "India": "IN", "Indonesia": "ID",
  "Ireland": "IE", "Israel": "IL", "Italy": "IT", "Jamaica": "JM",
  "Japan": "JP", "Kenya": "KE", "Mexico": "MX", "Netherlands": "NL",
  "New Zealand": "NZ", "Nicaragua": "NI", "Nigeria": "NG", "Pakistan": "PK",
  "Panama": "PA", "Paraguay": "PY", "Peru": "PE", "Philippines": "PH",
  "Poland": "PL", "Portugal": "PT", "Puerto Rico": "PR", "Romania": "RO",
  "Singapore": "SG", "South Africa": "ZA", "South Korea": "KR",
  "Spain": "ES", "Sri Lanka": "LK", "Thailand": "TH", "Turkey": "TR",
  "Ukraine": "UA", "United Kingdom": "GB", "United States": "US",
  "Uruguay": "UY", "Venezuela": "VE", "Vietnam": "VN",
};

/** Convert country name or code to ISO 3166-1 alpha-2 */
export function toCountryCode(country: string): string {
  if (!country) return "US";
  const upper = country.trim().toUpperCase();
  // Already a 2-letter code?
  if (upper.length === 2) return upper;
  // Look up by name (case-insensitive)
  const match = COUNTRY_TO_ISO[country.trim()] ??
    Object.entries(COUNTRY_TO_ISO).find(([k]) => k.toUpperCase() === upper)?.[1];
  return match ?? upper.slice(0, 2); // fallback: first 2 chars
}

// ─── Worker Onboarding Helper ───────────────────────────────────────────────────

/**
 * Onboard an HRIQ employee into Cadana with full profile.
 * Maps HRIQ employee data to Cadana's person format.
 */
export async function onboardToCadana(employee: {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  phoneCountryCode?: string;
  country: string;
  streetAddress?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  jobTitle?: string;
  department?: string;
  startDate?: string;
  hourlyRate?: number;
  currency?: string;
}): Promise<CadanaPerson> {
  const countryCode = toCountryCode(employee.country);
  const stripAccents = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Cadana REQUIRES: address.countryCode and compInfo.salary.currency
  const rateCents = employee.hourlyRate
    ? Math.round(employee.hourlyRate * 100)
    : 100; // Default to $1.00/hr if no rate (Cadana requires salary)

  const person = await createCadanaPerson({
    type: "CONTRACTOR",
    firstName: employee.firstName,
    lastName: employee.lastName,
    email: employee.email,
    contractorType: "individual",
    address: {
      line1: stripAccents(employee.streetAddress || "N/A"),
      city: stripAccents(employee.city || "N/A"),
      state: stripAccents(employee.state || ""),
      postalCode: employee.postalCode || "00000",
      countryCode,
    },
    compInfo: {
      frequency: "hourly",
      type: "net",
      salary: { amount: rateCents, currency: employee.currency ?? "USD" },
    },
  });

  // Set job info separately (non-critical)
  try {
    await updateCadanaPersonJobInfo(person.id, {
      title: employee.jobTitle ?? "Contractor",
      department: employee.department || undefined,
      startDate: employee.startDate || undefined,
    });
  } catch (e) {
    console.warn(`[Cadana] Job info update failed (non-critical):`, e);
  }

  console.log(
    `[Cadana] Onboarded ${employee.firstName} ${employee.lastName} → personId: ${person.id}`
  );

  return person;
}

// ─── Sync Helper ────────────────────────────────────────────────────────────────

/**
 * Find a Cadana person by email (case-insensitive search).
 * Returns the first active match, or null.
 */
export async function findCadanaPersonByEmail(
  email: string
): Promise<CadanaPerson | null> {
  return findCadanaPersonByEmails([email]);
}

/**
 * Find a Cadana person by any of the given emails (case-insensitive).
 * People may sign up to Cadana with a different email than what HRIQ has.
 * Returns the first active match with a wallet, or first active match, or first match.
 */
export async function findCadanaPersonByEmails(
  emails: string[]
): Promise<CadanaPerson | null> {
  const normalized = emails
    .filter(Boolean)
    .map((e) => e.toLowerCase().trim())
    .filter((e) => e.length > 0);
  if (normalized.length === 0) return null;

  const matches: CadanaPerson[] = [];
  let page = 1;
  const limit = 100;

  while (true) {
    const res = await listCadanaPersons({ page, limit });
    for (const p of res.data) {
      if (normalized.includes(p.email.toLowerCase().trim())) {
        matches.push(p);
      }
    }
    if (!res.meta || page >= res.meta.pages) break;
    page++;
  }

  if (matches.length === 0) return null;
  // Prefer Active persons; among those, the search order matters
  const active = matches.filter((m) => m.status === "Active");
  return active.length > 0 ? active[0] : matches[0];
}

// ─── Users API ──────────────────────────────────────────────────────────────

export interface CadanaUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  personId: string;
  phoneNumber?: CadanaPhoneNumber;
}

/**
 * Create a Cadana user account for an existing Person.
 * This calls POST /v1/users/invite which triggers Cadana's welcome email
 * with password setup instructions — the contractor gets real login credentials.
 *
 * A Person record must exist first (via createCadanaPerson / onboardToCadana).
 * Returns the created user object, or null if the user already exists.
 */
export async function createCadanaUser(personId: string): Promise<CadanaUser | null> {
  try {
    return await cadanaFetch<CadanaUser>("/users/invite", {
      method: "POST",
      body: JSON.stringify({ personId }),
    });
  } catch (err: any) {
    // If user already exists, return null instead of throwing
    if (err?.message?.includes("already exists") || err?.message?.includes("409") || err?.message?.includes("400")) {
      console.warn(`[Cadana] User already exists for person ${personId}`);
      return null;
    }
    throw err;
  }
}

/**
 * Find an existing Cadana user by email.
 * Returns the user if found, null otherwise.
 */
export async function findCadanaUserByEmail(email: string): Promise<CadanaUser | null> {
  const res = await cadanaFetch<CadanaPaginatedResponse<CadanaUser>>(`/users?email=${encodeURIComponent(email)}`);
  return res.data?.[0] ?? null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Convert a dollar amount to Cadana cents format.
 * Cadana uses integer cents (e.g., $103.40 → 10340).
 */
export function toCadanaCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/**
 * Convert Cadana cents to dollar amount.
 */
export function fromCadanaCents(cents: number): number {
  return cents / 100;
}
