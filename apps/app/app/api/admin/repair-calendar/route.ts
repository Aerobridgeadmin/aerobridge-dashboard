import { verifyAdminAuth } from "@/lib/admin-auth";
import { NextResponse } from "next/server";
import { database } from "@repo/database";
import { GoogleCalendarService, isGoogleCalendarConfigured } from "@repo/integrations/google-calendar";

/**
 * One-time repair endpoint: adds missing attendees to Google Calendar events.
 * Finds onboarding sessions that have a batch with a calendar event but the
 * session itself is missing the google_calendar_event_id.
 *
 * GET /api/admin/repair-calendar?key=CRON_SECRET
 */
export async function GET(request: Request) {
  const authError = verifyAdminAuth(request);
  if (authError) return authError;

  if (!isGoogleCalendarConfigured()) {
    return NextResponse.json({ error: "Google Calendar not configured" }, { status: 500 });
  }

  // Find sessions missing calendar event ID but in a batch that has one
  const missingSessions = await database.onboardingSession.findMany({
    where: {
      googleCalendarEventId: null,
      status: { notIn: ["completed", "cancelled"] },
      batchSession: {
        googleCalendarEventId: { not: null },
        calendarOrganizerEmail: { not: null },
      },
    },
    select: {
      id: true,
      employeeId: true,
      batchSessionId: true,
      batchSession: {
        select: {
          googleCalendarEventId: true,
          calendarOrganizerEmail: true,
        },
      },
      employee: {
        select: {
          legalFirstName: true,
          legalLastName: true,
          personalEmail: true,
          workEmail: true,
        },
      },
    },
  });

  const results: {
    name: string;
    email: string;
    calEventId: string;
    status: "added" | "failed" | "no_email";
    error?: string;
  }[] = [];

  for (const session of missingSessions) {
    const name = `${session.employee.legalFirstName} ${session.employee.legalLastName}`;
    const email = session.employee.personalEmail ?? session.employee.workEmail;
    const calEventId = session.batchSession!.googleCalendarEventId!;
    const organizerEmail = session.batchSession!.calendarOrganizerEmail!;

    if (!email) {
      results.push({ name, email: "none", calEventId, status: "no_email" });
      continue;
    }

    try {
      const added = await GoogleCalendarService.addAttendees({
        eventId: calEventId,
        newEmails: [email],
        organizerEmail,
      });

      if (added) {
        // Update the session with the calendar event ID
        await database.onboardingSession.update({
          where: { id: session.id },
          data: { googleCalendarEventId: calEventId },
        });
        results.push({ name, email, calEventId, status: "added" });
      } else {
        results.push({ name, email, calEventId, status: "failed", error: "addAttendees returned false" });
      }
    } catch (err) {
      results.push({
        name,
        email,
        calEventId,
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    found: missingSessions.length,
    results,
    added: results.filter((r) => r.status === "added").length,
    failed: results.filter((r) => r.status === "failed").length,
  });
}
