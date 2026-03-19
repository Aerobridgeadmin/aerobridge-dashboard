"use server";

import { requireOrg, requireRole } from "@repo/auth/session";
import { database } from "@repo/database";
import { revalidatePath } from "next/cache";
import { buildPublicJotFormUrl, isPublicSignFillUrl, mergePrefillParams, recomputeSessionProgress, getContractorEmail } from "@/lib/hriq/utils";
import { pacificToUtc, pacificBareIso, smartParseDatetime } from "@/lib/hriq/format";
import { HriqError } from "@/lib/hriq/errors";
import { RL_ORG_ID, withTimeout } from "./constants";

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

const REQUIRED_JOTFORM_EMAIL = process.env.JOTFORM_ACCOUNT_EMAIL ?? "recruiters@remoteleverage.com";

export async function updateOnboardingStep(
  stepId: string,
  data: { status: string; notes?: string }
): Promise<{ error: string } | { onboardingComplete: boolean; employeeName: string } & Record<string, any>> {
  try {
  const session = await requireRole("super_admin", "admin");

  const ALLOWED_STEP_STATUSES = ["pending", "sent", "in_progress", "completed", "skipped", "blocked"];
  if (!ALLOWED_STEP_STATUSES.includes(data.status)) {
    return { error: `Invalid step status: ${data.status}` };
  }

  const step = await database.onboardingStep.findFirst({
    where: { id: stepId },
    include: { session: { select: { id: true, status: true, employee: { select: { id: true, organizationId: true, legalFirstName: true, legalLastName: true } } } } },
  });

  if (!step) {
    // Step may have been deleted during pipeline reconfiguration while UI was stale
    return { error: "Onboarding step not found — the page may be outdated. Please refresh." };
  }
  // Super admins can update steps for any org; others are scoped to their own org
  if (session.orgRole !== "super_admin" && step.session.employee.organizationId !== session.orgId) {
    return { error: "Onboarding step not found or access denied." };
  }

  // Prevent modifying steps in finished sessions
  if (step.session.status === "cancelled" || step.session.status === "completed") {
    return { error: `Cannot update steps in a ${step.session.status} onboarding session` };
  }

  const isCompleting = data.status === "completed";
  const updated = await database.onboardingStep.update({
    where: { id: stepId },
    data: {
      status: data.status,
      notes: data.notes,
      completedAt: isCompleting ? new Date() : null,
      completedByUserId: isCompleting ? session.userId : null,
      completedByName: isCompleting ? (session.name ?? undefined) : null,
    },
  });

  // Recalculate progress using shared helper
  await recomputeSessionProgress(step.sessionId);

  const refreshed = await database.onboardingSession.findUnique({
    where: { id: step.sessionId },
    select: { overallProgress: true },
  });
  const progress = refreshed?.overallProgress ?? 0;

  revalidatePath("/[orgSlug]/hiring", "page");
  revalidatePath(`/[orgSlug]/employees/${step.session.employee.id}`, "page");

  return { ...updated, onboardingComplete: progress >= 100, employeeName: `${step.session.employee.legalFirstName} ${step.session.employee.legalLastName}` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to update onboarding step";
    console.error("[updateOnboardingStep]", msg);
    return { error: msg };
  }
}

export async function completeAllJotformSteps(sessionId: string) {
  try {
    const session = await requireRole("super_admin", "admin");

    const onboardingSession = await database.onboardingSession.findFirst({
      where: { id: sessionId },
      include: { employee: { select: { organizationId: true } } },
    });
    if (!onboardingSession) {
      throw new HriqError("HRIQ-0503");
    }
    if (session.orgRole !== "super_admin" && onboardingSession.employee.organizationId !== session.orgId) {
      throw new HriqError("HRIQ-0503");
    }

    // Mark all jotform steps as completed
    await database.onboardingStep.updateMany({
      where: { sessionId, stepType: "jotform", status: { not: "completed" } },
      data: {
        status: "completed",
        completedAt: new Date(),
        completedByUserId: session.userId,
        completedByName: session.name ?? undefined,
      },
    });

    // Also mark session-level jotforms as completed
    await database.onboardingSession.update({
      where: { id: sessionId },
      data: { jotformsCompleted: true, jotformsCompletedAt: new Date() },
    });

    // Recalculate progress using shared helper (also handles dashboard provisioning)
    await recomputeSessionProgress(sessionId);

    revalidatePath("/[orgSlug]/hiring", "page");

    return { completed: true };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[onboarding.ts:completeAllJotformSteps]", _msg);
    return { error: _msg };
  }
}

//  Batch Sessions 

export async function getBatchSessions() {
  const session = await requireOrg();

  return database.batchSession.findMany({
    where: { organizationId: session.orgId },
    include: {
      onboardingSessions: {
        include: {
          employee: {
            select: { id: true, legalFirstName: true, legalLastName: true, employeeNumber: true, personalEmail: true, workEmail: true },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function createBatchSession(data: {
  title: string;
  description?: string;
  zoomMeetingDate?: string;
  zoomDuration?: number;
  zoomHost?: string;
}) {
  const session = await requireOrg();

  // Create actual Zoom meeting if date is provided
  let zoomMeetingId: string | undefined;
  let zoomJoinUrl: string | undefined;
  let zoomStartUrl: string | undefined;

  if (data.zoomMeetingDate) {
    try {
      const { ZoomService, isZoomConfigured } = await import("@repo/integrations/zoom");
      if (isZoomConfigured()) {
        const meeting = await withTimeout(ZoomService.createMeeting({
          topic: "Remote Leverage Onboarding",
          startTime: pacificBareIso(data.zoomMeetingDate),
          duration: data.zoomDuration ?? 60,
          timezone: "America/Los_Angeles",
          agenda: data.description ?? `Onboarding session: ${data.title}`,
          hostUser: data.zoomHost,
        }), 8000, "Zoom createMeeting");
        if (meeting) {
          zoomMeetingId = String(meeting.id);
          zoomJoinUrl = meeting.join_url;
          zoomStartUrl = meeting.start_url;

          // Notify the Zoom host via email so they know a meeting was created for them
          const hostEmail = data.zoomHost?.trim();
          if (hostEmail && hostEmail !== "me") {
            try {
              const { sendZoomHostNotificationEmail } = await import("./send-email");
              await sendZoomHostNotificationEmail(hostEmail, {
                meetingTitle: "Remote Leverage Onboarding",
                meetingDate: data.zoomMeetingDate,
                duration: data.zoomDuration ?? 60,
                startUrl: meeting.start_url,
                joinUrl: meeting.join_url,
              });
            } catch (emailErr) {
              console.error("[HRIQ-1703] Onboarding — failed to notify Zoom host:", emailErr);
            }
          }
        }
      }
    } catch (e) {
      console.error("[HRIQ-2301] Onboarding — failed to create Zoom meeting:", e);
    }
  }

  const batch = await database.batchSession.create({
    data: {
      organizationId: session.orgId,
      title: data.title,
      description: data.description,
      zoomMeetingDate: data.zoomMeetingDate ? pacificToUtc(data.zoomMeetingDate) : undefined,
      zoomDuration: data.zoomDuration ?? 60,
      zoomMeetingId,
      zoomJoinUrl,
      zoomStartUrl,
      calendarOrganizerEmail: data.zoomHost?.trim() || undefined,
      createdByUserId: session.userId,
      createdByName: session.name ?? undefined,
    },
  });

  // Create Google Calendar event so it appears on the host's calendar immediately
  if (data.zoomMeetingDate && data.zoomHost?.trim()) {
    try {
      const { GoogleCalendarService, isGoogleCalendarConfigured } = await import("@repo/integrations/google-calendar");
      if (isGoogleCalendarConfigured()) {
        const organizerEmail = data.zoomHost.trim();
        const calStart = pacificToUtc(data.zoomMeetingDate).toISOString();
        const calEnd = new Date(pacificToUtc(data.zoomMeetingDate).getTime() + (data.zoomDuration ?? 60) * 60 * 1000).toISOString();

        const calEvent = await withTimeout(GoogleCalendarService.createEvent({
          title: data.title,
          description: [
            data.description,
            zoomJoinUrl ? `Zoom Join: ${zoomJoinUrl}` : null,
          ].filter(Boolean).join("\n\n"),
          startTime: calStart,
          endTime: calEnd,
          timezone: "America/Los_Angeles",
          organizerEmail,
          attendeeEmails: [],
        }), 8000, "Google Calendar createEvent");

        if (calEvent?.eventId) {
          await database.batchSession.update({
            where: { id: batch.id },
            data: { googleCalendarEventId: calEvent.eventId },
          });
        }
      }
    } catch (calErr) {
      console.error("[HRIQ-2303] createBatchSession — failed to create calendar event:", calErr);
    }
  }

  revalidatePath("/[orgSlug]/hiring", "page");

  return batch;
}

export async function addEmployeesToBatch(
  batchSessionId: string,
  employeeIds: string[]
) {
  try {
    const session = await requireOrg();

    const batch = await database.batchSession.findFirst({
      where: { id: batchSessionId, organizationId: session.orgId },
    });
    if (!batch) throw new HriqError("HRIQ-0504");

    // Rename the Zoom meeting topic and batch title to the generic name
    // when adding more candidates (may have been created with an individual name)
    if (batch.zoomMeetingId) {
      try {
        const { ZoomService, isZoomConfigured } = await import("@repo/integrations/zoom");
        if (isZoomConfigured()) {
          await withTimeout(ZoomService.updateMeeting(batch.zoomMeetingId, {
            topic: "Remote Leverage Onboarding",
          }), 8000, "Zoom updateMeeting");
        }
      } catch (e) {
        console.error("[HRIQ-2302] Onboarding — failed to rename Zoom meeting topic:", e);
      }
    }
    await database.batchSession.update({
      where: { id: batchSessionId },
      data: { title: "Remote Leverage Onboarding" },
    });

    // Look up forms used by existing employees in this batch so new additions get the same forms
    const existingSteps = await database.onboardingStep.findMany({
      where: {
        session: { batchSessionId },
        stepType: "jotform",
        formUrl: { not: null },
      },
      select: { formUrl: true, stepName: true },
      distinct: ["formUrl"],
    });

    // Extract form IDs and titles from existing step URLs
    const batchForms: { id: string; title: string; baseUrl: string }[] = [];
    for (const step of existingSteps) {
      if (!step.formUrl) continue;
      const match = step.formUrl.match(/(\d{12,})/);
      if (match) {
        batchForms.push({
          id: match[1],
          title: step.stepName ?? `Form ${match[1]}`,
          baseUrl: step.formUrl.split("?")[0] ?? step.formUrl,
        });
      }
    }

    // Look up organization name for form prefill
    const batchOrg = await database.organization.findUnique({ where: { id: session.orgId }, select: { name: true } });
    const batchOrgName = batchOrg?.name ?? "Remote Leverage";

    const results = [];
    const batchCalAttendees: string[] = [];
    const batchCalOnboardingIds: string[] = [];

    for (const employeeId of employeeIds) {
      const { onboarding, employee } = await database.$transaction(async (tx: any) => {
        let ob = await tx.onboardingSession.findFirst({
          where: { employeeId, employee: { organizationId: session.orgId } },
        });

        if (!ob) {
          ob = await tx.onboardingSession.create({
            data: {
              employeeId,
              batchSessionId,
              status: "in_progress",
              startedByUserId: session.userId,
              startedByName: session.name ?? undefined,
              startedAt: new Date(),
              zoomMeetingLink: batch.zoomJoinUrl,
              zoomMeetingId: batch.zoomMeetingId,
              zoomMeetingDate: batch.zoomMeetingDate,
              steps: {
                create: [
                  { stepType: "zoom_invite", stepName: "Zoom Invite (Add to Batch)", sortOrder: 0, isRequired: true, status: "completed", completedAt: new Date() },
                  { stepType: "zoom_attendance", stepName: "Zoom Orientation Attendance", sortOrder: 1, isRequired: true },
                  // Individual jotform steps are created below per form in the batch
                  { stepType: "email_form", stepName: "Contractor Info Form", sortOrder: 3, isRequired: true },
                  {
                    stepType: "payment_setup", stepName: "Payment Setup (KYC)", sortOrder: 4, isRequired: true,
                    // RL internal contractors skip payment setup at creation
                    status: session.orgId === RL_ORG_ID ? "skipped" as const : "pending" as const,
                    ...(session.orgId === RL_ORG_ID ? { completedAt: new Date() } : {}),
                  },
                ],
              },
            },
          });
        } else {
          await tx.onboardingSession.update({
            where: { id: ob.id },
            data: {
              batchSessionId,
              zoomMeetingLink: batch.zoomJoinUrl,
              zoomMeetingId: batch.zoomMeetingId,
              zoomMeetingDate: batch.zoomMeetingDate,
            },
          });
          // Remove old pending jotform steps — fresh ones are created below per batch form
          await tx.onboardingStep.deleteMany({
            where: { sessionId: ob.id, stepType: "jotform", status: { in: ["pending", "sent"] } },
          });
        }

        const emp = await tx.employee.update({
          where: { id: employeeId },
          data: {
            employmentStatus: "onboarding_scheduled",
            onboardingStatus: "in_progress",
          },
        });

        return { onboarding: ob, employee: emp };
      });

      // Build JotForm prefill URLs for this employee
      const employeeFormLinks: { name: string; url: string }[] = [];
      if (batchForms.length > 0) {
        try {
          const { JotFormService } = await import("@repo/integrations/jotform");
          for (const fm of batchForms) {
            const smartUrl = await JotFormService.buildSmartPrefillUrl(fm.id, {
              legalFirstName: employee.legalFirstName,
              legalLastName: employee.legalLastName,
              personalEmail: employee.personalEmail,
              workEmail: employee.workEmail,
              phoneNumber: employee.phoneNumber,
              streetAddress: employee.streetAddress,
              city: employee.city,
              stateProvince: employee.stateProvince,
              postalCode: employee.postalCode,
              country: employee.country,
              hourlyRate: employee.hourlyRate ? String(employee.hourlyRate) : null,
              monthlySalary: employee.monthlySalary ? String(employee.monthlySalary) : null,
              currency: employee.currency ?? "USD",
              startDate: employee.startDate,
              organizationName: batchOrgName,
              jobTitle: employee.jobTitle,
            });
            const params = new URL(smartUrl).searchParams;
            const finalUrl = mergePrefillParams(fm.baseUrl, params);
            employeeFormLinks.push({ name: fm.title, url: finalUrl });

            // Create a jotform step for each form
            await database.onboardingStep.create({
              data: {
                sessionId: onboarding.id,
                stepType: "jotform",
                stepName: fm.title,
                sortOrder: 3,
                isRequired: true,
                formUrl: finalUrl,
              },
            });
          }
        } catch (e) {
          console.error("[HRIQ-0701] Onboarding — failed to build form URLs for batch add:", e);
        }
      }
      // If batch had no existing forms, create a placeholder jotform step
      if (employeeFormLinks.length === 0) {
        await database.onboardingStep.create({
          data: {
            sessionId: onboarding.id,
            stepType: "jotform",
            stepName: "Onboarding Forms",
            sortOrder: 2,
            isRequired: true,
          },
        });
      }

      // If we created individual per-form steps, remove the generic "Onboarding Forms" placeholder
      if (employeeFormLinks.length > 0) {
        await database.onboardingStep.deleteMany({
          where: {
            sessionId: onboarding.id,
            stepType: "jotform",
            stepName: "Onboarding Forms",
            formUrl: null,
          },
        });

        // Save form links on the session for later resends
        await database.onboardingSession.update({
          where: { id: onboarding.id },
          data: {
            jotformsSent: true,
            jotformsSentAt: new Date(),
            jotformsSentData: JSON.stringify(employeeFormLinks),
            jotformLinks: JSON.stringify(employeeFormLinks),
          },
        });
      }

      // Send onboarding email with Zoom link + form links
      const recipientEmail = getContractorEmail(employee);
      if (recipientEmail) {
        try {
          const { sendOnboardingEmail } = await import("./send-email");
          await sendOnboardingEmail(
            recipientEmail,
            employee.legalFirstName,
            {
              employeeId: employee.id,
              zoomLink: batch.zoomJoinUrl ?? undefined,
              zoomDate: batch.zoomMeetingDate ? batch.zoomMeetingDate.toISOString() : undefined,
              zoomDuration: batch.zoomDuration ?? 60,
              formLinks: employeeFormLinks.length > 0 ? employeeFormLinks : undefined,
              onboardingData: {
                payRate: employee.hourlyRate ? String(employee.hourlyRate) : undefined,
                currency: employee.currency ?? "USD",
                startDate: employee.startDate ? new Date(employee.startDate as any).toISOString() : undefined,
              },
            }
          );

          // Mark zoom invite step as completed since we just sent it
          await database.onboardingSession.update({
            where: { id: onboarding.id },
            data: { zoomInviteSent: true, zoomInviteSentAt: new Date() },
          });
        } catch (e) {
          console.error(`[HRIQ-1703] Onboarding — failed to send email to ${recipientEmail}:`, e);
        }
      }

      // Collect attendee for batch calendar event (created after loop)
      if (batch.zoomMeetingDate && recipientEmail) {
        batchCalAttendees.push(recipientEmail);
        batchCalOnboardingIds.push(onboarding.id);
      }

      // Audit log
      try {
        await database.auditLog.create({
          data: {
            organizationId: employee.organizationId ?? undefined,
            actorType: "user",
            actorUserId: session.userId,
            action: "onboarding.added_to_batch",
            objectType: "employee",
            objectId: employeeId,
            newValue: {
              batchSessionId,
              zoomScheduled: !!batch.zoomJoinUrl,
              formsSent: employeeFormLinks.length,
            },
          },
        });
      } catch (auditErr) {
        console.error("[HRIQ] Audit log write failed (non-blocking):", auditErr);
      }

      await recomputeSessionProgress(onboarding.id);
      results.push(onboarding);
    }

    //  Single Google Calendar event for ALL new attendees 
    if (batch.zoomMeetingDate && batchCalAttendees.length > 0) {
      try {
        const { GoogleCalendarService, isGoogleCalendarConfigured } = await import("@repo/integrations/google-calendar");
        if (isGoogleCalendarConfigured()) {
          // Use the stored calendar organizer (Zoom host) — no fallback
          const organizerEmail = batch.calendarOrganizerEmail || undefined;
          if (!organizerEmail) {
            console.warn("[Onboarding] No calendar organizer email on batch — skipping calendar event");
          } else {
          // Use UTC ISO strings — Google Calendar respects the timeZone field for display
          const calStart = batch.zoomMeetingDate.toISOString();
          const calEnd = new Date(batch.zoomMeetingDate.getTime() + (batch.zoomDuration ?? 60) * 60 * 1000).toISOString();

          // Check if the batch already has a calendar event (from prior adds)
          const siblingSession = await database.onboardingSession.findFirst({
            where: { batchSessionId, googleCalendarEventId: { not: null } },
            select: { googleCalendarEventId: true },
          });
          const existingCalEventId = siblingSession?.googleCalendarEventId ?? null;

          let eventId: string | null = null;

          if (existingCalEventId) {
            // Add new attendees to the existing calendar event and normalize the title
            const added = await GoogleCalendarService.addAttendees({
              eventId: existingCalEventId,
              newEmails: batchCalAttendees,
              organizerEmail,
              title: "Remote Leverage Onboarding",
            });
            if (added) eventId = existingCalEventId;
          } else {
            // Create one new event with ALL attendees
            const calAttendees = [...batchCalAttendees];
            if (organizerEmail && !calAttendees.includes(organizerEmail)) {
              calAttendees.push(organizerEmail);
            }
            const result = await withTimeout(GoogleCalendarService.createEvent({
              title: "Remote Leverage Onboarding",
              description: `Onboarding orientation session${batch.zoomJoinUrl ? `\n\nJoin Zoom: ${batch.zoomJoinUrl}` : ""}`,
              startTime: calStart,
              endTime: calEnd,
              attendeeEmails: calAttendees,
              organizerEmail,
              location: batch.zoomJoinUrl ?? undefined,
            }), 8000, "Google Calendar createEvent");
            if (result?.eventId) eventId = result.eventId;
          }

          // Save the calendar event ID on all new onboarding sessions
          if (eventId) {
            // Store the organizer email on the batch so future operations use the same one
            if (!batch.calendarOrganizerEmail && organizerEmail) {
              try {
                await database.batchSession.update({
                  where: { id: batchSessionId },
                  data: { calendarOrganizerEmail: organizerEmail },
                });
              } catch (err) { console.warn("[onboarding:addEmployeesToBatch] Suppressed error:", err); }
            }
            for (const obId of batchCalOnboardingIds) {
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
      } catch (e) {
        console.error("[HRIQ-9904] Onboarding — Google Calendar invite failed:", e);
      }
    }

    revalidatePath("/[orgSlug]/hiring", "page");

    return results;

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[onboarding.ts:addEmployeesToBatch]", _msg);
    return { error: _msg };
  }
}

export async function updateBatchSession(
  batchSessionId: string,
  data: { title?: string; description?: string; status?: string }
) {
  const session = await requireOrg();

  const batch = await database.batchSession.findFirst({
    where: { id: batchSessionId, organizationId: session.orgId },
    select: {
      id: true,
      status: true,
      zoomMeetingId: true,
      zoomJoinUrl: true,
      zoomMeetingDate: true,
      calendarOrganizerEmail: true,
      googleCalendarEventId: true,
      onboardingSessions: { select: { id: true, employeeId: true, googleCalendarEventId: true } },
    },
  });
  if (!batch) throw new HriqError("HRIQ-0504");

  // When cancelling, clean up Zoom meeting and Google Calendar events
  if (data.status === "cancelled" && batch.status !== "cancelled") {
    // Delete Zoom meeting
    if (batch.zoomMeetingId) {
      try {
        const { ZoomService, isZoomConfigured } = await import("@repo/integrations/zoom");
        if (isZoomConfigured()) {
          await withTimeout(ZoomService.deleteMeeting(batch.zoomMeetingId), 8000, "Zoom deleteMeeting");
        }
      } catch (e) {
        console.error("[HRIQ-9901] Onboarding — failed to delete Zoom meeting on cancel:", e);
      }
    }

    // Delete Google Calendar events (deduplicate shared event IDs)
    try {
      const { GoogleCalendarService, isGoogleCalendarConfigured } = await import("@repo/integrations/google-calendar");
      if (isGoogleCalendarConfigured()) {
        const uniqueEventIds = new Set(
          batch.onboardingSessions
            .map((s: any) => s.googleCalendarEventId)
            .filter(Boolean)
        );
        // Also check the batch session's own calendar event ID (fallback for orphaned events)
        if (batch.googleCalendarEventId) {
          uniqueEventIds.add(batch.googleCalendarEventId);
        }
        const calOrgEmail = batch.calendarOrganizerEmail || undefined;
        for (const eventId of uniqueEventIds) {
          try {
            await withTimeout(GoogleCalendarService.deleteEvent(eventId as string, calOrgEmail), 8000, "Google Calendar deleteEvent");
          } catch {
            console.warn(`[Onboarding] Failed to cancel calendar event ${eventId}`);
          }
        }
      }
    } catch (e) {
      console.error("[HRIQ-9904] Onboarding — calendar cleanup on cancel failed:", e);
    }

    // Clear Zoom + calendar data from onboarding sessions
    const onboardingSessionIds = batch.onboardingSessions.map((s: any) => s.id);
    if (onboardingSessionIds.length > 0) {
      await database.onboardingSession.updateMany({
        where: { batchSessionId },
        data: {
          zoomMeetingId: null,
          zoomMeetingLink: null,
          zoomMeetingDate: null,
          zoomInviteSent: false,
          zoomInviteSentAt: null,
          googleCalendarEventId: null,
        },
      });
      await database.onboardingStep.updateMany({
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

    // Send cancellation emails to all affected employees
    try {
      const { sendZoomCancellationEmail } = await import("./send-email");
      const employees = await database.employee.findMany({
        where: { id: { in: batch.onboardingSessions.map((s: any) => s.employeeId) } },
        select: { personalEmail: true, workEmail: true, legalFirstName: true, preferredName: true },
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
      console.error("[HRIQ-1703] Onboarding — batch cancellation emails failed (non-blocking):", err);
    }
  }

  const updated = await database.batchSession.update({
    where: { id: batchSessionId },
    data: {
      ...data,
      // Clear Zoom fields when cancelling
      ...(data.status === "cancelled" ? {
        zoomMeetingId: null,
        zoomJoinUrl: null,
        zoomStartUrl: null,
        zoomMeetingDate: null,
      } : {}),
    },
  });

  revalidatePath("/[orgSlug]/hiring", "page");

  return updated;
}

//  JotForm 

export async function getJotFormForms() {
  await requireRole("super_admin");
  const { getConfiguredJotFormLinks } = await import("@repo/integrations/jotform");
  const configuredLinks = getConfiguredJotFormLinks();
  const configuredForms = configuredLinks.map((link) => ({
    ...link,
    url: isPublicSignFillUrl(link.url) ? buildPublicJotFormUrl(link.url, link.id) : link.url,
    embeddable: false,
  }));

  const apiKey = readEnv("JOTFORM_API_KEY");
  if (!apiKey) return configuredForms;

  try {
    const userRes = await fetch(`https://api.jotform.com/user?apiKey=${encodeURIComponent(apiKey)}`, {
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!userRes.ok) return configuredForms;
    const userData = await userRes.json();
    const jotformEmail = String(userData?.content?.email ?? userData?.content?.name ?? "").toLowerCase();
    if (jotformEmail !== REQUIRED_JOTFORM_EMAIL) return configuredForms;

    const filter = encodeURIComponent(JSON.stringify({ "status:ne": "DELETED" }));
    const res = await fetch(`https://api.jotform.com/user/forms?apiKey=${encodeURIComponent(apiKey)}&limit=50&orderby=created_at&filter=${filter}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!res.ok) return configuredForms;
    const data = await res.json();
    const apiForms = (data.content ?? [])
      .filter((f: Record<string, string>) => {
        const status = String(f.status ?? "").toUpperCase();
        // Exclude deleted/trashed forms
        if (status === "DELETED" || status === "TRASHED" || status === "PURGED") return false;
        // Only show forms with "hriq" in the title
        return (f.title ?? "").toLowerCase().includes("hriq");
      })
      .map((f: Record<string, string>) => ({
      id: f.id,
      title: f.title,
      url: buildPublicJotFormUrl(f.url ?? "", f.id),
      embeddable: true,
      disabled: String(f.status ?? "").toUpperCase() !== "ENABLED",
      }));

    const configuredIds = new Set(configuredForms.map((form) => form.id));
    return [...configuredForms, ...apiForms.filter((form: { id: string }) => !configuredIds.has(form.id))];
  } catch {
    return configuredForms;
  }
}

export async function getJotFormStatus() {
  await requireRole("super_admin");
  const { getConfiguredJotFormLinks } = await import("@repo/integrations/jotform");
  const configuredLinks = getConfiguredJotFormLinks();
  if (configuredLinks.length > 0) {
    return {
      configured: true,
      connected: true,
      message: `Using ${configuredLinks.length} configured JotForm Sign template links.`,
    };
  }

  const apiKey = readEnv("JOTFORM_API_KEY");
  if (!apiKey) {
    return { configured: false, connected: false, message: "JotForm API key is missing." };
  }

  try {
    const res = await fetch(`https://api.jotform.com/user?apiKey=${encodeURIComponent(apiKey)}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      const error = await res.text();
      return {
        configured: true,
        connected: false,
        message: `JotForm connection failed (${res.status}). ${error.slice(0, 120)}`,
      };
    }
    const data = await res.json();
    const email = String(data?.content?.email ?? data?.content?.name ?? "").toLowerCase();
    if (email !== REQUIRED_JOTFORM_EMAIL) {
      return {
        configured: true,
        connected: false,
        message: `Connected to ${email || "unknown"}, but expected ${REQUIRED_JOTFORM_EMAIL}.`,
      };
    }
    return {
      configured: true,
      connected: true,
      message: `Connected as ${data.content?.username ?? "unknown user"}.`,
    };
  } catch (error) {
    return {
      configured: true,
      connected: false,
      message: error instanceof Error ? error.message : "Unknown JotForm error",
    };
  }
}

export async function sendOnboardingForms(data: {
  employeeId: string;
  formIds: string[];
  senderEmail?: string;
}) {
  const session = await requireOrg();

  let employee = await database.employee.findFirst({
    where: { id: data.employeeId, organizationId: session.orgId },
  });
  if (!employee) {
    try {
      await requireRole("super_admin");
      employee = await database.employee.findUnique({ where: { id: data.employeeId } });
    } catch {
      // Non-super admins should remain scoped to their own organization.
    }
  }
  if (!employee) throw new HriqError("HRIQ-1902");

  // Look up organization name for form prefill
  const employeeOrg = employee.organizationId
    ? await database.organization.findUnique({ where: { id: employee.organizationId }, select: { name: true } })
    : null;
  const employeeWithOrg = { ...employee, organizationName: employeeOrg?.name ?? "Remote Leverage", hourlyRate: employee.hourlyRate ? String(employee.hourlyRate) : null, monthlySalary: employee.monthlySalary ? String(employee.monthlySalary) : null, jobTitle: employee.jobTitle ?? null };

  const recipientEmail = getContractorEmail(employee);
  if (!recipientEmail) throw new HriqError("HRIQ-0207");

  const { getConfiguredJotFormLinks, JotFormService } = await import("@repo/integrations/jotform");
  const configuredLinks = getConfiguredJotFormLinks();
  const configuredMap = new Map<string, import("@repo/integrations/jotform").JotFormTemplateLink>(configuredLinks.map((f) => [f.id, f]));
  const apiKey = readEnv("JOTFORM_API_KEY");
  const needsApiForms = data.formIds.some((formId) => !configuredMap.has(formId));
  if (needsApiForms) {
    if (!apiKey) throw new HriqError("HRIQ-0701");
    const userRes = await fetch(`https://api.jotform.com/user?apiKey=${encodeURIComponent(apiKey)}`, { signal: AbortSignal.timeout(8000) });
    if (!userRes.ok) throw new HriqError("HRIQ-0703");
    const userData = await userRes.json();
    const jotformEmail = String(userData?.content?.email ?? userData?.content?.name ?? "").toLowerCase();
    if (jotformEmail !== REQUIRED_JOTFORM_EMAIL) {
      throw new HriqError("HRIQ-0702", `JotForm account mismatch. Expected ${REQUIRED_JOTFORM_EMAIL}, got ${jotformEmail || "unknown account"}`);
    }
  }

  const formLinks: { name: string; url: string }[] = [];

  for (const formId of data.formIds) {
    const configured = configuredMap.get(formId);
    if (configured) {
      if (!isPublicSignFillUrl(configured.url)) {
        // Sign-only document — use original URL without prefill
        formLinks.push({ name: configured.title, url: configured.url });
        continue;
      }
      const smartPrefillUrl = await JotFormService.buildSmartPrefillUrl(configured.id, employeeWithOrg);
      const smartParams = new URL(smartPrefillUrl).searchParams;
      const signUrl = buildPublicJotFormUrl(configured.url, configured.id);
      formLinks.push({
        name: configured.title,
        // Tokenized Sign URLs still need contractor params appended.
        url: mergePrefillParams(signUrl, smartParams),
      });
      continue;
    }

    if (!apiKey) throw new HriqError("HRIQ-0701");
    try {
      const res = await fetch(`https://api.jotform.com/form/${formId}?apiKey=${encodeURIComponent(apiKey)}`, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const formData = await res.json();
      const form = formData.content;
      const formStatus = String(form?.status ?? "").toUpperCase();
      if (formStatus === "DELETED" || formStatus === "TRASHED" || formStatus === "PURGED") continue;

      const formUrl = await JotFormService.buildSmartPrefillUrl(formId, employeeWithOrg);
      formLinks.push({ name: form.title ?? `Form ${formId}`, url: formUrl });
    } catch (e) {
      console.error(`[HRIQ-0701] JotForm — failed to fetch form ${formId}:`, e);
    }
  }

  if (formLinks.length === 0) throw new HriqError("HRIQ-0703", "No valid forms found");

  const { sendOnboardingEmail } = await import("./send-email");
  try {
    await sendOnboardingEmail(
      recipientEmail,
      employee.legalFirstName,
      { employeeId: data.employeeId, formLinks },
      data.senderEmail
    );
  } catch (emailErr) {
    console.error("[HRIQ] Email send failed (non-blocking):", emailErr);
  }

  const onboardingSession = await database.onboardingSession.findFirst({
    where: { employeeId: data.employeeId },
    orderBy: { createdAt: "desc" },
  });

  if (onboardingSession) {
    await database.onboardingSession.update({
      where: { id: onboardingSession.id },
      data: {
        jotformsSent: true,
        jotformsSentAt: new Date(),
        jotformsSentData: JSON.stringify(formLinks),
        jotformLinks: JSON.stringify(formLinks),
      },
    });

    const jotformSteps = await database.onboardingStep.findMany({
      where: { sessionId: onboardingSession.id, stepType: "jotform", status: "pending" },
    });
    const fallbackUrl = formLinks[0]?.url ?? null;
    for (const step of jotformSteps) {
      const matchingForm = formLinks.find((f) => step.stepName.toLowerCase().includes(f.name.toLowerCase().split(" ")[0] ?? ""));
      if (matchingForm) {
        await database.onboardingStep.update({
          where: { id: step.id },
          data: { formUrl: matchingForm.url, status: "sent" },
        });
      } else if (jotformSteps.length === formLinks.length) {
        const idx = jotformSteps.indexOf(step);
        if (formLinks[idx]) {
          await database.onboardingStep.update({
            where: { id: step.id },
            data: { formUrl: formLinks[idx].url, status: "sent" },
          });
        }
      } else if (fallbackUrl) {
        // For unified "Onboarding Forms" step, mark sent with first generated link.
        await database.onboardingStep.update({
          where: { id: step.id },
          data: { formUrl: fallbackUrl, status: "sent" },
        });
      }
    }
  }

  try {
    await database.auditLog.create({
      data: {
        organizationId: session.orgId,
        actorType: "user",
        actorUserId: session.userId,
        action: "onboarding.forms_sent",
        objectType: "employee",
        objectId: data.employeeId,
        newValue: { formCount: formLinks.length },
      },
    });
  } catch (auditErr) {
    console.error("[HRIQ] Audit log write failed (non-blocking):", auditErr);
  }

  revalidatePath("/[orgSlug]/hiring", "page");

  return { sent: formLinks.length, forms: formLinks };
}

export async function sendZoomInvite(data: {
  employeeId: string;
  zoomLink: string;
  zoomDate: string;
  senderEmail?: string;
}) {
  const session = await requireOrg();

  let employee = await database.employee.findFirst({
    where: { id: data.employeeId, organizationId: session.orgId },
  });
  if (!employee) {
    try {
      await requireRole("super_admin");
      employee = await database.employee.findUnique({ where: { id: data.employeeId } });
    } catch {
      // Non-super admins should remain scoped to their own organization.
    }
  }
  if (!employee) throw new HriqError("HRIQ-1902");

  const recipientEmail = getContractorEmail(employee);
  if (!recipientEmail) throw new HriqError("HRIQ-0207");

  // Load existing form links and onboarding data from session
  const onboardingSession = await database.onboardingSession.findFirst({
    where: { employeeId: data.employeeId },
    orderBy: { createdAt: "desc" },
    include: {
      steps: { where: { stepType: "jotform", formUrl: { not: null } } },
      batchSession: { select: { zoomDuration: true, calendarOrganizerEmail: true } },
    },
  });

  const formLinks: { name: string; url: string }[] = [];
  if (onboardingSession?.jotformLinks) {
    try {
      const parsed = JSON.parse(onboardingSession.jotformLinks) as Array<{ name?: string; url?: string }>;
      for (const f of parsed) {
        if (f?.name && f?.url) formLinks.push({ name: f.name, url: f.url });
      }
    } catch (err) { console.warn("[onboarding:sendZoomInvite] use step fallback:", err); }
  }
  if (formLinks.length === 0 && onboardingSession?.steps) {
    for (const step of onboardingSession.steps) {
      if (step.formUrl) formLinks.push({ name: step.stepName, url: step.formUrl });
    }
  }

  const { sendOnboardingEmail } = await import("./send-email");
  try {
    await sendOnboardingEmail(
      recipientEmail,
      employee.legalFirstName,
      {
        employeeId: data.employeeId,
        zoomLink: data.zoomLink,
        zoomDate: data.zoomDate,
        formLinks: formLinks.length > 0 ? formLinks : undefined,
        onboardingData: {
          payRate: employee.hourlyRate ? String(employee.hourlyRate) : undefined,
          currency: employee.currency ?? "USD",
          startDate: employee.startDate ? new Date(employee.startDate as any).toISOString() : undefined,
        },
      },
      data.senderEmail
    );
  } catch (emailErr) {
    console.error("[HRIQ] Email send failed (non-blocking):", emailErr);
  }

  if (onboardingSession) {
    const parsedZoomDate = smartParseDatetime(data.zoomDate);
    const zoomMeetingDate = Number.isNaN(parsedZoomDate.getTime()) ? undefined : parsedZoomDate;
    await database.onboardingSession.update({
      where: { id: onboardingSession.id },
      data: {
        zoomInviteSent: true,
        zoomInviteSentAt: new Date(),
        zoomMeetingLink: data.zoomLink,
        ...(zoomMeetingDate ? { zoomMeetingDate } : {}),
      },
    });

    await database.onboardingStep.updateMany({
      where: { sessionId: onboardingSession.id, stepType: "zoom_invite", status: "pending" },
      data: { status: "completed", completedAt: new Date() },
    });

    if (zoomMeetingDate) {
      try {
        const { GoogleCalendarService, isGoogleCalendarConfigured } = await import("@repo/integrations/google-calendar");
        if (isGoogleCalendarConfigured()) {
          // Use the stored calendar organizer (Zoom host) — no fallback
          const organizerEmail = onboardingSession?.batchSession?.calendarOrganizerEmail || undefined;
          if (!organizerEmail) {
            console.warn("[Onboarding] No calendar organizer email — skipping calendar event creation");
          } else {
          const durationMin = onboardingSession?.batchSession?.zoomDuration ?? 60;
          // Use UTC ISO strings — Google Calendar respects the timeZone field for display
          const calStart = zoomMeetingDate.toISOString();
          const calEnd = new Date(zoomMeetingDate.getTime() + durationMin * 60 * 1000).toISOString();

          // Check if the batch already has a calendar event to add attendees to
          let existingCalEventId: string | null = null;
          if (onboardingSession.batchSessionId) {
            const siblingSession = await database.onboardingSession.findFirst({
              where: {
                batchSessionId: onboardingSession.batchSessionId,
                googleCalendarEventId: { not: null },
                id: { not: onboardingSession.id },
              },
              select: { googleCalendarEventId: true },
            });
            existingCalEventId = siblingSession?.googleCalendarEventId ?? null;
          }

          let eventId: string | null = null;

          if (existingCalEventId) {
            // Add this contractor to the existing calendar event and normalize the title
            const added = await GoogleCalendarService.addAttendees({
              eventId: existingCalEventId,
              newEmails: [recipientEmail],
              organizerEmail,
              title: "Remote Leverage Onboarding",
            });
            if (added) eventId = existingCalEventId;
          } else {
            // Create a new calendar event
            const calAttendees2 = [recipientEmail];
            if (organizerEmail && !calAttendees2.includes(organizerEmail)) {
              calAttendees2.push(organizerEmail);
            }
            const result = await withTimeout(GoogleCalendarService.createEvent({
              title: "Remote Leverage Onboarding",
              description: `Onboarding orientation\n\nJoin Zoom: ${data.zoomLink}`,
              startTime: calStart,
              endTime: calEnd,
              attendeeEmails: calAttendees2,
              organizerEmail,
              location: data.zoomLink,
            }), 8000, "Google Calendar createEvent");
            if (result?.eventId) eventId = result.eventId;
          }

          if (eventId) {
            try {
              await database.onboardingSession.update({
                where: { id: onboardingSession.id },
                data: { googleCalendarEventId: eventId },
              });
            } catch {
              console.warn("[Onboarding] googleCalendarEventId column may not exist yet; skipping save.");
            }
          }
          } // end organizerEmail guard
        }
      } catch (e) {
        console.error("[HRIQ-9904] Onboarding — Google Calendar invite failed:", e);
      }
    }
  }

  revalidatePath("/[orgSlug]/hiring", "page");

  return { sent: true };
}

//  Notes 

export async function createManagerNote(data: {
  employeeId: string;
  noteType: string;
  content: string;
  isPrivate?: boolean;
}) {
  const session = await requireOrg();

  const employee = await database.employee.findFirst({
    where: { id: data.employeeId, organizationId: session.orgId },
    select: { id: true },
  });
  if (!employee) throw new HriqError("HRIQ-0201");

  const note = await database.managerNote.create({
    data: {
      employeeId: data.employeeId,
      noteType: data.noteType,
      content: data.content,
      isPrivate: data.isPrivate ?? false,
      authorUserId: session.userId,
      authorName: session.name ?? undefined,
    },
  });

  revalidatePath(`/[orgSlug]/employees/${data.employeeId}`, "page");

  return note;
}

//  Activate Contractor 

/**
 * Explicitly activate a contractor after reviewing their completed onboarding.
 * This is the ONLY way to move an employee from onboarding to active status.
 * Requires all onboarding steps to be completed first.
 */
export async function activateContractor(employeeId: string) {
  try {
  const authSession = await requireRole("super_admin", "admin");

  // Scope by org for non-super_admin
  const isSuperAdmin = authSession.orgRole === "super_admin";
  const employee = await database.employee.findFirst({
    where: isSuperAdmin ? { id: employeeId } : { id: employeeId, organizationId: authSession.orgId! },
    select: {
      id: true,
      organizationId: true,
      legalFirstName: true,
      legalLastName: true,
      personalEmail: true,
      workEmail: true,
      employmentStatus: true,
      linkedUserId: true,
    },
  });
  if (!employee) throw new HriqError("HRIQ-0201");
  if (employee.employmentStatus === "active") {
    return { alreadyActive: true };
  }

  // Verify all onboarding steps are completed
  const session = await database.onboardingSession.findFirst({
    where: { employeeId, status: { not: "cancelled" } },
    orderBy: { createdAt: "desc" },
    include: {
      steps: { where: { isRequired: true }, select: { status: true, stepType: true } },
    },
  });

  if (!session) throw new HriqError("HRIQ-0504", "No onboarding session found");
  // payment_setup and zoom_invite steps are never blocking:
  // - payment_setup completes on contractor first login
  // - zoom_invite is an admin scheduling step (not a contractor completion gate)
  const nonBlockingStepTypes = ["payment_setup", "zoom_invite"];
  const incomplete = session.steps.filter((s: any) =>
    s.status !== "completed" && s.status !== "skipped" && !nonBlockingStepTypes.includes(s.stepType)
  );
  if (incomplete.length > 0) {
    throw new HriqError("HRIQ-0505", `Cannot activate: ${incomplete.length} step(s) still incomplete (skipped steps are OK)`);
  }

  // Auto-skip any leftover non-blocking steps (zoom_invite, payment_setup)
  // so the session has a clean all-completed/skipped state after activation
  await database.onboardingStep.updateMany({
    where: {
      sessionId: session.id,
      stepType: { in: nonBlockingStepTypes },
      status: "pending",
    },
    data: { status: "skipped", notes: "Auto-skipped on contractor activation" },
  });

  // 1) Move employee to active
  await database.employee.update({
    where: { id: employeeId },
    data: {
      employmentStatus: "active",
      onboardingStatus: "completed",
      // Clear any stale info approval status — activation implies approval
      infoApprovalStatus: "approved",
    },
  });

  // 2) Ensure session is marked completed
  await database.onboardingSession.update({
    where: { id: session.id },
    data: { status: "completed", completedAt: new Date(), overallProgress: 100 },
  });

  // 3) Provision dashboard account if not already done
  let provisioned = false;
  if (!employee.linkedUserId) {
    try {
      const { provisionContractorDashboardSystem, sendDashboardInviteEmailSystem } = await import("@/app/actions/hriq/contractor-dashboard");
      await provisionContractorDashboardSystem(employeeId);
      try {
        await sendDashboardInviteEmailSystem(employeeId);
      } catch (emailErr) {
        console.error("[Onboarding] Credential email failed (contractor still activated):", emailErr);
      }
      provisioned = true;
    } catch (err) {
      console.error("[Onboarding] Dashboard provisioning during activation failed:", err);
    }
  }

  // 4) Audit log
  try {
    await database.auditLog.create({
      data: {
        organizationId: employee.organizationId ?? undefined,
        actorType: "user",
        actorUserId: authSession.userId,
        action: "hiring.contractor_activated",
        objectType: "employee",
        objectId: employeeId,
        oldValue: { employmentStatus: employee.employmentStatus },
        newValue: { employmentStatus: "active", provisioned },
      },
    });
  } catch (auditErr) {
    console.error("[HRIQ] Audit log write failed (non-blocking):", auditErr);
  }

  revalidatePath("/[orgSlug]/hiring", "page");
  revalidatePath("/[orgSlug]/employees", "page");
  revalidatePath(`/[orgSlug]/employees/${employeeId}`, "page");

  return { activated: true, provisioned };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to activate contractor";
    console.error("[activateContractor] Error:", message);
    return { error: message };
  }
}
/**
 * Resend the onboarding welcome email with the latest form links from the DB.
 */
export async function resendOnboardingEmail(employeeId: string) {
  try {
    const session = await requireRole("super_admin", "admin");

    // Scope by org for non-super_admin to prevent cross-tenant access
    const isSuperAdmin = session.orgRole === "super_admin";
    const employee = await database.employee.findFirst({
      where: isSuperAdmin ? { id: employeeId } : { id: employeeId, organizationId: session.orgId! },
      select: {
        legalFirstName: true,
        legalLastName: true,
        personalEmail: true,
        workEmail: true,
        hourlyRate: true,
        currency: true,
        startDate: true,
        timeDoctorEmail: true,
      },
    });
    if (!employee) return { ok: false as const, error: "Employee not found" };

    const email = getContractorEmail(employee);
    if (!email) return { ok: false as const, error: "No email on file" };

    const onboardingSession = await database.onboardingSession.findFirst({
      where: { employeeId, status: { not: "cancelled" } },
      orderBy: { createdAt: "desc" },
      include: {
        steps: {
          where: { stepType: "jotform" },
          orderBy: { sortOrder: "asc" },
        },
        batchSession: true,
      },
    });

    const formLinks = (onboardingSession?.steps ?? [])
      .filter((s: any) => s.formUrl)
      .map((s: any) => ({ name: s.stepName, url: s.formUrl as string }));

    const { sendOnboardingEmail } = await import("./send-email");
    const tdEmail = employee.timeDoctorEmail ?? employee.workEmail ?? employee.personalEmail;
    const slackEmail = employee.workEmail ?? employee.personalEmail;

    // Generate a fresh single-use Slack invite token
    let slackInviteLink: string | undefined;
    if (process.env.SLACK_INVITE_LINK) {
      const token = crypto.randomUUID();
      await database.employee.update({
        where: { id: employeeId },
        data: { slackInviteToken: token },
      });
      const { APP_URL, normalizeAppUrl } = await import("./constants");
      const appUrl = normalizeAppUrl(APP_URL);
      slackInviteLink = `${appUrl}/api/slack-invite?token=${token}`;
    }

    try {
      await sendOnboardingEmail(email, employee.legalFirstName, {
        employeeId,
        zoomLink: onboardingSession?.batchSession?.zoomJoinUrl ?? undefined,
        zoomDate: onboardingSession?.batchSession?.zoomMeetingDate?.toISOString(),
        zoomDuration: onboardingSession?.batchSession?.zoomDuration ?? 60,
        formLinks: formLinks.length > 0 ? formLinks : undefined,
        onboardingData: {
          payRate: employee.hourlyRate ? String(employee.hourlyRate) : undefined,
          currency: employee.currency ?? "USD",
          startDate: employee.startDate ? employee.startDate.toISOString().slice(0, 10) : undefined,
        },
        timeDoctorEmail: tdEmail ?? undefined,
        slackEmail: slackEmail ?? undefined,
        slackInviteLink,
      });
    } catch (emailErr) {
      console.error("[HRIQ] Email send failed (non-blocking):", emailErr);
    }

    return { ok: true as const, message: `Onboarding email resent to ${email}` };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[onboarding.ts:resendOnboardingEmail]", _msg);
    return { error: _msg };
  }
}

// ─── Manual JotForm Sync ────────────────────────────────────────────────────
/**
 * Poll JotForm API to check if pending jotform steps have been completed.
 * This is needed because JotForm Sign documents don't fire standard webhooks.
 * Call this from the hiring pipeline to detect signed forms that weren't caught by webhook.
 */
export async function syncJotFormSignatureStatus() {
  try {
    const session = await requireRole("super_admin", "admin", "manager");

    const { JotFormService, isJotFormConfigured } = await import("@repo/integrations");
    if (!isJotFormConfigured()) {
      return { ok: false as const, message: "JotForm not configured" };
    }

    // Find all pending jotform steps in active onboarding sessions
    const pendingSteps = await database.onboardingStep.findMany({
      where: {
        stepType: "jotform",
        status: { in: ["sent", "pending"] },
        session: { status: { notIn: ["cancelled", "completed"] } },
      },
      include: {
        session: {
          include: {
            employee: {
              select: {
                id: true,
                personalEmail: true,
                workEmail: true,
                legalFirstName: true,
                legalLastName: true,
              },
            },
          },
        },
      },
    });

    if (pendingSteps.length === 0) {
      return { ok: true as const, message: "No pending JotForm steps found", synced: 0 };
    }

    // Extract unique form IDs from formUrls
    const extractFormId = (url: string): string | null => {
      // Regular form: form.jotform.com/260505881990060
      const regularMatch = url.match(/form\.jotform\.com\/(\d+)/i);
      if (regularMatch) return regularMatch[1]!;
      // Sign document: jotform.com/sign/260528345360051/invite/...
      const signMatch = url.match(/jotform\.com\/sign\/(\d+)/i);
      if (signMatch) return signMatch[1]!;
      return null;
    };

    // Map of backing form IDs to sign doc IDs (from webhook route)
    const backingFormMap = new Map<string, string>();
    backingFormMap.set("260527710805050", "260528345360051"); // W8-Ben
    backingFormMap.set("260527519357059", "260528134585056"); // W9
    const envMap = process.env.JOTFORM_SIGN_FORM_MAP?.trim();
    if (envMap) {
      for (const pair of envMap.split(",")) {
        const [signId, backingId] = pair.split(":").map((s) => s.trim());
        if (signId && backingId) backingFormMap.set(backingId, signId);
      }
    }
    // Build reverse map: sign doc ID → backing form ID
    const signToBackingMap = new Map<string, string>();
    for (const [backing, sign] of backingFormMap.entries()) {
      signToBackingMap.set(sign, backing);
    }

    let syncedCount = 0;
    const processedSessionIds = new Set<string>();
    const errors: string[] = [];

    for (const step of pendingSteps) {
      if (!step.formUrl) continue;
      const emp = step.session.employee;
      const firstName = emp.legalFirstName ?? "";
      const lastName = emp.legalLastName ?? "";
      const email = getContractorEmail(emp) ?? "";

      const formId = extractFormId(step.formUrl);
      if (!formId) continue;

      // For Sign documents, we need to check the backing form's submissions
      const backingFormId = signToBackingMap.get(formId);
      const formIdToCheck = backingFormId ?? formId;

      try {
        // Try email match first, then name match
        let submission = null;
        if (email) {
          submission = await JotFormService.checkSubmissionByEmail(formIdToCheck, email);
        }
        if (!submission && firstName && lastName) {
          submission = await JotFormService.checkSubmissionByName(formIdToCheck, firstName, lastName);
        }

        if (submission) {
          const submissionId = String(submission.id ?? submission.submissionID ?? "");
          // Mark step as completed
          await database.onboardingStep.update({
            where: { id: step.id },
            data: {
              status: "completed",
              formSubmissionId: submissionId || null,
              completedAt: new Date(),
              notes: `Auto-synced via manual JotForm check (submission ${submissionId})`,
            },
          });
          syncedCount++;
          processedSessionIds.add(step.sessionId);
          console.info(`[JotForm Sync] Marked ${step.stepName} as completed for ${firstName} ${lastName} (submission ${submissionId})`);
        }
      } catch (err) {
        const msg = `Failed to check ${step.stepName} for ${firstName} ${lastName}: ${err instanceof Error ? err.message : String(err)}`;
        console.error(`[JotForm Sync] ${msg}`);
        errors.push(msg);
      }
    }

    // Update session progress for any sessions that had steps synced
    const { recomputeSessionProgress } = await import("@/lib/hriq/utils");
    for (const sessionId of processedSessionIds) {
      const allJotformSteps = await database.onboardingStep.findMany({
        where: { sessionId, stepType: "jotform" },
      });
      const allDone = allJotformSteps.length > 0 && allJotformSteps.every((s) => s.status === "completed");
      if (allDone) {
        await database.onboardingSession.update({
          where: { id: sessionId },
          data: { jotformsCompleted: true, jotformsCompletedAt: new Date() },
        });
      }
      await recomputeSessionProgress(sessionId);
    }

    revalidatePath("/[orgSlug]/hiring", "page");

    return {
      ok: true as const,
      message: syncedCount > 0
        ? `Synced ${syncedCount} form(s) across ${processedSessionIds.size} session(s)`
        : "No new completions found",
      synced: syncedCount,
      errors: errors.length > 0 ? errors : undefined,
    };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[onboarding.ts:syncJotFormSignatureStatus]", _msg);
    return { error: _msg };
  }
}
