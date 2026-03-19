"use server";

import { database } from "@repo/database";
import { getSessionContext } from "@repo/auth/session";

// ─── Types ──────────────────────────────────────────────────────────────────

export type HealthIssue = {
  key: string;
  label: string;
  count: number;
  description: string;
};

export type HealthSummary = {
  totalActive: number;
  issues: HealthIssue[];
};

// ─── Health Summary ─────────────────────────────────────────────────────────

/**
 * Fetch a high-level summary of data health issues across active contractors.
 * Auth-gated to RL super_admins.
 */
export async function getHealthSummary(): Promise<HealthSummary> {
  const ctx = await getSessionContext();
  if (!ctx || ctx.orgRole !== "super_admin") {
    return { totalActive: 0, issues: [] };
  }

  const rows = await database.$queryRaw<Array<{ issue: string; count: bigint }>>`
    SELECT 'missing_rate' as issue, COUNT(*) as count
    FROM hriq_employees WHERE employment_status = 'active'
      AND (hourly_rate IS NULL OR hourly_rate = 0) AND (monthly_salary IS NULL OR monthly_salary = 0)
    UNION ALL SELECT 'missing_department', COUNT(*) FROM hriq_employees WHERE employment_status = 'active' AND (department IS NULL OR department = '')
    UNION ALL SELECT 'missing_country', COUNT(*) FROM hriq_employees WHERE employment_status = 'active' AND (country IS NULL OR country = '')
    UNION ALL SELECT 'missing_job_title', COUNT(*) FROM hriq_employees WHERE employment_status = 'active' AND (role IS NULL OR role = '')
    UNION ALL SELECT 'missing_start_date', COUNT(*) FROM hriq_employees WHERE employment_status = 'active' AND start_date IS NULL
    UNION ALL SELECT 'missing_timezone', COUNT(*) FROM hriq_employees WHERE employment_status = 'active' AND (timezone IS NULL OR timezone = '')
    UNION ALL SELECT 'missing_payment_method', COUNT(*) FROM hriq_employees WHERE employment_status = 'active' AND (preferred_payment_method IS NULL OR preferred_payment_method = '')
    UNION ALL SELECT 'missing_personal_email', COUNT(*) FROM hriq_employees WHERE employment_status = 'active' AND (personal_email IS NULL OR personal_email = '')
    UNION ALL SELECT 'total_active', COUNT(*) FROM hriq_employees WHERE employment_status = 'active'
  `.catch(() => []);

  const counts = Object.fromEntries((rows as any[]).map(r => [r.issue, Number(r.count)]));

  const issueDefinitions: Array<{ key: string; label: string; description: string }> = [
    { key: "missing_rate", label: "Missing Compensation Rate", description: "Active contractors with no hourly rate or monthly salary set" },
    { key: "missing_department", label: "Missing Department", description: "Active contractors with no department assigned" },
    { key: "missing_country", label: "Missing Country", description: "Active contractors with no country on file" },
    { key: "missing_job_title", label: "Missing Job Title", description: "Active contractors with no job title/role set" },
    { key: "missing_start_date", label: "Missing Start Date", description: "Active contractors with no start date recorded" },
    { key: "missing_timezone", label: "Missing Timezone", description: "Active contractors with no timezone set" },
    { key: "missing_payment_method", label: "Missing Payment Method", description: "Active contractors with no payment method (Cadana/Wise) assigned" },
    { key: "missing_personal_email", label: "Missing Personal Email", description: "Active contractors with no personal email on file" },
  ];

  const issues: HealthIssue[] = issueDefinitions
    .filter(d => (counts[d.key] ?? 0) > 0)
    .map(d => ({ ...d, count: counts[d.key] ?? 0 }));

  return { totalActive: counts.total_active ?? 0, issues };
}

// ─── CSV Generation ─────────────────────────────────────────────────────────

const ISSUE_QUERIES: Record<string, string> = {
  missing_rate: `
    SELECT employee_number, legal_first_name, legal_last_name, personal_email, work_email,
           department, role as job_title, hourly_rate, monthly_salary, currency, preferred_payment_method, country
    FROM hriq_employees
    WHERE employment_status = 'active'
      AND (hourly_rate IS NULL OR hourly_rate = 0)
      AND (monthly_salary IS NULL OR monthly_salary = 0)
    ORDER BY department NULLS LAST, legal_last_name
  `,
  missing_department: `
    SELECT employee_number, legal_first_name, legal_last_name, personal_email, work_email,
           department, role as job_title, hourly_rate, currency, country
    FROM hriq_employees
    WHERE employment_status = 'active' AND (department IS NULL OR department = '')
    ORDER BY legal_last_name
  `,
  missing_country: `
    SELECT employee_number, legal_first_name, legal_last_name, personal_email, work_email,
           department, role as job_title, country
    FROM hriq_employees
    WHERE employment_status = 'active' AND (country IS NULL OR country = '')
    ORDER BY department NULLS LAST, legal_last_name
  `,
  missing_job_title: `
    SELECT employee_number, legal_first_name, legal_last_name, personal_email, work_email,
           department, role as job_title, country
    FROM hriq_employees
    WHERE employment_status = 'active' AND (role IS NULL OR role = '')
    ORDER BY department NULLS LAST, legal_last_name
  `,
  missing_start_date: `
    SELECT employee_number, legal_first_name, legal_last_name, personal_email, work_email,
           department, role as job_title, start_date, country
    FROM hriq_employees
    WHERE employment_status = 'active' AND start_date IS NULL
    ORDER BY department NULLS LAST, legal_last_name
  `,
  missing_timezone: `
    SELECT employee_number, legal_first_name, legal_last_name, personal_email, work_email,
           department, role as job_title, timezone, country
    FROM hriq_employees
    WHERE employment_status = 'active' AND (timezone IS NULL OR timezone = '')
    ORDER BY department NULLS LAST, legal_last_name
  `,
  missing_payment_method: `
    SELECT employee_number, legal_first_name, legal_last_name, personal_email, work_email,
           department, role as job_title, preferred_payment_method, hourly_rate, currency, country
    FROM hriq_employees
    WHERE employment_status = 'active' AND (preferred_payment_method IS NULL OR preferred_payment_method = '')
    ORDER BY department NULLS LAST, legal_last_name
  `,
  missing_personal_email: `
    SELECT employee_number, legal_first_name, legal_last_name, personal_email, work_email,
           department, role as job_title, country
    FROM hriq_employees
    WHERE employment_status = 'active' AND (personal_email IS NULL OR personal_email = '')
    ORDER BY department NULLS LAST, legal_last_name
  `,
};

function escapeCsv(val: unknown): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]!);
  const headerRow = headers.map(h => escapeCsv(h.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()))).join(",");
  const dataRows = rows.map(row => headers.map(h => escapeCsv(row[h])).join(","));
  return [headerRow, ...dataRows].join("\n");
}

/**
 * Generate a CSV report for a specific health issue.
 * Returns the CSV string for client-side download.
 * Auth-gated to RL super_admins.
 */
export async function generateHealthCsv(issueKey: string): Promise<{ csv: string; filename: string } | { error: string }> {
  const ctx = await getSessionContext();
  if (!ctx || ctx.orgRole !== "super_admin") {
    return { error: "Unauthorized" };
  }

  const query = ISSUE_QUERIES[issueKey];
  if (!query) {
    return { error: `Unknown issue key: ${issueKey}` };
  }

  try {
    const rows = await database.$queryRawUnsafe<Record<string, unknown>[]>(query);
    if (!rows || rows.length === 0) {
      return { error: "No records found for this issue" };
    }
    const csv = toCsv(rows as Record<string, unknown>[]);
    const date = new Date().toISOString().slice(0, 10);
    return { csv, filename: `hriq_health_${issueKey}_${date}.csv` };
  } catch (err) {
    console.error(`[health-reports] CSV generation failed for ${issueKey}:`, err);
    return { error: `Failed to generate report: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Generate a full health report CSV with all issues combined.
 * Each row includes the issue type as a column.
 */
export async function generateFullHealthCsv(): Promise<{ csv: string; filename: string } | { error: string }> {
  const ctx = await getSessionContext();
  if (!ctx || ctx.orgRole !== "super_admin") {
    return { error: "Unauthorized" };
  }

  try {
    const rows = await database.$queryRaw<Record<string, unknown>[]>`
      SELECT
        employee_number, legal_first_name, legal_last_name, personal_email, work_email,
        department, role as job_title, hourly_rate, monthly_salary, currency,
        preferred_payment_method, country, timezone, start_date,
        CASE WHEN (hourly_rate IS NULL OR hourly_rate = 0) AND (monthly_salary IS NULL OR monthly_salary = 0) THEN 'YES' ELSE '' END as missing_rate,
        CASE WHEN department IS NULL OR department = '' THEN 'YES' ELSE '' END as missing_department,
        CASE WHEN country IS NULL OR country = '' THEN 'YES' ELSE '' END as missing_country,
        CASE WHEN role IS NULL OR role = '' THEN 'YES' ELSE '' END as missing_job_title,
        CASE WHEN start_date IS NULL THEN 'YES' ELSE '' END as missing_start_date,
        CASE WHEN timezone IS NULL OR timezone = '' THEN 'YES' ELSE '' END as missing_timezone,
        CASE WHEN preferred_payment_method IS NULL OR preferred_payment_method = '' THEN 'YES' ELSE '' END as missing_payment_method,
        CASE WHEN personal_email IS NULL OR personal_email = '' THEN 'YES' ELSE '' END as missing_personal_email
      FROM hriq_employees
      WHERE employment_status = 'active'
        AND (
          (hourly_rate IS NULL OR hourly_rate = 0) AND (monthly_salary IS NULL OR monthly_salary = 0)
          OR department IS NULL OR department = ''
          OR country IS NULL OR country = ''
          OR role IS NULL OR role = ''
          OR start_date IS NULL
          OR timezone IS NULL OR timezone = ''
          OR preferred_payment_method IS NULL OR preferred_payment_method = ''
          OR personal_email IS NULL OR personal_email = ''
        )
      ORDER BY department NULLS LAST, legal_last_name
    `;

    if (!rows || rows.length === 0) {
      return { error: "No health issues found — all profiles are complete!" };
    }

    const csv = toCsv(rows as Record<string, unknown>[]);
    const date = new Date().toISOString().slice(0, 10);
    return { csv, filename: `hriq_full_health_report_${date}.csv` };
  } catch (err) {
    console.error("[health-reports] Full CSV generation failed:", err);
    return { error: `Failed to generate report: ${err instanceof Error ? err.message : String(err)}` };
  }
}
