"use server";

import { requireOrg, requireRole } from "@repo/auth/session";
import { database } from "@repo/database";
import { revalidatePath } from "next/cache";
import { pacificToUtc, pacificBareIso } from "@/lib/hriq/format";
import { getSupabaseAdmin, RL_ORG_ID, withTimeout } from "./constants";
import { HriqError } from "@/lib/hriq/errors";
import { dbLogError, dbLogInfo } from "@repo/observability/db-log";

/** Standard onboarding meeting description */
const ONBOARDING_DESCRIPTION = `Welcome to Remote Leverage!

We're excited to have you join the team!

Ahead of our onboarding session, please make sure you've completed the following to ensure a smooth start:
- Signed your work offer and other documents
- Installed the Time Doctor App
- Installed Slack (our main team communication tool)

Looking forward to meeting you and kicking things off!`;

/**
 * On-demand sync of Google Calendar RSVP statuses for pending sessions.
 * Called when the hiring page loads to get fresh status without waiting for cron.
 */
export async function syncCalendarRsvps() {
  try {
    const session = await requireOrg();

    const { GoogleCalendarService, isGoogleCalendarConfigured } = await import(
      "@repo/integrations/google-calendar"
    );
    if (!isGoogleCalendarConfigured()) return { synced: 0, reason: "not_configured" };

    const pending = await database.onboardingSession.findMany({
      where: {
        employee: { organizationId: session.orgId },
        googleCalendarEventId: { not: null },
        zoomRsvpStatus: "pending",
        zoomInviteSent: true,
      },
      select: {
        id: true,
        googleCalendarEventId: true,
        employee: { select: { personalEmail: true, workEmail: true } },
        batchSession: { select: { calendarOrganizerEmail: true } },
      },
      take: 25,
    });

    if (pending.length === 0) return { synced: 0 };

    let synced = 0;

    for (const s of pending) {
      try {
        const organizerEmail = s.batchSession?.calendarOrganizerEmail || undefined;
        if (!organizerEmail) continue; // No organizer — cannot access calendar
        const event = await GoogleCalendarService.getEvent(s.googleCalendarEventId!, organizerEmail);
        if (!event) {
          // Event was deleted from Google Calendar — clear the stale reference so we stop retrying
          await database.onboardingSession.update({
            where: { id: s.id },
            data: { googleCalendarEventId: null },
          });
          continue;
        }
        if (!event.attendees) continue;

        const emails = [s.employee.personalEmail?.toLowerCase(), s.employee.workEmail?.toLowerCase()].filter(Boolean);
        const attendee = event.attendees.find((a: { email: string }) => emails.includes(a.email.toLowerCase()));
        if (!attendee) continue;

        let newStatus: "accepted" | "declined" | null = null;
        if (attendee.responseStatus === "accepted") newStatus = "accepted";
        else if (attendee.responseStatus === "declined") newStatus = "declined";

        if (newStatus) {
          await database.onboardingSession.update({
            where: { id: s.id },
            data: {
              zoomRsvpStatus: newStatus,
              zoomInviteAccepted: newStatus === "accepted",
              zoomInviteAcceptedAt: newStatus === "accepted" ? new Date() : null,
            },
          });
          synced++;
        }
      } catch (err) {
        console.error(`[RSVP Sync] Error for session ${s.id}:`, err);
      }
    }

    if (synced > 0) revalidatePath("/[orgSlug]/hiring", "page");
    return { synced };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[hiring.ts:syncCalendarRsvps]", _msg);
    return { error: _msg };
  }
}

/**
 * Move an attendee from one calendar event/batch to another.
 * Removes from old event, adds to new event, updates DB batch assignment.
 */
export async function moveAttendeeToEvent(sessionId: string, targetBatchId: string) {
  try {
    "use server";
    const session = await requireRole("super_admin", "admin");

    const os = await database.onboardingSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        googleCalendarEventId: true,
        batchSessionId: true,
        batchSession: { select: { calendarOrganizerEmail: true, googleCalendarEventId: true } },
        employee: { select: { id: true, legalFirstName: true, legalLastName: true, personalEmail: true, workEmail: true } },
      },
    });
    if (!os) throw new Error("Session not found");
    if (os.batchSessionId === targetBatchId) throw new Error("Already in that event");

    const targetBatch = await database.batchSession.findUnique({
      where: { id: targetBatchId },
      select: {
        id: true, title: true, calendarOrganizerEmail: true, googleCalendarEventId: true,
        zoomMeetingId: true, zoomMeetingDate: true, zoomJoinUrl: true, zoomMeetingLink: true,
        zoomDuration: true,
        onboardingSessions: { select: { googleCalendarEventId: true }, take: 1 },
      },
    });
    if (!targetBatch) throw new Error("Target event not found");

    const attendeeEmail = os.employee.personalEmail ?? os.employee.workEmail;
    const oldOrganizer = os.batchSession?.calendarOrganizerEmail || undefined;
    const newOrganizer = targetBatch.calendarOrganizerEmail || undefined;

    // Find the target event ID — check batch first, then fall back to existing session
    const targetEventId = targetBatch.googleCalendarEventId
      ?? targetBatch.onboardingSessions[0]?.googleCalendarEventId
      ?? null;

    // Calendar operations
    let resolvedCalendarEventId: string | null = targetEventId;
    try {
      const { GoogleCalendarService, isGoogleCalendarConfigured } = await import("@repo/integrations/google-calendar");
      if (isGoogleCalendarConfigured() && attendeeEmail) {
        // Remove from old event
        if (os.googleCalendarEventId && oldOrganizer) {
          try {
            await GoogleCalendarService.removeAttendees({
              eventId: os.googleCalendarEventId,
              removeEmails: [attendeeEmail],
              organizerEmail: oldOrganizer,
            });
          } catch (removeErr) {
            console.warn("[moveAttendeeToEvent] Failed to remove from old calendar event:", removeErr);
          }
        }

        if (targetEventId && newOrganizer) {
          // Add to existing calendar event
          const targetSessions = await database.onboardingSession.findMany({
            where: { batchSessionId: targetBatchId, status: { notIn: ["cancelled", "completed"] } },
            select: { employee: { select: { legalFirstName: true, legalLastName: true } } },
          });
          const allNames = [...targetSessions.map((s: any) => s.employee), os.employee];
          const calTitle = "Remote Leverage Onboarding";
          await GoogleCalendarService.addAttendees({
            eventId: targetEventId,
            newEmails: [attendeeEmail],
            organizerEmail: newOrganizer,
            title: calTitle,
          });
        } else if (!targetEventId && newOrganizer && targetBatch.zoomMeetingDate) {
          // No calendar event on target batch — create one
          const duration = targetBatch.zoomDuration ?? 60;
          const calStart = targetBatch.zoomMeetingDate.toISOString();
          const calEnd = new Date(targetBatch.zoomMeetingDate.getTime() + duration * 60 * 1000).toISOString();
          const calTitle = "Remote Leverage Onboarding";
          const result = await GoogleCalendarService.createEvent({
            title: calTitle,
            description: `${ONBOARDING_DESCRIPTION}\n\nJoin Zoom: ${targetBatch.zoomJoinUrl || "TBD"}`,
            startTime: calStart,
            endTime: calEnd,
            attendeeEmails: [attendeeEmail],
            organizerEmail: newOrganizer,
            location: targetBatch.zoomJoinUrl ?? undefined,
          });
          if (result?.eventId) {
            resolvedCalendarEventId = result.eventId;
            // Store the event ID on the batch for future moves
            await database.batchSession.update({
              where: { id: targetBatchId },
              data: { googleCalendarEventId: result.eventId },
            });
          }
        }
      }
    } catch (err) {
      console.error("[moveAttendeeToEvent] Calendar error:", err);
      // Continue with DB update even if calendar fails
    }

    // Update DB — move session to new batch
    await database.onboardingSession.update({
      where: { id: sessionId },
      data: {
        batchSessionId: targetBatchId,
        googleCalendarEventId: resolvedCalendarEventId,
        zoomMeetingId: targetBatch.zoomMeetingId,
        zoomMeetingDate: targetBatch.zoomMeetingDate,
        zoomMeetingLink: targetBatch.zoomJoinUrl ?? targetBatch.zoomMeetingLink,
      },
    });

    // Task 9: If the source batch is now empty, auto-delete the event + Zoom + Calendar
    if (os.batchSessionId) {
      const remainingCount = await database.onboardingSession.count({
        where: {
          batchSessionId: os.batchSessionId,
          id: { not: sessionId },
          status: { notIn: ["cancelled", "completed"] },
        },
      });

      if (remainingCount === 0) {
        // Delete Zoom meeting
        const sourceBatch = await database.batchSession.findUnique({
          where: { id: os.batchSessionId },
          select: { zoomMeetingId: true, googleCalendarEventId: true, calendarOrganizerEmail: true },
        });
        if (sourceBatch) {
          if (sourceBatch.zoomMeetingId) {
            try {
              const { ZoomService, isZoomConfigured } = await import("@repo/integrations/zoom");
              if (isZoomConfigured()) await ZoomService.deleteMeeting(sourceBatch.zoomMeetingId);
            } catch (err) { console.warn("[hiring-calendar:moveAttendeeToEvent] non-blocking:", err); }
          }
          // Delete calendar event
          const calEventId = sourceBatch.googleCalendarEventId || os.googleCalendarEventId;
          if (calEventId) {
            try {
              const { GoogleCalendarService: GCS, isGoogleCalendarConfigured: isGCC } = await import("@repo/integrations/google-calendar");
              if (isGCC()) await GCS.deleteEvent(calEventId, sourceBatch.calendarOrganizerEmail || undefined);
            } catch (err) { console.warn("[hiring-calendar:moveAttendeeToEvent] non-blocking:", err); }
          }
          // Mark batch as cancelled
          await database.batchSession.update({
            where: { id: os.batchSessionId },
            data: {
              status: "cancelled",
              zoomMeetingId: null,
              zoomMeetingLink: null,
              zoomJoinUrl: null,
              zoomStartUrl: null,
              zoomMeetingDate: null,
              googleCalendarEventId: null,
            },
          });
        }
      }
    }

    try {
      await database.auditLog.create({
        data: {
          actorType: "user",
          actorUserId: session.userId,
          action: "hiring.attendee_moved",
          objectType: "onboarding_session",
          objectId: sessionId,
          newValue: {
            employeeName: `${os.employee.legalFirstName} ${os.employee.legalLastName}`,
            fromBatch: os.batchSessionId,
            toBatch: targetBatchId,
            toTitle: targetBatch.title,
          },
        },
      });
    } catch (auditErr) {
      console.error("[HRIQ] Audit log write failed (non-blocking):", auditErr);
    }

    revalidatePath("/[orgSlug]/hiring", "page");
    return { success: true };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[hiring.ts:moveAttendeeToEvent]", _msg);
    return { error: _msg };
  }
}

/**
 * Reschedule an entire batch event (Zoom meeting + Google Calendar) for all attendees.
 * Updates the Zoom meeting time, calendar events, batch session date, and all
 * individual onboarding session dates. Sends reschedule emails to all attendees.
 */
export async function rescheduleBatchEvent(
  batchSessionId: string,
  newZoomDate: string,
  newDuration?: number,
): Promise<{ ok: boolean; message: string }> {
  const session = await requireRole("super_admin", "admin");

  const batch = await database.batchSession.findFirst({
    where: { id: batchSessionId },
    select: {
      id: true,
      title: true,
      zoomMeetingId: true,
      zoomMeetingDate: true,
      zoomDuration: true,
      calendarOrganizerEmail: true,
      googleCalendarEventId: true,
      organizationId: true,
      onboardingSessions: {
        select: {
          id: true,
          zoomMeetingDate: true,
          googleCalendarEventId: true,
          employee: {
            select: {
              id: true,
              legalFirstName: true,
              legalLastName: true,
              personalEmail: true,
              workEmail: true,
              startDate: true,
              organization: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  if (!batch) throw new Error("Batch session not found");

  const updates: string[] = [];
  const zoomIso = pacificBareIso(newZoomDate);
  const zoomUtc = pacificToUtc(newZoomDate);
  const duration = newDuration ?? batch.zoomDuration;
  const endUtc = new Date(zoomUtc.getTime() + duration * 60 * 1000);
  const attendeeCount = batch.onboardingSessions.length;

  // 1. Reschedule the Zoom meeting
  if (batch.zoomMeetingId) {
    try {
      const { ZoomService, isZoomConfigured } = await import("@repo/integrations/zoom");
      if (isZoomConfigured()) {
        await ZoomService.updateMeeting(batch.zoomMeetingId, {
          startTime: zoomIso,
          timezone: "America/Los_Angeles",
          duration,
        });
        updates.push("Zoom meeting rescheduled");
      } else {
        updates.push("Zoom not configured — skipped");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[rescheduleBatchEvent] Zoom update failed:`, msg);
      dbLogError(`Batch Zoom update failed: ${msg}`, {
        source: "rescheduleBatchEvent",
        raw: { meetingId: batch.zoomMeetingId, batchId: batch.id },
      });
      updates.push(`Zoom update failed: ${msg}`);
    }
  }

  // 2. Update the batch session date in DB
  await database.batchSession.update({
    where: { id: batchSessionId },
    data: {
      zoomMeetingDate: zoomUtc,
      zoomDuration: duration,
    },
  });
  updates.push(`Event moved to ${new Date(typeof zoomUtc === "string" ? zoomUtc : (zoomUtc as Date).getTime()).toLocaleString("en-US", { timeZone: "America/Los_Angeles", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`);

  // 3. Update all individual onboarding session dates
  for (const os of batch.onboardingSessions) {
    await database.onboardingSession.update({
      where: { id: os.id },
      data: { zoomMeetingDate: zoomUtc },
    });
  }
  if (attendeeCount > 0) {
    updates.push(`${attendeeCount} attendee${attendeeCount !== 1 ? "s" : ""} updated`);
  }

  // 4. Update Google Calendar event
  if (batch.googleCalendarEventId && batch.calendarOrganizerEmail) {
    try {
      const { GoogleCalendarService, isGoogleCalendarConfigured } = await import("@repo/integrations/google-calendar");
      if (isGoogleCalendarConfigured()) {
        const calUpdated = await GoogleCalendarService.updateEvent({
          eventId: batch.googleCalendarEventId,
          startTime: zoomUtc.toISOString(),
          endTime: endUtc.toISOString(),
          organizerEmail: batch.calendarOrganizerEmail,
        });
        if (calUpdated) {
          updates.push("Calendar invite updated for all attendees");
        } else {
          updates.push("Calendar update returned false — may need manual update");
        }
      }
    } catch (calErr) {
      console.error(`[rescheduleBatchEvent] Calendar update failed:`, calErr);
      updates.push(`Calendar update failed: ${calErr instanceof Error ? calErr.message : String(calErr)}`);
    }
  } else if (!batch.googleCalendarEventId) {
    updates.push("No calendar event linked — skipped");
  }

  // 5. Send reschedule notification emails to all attendees
  let emailsSent = 0;
  for (const os of batch.onboardingSessions) {
    const emp = os.employee;
    const recipientEmail = emp.personalEmail ?? emp.workEmail;
    if (!recipientEmail) continue;

    try {
      const { sendRescheduleEmail } = await import("./send-email");
      await sendRescheduleEmail(recipientEmail, emp.legalFirstName, {
        newStartDate: emp.startDate ? emp.startDate.toISOString().slice(0, 10) : newZoomDate.slice(0, 10),
        newZoomDate: newZoomDate || undefined,
        orgName: emp.organization?.name || undefined,
      });
      emailsSent++;
    } catch (err) {
      console.error(`[rescheduleBatchEvent] Failed to send email to ${recipientEmail}:`, err);
    }
  }
  if (emailsSent > 0) {
    updates.push(`${emailsSent} reschedule email${emailsSent !== 1 ? "s" : ""} sent`);
  }

  // 6. Audit log
  try {
    await database.auditLog.create({
      data: {
        organizationId: batch.organizationId,
        actorType: "user",
        actorUserId: session.userId,
        action: "hiring.batch_event_rescheduled",
        objectType: "batch_session",
        objectId: batchSessionId,
        newValue: {
          title: batch.title,
          oldDate: batch.zoomMeetingDate?.toISOString(),
          newDate: zoomUtc.toISOString(),
          newDuration: duration,
          attendeeCount,
          emailsSent,
          updates,
        },
      },
    });
  } catch (auditErr) {
    console.error("[HRIQ] Audit log write failed (non-blocking):", auditErr);
  }

  dbLogInfo(`rescheduleBatchEvent completed for batch ${batch.title}`, {
    source: "rescheduleBatchEvent",
    raw: { batchId: batchSessionId, newZoomDate, attendeeCount, updates },
  });

  revalidatePath("/[orgSlug]/hiring", "page");
  return { ok: true, message: updates.join(". ") };
}

/**
 * Automatically clean up past calendar events for completed batch sessions.
 * Deletes Google Calendar events WITHOUT sending cancellation emails.
 * Called on page load as a background task — does not require user session.
 */
export async function cleanupPastCalendarEvents(): Promise<{
  ok: boolean;
  cleaned: number;
}> {
  try {
    // First: mark any past-due scheduled batches as completed
    await database.batchSession.updateMany({
      where: {
        zoomMeetingDate: { lt: new Date() },
        status: "scheduled",
      },
      data: { status: "completed", updatedAt: new Date() },
    });

    // Then: find completed batches that still have calendar event references
    const pastBatches = await database.batchSession.findMany({
      where: {
        zoomMeetingDate: { lt: new Date() },
        googleCalendarEventId: { not: null },
        status: "completed",
      },
      select: {
        id: true,
        title: true,
        calendarOrganizerEmail: true,
        googleCalendarEventId: true,
      },
    });

    if (pastBatches.length === 0) return { ok: true, cleaned: 0 };

    const { GoogleCalendarService, isGoogleCalendarConfigured } = await import(
      "@repo/integrations/google-calendar"
    );
    if (!isGoogleCalendarConfigured()) return { ok: true, cleaned: 0 };

    let cleaned = 0;

    for (const batch of pastBatches) {
      try {
        // Delete the calendar event with sendUpdates=none (NO cancellation emails)
        await GoogleCalendarService.deleteEvent(
          batch.googleCalendarEventId!,
          batch.calendarOrganizerEmail || undefined,
          { sendUpdates: "none" }
        );
      } catch (err) {
        // Event may already be gone — that's fine, just clear the reference
        console.warn(`[cleanupPastCalendarEvents] Delete failed for ${batch.id}:`, err);
      }

      // Clear the calendar event ID from the batch and individual sessions
      await database.batchSession.update({
        where: { id: batch.id },
        data: { googleCalendarEventId: null },
      });
      await database.onboardingSession.updateMany({
        where: { batchSessionId: batch.id, googleCalendarEventId: { not: null } },
        data: { googleCalendarEventId: null },
      });
      cleaned++;
    }

    if (cleaned > 0) {
      console.log(`[cleanupPastCalendarEvents] Silently removed ${cleaned} past calendar event(s).`);
    }

    return { ok: true, cleaned };
  } catch (err) {
    console.error("[cleanupPastCalendarEvents] Error:", err);
    return { ok: false, cleaned: 0 };
  }
}
