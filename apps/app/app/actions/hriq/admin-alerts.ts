"use server";

import { database } from "@repo/database";
import { getSessionContext } from "@repo/auth/session";

export type PendingDocAlert = {
  id: string;
  documentName: string;
  documentType: string;
  createdAt: string;
  employeeId: string;
  employeeName: string;
};

export type AuditFlagAlert = {
  id: string;
  employeeName: string;
  employeeEmail: string;
  totalFlags: number;
  createdAt: string;
};

export type AdminAlertsData = {
  pendingDocs: PendingDocAlert[];
  auditFlags: AuditFlagAlert[];
  /** ISO timestamp of the most recent audit run — used to suppress popup until new data arrives */
  latestAuditRunAt: string | null;
};

/**
 * Fetch alert data for RL super_admins.
 * Returns pending documents and offboarding audit flags.
 * Only callable by super_admin users.
 */
export async function getAdminAlerts(): Promise<AdminAlertsData> {
  const ctx = await getSessionContext();
  if (!ctx || ctx.orgRole !== "super_admin") {
    return { pendingDocs: [], auditFlags: [], latestAuditRunAt: null };
  }

  const [docs, auditRuns, latestRunRows] = await Promise.all([
    // Pending documents
    database.document.findMany({
      where: { status: "pending" },
      select: {
        id: true,
        documentName: true,
        documentType: true,
        createdAt: true,
        employeeId: true,
        employee: {
          select: { legalFirstName: true, legalLastName: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }).catch(() => []),

    // Offboarding audit flags — most recent run per employee, only if still flagged
    // Excludes active employees (e.g. test scans)
    database.$queryRaw<AuditFlagAlert[]>`
      SELECT id, "employeeName", "employeeEmail", "totalFlags", "createdAt"
      FROM (
        SELECT DISTINCT ON (LOWER(r.employee_email))
               r.id, r.employee_name as "employeeName", r.employee_email as "employeeEmail",
               r.total_flags as "totalFlags", r.created_at as "createdAt"
        FROM hriq_offboarding_audit_runs r
        WHERE r.created_at >= NOW() - INTERVAL '7 days'
          AND EXISTS (
            SELECT 1 FROM hriq_employees e
            WHERE e.employment_status IN ('offboarded', 'offboarding_in_progress')
              AND (LOWER(e.work_email) = LOWER(r.employee_email)
                   OR LOWER(e.personal_email) = LOWER(r.employee_email))
          )
        ORDER BY LOWER(r.employee_email), r.created_at DESC
      ) latest
      WHERE "totalFlags" > 0
      ORDER BY "createdAt" DESC
      LIMIT 20
    `.catch(() => []),

    // Latest audit run timestamp — so client can suppress popup until new data
    database.$queryRaw<{ latestAt: Date }[]>`
      SELECT MAX(created_at) as "latestAt" FROM hriq_offboarding_audit_runs
      WHERE created_at >= NOW() - INTERVAL '7 days'
    `.catch(() => []),
  ]);

  const pendingDocs: PendingDocAlert[] = docs.map((d: any) => ({
    id: d.id,
    documentName: d.documentName,
    documentType: d.documentType,
    createdAt: d.createdAt?.toISOString?.() ?? d.createdAt,
    employeeId: d.employeeId,
    employeeName: d.employee
      ? `${d.employee.legalFirstName} ${d.employee.legalLastName}`
      : "Unknown",
  }));

  const auditFlags: AuditFlagAlert[] = (auditRuns as any[]).map((r) => ({
    id: r.id,
    employeeName: r.employeeName,
    employeeEmail: r.employeeEmail,
    totalFlags: Number(r.totalFlags),
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
  }));

  const latestAt = (latestRunRows as any[])?.[0]?.latestAt;
  const latestAuditRunAt = latestAt instanceof Date
    ? latestAt.toISOString()
    : latestAt ? String(latestAt) : null;

  return { pendingDocs, auditFlags, latestAuditRunAt };
}

// ─── Audit History & Details (for Reports page) ────────────────────────────

export type AuditRunSummary = {
  id: string;
  employeeEmail: string;
  employeeName: string;
  runStatus: string;
  totalServicesChecked: number;
  totalFlags: number;
  createdAt: string;
};

export type AuditResultDetail = {
  serviceName: string;
  userFound: boolean;
  isFlagged: boolean;
  userStatus: string;
  userIdOnService: string | null;
  userEmailMatched: string | null;
  flagReason: string | null;
};

/**
 * Fetch recent audit run history for the Reports page.
 * Auth-gated to RL super_admins.
 */
export async function getAuditHistory(limit = 50): Promise<AuditRunSummary[]> {
  const ctx = await getSessionContext();
  if (!ctx || ctx.orgRole !== "super_admin") return [];

  const runs = await database.$queryRaw<AuditRunSummary[]>`
    SELECT id, employee_email as "employeeEmail", employee_name as "employeeName",
           run_status as "runStatus", total_services_checked as "totalServicesChecked",
           total_flags as "totalFlags", created_at as "createdAt"
    FROM hriq_offboarding_audit_runs
    ORDER BY created_at DESC
    LIMIT ${limit}
  `.catch(() => []);

  return (runs as any[]).map((r) => ({
    ...r,
    totalServicesChecked: Number(r.totalServicesChecked ?? 0),
    totalFlags: Number(r.totalFlags ?? 0),
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
  }));
}

/**
 * Fetch detailed results for a specific audit run.
 * Auth-gated to RL super_admins.
 */
export async function getAuditRunDetails(runId: string): Promise<AuditResultDetail[]> {
  const ctx = await getSessionContext();
  if (!ctx || ctx.orgRole !== "super_admin") return [];

  const results = await database.$queryRaw<AuditResultDetail[]>`
    SELECT service_name as "serviceName", user_found as "userFound",
           is_flagged as "isFlagged", user_status as "userStatus",
           user_id_on_service as "userIdOnService",
           user_email_matched as "userEmailMatched",
           flag_reason as "flagReason"
    FROM hriq_offboarding_audit_results
    WHERE audit_run_id = ${runId}::uuid
    ORDER BY is_flagged DESC, service_name ASC
  `.catch(() => []);

  return results as AuditResultDetail[];
}

export type FlaggedEmployee = {
  runId: string;
  employeeName: string;
  employeeEmail: string;
  totalFlags: number;
  createdAt: string;
  services: AuditResultDetail[];
};

/**
 * Fetch the latest flagged employees with their per-service details.
 * Returns only flagged runs from the most recent cron batch.
 * Used as the default view on the Offboarding Audit reports tab.
 */
export async function getLatestAuditFlags(): Promise<FlaggedEmployee[]> {
  const ctx = await getSessionContext();
  if (!ctx || ctx.orgRole !== "super_admin") return [];

  // Get the most recent run per employee, then filter to only those still flagged.
  // Only includes actually offboarded employees (not active/test scans).
  const flaggedRuns = await database.$queryRaw<Array<{
    id: string; employeeName: string; employeeEmail: string;
    totalFlags: number; createdAt: Date;
  }>>`
    SELECT DISTINCT ON (LOWER(r.employee_email))
           r.id, r.employee_name as "employeeName", r.employee_email as "employeeEmail",
           r.total_flags as "totalFlags", r.created_at as "createdAt"
    FROM hriq_offboarding_audit_runs r
    WHERE r.created_at >= NOW() - INTERVAL '7 days'
      AND EXISTS (
        SELECT 1 FROM hriq_employees e
        WHERE e.employment_status IN ('offboarded', 'offboarding_in_progress')
          AND (LOWER(e.work_email) = LOWER(r.employee_email)
               OR LOWER(e.personal_email) = LOWER(r.employee_email))
      )
    ORDER BY LOWER(r.employee_email), r.created_at DESC
  `.catch(() => []);

  // Only show employees whose most recent run still has flags
  const withFlags = (flaggedRuns as any[]).filter((r) => Number(r.totalFlags) > 0);

  if (withFlags.length === 0) return [];

  // Fetch details for each flagged run
  const runIds = withFlags.map((r) => r.id);
  const allDetails = await database.$queryRaw<Array<AuditResultDetail & { auditRunId: string }>>`
    SELECT audit_run_id as "auditRunId",
           service_name as "serviceName", user_found as "userFound",
           is_flagged as "isFlagged", user_status as "userStatus",
           user_id_on_service as "userIdOnService",
           user_email_matched as "userEmailMatched",
           flag_reason as "flagReason"
    FROM hriq_offboarding_audit_results
    WHERE audit_run_id = ANY(${runIds}::uuid[])
    ORDER BY is_flagged DESC, service_name ASC
  `.catch(() => []);

  const detailsByRun = new Map<string, AuditResultDetail[]>();
  for (const d of allDetails as any[]) {
    const list = detailsByRun.get(d.auditRunId) || [];
    list.push({
      serviceName: d.serviceName,
      userFound: d.userFound,
      isFlagged: d.isFlagged,
      userStatus: d.userStatus,
      userIdOnService: d.userIdOnService,
      userEmailMatched: d.userEmailMatched,
      flagReason: d.flagReason,
    });
    detailsByRun.set(d.auditRunId, list);
  }

  return withFlags.map((r) => ({
    runId: r.id,
    employeeName: r.employeeName,
    employeeEmail: r.employeeEmail,
    totalFlags: Number(r.totalFlags),
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    services: detailsByRun.get(r.id) || [],
  }));
}
