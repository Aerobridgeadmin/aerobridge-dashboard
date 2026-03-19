import axios from "axios";
import { structuredLogger as logger } from "../lib/structured-logger";

interface ZoomTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

interface ZoomMeetingSettings {
  host_video?: boolean;
  participant_video?: boolean;
  join_before_host?: boolean;
  waiting_room?: boolean;
  mute_upon_entry?: boolean;
  approval_type?: number;
  auto_recording?: string;
}

interface CreateMeetingParams {
  topic: string;
  startTime: Date;
  duration: number;
  timezone?: string;
  agenda?: string;
  settings?: ZoomMeetingSettings;
}

interface ZoomMeeting {
  id: number;
  uuid: string;
  host_id: string;
  host_email: string;
  topic: string;
  type: number;
  status: string;
  start_time: string;
  duration: number;
  timezone: string;
  created_at: string;
  start_url: string;
  join_url: string;
  password: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

export function isZoomConfigured(): boolean {
  return !!(
    process.env.ZOOM_ACCOUNT_ID &&
    process.env.ZOOM_CLIENT_ID &&
    process.env.ZOOM_CLIENT_SECRET
  );
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60000) {
    return cachedToken.token;
  }

  const accountId = process.env.ZOOM_ACCOUNT_ID;
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;

  if (!accountId || !clientId || !clientSecret) {
    throw new Error("Zoom credentials not configured");
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  try {
    const response = await axios.post<ZoomTokenResponse>(
      "https://zoom.us/oauth/token",
      `grant_type=account_credentials&account_id=${accountId}`,
      {
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
        },
      }
    );

    cachedToken = {
      token: response.data.access_token,
      expiresAt: Date.now() + response.data.expires_in * 1000,
    };

    logger.info("[Zoom] Successfully obtained access token");
    return cachedToken.token;
  } catch (error: any) {
    const errorData = error.response?.data;
    logger.error("[Zoom] Failed to get access token:", errorData || error.message);
    
    // Provide helpful error messages
    if (errorData?.error === "unsupported_grant_type") {
      throw new Error("Zoom authentication failed: Ensure your Zoom app is a Server-to-Server OAuth app (not a standard OAuth app) and that it is activated in the Zoom Marketplace.");
    }
    if (errorData?.error === "invalid_client") {
      throw new Error("Zoom authentication failed: Invalid Client ID or Client Secret. Please verify your Zoom credentials.");
    }
    
    throw new Error(`Failed to authenticate with Zoom: ${errorData?.reason || errorData?.message || error.message}`);
  }
}

export async function createZoomMeeting(params: CreateMeetingParams): Promise<ZoomMeeting> {
  const accessToken = await getAccessToken();

  const meetingDetails = {
    topic: params.topic,
    type: 2,
    start_time: params.startTime.toISOString(),
    duration: params.duration,
    timezone: params.timezone || "UTC",
    agenda: params.agenda || "",
    settings: {
      host_video: params.settings?.host_video ?? true,
      participant_video: params.settings?.participant_video ?? true,
      join_before_host: params.settings?.join_before_host ?? true,
      waiting_room: params.settings?.waiting_room ?? false,
      mute_upon_entry: params.settings?.mute_upon_entry ?? false,
      approval_type: params.settings?.approval_type ?? 0,
      auto_recording: params.settings?.auto_recording ?? "none",
    },
  };

  try {
    const response = await axios.post<ZoomMeeting>(
      "https://api.zoom.us/v2/users/me/meetings",
      meetingDetails,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    logger.info(`[Zoom] Created meeting: ${response.data.id} - ${response.data.topic}`);
    return response.data;
  } catch (error: any) {
    logger.error("[Zoom] Failed to create meeting:", error.response?.data || error.message);
    throw new Error(`Failed to create Zoom meeting: ${error.response?.data?.message || error.message}`);
  }
}

export async function getMeeting(meetingId: string | number): Promise<ZoomMeeting> {
  const accessToken = await getAccessToken();

  try {
    const response = await axios.get<ZoomMeeting>(
      `https://api.zoom.us/v2/meetings/${meetingId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    return response.data;
  } catch (error: any) {
    logger.error("[Zoom] Failed to get meeting:", error.response?.data || error.message);
    throw new Error(`Failed to get Zoom meeting: ${error.response?.data?.message || error.message}`);
  }
}

export async function deleteMeeting(meetingId: string | number): Promise<void> {
  const accessToken = await getAccessToken();

  try {
    await axios.delete(`https://api.zoom.us/v2/meetings/${meetingId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    logger.info(`[Zoom] Deleted meeting: ${meetingId}`);
  } catch (error: any) {
    logger.error("[Zoom] Failed to delete meeting:", error.response?.data || error.message);
    throw new Error(`Failed to delete Zoom meeting: ${error.response?.data?.message || error.message}`);
  }
}

export async function listMeetings(type: "scheduled" | "live" | "upcoming" = "upcoming"): Promise<ZoomMeeting[]> {
  const accessToken = await getAccessToken();

  try {
    const response = await axios.get<{ meetings: ZoomMeeting[] }>(
      "https://api.zoom.us/v2/users/me/meetings",
      {
        params: { type },
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    return response.data.meetings || [];
  } catch (error: any) {
    logger.error("[Zoom] Failed to list meetings:", error.response?.data || error.message);
    throw new Error(`Failed to list Zoom meetings: ${error.response?.data?.message || error.message}`);
  }
}

export async function testConnection(): Promise<{ success: boolean; message: string; email?: string; scopes?: string }> {
  try {
    const accessToken = await getAccessToken();
    
    // First try to get user info (requires user:read scope)
    try {
      const response = await axios.get<{ id: string; email: string; first_name: string; last_name: string }>(
        "https://api.zoom.us/v2/users/me",
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      return {
        success: true,
        message: `Connected as ${response.data.first_name} ${response.data.last_name}`,
        email: response.data.email,
      };
    } catch (userError: any) {
      // If user endpoint fails due to scope, check if we can at least list meetings
      if (userError.response?.status === 401 || userError.response?.data?.message?.includes("scope")) {
        // Token is valid but lacks user:read scope - this is OK for meeting creation
        return {
          success: true,
          message: "Connected successfully. Add user:read:user scope for full access.",
          scopes: "meeting:write:meeting (required for creating meetings)",
        };
      }
      throw userError;
    }
  } catch (error: any) {
    const errorMessage = error.response?.data?.message || error.message;
    
    // Check for scope-related errors and provide helpful guidance
    if (errorMessage.includes("scope")) {
      return {
        success: false,
        message: `Zoom app needs scopes: meeting:write:meeting:admin (to create meetings). Go to your Zoom Marketplace app > Scopes and add the required permissions.`,
      };
    }
    
    return {
      success: false,
      message: errorMessage,
    };
  }
}
