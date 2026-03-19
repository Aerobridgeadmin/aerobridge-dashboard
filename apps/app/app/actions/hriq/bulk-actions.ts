"use server";
import { getContractorEmail } from "@/lib/hriq/utils";

import { requireSession } from "@repo/auth/session";
import { database } from "@repo/database";
import { HriqError } from "@/lib/hriq/errors";
import { APP_URL, normalizeAppUrl } from "./constants";

// ─── Types ───────────────────────────────────────────────────────────────────

export type BulkActionResult = {
  total: number;
  sent: number;
  failed: number;
  errors: { employeeId: string; name: string; error: string }[];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getEmployeesForBulk(employeeIds: string[]) {
  return database.employee.findMany({
    where: { id: { in: employeeIds } },
    select: {
      id: true,
      legalFirstName: true,
      legalLastName: true,
      preferredName: true,
      personalEmail: true,
      workEmail: true,
      department: true,
      employmentStatus: true,
    },
  });
}

function getEmail(emp: { workEmail: string | null; personalEmail: string | null }): string | null {
  return getContractorEmail(emp);
}

function getDisplayName(emp: { preferredName: string | null; legalFirstName: string; legalLastName: string }): string {
  return emp.preferredName || `${emp.legalFirstName} ${emp.legalLastName}`;
}

// ─── Bulk Send Dashboard Link ────────────────────────────────────────────────

/**
 * Send the dashboard login link to selected contractors.
 * Uses the logged-in admin's session for `sendViaGmail`.
 */
export async function bulkSendDashboardLink(
  employeeIds: string[],
  from?: string,
): Promise<BulkActionResult> {
  await requireSession();

  if (employeeIds.length === 0) throw new HriqError("HRIQ-5001", "No contractors selected");
  if (employeeIds.length > 200) throw new HriqError("HRIQ-5002", "Maximum 200 contractors per bulk action");

  const employees = await getEmployeesForBulk(employeeIds);
  const appUrl = normalizeAppUrl(APP_URL);
  const dashboardUrl = `${appUrl}/sign-in`;
  const { sendViaGmail } = await import("./send-email");
  const { dashboardLinkEmail } = await import("./email-templates");
  const { buildEmail } = await import("./email-template-engine");

  const result: BulkActionResult = { total: employees.length, sent: 0, failed: 0, errors: [] };

  for (const emp of employees) {
    const email = getEmail(emp);
    const name = getDisplayName(emp);
    if (!email) {
      result.failed++;
      result.errors.push({ employeeId: emp.id, name, error: "No email address on file" });
      continue;
    }
    try {
      const html = dashboardLinkEmail(name, dashboardUrl);
      const fallbackSubject = "Your Dashboard Link — Remote Leverage";
      const rendered = await buildEmail("dashboard_link_bulk", { name, dashboard_url: dashboardUrl }, html, fallbackSubject);
      await sendViaGmail(email, rendered.subject, rendered.html, from);
      result.sent++;
    } catch (err) {
      result.failed++;
      result.errors.push({
        employeeId: emp.id,
        name,
        error: err instanceof Error ? err.message : "Failed to send",
      });
    }
  }

  return result;
}

// ─── Bulk Send Custom Email ──────────────────────────────────────────────────

/**
 * Send a custom branded email to selected contractors.
 * Admin provides subject, body (plain text or HTML), and optional CTA button.
 */
export async function bulkSendCustomEmail(
  employeeIds: string[],
  opts: {
    subject: string;
    body: string;
    ctaLabel?: string;
    ctaUrl?: string;
    from?: string;
  },
): Promise<BulkActionResult> {
  await requireSession();

  if (employeeIds.length === 0) throw new HriqError("HRIQ-5001", "No contractors selected");
  if (employeeIds.length > 200) throw new HriqError("HRIQ-5002", "Maximum 200 contractors per bulk action");
  if (!opts.subject?.trim()) throw new HriqError("HRIQ-5003", "Subject is required");
  if (!opts.body?.trim()) throw new HriqError("HRIQ-5004", "Body is required");

  const employees = await getEmployeesForBulk(employeeIds);
  const { sendViaGmail } = await import("./send-email");
  const { genericBulkEmail, esc } = await import("./email-templates");

  const result: BulkActionResult = { total: employees.length, sent: 0, failed: 0, errors: [] };

  for (const emp of employees) {
    const email = getEmail(emp);
    const name = getDisplayName(emp);
    if (!email) {
      result.failed++;
      result.errors.push({ employeeId: emp.id, name, error: "No email address on file" });
      continue;
    }
    try {
      // Convert plain-text newlines to <br/> if the body doesn't contain HTML tags
      const bodyHtml = /<[a-z][\s\S]*>/i.test(opts.body)
        ? opts.body
        : esc(opts.body).replace(/\n/g, "<br/>");

      const html = genericBulkEmail(name, bodyHtml, opts.ctaLabel, opts.ctaUrl);
      await sendViaGmail(email, opts.subject, html, opts.from);
      result.sent++;
    } catch (err) {
      result.failed++;
      result.errors.push({
        employeeId: emp.id,
        name,
        error: err instanceof Error ? err.message : "Failed to send",
      });
    }
  }

  return result;
}

// ─── Bulk Resend Onboarding Email ────────────────────────────────────────────

/**
 * Resend the onboarding welcome email to selected contractors.
 */
export async function bulkResendOnboarding(
  employeeIds: string[],
): Promise<BulkActionResult> {
  await requireSession();

  if (employeeIds.length === 0) throw new HriqError("HRIQ-5001", "No contractors selected");
  if (employeeIds.length > 200) throw new HriqError("HRIQ-5002", "Maximum 200 contractors per bulk action");

  const { resendOnboardingEmail } = await import("./onboarding");
  const employees = await getEmployeesForBulk(employeeIds);

  const result: BulkActionResult = { total: employees.length, sent: 0, failed: 0, errors: [] };

  for (const emp of employees) {
    const name = getDisplayName(emp);
    try {
      await resendOnboardingEmail(emp.id);
      result.sent++;
    } catch (err) {
      result.failed++;
      result.errors.push({
        employeeId: emp.id,
        name,
        error: err instanceof Error ? err.message : "Failed to resend",
      });
    }
  }

  return result;
}

// ─── Bulk Send Dashboard Invite (Provision + Credentials) ────────────────────

/**
 * Provision accounts (if needed) and send dashboard credential emails
 * to selected contractors. For already-provisioned contractors, this
 * resets their password to DEFAULT_PASSWORD and re-sends credentials.
 */
export async function bulkSendDashboardInvite(
  employeeIds: string[],
  fromEmail?: string,
): Promise<BulkActionResult> {
  // Validate auth ONCE at the top — sendDashboardInviteEmailSystem doesn't need per-call sessions
  const { requireRole } = await import("@repo/auth/session");
  await requireRole("super_admin", "admin");

  if (employeeIds.length === 0) throw new HriqError("HRIQ-5001", "No contractors selected");
  if (employeeIds.length > 200) throw new HriqError("HRIQ-5002", "Maximum 200 contractors per bulk action");

  // Use the system variant to avoid cascading requireRole() failures in tight loops
  const { sendDashboardInviteEmailSystem } = await import("./contractor-dashboard");
  const employees = await getEmployeesForBulk(employeeIds);

  const result: BulkActionResult = { total: employees.length, sent: 0, failed: 0, errors: [] };

  for (const emp of employees) {
    const name = getDisplayName(emp);
    const email = getEmail(emp);
    if (!email) {
      result.failed++;
      result.errors.push({ employeeId: emp.id, name, error: "No email address on file" });
      continue;
    }
    try {
      const sendResult = await sendDashboardInviteEmailSystem(emp.id);
      if (sendResult && typeof sendResult === "object" && "error" in sendResult) {
        result.failed++;
        result.errors.push({ employeeId: emp.id, name, error: (sendResult as any).error });
      } else {
        result.sent++;
      }
    } catch (err) {
      result.failed++;
      result.errors.push({
        employeeId: emp.id,
        name,
        error: err instanceof Error ? err.message : "Failed to send invite",
      });
    }
  }

  return result;
}
// ─── Bulk Invite to Cadana Org ──────────────────────────────────────────────

/**
 * Create contractors in Cadana org (if not already there) and send
 * invite email with setup instructions.
 */
export async function bulkInviteToCadana(
  employeeIds: string[],
): Promise<BulkActionResult> {
  await requireSession();

  if (employeeIds.length === 0) throw new HriqError("HRIQ-5001", "No contractors selected");
  if (employeeIds.length > 200) throw new HriqError("HRIQ-5002", "Maximum 200 contractors per bulk action");

  const { sendCadanaInvite } = await import("./cadana-setup");
  const employees = await getEmployeesForBulk(employeeIds);

  const result: BulkActionResult = { total: employees.length, sent: 0, failed: 0, errors: [] };

  for (const emp of employees) {
    const name = getDisplayName(emp);
    const email = getEmail(emp);
    if (!email) {
      result.failed++;
      result.errors.push({ employeeId: emp.id, name, error: "No email address on file" });
      continue;
    }
    try {
      const sendResult = await sendCadanaInvite(emp.id);
      if (!sendResult.success) {
        result.failed++;
        result.errors.push({ employeeId: emp.id, name, error: sendResult.message });
      } else {
        result.sent++;
      }
    } catch (err) {
      result.failed++;
      result.errors.push({
        employeeId: emp.id,
        name,
        error: err instanceof Error ? err.message : "Failed to invite to Cadana",
      });
    }
  }

  return result;
}
