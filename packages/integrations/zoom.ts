import "server-only";
import { dbLogError } from "@repo/observability/db-log";

const FETCH_TIMEOUT_MS = 30_000;

function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function getConfiguredZoomHosts(): string[] {
  const rawHosts = readEnv("ZOOM_HOST_USERS");
  if (!rawHosts) return [];
  // Support JSON arrays and delimited strings (comma/newline/semicolon).
  if (rawHosts.startsWith("[")) {
    try {
      const parsed = JSON.parse(rawHosts);
      if (Array.isArray(parsed)) {
        return parsed
          .map((host) => String(host ?? "").trim())
          .filter(Boolean);
      }
    } catch {
      // Fall through to delimited parsing.
    }
  }
  return rawHosts
    .split(/[,\n;]+/)
    .map((host) => host.trim())
    .filter(Boolean);
}

export function getConfiguredZoomHostByOrg(): Record<string, string> {
  const raw = readEnv("ZOOM_HOST_USERS_BY_ORG");
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const result: Record<string, string> = {};
    for (const [orgName, hostUser] of Object.entries(parsed)) {
      const key = orgName.trim().toLowerCase();
      const value = String(hostUser ?? "").trim();
      if (key && value) result[key] = value;
    }
    return result;
  } catch {
    return {};
  }
}

export function isZoomConfigured(): boolean {
  return !!(
    readEnv("ZOOM_ACCOUNT_ID") &&
    readEnv("ZOOM_CLIENT_ID") &&
    readEnv("ZOOM_CLIENT_SECRET")
  );
}

export async function getAvailableZoomHosts(): Promise<string[]> {
  const configuredHosts = getConfiguredZoomHosts();
  if (!isZoomConfigured()) return configuredHosts;

  const discoveredHosts = new Set<string>();
  let nextPageToken = "";

  try {
    const token = await getAccessToken();
    for (let i = 0; i < 5; i += 1) {
      const query = new URLSearchParams({
        page_size: "300",
        status: "active",
      });
      if (nextPageToken) query.set("next_page_token", nextPageToken);

      const response = await fetchWithTimeout(`https://api.zoom.us/v2/users?${query.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) break;
      const payload = await response.json();
      const users = Array.isArray(payload?.users) ? payload.users : [];
      for (const user of users) {
        const email = String(user?.email ?? "").trim();
        if (email) discoveredHosts.add(email);
      }
      nextPageToken = String(payload?.next_page_token ?? "").trim();
      if (!nextPageToken) break;
    }
  } catch {
    // Keep configured hosts if Zoom user discovery fails.
  }

  return Array.from(new Set([...configuredHosts, ...Array.from(discoveredHosts)]));
}

let tokenCache: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }

  const credentials = Buffer.from(
    `${readEnv("ZOOM_CLIENT_ID")}:${readEnv("ZOOM_CLIENT_SECRET")}`
  ).toString("base64");

  const response = await fetchWithTimeout("https://zoom.us/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "account_credentials",
      account_id: readEnv("ZOOM_ACCOUNT_ID")!,
    }),
  });

  if (!response.ok) {
    throw new Error(`Zoom OAuth failed: ${response.statusText}`);
  }

  const data = await response.json();
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };

  return tokenCache.token;
}

export const ZoomService = {
  async createMeeting(params: {
    topic: string;
    startTime: string;
    duration: number;
    timezone?: string;
    agenda?: string;
    hostUser?: string;
  }) {
    const token = await getAccessToken();
    const hostUser = params.hostUser?.trim() || "me";
    const encodedHostUser = encodeURIComponent(hostUser);

    const meetingSettings: Record<string, unknown> = {
      join_before_host: false,
      waiting_room: true,
      auto_recording: "none",
      mute_upon_entry: true,
      email_notification: true,
      host_video: true,
      participant_video: false,
      registrants_email_notification: true,
    };

    // If a specific host is chosen (not "me"), also set them as alternative host
    // so they receive calendar/email notifications from Zoom itself.
    if (hostUser !== "me") {
      meetingSettings.alternative_hosts = hostUser;
      meetingSettings.alternative_hosts_email_notification = true;
    }

    const meetingPayload: Record<string, unknown> = {
      topic: params.topic,
      type: 2, // Scheduled meeting
      start_time: params.startTime,
      duration: params.duration,
      timezone: params.timezone ?? "America/Los_Angeles",
      agenda: params.agenda,
      settings: meetingSettings,
    };

    // Use schedule_for when creating under a specific host so the meeting
    // appears on their Zoom calendar and they receive the host notification.
    if (hostUser !== "me") {
      meetingPayload.schedule_for = hostUser;
    }

    const response = await fetchWithTimeout(`https://api.zoom.us/v2/users/${encodedHostUser}/meetings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(meetingPayload),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Zoom create meeting failed (host: ${hostUser}): ${error}`);
    }

    const meeting = await response.json();

    // Return the host email alongside the meeting data so callers can notify them.
    return { ...meeting, _hostUser: hostUser };
  },

  async getMeeting(meetingId: string) {
    const token = await getAccessToken();
    const response = await fetchWithTimeout(`https://api.zoom.us/v2/meetings/${meetingId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`Zoom get meeting failed: ${response.statusText}`);
    return response.json();
  },

  async updateMeeting(meetingId: string, params: {
    topic?: string;
    startTime?: string;
    duration?: number;
    timezone?: string;
    agenda?: string;
  }) {
    const token = await getAccessToken();
    const payload: Record<string, unknown> = {};
    if (params.topic) payload.topic = params.topic;
    if (params.startTime) payload.start_time = params.startTime;
    if (params.duration) payload.duration = params.duration;
    if (params.timezone) payload.timezone = params.timezone;
    if (params.agenda) payload.agenda = params.agenda;

    console.log(`[ZoomService.updateMeeting] meetingId=${meetingId} payload=${JSON.stringify(payload)}`);

    const response = await fetchWithTimeout(`https://api.zoom.us/v2/meetings/${meetingId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    console.log(`[ZoomService.updateMeeting] response status=${response.status}`);

    if (!response.ok && response.status !== 204) {
      const error = await response.text();
      dbLogError(`Zoom update meeting failed (${response.status})`, {
        source: "zoom",
        status_code: response.status,
        raw: { meetingId, error, payload },
      });
      throw new Error(`Zoom update meeting failed (${response.status}): ${error}`);
    }
  },

  async deleteMeeting(meetingId: string) {
    const token = await getAccessToken();
    const response = await fetchWithTimeout(`https://api.zoom.us/v2/meetings/${meetingId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok && response.status !== 204) {
      throw new Error(`Zoom delete meeting failed: ${response.statusText}`);
    }
  },

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const token = await getAccessToken();
      const response = await fetchWithTimeout("https://api.zoom.us/v2/users/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return { success: false, message: "Failed to connect" };
      const user = await response.json();
      return { success: true, message: `Connected as ${user.email}` };
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : "Unknown error" };
    }
  },
};
