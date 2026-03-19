"use server";
import { getContractorEmail } from "@/lib/hriq/utils";

import { requireRole, requireOrg } from "@repo/auth/session";
import { database } from "@repo/database";
import { revalidatePath } from "next/cache";
import { HriqError } from "@/lib/hriq/errors";
import { RL_ORG_ID } from "./constants";

//  Types 

export type OffboardingEntry = {
  id: string;
  legalFirstName: string;
  legalLastName: string;
  personalEmail: string | null;
  workEmail: string | null;
  jobTitle: string | null;
  department: string | null;
  employmentType: string;
  employmentStatus: string;
  offboardingStatus: string;
  timeDoctorEmail: string | null;
  startDate: Date | null;
  endDate: Date | null;
  organization: { name: string } | null;
  createdAt: Date;
  updatedAt: Date;
  // Offboarding step tracking (stored in offboardingStatus field as JSON-like states)
  offboardingSteps: OffboardingStepState[];
};

export type OffboardingStepState = {
  key: string;
  label: string;
  status: "pending" | "in_progress" | "completed" | "skipped" | "failed" | "scheduled";
  completedAt: string | null;
  error: string | null;
  delayMinutes?: number;
  scheduledFor?: string | null;
};

const DEFAULT_OFFBOARDING_STEPS: Omit<OffboardingStepState, "completedAt" | "error">[] = [
  // Immediate steps — run right away
  { key: "it_ticket", label: "Submit Urgent IT Ticket (Access Removal)", status: "pending" },
  { key: "td_report_download", label: "Download Time Doctor Report to Documents", status: "pending" },
  { key: "time_doctor_removal", label: "Remove from Time Doctor", status: "pending" },
  { key: "recruitcrm_status", label: "Update RecruitCRM Candidate Status", status: "pending" },
  // Delayed steps
  { key: "offboarding_notification", label: "Send Offboarding Email (1hr delay)", status: "pending", delayMinutes: 60 },
  { key: "slack_removal", label: "MANUAL: Remove from Slack Admin Panel", status: "pending", delayMinutes: 60 },
  { key: "disable_dashboard", label: "Disable Dashboard Access (48hr grace period)", status: "pending", delayMinutes: 2880 },
  { key: "final_review", label: "Final Review & Complete", status: "pending" },
];

/**
 * Build the default offboarding steps for an employee.
 * Exported so changeEmployeeStatus() can also initialize steps.
 */
export async function buildDefaultOffboardingSteps(timeDoctorEmail: string | null, recruitCrmSlug?: string | null): Promise<OffboardingStepState[]> {
  const now = new Date();
  return DEFAULT_OFFBOARDING_STEPS.map((s) => ({
    ...s,
    completedAt: null,
    error: null,
    // Set scheduledFor for delayed steps (1 hour from now)
    ...(s.delayMinutes ? {
      status: "scheduled" as const,
      scheduledFor: new Date(now.getTime() + s.delayMinutes * 60_000).toISOString(),
    } : {}),
    // Skip Time Doctor if no email configured
    ...(s.key === "time_doctor_removal" && !timeDoctorEmail
      ? { status: "completed" as const, completedAt: new Date().toISOString(), error: "No Time Doctor email — N/A" }
      : {}),
    // Skip TD report download if no email configured
    ...(s.key === "td_report_download" && !timeDoctorEmail
      ? { status: "completed" as const, completedAt: new Date().toISOString(), error: "No Time Doctor email — N/A" }
      : {}),
    // Auto-complete RecruitCRM if no slug linked (not applicable)
    ...(s.key === "recruitcrm_status" && !recruitCrmSlug
      ? { status: "completed" as const, completedAt: new Date().toISOString(), error: "No RecruitCRM record — N/A" }
      : {}),
  }));
}

//  Helpers 

function parseOffboardingSteps(raw: string | null): OffboardingStepState[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    // Inject any missing steps from DEFAULT_OFFBOARDING_STEPS (handles adding new steps to existing offboardings)
    const existingKeys = new Set(parsed.map((s: OffboardingStepState) => s.key));
    for (const def of DEFAULT_OFFBOARDING_STEPS) {
      if (!existingKeys.has(def.key)) {
        // Insert before final_review if it exists, otherwise append
        const finalIdx = parsed.findIndex((s: OffboardingStepState) => s.key === "final_review");
        const newStep: OffboardingStepState = { ...def, completedAt: null, error: null };
        if (finalIdx >= 0) {
          parsed.splice(finalIdx, 0, newStep);
        } else {
          parsed.push(newStep);
        }
      }
    }

    return parsed;
  } catch {
    return [];
  }
}

function calculateProgress(steps: OffboardingStepState[]): number {
  if (steps.length === 0) return 0;
  const completed = steps.filter((s) => s.status === "completed" || s.status === "skipped").length;
  return Math.round((completed / steps.length) * 100);
}

//  Get Offboarding Pipeline 

export async function getOffboardingPipeline(): Promise<OffboardingEntry[]> {
  const session = await requireRole("super_admin", "admin");

  const isRLOrg = session.orgId === RL_ORG_ID;
  const orgFilter = (session.orgRole === "super_admin" && isRLOrg) ? {} : { organizationId: session.orgId! };

  const employees = await database.employee.findMany({
    where: {
      ...orgFilter,
      employmentStatus: "offboarding_in_progress",
    },
    select: {
      id: true,
      legalFirstName: true,
      legalLastName: true,
      personalEmail: true,
      workEmail: true,
      jobTitle: true,
      department: true,
      employmentType: true,
      employmentStatus: true,
      offboardingStatus: true,
      timeDoctorEmail: true,
      recruitCrmSlug: true,
      startDate: true,
      endDate: true,
      createdAt: true,
      updatedAt: true,
      organization: { select: { name: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  // Auto-initialize steps for employees that entered offboarding via status change
  // (changeEmployeeStatus sets employmentStatus but may not have created step JSON)
  const results: OffboardingEntry[] = [];
  const initUpdates: Array<{ id: string; json: string }> = [];

  for (const emp of employees) {
    let steps = parseOffboardingSteps(emp.offboardingStatus === "not_started" ? null : emp.offboardingStatus);

    // If no steps exist, this employee entered offboarding without step initialization — fix it now
    if (steps.length === 0) {
      steps = await buildDefaultOffboardingSteps(emp.timeDoctorEmail, emp.recruitCrmSlug);
      initUpdates.push({ id: emp.id, json: JSON.stringify(steps) });
    }

    results.push({ ...emp, offboardingSteps: steps });
  }

  // Batch-write any auto-initialized steps back to DB
  if (initUpdates.length > 0) {
    await Promise.allSettled(
      initUpdates.map(({ id, json }) =>
        database.employee.update({ where: { id }, data: { offboardingStatus: json } })
      )
    );
  }

  return results;
}

//  Initiate Offboarding 

export async function initiateOffboarding(
  employeeId: string,
  opts?: { reason?: string; endDate?: string; itRecipientEmail?: string }
): Promise<{ success: true; steps: OffboardingStepState[] } | { success: false; error: string }> {
  try {
    const session = await requireOrg();

    const employee = await database.employee.findFirst({
      where: session.orgRole === "super_admin" ? { id: employeeId } : { id: employeeId, organizationId: session.orgId },
      select: {
        id: true,
        employmentStatus: true,
        timeDoctorEmail: true,
        recruitCrmSlug: true,
        legalFirstName: true,
        legalLastName: true,
        linkedUserId: true,
        workEmail: true,
        personalEmail: true,
      },
    });

    if (!employee) return { success: false, error: "Employee not found" };

    if (employee.employmentStatus === "offboarding_in_progress") {
      return { success: false, error: "Employee is already in offboarding" };
    }

    if (employee.employmentStatus === "offboarded") {
      return { success: false, error: "Employee is already offboarded" };
    }

    // Do NOT ban Supabase auth immediately — contractor gets 48h grace period to access final pay stubs & documents.
    // Auth ban happens via the "disable_dashboard" step (48h grace period) or on completeOffboarding.
    // Remove from approved_emails immediately so they can't do Google SSO re-auth
    const emails = [employee.workEmail, employee.personalEmail].filter(Boolean) as string[];
    for (const email of emails) {
      try {
        await database.$executeRaw`DELETE FROM approved_emails WHERE email = ${email}`;
      } catch (err) { console.warn("[offboarding:initiateOffboarding] Suppressed error:", err); }
    }
    if (emails.length > 0) {
      console.log(`[Offboarding] Removed approved_emails for ${emails.join(", ")} (dashboard stays active 48h grace period)`);
    }

    // Initialize offboarding steps using shared helper
    const steps = await buildDefaultOffboardingSteps(employee.timeDoctorEmail, employee.recruitCrmSlug);

    // Update employee status
    await database.employee.update({
      where: { id: employeeId },
      data: {
        employmentStatus: "offboarding_in_progress",
        offboardingStatus: JSON.stringify(steps),
        endDate: opts?.endDate ? new Date(opts.endDate as any) : new Date(),
      },
    });

    // Audit log
    try {
      await database.auditLog.create({
        data: {
          organizationId: session.orgId,
          actorType: "user",
          actorUserId: session.userId,
          action: "employee.offboarding_started",
          objectType: "employee",
          objectId: employeeId,
          newValue: { reason: opts?.reason, endDate: opts?.endDate },
        },
      });
    } catch (auditErr) {
      console.error("[HRIQ] Audit log write failed (non-blocking):", auditErr);
    }

    revalidatePath("/[orgSlug]/hiring", "page");
    revalidatePath("/[orgSlug]/employees", "page");
    revalidatePath(`/[orgSlug]/employees/${employeeId}`, "page");

    return { success: true, steps };
  } catch (err) {
    console.error("[Offboarding] Failed to initiate:", err);
    import("@/lib/hriq/sentry").then(({ captureServerException }) => captureServerException(err, { action: "initiateOffboarding" })).catch(() => {});
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

//  Send Offboarding Notification Email to Contractor 

export async function offboardSendNotificationEmail(
  employeeId: string
): Promise<{ success: boolean; message: string }> {
  try {
    const session = await requireOrg();

    const employee = await database.employee.findFirst({
      where: session.orgRole === "super_admin" ? { id: employeeId } : { id: employeeId, organizationId: session.orgId },
      select: {
        id: true,
        legalFirstName: true,
        legalLastName: true,
        personalEmail: true,
        workEmail: true,
        endDate: true,
        offboardingStatus: true,
        organization: { select: { name: true } },
      },
    });

    if (!employee) return { success: false, message: "Employee not found" };

    const recipientEmail = getContractorEmail(employee);
    if (!recipientEmail) {
      // No email to send to — auto-complete
      const steps = parseOffboardingSteps(employee.offboardingStatus);
      const step = steps.find((s) => s.key === "offboarding_notification");
      if (step) {
        step.status = "completed";
        step.completedAt = new Date().toISOString();
        step.error = "No email address on file — N/A";
      }
      await database.employee.update({
        where: { id: employeeId },
        data: { offboardingStatus: JSON.stringify(steps) },
      });
      revalidatePath("/[orgSlug]/hiring", "page");
      return { success: true, message: "No email address on file — completed automatically." };
    }

    const contractorName = `${employee.legalFirstName} ${employee.legalLastName}`;
    const endDateStr = employee.endDate
      ? new Date(employee.endDate as any).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
      : "effective immediately";

    // Send the email
    const { sendViaGmail } = await import("./send-email");
    const { offboardingNotificationEmail } = await import("./email-templates");
    const { buildEmail } = await import("./email-template-engine");

    const html = offboardingNotificationEmail(contractorName, {
      endDate: endDateStr,
      orgName: employee.organization?.name ?? "Remote Leverage",
      timesheetNote: true,
    });

    const fallbackSubject = "Offboarding Notice — Remote Leverage";
    const rendered = await buildEmail("offboarding_notice", { name: contractorName, org_name: employee.organization?.name ?? "Remote Leverage", end_date: endDateStr, reason: "" }, html, fallbackSubject);

    try {
      await sendViaGmail(
        recipientEmail,
        rendered.subject,
        rendered.html
      );
    } catch (emailErr) {
      console.error("[HRIQ] Email send failed (non-blocking):", emailErr);
    }

    // Update step status
    const steps = parseOffboardingSteps(employee.offboardingStatus);
    const step = steps.find((s) => s.key === "offboarding_notification");
    if (step) {
      step.status = "completed";
      step.completedAt = new Date().toISOString();
    }
    await database.employee.update({
      where: { id: employeeId },
      data: { offboardingStatus: JSON.stringify(steps) },
    });

    try {
      await database.auditLog.create({
        data: {
          organizationId: session.orgId,
          actorType: "user",
          actorUserId: session.userId,
          action: "employee.offboarding_email_sent",
          objectType: "employee",
          objectId: employeeId,
          newValue: { email: recipientEmail, endDate: endDateStr },
        },
      });
    } catch (auditErr) {
      console.error("[HRIQ] Audit log write failed (non-blocking):", auditErr);
    }

    revalidatePath("/[orgSlug]/hiring", "page");
    return { success: true, message: `Offboarding notification sent to ${contractorName} (${recipientEmail}).` };
  } catch (err) {
    console.error("[Offboarding] Notification email failed:", err);

    // Try to update step as failed
    try {
      const employee = await database.employee.findFirst({
        where: { id: employeeId },
        select: { offboardingStatus: true },
      });
      if (employee) {
        const steps = parseOffboardingSteps(employee.offboardingStatus);
        const step = steps.find((s) => s.key === "offboarding_notification");
        if (step) {
          step.status = "failed";
          step.error = err instanceof Error ? err.message : "Unknown error";
        }
        await database.employee.update({
          where: { id: employeeId },
          data: { offboardingStatus: JSON.stringify(steps) },
        });
      }
    } catch (err) { console.warn("[offboarding:offboardSendNotificationEmail] Suppressed error:", err); }

    return { success: false, message: err instanceof Error ? err.message : "Unknown error" };
  }
}

//  Remove from Time Doctor 

export async function offboardRemoveFromTimeDoctor(
  employeeId: string
): Promise<{ success: boolean; message: string }> {
  try {
    const session = await requireOrg();

    const employee = await database.employee.findFirst({
      where: session.orgRole === "super_admin" ? { id: employeeId } : { id: employeeId, organizationId: session.orgId },
      select: { id: true, timeDoctorEmail: true, offboardingStatus: true, legalFirstName: true, legalLastName: true },
    });

    if (!employee) return { success: false, message: "Employee not found" };

    const steps = parseOffboardingSteps(employee.offboardingStatus);
    const tdStep = steps.find((s) => s.key === "time_doctor_removal");

    if (!employee.timeDoctorEmail) {
      // No TD email — auto-complete
      if (tdStep) {
        tdStep.status = "completed";
        tdStep.completedAt = new Date().toISOString();
        tdStep.error = "No Time Doctor email — N/A";
      }
      await database.employee.update({
        where: { id: employeeId },
        data: { offboardingStatus: JSON.stringify(steps) },
      });
      revalidatePath("/[orgSlug]/hiring", "page");
      return { success: true, message: "No Time Doctor email configured — completed automatically." };
    }

    // Call Time Doctor API to deactivate
    if (tdStep) tdStep.status = "in_progress";
    await database.employee.update({
      where: { id: employeeId },
      data: { offboardingStatus: JSON.stringify(steps) },
    });

    const { deactivateTDUser } = await import("@repo/integrations/timedoctor");
    const result = await deactivateTDUser(employee.timeDoctorEmail);

    if (result.success) {
      if (tdStep) {
        tdStep.status = "completed";
        tdStep.completedAt = new Date().toISOString();
      }
      await database.employee.update({
        where: { id: employeeId },
        data: { offboardingStatus: JSON.stringify(steps) },
      });

      try {
        await database.auditLog.create({
          data: {
            organizationId: session.orgId,
            actorType: "user",
            actorUserId: session.userId,
            action: "employee.offboarding_td_removed",
            objectType: "employee",
            objectId: employeeId,
            newValue: { email: employee.timeDoctorEmail, tdAction: result.action },
          },
        });
      } catch (auditErr) {
        console.error("[HRIQ] Audit log write failed (non-blocking):", auditErr);
      }

      revalidatePath("/[orgSlug]/hiring", "page");
      const name = `${employee.legalFirstName} ${employee.legalLastName}`;
      if (result.action === "not_found") return { success: true, message: `${name} was not found in Time Doctor — step completed.` };
      if (result.action === "already_inactive") return { success: true, message: `${name} was already inactive in Time Doctor — step completed.` };
      return { success: true, message: `${name} removed from Time Doctor successfully.` };
    }

    // Failed
    if (tdStep) {
      tdStep.status = "failed";
      tdStep.error = result.error ?? "Unknown error";
    }
    await database.employee.update({
      where: { id: employeeId },
      data: { offboardingStatus: JSON.stringify(steps) },
    });
    revalidatePath("/[orgSlug]/hiring", "page");
    return { success: false, message: `Failed to remove from Time Doctor: ${result.error}` };
  } catch (err) {
    console.error("[Offboarding] TD removal failed:", err);
    import("@/lib/hriq/sentry").then(({ captureServerException }) => captureServerException(err, { action: "offboardRemoveFromTimeDoctor" })).catch(() => {});
    return { success: false, message: err instanceof Error ? err.message : "Unknown error" };
  }
}

// -- Download Time Doctor Report & Save to Employee Documents ─────────────────

export async function offboardDownloadTDReport(
  employeeId: string
): Promise<{ success: boolean; message: string }> {
  try {
    const session = await requireOrg();

    const employee = await database.employee.findFirst({
      where: session.orgRole === "super_admin" ? { id: employeeId } : { id: employeeId, organizationId: session.orgId },
      select: {
        id: true,
        legalFirstName: true,
        legalLastName: true,
        timeDoctorEmail: true,
        startDate: true,
        offboardingStatus: true,
      },
    });

    if (!employee) return { success: false, message: "Employee not found" };
    if (!employee.timeDoctorEmail) {
      // Mark step as completed with N/A note
      const steps = parseOffboardingSteps(employee.offboardingStatus as string | null);
      const step = steps.find((s) => s.key === "td_report_download");
      if (step && step.status !== "completed") {
        step.status = "completed";
        step.completedAt = new Date().toISOString();
        step.error = "No Time Doctor email — N/A";
        await database.employee.update({ where: { id: employeeId }, data: { offboardingStatus: JSON.stringify(steps) } });
      }
      return { success: true, message: "No Time Doctor email — skipped" };
    }

    // Fetch TD worklogs for the employee's entire tenure
    const { syncTimeDoctorForPeriod } = await import("@repo/integrations/timedoctor");
    const startDate = employee.startDate
      ? new Date(employee.startDate).toISOString().split("T")[0]
      : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]; // fallback: last year
    const endDate = new Date().toISOString().split("T")[0];

    let reportText = `Time Doctor Activity Report\n`;
    reportText += `Employee: ${employee.legalFirstName} ${employee.legalLastName}\n`;
    reportText += `TD Email: ${employee.timeDoctorEmail}\n`;
    reportText += `Period: ${startDate} to ${endDate}\n`;
    reportText += `Generated: ${new Date().toISOString()}\n`;
    reportText += `${"=".repeat(60)}\n\n`;

    try {
      const result = await Promise.race([
        syncTimeDoctorForPeriod(
          startDate,
          endDate,
          [{ id: employee.id, timeDoctorEmail: employee.timeDoctorEmail }]
        ),
        new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error("TD API timeout (30s)")), 30000)
        ),
      ]);

      if (result && result.entries.length > 0) {
        const entry = result.entries[0];
        reportText += `Total Hours: ${entry.totalHours.toFixed(2)}\n`;
        reportText += `Days Tracked: ${entry.dailyEntries.length}\n\n`;
        reportText += `Date           | Hours  | Time In  | Time Out\n`;
        reportText += `${"-".repeat(55)}\n`;
        for (const day of entry.dailyEntries) {
          const h = day.hours.toFixed(2).padStart(6);
          const tin = (day.timeIn || "-").padEnd(8);
          const tout = (day.timeOut || "-").padEnd(8);
          reportText += `${day.date}    | ${h} | ${tin} | ${tout}\n`;
        }
      } else {
        reportText += "No activity data found in Time Doctor for this period.\n";
        if (result?.unmatched?.length) {
          reportText += `\nNote: TD email ${employee.timeDoctorEmail} did not match any active TD user.\n`;
        }
      }
    } catch (tdErr) {
      reportText += `\nTime Doctor API error: ${tdErr instanceof Error ? tdErr.message : "Unknown error"}\n`;
      reportText += "Report may be incomplete.\n";
    }

    // Save the report as a document record on the employee (with dedup)
    const fullName = `${employee.legalFirstName} ${employee.legalLastName}`.trim();
    const tdDocName = `TD Report - ${fullName} - ${endDate}`;
    const existingTdDoc = await database.document.findFirst({
      where: { employeeId: employee.id, documentType: "time_doctor_report", documentName: tdDocName },
    });
    if (existingTdDoc) {
      await database.document.update({
        where: { id: existingTdDoc.id },
        data: { description: reportText, verifiedAt: new Date() },
      });
    } else {
      await database.document.create({
        data: {
          employeeId: employee.id,
          documentType: "time_doctor_report",
          documentName: tdDocName,
          description: reportText,
          status: "approved",
          verifiedAt: new Date(),
        },
      });
    }

    // Update offboarding step
    const steps = parseOffboardingSteps(employee.offboardingStatus as string | null);
    const step = steps.find((s) => s.key === "td_report_download");
    if (step) {
      step.status = "completed";
      step.completedAt = new Date().toISOString();
      step.error = null;
      await database.employee.update({ where: { id: employeeId }, data: { offboardingStatus: JSON.stringify(steps) } });
    }

    return { success: true, message: `TD report saved to documents for ${fullName}` };
  } catch (err) {
    console.error("[Offboarding] TD report download failed:", err);
    import("@/lib/hriq/sentry").then(({ captureServerException }) => captureServerException(err, { action: "offboardDownloadTDReport" })).catch(() => {});
    // Mark step as failed but don't block offboarding
    try {
      const emp = await database.employee.findUnique({ where: { id: employeeId }, select: { offboardingStatus: true } });
      const steps = parseOffboardingSteps(emp?.offboardingStatus as string | null);
      const step = steps.find((s) => s.key === "td_report_download");
      if (step && step.status !== "completed") {
        step.status = "failed";
        step.error = err instanceof Error ? err.message : "Unknown error";
        await database.employee.update({ where: { id: employeeId }, data: { offboardingStatus: JSON.stringify(steps) } });
      }
    } catch (err) { console.warn("[offboarding:offboardDownloadTDReport] ignore:", err); }
    return { success: false, message: err instanceof Error ? err.message : "Unknown error" };
  }
}

// -- Remove from Slack (automated via Slack API) ──────────────────────────────

export async function offboardRemoveFromSlack(
  employeeId: string
): Promise<{ success: boolean; message: string }> {
  try {
    const session = await requireOrg();

    const employee = await database.employee.findFirst({
      where: session.orgRole === "super_admin" ? { id: employeeId } : { id: employeeId, organizationId: session.orgId },
      select: {
        id: true,
        legalFirstName: true,
        legalLastName: true,
        workEmail: true,
        personalEmail: true,
        offboardingStatus: true,
      },
    });

    if (!employee) return { success: false, message: "Employee not found" };

    const steps = parseOffboardingSteps(employee.offboardingStatus);
    const slackStep = steps.find((s) => s.key === "slack_removal");

    let autoMessage = "Slack removal confirmed manually";

    // Attempt automatic deactivation via Slack API if bot token is configured
    const slackBotToken = process.env.SLACK_BOT_TOKEN;
    if (slackBotToken) {
      const email = getContractorEmail(employee);
      if (email) {
        try {
          // Look up Slack user by email
          const lookupRes = await fetch(
            `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`,
            { headers: { Authorization: `Bearer ${slackBotToken}` }, signal: AbortSignal.timeout(8000) }
          );
          const lookupData = await lookupRes.json();

          if (lookupData.ok && lookupData.user?.id) {
            // Deactivate (disable) the Slack user
            const deactivateRes = await fetch("https://slack.com/api/users.setInactive", {
              signal: AbortSignal.timeout(8000),
              method: "POST",
              headers: {
                Authorization: `Bearer ${slackBotToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ user: lookupData.user.id }),
            });
            const deactivateData = await deactivateRes.json();

            if (deactivateData.ok) {
              autoMessage = `Slack profile deactivated automatically for ${email}`;
              console.info(`[Offboarding] Slack deactivated for ${email} (${lookupData.user.id})`);
            } else {
              // users.setInactive requires Legacy token on free workspaces — fall back to SCIM if available
              console.warn(`[Offboarding] Slack deactivate failed: ${deactivateData.error} — marking manually`);
              autoMessage = `Slack removal marked (auto-deactivate failed: ${deactivateData.error})`;
            }
          } else {
            console.info(`[Offboarding] Slack user not found for ${email} — marking step complete`);
            autoMessage = `Slack user not found for ${email} — step marked complete`;
          }
        } catch (slackErr) {
          console.warn("[Offboarding] Slack API call failed (non-blocking):", slackErr);
          autoMessage = "Slack removal marked (API unavailable)";
        }
      }
    }

    if (slackStep) {
      slackStep.status = "completed";
      slackStep.completedAt = new Date().toISOString();
    }

    await database.employee.update({
      where: { id: employeeId },
      data: { offboardingStatus: JSON.stringify(steps) },
    });

    try {
      await database.auditLog.create({
        data: {
          organizationId: session.orgId,
          actorType: "user",
          actorUserId: session.userId,
          action: "employee.offboarding_slack_removed",
          objectType: "employee",
          objectId: employeeId,
          newValue: { note: autoMessage },
        },
      });
    } catch (auditErr) {
      console.error("[HRIQ] Audit log write failed (non-blocking):", auditErr);
    }

    revalidatePath("/[orgSlug]/hiring", "page");
    return {
      success: true,
      message: `${employee.legalFirstName} ${employee.legalLastName}: ${autoMessage}`,
    };
  } catch (err) {
    console.error("[Offboarding] Slack removal failed:", err);
    return { success: false, message: err instanceof Error ? err.message : "Unknown error" };
  }
}

//  Send IT Offboarding Ticket via Freshdesk 

const FRESHDESK_DOMAIN = "remoteleverage";
const FRESHDESK_API_KEY = process.env.FRESHDESK_API_KEY ?? "";

// Department-specific offboarding checklists from Operations Manual
// Slack and Time Doctor removal are handled as separate automated steps
const OFFBOARDING_CHECKLISTS: Record<string, string[]> = {
  hiring: [
    "Remove Slack Commands: Onboarding Link",
    "Remove from Calendly (delete events, remove from rotations)",
    "Remove from Recruit CRM (deactivate seat)",
    "Remove from Zoom (delete account, free up seat)",
    "Remove as a sender from admin@remoteleverage.com",
    "Google Admin: Delete email and transfer all company data to their manager",
    "Add their email as an Alias to their manager's email",
    "Change the QuickBooks password for spectator@remoteleverage.com",
    "OpenPhone: Remove profile & number (add calendar note to fully delete in 20 days)",
  ],
  recruitment: [
    "Remove from Recruit CRM (deactivate seat)",
    "Google Admin: Delete email and transfer all company data to their manager",
  ],
  revops: [
    "Remove from Recruit CRM (deactivate seat)",
    "Remove from Symbio if applicable",
    "Remove from QuickBooks / revoke access",
    "Google Admin: Delete email and transfer all company data to their manager",
    "Add their email as an Alias to their manager's email",
    "OpenPhone: Remove profile & number (add calendar note to fully delete in 20 days)",
  ],
  revenue: [
    "Remove from Recruit CRM (deactivate seat)",
    "Remove from Symbio if applicable",
    "Remove from QuickBooks / revoke access",
    "Google Admin: Delete email and transfer all company data to their manager",
    "Add their email as an Alias to their manager's email",
    "OpenPhone: Remove profile & number (add calendar note to fully delete in 20 days)",
  ],
  sales: [
    "Remove Slack Commands: Referral Code",
    "Remove from Calendly (delete events, remove from rotations)",
    "Remove from Fathom (deactivate account)",
    "Remove from Recruit CRM (deactivate seat)",
    "Remove from QuickBooks / revoke access",
    "Remove as a sender from admin@remoteleverage.com",
    "Google Admin: Delete email and transfer all company data to their manager",
    "Add their email as an Alias to their manager's email",
    "Change the QuickBooks password for spectator@remoteleverage.com",
    "OpenPhone: Remove profile & number (add calendar note to fully delete in 20 days)",
  ],
  marketing: [
    "Remove from Canva / design tools if applicable",
    "Remove from social media accounts / management tools",
    "Google Admin: Delete email and transfer all company data to their manager",
    "Revoke access to analytics platforms (PostHog, GA, etc.)",
  ],
  operations: [
    "Remove from Recruit CRM (deactivate seat) if applicable",
    "Remove from QuickBooks / revoke access if applicable",
    "Google Admin: Delete email and transfer all company data to their manager",
    "Add their email as an Alias to their manager's email if applicable",
    "Revoke access to any internal operations tools",
  ],
  techops: [
    "Revoke GitHub / code repository access",
    "Remove from Vercel / hosting platforms",
    "Remove from Supabase / database access",
    "Revoke access to Sentry / monitoring tools",
    "Google Admin: Delete email and transfer all company data to their manager",
    "Rotate any shared credentials the contractor had access to",
  ],
  it: [
    "Revoke GitHub / code repository access",
    "Remove from Vercel / hosting platforms",
    "Remove from Supabase / database access",
    "Revoke access to Sentry / monitoring tools",
    "Google Admin: Delete email and transfer all company data to their manager",
    "Rotate any shared credentials the contractor had access to",
  ],
};

// Generalized checklist used when department doesn't match any known department
const GENERAL_OFFBOARDING_CHECKLIST: string[] = [
  "Remove Slack Commands (onboarding links, referral codes, etc.) if applicable",
  "Remove from Calendly if applicable (delete events, remove from rotations)",
  "Remove from Fathom if applicable",
  "Remove from Recruit CRM (deactivate seat) if applicable",
  "Remove from Zoom (delete account, free up seat) if applicable",
  "Remove as a sender from admin@remoteleverage.com if applicable",
  "Google Admin: Delete email and transfer all company data to their manager",
  "Add their email as an Alias to their manager's email if applicable",
  "Change the QuickBooks password for spectator@remoteleverage.com if applicable",
  "OpenPhone: Remove profile & number (add calendar note to fully delete in 20 days) if applicable",
  "Revoke access to any other company systems and tools",
  "Deactivate any SSO / OAuth sessions",
];

function getOffboardingChecklist(department: string | null): { items: string[]; matched: boolean } {
  if (!department) return { items: GENERAL_OFFBOARDING_CHECKLIST, matched: false };
  const key = department.toLowerCase().replace(/[\s\-_]+/g, "").trim();
  // Match department aliases
  const mapping: Record<string, string> = {
    hiring: "hiring",
    hiringmanager: "hiring",
    hiringmanagement: "hiring",
    hm: "hiring",
    recruitment: "recruitment",
    recruiter: "recruitment",
    recruiting: "recruitment",
    revops: "revops",
    revenue: "revenue",
    revenueoperations: "revops",
    sales: "sales",
    salesrep: "sales",
    salesrepresentative: "sales",
    sr: "sales",
    bd: "sales",
    businessdevelopment: "sales",
    marketing: "marketing",
    mktg: "marketing",
    operations: "operations",
    ops: "operations",
    techoperations: "techops",
    techops: "techops",
    tech: "techops",
    it: "it",
    engineering: "techops",
    isalofty: "sales",
    isa: "sales",
  };
  const mapped = mapping[key];
  if (mapped && OFFBOARDING_CHECKLISTS[mapped]) {
    return { items: OFFBOARDING_CHECKLISTS[mapped], matched: true };
  }
  return { items: GENERAL_OFFBOARDING_CHECKLIST, matched: false };
}

//  Step 3: Update RecruitCRM Status 

const RECRUITCRM_OFFBOARD_STATUS = "Disqualified: Check Notes";

export async function offboardUpdateRecruitCRM(
  employeeId: string
): Promise<{ success: boolean; message: string }> {
  try {
    const session = await requireOrg();

    const RECRUITCRM_TOKEN = process.env.RECRUITCRM_API_TOKEN;
    if (!RECRUITCRM_TOKEN) {
      return { success: false, message: "RECRUITCRM_API_TOKEN is not configured." };
    }

    const employee = await database.employee.findFirst({
      where: session.orgRole === "super_admin" ? { id: employeeId } : { id: employeeId, organizationId: session.orgId },
      select: {
        id: true,
        recruitCrmSlug: true,
        legalFirstName: true,
        legalLastName: true,
        offboardingStatus: true,
      },
    });

    if (!employee) return { success: false, message: "Employee not found" };

    if (!employee.recruitCrmSlug) {
      // No RecruitCRM record linked — auto-complete (not applicable)
      const steps = parseOffboardingSteps(employee.offboardingStatus);
      const step = steps.find((s) => s.key === "recruitcrm_status");
      if (step) {
        step.status = "completed";
        step.completedAt = new Date().toISOString();
        step.error = null;
        await database.employee.update({
          where: { id: employeeId },
          data: { offboardingStatus: JSON.stringify(steps) },
        });
      }
      return { success: true, message: "No RecruitCRM record linked — completed automatically." };
    }

    // Update candidate via RecruitCRM API
    // RCRM v1 uses POST for updating candidates (PATCH/PUT return 405)
    // "Candidate Stage" is custom_field #2 (dropdown) — NOT a top-level field
    const rcrmUrl = `https://api.recruitcrm.io/v1/candidates/${employee.recruitCrmSlug}`;
    const rcrmHeaders = {
      Authorization: `Bearer ${RECRUITCRM_TOKEN}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    const rcrmBody = JSON.stringify({
      current_status: RECRUITCRM_OFFBOARD_STATUS,
      custom_fields: [{ field_id: 2, value: RECRUITCRM_OFFBOARD_STATUS }],
    });

    const res = await fetch(rcrmUrl, {
      signal: AbortSignal.timeout(8000),
      method: "POST",
      headers: rcrmHeaders,
      body: rcrmBody,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      const errMsg = `RecruitCRM API error (${res.status}): ${errText.slice(0, 200)}`;
      console.error("[Offboarding] RecruitCRM update failed:", errMsg);

      // Update step status to failed
      const steps = parseOffboardingSteps(employee.offboardingStatus);
      const step = steps.find((s) => s.key === "recruitcrm_status");
      if (step) {
        step.status = "failed";
        step.error = errMsg;
        await database.employee.update({
          where: { id: employeeId },
          data: { offboardingStatus: JSON.stringify(steps) },
        });
      }

      return { success: false, message: errMsg };
    }

    // Mark step as completed
    console.log(`[Offboarding] RecruitCRM candidate status updated to "${RECRUITCRM_OFFBOARD_STATUS}" for ${employee.legalFirstName} ${employee.legalLastName} (slug: ${employee.recruitCrmSlug})`);
    const steps = parseOffboardingSteps(employee.offboardingStatus);
    const step = steps.find((s) => s.key === "recruitcrm_status");
    if (step) {
      step.status = "completed";
      step.completedAt = new Date().toISOString();
      step.error = null;
      await database.employee.update({
        where: { id: employeeId },
        data: { offboardingStatus: JSON.stringify(steps) },
      });
    }

    try {
      await database.auditLog.create({
        data: {
          organizationId: session.orgId,
          actorType: "user",
          actorUserId: session.userId,
          action: "employee.offboarding_recruitcrm_updated",
          objectType: "employee",
          objectId: employeeId,
          newValue: { status: RECRUITCRM_OFFBOARD_STATUS, slug: employee.recruitCrmSlug },
        },
      });
    } catch (auditErr) {
      console.error("[HRIQ] Audit log write failed (non-blocking):", auditErr);
    }

    const name = `${employee.legalFirstName ?? ""} ${employee.legalLastName ?? ""}`.trim();
    revalidatePath("/[orgSlug]/hiring", "page");
    return { success: true, message: `RecruitCRM status updated to "${RECRUITCRM_OFFBOARD_STATUS}" for ${name}.` };
  } catch (err) {
    console.error("[Offboarding] RecruitCRM update error:", err);
    return { success: false, message: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function offboardSendITTicket(
  employeeId: string,
  opts?: { recipientEmail?: string; additionalNotes?: string }
): Promise<{ success: boolean; message: string }> {
  try {
    const session = await requireOrg();

    if (!FRESHDESK_API_KEY) {
      return { success: false, message: "Freshdesk API key is not configured. Please set FRESHDESK_API_KEY in environment variables." };
    }

    const employee = await database.employee.findFirst({
      where: session.orgRole === "super_admin" ? { id: employeeId } : { id: employeeId, organizationId: session.orgId },
      select: {
        id: true,
        legalFirstName: true,
        legalLastName: true,
        workEmail: true,
        personalEmail: true,
        jobTitle: true,
        department: true,
        employmentType: true,
        timeDoctorEmail: true,
        startDate: true,
        endDate: true,
        offboardingStatus: true,
        organization: { select: { name: true } },
      },
    });

    if (!employee) return { success: false, message: "Employee not found" };

    const contractorName = `${employee.legalFirstName} ${employee.legalLastName}`;
    const orgName = employee.organization?.name ?? "Unknown";
    const endDateStr = employee.endDate
      ? new Date(employee.endDate as any).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
      : "Immediately";

    const deptLabel = employee.department ?? "General";

    const subject = `[URGENT] Offboarding - ${contractorName} (${orgName}) - Access Removal`;

    const htmlDescription = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px;">
        <h3 style="color: #dc2626;">Offboarding — Immediate Access Removal</h3>
        <p>The following contractor has been offboarded. Please revoke all access immediately.</p>

        <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin: 16px 0;">
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 8px 0; font-weight: 600; color: #6b7280; width: 160px;">Name</td>
            <td style="padding: 8px 0; font-weight: 600;">${contractorName}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 8px 0; font-weight: 600; color: #6b7280;">Organization</td>
            <td style="padding: 8px 0;">${orgName}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 8px 0; font-weight: 600; color: #6b7280;">Job Title</td>
            <td style="padding: 8px 0;">${employee.jobTitle ?? "N/A"}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 8px 0; font-weight: 600; color: #6b7280;">Department</td>
            <td style="padding: 8px 0;">${deptLabel}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 8px 0; font-weight: 600; color: #6b7280;">Employment Type</td>
            <td style="padding: 8px 0;">${employee.employmentType ?? "N/A"}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 8px 0; font-weight: 600; color: #6b7280;">Work Email</td>
            <td style="padding: 8px 0;">${employee.workEmail ?? "N/A"}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 8px 0; font-weight: 600; color: #6b7280;">Personal Email</td>
            <td style="padding: 8px 0;">${employee.personalEmail ?? "N/A"}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 8px 0; font-weight: 600; color: #6b7280;">Time Doctor Email</td>
            <td style="padding: 8px 0;">${employee.timeDoctorEmail ?? "N/A"}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 8px 0; font-weight: 600; color: #6b7280;">Start Date</td>
            <td style="padding: 8px 0;">${employee.startDate ? new Date(employee.startDate as any).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "N/A"}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: 600; color: #6b7280;">Last Working Day</td>
            <td style="padding: 8px 0; font-weight: 600; color: #dc2626;">${endDateStr}</td>
          </tr>
        </table>

        ${opts?.additionalNotes ? `<p><strong>Notes:</strong> ${opts.additionalNotes}</p>` : ""}
      </div>
    `;

    // Requester email for Freshdesk — NEVER use the contractor's email (they'd get the ticket)
    // Always use an internal email so the IT team gets notified, not the person being offboarded
    const requesterEmail = opts?.recipientEmail || "support@remoteleverage.com";

    const freshdeskUrl = `https://${FRESHDESK_DOMAIN}.freshdesk.com/api/v2/tickets`;
    const authHeader = `Basic ${Buffer.from(`${FRESHDESK_API_KEY}:X`).toString("base64")}`;

    const ticketPayload = {
      subject,
      description: htmlDescription,
      email: requesterEmail,
      name: contractorName,
      priority: 4, // Urgent — immediate access removal required
      status: 2,   // Open
      source: 2,   // Portal
      type: "Onboarding / Offboarding",
      tags: [
        "hriq",
        "offboarding",
        "urgent",
        "access-removal",
        `dept:${(employee.department ?? "general").toLowerCase().replace(/\s+/g, "-")}`,
        `org:${orgName.toLowerCase().replace(/\s+/g, "-")}`,
      ],
    };

    const fdResponse = await fetch(freshdeskUrl, {
      signal: AbortSignal.timeout(8000),
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(ticketPayload),
    });

    if (!fdResponse.ok) {
      const errBody = await fdResponse.text();
      console.error("[Offboarding] Freshdesk API error:", fdResponse.status, errBody);
      return { success: false, message: `Failed to create Freshdesk ticket (${fdResponse.status}). Please try again.` };
    }

    const ticket = await fdResponse.json();
    const ticketId = ticket.id;
    console.log(`[Offboarding] Freshdesk IT ticket #${ticketId} created for ${contractorName} (requester: ${requesterEmail})`);

    // Update step status
    const steps = parseOffboardingSteps(employee.offboardingStatus);
    const itStep = steps.find((s) => s.key === "it_ticket");
    if (itStep) {
      itStep.status = "completed";
      itStep.completedAt = new Date().toISOString();
    }

    await database.employee.update({
      where: { id: employeeId },
      data: { offboardingStatus: JSON.stringify(steps) },
    });

    try {
      await database.auditLog.create({
        data: {
          organizationId: session.orgId,
          actorType: "user",
          actorUserId: session.userId,
          action: "employee.offboarding_it_ticket_sent",
          objectType: "employee",
          objectId: employeeId,
          newValue: {
            freshdeskTicketId: ticketId,
            requesterEmail,
            contractorName,
            department: employee.department,
          },
        },
      });
    } catch (auditErr) {
      console.error("[HRIQ] Audit log write failed (non-blocking):", auditErr);
    }

    revalidatePath("/[orgSlug]/hiring", "page");
    return { success: true, message: `Freshdesk IT ticket #${ticketId} created for ${contractorName}.` };
  } catch (err) {
    console.error("[Offboarding] IT ticket failed:", err);
    import("@/lib/hriq/sentry").then(({ captureServerException }) => captureServerException(err, { action: "offboardSendITTicket" })).catch(() => {});
    return { success: false, message: err instanceof Error ? err.message : "Unknown error" };
  }
}

//  Disable Dashboard Access (48hr grace period step) 

export async function offboardDisableDashboard(
  employeeId: string
): Promise<{ success: boolean; message: string }> {
  try {
    const session = await requireOrg();

    const employee = await database.employee.findFirst({
      where: session.orgRole === "super_admin" ? { id: employeeId } : { id: employeeId, organizationId: session.orgId },
      select: {
        id: true,
        legalFirstName: true,
        legalLastName: true,
        linkedUserId: true,
        workEmail: true,
        personalEmail: true,
        offboardingStatus: true,
      },
    });

    if (!employee) return { success: false, message: "Employee not found" };

    const name = `${employee.legalFirstName} ${employee.legalLastName}`;

    // Ban Supabase auth
    if (employee.linkedUserId) {
      try {
        const { getSupabaseAdmin } = await import("./constants");
        const supabaseAdmin = getSupabaseAdmin();
        await supabaseAdmin.auth.admin.updateUserById(employee.linkedUserId, {
          ban_duration: "876600h", // ~100 years
        });
        // Kill all active sessions so the ban takes effect immediately
        // (without this, existing sessions continue to work until they expire)
        try {
          await database.$executeRaw`DELETE FROM auth.sessions WHERE user_id = ${employee.linkedUserId}::uuid`;
          await database.$executeRaw`DELETE FROM auth.refresh_tokens WHERE user_id = ${employee.linkedUserId}::uuid`;
        } catch (sessErr) {
          console.warn("[Offboarding] Failed to kill sessions (non-critical):", sessErr);
        }
        console.log(`[Offboarding] Dashboard disabled — Supabase auth banned + sessions killed for ${name} (userId: ${employee.linkedUserId})`);
      } catch (authErr) {
        console.error("[Offboarding] Failed to ban Supabase user:", authErr);
        // Update step as failed
        const steps = parseOffboardingSteps(employee.offboardingStatus);
        const step = steps.find((s) => s.key === "disable_dashboard");
        if (step) {
          step.status = "failed";
          step.error = authErr instanceof Error ? authErr.message : "Failed to ban user";
          await database.employee.update({
            where: { id: employeeId },
            data: { offboardingStatus: JSON.stringify(steps) },
          });
        }
        return { success: false, message: `Failed to disable dashboard for ${name}` };
      }
    }

    // Remove any remaining approved_emails
    const emails = [employee.workEmail, employee.personalEmail].filter(Boolean) as string[];
    for (const email of emails) {
      try {
        await database.$executeRaw`DELETE FROM approved_emails WHERE email = ${email}`;
      } catch (err) { console.warn("[offboarding:offboardDisableDashboard] Suppressed error:", err); }
    }

    // Mark step as completed
    const steps = parseOffboardingSteps(employee.offboardingStatus);
    const step = steps.find((s) => s.key === "disable_dashboard");
    if (step) {
      step.status = "completed";
      step.completedAt = new Date().toISOString();
    }
    await database.employee.update({
      where: { id: employeeId },
      data: { offboardingStatus: JSON.stringify(steps) },
    });

    try {
      await database.auditLog.create({
        data: {
          organizationId: session.orgId,
          actorType: "user",
          actorUserId: session.userId,
          action: "employee.offboarding_dashboard_disabled",
          objectType: "employee",
          objectId: employeeId,
          newValue: { linkedUserId: employee.linkedUserId },
        },
      });
    } catch (err) { console.warn("[offboarding:offboardDisableDashboard] Suppressed error:", err); }

    revalidatePath("/[orgSlug]/hiring", "page");
    return {
      success: true,
      message: employee.linkedUserId
        ? `Dashboard access disabled for ${name}.`
        : `${name} had no dashboard account — step completed.`,
    };
  } catch (err) {
    console.error("[Offboarding] Disable dashboard failed:", err);
    import("@/lib/hriq/sentry").then(({ captureServerException }) => captureServerException(err, { action: "offboardDisableDashboard" })).catch(() => {});
    return { success: false, message: err instanceof Error ? err.message : "Unknown error" };
  }
}

//  Complete Offboarding 

export async function completeOffboarding(
  employeeId: string
): Promise<{ success: boolean; message: string }> {
  try {
    const session = await requireOrg();

    const employee = await database.employee.findFirst({
      where: session.orgRole === "super_admin" ? { id: employeeId } : { id: employeeId, organizationId: session.orgId },
      select: { id: true, legalFirstName: true, legalLastName: true, offboardingStatus: true, linkedUserId: true, workEmail: true, personalEmail: true },
    });

    if (!employee) return { success: false, message: "Employee not found" };

    // Mark final review step as complete
    const steps = parseOffboardingSteps(employee.offboardingStatus);
    const finalStep = steps.find((s) => s.key === "final_review");
    if (finalStep) {
      finalStep.status = "completed";
      finalStep.completedAt = new Date().toISOString();
    }

    // Disable Supabase auth account (ban the user so they can't log in)
    if (employee.linkedUserId) {
      try {
        const { getSupabaseAdmin } = await import("./constants");
        const supabaseAdmin = getSupabaseAdmin();
        await supabaseAdmin.auth.admin.updateUserById(employee.linkedUserId, {
          ban_duration: "876600h", // ~100 years
        });
      } catch (authErr) {
        console.error("[Offboarding] Failed to ban Supabase user (non-blocking):", authErr);
      }
    }

    // Remove from approved_emails so they can't re-login via SSO
    const emails = [employee.workEmail, employee.personalEmail].filter(Boolean) as string[];
    for (const email of emails) {
      try {
        await database.$executeRaw`DELETE FROM approved_emails WHERE email = ${email}`;
      } catch (err) { console.warn("[offboarding:completeOffboarding] Suppressed error:", err); }
    }
    if (emails.length > 0) {
      console.log(`[Offboarding] Removed approved_emails for ${emails.join(", ")}`);
    }

    // Update employee to fully offboarded
    await database.employee.update({
      where: { id: employeeId },
      data: {
        employmentStatus: "offboarded",
        offboardingStatus: JSON.stringify(steps),
      },
    });

    try {
      await database.auditLog.create({
        data: {
          organizationId: session.orgId,
          actorType: "user",
          actorUserId: session.userId,
          action: "employee.offboarding_completed",
          objectType: "employee",
          objectId: employeeId,
          newValue: { completedAt: new Date().toISOString() },
        },
      });
    } catch (auditErr) {
      console.error("[HRIQ] Audit log write failed (non-blocking):", auditErr);
    }

    const name = `${employee.legalFirstName} ${employee.legalLastName}`;

    revalidatePath("/[orgSlug]/hiring", "page");
    revalidatePath("/[orgSlug]/employees", "page");
    revalidatePath(`/[orgSlug]/employees/${employeeId}`, "page");

    return { success: true, message: `${name} has been fully offboarded.` };
  } catch (err) {
    console.error("[Offboarding] Complete failed:", err);
    import("@/lib/hriq/sentry").then(({ captureServerException }) => captureServerException(err, { action: "completeOffboarding" })).catch(() => {});
    return { success: false, message: err instanceof Error ? err.message : "Unknown error" };
  }
}

//  Run All Offboarding Steps Automatically 

export async function runAutoOffboarding(
  employeeId: string,
  opts?: { itRecipientEmail?: string; additionalNotes?: string }
): Promise<{ success: boolean; message: string; results: { step: string; ok: boolean; msg: string }[] }> {
  await requireRole("super_admin", "admin");
  const results: { step: string; ok: boolean; msg: string }[] = [];

  // Load current offboarding steps to check scheduled times
  const emp = await database.employee.findUnique({
    where: { id: employeeId },
    select: { offboardingStatus: true },
  });
  const steps = parseOffboardingSteps(emp?.offboardingStatus as string | null);
  const now = new Date();

  // Helper: check if a delayed step is ready to run
  const isStepReady = (key: string): boolean => {
    const step = steps.find((s) => s.key === key);
    if (!step) return true; // no step = run it
    if (step.status === "completed" || step.status === "skipped") return false; // already done
    if (step.scheduledFor) {
      return new Date(step.scheduledFor) <= now;
    }
    return true; // no delay = ready
  };

  // IMMEDIATE STEPS (run right away)

  // Step 1: Submit urgent IT ticket (access removal — highest priority)
  const itResult = await offboardSendITTicket(employeeId, opts);
  results.push({ step: "IT Ticket (URGENT)", ok: itResult.success, msg: itResult.message });

  // Step 2: Download Time Doctor activity report BEFORE removing user
  const tdReportResult = await offboardDownloadTDReport(employeeId);
  results.push({ step: "TD Report Download", ok: tdReportResult.success, msg: tdReportResult.message });

  // Step 3: Remove from Time Doctor (after report is saved)
  const tdResult = await offboardRemoveFromTimeDoctor(employeeId);
  results.push({ step: "Time Doctor", ok: tdResult.success, msg: tdResult.message });

  // Step 4: Update RecruitCRM status
  const rcrmResult = await offboardUpdateRecruitCRM(employeeId);
  results.push({ step: "RecruitCRM", ok: rcrmResult.success, msg: rcrmResult.message });

  // DELAYED STEPS (1 hour after offboarding initiated)

  // Step 4: Send offboarding notification email (1hr delay)
  if (isStepReady("offboarding_notification")) {
    let emailResult: { success: boolean; message: string } = { success: false, message: "Email send failed" };
    try {
      emailResult = await offboardSendNotificationEmail(employeeId);
    } catch (emailErr) {
      console.error("[HRIQ] Email send failed (non-blocking):", emailErr);
    }
    results.push({ step: "Notification Email", ok: emailResult.success, msg: emailResult.message });
  } else {
    const step = steps.find((s) => s.key === "offboarding_notification");
    const scheduledTime = step?.scheduledFor ? new Date(step.scheduledFor).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "~1hr";
    results.push({ step: "Notification Email", ok: true, msg: `Scheduled for ${scheduledTime} (1hr delay to allow department head notification)` });
  }

  // Step 5: Remove from Slack (1hr delay)
  if (isStepReady("slack_removal")) {
    const slackResult = await offboardRemoveFromSlack(employeeId);
    results.push({ step: "Slack", ok: slackResult.success, msg: slackResult.message });
  } else {
    const step = steps.find((s) => s.key === "slack_removal");
    const scheduledTime = step?.scheduledFor ? new Date(step.scheduledFor).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "~1hr";
    results.push({ step: "Slack", ok: true, msg: `Scheduled for ${scheduledTime} (1hr delay)` });
  }

  // Step 6: Disable dashboard access (48hr grace period — contractor can access pay stubs & documents)
  if (isStepReady("disable_dashboard")) {
    const dashResult = await offboardDisableDashboard(employeeId);
    results.push({ step: "Dashboard Disable", ok: dashResult.success, msg: dashResult.message });
  } else {
    const step = steps.find((s) => s.key === "disable_dashboard");
    const scheduledTime = step?.scheduledFor ? new Date(step.scheduledFor).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "~24hr";
    results.push({ step: "Dashboard Disable", ok: true, msg: `Scheduled for ${scheduledTime} (48hr grace period)` });
  }

  const allOk = results.every((r) => r.ok);
  const failedSteps = results.filter((r) => !r.ok).map((r) => r.step);

  return {
    success: allOk,
    message: allOk
      ? "Immediate steps completed. Delayed steps: email/Slack in 1hr, dashboard disable in 48hr."
      : `Some steps failed: ${failedSteps.join(", ")}. You can retry individual steps.`,
    results,
  };
}

/**
 * Skip an offboarding step manually.
 */
export async function skipOffboardingStep(employeeId: string, stepKey: string) {
  try {
    const session = await requireOrg();

    const employee = await database.employee.findFirst({
      where: { id: employeeId, organizationId: session.orgId },
      select: { id: true, offboardingStatus: true },
    });
    if (!employee) throw new HriqError("HRIQ-0201");

    const steps: OffboardingStepState[] = parseOffboardingSteps(employee.offboardingStatus);
    const step = steps.find((s) => s.key === stepKey);
    if (!step) return { success: false, message: "Step not found" };

    step.status = "skipped";
    step.completedAt = new Date().toISOString();

    await database.employee.update({
      where: { id: employeeId },
      data: { offboardingStatus: JSON.stringify(steps) },
    });

    // Check if all steps done
    const completed = steps.filter((s) => s.status === "completed" || s.status === "skipped").length;
    if (completed >= steps.length) {
      await database.employee.update({
        where: { id: employeeId },
        data: { employmentStatus: "offboarded", offboardingStatus: "completed" },
      });
    }

    revalidatePath("/[orgSlug]/hiring", "page");
    revalidatePath("/[orgSlug]/employees", "page");
    revalidatePath(`/[orgSlug]/employees/${employeeId}`, "page");

    return { success: true, message: `Skipped: ${step.label}` };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[offboarding.ts:skipOffboardingStep]", _msg);
    return { error: _msg };
  }
}

// ── TD Member Mismatch Report ──────────────────────────────────────────────
// Returns active employees who are NOT in Time Doctor and TD users who are
// not matched to an active employee — used to detect sync drift.

export async function getTDMemberReport(): Promise<{
  missingFromTD: { id: string; name: string; email: string }[];
  extraInTD: { tdId: string; name: string; email: string }[];
  error?: string;
}> {
  try {
    await requireRole("super_admin");

    const { getTDUsers, getTDToken, getTDCompanyId } = await import("@repo/integrations/timedoctor");

    // Fetch all active employees with a TD email
    const activeEmployees = await database.employee.findMany({
      where: { employmentStatus: { in: ["active", "onboarding_in_progress", "pre_hire"] } },
      select: { id: true, legalFirstName: true, legalLastName: true, workEmail: true, personalEmail: true, timeDoctorEmail: true },
    });

    // Fetch all TD users
    const token = await getTDToken();
    const companyId = await getTDCompanyId(token);
    const tdUsers = await getTDUsers(token, companyId);
    const tdEmailSet = new Set(tdUsers.map((u: any) => u.email?.toLowerCase()).filter(Boolean));

    // Active employees NOT in TD
    const missingFromTD = activeEmployees
      .filter((e) => {
        const tdEmail = (e.timeDoctorEmail ?? e.workEmail ?? "").toLowerCase();
        return tdEmail && !tdEmailSet.has(tdEmail);
      })
      .map((e) => ({
        id: e.id,
        name: `${e.legalFirstName} ${e.legalLastName}`,
        email: e.timeDoctorEmail ?? e.workEmail ?? e.personalEmail ?? "",
      }));

    // TD users NOT matched to any active employee
    const activeEmailSet = new Set(
      activeEmployees.map((e) => (e.timeDoctorEmail ?? e.workEmail ?? "").toLowerCase()).filter(Boolean)
    );
    const extraInTD = tdUsers
      .filter((u: any) => u.email && !activeEmailSet.has(u.email.toLowerCase()) && !u.email.includes("@admin"))
      .map((u: any) => ({ tdId: u.id, name: u.fullName ?? u.name ?? "", email: u.email }));

    return { missingFromTD, extraInTD };
  } catch (err) {
    console.error("[Offboarding] TD member report failed:", err);
    return { missingFromTD: [], extraInTD: [], error: err instanceof Error ? err.message : "Failed to fetch TD report" };
  }
}
