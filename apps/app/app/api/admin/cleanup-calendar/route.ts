import { verifyAdminAuth } from "@/lib/admin-auth";
import { NextResponse } from "next/server";
import { database } from "@repo/database";
import { GoogleCalendarService, isGoogleCalendarConfigured } from "@repo/integrations/google-calendar";

/**
 * Find and optionally delete orphaned Google Calendar events.
 * GET  /api/admin/cleanup-calendar?key=CRON_SECRET               → dry run (list orphans)
 * GET  /api/admin/cleanup-calendar?key=CRON_SECRET&delete=true   → delete orphans
 */
export async function GET(request: Request) {
  const authError = verifyAdminAuth(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);

  if (!isGoogleCalendarConfigured()) {
    return NextResponse.json({ error: "Google Calendar not configured" }, { status: 500 });
  }

  const shouldDelete = searchParams.get("delete") === "true";
  const organizerEmail = searchParams.get("organizer") || "maria@remoteleverage.com";

  // Get all HRIQ-tracked calendar event IDs
  const trackedBatches = await database.batchSession.findMany({
    where: { googleCalendarEventId: { not: null } },
    select: { googleCalendarEventId: true, title: true, status: true, zoomMeetingDate: true },
  });
  const trackedIds = new Set(trackedBatches.map((b) => b.googleCalendarEventId!));

  // List all events on Maria's calendar for the next 60 days
  const now = new Date();
  const sixtyDaysOut = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

  const allEvents = await GoogleCalendarService.listEvents({
    organizerEmail,
    timeMin: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    timeMax: sixtyDaysOut.toISOString(),
    maxResults: 100,
  });

  // Separate tracked vs orphaned
  const tracked: typeof allEvents = [];
  const orphaned: typeof allEvents = [];

  for (const event of allEvents) {
    if (trackedIds.has(event.id)) {
      tracked.push(event);
    } else {
      // Only flag as orphaned if it looks like an HRIQ event (onboarding/orientation in title)
      const lowerSummary = event.summary.toLowerCase();
      const isHriqEvent = lowerSummary.includes("onboarding") || lowerSummary.includes("orientation") || lowerSummary.includes("remote leverage");
      if (isHriqEvent) {
        orphaned.push(event);
      }
    }
  }

  // Delete orphans if requested
  const deleteResults: { eventId: string; summary: string; deleted: boolean; error?: string }[] = [];
  if (shouldDelete) {
    for (const event of orphaned) {
      try {
        const deleted = await GoogleCalendarService.deleteEvent(event.id, organizerEmail);
        deleteResults.push({ eventId: event.id, summary: event.summary, deleted });
      } catch (err) {
        deleteResults.push({
          eventId: event.id,
          summary: event.summary,
          deleted: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return NextResponse.json({
    organizer: organizerEmail,
    totalCalendarEvents: allEvents.length,
    trackedByHriq: tracked.length,
    orphanedHriqEvents: orphaned.length,
    mode: shouldDelete ? "DELETE" : "DRY_RUN",
    orphaned: orphaned.map((e) => ({
      id: e.id,
      summary: e.summary,
      start: e.start,
      attendees: e.attendees.map((a) => a.email),
    })),
    ...(shouldDelete ? { deleteResults } : {}),
    allEvents: allEvents.map((e) => ({
      id: e.id,
      summary: e.summary,
      start: e.start,
      status: e.status,
      tracked: trackedIds.has(e.id),
      attendees: e.attendees.map((a) => a.email),
    })),
  });
}
