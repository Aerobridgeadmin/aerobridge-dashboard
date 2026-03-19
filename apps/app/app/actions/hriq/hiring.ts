"use server";

import { requireRole, requireOrg } from "@repo/auth/session";
import { database } from "@repo/database";
import { revalidatePath } from "next/cache";
import { generateEmployeeNumber, generateSelfServiceToken, recomputeSessionProgress, buildPublicJotFormUrl, isPublicSignFillUrl, mergePrefillParams, checkEmailConflicts, getContractorEmail } from "@/lib/hriq/utils";
import { pacificToUtc, pacificBareIso } from "@/lib/hriq/format";
import { getSupabaseAdmin, getSignedStorageUrl, RL_ORG_ID, withTimeout, sanitizeDecimal } from "./constants";
import { HriqError } from "@/lib/hriq/errors";
import { dbLogError, dbLogInfo } from "@repo/observability/db-log";

/** Standard onboarding meeting description — used in Zoom agenda + Google Calendar event */
const ONBOARDING_DESCRIPTION = `Welcome to Remote Leverage!

We're excited to have you join the team!

Ahead of our onboarding session, please make sure you've completed the following to ensure a smooth start:
- Signed your work offer and other documents
- Installed the Time Doctor App
- Installed Slack (our main team communication tool)

Looking forward to meeting you and kicking things off!`;

function extractJotFormIdFromUrl(url: string): string | null {
  const match = url.match(/(\d{12,})/);
  return match?.[1] ?? null;
}

/** Detect whether a URL is a JotForm Sign document URL (not a regular form). */
function isSignUrl(url: string): boolean {
  return url.includes("/sign/") && !url.includes("/fill/");
}

/**
 * JotForm Sign documents have a "Sign doc ID" in the URL but submissions
 * live on a separate "backing form".  This map resolves Sign doc IDs
 * to the backing form ID that the API can query.
 *
 * Populated from env JOTFORM_SIGN_FORM_MAP (format: "signId:backingId,...")
 * with hardcoded fallbacks for the known Remote Leverage templates.
 */
function getSignDocToBackingFormMap(): Map<string, string> {
  const map = new Map<string, string>();
  // Hardcoded known mappings (W8-Ben sign doc  backing form, W9 sign doc  backing form)
  map.set("260528345360051", "260527710805050"); // W8-Ben
  map.set("260528134585056", "260527519357059"); // W9
  // Override / extend from env
  const envMap = process.env.JOTFORM_SIGN_FORM_MAP?.trim();
  if (envMap) {
    for (const pair of envMap.split(",")) {
      const [signId, backingId] = pair.split(":").map((s) => s.trim());
      if (signId && backingId) map.set(signId, backingId);
    }
  }
  return map;
}

/** Build a reverse map: backing form ID  Sign doc ID */
function getBackingFormToSignDocMap(): Map<string, string> {
  const reverse = new Map<string, string>();
  for (const [signId, backingId] of getSignDocToBackingFormMap()) {
    reverse.set(backingId, signId);
  }
  return reverse;
}

/**
 * Resolve a form URL to the ID that should be queried via the JotForm API.
 * For regular forms, returns the form ID from the URL.
 * For Sign documents, returns the backing form ID.
 */
function resolveQueryableFormId(url: string): string | null {
  const rawId = extractJotFormIdFromUrl(url);
  if (!rawId) return null;
  if (isSignUrl(url)) {
    return getSignDocToBackingFormMap().get(rawId) ?? rawId;
  }
  return rawId;
}

function inferDocumentTypeFromFormName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("w-8") || lower.includes("w8") || lower.includes("w-9") || lower.includes("w9") || lower.includes("tax")) {
    return "tax_form";
  }
  if (lower.includes("contract") || lower.includes("agreement") || lower.includes("offer")) {
    return "contract";
  }
  return "onboarding_form";
}

function getSupabaseAdminClient() {
  try { return getSupabaseAdmin(); } catch { return null; }
}

async function uploadSignedJotFormPdf(params: {
  employeeId: string;
  formId: string;
  submissionId: string;
}): Promise<string | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const { JotFormService } = await import("@repo/integrations/jotform");
  const pdfBuffer = await JotFormService.downloadSubmissionPdf(params.submissionId);
  if (!pdfBuffer) return null;

  const path = `employees/${params.employeeId}/jotform_signed/${params.formId}_${params.submissionId}.pdf`;
  const { error } = await supabase.storage.from("org-documents").upload(path, Buffer.from(pdfBuffer), {
    contentType: "application/pdf",
    upsert: true,
  });
  if (error) {
    console.error("[HRIQ-1804] JotForm — failed to upload signed PDF", error);
    return null;
  }

  const signedUrl = await getSignedStorageUrl("org-documents", path);
  return signedUrl || null;
}
export async function getHiringPipeline() {
  const session = await requireRole("super_admin", "admin");

  // Super admins can use this action; non-super-admins must be in RL org
  if (session.orgRole !== "super_admin" && session.orgId !== RL_ORG_ID) {
    throw new Error("Internal pipeline is only available in the RL organization.");
  }

  // Internal pipeline always scoped to RL org only.
  // External org pipelines are loaded separately via getHiringPipelineForOrg().
  const orgFilter = { organizationId: RL_ORG_ID };

  return database.employee.findMany({
    where: {
      ...orgFilter,
      employmentStatus: { in: ["pre_hire", "onboarding_scheduled", "onboarding_in_progress"] },
    },
    include: {
      organization: { select: { name: true } },
      onboardingSessions: {
        where: { status: { notIn: ["cancelled", "completed"] } },
        select: {
          id: true,
          status: true,
          overallProgress: true,
          jotformsSent: true,
          jotformsSentData: true,
          jotformsCompleted: true,
          jotformsCompletedAt: true,
          zoomMeetingLink: true,
          zoomMeetingDate: true,
          zoomInviteSent: true,
          zoomRsvpStatus: true,
          startedByName: true,
          startedAt: true,
          googleCalendarEventId: true,
          batchSessionId: true,
          batchSession: {
            select: {
              id: true,
              title: true,
              zoomMeetingDate: true,
              zoomDuration: true,
              calendarOrganizerEmail: true,
              onboardingSessions: {
                where: { status: { notIn: ["cancelled", "completed"] } },
                select: {
                  id: true,
                  employee: { select: { id: true, legalFirstName: true, legalLastName: true } },
                },
              },
            },
          },
          steps: {
            select: { id: true, stepType: true, stepName: true, status: true, sortOrder: true, isRequired: true, completedAt: true, formUrl: true, formSubmissionId: true },
            orderBy: { sortOrder: "asc" },
          },
        },
        take: 1,
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function createPreHireEmployee(data: {
  organizationId: string;
  legalFirstName: string;
  legalLastName: string;
  personalEmail: string;
  employmentType: string;
  jobTitle?: string;
  department?: string;
  location?: string;
  country?: string;
  hourlyRate?: string;
  currency?: string;
  startDate?: string;
}): Promise<{ success: true; employeeId: string } | { success: false; error: string }> {
  try {
    const session = await requireRole("super_admin", "admin");

    // Non-super-admins can only create employees in their own organization
    if (session.orgRole !== "super_admin" && data.organizationId !== session.orgId) {
      return { success: false, error: "You can only add hires to your own organization." };
    }

    // Cross-system email conflict check
    if (data.personalEmail?.trim()) {
      const conflict = await checkEmailConflicts(data.personalEmail.trim(), {
        allowSameOrg: data.organizationId,
        context: "adding a pre-hire candidate",
      });
      if (conflict.hasConflict) {
        return { success: false, error: `[HRIQ-0203] ${conflict.message}` };
      }

      // Same-org duplicate check
      const existing = await database.employee.findFirst({
        where: {
          organizationId: data.organizationId,
          employmentStatus: { not: "offboarded" },
          OR: [
            { personalEmail: { equals: data.personalEmail.trim(), mode: "insensitive" } },
            { workEmail: { equals: data.personalEmail.trim(), mode: "insensitive" } },
          ],
        },
        select: { id: true, legalFirstName: true, legalLastName: true },
      });
      if (existing) {
        return { success: false, error: `Email "${data.personalEmail}" is already used by ${existing.legalFirstName} ${existing.legalLastName} in this organization.` };
      }
    }

    const employeeNumber = await generateEmployeeNumber(data.organizationId);

    // Seat limit check — super_admin bypasses (can override for RL operations)
    if (session.orgRole !== "super_admin") {
      const profile = await database.organizationProfile.findUnique({
        where: { organizationId: data.organizationId },
        select: { vaSeats: true },
      });
      if (profile?.vaSeats != null) {
        const taken = await database.employee.count({
          where: {
            organizationId: data.organizationId,
            employmentStatus: { in: ["active", "pre_hire", "onboarding_scheduled", "onboarding_in_progress"] },
          },
        });
        if (taken >= profile.vaSeats) {
          return {
            success: false,
            error: `Your organization has used all ${profile.vaSeats} purchased VA seats (${taken}/${profile.vaSeats}). Please contact Remote Leverage to purchase additional seats.`,
          };
        }
      }
    }

    // Default photo to org logo
    let defaultPhotoUrl: string | undefined;
    try {
      const orgData = await database.organization.findUnique({ where: { id: data.organizationId }, select: { logoUrl: true } });
      if (orgData?.logoUrl) defaultPhotoUrl = orgData.logoUrl;
    } catch (err) { console.warn("[hiring:createPreHireEmployee] Suppressed error:", err); }

    const employee = await database.employee.create({
      data: {
        organizationId: data.organizationId,
        employeeNumber,
        selfServiceToken: generateSelfServiceToken(),
        legalFirstName: data.legalFirstName,
        legalLastName: data.legalLastName,
        personalEmail: data.personalEmail,
        employmentType: data.employmentType,
        employmentStatus: "pre_hire",
        jobTitle: data.jobTitle || undefined,
        department: data.department || undefined,
        location: data.location || data.country || undefined,
        country: data.country || data.location || undefined,
        hourlyRate: sanitizeDecimal(data.hourlyRate) || undefined,
        currency: data.currency ?? "USD",
        startDate: data.startDate ? new Date(data.startDate as any) : undefined,
        photoUrl: defaultPhotoUrl,
        createdByUserId: session.userId,
      },
    });

    try {
      await database.auditLog.create({
        data: {
          organizationId: data.organizationId,
          actorType: "user",
          actorUserId: session.userId,
          action: "hiring.pre_hire_created",
          objectType: "employee",
          objectId: employee.id,
          newValue: { name: `${data.legalFirstName} ${data.legalLastName}`, email: data.personalEmail },
        },
      });
    } catch (auditErr) {
      console.error("[HRIQ] Audit log write failed (non-blocking):", auditErr);
    }

    // Provision approved_emails so the contractor can sign in via the check-email gate
    if (data.personalEmail?.trim()) {
      try {
        const normalizedEmail = data.personalEmail.trim().toLowerCase();
        const existing = await database.approvedEmail.findFirst({
          where: { email: { equals: normalizedEmail, mode: "insensitive" } },
        });
        if (!existing) {
          await database.approvedEmail.create({
            data: { email: normalizedEmail, organizationId: data.organizationId },
          });
        }
      } catch (e) {
        console.warn("[createPreHireEmployee] Failed to provision approved_emails:", e);
      }
    }

    revalidatePath("/[orgSlug]/hiring", "page");

    return { success: true, employeeId: employee.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error creating pre-hire";
    console.error("[createPreHireEmployee] Failed:", message, err);
    return { success: false, error: message };
  }
}

export async function deletePreHireEmployee(
  employeeId: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const session = await requireRole("super_admin", "admin");

    const employee = await database.employee.findFirst({
      where: session.orgRole === "super_admin" ? { id: employeeId } : { id: employeeId, organizationId: session.orgId },
      select: {
        id: true,
        organizationId: true,
        employmentStatus: true,
        legalFirstName: true,
        legalLastName: true,
        personalEmail: true,
        workEmail: true,
      },
    });

    if (!employee) return { success: false, error: "Employee not found." };
    if (employee.employmentStatus === "active") {
      return { success: false, error: "Active employees cannot be deleted from the pipeline." };
    }
    if (session.orgRole !== "super_admin" && employee.organizationId !== session.orgId) {
      return { success: false, error: "You can only delete candidates in your own organization." };
    }

    // Clean up calendar + Zoom for candidates that have active onboarding sessions
    const activeSessions = await database.onboardingSession.findMany({
      where: { employeeId, status: { notIn: ["completed", "cancelled"] } },
      select: {
        id: true,
        googleCalendarEventId: true,
        batchSessionId: true,
        batchSession: {
          select: {
            id: true,
            calendarOrganizerEmail: true,
            zoomMeetingId: true,
            googleCalendarEventId: true,
            _count: { select: { onboardingSessions: true } },
          },
        },
      },
    });

    for (const sess of activeSessions) {
      // Remove from calendar
      if (sess.googleCalendarEventId) {
        try {
          const { GoogleCalendarService, isGoogleCalendarConfigured } = await import("@repo/integrations/google-calendar");
          if (isGoogleCalendarConfigured()) {
            const calOrg = sess.batchSession?.calendarOrganizerEmail || undefined;
            // Check if others share this calendar event
            const otherCount = await database.onboardingSession.count({
              where: {
                googleCalendarEventId: sess.googleCalendarEventId,
                id: { not: sess.id },
                status: { notIn: ["completed", "cancelled"] },
              },
            });
            if (otherCount > 0) {
              const empEmail = getContractorEmail(employee);
              if (empEmail) {
                await GoogleCalendarService.removeAttendees({
                  eventId: sess.googleCalendarEventId,
                  removeEmails: [empEmail],
                  organizerEmail: calOrg,
                });
              }
            } else {
              await GoogleCalendarService.deleteEvent(sess.googleCalendarEventId, calOrg);
            }
          }
        } catch (err) { console.warn("[hiring:deletePreHireEmployee] non-blocking:", err); }
      }

      // If this was the last person in the batch, clean up the batch + Zoom
      if (sess.batchSession && sess.batchSession._count.onboardingSessions <= 1) {
        if (sess.batchSession.zoomMeetingId) {
          try {
            const { ZoomService, isZoomConfigured } = await import("@repo/integrations/zoom");
            if (isZoomConfigured()) await ZoomService.deleteMeeting(sess.batchSession.zoomMeetingId);
          } catch (err) { console.warn("[hiring:deletePreHireEmployee] non-blocking:", err); }
        }
        await database.batchSession.update({
          where: { id: sess.batchSession.id },
          data: { status: "cancelled", zoomMeetingId: null, zoomMeetingLink: null, zoomJoinUrl: null, zoomStartUrl: null, zoomMeetingDate: null, googleCalendarEventId: null },
        });
      }
    }

    await database.employee.delete({ where: { id: employeeId } });

    try {
      await database.auditLog.create({
        data: {
          organizationId: employee.organizationId,
          actorType: "user",
          actorUserId: session.userId,
          action: "hiring.pre_hire_deleted",
          objectType: "employee",
          objectId: employeeId,
          oldValue: { name: `${employee.legalFirstName} ${employee.legalLastName}`, status: employee.employmentStatus },
        },
      });
    } catch (auditErr) {
      console.error("[HRIQ] Audit log write failed (non-blocking):", auditErr);
    }

    revalidatePath("/[orgSlug]/hiring", "page");
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error deleting candidate";
    console.error("[deletePreHireEmployee] Failed:", message, err);
    return { success: false, error: message };
  }
}

export async function saveOnboardingDataPrefill(data: {
  employeeIds: string[];
  payRate?: string;
  monthlySalary?: string;
  compensationType?: string;
  currency?: string;
  startDate?: string;
}) {
  const session = await requireRole("super_admin", "admin");
  if (data.employeeIds.length === 0) return { updated: 0 };

  const isRLOrg = session.orgId === RL_ORG_ID;

  const employees = await database.employee.findMany({
    where: {
      id: { in: data.employeeIds },
      // Super admins only see all when on RL org; otherwise scope to active org
      ...((session.orgRole !== "super_admin" || !isRLOrg) && session.orgId ? { organizationId: session.orgId } : {}),
    },
    select: { id: true, organizationId: true },
  });
  if (employees.length === 0) return { updated: 0 };

  const compType = data.compensationType === "monthly" ? "monthly" : "hourly";
  const updateData: {
    hourlyRate?: string | null;
    monthlySalary?: string | null;
    compensationType?: string;
    currency?: string;
    startDate?: Date;
  } = {};
  if (compType === "monthly") {
    if (data.monthlySalary?.trim()) updateData.monthlySalary = sanitizeDecimal(data.monthlySalary) ?? data.monthlySalary.trim();
    updateData.hourlyRate = null;
  } else {
    if (data.payRate?.trim()) updateData.hourlyRate = sanitizeDecimal(data.payRate) ?? data.payRate.trim();
    updateData.monthlySalary = null;
  }
  if (data.compensationType) updateData.compensationType = compType;
  if (data.currency?.trim()) updateData.currency = data.currency.trim();
  if (data.startDate?.trim()) updateData.startDate = new Date(data.startDate as any);

  if (Object.keys(updateData).length === 0) return { updated: 0 };

  await database.employee.updateMany({
    where: { id: { in: employees.map(e => e.id) } },
    data: updateData,
  });

  // Batch audit logs
  try {
    await database.auditLog.createMany({
      data: employees.map(employee => ({
        organizationId: employee.organizationId ?? undefined,
        actorType: "user" as const,
        actorUserId: session.userId,
        action: "hiring.onboarding_data_prefill_updated",
        objectType: "employee",
        objectId: employee.id,
        newValue: updateData,
      })),
    });
  } catch (auditErr) {
    console.error("[HRIQ] Audit log write failed (non-blocking):", auditErr);
  }

  revalidatePath("/[orgSlug]/hiring", "page");

  return { updated: employees.length };
}

export async function startOnboardingWithConfig(data: {
  employeeIds: string[];
  zoomMeetingDate?: string;
  zoomDuration?: number;
  zoomHost?: string;
  existingBatchSessionId?: string;
  onboardingData?: { payRate?: string; monthlySalary?: string; compensationType?: string; currency?: string; startDate?: string; jobTitle?: string; department?: string };
  formIds: string[];
  senderEmail?: string;
  includePaymentSetup?: boolean;
  includeWiseSetup?: boolean;
  includeCadanaSetup?: boolean;
  batchTitle?: string;
  skipEmail?: boolean;
}) {
  const fail = (error: string) => ({ ok: false as const, error });
  const session = await requireRole("super_admin", "admin");

  const employees = await database.employee.findMany({
    where: { id: { in: data.employeeIds }, employmentStatus: "pre_hire" },
  });
  if (employees.length === 0) return fail("No valid pre-hire employees found");

  const existingSessions = await database.onboardingSession.findMany({
    where: { employeeId: { in: employees.map((e: any) => e.id) }, status: { notIn: ["completed", "cancelled"] } },
    select: { employeeId: true },
  });
  const alreadyOnboarding = new Set(existingSessions.map((s: any) => s.employeeId));
  const validEmployees = employees.filter((e: any) => !alreadyOnboarding.has(e.id));
  if (validEmployees.length === 0) return fail("All selected employees already have active onboarding sessions");

  const missingEmailEmployees = validEmployees.filter(
    (employee: any) => !employee.personalEmail && !employee.workEmail
  );
  if (missingEmailEmployees.length > 0) {
    const names = missingEmailEmployees
      .map((employee: any) => `${employee.legalFirstName} ${employee.legalLastName}`)
      .join(", ");
    return fail(`Cannot launch onboarding. Missing email for: ${names}`);
  }

  const { isEmailConfigured } = await import("./send-email");
  if (!(await isEmailConfigured())) {
    return fail(
      "Email is not configured. Set GOOGLE_SERVICE_ACCOUNT_KEY and GOOGLE_SENDER_EMAIL before launching onboarding."
    );
  }

  let zoomJoinUrl: string | undefined;
  let zoomStartUrl: string | undefined;
  let zoomMeetingId: string | undefined;
  let zoomMeetingDate: Date | undefined;
  let batchSessionId: string | undefined;
  let storedCalendarOrganizer: string | undefined;

  if (data.existingBatchSessionId) {
    const existingBatch = await database.batchSession.findUnique({
      where: { id: data.existingBatchSessionId },
      select: {
        id: true,
        zoomMeetingId: true,
        zoomJoinUrl: true,
        zoomStartUrl: true,
        zoomMeetingDate: true,
        zoomDuration: true,
        calendarOrganizerEmail: true,
      },
    });
    if (!existingBatch) return fail("Selected Zoom session no longer exists.");
    if (!existingBatch.zoomJoinUrl) return fail("Selected Zoom session has no join link.");
    batchSessionId = existingBatch.id;
    zoomMeetingId = existingBatch.zoomMeetingId ?? undefined;
    zoomJoinUrl = existingBatch.zoomJoinUrl;
    zoomStartUrl = existingBatch.zoomStartUrl ?? undefined;
    zoomMeetingDate = existingBatch.zoomMeetingDate ?? undefined;
    storedCalendarOrganizer = existingBatch.calendarOrganizerEmail ?? undefined;

    // Rename the Zoom meeting topic to the generic name when adding more candidates
    // (it may have been created with an individual candidate's name)
    if (zoomMeetingId) {
      try {
        const { ZoomService, isZoomConfigured } = await import("@repo/integrations/zoom");
        if (isZoomConfigured()) {
          await withTimeout(ZoomService.updateMeeting(zoomMeetingId, {
            topic: "Remote Leverage Onboarding",
          }), 8000, "Zoom updateMeeting");
        }
      } catch (e) {
        console.error("[HRIQ-2302] Onboarding — failed to rename Zoom meeting topic:", e);
      }
    }

    // Also update the batch session title to the generic name
    await database.batchSession.update({
      where: { id: batchSessionId },
      data: { title: "Remote Leverage Onboarding" },
    });
  }

  if (!batchSessionId && data.zoomMeetingDate) {
    try {
      const { ZoomService, isZoomConfigured } = await import("@repo/integrations/zoom");
      if (!isZoomConfigured()) {
        return fail(
          "Zoom is not configured. Set ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, and ZOOM_CLIENT_SECRET."
        );
      }
      const topic = "Remote Leverage Onboarding";
      const meeting = await withTimeout(ZoomService.createMeeting({
        topic,
        startTime: pacificBareIso(data.zoomMeetingDate),
        duration: data.zoomDuration ?? 60,
        timezone: "America/Los_Angeles",
        agenda: ONBOARDING_DESCRIPTION,
        hostUser: data.zoomHost,
      }), 8000, "Zoom createMeeting");
      if (!meeting?.join_url) {
        return fail("Zoom meeting was created without a join URL.");
      }
      zoomMeetingId = String(meeting.id);
      zoomJoinUrl = meeting.join_url;
      zoomStartUrl = meeting.start_url;
      zoomMeetingDate = pacificToUtc(data.zoomMeetingDate);

      // Notify the Zoom host that a meeting was created under their account
      const hostEmail = data.zoomHost?.trim();
      if (hostEmail && hostEmail !== "me") {
        try {
          const { sendZoomHostNotificationEmail } = await import("./send-email");
          await sendZoomHostNotificationEmail(hostEmail, {
            meetingTitle: "Remote Leverage Onboarding",
            meetingDate: pacificToUtc(data.zoomMeetingDate).toISOString(),
            duration: data.zoomDuration ?? 60,
            startUrl: meeting.start_url,
            joinUrl: meeting.join_url,
            attendeeNames: validEmployees.map((e: any) => `${e.legalFirstName} ${e.legalLastName}`),
          });
        } catch (emailErr) {
          console.error("[HRIQ-1703] Onboarding — failed to notify Zoom host:", emailErr);
        }
      }
    } catch (e) {
      console.error("[HRIQ-2301] Onboarding — failed to create Zoom meeting:", e);
      return fail(
        e instanceof Error
          ? `Failed to create Zoom meeting: ${e.message}`
          : "Failed to create Zoom meeting."
      );
    }
  }

  if (!batchSessionId && (validEmployees.length > 1 || Boolean(zoomJoinUrl))) {
    const batch = await database.batchSession.create({
      data: {
        organizationId: validEmployees[0].organizationId ?? undefined,
        title:
          data.batchTitle ?? "Remote Leverage Onboarding",
        zoomMeetingId,
        zoomJoinUrl,
        zoomStartUrl,
        zoomMeetingDate,
        zoomDuration: data.zoomDuration ?? 60,
        createdByUserId: session.userId,
        createdByName: session.name ?? undefined,
      },
    });
    batchSessionId = batch.id;
  }

  const apiKey = process.env.JOTFORM_API_KEY?.trim();
  const formLinks: { name: string; url: string }[] = [];

  // Pre-fetch form metadata once (shared across employees for URL template)
  const formMeta: { id: string; title: string; baseUrl: string; skipPrefill?: boolean }[] = [];
  if (data.formIds.length > 0) {
    const { getConfiguredJotFormLinks } = await import("@repo/integrations/jotform");
    const configuredLinks = getConfiguredJotFormLinks();
    const configuredMap = new Map<string, import("@repo/integrations/jotform").JotFormTemplateLink>(configuredLinks.map((f) => [f.id, f]));
    for (const formId of data.formIds) {
      const configured = configuredMap.get(formId);
      if (configured) {
        // Sign documents use pre-generated public invite links — use URL as-is
        if (configured.signDocument || !isPublicSignFillUrl(configured.url)) {
          formMeta.push({
            id: configured.id,
            title: configured.title,
            baseUrl: configured.url,
            skipPrefill: true,
          });
        } else {
          formMeta.push({
            id: configured.id,
            title: configured.title,
            baseUrl: buildPublicJotFormUrl(configured.url, configured.id),
          });
        }
      }
    }

    const apiFormIds = data.formIds.filter((formId) => !configuredMap.has(formId));
    if (apiFormIds.length > 0) {
      if (!apiKey) return fail("JotForm API key not configured");
      // Guard against accidental form sends from the wrong JotForm account
      const userRes = await fetch(`https://api.jotform.com/user?apiKey=${encodeURIComponent(apiKey)}`, { signal: AbortSignal.timeout(8000) });
      if (!userRes.ok) {
        return fail("Failed to validate JotForm account");
      }
      const userData = await userRes.json();
      const jotformEmail = String(userData?.content?.email ?? userData?.content?.name ?? "").toLowerCase();
      const expectedJotFormEmail = (process.env.JOTFORM_ACCOUNT_EMAIL ?? "recruiters@remoteleverage.com").toLowerCase();
      if (jotformEmail !== expectedJotFormEmail) {
        return fail(
          `JotForm account mismatch. Expected ${expectedJotFormEmail}, got ${jotformEmail || "unknown account"}`
        );
      }
      // Fetch all form metadata in parallel instead of sequentially
      const formResults = await Promise.allSettled(
        apiFormIds.map(async (formId) => {
          const res = await fetch(`https://api.jotform.com/form/${formId}?apiKey=${encodeURIComponent(apiKey!)}`, { signal: AbortSignal.timeout(8000) });
          if (!res.ok) return null;
          const fd = await res.json();
          const fStatus = String(fd.content?.status ?? "").toUpperCase();
          if (fStatus === "DELETED" || fStatus === "TRASHED" || fStatus === "PURGED") return null;
          return { id: formId, title: fd.content?.title ?? `Form ${formId}`, baseUrl: fd.content?.url ?? "" };
        })
      );
      for (const result of formResults) {
        if (result.status === "fulfilled" && result.value) {
          formMeta.push(result.value);
        } else if (result.status === "rejected") {
          console.error("[HRIQ-0701] JotForm — failed to fetch form:", result.reason);
        }
      }
    }
  }

  const results = [];
  const calendarAttendeeEmails: string[] = [];
  const calendarOnboardingIds: string[] = [];
  const { JotFormService: JotFormSvc } = await import("@repo/integrations/jotform");

  for (const employee of validEmployees) {
    // Merge wizard onboarding data so the prefill URL includes the latest rate/currency/start date
    const employeeForPrefill = {
      ...employee,
      hourlyRate: sanitizeDecimal(data.onboardingData?.payRate) || (employee.hourlyRate ? String(employee.hourlyRate) : null),
      monthlySalary: sanitizeDecimal(data.onboardingData?.monthlySalary) || (employee.monthlySalary ? String(employee.monthlySalary) : null),
      currency: data.onboardingData?.currency?.trim() || employee.currency || "USD",
      startDate: data.onboardingData?.startDate?.trim() || (employee.startDate ? new Date(employee.startDate as any).toISOString().slice(0, 10) : null),
      jobTitle: data.onboardingData?.jobTitle?.trim() || employee.jobTitle || null,
    };

    const employeeFormLinks: { name: string; url: string }[] = [];
    for (const fm of formMeta) {
      if (fm.skipPrefill) {
        // Sign-only document — use URL as-is without prefill params
        employeeFormLinks.push({ name: fm.title, url: fm.baseUrl });
        continue;
      }
      const smartPrefillUrl = await JotFormSvc.buildSmartPrefillUrl(fm.id, employeeForPrefill);
      const params = new URL(smartPrefillUrl).searchParams;
      employeeFormLinks.push({
        name: fm.title,
        // Apply prefill params for both public and tokenized sign links.
        url: mergePrefillParams(fm.baseUrl, params),
      });
    }

    const zoomInviteStatus = zoomJoinUrl ? "completed" : "pending";
    const jotformStatus = employeeFormLinks.length > 0 ? "sent" : "pending";

    const onboarding = await database.onboardingSession.create({
      data: {
        employeeId: employee.id,
        batchSessionId,
        status: "in_progress",
        startedByUserId: session.userId,
        startedByName: session.name ?? undefined,
        startedAt: new Date(),
        zoomMeetingLink: zoomJoinUrl,
        zoomMeetingId,
        zoomMeetingDate,
        zoomInviteSent: !!zoomJoinUrl,
        zoomInviteSentAt: zoomJoinUrl ? new Date() : undefined,
        jotformsSent: employeeFormLinks.length > 0,
        jotformsSentAt: employeeFormLinks.length > 0 ? new Date() : undefined,
        jotformsSentData: employeeFormLinks.length > 0 ? JSON.stringify(employeeFormLinks) : undefined,
        jotformLinks: employeeFormLinks.length > 0 ? JSON.stringify(employeeFormLinks) : undefined,
        steps: {
          create: [
            // Only add Zoom steps when a Zoom meeting was actually scheduled
            ...(zoomJoinUrl ? [
              {
                stepType: "zoom_invite" as const, stepName: "Zoom Invite (Add to Batch)", sortOrder: 0, isRequired: true,
                status: zoomInviteStatus,
                completedAt: new Date(),
                completedByUserId: session.userId,
                completedByName: session.name ?? undefined,
              },
              { stepType: "zoom_attendance" as const, stepName: "Zoom Orientation Attendance", sortOrder: 1, isRequired: true },
            ] : []),
            // Create one jotform step per form for individual tracking
            ...employeeFormLinks.map((link, idx) => ({
              stepType: "jotform" as const,
              stepName: link.name,
              sortOrder: (zoomJoinUrl ? 2 : 0) + idx,
              isRequired: true,
              status: jotformStatus,
              formUrl: link.url,
            })),
            { stepType: "email_form" as const, stepName: "Contractor Info Form", sortOrder: (zoomJoinUrl ? 2 : 0) + employeeFormLinks.length, isRequired: true },
            ...(data.includePaymentSetup ? [{
              stepType: "payment_setup" as const,
              stepName: "Payment Setup (Stripe Connect)",
              sortOrder: (zoomJoinUrl ? 3 : 1) + employeeFormLinks.length,
              isRequired: true,
              // RL internal contractors skip payment setup — no Stripe Connect required
              status: (employee.organizationId === RL_ORG_ID) ? "skipped" as const : "pending" as const,
              ...(employee.organizationId === RL_ORG_ID ? { completedAt: new Date() } : {}),
            }] : []),
            ...(data.includeWiseSetup ? [{
              stepType: "payment_setup" as const,
              stepName: "Payment Setup (Wise)",
              sortOrder: (zoomJoinUrl ? 3 : 1) + employeeFormLinks.length + (data.includePaymentSetup ? 1 : 0),
              isRequired: true,
              // RL internal contractors skip payment setup — RL handles payments directly
              status: (employee.organizationId === RL_ORG_ID) ? "skipped" as const : "pending" as const,
              ...(employee.organizationId === RL_ORG_ID ? { completedAt: new Date() } : {}),
            }] : []),
            ...(data.includeCadanaSetup ? [{
              stepType: "payment_setup" as const,
              stepName: "Payment Setup (Cadana)",
              sortOrder: (zoomJoinUrl ? 3 : 1) + employeeFormLinks.length + (data.includePaymentSetup ? 1 : 0) + (data.includeWiseSetup ? 1 : 0),
              isRequired: true,
              status: "pending" as const,
            }] : []),
          ],
        },
      },
    });

    const hasZoomScheduled = Boolean(zoomJoinUrl);
    const isBatch = validEmployees.length > 1 || Boolean(batchSessionId);
    await database.employee.update({
      where: { id: employee.id },
      data: {
        hourlyRate: sanitizeDecimal(data.onboardingData?.payRate) ?? employee.hourlyRate,
        monthlySalary: sanitizeDecimal(data.onboardingData?.monthlySalary) ?? employee.monthlySalary,
        compensationType: data.onboardingData?.compensationType?.trim() || employee.compensationType || "hourly",
        currency: data.onboardingData?.currency?.trim() ? data.onboardingData.currency.trim() : employee.currency,
        startDate: data.onboardingData?.startDate?.trim() ? new Date(data.onboardingData.startDate as any) : employee.startDate,
        jobTitle: data.onboardingData?.jobTitle?.trim() ? data.onboardingData.jobTitle.trim() : employee.jobTitle,
        department: data.onboardingData?.department?.trim() ? data.onboardingData.department.trim() : employee.department,
        employmentStatus: hasZoomScheduled || isBatch ? "onboarding_scheduled" : "onboarding_in_progress",
        onboardingStatus: "in_progress",
      },
    });

    const recipientEmail = getContractorEmail(employee);

    // Run Time Doctor invite, Slack token, and email sending in PARALLEL
    // These are independent external calls that don't depend on each other
    let tdInviteEmail: string | undefined = recipientEmail || undefined;
    let slackInviteLink: string | undefined;

    await Promise.allSettled([
      // Time Doctor invite
      (async () => {
        if (!recipientEmail) return;
        try {
          const { inviteTDUser } = await import("@repo/integrations/timedoctor");
          const tdFullName = [employee.legalFirstName, employee.legalLastName].filter(Boolean).join(" ");
          const result = await inviteTDUser(recipientEmail, tdFullName, {
            role: "normal",
            timezone: employee.timezone ?? undefined,
          });
          if (result.success && !employee.timeDoctorEmail) {
            await database.employee.update({
              where: { id: employee.id },
              data: { timeDoctorEmail: recipientEmail },
            });
          }
        } catch (e) {
          console.error("[Onboarding] Time Doctor invite error (non-blocking):", e);
        }
      })(),
      // Slack invite token
      (async () => {
        if (!recipientEmail || !process.env.SLACK_INVITE_LINK) return;
        try {
          const token = crypto.randomUUID();
          await database.employee.update({
            where: { id: employee.id },
            data: { slackInviteToken: token },
          });
          const { APP_URL, normalizeAppUrl } = await import("./constants");
          const appUrl = normalizeAppUrl(APP_URL);
          slackInviteLink = `${appUrl}/api/slack-invite?token=${token}`;
        } catch (e) {
          console.error("[Onboarding] Slack token error (non-blocking):", e);
        }
      })(),
    ]);

    // Send email (depends on slackInviteLink from above)
    if (recipientEmail && !data.skipEmail) {
      try {
        const { sendOnboardingEmail } = await import("./send-email");
        await sendOnboardingEmail(
          recipientEmail,
          employee.legalFirstName,
          {
            employeeId: employee.id,
            zoomLink: zoomJoinUrl,
            zoomDate: zoomMeetingDate ? zoomMeetingDate.toISOString() : undefined,
            zoomDuration: data.zoomDuration ?? 60,
            formLinks: employeeFormLinks.length > 0 ? employeeFormLinks : undefined,
            onboardingData: {
              payRate: data.onboardingData?.payRate?.trim() || (employee.hourlyRate ? String(employee.hourlyRate) : undefined),
              currency: data.onboardingData?.currency?.trim() || employee.currency || "USD",
              startDate: data.onboardingData?.startDate?.trim() || (employee.startDate ? new Date(employee.startDate as any).toISOString() : undefined),
              jobTitle: data.onboardingData?.jobTitle?.trim() || employee.jobTitle || undefined,
            },
            timeDoctorEmail: tdInviteEmail,
            slackEmail: recipientEmail,
            slackInviteLink,
            paymentSetupType: (employee.organizationId === RL_ORG_ID) ? "none"
              : (data.includePaymentSetup && data.includeWiseSetup) ? "both"
              : data.includePaymentSetup ? "stripe"
              : data.includeWiseSetup ? "wise"
              : data.includeCadanaSetup ? "cadana"
              : "none",
          },
          data.senderEmail,
        );
        try {
          await database.auditLog.create({ data: { organizationId: employee.organizationId ?? undefined, actorType: "system", action: "debug.email_sent", objectType: "employee", objectId: employee.id, newValue: { to: recipientEmail, status: "success" } } });
        } catch (auditErr) {
          console.error("[HRIQ] Audit log write failed (non-blocking):", auditErr);
        }
      } catch (e: any) {
        try {
          await database.auditLog.create({ data: { organizationId: employee.organizationId ?? undefined, actorType: "system", action: "debug.email_failed", objectType: "employee", objectId: employee.id, newValue: { to: recipientEmail, error: e?.message ?? String(e) } } }).catch((e) => console.error("[background task failed]", e));
        } catch (auditErr) {
          console.error("[HRIQ] Audit log write failed (non-blocking):", auditErr);
        }
      }
    } else {
      try {
        await database.auditLog.create({ data: { organizationId: employee.organizationId ?? undefined, actorType: "system", action: "debug.email_skipped", objectType: "employee", objectId: employee.id, newValue: { recipientEmail, skipEmail: data.skipEmail } } }).catch((e) => console.error("[background task failed]", e));
      } catch (auditErr) {
        console.error("[HRIQ] Audit log write failed (non-blocking):", auditErr);
      }
    }

    // Payment setup happens at contractor login via the contractor-payment-gate.
    if (data.includePaymentSetup || data.includeWiseSetup || data.includeCadanaSetup) {
      // Set gate flags so contractor is redirected to payment setup on login
      const gateUpdate: Record<string, unknown> = {};
      if (data.includeWiseSetup) { gateUpdate.wiseGateRequired = true; gateUpdate.preferredPaymentMethod = "wise"; }
      if (data.includeCadanaSetup) { gateUpdate.cadanaGateRequired = true; gateUpdate.preferredPaymentMethod = "cadana"; }
      if (Object.keys(gateUpdate).length > 0) {
        await database.employee.update({
          where: { id: employee.id },
          data: gateUpdate,
        }).catch((e) => console.error("[background task failed] gate update:", e));
      }

      try {
        await database.auditLog.create({
          data: {
            organizationId: employee.organizationId ?? undefined,
            actorType: "system",
            action: "hiring.payment_setup_pending_login",
            objectType: "employee",
            objectId: employee.id,
            newValue: {
              stripe: !!data.includePaymentSetup,
              wise: !!data.includeWiseSetup,
              cadana: !!data.includeCadanaSetup,
              note: "Contractor will complete payment setup at login via contractor-payment-gate",
            },
          },
        }).catch((e) => console.error("[background task failed]", e));
      } catch (auditErr) {
        console.error("[HRIQ] Audit log write failed (non-blocking):", auditErr);
      }
    }

    // Collect attendee for batch calendar event (created after loop)
    const recipientEmailForCal = getContractorEmail(employee);
    if (zoomJoinUrl && zoomMeetingDate && recipientEmailForCal) {
      calendarAttendeeEmails.push(recipientEmailForCal);
      calendarOnboardingIds.push(onboarding.id);
    }

    try {
      await database.auditLog.create({
        data: {
          organizationId: employee.organizationId ?? undefined,
          actorType: "user",
          actorUserId: session.userId,
          action: "hiring.onboarding_launched",
          objectType: "employee",
          objectId: employee.id,
          newValue: {
            zoomScheduled: !!zoomJoinUrl,
            formsSent: employeeFormLinks.length,
            batchSessionId,
          },
        },
      });
    } catch (auditErr) {
      console.error("[HRIQ] Audit log write failed (non-blocking):", auditErr);
    }

    // Keep checklist progress in sync immediately after launch.
    await recomputeSessionProgress(onboarding.id);

    results.push(onboarding);
  }

  //  Single Google Calendar event for ALL attendees (not one per employee)
  //  Fire-and-forget — don't block the response on calendar event creation
  if (zoomJoinUrl && zoomMeetingDate && calendarAttendeeEmails.length > 0) {
    (async () => {
    try {
      const { GoogleCalendarService, isGoogleCalendarConfigured } = await import("@repo/integrations/google-calendar");
      if (isGoogleCalendarConfigured()) {
        const hostEmail = data.zoomHost?.trim();
        // Priority: stored batch organizer > Zoom host — NO fallback
        const organizerEmail = storedCalendarOrganizer
          || ((hostEmail && hostEmail !== "me") ? hostEmail : undefined);
        const duration = data.zoomDuration ?? 60;
        if (!organizerEmail) {
          console.warn("[launchOnboarding] No calendar organizer email — set a Zoom host or batch organizer before creating calendar events.");
        } else {
        // Use UTC ISO strings — Google Calendar respects the timeZone field for display
        const calStart = zoomMeetingDate.toISOString();
        const calEnd = new Date(zoomMeetingDate.getTime() + duration * 60 * 1000).toISOString();
        const calTitle = "Remote Leverage Onboarding";

        // Check if the batch already has a calendar event (from prior launches)
        let existingCalEventId: string | null = null;
        if (batchSessionId) {
          // First check the batch session itself (faster, always available)
          const batchWithCal = await database.batchSession.findUnique({
            where: { id: batchSessionId },
            select: { googleCalendarEventId: true },
          });
          existingCalEventId = batchWithCal?.googleCalendarEventId ?? null;

          // Fallback: check sibling sessions
          if (!existingCalEventId) {
            const siblingSession = await database.onboardingSession.findFirst({
              where: { batchSessionId, googleCalendarEventId: { not: null } },
              select: { googleCalendarEventId: true },
            });
            existingCalEventId = siblingSession?.googleCalendarEventId ?? null;
          }
        }

        let eventId: string | null = null;

        if (existingCalEventId) {
          // Add new attendees to the existing calendar event and normalize the title
          const added = await withTimeout(GoogleCalendarService.addAttendees({
            eventId: existingCalEventId,
            newEmails: calendarAttendeeEmails,
            organizerEmail,
            title: calTitle,
          }), 8000, "Google Calendar addAttendees");
          if (added) eventId = existingCalEventId;
        } else {
          // Create one new event with ALL attendees
          const attendees = [...calendarAttendeeEmails];
          if (hostEmail && hostEmail !== "me" && !attendees.includes(hostEmail)) {
            attendees.push(hostEmail);
          }
          const result = await withTimeout(GoogleCalendarService.createEvent({
            title: calTitle,
            description: `${ONBOARDING_DESCRIPTION}\n\nJoin Zoom: ${zoomJoinUrl}`,
            startTime: calStart,
            endTime: calEnd,
            attendeeEmails: attendees,
            organizerEmail,
            location: zoomJoinUrl,
          }), 8000, "Google Calendar createEvent");
          if (result?.eventId) eventId = result.eventId;
        }

        // Save the calendar event ID on all onboarding sessions + organizer on batch
        if (eventId) {
          // Store the organizer email AND calendar event ID on the batch
          // so cancellation can clean up even if sessions are missing
          if (batchSessionId) {
            try {
              await database.batchSession.update({
                where: { id: batchSessionId },
                data: {
                  calendarOrganizerEmail: organizerEmail || undefined,
                  googleCalendarEventId: eventId,
                },
              });
            } catch (err) { console.warn("[hiring:startOnboardingWithConfig] Suppressed error:", err); }
          }
          for (const obId of calendarOnboardingIds) {
            try {
              await database.onboardingSession.update({
                where: { id: obId },
                data: { googleCalendarEventId: eventId },
              });
            } catch {
              console.warn("[Onboarding] googleCalendarEventId column may not exist yet; skipping save.");
            }
          }
        }
        } // end organizerEmail guard
      }
    } catch (calErr) {
      console.error("[HRIQ-9904] Onboarding — calendar event creation failed:", calErr);
    }
    })().catch((e) => console.error("[HRIQ-9904] Onboarding — calendar background task failed:", e));
  }

  revalidatePath("/[orgSlug]/hiring", "page");
  // Only invalidate the specific employees that were onboarded, not the entire list
  for (const emp of validEmployees) {
    revalidatePath(`/[orgSlug]/employees/${emp.id}`, "page");
  }

  return { ok: true as const, launched: results.length, batchSessionId };
}

export async function assignToZoomSession(employeeId: string, batchSessionId: string) {
  try {
    const session = await requireRole("super_admin", "admin");

    // Scope batch lookup — super_admins see all, admins see only their org
    const batchWhere = session.orgRole === "super_admin"
      ? { id: batchSessionId }
      : { id: batchSessionId, organizationId: session.orgId };
    const batch = await database.batchSession.findFirst({ where: batchWhere });
    if (!batch) throw new HriqError("HRIQ-0504");

    const empWhere = session.orgRole === "super_admin"
      ? { id: employeeId }
      : { id: employeeId, organizationId: session.orgId };
    const employee = await database.employee.findFirst({ where: empWhere });
    if (!employee) throw new HriqError("HRIQ-0201");

    let onboarding = await database.onboardingSession.findFirst({
      where: { employeeId },
      orderBy: { createdAt: "desc" },
      include: { steps: true },
    });

    // If no onboarding session exists, create one so the employee can be assigned
    if (!onboarding) {
      onboarding = await database.onboardingSession.create({
        data: {
          employeeId,
          batchSessionId,
          zoomMeetingLink: batch.zoomJoinUrl,
          zoomMeetingDate: batch.zoomMeetingDate,
          zoomMeetingId: batch.zoomMeetingId,
          status: "in_progress",
        },
        include: { steps: true },
      });
      // Update employee status if still pre_hire
      if (employee.employmentStatus === "pre_hire") {
        await database.employee.update({ where: { id: employeeId }, data: { employmentStatus: "onboarding_in_progress" } });
      }
    }

    // Guard: don't re-assign to the same batch
    if (onboarding.batchSessionId === batchSessionId) {
      return { assigned: true };
    }

    // Track old batch for orphan cleanup
    const oldBatchId = onboarding.batchSessionId;

    await database.onboardingSession.update({
      where: { id: onboarding.id },
      data: {
        batchSessionId,
        zoomMeetingLink: batch.zoomJoinUrl,
        zoomMeetingDate: batch.zoomMeetingDate,
        zoomMeetingId: batch.zoomMeetingId,
      },
    });

    const recipientEmail = getContractorEmail(employee);

    // Look up existing form links from onboarding steps so the email includes them
    const formSteps = onboarding.steps.filter((s: any) => s.stepType === "jotform" && s.formUrl);
    const formLinks = formSteps.map((s: any) => ({ name: s.stepName, url: s.formUrl! }));

    if (recipientEmail) {
      const { sendOnboardingEmail } = await import("./send-email");
      try {
        await sendOnboardingEmail(recipientEmail, employee.legalFirstName, {
          employeeId: employee.id,
          zoomLink: batch.zoomJoinUrl ?? undefined,
          zoomDate: batch.zoomMeetingDate ? batch.zoomMeetingDate.toISOString() : undefined,
          zoomDuration: batch.zoomDuration ?? 60,
          formLinks: formLinks.length > 0 ? formLinks : undefined,
          onboardingData: {
            payRate: employee.hourlyRate ? String(employee.hourlyRate) : undefined,
            currency: employee.currency ?? "USD",
            startDate: employee.startDate ? new Date(employee.startDate as any).toISOString() : undefined,
            jobTitle: employee.jobTitle ?? undefined,
          },
        });
      } catch (emailErr) {
        console.error("[HRIQ] Email send failed (non-blocking):", emailErr);
      }
    }

    await database.onboardingSession.update({
      where: { id: onboarding.id },
      data: { zoomInviteSent: true, zoomInviteSentAt: new Date() },
    });

    const zoomStep = onboarding.steps.find((s: any) => s.stepType === "zoom_invite" && s.status !== "completed");
    if (zoomStep) {
      await database.onboardingStep.update({
        where: { id: zoomStep.id },
        data: {
          status: "completed",
          completedAt: new Date(),
          completedByUserId: session.userId,
          completedByName: session.name ?? undefined,
        },
      });
    }
    await recomputeSessionProgress(onboarding.id);

    // Rename the Zoom meeting topic and batch title to the generic name
    if (batch.zoomMeetingId) {
      try {
        const { ZoomService, isZoomConfigured } = await import("@repo/integrations/zoom");
        if (isZoomConfigured()) {
          await ZoomService.updateMeeting(batch.zoomMeetingId, {
            topic: "Remote Leverage Onboarding",
          });
        }
      } catch (e) {
        console.error("[HRIQ-2302] Onboarding — failed to rename Zoom meeting topic:", e);
      }
    }
    await database.batchSession.update({
      where: { id: batchSessionId },
      data: { title: "Remote Leverage Onboarding" },
    });

    // Send Google Calendar invite (add to existing event or create new)
    if (batch.zoomMeetingDate && recipientEmail) {
      try {
        const { GoogleCalendarService, isGoogleCalendarConfigured } = await import("@repo/integrations/google-calendar");
        if (isGoogleCalendarConfigured()) {
          // Use the stored calendar organizer (Zoom host) — no fallback
          const organizerEmail = batch.calendarOrganizerEmail || undefined;
          if (!organizerEmail) {
            console.warn("[addToBatch] No calendar organizer email on batch — skipping calendar event");
          } else {
          const calTitle = "Remote Leverage Onboarding";
          // Use UTC ISO strings — Google Calendar respects the timeZone field for display
          const calStart = batch.zoomMeetingDate.toISOString();
          const calEnd = new Date(batch.zoomMeetingDate.getTime() + (batch.zoomDuration ?? 60) * 60 * 1000).toISOString();

          // Check if the batch already has a calendar event
          // First check batch session itself (reliable even if sessions are missing)
          let existingCalEventId: string | null = batch.googleCalendarEventId ?? null;
          if (!existingCalEventId) {
            const siblingSession = await database.onboardingSession.findFirst({
              where: {
                batchSessionId,
                googleCalendarEventId: { not: null },
                id: { not: onboarding.id },
              },
              select: { googleCalendarEventId: true },
            });
            existingCalEventId = siblingSession?.googleCalendarEventId ?? null;
          }

          let eventId: string | null = null;

          if (existingCalEventId) {
            const added = await withTimeout(GoogleCalendarService.addAttendees({
              eventId: existingCalEventId,
              newEmails: [recipientEmail],
              organizerEmail,
              title: calTitle,
            }), 8000, "Google Calendar addAttendees");
            if (added) eventId = existingCalEventId;
          } else {
            const calAttendees = [recipientEmail];
            if (organizerEmail && !calAttendees.includes(organizerEmail)) {
              calAttendees.push(organizerEmail);
            }
            const result = await withTimeout(GoogleCalendarService.createEvent({
              title: calTitle,
              description: `${ONBOARDING_DESCRIPTION}\n\nJoin Zoom: ${batch.zoomJoinUrl}`,
              startTime: calStart,
              endTime: calEnd,
              attendeeEmails: calAttendees,
              organizerEmail,
              location: batch.zoomJoinUrl ?? undefined,
            }), 8000, "Google Calendar createEvent");
            if (result?.eventId) eventId = result.eventId;
          }

          if (eventId) {
            try {
              await database.onboardingSession.update({
                where: { id: onboarding.id },
                data: { googleCalendarEventId: eventId },
              });
            } catch (err) {
              console.warn("[Hiring] Failed to save googleCalendarEventId:", err);
            }
            // Store the organizer email + calendar event ID on the batch
            if (!batch.calendarOrganizerEmail || !batch.googleCalendarEventId) {
              try {
                await database.batchSession.update({
                  where: { id: batchSessionId },
                  data: {
                    calendarOrganizerEmail: organizerEmail || undefined,
                    googleCalendarEventId: eventId,
                  },
                });
              } catch (err) { console.warn("[hiring:assignToZoomSession] Suppressed error:", err); }
            }
          }
          } // end organizerEmail guard
        }
      } catch (calErr) {
        console.error("[HRIQ-9904] Onboarding — calendar event failed:", calErr);
      }
    }

    // Clean up orphaned old batch session if it has no more members
    if (oldBatchId && oldBatchId !== batchSessionId) {
      try {
        const remainingCount = await database.onboardingSession.count({ where: { batchSessionId: oldBatchId } });
        if (remainingCount === 0) {
          await database.batchSession.delete({ where: { id: oldBatchId } });
          console.info(`[assignToZoomSession] Cleaned up orphaned batch ${oldBatchId} (no remaining members)`);
        }
      } catch (cleanupErr) {
        console.warn("[assignToZoomSession] Failed to clean up old batch:", cleanupErr);
      }
    }

    try {
      await database.auditLog.create({
        data: {
          organizationId: employee.organizationId ?? undefined,
          actorType: "user",
          actorUserId: session.userId,
          action: "hiring.zoom_assigned",
          objectType: "employee",
          objectId: employeeId,
          newValue: { batchSessionId, zoomMeetingDate: batch.zoomMeetingDate },
        },
      });
    } catch (auditErr) {
      console.error("[HRIQ] Audit log write failed (non-blocking):", auditErr);
    }

    revalidatePath("/[orgSlug]/hiring", "page");

    return { assigned: true };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[hiring.ts:assignToZoomSession]", _msg);
    return { error: _msg };
  }
}

export async function syncOnboardingChecklist(employeeId: string) {
  try {
    const session = await requireRole("super_admin", "admin");
    const onboarding = await database.onboardingSession.findFirst({
      where: { employeeId },
      orderBy: { createdAt: "desc" },
      include: {
        employee: {
          select: {
            id: true,
            personalEmail: true,
            workEmail: true,
            organizationId: true,
            legalFirstName: true,
            legalLastName: true,
          },
        },
        steps: {
          where: { stepType: "jotform" },
          orderBy: { sortOrder: "asc" },
        },
      },
    });
    if (!onboarding) throw new HriqError("HRIQ-0503");

    const candidateEmails = [onboarding.employee.personalEmail, onboarding.employee.workEmail].filter(
      (e): e is string => !!e
    );
    if (candidateEmails.length === 0) {
      return { ok: false as const, error: "Cannot check forms: contractor has no email address." };
    }

    let sentForms: Array<{ name: string; url: string }> = [];
    if (onboarding.jotformsSentData) {
      try {
        const parsed = JSON.parse(onboarding.jotformsSentData) as Array<{ name?: string; url?: string }>;
        sentForms = parsed
          .filter((f) => !!f?.url)
          .map((f) => ({ name: f.name ?? "Form", url: f.url! }));
      } catch (err) {
        console.warn("[Hiring] Failed to parse jotformsSentData:", err);
        sentForms = [];
      }
    }
    if (sentForms.length === 0 && onboarding.steps.length > 0) {
      sentForms = onboarding.steps
        .filter((s: any) => s.formUrl)
        .map((s: any) => ({ name: s.stepName, url: s.formUrl }));
    }

    // Also add any step formUrls not already in sentForms
    for (const step of onboarding.steps) {
      if (step.formUrl && !sentForms.some((f) => f.url === step.formUrl)) {
        sentForms.push({ name: step.stepName, url: step.formUrl! });
      }
    }

    const { isJotFormConfigured, JotFormService, getConfiguredJotFormLinks } = await import("@repo/integrations/jotform");
    if (!isJotFormConfigured()) {
      return { ok: false as const, error: "JotForm is not configured." };
    }

    // Resolve form IDs that the API can actually query.
    // For Sign documents this translates the Sign doc ID  backing form ID.
    // Track the mapping so we can attribute results back to the right step.
    const queryIdToFormInfo = new Map<string, { name: string; url: string; originalId: string }>();
    for (const f of sentForms) {
      const queryId = resolveQueryableFormId(f.url);
      const originalId = extractJotFormIdFromUrl(f.url);
      if (queryId && !queryIdToFormInfo.has(queryId)) {
        queryIdToFormInfo.set(queryId, { name: f.name, url: f.url, originalId: originalId ?? queryId });
      }
    }

    const formIds = Array.from(queryIdToFormInfo.keys());

    // Fallback: if no form IDs extracted from sent data, try all configured JotForm templates
    if (formIds.length === 0) {
      const configuredLinks = getConfiguredJotFormLinks();
      for (const link of configuredLinks) {
        const id = resolveQueryableFormId(link.url) ?? extractJotFormIdFromUrl(link.url);
        if (id && !formIds.includes(id)) {
          formIds.push(id);
          queryIdToFormInfo.set(id, { name: link.title, url: link.url, originalId: extractJotFormIdFromUrl(link.url) ?? id });
        }
      }
    }

    // Also try API-listed forms if still empty
    if (formIds.length === 0) {
      try {
        const apiForms = await JotFormService.listForms(20);
        for (const f of apiForms) {
          const id = String(f.id ?? "");
          if (id && !formIds.includes(id)) {
            formIds.push(id);
            queryIdToFormInfo.set(id, { name: String(f.title ?? `Form ${id}`), url: "", originalId: id });
          }
        }
      } catch (err) {
        console.warn("[Hiring] Failed to list forms for sync:", err);
      }
    }

    if (formIds.length === 0) {
      return { ok: false as const, error: "Unable to determine form IDs to check." };
    }
    // Auto-register webhooks on all forms (idempotent, fire-and-forget)
    const webhookSecret = process.env.JOTFORM_WEBHOOK_SECRET?.trim();
    if (webhookSecret) {
      const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "https://hriq.remoteleverage.com").replace(/\/$/, "");
      const webhookUrl = `${baseUrl}/api/webhooks/jotform?secret=${encodeURIComponent(webhookSecret)}`;
      // Register on all queryable form IDs (regular + backing forms for Sign docs)
      const allFormIds = new Set(formIds);
      // Also add backing form IDs for any Sign documents
      for (const [, backingId] of getSignDocToBackingFormMap()) {
        allFormIds.add(backingId);
      }
      // Sign document IDs (jotform.com/sign/...) do NOT support webhook registration
      // via the API — they return 401. Skip them to avoid noise in logs.
      const signDocIds = new Set(getSignDocToBackingFormMap().keys());
      for (const fid of allFormIds) {
        if (signDocIds.has(fid)) continue; // sign docs can't receive webhooks via API
        JotFormService.ensureWebhook(fid, webhookUrl).catch((err) =>
          console.warn(`[Hiring Sync] Webhook registration failed for form ${fid}:`, err)
        );
      }
    }

    let completedCount = 0;
    const completedForms: Array<{
      formId: string;
      originalId: string;
      formName: string;
      submissionId: string;
    }> = [];
    for (const formId of formIds) {
      try {
        let submission: Record<string, unknown> | null = null;
        for (const email of candidateEmails) {
          submission = await JotFormService.checkSubmissionByEmail(formId, email);
          if (submission) break;
        }
        // Fallback: check by name if email match fails (W9/W8 forms may not have email fields)
        if (!submission) {
          const firstName = onboarding.employee.legalFirstName;
          const lastName = onboarding.employee.legalLastName;
          if (firstName && lastName) {
            submission = await JotFormService.checkSubmissionByName(formId, firstName, lastName);
          }
        }
        if (submission) {
          completedCount += 1;
          const info = queryIdToFormInfo.get(formId);
          const submissionId = String((submission as { id?: string }).id ?? "");
          if (submissionId) {
            completedForms.push({
              formId,
              originalId: info?.originalId ?? formId,
              formName: info?.name ?? `Form ${formId}`,
              submissionId,
            });
          }
        }
      } catch (error) {
        console.error(`[HRIQ-0701] JotForm — completion check failed for form ${formId}`, error);
      }
    }

    const allCompleted = completedCount > 0 && completedCount === formIds.length;
    if (completedForms.length > 0) {
      const signedPdfUrls = new Map<string, string>();
      for (const form of completedForms) {
        try {
          const fileUrl = await uploadSignedJotFormPdf({
            employeeId: onboarding.employee.id,
            formId: form.formId,
            submissionId: form.submissionId,
          });
          if (fileUrl) signedPdfUrls.set(form.submissionId, fileUrl);
        } catch (error) {
          console.error(`[HRIQ-1804] JotForm — signed PDF upload failed for ${form.submissionId}`, error);
        }
      }

      await database.$transaction(async (tx: any) => {
        if (allCompleted) {
          await tx.onboardingSession.update({
            where: { id: onboarding.id },
            data: {
              jotformsCompleted: true,
              jotformsCompletedAt: new Date(),
            },
          });
        }

        // Match completed forms to their individual onboarding steps and mark each one.
        for (const form of completedForms) {
          // Try to find the matching jotform step by form URL containing either
          // the queryable form ID (backing form) or the original ID (Sign doc).
          const matchingStep = onboarding.steps.find((s: any) =>
            s.formUrl && (s.formUrl.includes(form.formId) || s.formUrl.includes(form.originalId))
          );
          if (matchingStep && matchingStep.status !== "completed") {
            await tx.onboardingStep.update({
              where: { id: matchingStep.id },
              data: {
                status: "completed",
                completedAt: new Date(),
                completedByUserId: session.userId,
                completedByName: session.name ?? undefined,
                formSubmissionId: form.submissionId,
              },
            });
          }
        }

        // If all forms are completed, also mark any remaining jotform steps
        if (allCompleted) {
          await tx.onboardingStep.updateMany({
            where: { sessionId: onboarding.id, stepType: "jotform", status: { not: "completed" } },
            data: {
              status: "completed",
              completedAt: new Date(),
              completedByUserId: session.userId,
              completedByName: session.name ?? undefined,
            },
          });
        }

        // Persist signed forms into the contractor's Documents tab (idempotent).
        for (const form of completedForms) {
          const documentName = `${form.formName} (Signed)`;
          const fileUrl = signedPdfUrls.get(form.submissionId) ?? null;
          const existing = await tx.document.findFirst({
            where: {
              employeeId: onboarding.employee.id,
              documentName,
            },
            select: { id: true, fileUrl: true },
          });
          if (!existing) {
            await tx.document.create({
              data: {
                employeeId: onboarding.employee.id,
                documentType: inferDocumentTypeFromFormName(form.formName),
                documentName,
                description: `Imported from JotForm submission ${form.submissionId}`,
                fileUrl,
                status: "verified",
                verifiedAt: new Date(),
                verifiedByUserId: session.userId,
                uploadedByUserId: session.userId,
                uploadedByName: session.name ?? undefined,
              },
            });
          } else if (!existing.fileUrl && fileUrl) {
            await tx.document.update({
              where: { id: existing.id },
              data: {
                fileUrl,
                description: `Imported from JotForm submission ${form.submissionId}`,
              },
            });
          }
        }
      });
      await recomputeSessionProgress(onboarding.id);
    }

    revalidatePath("/[orgSlug]/hiring", "page");

    return {
      ok: true as const,
      completed: allCompleted,
      completedCount,
      totalCount: formIds.length,
      message: allCompleted
        ? "All forms signed! Use the Activate Contractor button to complete onboarding."
        : `${completedCount}/${formIds.length} forms signed so far.`,
    };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[hiring.ts:syncOnboardingChecklist]", _msg);
    return { error: _msg };
  }
}

export async function deleteBatchZoomMeeting(batchSessionId: string) {
  try {
    const session = await requireRole("super_admin", "admin");

    const batch = await database.batchSession.findUnique({
      where: { id: batchSessionId },
      include: {
        onboardingSessions: {
          select: { id: true, employeeId: true },
        },
      },
    });
    if (!batch) throw new HriqError("HRIQ-0504");
    if (!batch.zoomMeetingId && !batch.zoomJoinUrl && !batch.zoomStartUrl) {
      throw new HriqError("HRIQ-0604");
    }

    // Attempt Zoom API deletion — NON-BLOCKING: log errors but always proceed with DB cleanup
    let zoomApiResult: "deleted" | "skipped" | "failed" = "skipped";
    if (batch.zoomMeetingId) {
      try {
        const { ZoomService, isZoomConfigured } = await import("@repo/integrations/zoom");
        if (isZoomConfigured()) {
          await withTimeout(ZoomService.deleteMeeting(batch.zoomMeetingId), 8000, "Zoom deleteMeeting");
          zoomApiResult = "deleted";
        } else {
          console.warn("[Hiring] Zoom not configured — skipping API delete, cleaning DB only");
        }
      } catch (error) {
        // Log but do NOT throw — always proceed with DB cleanup
        console.error("[Hiring] Zoom API delete failed (proceeding with DB cleanup):", error instanceof Error ? error.message : error);
        zoomApiResult = "failed";
      }
    }

    const onboardingSessionIds = batch.onboardingSessions.map((s: any) => s.id);

    // Cancel Google Calendar events for all affected onboarding sessions
    // With shared calendar events, multiple sessions may reference the same eventId — deduplicate
    try {
      const { GoogleCalendarService, isGoogleCalendarConfigured } = await import("@repo/integrations/google-calendar");
      if (isGoogleCalendarConfigured()) {
        const sessionsWithCal = await database.onboardingSession.findMany({
          where: { batchSessionId, googleCalendarEventId: { not: null } },
          select: { id: true, googleCalendarEventId: true },
        });
        const uniqueEventIds = new Set(sessionsWithCal.map((s: any) => s.googleCalendarEventId).filter(Boolean));
        // Also check the batch session's own calendar event ID (fallback for orphaned events)
        if (batch.googleCalendarEventId) {
          uniqueEventIds.add(batch.googleCalendarEventId);
        }
        const calOrgEmail = batch.calendarOrganizerEmail || undefined;
        for (const eventId of uniqueEventIds) {
          try {
            await withTimeout(GoogleCalendarService.deleteEvent(eventId, calOrgEmail), 8000, "Google Calendar deleteEvent");
          } catch {
            console.warn(`[Onboarding] Failed to cancel calendar event ${eventId}`);
          }
        }
      }
    } catch (err) {
      console.error("[HRIQ-9904] Hiring — calendar cleanup failed (non-blocking):", err);
    }

    await database.$transaction(async (tx: any) => {
      // Clear ALL zoom-related fields and mark batch as cancelled
      await tx.batchSession.update({
        where: { id: batchSessionId },
        data: {
          zoomMeetingId: null,
          zoomMeetingLink: null,
          zoomJoinUrl: null,
          zoomStartUrl: null,
          zoomMeetingPassword: null,
          zoomMeetingDate: null,
          googleCalendarEventId: null,
          status: "cancelled",
        },
      });

      await tx.onboardingSession.updateMany({
        where: { batchSessionId },
        data: {
          zoomMeetingId: null,
          zoomMeetingLink: null,
          zoomMeetingDate: null,
          zoomInviteSent: false,
          zoomInviteSentAt: null,
          zoomRsvpStatus: "pending",
          googleCalendarEventId: null,
        },
      });

      if (onboardingSessionIds.length > 0) {
        await tx.onboardingStep.updateMany({
          where: {
            sessionId: { in: onboardingSessionIds },
            stepType: "zoom_invite",
          },
          data: {
            status: "pending",
            completedAt: null,
            completedByUserId: null,
            completedByName: null,
          },
        });
      }

      try {
        await tx.auditLog.create({
          data: {
            organizationId: batch.organizationId ?? undefined,
            actorType: "user",
            actorUserId: session.userId,
            action: "hiring.zoom_batch_deleted",
            objectType: "batch_session",
            objectId: batchSessionId,
            oldValue: {
              zoomMeetingId: batch.zoomMeetingId,
              zoomJoinUrl: batch.zoomJoinUrl,
              onboardingCount: onboardingSessionIds.length,
            },
            newValue: { zoomApiResult },
          },
        });
      } catch (auditErr) {
        console.error("[HRIQ] Audit log write failed (non-blocking):", auditErr);
      }
    });

    // Recalculate progress for all affected sessions since zoom_invite step was reset
    for (const sessionId of onboardingSessionIds) {
      try { await recomputeSessionProgress(sessionId); } catch (err) { console.warn("[hiring:deleteBatchZoomMeeting] Suppressed error:", err); }
    }

    // Send cancellation notification emails to all affected employees
    try {
      const { sendZoomCancellationEmail } = await import("@/app/actions/hriq/send-email");
      const employees = await database.employee.findMany({
        where: { id: { in: batch.onboardingSessions.map((s: any) => s.employeeId) } },
        select: { personalEmail: true, workEmail: true, legalFirstName: true, legalLastName: true, preferredName: true },
      });
      for (const emp of employees) {
        const email = getContractorEmail(emp);
        if (!email) continue;
        try {
          await sendZoomCancellationEmail(
            email,
            emp.preferredName ?? emp.legalFirstName,
            { meetingDate: batch.zoomMeetingDate?.toISOString() }
          );
        } catch {
          console.warn(`[Onboarding] Failed to send cancellation email to ${email}`);
        }
      }
    } catch (err) {
      console.error("[HRIQ-1703] Hiring — batch cancellation emails failed (non-blocking):", err);
    }

    revalidatePath("/[orgSlug]/hiring", "page");

    return { deleted: true, zoomApiResult };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[hiring.ts:deleteBatchZoomMeeting]", _msg);
    return { error: _msg };
  }
}

export async function removeEmployeeFromOnboarding(employeeId: string) {
  try {
    const session = await requireRole("super_admin", "admin");

    const employee = await database.employee.findFirst({
      where: session.orgRole === "super_admin" ? { id: employeeId } : { id: employeeId, organizationId: session.orgId },
      select: { id: true, organizationId: true, employmentStatus: true, onboardingStatus: true },
    });

    if (!employee) throw new HriqError("HRIQ-0201");

    const activeSession = await database.onboardingSession.findFirst({
      where: {
        employeeId,
        status: { notIn: ["completed", "cancelled"] },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        googleCalendarEventId: true,
        batchSessionId: true,
        batchSession: { select: { calendarOrganizerEmail: true, googleCalendarEventId: true } },
      },
    });

    // Remove from or cancel Google Calendar event if one exists
    // Resolve the effective calendar event ID: prefer the individual session's value,
    // but fall back to the batch's (older sessions may have NULL on the session row
    // even though they share the same batch calendar event).
    const effectiveCalEventId =
      activeSession?.googleCalendarEventId ?? activeSession?.batchSession?.googleCalendarEventId ?? null;

    if (effectiveCalEventId) {
      try {
        const { GoogleCalendarService, isGoogleCalendarConfigured } = await import("@repo/integrations/google-calendar");
        if (isGoogleCalendarConfigured()) {
          const calOrgEmail = activeSession!.batchSession?.calendarOrganizerEmail || undefined;

          // Check if other people are still on this calendar event.
          // For batch sessions: count all other ACTIVE sessions in the same batch
          // (individual sessions may have NULL googleCalendarEventId even though
          // they share the batch's event — this was the root cause of inadvertent
          // full-event deletions when a recently-added person was removed).
          let otherSessions: number;
          if (activeSession!.batchSessionId) {
            otherSessions = await database.onboardingSession.count({
              where: {
                batchSessionId: activeSession!.batchSessionId,
                id: { not: activeSession!.id },
                status: { notIn: ["completed", "cancelled"] },
              },
            });
          } else {
            otherSessions = await database.onboardingSession.count({
              where: {
                googleCalendarEventId: effectiveCalEventId,
                id: { not: activeSession!.id },
                status: { notIn: ["completed", "cancelled"] },
              },
            });
          }

          if (otherSessions > 0) {
            // Other people are on this event — just remove this employee's email
            const emp = await database.employee.findFirst({
              where: session.orgRole === "super_admin" ? { id: employeeId } : { id: employeeId, organizationId: session.orgId },
              select: { personalEmail: true, workEmail: true },
            });
            const empEmail = getContractorEmail(emp ?? { personalEmail: null, workEmail: null });
            if (empEmail) {
              await GoogleCalendarService.removeAttendees({
                eventId: effectiveCalEventId,
                removeEmails: [empEmail],
                organizerEmail: calOrgEmail,
              });
            }
          } else {
            // Last person — delete the whole event
            await GoogleCalendarService.deleteEvent(effectiveCalEventId, calOrgEmail);
          }
        }
      } catch {
        console.warn(`[Onboarding] Failed to update calendar event for removed employee ${employeeId}`);
      }
    }

    await database.$transaction(async (tx: any) => {
      if (activeSession) {
        await tx.onboardingSession.update({
          where: { id: activeSession.id },
          data: {
            status: "cancelled",
            completedAt: new Date(),
          },
        });

        await tx.onboardingStep.updateMany({
          where: {
            sessionId: activeSession.id,
            status: { in: ["pending", "sent"] },
          },
          data: {
            status: "skipped",
          },
        });
      }

      await tx.employee.update({
        where: { id: employeeId },
        data: {
          employmentStatus: "pre_hire",
          onboardingStatus: "not_started",
          infoApprovalStatus: null,
        },
      });

      try {
        await tx.auditLog.create({
          data: {
            organizationId: employee.organizationId ?? undefined,
            actorType: "user",
            actorUserId: session.userId,
            action: "hiring.onboarding_removed",
            objectType: "employee",
            objectId: employeeId,
            oldValue: {
              employmentStatus: employee.employmentStatus,
              onboardingStatus: employee.onboardingStatus,
              onboardingSessionStatus: activeSession?.status ?? null,
            },
            newValue: {
              employmentStatus: "pre_hire",
              onboardingStatus: "not_started",
              onboardingSessionStatus: activeSession ? "cancelled" : null,
            },
          },
        });
      } catch (auditErr) {
        console.error("[HRIQ] Audit log write failed (non-blocking):", auditErr);
      }
    });

    // Clean up orphaned batch session if it has no remaining active members
    if (activeSession?.batchSessionId) {
      try {
        const remainingActive = await database.onboardingSession.count({
          where: { batchSessionId: activeSession.batchSessionId, status: { notIn: ["completed", "cancelled"] } },
        });
        if (remainingActive === 0) {
          const oldBatch = await database.batchSession.findUnique({
            where: { id: activeSession.batchSessionId },
            select: { zoomMeetingId: true },
          });
          if (oldBatch?.zoomMeetingId) {
            try {
              const { ZoomService, isZoomConfigured } = await import("@repo/integrations/zoom");
              if (isZoomConfigured()) await ZoomService.deleteMeeting(oldBatch.zoomMeetingId);
            } catch (err) { console.warn("[hiring:removeEmployeeFromOnboarding] non-blocking:", err); }
          }
          await database.batchSession.update({
            where: { id: activeSession.batchSessionId },
            data: { status: "cancelled", zoomMeetingId: null, zoomJoinUrl: null, zoomStartUrl: null, zoomMeetingDate: null, googleCalendarEventId: null },
          });
        }
      } catch (cleanupErr) {
        console.warn("[removeEmployeeFromOnboarding] Failed to clean up orphaned batch:", cleanupErr);
      }
    }

    revalidatePath("/[orgSlug]/hiring", "page");
    revalidatePath(`/[orgSlug]/employees/${employeeId}`, "page");

    return { removed: true };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[hiring.ts:removeEmployeeFromOnboarding]", _msg);
    return { error: _msg };
  }
}

/**
 * Simplified client onboarding — no Zoom, no JotForm.
 * Creates onboarding with document-upload steps only.
 */
export async function startClientOnboarding(data: {
  employeeIds: string[];
  onboardingData?: { payRate?: string; monthlySalary?: string; compensationType?: string; currency?: string; startDate?: string; jobTitle?: string };
  documentNames?: string[];
  bodyText?: string;
  senderEmail?: string;
  skipEmail?: boolean;
  includePaymentSetup?: boolean;
  includeWiseSetup?: boolean;
  includeCadanaSetup?: boolean;
}) {
  const fail = (error: string) => ({ ok: false as const, error });
  const session = await requireRole("super_admin", "admin");

  const employees = await database.employee.findMany({
    where: { id: { in: data.employeeIds }, employmentStatus: "pre_hire" },
    include: { organization: { select: { id: true, name: true } } },
    // Also pull timeDoctorEmail for welcome email
  });

  const existingSessions = await database.onboardingSession.findMany({
    where: { employeeId: { in: employees.map((e: any) => e.id) }, status: { notIn: ["completed", "cancelled"] } },
    select: { employeeId: true },
  });
  const alreadyOnboarding = new Set(existingSessions.map((s: any) => s.employeeId));
  const validEmployees = employees.filter((e: any) => !alreadyOnboarding.has(e.id));
  if (validEmployees.length === 0) return fail("All selected employees already have active onboarding sessions");

  const missingEmailEmployees = validEmployees.filter(
    (employee: any) => !employee.personalEmail && !employee.workEmail
  );
  if (missingEmailEmployees.length > 0) {
    const names = missingEmailEmployees
      .map((employee: any) => `${employee.legalFirstName} ${employee.legalLastName}`)
      .join(", ");
    return fail(`Cannot launch onboarding. Missing email for: ${names}`);
  }

  const docNames = data.documentNames?.length ? data.documentNames : ["Onboarding Documents"];

  const results = [];

  for (const employee of validEmployees) {
    const onboarding = await database.onboardingSession.create({
      data: {
        employeeId: employee.id,
        status: "in_progress",
        startedByUserId: session.userId,
        startedByName: session.name ?? undefined,
        startedAt: new Date(),
        steps: {
          create: [
            ...docNames.map((name: string, idx: number) => ({
              stepType: "document_sign" as const,
              stepName: name,
              sortOrder: idx,
              isRequired: true,
            })),
            ...(data.includePaymentSetup ? [{
              stepType: "payment_setup" as const,
              stepName: "Payment Setup (Stripe Connect)",
              sortOrder: docNames.length,
              isRequired: true,
              status: (employee.organization as any)?.id === RL_ORG_ID ? "skipped" as const : "pending" as const,
              ...((employee.organization as any)?.id === RL_ORG_ID ? { completedAt: new Date() } : {}),
            }] : []),
            ...(data.includeWiseSetup ? [{
              stepType: "payment_setup" as const,
              stepName: "Payment Setup (Wise)",
              sortOrder: docNames.length + (data.includePaymentSetup ? 1 : 0),
              isRequired: true,
              status: (employee.organization as any)?.id === RL_ORG_ID ? "skipped" as const : "pending" as const,
              ...((employee.organization as any)?.id === RL_ORG_ID ? { completedAt: new Date() } : {}),
            }] : []),
            ...(data.includeCadanaSetup ? [{
              stepType: "payment_setup" as const,
              stepName: "Payment Setup (Cadana)",
              sortOrder: docNames.length + (data.includePaymentSetup ? 1 : 0) + (data.includeWiseSetup ? 1 : 0),
              isRequired: true,
              status: "pending" as const,
            }] : []),
            {
              stepType: "email_form" as const,
              stepName: "Contractor Info Form",
              sortOrder: docNames.length + (data.includePaymentSetup ? 1 : 0) + (data.includeWiseSetup ? 1 : 0) + (data.includeCadanaSetup ? 1 : 0),
              isRequired: true,
            },
          ],
        },
      },
    });

    await database.employee.update({
      where: { id: employee.id },
      data: {
        hourlyRate: sanitizeDecimal(data.onboardingData?.payRate) ?? employee.hourlyRate,
        monthlySalary: sanitizeDecimal(data.onboardingData?.monthlySalary) ?? employee.monthlySalary,
        compensationType: data.onboardingData?.compensationType?.trim() || employee.compensationType || "hourly",
        currency: data.onboardingData?.currency?.trim() || employee.currency,
        startDate: data.onboardingData?.startDate?.trim() ? new Date(data.onboardingData.startDate as any) : employee.startDate,
        jobTitle: data.onboardingData?.jobTitle?.trim() || employee.jobTitle,
        employmentStatus: "onboarding_in_progress",
        onboardingStatus: "in_progress",
      },
    });

    const recipientEmail = getContractorEmail(employee);
    if (recipientEmail && !data.skipEmail) {
      try {
        const { sendClientOnboardingEmail } = await import("./send-email");
        await sendClientOnboardingEmail(
          recipientEmail,
          employee.legalFirstName,
          employee.organization?.name ?? "your organization",
          {
            employeeId: employee.id,
            onboardingData: data.onboardingData,
            documentNames: docNames,
            bodyText: data.bodyText,
            paymentSetupType: (employee.organization?.id === RL_ORG_ID) ? "none"
              : (data.includePaymentSetup && data.includeWiseSetup) ? "both"
              : data.includePaymentSetup ? "stripe"
              : data.includeWiseSetup ? "wise"
              : data.includeCadanaSetup ? "cadana"
              : "none",
            timeDoctorEmail: (employee as any).timeDoctorEmail ?? undefined,
          },
          data.senderEmail
        );
      } catch (emailErr) {
        console.error("[HRIQ] Client onboarding email failed:", emailErr);
      }
    }

    // Payment setup happens at contractor login via the contractor-payment-gate.
    if (data.includePaymentSetup || data.includeWiseSetup || data.includeCadanaSetup) {
      // Set gate flags so contractor is redirected to payment setup on login
      const gateUpdate: Record<string, unknown> = {};
      if (data.includeWiseSetup) { gateUpdate.wiseGateRequired = true; gateUpdate.preferredPaymentMethod = "wise"; }
      if (data.includeCadanaSetup) { gateUpdate.cadanaGateRequired = true; gateUpdate.preferredPaymentMethod = "cadana"; }
      if (Object.keys(gateUpdate).length > 0) {
        await database.employee.update({
          where: { id: employee.id },
          data: gateUpdate,
        }).catch((e) => console.error("[background task failed] gate update:", e));
      }

      try {
        await database.auditLog.create({
          data: {
            organizationId: employee.organizationId ?? undefined,
            actorType: "system",
            action: "hiring.payment_setup_pending_login",
            objectType: "employee",
            objectId: employee.id,
            newValue: {
              stripe: !!data.includePaymentSetup,
              wise: !!data.includeWiseSetup,
              cadana: !!data.includeCadanaSetup,
              note: "Contractor will complete payment setup when they log in via contractor-payment-gate",
            },
          },
        }).catch((e) => console.error("[background task failed]", e));
      } catch (auditErr) {
        console.error("[HRIQ] Audit log write failed (non-blocking):", auditErr);
      }
    }

    try {
      await database.auditLog.create({
        data: {
          organizationId: employee.organizationId ?? undefined,
          actorType: "user",
          actorUserId: session.userId,
          action: "hiring.client_onboarding_started",
          objectType: "employee",
          objectId: employee.id,
          newValue: { onboardingSessionId: onboarding.id, documentSteps: docNames.length },
        },
      });
    } catch (auditErr) {
      console.error("[HRIQ] Audit log write failed (non-blocking):", auditErr);
    }

    results.push({
      employeeId: employee.id,
      onboardingSessionId: onboarding.id,
      name: `${employee.legalFirstName} ${employee.legalLastName}`,
    });
  }

  revalidatePath("/[orgSlug]/hiring", "page");
  // Only invalidate the specific employees that were onboarded, not the entire list
  for (const emp of validEmployees) {
    revalidatePath(`/[orgSlug]/employees/${emp.id}`, "page");
  }

  return {
    ok: true as const,
    message: `Onboarding started for ${results.length} contractor${results.length > 1 ? "s" : ""}.`,
    results,
  };
}

//  Reschedule Start Date + Zoom 

export async function rescheduleStartDate(employeeId: string, newStartDate: string, newZoomDate?: string, splitFromBatch?: boolean, transferCalendarTo?: string, zoomDurationOverride?: number) {
  try {
    const session = await requireRole("super_admin", "admin");

    const employee = await database.employee.findFirst({
      where: session.orgRole === "super_admin" ? { id: employeeId } : { id: employeeId, organizationId: session.orgId },
      select: {
        id: true,
        legalFirstName: true,
        legalLastName: true,
        startDate: true,
        organizationId: true,
        personalEmail: true,
        workEmail: true,
        organization: { select: { name: true } },
        onboardingSessions: {
          where: { status: { not: "completed" } },
          select: {
            id: true,
            zoomMeetingId: true,
            zoomMeetingDate: true,
            zoomMeetingLink: true,
            googleCalendarEventId: true,
            batchSessionId: true,
            batchSession: {
              select: {
                id: true,
                zoomMeetingId: true,
                zoomMeetingDate: true,
                zoomDuration: true,
                calendarOrganizerEmail: true,
                onboardingSessions: {
                  select: {
                    id: true,
                    employeeId: true,
                    employee: { select: { legalFirstName: true, legalLastName: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!employee) throw new Error("Employee not found");

    const updates: string[] = [];
    const splitSessionIds = new Set<string>(); // Track sessions split from batch (need new calendar events)
    const splitSessionData = new Map<string, { zoomLink: string | null }>(); // Track new zoom links for split sessions

    // 1. Update start date on employee
    await database.employee.update({
      where: { id: employeeId },
      data: { startDate: new Date(newStartDate) },
    });
    updates.push(`Start date updated to ${newStartDate}`);

    // 2. Reschedule Zoom meetings if new zoom date provided
    if (newZoomDate) {
      const zoomIso = pacificBareIso(newZoomDate);
      const zoomUtc = pacificToUtc(newZoomDate);
      const rescheduledMeetingIds = new Set<string>();

      for (const os of employee.onboardingSessions) {
        const isInBatch = !!os.batchSessionId && !!os.batchSession;
        const batchHasOthers = isInBatch && (os.batchSession!.onboardingSessions.length > 1);

        // ─── BATCH MEMBER: split out into their own meeting ───
        if (isInBatch && batchHasOthers && splitFromBatch) {
          const { ZoomService, isZoomConfigured } = await import("@repo/integrations/zoom");

          // Create a NEW batch for this person's rescheduled session
          const splitDuration = zoomDurationOverride ?? os.batchSession?.zoomDuration ?? 60;
          const newBatch = await database.batchSession.create({
            data: {
              organizationId: employee.organizationId,
              title: "Remote Leverage Onboarding",
              zoomMeetingDate: zoomUtc,
              zoomDuration: splitDuration,
              calendarOrganizerEmail: os.batchSession?.calendarOrganizerEmail || undefined,
              status: "scheduled",
            },
          });

          // Move session to the new batch
          await database.onboardingSession.update({
            where: { id: os.id },
            data: { batchSessionId: newBatch.id, zoomMeetingDate: zoomUtc },
          });
          updates.push(`Split from batch "${os.batchSession!.id}" into new batch "${newBatch.id}" — other members not affected`);

          // Create a new individual Zoom meeting for this person
          let newZoomLink: string | null = null;
          if (isZoomConfigured()) {
            try {
              const newMeeting = await ZoomService.createMeeting({
                topic: "Remote Leverage Onboarding",
                startTime: zoomIso,
                timezone: "America/Los_Angeles",
                duration: splitDuration,
                agenda: ONBOARDING_DESCRIPTION,
                hostUser: os.batchSession?.calendarOrganizerEmail || undefined,
              });
              newZoomLink = newMeeting.join_url || null;
              await database.onboardingSession.update({
                where: { id: os.id },
                data: {
                  zoomMeetingId: newMeeting.id?.toString() || null,
                  zoomMeetingLink: newZoomLink,
                },
              });
              await database.batchSession.update({
                where: { id: newBatch.id },
                data: {
                  zoomMeetingId: newMeeting.id?.toString() || null,
                  zoomJoinUrl: newMeeting.join_url || null,
                  zoomStartUrl: newMeeting.start_url || null,
                },
              });
              updates.push(`New individual Zoom meeting created`);
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              console.error(`[rescheduleStartDate] SPLIT: Create individual Zoom failed:`, msg);
              updates.push(`Individual Zoom creation failed: ${msg}`);
            }
          } else {
            console.warn(`[rescheduleStartDate] SPLIT: Zoom not configured — skipping Zoom creation`);
          }

          // Remove this person from the OLD batch's calendar event (don't delete the whole event)
          if (os.googleCalendarEventId) {
            try {
              const { GoogleCalendarService, isGoogleCalendarConfigured } = await import("@repo/integrations/google-calendar");
              if (isGoogleCalendarConfigured()) {
                const splitOrgEmail = os.batchSession?.calendarOrganizerEmail || undefined;
                if (splitOrgEmail) {
                  // Get current event, remove this attendee, update
                  const event = await GoogleCalendarService.getEvent(os.googleCalendarEventId, splitOrgEmail);
                  if (event?.attendees) {
                    const recipientEmail = getContractorEmail(employee);
                    const filtered = event.attendees.filter((a) => a.email !== recipientEmail);
                    if (filtered.length < event.attendees.length) {
                      await GoogleCalendarService.updateEvent({
                        eventId: os.googleCalendarEventId,
                        attendeeEmails: filtered.map((a) => a.email),
                        organizerEmail: splitOrgEmail,
                      });
                      updates.push(`Removed from old batch calendar event`);
                    }
                  }
                }
                await database.onboardingSession.update({
                  where: { id: os.id },
                  data: { googleCalendarEventId: null },
                });
              }
            } catch (calErr) {
              console.error(`[rescheduleStartDate] SPLIT: Failed to remove from old calendar event:`, calErr);
            }
          }

          splitSessionIds.add(os.id);
          splitSessionData.set(os.id, { zoomLink: newZoomLink });
          continue; // Don't touch the batch meeting
        }

        // ─── BATCH MEMBER: sole member or moving whole batch ───
        if (isInBatch && os.batchSession?.zoomMeetingId && !rescheduledMeetingIds.has(os.batchSession.zoomMeetingId)) {
          const { ZoomService, isZoomConfigured } = await import("@repo/integrations/zoom");
          if (isZoomConfigured()) {
            try {
              await ZoomService.updateMeeting(os.batchSession.zoomMeetingId, {
                startTime: zoomIso,
                timezone: "America/Los_Angeles",
              });
              rescheduledMeetingIds.add(os.batchSession.zoomMeetingId);
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              console.error(`[rescheduleStartDate]  Batch Zoom ${os.batchSession.zoomMeetingId} FAILED:`, msg);
              dbLogError(`Batch Zoom update failed: ${msg}`, {
                source: "rescheduleStartDate",
                raw: { meetingId: os.batchSession.zoomMeetingId, batchId: os.batchSession.id, employeeName: `${employee.legalFirstName} ${employee.legalLastName}` },
              });
              updates.push(`Batch Zoom update failed: ${msg}`);
            }
          }

          await database.batchSession.update({
            where: { id: os.batchSession.id },
            data: { zoomMeetingDate: zoomUtc, ...(zoomDurationOverride ? { zoomDuration: zoomDurationOverride } : {}) },
          });
          // Also update the individual session date
          await database.onboardingSession.update({
            where: { id: os.id },
            data: { zoomMeetingDate: zoomUtc },
          });
          if (rescheduledMeetingIds.has(os.batchSession.zoomMeetingId)) {
            updates.push(`Batch Zoom session rescheduled`);
          }
          continue;
        }

        // ─── INDIVIDUAL session zoom ───
        if (os.zoomMeetingId && !rescheduledMeetingIds.has(os.zoomMeetingId)) {
          const { ZoomService, isZoomConfigured } = await import("@repo/integrations/zoom");
          if (isZoomConfigured()) {
            try {
              await ZoomService.updateMeeting(os.zoomMeetingId, {
                startTime: zoomIso,
                timezone: "America/Los_Angeles",
              });
              rescheduledMeetingIds.add(os.zoomMeetingId);
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              console.error(`[rescheduleStartDate]  Zoom meeting ${os.zoomMeetingId} FAILED:`, msg);
              dbLogError(`Individual Zoom update failed: ${msg}`, {
                source: "rescheduleStartDate",
                raw: { meetingId: os.zoomMeetingId, sessionId: os.id, employeeName: `${employee.legalFirstName} ${employee.legalLastName}` },
              });
              updates.push(`Zoom update failed: ${msg}`);
            }
          } else {
            console.warn("[rescheduleStartDate] Zoom is NOT configured — skipping Zoom API call");
            updates.push("Zoom not configured");
          }

          await database.onboardingSession.update({
            where: { id: os.id },
            data: { zoomMeetingDate: zoomUtc },
          });
          if (rescheduledMeetingIds.has(os.zoomMeetingId)) {
            updates.push(`Zoom meeting rescheduled`);
          }
        }
      }

      // Clean up orphaned old batch sessions left empty after splits
      if (splitSessionIds.size > 0) {
        const oldBatchIds = new Set<string>();
        for (const os of employee.onboardingSessions) {
          if (os.batchSessionId && splitSessionIds.has(os.id)) {
            oldBatchIds.add(os.batchSessionId);
          }
        }
        for (const oldBatchId of oldBatchIds) {
          try {
            const remaining = await database.onboardingSession.count({ where: { batchSessionId: oldBatchId } });
            if (remaining === 0) {
              await database.batchSession.delete({ where: { id: oldBatchId } });
              updates.push(`Cleaned up empty batch ${oldBatchId}`);
            }
          } catch (cleanupErr) {
            console.warn(`[rescheduleStartDate] Failed to clean up old batch ${oldBatchId}:`, cleanupErr);
          }
        }
      }

      if (employee.onboardingSessions.length === 0) {
        // No active sessions — event was deleted. Create a fresh batch + session + zoom.
        const { ZoomService, isZoomConfigured } = await import("@repo/integrations/zoom");

        const fallbackDuration = zoomDurationOverride ?? 60;
        const newBatch = await database.batchSession.create({
          data: {
            organizationId: employee.organizationId,
            title: "Remote Leverage Onboarding",
            zoomMeetingDate: zoomUtc,
            zoomDuration: fallbackDuration,
            calendarOrganizerEmail: transferCalendarTo || undefined,
            status: "scheduled",
          },
        });

        let zoomLink: string | null = null;
        let zoomMeetingId: string | null = null;
        if (isZoomConfigured()) {
          try {
            const meeting = await ZoomService.createMeeting({
              topic: "Remote Leverage Onboarding",
              startTime: zoomIso,
              timezone: "America/Los_Angeles",
              duration: fallbackDuration,
              agenda: ONBOARDING_DESCRIPTION,
              hostUser: transferCalendarTo || undefined,
            });
            zoomLink = meeting.join_url || null;
            zoomMeetingId = meeting.id?.toString() || null;
            await database.batchSession.update({
              where: { id: newBatch.id },
              data: {
                zoomMeetingId,
                zoomJoinUrl: zoomLink,
                zoomStartUrl: meeting.start_url || null,
              },
            });
            updates.push("New Zoom meeting created");
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            updates.push(`Zoom creation failed: ${msg}`);
          }
        }

        const newSession = await database.onboardingSession.create({
          data: {
            employeeId: employee.id,
            batchSessionId: newBatch.id,
            zoomMeetingDate: zoomUtc,
            zoomMeetingId,
            zoomMeetingLink: zoomLink,
            status: "in_progress",
          },
        });

        // Create calendar event
        try {
          const { GoogleCalendarService, isGoogleCalendarConfigured } = await import("@repo/integrations/google-calendar");
          if (isGoogleCalendarConfigured()) {
            const attendees: string[] = [];
            const recipientEmail = getContractorEmail(employee);
            if (recipientEmail) attendees.push(recipientEmail);

            const calEvent = await GoogleCalendarService.createEvent({
              title: "Remote Leverage Onboarding",
              description: `${ONBOARDING_DESCRIPTION}\n\nJoin Zoom: ${zoomLink || "TBD"}`,
              startTime: zoomUtc.toISOString(),
              endTime: new Date(zoomUtc.getTime() + fallbackDuration * 60 * 1000).toISOString(),
              attendeeEmails: attendees,
              organizerEmail: transferCalendarTo || undefined,
              location: zoomLink || undefined,
            });

            if (calEvent?.eventId) {
              await database.onboardingSession.update({
                where: { id: newSession.id },
                data: { googleCalendarEventId: calEvent.eventId },
              });
              await database.batchSession.update({
                where: { id: newBatch.id },
                data: { googleCalendarEventId: calEvent.eventId },
              });
              updates.push("Calendar event created");
            }
          }
        } catch (calErr) {
          console.error("[rescheduleStartDate] Calendar creation failed:", calErr);
          updates.push("Calendar event creation failed");
        }

        updates.push("New onboarding session created (previous event was deleted)");
      }
    }

    // 3. Update or CREATE Google Calendar events if zoom date changed
    if (newZoomDate) {
      const zoomUtcDate = pacificToUtc(newZoomDate);
      // Use the override duration, fall back to the batch's stored duration, then default to 60
      const calendarDuration = zoomDurationOverride ?? employee.onboardingSessions[0]?.batchSession?.zoomDuration ?? 60;
      const endUtc = new Date(zoomUtcDate.getTime() + calendarDuration * 60 * 1000);

      try {
        const { GoogleCalendarService, isGoogleCalendarConfigured } = await import("@repo/integrations/google-calendar");
        if (isGoogleCalendarConfigured()) {
          // dbLogInfo("[rescheduleStartDate] Step 3: Google Calendar configured, processing ${employee.onboardingSessions.length} sessions`);
          for (const os of employee.onboardingSessions) {
            const organizerEmail = os.batchSession?.calendarOrganizerEmail || undefined;
            dbLogInfo(`Calendar organizer resolved`, {
              source: "rescheduleStartDate",
              raw: { resolved: organizerEmail || "NONE", sessionId: os.id, hasBatch: !!os.batchSession },
            });
            const wasSplit = splitSessionIds.has(os.id);
            const hasExistingEvent = os.googleCalendarEventId && !wasSplit;

            if (!organizerEmail) {
              dbLogError(`No calendar organizer email — cannot update/create calendar event`, {
                source: "rescheduleStartDate",
                raw: { sessionId: os.id, hasBatch: !!os.batchSession, eventId: os.googleCalendarEventId },
              });
              updates.push(`Calendar event skipped — no organizer email configured (session needs a batch with calendar organizer)`);
            } else if (hasExistingEvent) {
              // Update existing calendar event
              try {
                // dbLogInfo("[rescheduleStartDate] Step 3: Updating existing event ${os.googleCalendarEventId} (organizer: ${organizerEmail || "default"})`);
                const calUpdated = await GoogleCalendarService.updateEvent({
                  eventId: os.googleCalendarEventId!,
                  startTime: zoomUtcDate.toISOString(),
                  endTime: endUtc.toISOString(),
                  organizerEmail,
                });
                if (calUpdated) {
                  updates.push("Calendar event updated");
                } else {
                  console.error(`[rescheduleStartDate] Step 3: updateEvent returned false for ${os.googleCalendarEventId} — the API call failed silently (organizer: ${organizerEmail || "default"})`);
                  dbLogError(`Calendar updateEvent returned false`, {
                    source: "rescheduleStartDate",
                    raw: { eventId: os.googleCalendarEventId, organizer: organizerEmail || "default", sessionId: os.id, employeeName: `${employee.legalFirstName} ${employee.legalLastName}` },
                  });
                  updates.push(`Calendar event update failed (event ${os.googleCalendarEventId} — may need manual update)`);
                }
              } catch (calErr) {
                console.error(`[rescheduleStartDate] Step 3: Failed to update calendar event ${os.googleCalendarEventId}:`, calErr);
                dbLogError(`Calendar updateEvent threw: ${calErr instanceof Error ? calErr.message : String(calErr)}`, {
                  source: "rescheduleStartDate",
                  raw: { eventId: os.googleCalendarEventId, organizer: organizerEmail || "default", sessionId: os.id },
                });
                updates.push(`Calendar event update error: ${calErr instanceof Error ? calErr.message : String(calErr)}`);
              }
            } else {
              // No calendar event exists (or was split) — create one
              try {
                const attendees: string[] = [];
                const recipientEmail = getContractorEmail(employee);
                if (recipientEmail) attendees.push(recipientEmail);

                // Use fresh zoom link from split data if available, otherwise fall back to in-memory
                const splitData = splitSessionData.get(os.id);
                const zoomUrl = splitData?.zoomLink || os.zoomMeetingLink || "";

                // dbLogInfo("[rescheduleStartDate] Step 3: Creating NEW calendar event (wasSplit=${wasSplit}, zoomUrl=${zoomUrl}, attendees=${attendees.join(",")})`);
                const result = await GoogleCalendarService.createEvent({
                  title: "Remote Leverage Onboarding",
                  description: `${ONBOARDING_DESCRIPTION}\n\nJoin Zoom: ${zoomUrl}`,
                  startTime: zoomUtcDate.toISOString(),
                  endTime: endUtc.toISOString(),
                  attendeeEmails: attendees,
                  organizerEmail,
                  location: zoomUrl,
                });
                if (result?.eventId) {
                  await database.onboardingSession.update({
                    where: { id: os.id },
                    data: { googleCalendarEventId: result.eventId },
                  });
                  // Also update the new batch's calendar event ID if this was a split
                  if (wasSplit) {
                    const freshSession = await database.onboardingSession.findUnique({
                      where: { id: os.id },
                      select: { batchSessionId: true },
                    });
                    if (freshSession?.batchSessionId) {
                      await database.batchSession.update({
                        where: { id: freshSession.batchSessionId },
                        data: { googleCalendarEventId: result.eventId },
                      });
                    }
                  }
                  updates.push("Calendar event created");
                } else {
                  console.warn(`[rescheduleStartDate] Step 3: createEvent returned null`);
                  updates.push("Calendar event creation returned null");
                }
              } catch (calErr) {
                console.error(`[rescheduleStartDate] Step 3: Failed to create calendar event:`, calErr);
                updates.push("Calendar event creation failed");
              }
            }
          }
        } else {
          console.warn(`[rescheduleStartDate] Step 3: Google Calendar NOT configured`);
          updates.push("Google Calendar not configured — no calendar event created");
        }
      } catch (err) {
        console.error("[rescheduleStartDate] Step 3: Google Calendar import failed:", err);
      }
    }

    // 3b. Transfer calendar events to a different host if requested
    if (transferCalendarTo) {
      try {
        const { GoogleCalendarService, isGoogleCalendarConfigured } = await import("@repo/integrations/google-calendar");
        if (isGoogleCalendarConfigured()) {
          for (const os of employee.onboardingSessions) {
            if (!os.googleCalendarEventId) continue;
            const currentOrganizer = os.batchSession?.calendarOrganizerEmail;
            if (currentOrganizer === transferCalendarTo) continue; // already on the right calendar

            try {
              const moved = await GoogleCalendarService.moveEvent(
                os.googleCalendarEventId,
                currentOrganizer || undefined,
                transferCalendarTo,
              );
              if (moved) {
                // Update batch session organizer email if it exists
                if (os.batchSessionId) {
                  await database.batchSession.update({
                    where: { id: os.batchSessionId },
                    data: { calendarOrganizerEmail: transferCalendarTo },
                  });
                }
                updates.push(`Calendar transferred to ${transferCalendarTo}`);
                dbLogInfo(`Calendar event moved`, {
                  source: "rescheduleStartDate",
                  raw: { eventId: os.googleCalendarEventId, from: currentOrganizer, to: transferCalendarTo, sessionId: os.id },
                });
              } else {
                updates.push(`Calendar transfer failed for event ${os.googleCalendarEventId}`);
                dbLogError(`Calendar moveEvent returned false`, {
                  source: "rescheduleStartDate",
                  raw: { eventId: os.googleCalendarEventId, from: currentOrganizer, to: transferCalendarTo },
                });
              }
            } catch (moveErr) {
              updates.push(`Calendar transfer error: ${moveErr instanceof Error ? moveErr.message : String(moveErr)}`);
              dbLogError(`Calendar moveEvent threw: ${moveErr instanceof Error ? moveErr.message : String(moveErr)}`, {
                source: "rescheduleStartDate",
                raw: { eventId: os.googleCalendarEventId, from: currentOrganizer, to: transferCalendarTo },
              });
            }
          }
        }
      } catch (err) {
        console.error("[rescheduleStartDate] Calendar transfer import failed:", err);
      }
    }

    // 4. Audit log
    try {
      await database.auditLog.create({
        data: {
          organizationId: employee.organizationId ?? undefined,
          actorType: "user",
          actorUserId: session.userId,
          action: "hiring.start_date_rescheduled",
          objectType: "employee",
          objectId: employeeId,
          newValue: {
            employeeName: `${employee.legalFirstName} ${employee.legalLastName}`,
            oldStartDate: employee.startDate?.toISOString(),
            newStartDate,
            newZoomDate: newZoomDate || null,
            updates,
          },
        },
      });
    } catch (auditErr) {
      console.error("[HRIQ] Audit log write failed (non-blocking):", auditErr);
    }

    revalidatePath(`/[orgSlug]/employees/${employeeId}`, "page");
    revalidatePath(`/[orgSlug]/hiring`, "page");

    // 5. Send reschedule notification email to contractor
    const recipientEmail = getContractorEmail(employee);
    if (recipientEmail) {
      try {
        const { sendRescheduleEmail } = await import("./send-email");
        const orgName = employee.organization?.name;
        await sendRescheduleEmail(recipientEmail, employee.legalFirstName, {
          newStartDate,
          newZoomDate: newZoomDate || undefined,
          orgName: orgName || undefined,
        });
        updates.push("Reschedule email sent");
      } catch (err) {
        console.error("[rescheduleStartDate] Failed to send reschedule email:", err);
      }
    }

    dbLogInfo(`rescheduleStartDate completed for ${employee.legalFirstName} ${employee.legalLastName}`, {
      source: "rescheduleStartDate",
      raw: { employeeId, newStartDate, newZoomDate, updates },
    });
    return { ok: true, message: updates.join(". ") || "Start date updated", updates };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[hiring.ts:rescheduleStartDate]", _msg);
    return { error: _msg };
  }
}


// Calendar/scheduling functions — wrappers required because "use server" only allows async function exports
import { syncCalendarRsvps as _syncCalendarRsvps, moveAttendeeToEvent as _moveAttendeeToEvent, rescheduleBatchEvent as _rescheduleBatchEvent } from "./hiring-calendar";

export async function syncCalendarRsvps() {
  return _syncCalendarRsvps();
}

export async function moveAttendeeToEvent(sessionId: string, targetBatchId: string) {
  return _moveAttendeeToEvent(sessionId, targetBatchId);
}

export async function rescheduleBatchEvent(batchSessionId: string, newZoomDate: string, newDuration?: number) {
  return _rescheduleBatchEvent(batchSessionId, newZoomDate, newDuration);
}

export async function getHiringPipelineForOrg(orgId: string) {
  const session = await requireRole("super_admin");

  return database.employee.findMany({
    where: {
      organizationId: orgId,
      employmentStatus: { in: ["pre_hire", "onboarding_scheduled", "onboarding_in_progress"] },
    },
    include: {
      organization: { select: { name: true } },
      onboardingSessions: {
        where: { status: { notIn: ["cancelled", "completed"] } },
        select: {
          id: true, status: true, overallProgress: true,
          jotformsSent: true, jotformsSentData: true,
          jotformsCompleted: true, jotformsCompletedAt: true,
          zoomMeetingLink: true, zoomMeetingDate: true,
          zoomInviteSent: true, zoomRsvpStatus: true,
          startedByName: true, startedAt: true,
          googleCalendarEventId: true, batchSessionId: true,
          batchSession: {
            select: {
              id: true, title: true, zoomMeetingDate: true, zoomDuration: true,
              calendarOrganizerEmail: true,
              onboardingSessions: {
                where: { status: { notIn: ["cancelled", "completed"] } },
                select: {
                  id: true,
                  employee: { select: { id: true, legalFirstName: true, legalLastName: true } },
                },
              },
            },
          },
          steps: {
            select: { id: true, stepType: true, stepName: true, status: true, sortOrder: true, isRequired: true, completedAt: true, formUrl: true, formSubmissionId: true },
            orderBy: { sortOrder: "asc" },
          },
        },
        take: 1,
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}
