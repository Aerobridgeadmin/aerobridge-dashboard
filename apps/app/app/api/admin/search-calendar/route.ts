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

  const q = searchParams.get("q") || "";
  const organizer = searchParams.get("organizer") || "maria@remoteleverage.com";
  const deleteId = searchParams.get("delete");

  if (deleteId) {
    const deleted = await GoogleCalendarService.deleteEvent(deleteId, organizer);
    return NextResponse.json({ deleted, eventId: deleteId });
  }

  const events = await GoogleCalendarService.listEvents({
    organizerEmail: organizer,
    q,
    timeMin: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
    timeMax: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    maxResults: 50,
  });

  return NextResponse.json({ query: q, count: events.length, events });
}
