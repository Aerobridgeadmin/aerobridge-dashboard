import { verifyAdminAuth } from "@/lib/admin-auth";
import { NextResponse } from "next/server";
import { GoogleCalendarService, isGoogleCalendarConfigured } from "@repo/integrations/google-calendar";

export async function GET(request: Request) {
  const authError = verifyAdminAuth(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  if (!isGoogleCalendarConfigured()) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const eventId = searchParams.get("eventId");
  const email = searchParams.get("email");
  const organizer = searchParams.get("organizer") || "maria@remoteleverage.com";

  if (!eventId || !email) {
    return NextResponse.json({ error: "eventId and email required" }, { status: 400 });
  }

  const event = await GoogleCalendarService.getEvent(eventId, organizer);
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const currentAttendees = event.attendees || [];
  const filtered = currentAttendees.filter((a) => a.email !== email);

  if (filtered.length === currentAttendees.length) {
    return NextResponse.json({ error: "Email not found in attendees", attendees: currentAttendees.map((a) => a.email) });
  }

  const updated = await GoogleCalendarService.updateEvent({
    eventId,
    attendeeEmails: filtered.map((a) => a.email),
    organizerEmail: organizer,
  });

  return NextResponse.json({
    removed: email,
    eventId,
    remainingAttendees: filtered.map((a) => a.email),
    success: updated,
  });
}
