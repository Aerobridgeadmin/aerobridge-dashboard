import { verifyAdminAuth } from "@/lib/admin-auth";
import { NextResponse } from "next/server";
import { database } from "@repo/database";
import { GoogleCalendarService, isGoogleCalendarConfigured } from "@repo/integrations/google-calendar";

/**
 * Audit endpoint: compares Google Calendar events vs HRIQ batch/session data.
 * GET /api/admin/audit-calendar?key=CRON_SECRET
 */
export async function GET(request: Request) {
  const authError = verifyAdminAuth(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);

  if (!isGoogleCalendarConfigured()) {
    return NextResponse.json({ error: "Google Calendar not configured" }, { status: 500 });
  }

  // Get all active batches with calendar events
  const batches = await database.batchSession.findMany({
    where: {
      status: { not: "cancelled" },
      googleCalendarEventId: { not: null },
    },
    select: {
      id: true,
      title: true,
      status: true,
      zoomMeetingDate: true,
      zoomMeetingId: true,
      googleCalendarEventId: true,
      calendarOrganizerEmail: true,
      onboardingSessions: {
        where: { status: { notIn: ["cancelled"] } },
        select: {
          id: true,
          status: true,
          googleCalendarEventId: true,
          employee: {
            select: {
              id: true,
              legalFirstName: true,
              legalLastName: true,
              personalEmail: true,
              workEmail: true,
            },
          },
        },
      },
    },
    orderBy: { zoomMeetingDate: "desc" },
  });

  const comparison: {
    batchId: string;
    title: string;
    date: string | null;
    calendarEventId: string;
    organizerEmail: string;
    calendarStatus: string | null;
    calendarTitle: string | null;
    calendarStart: string | null;
    hriqAttendees: { name: string; email: string; status: string; hasCalRef: boolean }[];
    calendarAttendees: { email: string; rsvp: string; displayName?: string }[];
    inHriqNotCalendar: string[];
    inCalendarNotHriq: string[];
    missingCalRef: string[];
    issues: string[];
  }[] = [];

  for (const batch of batches) {
    const calEventId = batch.googleCalendarEventId!;
    const organizerEmail = batch.calendarOrganizerEmail || undefined;

    const issues: string[] = [];
    if (!organizerEmail) issues.push("No organizer email on batch");

    // Fetch actual Google Calendar event
    let calEvent: {
      id: string;
      status: string;
      summary?: string;
      start?: { dateTime?: string };
      attendees?: { email: string; responseStatus: string; displayName?: string }[];
    } | null = null;

    try {
      calEvent = await GoogleCalendarService.getEvent(calEventId, organizerEmail);
    } catch (err) {
      issues.push(`Calendar API error: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (!calEvent) {
      issues.push("Calendar event not found (deleted or inaccessible)");
    }

    // Build HRIQ attendee list
    const hriqAttendees = batch.onboardingSessions.map((s) => ({
      name: `${s.employee.legalFirstName} ${s.employee.legalLastName}`,
      email: (s.employee.personalEmail ?? s.employee.workEmail ?? "").toLowerCase(),
      status: s.status,
      hasCalRef: !!s.googleCalendarEventId,
    }));

    // Build calendar attendee list
    const calAttendees = (calEvent?.attendees ?? []).map((a) => ({
      email: a.email.toLowerCase(),
      rsvp: a.responseStatus,
      displayName: a.displayName,
    }));

    const hriqEmails = new Set(hriqAttendees.map((a) => a.email).filter(Boolean));
    const calEmails = new Set(calAttendees.map((a) => a.email));

    // Exclude the organizer from comparison (they're always on the calendar event)
    const orgEmail = (organizerEmail || "").toLowerCase();
    calEmails.delete(orgEmail);

    const inHriqNotCal = [...hriqEmails].filter((e) => !calEmails.has(e));
    const inCalNotHriq = [...calEmails].filter((e) => !hriqEmails.has(e));
    const missingCalRef = hriqAttendees.filter((a) => !a.hasCalRef).map((a) => a.email);

    if (inHriqNotCal.length > 0) issues.push(`${inHriqNotCal.length} HRIQ attendee(s) missing from calendar`);
    if (inCalNotHriq.length > 0) issues.push(`${inCalNotHriq.length} calendar attendee(s) not in HRIQ`);
    if (missingCalRef.length > 0) issues.push(`${missingCalRef.length} session(s) missing googleCalendarEventId`);

    comparison.push({
      batchId: batch.id,
      title: batch.title ?? "Untitled",
      date: batch.zoomMeetingDate?.toISOString() ?? null,
      calendarEventId: calEventId,
      organizerEmail: organizerEmail ?? "MISSING",
      calendarStatus: calEvent?.status ?? null,
      calendarTitle: (calEvent as any)?.summary ?? null,
      calendarStart: (calEvent as any)?.start?.dateTime ?? null,
      hriqAttendees,
      calendarAttendees: calAttendees,
      inHriqNotCalendar: inHriqNotCal,
      inCalendarNotHriq: inCalNotHriq,
      missingCalRef,
      issues,
    });
  }

  // Also check for orphaned sessions with calendar refs to non-existent batches
  const orphanedSessions = await database.onboardingSession.findMany({
    where: {
      googleCalendarEventId: { not: null },
      status: { notIn: ["cancelled", "completed"] },
      OR: [
        { batchSessionId: null },
        { batchSession: { status: "cancelled" } },
      ],
    },
    select: {
      id: true,
      googleCalendarEventId: true,
      employee: { select: { legalFirstName: true, legalLastName: true, personalEmail: true } },
    },
  });

  const totalIssues = comparison.reduce((sum, c) => sum + c.issues.length, 0) + orphanedSessions.length;

  return NextResponse.json({
    summary: {
      totalBatches: comparison.length,
      totalIssues,
      healthy: totalIssues === 0,
      orphanedSessions: orphanedSessions.length,
    },
    events: comparison,
    orphanedSessions: orphanedSessions.map((s) => ({
      sessionId: s.id,
      calEventId: s.googleCalendarEventId,
      employee: `${s.employee.legalFirstName} ${s.employee.legalLastName}`,
      email: s.employee.personalEmail,
    })),
  });
}
