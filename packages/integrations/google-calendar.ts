import "server-only";
import { GoogleAuth } from "google-auth-library";
import { dbLogError, dbLogInfo } from "@repo/observability/db-log";

const FETCH_TIMEOUT_MS = 10_000;

export function isGoogleCalendarConfigured(): boolean {
  return !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
}

function getAuth(impersonateEmail?: string) {
  const keyJson = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!);

  return new GoogleAuth({
    credentials: {
      client_email: keyJson.client_email,
      private_key: keyJson.private_key,
    },
    scopes: ["https://www.googleapis.com/auth/calendar"],
    ...(impersonateEmail ? { clientOptions: { subject: impersonateEmail } } : {}),
  });
}

async function calendarFetch(path: string, options: RequestInit & { organizerEmail?: string } = {}) {
  if (!isGoogleCalendarConfigured()) return null;

  const auth = getAuth(options.organizerEmail);
  const client = await auth.getClient();
  const token = await client.getAccessToken();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token.token}`,
        ...options.headers,
      },
    });

    if (!res.ok) {
      // 404/410 = event/calendar deleted — expected, don't spam logs
      if (res.status === 404 || res.status === 410) return null;
      const err = await res.text();
      console.error(`Google Calendar API error: ${res.status} ${err} (organizer: ${options.organizerEmail || "default"}, path: ${path})`);
      dbLogError(`Google Calendar API error: ${res.status}`, {
        source: "google-calendar",
        request_path: path,
        status_code: res.status,
        raw: { error: err, organizer: options.organizerEmail || "default", method: options.method || "GET" },
      });
      return null;
    }

    // DELETE returns 204 No Content — no body to parse
    if (res.status === 204) return { success: true };

    const json = await res.json();
    return json;
  } catch (e: any) {
    // AbortError = fetch timed out — non-fatal, return null
    if (e?.name === "AbortError" || e?.code === 20) {
      dbLogInfo(`Google Calendar timeout after ${FETCH_TIMEOUT_MS}ms`, {
        source: "google-calendar",
        request_path: path,
        raw: { organizer: options.organizerEmail || "default", method: options.method || "GET" },
      });
      return null;
    }
    dbLogError(`Google Calendar unexpected error: ${e?.message || e}`, {
      source: "google-calendar",
      request_path: path,
      raw: { organizer: options.organizerEmail || "default", error: String(e), method: options.method || "GET" },
    });
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export const GoogleCalendarService = {
  async createEvent(params: {
    title: string;
    description?: string;
    startTime: string;
    endTime: string;
    timezone?: string;
    location?: string;
    attendeeEmails?: string[];
    organizerEmail?: string;
  }): Promise<{ eventId: string; htmlLink: string } | null> {
    if (!isGoogleCalendarConfigured()) return null;

    const body = {
      summary: params.title,
      description: params.description,
      start: { dateTime: params.startTime, timeZone: params.timezone ?? "America/Los_Angeles" },
      end: { dateTime: params.endTime, timeZone: params.timezone ?? "America/Los_Angeles" },
      location: params.location,
      attendees: params.attendeeEmails?.map((email) => ({ email })),
      conferenceData: undefined,
      reminders: { useDefault: true },
    };

    const data = await calendarFetch("/calendars/primary/events?sendUpdates=all", {
      method: "POST",
      body: JSON.stringify(body),
      organizerEmail: params.organizerEmail,
    });

    if (!data) return null;
    return { eventId: data.id, htmlLink: data.htmlLink };
  },

  async updateEvent(params: {
    eventId: string;
    title?: string;
    description?: string;
    startTime?: string;
    endTime?: string;
    timezone?: string;
    location?: string;
    organizerEmail?: string;
    attendeeEmails?: string[];
  }): Promise<boolean> {
    if (!isGoogleCalendarConfigured()) return false;

    const body: Record<string, unknown> = {};
    if (params.title) body.summary = params.title;
    if (params.description) body.description = params.description;
    if (params.startTime) body.start = { dateTime: params.startTime, timeZone: params.timezone ?? "America/Los_Angeles" };
    if (params.endTime) body.end = { dateTime: params.endTime, timeZone: params.timezone ?? "America/Los_Angeles" };
    if (params.location) body.location = params.location;
    if (params.attendeeEmails) body.attendees = params.attendeeEmails.map((email) => ({ email }));

    const data = await calendarFetch(`/calendars/primary/events/${params.eventId}?sendUpdates=all`, {
      method: "PATCH",
      body: JSON.stringify(body),
      organizerEmail: params.organizerEmail,
    });

    return !!data;
  },

  async addAttendees(params: {
    eventId: string;
    newEmails: string[];
    organizerEmail?: string;
    /** Optionally update the event title at the same time */
    title?: string;
  }): Promise<boolean> {
    if (!isGoogleCalendarConfigured()) return false;

    // Get existing event
    const event = await calendarFetch(`/calendars/primary/events/${params.eventId}`, {
      organizerEmail: params.organizerEmail,
    });

    if (!event) return false;

    const existingAttendees: { email: string }[] = event.attendees ?? [];
    const existingEmails = new Set(existingAttendees.map((a: { email: string }) => a.email.toLowerCase()));
    const newAttendees = params.newEmails
      .filter((email) => !existingEmails.has(email.toLowerCase()))
      .map((email) => ({ email }));
    const allAttendees = [...existingAttendees, ...newAttendees];

    const patch: Record<string, unknown> = { attendees: allAttendees };
    if (params.title) patch.summary = params.title;

    const data = await calendarFetch(`/calendars/primary/events/${params.eventId}?sendUpdates=all`, {
      method: "PATCH",
      body: JSON.stringify(patch),
      organizerEmail: params.organizerEmail,
    });

    return !!data;
  },

  async removeAttendees(params: {
    eventId: string;
    removeEmails: string[];
    organizerEmail?: string;
  }): Promise<boolean> {
    if (!isGoogleCalendarConfigured()) return false;

    const event = await calendarFetch(`/calendars/primary/events/${params.eventId}`, {
      organizerEmail: params.organizerEmail,
    });

    if (!event) return false;

    const removeSet = new Set(params.removeEmails.map((e) => e.toLowerCase()));
    const filteredAttendees = (event.attendees ?? []).filter(
      (a: { email: string }) => !removeSet.has(a.email.toLowerCase())
    );

    const data = await calendarFetch(`/calendars/primary/events/${params.eventId}?sendUpdates=all`, {
      method: "PATCH",
      body: JSON.stringify({ attendees: filteredAttendees }),
      organizerEmail: params.organizerEmail,
    });

    return !!data;
  },

  async deleteEvent(eventId: string, organizerEmail?: string, opts?: { sendUpdates?: "all" | "none" }): Promise<boolean> {
    if (!isGoogleCalendarConfigured()) return false;

    const sendUpdates = opts?.sendUpdates ?? "all";
    const res = await calendarFetch(`/calendars/primary/events/${eventId}?sendUpdates=${sendUpdates}`, {
      method: "DELETE",
      organizerEmail,
    });

    return res !== null;
  },

  /**
   * Get event details including attendee RSVP statuses.
   * Returns attendees array with { email, responseStatus } where
   * responseStatus is: "needsAction" | "declined" | "tentative" | "accepted"
   */
  async getEvent(eventId: string, organizerEmail?: string): Promise<{
    id: string;
    status: string;
    attendees?: { email: string; responseStatus: string; displayName?: string }[];
  } | null> {
    if (!isGoogleCalendarConfigured()) return null;

    const data = await calendarFetch(`/calendars/primary/events/${eventId}`, {
      organizerEmail,
    });

    if (!data) return null;
    return {
      id: data.id,
      status: data.status,
      attendees: data.attendees,
    };
  },

  /**
   * Move a calendar event from one calendar (organizer) to another.
   * Uses the Google Calendar API move endpoint.
   */
  async moveEvent(eventId: string, sourceEmail: string | undefined, destinationEmail: string): Promise<boolean> {
    if (!isGoogleCalendarConfigured()) return false;

    // Use the source calendar to initiate the move
    const res = await calendarFetch(
      `/calendars/primary/events/${eventId}/move?destination=${encodeURIComponent(destinationEmail)}`,
      {
        method: "POST",
        organizerEmail: sourceEmail,
      },
    );

    return res !== null;
  },

  async listEvents(params: {
    organizerEmail: string;
    timeMin?: string;
    timeMax?: string;
    q?: string;
    maxResults?: number;
  }): Promise<{
    id: string;
    summary: string;
    status: string;
    start: string | null;
    end: string | null;
    attendees: { email: string; responseStatus: string }[];
  }[]> {
    if (!isGoogleCalendarConfigured()) return [];

    const searchParams = new URLSearchParams({
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: String(params.maxResults ?? 50),
    });
    if (params.timeMin) searchParams.set("timeMin", params.timeMin);
    if (params.timeMax) searchParams.set("timeMax", params.timeMax);
    if (params.q) searchParams.set("q", params.q);

    const data = await calendarFetch(
      `/calendars/primary/events?${searchParams.toString()}`,
      { organizerEmail: params.organizerEmail },
    );

    if (!data?.items) return [];
    return data.items.map((e: any) => ({
      id: e.id,
      summary: e.summary ?? "",
      status: e.status ?? "",
      start: e.start?.dateTime ?? e.start?.date ?? null,
      end: e.end?.dateTime ?? e.end?.date ?? null,
      attendees: (e.attendees ?? []).map((a: any) => ({
        email: a.email,
        responseStatus: a.responseStatus,
      })),
    }));
  },
};
