"use server";

import { requireRole, requireOrg } from "@repo/auth/session";
import { database } from "@repo/database";
import { revalidatePath } from "next/cache";
import { HriqError } from "@/lib/hriq/errors";

// ─── QB Token Management ────────────────────────────────────────────────────────

const QB_CLIENT_ID = process.env.QB_CLIENT_ID!;
const QB_CLIENT_SECRET = process.env.QB_CLIENT_SECRET!;
const QB_COMPANY_ID = process.env.QB_COMPANY_ID!;
const QB_TOKEN_URL =
  "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const QB_API_BASE = "https://quickbooks.api.intuit.com/v3/company";

const RCRM_API_BASE = "https://api.recruitcrm.io/v1";
const RCRM_API_TOKEN = process.env.RECRUITCRM_API_TOKEN!;

// Commission tier → rate
const TIER_RATES: Record<string, number> = {
  standard: 0.006, // 0.6%
  bundle: 0.01, // 1.0%
  ae: 0.012, // 1.2%
  bundle_ae: 0.02, // 2.0%
  ppp: 0.02, // 2.0%
  bundle_fill: 0, // $20 flat
};
const BUNDLE_FILL_FLAT = 20;

// ─── QB Helpers ─────────────────────────────────────────────────────────────────

async function getQBAccessToken(): Promise<string> {
  // Read stored tokens from DB
  const stored = await database.$queryRawUnsafe<
    Array<{
      access_token: string;
      refresh_token: string;
      access_token_expires_at: Date;
    }>
  >(
    `SELECT access_token, refresh_token, access_token_expires_at FROM hriq_qb_tokens WHERE company_id = $1 LIMIT 1`,
    QB_COMPANY_ID,
  );

  if (!stored[0]) throw new HriqError("HRIQ-1001", "No QB tokens found");

  const row = stored[0];
  const expiresAt = new Date(row.access_token_expires_at);

  // If token still valid (with 5min buffer), use it
  if (expiresAt.getTime() > Date.now() + 5 * 60_000) {
    return row.access_token;
  }

  // Refresh the token
  const basicAuth = Buffer.from(`${QB_CLIENT_ID}:${QB_CLIENT_SECRET}`).toString(
    "base64",
  );

  const res = await fetch(QB_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: row.refresh_token,
    }).toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new HriqError(
      "HRIQ-1002",
      `QB token refresh failed (${res.status}): ${errText}`,
    );
  }

  const data = await res.json();
  const now = new Date();

  // Update stored tokens
  await database.$executeRawUnsafe(
    `UPDATE hriq_qb_tokens SET access_token = $1, refresh_token = $2, access_token_expires_at = $3, updated_at = NOW() WHERE company_id = $4`,
    data.access_token,
    data.refresh_token,
    new Date(now.getTime() + data.expires_in * 1000).toISOString(),
    QB_COMPANY_ID,
  );

  return data.access_token;
}

async function qbQuery<T>(sql: string, accessToken: string): Promise<T[]> {
  const encoded = encodeURIComponent(sql);
  const url = `${QB_API_BASE}/${QB_COMPANY_ID}/query?query=${encoded}&minorversion=75`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`QB query failed (${res.status}): ${errText}`);
  }

  const result = await res.json();
  const qr = result.QueryResponse;
  for (const key of Object.keys(qr)) {
    if (Array.isArray(qr[key])) return qr[key];
  }
  return [];
}

// ─── RCRM Helpers ───────────────────────────────────────────────────────────────

async function rcrmFetch<T>(endpoint: string): Promise<T> {
  const res = await fetch(`${RCRM_API_BASE}/${endpoint}`, {
    headers: {
      Authorization: `Bearer ${RCRM_API_TOKEN}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`RCRM API error ${res.status}: ${errText}`);
  }
  return res.json();
}

interface RCRMDealPaginated {
  data: Array<{
    id: number;
    name: string;
    deal_stage: { label: string };
    job_slug: string | null;
    owner: number;
    close_date: string | null;
    custom_fields: Array<{
      field_id: number;
      value: string | null;
    }>;
  }>;
  next_page_url: string | null;
}

interface RCRMJobData {
  id: number;
  name: string;
  owner: number;
  created_by: number;
  custom_fields: Array<{
    field_id: number;
    field_name: string;
    value: string | null;
  }>;
}

// ─── Employee Matching ──────────────────────────────────────────────────────────

/**
 * Build a map of RCRM user ID → HRIQ employee ID.
 * Matches by work_email (RCRM user email ↔ HRIQ work_email).
 */
async function buildRCRMToHRIQMap(): Promise<
  Map<number, { hriqId: string; name: string }>
> {
  // Get all RL employees
  const RL_ORG_ID = process.env.RL_ORGANIZATION_ID ?? "org_rl_001";
  const employees = await database.employee.findMany({
    where: {
      organizationId: RL_ORG_ID,
      employmentStatus: { in: ["active", "onboarding_in_progress"] },
    },
    select: {
      id: true,
      legalFirstName: true,
      legalLastName: true,
      preferredName: true,
      workEmail: true,
    },
  });

  // Get RCRM users
  const rcrmUsers = await rcrmFetch<
    Array<{
      id: number;
      first_name: string;
      last_name: string;
      email: string | null;
    }>
  >("users");

  const userList = Array.isArray(rcrmUsers)
    ? rcrmUsers
    : (rcrmUsers as any).data ?? [];

  // Build email → HRIQ employee map
  const emailToHRIQ = new Map<
    string,
    { hriqId: string; name: string }
  >();
  for (const emp of employees) {
    const email = emp.workEmail?.toLowerCase().trim();
    if (email) {
      emailToHRIQ.set(email, {
        hriqId: emp.id,
        name: `${emp.legalFirstName ?? ""} ${emp.legalLastName ?? ""}`.trim(),
      });
    }
  }

  // Also build a first name → HRIQ employee map (fallback for job name parsing)
  const firstNameToHRIQ = new Map<
    string,
    { hriqId: string; name: string }
  >();
  for (const emp of employees) {
    const firstName = (
      emp.preferredName ?? emp.legalFirstName ?? ""
    )
      .toLowerCase()
      .trim();
    if (firstName) {
      firstNameToHRIQ.set(firstName, {
        hriqId: emp.id,
        name: `${emp.legalFirstName ?? ""} ${emp.legalLastName ?? ""}`.trim(),
      });
    }
  }

  // Map RCRM user ID → HRIQ employee
  const result = new Map<number, { hriqId: string; name: string }>();
  for (const user of userList) {
    const email = user.email?.toLowerCase().trim();
    if (email) {
      const match = emailToHRIQ.get(email);
      if (match) {
        result.set(user.id, match);
        continue;
      }
    }
    // Fallback: match by first name
    const firstName = user.first_name?.toLowerCase().trim();
    if (firstName) {
      const match = firstNameToHRIQ.get(firstName);
      if (match) {
        result.set(user.id, match);
      }
    }
  }

  return result;
}

// ─── Commission Tier Detection ──────────────────────────────────────────────────

function detectCommissionTier(
  jobName: string,
  hireType: string | null,
): string {
  const lowerName = jobName.toLowerCase();
  const lowerHire = (hireType ?? "").toLowerCase();

  // Bundle detection from job custom field
  if (lowerHire.includes("bundle")) {
    // Check if the HM name has AE indicators
    if (lowerName.includes("(ae)") || lowerName.includes("ae")) {
      return "bundle_ae";
    }
    return "bundle";
  }

  // AE (Account Executive) detection from job name
  if (lowerName.includes("(ae)") || lowerName.includes("(aa)")) {
    return "ae";
  }

  // PPP detection
  if (lowerName.includes("ppp") || lowerName.includes("(ppp)")) {
    return "ppp";
  }

  return "standard";
}

function calculateCommission(
  tier: string,
  revenueAmount: number,
): { rate: number; amount: number } {
  if (tier === "bundle_fill") {
    return { rate: 0, amount: BUNDLE_FILL_FLAT };
  }
  const rate = TIER_RATES[tier] ?? 0.006;
  return { rate, amount: Number((revenueAmount * rate).toFixed(2)) };
}

// ─── Main Sync Action ───────────────────────────────────────────────────────────

export interface SyncResult {
  created: number;
  skipped: number;
  errors: string[];
  totalRevenue: number;
  totalCommission: number;
  matches: Array<{
    dealName: string;
    qbDocNumber: string;
    qbTotal: number;
    hmName: string;
    tier: string;
    commission: number;
    status: "created" | "skipped" | "error";
    reason?: string;
  }>;
}

/**
 * Sync commissions from QuickBooks paid invoices + RecruitCRM deals/jobs.
 *
 * Flow:
 * 1. Get fresh QB access token
 * 2. Query QB for paid invoices (Balance = 0)
 * 3. Get Won/Won&Fulfilled deals from RCRM that have QB Invoice IDs
 * 4. For each deal, look up the linked job to find the hiring manager
 * 5. Match RCRM user → HRIQ employee
 * 6. Calculate commission based on tier
 * 7. Create commission entries (skip if qb_invoice_number already exists)
 */
export async function syncCommissionsFromQBAndRCRM(options?: {
  dryRun?: boolean;
  sinceDays?: number;
}): Promise<SyncResult> {
  const session = await requireOrg();
  if (!["super_admin", "admin"].includes(session.orgRole)) {
    throw new HriqError("HRIQ-0105", "Only admins can sync commissions");
  }

  const dryRun = options?.dryRun ?? false;
  const sinceDays = options?.sinceDays ?? 90;

  const result: SyncResult = {
    created: 0,
    skipped: 0,
    errors: [],
    totalRevenue: 0,
    totalCommission: 0,
    matches: [],
  };

  // 1. Get QB access token
  console.log("[CommSync] Refreshing QB token...");
  const qbToken = await getQBAccessToken();

  // 2. Fetch paid invoices from QB
  console.log("[CommSync] Fetching paid invoices from QB...");
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - sinceDays);
  const sinceDateStr = sinceDate.toISOString().split("T")[0];

  const qbInvoiceMap = new Map<
    string,
    {
      id: string;
      docNumber: string;
      total: number;
      date: string;
      customer: string;
    }
  >();

  // Paginate through all paid invoices since the cutoff
  for (let start = 1; start <= 2000; start += 50) {
    const invoices = await qbQuery<any>(
      `SELECT Id,DocNumber,TxnDate,TotalAmt,Balance,CustomerRef FROM Invoice WHERE Balance = '0' AND TxnDate >= '${sinceDateStr}' STARTPOSITION ${start} MAXRESULTS 50`,
      qbToken,
    );
    if (invoices.length === 0) break;

    for (const inv of invoices) {
      const doc = inv.DocNumber;
      if (doc) {
        qbInvoiceMap.set(doc, {
          id: inv.Id,
          docNumber: doc,
          total: inv.TotalAmt,
          date: inv.TxnDate,
          customer: inv.CustomerRef?.name ?? "Unknown",
        });
      }
    }
  }
  console.log(
    `[CommSync] Found ${qbInvoiceMap.size} paid invoices since ${sinceDateStr}`,
  );

  // 3. Fetch Won deals from RCRM with QB Invoice IDs
  console.log("[CommSync] Fetching won deals from RecruitCRM...");
  const wonDeals: Array<{
    id: number;
    name: string;
    jobSlug: string | null;
    owner: number;
    closeDate: string | null;
    qbInvoiceIds: string[];
  }> = [];

  for (let page = 1; page <= 200; page++) {
    const res = await rcrmFetch<RCRMDealPaginated>(
      `deals?limit=100&page=${page}`,
    );
    for (const deal of res.data) {
      const stage = deal.deal_stage?.label ?? "";
      if (stage !== "Won" && stage !== "Won & Fulfilled") continue;

      const qbField = deal.custom_fields.find((cf) => cf.field_id === 22);
      const rawValue = qbField?.value?.trim();
      if (!rawValue) continue;

      const qbIds = rawValue.split(/\s+/).filter(Boolean);
      wonDeals.push({
        id: deal.id,
        name: deal.name,
        jobSlug: deal.job_slug,
        owner: deal.owner,
        closeDate: deal.close_date,
        qbInvoiceIds: qbIds,
      });
    }
    if (!res.next_page_url) break;
  }
  console.log(
    `[CommSync] Found ${wonDeals.length} won deals with QB Invoice IDs`,
  );

  // 4. Fetch jobs for these deals
  console.log("[CommSync] Fetching linked jobs...");
  const jobSlugs = [
    ...new Set(wonDeals.map((d) => d.jobSlug).filter(Boolean)),
  ] as string[];

  const jobMap = new Map<
    string,
    {
      name: string;
      owner: number;
      hireType: string | null;
      salesperson: string | null;
    }
  >();

  // Batch fetch jobs (10 concurrent)
  for (let i = 0; i < jobSlugs.length; i += 10) {
    const batch = jobSlugs.slice(i, i + 10);
    const results = await Promise.allSettled(
      batch.map((slug) => rcrmFetch<RCRMJobData>(`jobs/${slug}`)),
    );
    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (r && r.status === "fulfilled") {
        const job = r.value;
        const hireType =
          job.custom_fields.find((cf) => cf.field_id === 7)?.value ?? null;
        const salesperson =
          job.custom_fields.find((cf) => cf.field_id === 3)?.value ?? null;
        jobMap.set(batch[j]!, {
          name: job.name,
          owner: job.owner,
          hireType,
          salesperson,
        });
      }
    }
  }
  console.log(`[CommSync] Fetched ${jobMap.size} jobs`);

  // 5. Build RCRM user → HRIQ employee map
  console.log("[CommSync] Building employee mapping...");
  const rcrmToHRIQ = await buildRCRMToHRIQMap();
  console.log(
    `[CommSync] Mapped ${rcrmToHRIQ.size} RCRM users to HRIQ employees`,
  );

  // 6. Get existing commission QB invoice refs to avoid duplicates
  const existingRefs = new Set(
    (
      await database.commission.findMany({
        select: { qbInvoiceNumber: true },
        where: { qbInvoiceNumber: { not: null } },
      })
    ).map((c) => c.qbInvoiceNumber),
  );
  console.log(
    `[CommSync] ${existingRefs.size} existing commission QB invoice refs`,
  );

  // 7. Process each deal → QB invoice match
  for (const deal of wonDeals) {
    const job = deal.jobSlug ? jobMap.get(deal.jobSlug) : null;

    for (const docNum of deal.qbInvoiceIds) {
      const qbInv = qbInvoiceMap.get(docNum);
      if (!qbInv) {
        // Invoice not in our paid set (maybe older than sinceDays or unpaid)
        continue;
      }

      // Determine hiring manager from job owner
      const hmRcrmId = job?.owner ?? deal.owner;
      const hmMatch = rcrmToHRIQ.get(hmRcrmId);

      const hmName = hmMatch?.name ?? `RCRM#${hmRcrmId}`;
      const hmHriqId = hmMatch?.hriqId ?? null;

      // Detect commission tier
      const tier = job
        ? detectCommissionTier(job.name, job.hireType)
        : "standard";
      const comm = calculateCommission(tier, qbInv.total);

      // Check for duplicate
      if (existingRefs.has(docNum)) {
        result.matches.push({
          dealName: deal.name,
          qbDocNumber: docNum,
          qbTotal: qbInv.total,
          hmName,
          tier,
          commission: comm.amount,
          status: "skipped",
          reason: "Already exists",
        });
        result.skipped++;
        continue;
      }

      // Skip if we can't identify the HM in HRIQ
      if (!hmHriqId) {
        result.matches.push({
          dealName: deal.name,
          qbDocNumber: docNum,
          qbTotal: qbInv.total,
          hmName,
          tier,
          commission: comm.amount,
          status: "error",
          reason: `No HRIQ employee match for ${hmName}`,
        });
        result.errors.push(`No employee match for ${hmName} (deal: ${deal.name})`);
        continue;
      }

      result.totalRevenue += qbInv.total;
      result.totalCommission += comm.amount;

      if (!dryRun) {
        try {
          await database.commission.create({
            data: {
              commissionType: "hiring_manager",
              employeeId: hmHriqId,
              commissionTier: tier,
              clientName: qbInv.customer,
              revenueAmount: qbInv.total,
              commissionRate: comm.rate,
              commissionAmount: comm.amount,
              qbPaymentRef: qbInv.id,
              qbInvoiceNumber: docNum,
              qbPaymentAmount: qbInv.total,
              qbPaymentDate: new Date(qbInv.date),
              qbVendorName: qbInv.customer,
              description: `Auto-synced from QB Invoice #${docNum} — ${deal.name}`,
              notes: job
                ? `Job: ${job.name} | Salesperson: ${job.salesperson ?? "N/A"}`
                : undefined,
              assignedByUserId: session.userId,
              assignedByName: "Commission Sync",
            },
          });
          existingRefs.add(docNum); // Prevent dupes within same sync run

          result.matches.push({
            dealName: deal.name,
            qbDocNumber: docNum,
            qbTotal: qbInv.total,
            hmName,
            tier,
            commission: comm.amount,
            status: "created",
          });
          result.created++;
        } catch (err: any) {
          result.matches.push({
            dealName: deal.name,
            qbDocNumber: docNum,
            qbTotal: qbInv.total,
            hmName,
            tier,
            commission: comm.amount,
            status: "error",
            reason: err.message,
          });
          result.errors.push(`DB error for ${docNum}: ${err.message}`);
        }
      } else {
        result.matches.push({
          dealName: deal.name,
          qbDocNumber: docNum,
          qbTotal: qbInv.total,
          hmName,
          tier,
          commission: comm.amount,
          status: "created",
          reason: "Dry run",
        });
        result.created++;
      }
    }
  }

  if (!dryRun) {
    revalidatePath("/[orgSlug]/commissions", "page");
    revalidatePath("/[orgSlug]/timesheets", "page");
  }

  console.log(
    `[CommSync] Done: ${result.created} created, ${result.skipped} skipped, ${result.errors.length} errors. Revenue: $${result.totalRevenue.toFixed(2)}, Commission: $${result.totalCommission.toFixed(2)}`,
  );

  return result;
}
