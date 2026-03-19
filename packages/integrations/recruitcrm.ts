/**
 * RecruitCRM API Integration
 *
 * Handles API calls to RecruitCRM for deals, jobs, and users.
 * Used primarily for commission sync — matching won deals to QB invoices
 * and determining hiring manager assignments.
 *
 * API docs: https://docs.recruitcrm.io/
 */

// ─── Configuration ──────────────────────────────────────────────────────────────

const RCRM_API_BASE = "https://api.recruitcrm.io/v1";
const RCRM_API_TOKEN = process.env.RECRUITCRM_API_TOKEN!;

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface RCRMCustomField {
  field_id: number;
  entity_type: string;
  field_name: string;
  field_type: string;
  value: string | null;
}

export interface RCRMDealStage {
  id: number;
  label: string;
  percentage: string;
}

export interface RCRMDeal {
  id: number;
  name: string;
  slug: string;
  created_on: string;
  updated_on: string;
  archived: number;
  deal_stage: RCRMDealStage;
  deal_value: number;
  close_date: string | null;
  deal_type: { id: number; label: string };
  company_slug: string | null;
  contact_slugs: string[];
  job_slug: string | null;
  additional_job_slugs: string[];
  candidate_slug: string | null;
  custom_fields: RCRMCustomField[];
  created_by: number;
  updated_by: number;
  owner: number;
  resource_url: string;
}

export interface RCRMJob {
  id: number;
  slug: string;
  name: string;
  company_slug: string | null;
  contact_slug: string | null;
  job_status: { id: number; label: string };
  created_on: string;
  updated_on: string;
  created_by: number;
  updated_by: number;
  owner: number;
  custom_fields: RCRMCustomField[];
}

export interface RCRMUser {
  id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  role: string;
}

export interface RCRMPaginatedResponse<T> {
  current_page: number;
  data: T[];
  first_page_url: string;
  from: number;
  next_page_url: string | null;
  path: string;
  per_page: string;
  prev_page_url: string | null;
  to: number;
}

// ─── Known custom field IDs ─────────────────────────────────────────────────────

/** Deal custom field: "Quickbooks Invoice ID" (field_id: 22) */
export const DEAL_FIELD_QB_INVOICE_ID = 22;
/** Deal custom field: "Account Executive" (field_id: 23) */
export const DEAL_FIELD_ACCOUNT_EXEC = 23;
/** Deal custom field: "Total Paid" (field_id: 13) */
export const DEAL_FIELD_TOTAL_PAID = 13;

/** Job custom field: "Recruiter" (field_id: 2) */
export const JOB_FIELD_RECRUITER = 2;
/** Job custom field: "Salesperson" (field_id: 3) */
export const JOB_FIELD_SALESPERSON = 3;
/** Job custom field: "2nd Hiring Manager" (field_id: 4) */
export const JOB_FIELD_2ND_HM = 4;
/** Job custom field: "Individual Hiring or Bundle?" (field_id: 7) */
export const JOB_FIELD_HIRE_TYPE = 7;

// ─── API Client ─────────────────────────────────────────────────────────────────

async function rcrmRequest<T>(
  endpoint: string,
  options?: { method?: string; body?: any },
): Promise<T> {
  const url = `${RCRM_API_BASE}/${endpoint}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${RCRM_API_TOKEN}`,
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
    throw new Error(`RCRM API error ${res.status} [${endpoint}]: ${errText}`);
  }

  return res.json();
}

// ─── Deals ──────────────────────────────────────────────────────────────────────

/**
 * Fetch all deals matching given stages (paginated).
 * Default: Won and Won & Fulfilled stages.
 */
export async function getWonDeals(options?: {
  stages?: string[];
  maxPages?: number;
}): Promise<RCRMDeal[]> {
  const targetStages = new Set(options?.stages ?? ["Won", "Won & Fulfilled"]);
  const maxPages = options?.maxPages ?? 200;
  const allDeals: RCRMDeal[] = [];

  let page = 1;
  while (page <= maxPages) {
    const res = await rcrmRequest<RCRMPaginatedResponse<RCRMDeal>>(
      `deals?limit=100&page=${page}`,
    );

    for (const deal of res.data) {
      if (targetStages.has(deal.deal_stage.label)) {
        allDeals.push(deal);
      }
    }

    if (!res.next_page_url) break;
    page++;
  }

  return allDeals;
}

/**
 * Get deals that have a QuickBooks Invoice ID custom field set.
 */
export async function getDealsWithQBInvoices(): Promise<
  Array<RCRMDeal & { qbInvoiceIds: string[] }>
> {
  const wonDeals = await getWonDeals();

  return wonDeals
    .map((deal) => {
      const qbField = deal.custom_fields.find(
        (cf) => cf.field_id === DEAL_FIELD_QB_INVOICE_ID,
      );
      const rawValue = qbField?.value?.trim();
      if (!rawValue) return null;

      // QB Invoice IDs can be space-separated (e.g., "7651 7652")
      const qbInvoiceIds = rawValue.split(/\s+/).filter(Boolean);
      return { ...deal, qbInvoiceIds };
    })
    .filter((d): d is NonNullable<typeof d> => d !== null);
}

// ─── Jobs ───────────────────────────────────────────────────────────────────────

/**
 * Fetch a single job by slug.
 */
export async function getJob(slug: string): Promise<RCRMJob> {
  return rcrmRequest<RCRMJob>(`jobs/${slug}`);
}

/**
 * Fetch multiple jobs by slug (batched).
 */
export async function getJobs(slugs: string[]): Promise<Map<string, RCRMJob>> {
  const jobMap = new Map<string, RCRMJob>();
  const uniqueSlugs = [...new Set(slugs)];

  // Fetch in parallel batches of 10
  const batchSize = 10;
  for (let i = 0; i < uniqueSlugs.length; i += batchSize) {
    const batch = uniqueSlugs.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map((slug) => getJob(slug)),
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      if (result && result.status === "fulfilled") {
        jobMap.set(batch[j]!, result.value);
      }
    }
  }

  return jobMap;
}

/**
 * Extract the hiring manager name from a job.
 * Job names follow the pattern "HiringManager: ClientName"
 * (with optional "!!!" or "(R)" prefixes).
 */
export function extractHMFromJobName(jobName: string): string | null {
  if (!jobName.includes(":")) return null;
  // Strip common prefixes: "!!!", "!!! ", "(R) ", etc.
  let name = jobName.split(":")[0]!.trim();
  name = name.replace(/^[!\s(R)]+/g, "").trim();
  return name || null;
}

/**
 * Get the salesperson and recruiter from job custom fields.
 */
export function getJobAssignments(job: RCRMJob): {
  recruiter: string | null;
  salesperson: string | null;
  secondHM: string | null;
  hireType: string | null;
} {
  const recruiter =
    job.custom_fields.find((cf) => cf.field_id === JOB_FIELD_RECRUITER)
      ?.value ?? null;
  const salesperson =
    job.custom_fields.find((cf) => cf.field_id === JOB_FIELD_SALESPERSON)
      ?.value ?? null;
  const secondHM =
    job.custom_fields.find((cf) => cf.field_id === JOB_FIELD_2ND_HM)?.value ??
    null;
  const hireType =
    job.custom_fields.find((cf) => cf.field_id === JOB_FIELD_HIRE_TYPE)
      ?.value ?? null;

  return { recruiter, salesperson, secondHM, hireType };
}

// ─── Users ──────────────────────────────────────────────────────────────────────

/**
 * Get all RecruitCRM users (team members).
 */
export async function getUsers(): Promise<RCRMUser[]> {
  const res = await rcrmRequest<{ data: RCRMUser[] } | RCRMUser[]>("users");
  return Array.isArray(res) ? res : res.data;
}

/**
 * Build a map of RCRM user ID → user info.
 */
export async function getUserMap(): Promise<Map<number, RCRMUser>> {
  const users = await getUsers();
  const map = new Map<number, RCRMUser>();
  for (const u of users) {
    map.set(u.id, u);
  }
  return map;
}
