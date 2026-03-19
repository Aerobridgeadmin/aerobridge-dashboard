import { database } from "@repo/database";
import { NextResponse } from "next/server";

export const maxDuration = 60;

/**
 * Cron: Sync Google Calendar RSVP statuses for onboarding sessions.
 *
 * Polls Google Calendar events for attendee responseStatus and updates
 * the onboarding session's zoomRsvpStatus accordingly.
 *
 * Google Calendar responseStatus values:
 *   "needsAction"  pending (no response yet)
 *   "accepted"     accepted
 *   "declined"     declined
 *   "tentative"    pending (treat as not yet decided)
 *
 * Schedule: Every 10 minutes (see vercel.json)
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { GoogleCalendarService, isGoogleCalendarConfigured } = await import(
      "@repo/integrations/google-calendar"
    );

    if (!isGoogleCalendarConfigured()) {
      return NextResponse.json({ skipped: true, reason: "Google Calendar not configured" });
    }

    // Find all sessions with a calendar event that haven't been resolved yet
    const sessions = await database.onboardingSession.findMany({
      where: {
        googleCalendarEventId: { not: null },
        zoomRsvpStatus: "pending",
        zoomInviteSent: true,
      },
      select: {
        id: true,
        googleCalendarEventId: true,
        employee: {
          select: {
            personalEmail: true,
            workEmail: true,
            legalFirstName: true,
            legalLastName: true,
          },
        },
        batchSession: {
          select: { calendarOrganizerEmail: true },
        },
      },
      take: 50, // batch limit per run
    });

    if (sessions.length === 0) {
      return NextResponse.json({ checked: 0, updated: 0 });
    }

    let updated = 0;
    let errors = 0;

    for (const session of sessions) {
      try {
        const organizerEmail = session.batchSession?.calendarOrganizerEmail || undefined;
        if (!organizerEmail) continue; // No organizer — cannot access calendar
        const event = await GoogleCalendarService.getEvent(
          session.googleCalendarEventId!,
          organizerEmail
        );

        if (!event) {
          // Event deleted from Google Calendar — clear stale reference
          await database.onboardingSession.update({
            where: { id: session.id },
            data: { googleCalendarEventId: null },
          });
          continue;
        }
        if (!event.attendees) continue;

        // Match attendee by employee email
        const employeeEmails = [
          session.employee.personalEmail?.toLowerCase(),
          session.employee.workEmail?.toLowerCase(),
        ].filter(Boolean);

        const attendee = event.attendees.find((a: { email: string }) =>
          employeeEmails.includes(a.email.toLowerCase())
        );

        if (!attendee) continue;

        // Map Google Calendar responseStatus to our RSVP status
        let newStatus: "accepted" | "declined" | null = null;
        if (attendee.responseStatus === "accepted") {
          newStatus = "accepted";
        } else if (attendee.responseStatus === "declined") {
          newStatus = "declined";
        }
        // "needsAction" and "tentative" remain as "pending"

        if (newStatus) {
          await database.onboardingSession.update({
            where: { id: session.id },
            data: {
              zoomRsvpStatus: newStatus,
              zoomInviteAccepted: newStatus === "accepted",
              zoomInviteAcceptedAt: newStatus === "accepted" ? new Date() : null,
            },
          });
          updated++;
        }
      } catch (err) {
        errors++;
        console.error(`[RSVP Sync] Error for session ${session.id}:`, err);
      }
    }

    return NextResponse.json({ checked: sessions.length, updated, errors });
  } catch (err) {
    console.error("[RSVP Sync] Fatal error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
