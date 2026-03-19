import { verifyAdminAuth } from "@/lib/admin-auth";
import { NextResponse } from "next/server";
import { database } from "@repo/database";
import { GoogleCalendarService, isGoogleCalendarConfigured } from "@repo/integrations/google-calendar";

/**
 * Provision a batch with Zoom + Calendar that was created manually in DB.
 * GET /api/admin/provision-batch?key=CRON_SECRET&batchId=xxx
 */
export async function GET(request: Request) {
  const authError = verifyAdminAuth(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const batchId = searchParams.get("batchId");
  if (!batchId) return NextResponse.json({ error: "batchId required" }, { status: 400 });

  const batch = await database.batchSession.findUnique({
    where: { id: batchId },
    include: {
      onboardingSessions: {
        include: { employee: { select: { personalEmail: true, legalFirstName: true, legalLastName: true } } },
      },
    },
  });
  if (!batch) return NextResponse.json({ error: "Batch not found" }, { status: 404 });

  const results: Record<string, unknown> = { batchId, title: batch.title, date: batch.zoomMeetingDate };

  // Create Zoom meeting if missing
  if (!batch.zoomMeetingId && batch.zoomMeetingDate) {
    try {
      const { ZoomService, isZoomConfigured } = await import("@repo/integrations/zoom");
      if (isZoomConfigured()) {
        const meeting = await ZoomService.createMeeting({
          topic: batch.title,
          startTime: batch.zoomMeetingDate.toISOString(),
          duration: batch.zoomDuration ?? 30,
          timezone: "America/Los_Angeles",
          agenda: `Onboarding: ${batch.title}`,
          hostUser: batch.calendarOrganizerEmail || undefined,
        });
        if (meeting) {
          await database.batchSession.update({
            where: { id: batchId },
            data: {
              zoomMeetingId: String(meeting.id),
              zoomJoinUrl: meeting.join_url,
              zoomStartUrl: meeting.start_url,
            },
          });
          // Also update attendee sessions
          for (const session of batch.onboardingSessions) {
            await database.onboardingSession.update({
              where: { id: session.id },
              data: { zoomMeetingLink: meeting.join_url },
            });
          }
          results.zoom = { id: meeting.id, joinUrl: meeting.join_url, created: true };
        }
      }
    } catch (e) {
      results.zoomError = String(e);
    }
  } else {
    results.zoom = { existing: batch.zoomMeetingId };
  }

  // Create Google Calendar event if missing
  if (!batch.googleCalendarEventId && batch.zoomMeetingDate && batch.calendarOrganizerEmail) {
    try {
      if (isGoogleCalendarConfigured()) {
        const attendeeEmails = batch.onboardingSessions
          .map((s) => s.employee.personalEmail)
          .filter(Boolean) as string[];

        const updatedBatch = await database.batchSession.findUnique({ where: { id: batchId } });
        const zoomJoinUrl = updatedBatch?.zoomJoinUrl;

        const calEvent = await GoogleCalendarService.createEvent({
          title: batch.title,
          description: zoomJoinUrl ? `Zoom Join: ${zoomJoinUrl}` : `Onboarding: ${batch.title}`,
          startTime: batch.zoomMeetingDate.toISOString(),
          endTime: new Date(batch.zoomMeetingDate.getTime() + (batch.zoomDuration ?? 30) * 60 * 1000).toISOString(),
          timezone: "America/Los_Angeles",
          organizerEmail: batch.calendarOrganizerEmail,
          attendeeEmails,
        });

        if (calEvent?.eventId) {
          await database.batchSession.update({
            where: { id: batchId },
            data: { googleCalendarEventId: calEvent.eventId },
          });
          // Update session refs
          for (const session of batch.onboardingSessions) {
            await database.onboardingSession.update({
              where: { id: session.id },
              data: { googleCalendarEventId: calEvent.eventId },
            });
          }
          results.calendar = { eventId: calEvent.eventId, attendees: attendeeEmails, created: true };
        }
      }
    } catch (e) {
      results.calendarError = String(e);
    }
  } else {
    results.calendar = { existing: batch.googleCalendarEventId };
  }

  return NextResponse.json(results);
}
