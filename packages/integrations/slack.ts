/**
 * Slack Integration for HRIQ
 *
 * Handles:
 * - Including workspace invite link in onboarding emails
 * - Posting new hire notifications to channels
 *
 * Requires env vars:
 *   SLACK_BOT_TOKEN - Bot token (xoxb-...) for posting messages
 *   SLACK_INVITE_LINK - Shared workspace invite URL from Slack settings
 *   SLACK_NEW_HIRE_CHANNEL - Channel ID for new hire notifications (optional)
 *   SLACK_WORKSPACE_URL - Workspace URL for display in emails (optional)
 */

const SLACK_API = "https://slack.com/api";

function getSlackToken(): string {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) throw new Error("SLACK_BOT_TOKEN not configured");
  return token;
}

//  Types 

export interface SlackInviteResult {
  success: boolean;
  email: string;
  method: string;
  inviteLink?: string;
  error?: string;
}

export interface SlackMessageResult {
  success: boolean;
  channel?: string;
  ts?: string;
  error?: string;
}

//  Invite User to Slack Workspace 

/**
 * "Invite" a user to Slack by returning the shared invite link.
 * The actual invite link is included in the welcome email so they can self-join.
 * 
 * API-based invites (admin.users.invite) require Business+ or Enterprise Grid,
 * so we use a shared link approach for Pro/Free workspaces.
 */
export async function inviteToSlack(
  email: string,
  opts?: {
    realName?: string;
  }
): Promise<SlackInviteResult> {
  const inviteLink = process.env.SLACK_INVITE_LINK;

  if (inviteLink) {
    console.log(`[Slack] Invite link will be included in welcome email for ${email}`);
    return { success: true, email, method: "invite_link", inviteLink };
  }

  // Fallback: try API invite in case workspace is on Business+
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    return { success: false, email, method: "none", error: "No SLACK_BOT_TOKEN or SLACK_INVITE_LINK configured" };
  }

  // Try admin.users.invite (Business+ / Enterprise Grid only)
  try {
    const res = await fetch(`${SLACK_API}/admin.users.invite`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({ email: email.toLowerCase() }),
    });

    const json = await res.json();
    if (json.ok) {
      console.log(`[Slack] Invited ${email} via admin.users.invite`);
      return { success: true, email, method: "admin.users.invite" };
    }
    if (json.error === "already_in_team" || json.error === "already_invited") {
      console.log(`[Slack] ${email} already in workspace`);
      return { success: true, email, method: "already_in_team" };
    }
    console.warn(`[Slack] API invite unavailable for ${email}: ${json.error}. Set SLACK_INVITE_LINK env var for link-based invites.`);
    return { success: false, email, method: "api_failed", error: json.error };
  } catch (err: any) {
    console.error(`[Slack] Invite error for ${email}:`, err.message);
    return { success: false, email, method: "error", error: err.message };
  }
}

//  Post Message to Channel 

/**
 * Post a message to a Slack channel.
 */
export async function postSlackMessage(
  channel: string,
  text: string,
  opts?: {
    blocks?: any[];
    unfurl_links?: boolean;
  }
): Promise<SlackMessageResult> {
  const token = getSlackToken();

  try {
    const body: Record<string, any> = {
      channel,
      text,
      unfurl_links: opts?.unfurl_links ?? false,
    };
    if (opts?.blocks) body.blocks = opts.blocks;

    const res = await fetch(`${SLACK_API}/chat.postMessage`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(body),
    });

    const json = await res.json();
    if (!json.ok) {
      console.error(`[Slack] postMessage failed: ${json.error}`);
      return { success: false, error: json.error };
    }

    return { success: true, channel: json.channel, ts: json.ts };
  } catch (err: any) {
    console.error(`[Slack] postMessage exception:`, err.message);
    return { success: false, error: err.message };
  }
}

//  Post New Hire Announcement 

/**
 * Post a formatted new hire announcement to the configured channel.
 */
export async function announceNewHire(
  name: string,
  details: {
    jobTitle?: string;
    startDate?: string;
    organization?: string;
    email?: string;
  }
): Promise<SlackMessageResult> {
  const channel = process.env.SLACK_NEW_HIRE_CHANNEL;
  if (!channel) {
    console.warn("[Slack] SLACK_NEW_HIRE_CHANNEL not configured, skipping announcement");
    return { success: false, error: "No channel configured" };
  }

  const lines = [` *New Team Member: ${name}*`];
  if (details.jobTitle) lines.push(`> *Role:* ${details.jobTitle}`);
  if (details.organization) lines.push(`> *Client:* ${details.organization}`);
  if (details.startDate) lines.push(`> *Start Date:* ${details.startDate}`);
  lines.push("\nPlease welcome them to the team! ");

  return postSlackMessage(channel, lines.join("\n"));
}

