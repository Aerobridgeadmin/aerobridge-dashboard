"use server";

import { requireSession } from "@repo/auth/session";
import { database } from "@repo/database";
import { GoogleAuth } from "google-auth-library";
import { APP_URL, normalizeAppUrl, PACIFIC_TIMEZONE, DEFAULT_PASSWORD } from "./constants";
import { pacificToUtc, smartParseDatetime } from "@/lib/hriq/format";
import { HriqError } from "@/lib/hriq/errors";
import { buildEmail } from "./email-template-engine";

type CalendarInvite = {
  startIso: string;
  endIso: string;
  summary: string;
  description: string;
  location?: string;
};

// ─── Gmail Rate Limiter ───────────────────────────────────────────────────────
// Gmail API has a per-second rate limit. When sending batch emails (payroll,
// paystubs), we throttle to ~2 emails/sec to avoid 429 errors.
const GMAIL_MIN_INTERVAL_MS = 500; // 500ms between sends = max 2/sec
let lastGmailSendAt = 0;

async function gmailRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastGmailSendAt;
  if (elapsed < GMAIL_MIN_INTERVAL_MS) {
    await new Promise((r) => setTimeout(r, GMAIL_MIN_INTERVAL_MS - elapsed));
  }
  lastGmailSendAt = Date.now();
}

/** Send a Gmail API request with exponential backoff retry on 429 */
async function gmailSendWithRetry(encoded: string, token: string, maxRetries = 3): Promise<void> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    await gmailRateLimit();
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ raw: encoded }),
    });

    if (res.ok) return;

    const errText = await res.text();
    if (res.status === 429 && attempt < maxRetries) {
      // Exponential backoff: 2s, 4s, 8s
      const delay = Math.pow(2, attempt + 1) * 1000;
      console.warn(`[send-email] Gmail 429 — retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }

    console.error(`[send-email] Gmail API error ${res.status}:`, errText.slice(0, 300));
    throw new HriqError("HRIQ-1702", `Gmail API error ${res.status}: ${errText.slice(0, 500)}`);
  }
}

function toIcsDate(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    throw new HriqError("HRIQ-1704", `Invalid ISO date for calendar invite: ${isoDate}`);
  }
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function buildIcsContent(invite: CalendarInvite): string {
  const now = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const uid = `${Date.now()}@remoteleverage.com`;
  const esc = (value: string) =>
    value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Remote Leverage//Onboarding//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${toIcsDate(invite.startIso)}`,
    `DTEND:${toIcsDate(invite.endIso)}`,
    `SUMMARY:${esc(invite.summary)}`,
    `DESCRIPTION:${esc(invite.description)}`,
    `LOCATION:${esc(invite.location ?? "")}`,
    "STATUS:CONFIRMED",
    "SEQUENCE:0",
    "END:VEVENT",
    "END:VCALENDAR",
    ""].join("\r\n");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeJsonObjectString(raw: string): string {
  const trimmed = raw.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return trimmed;
  }
  return trimmed.slice(start, end + 1);
}

export async function isEmailConfigured(): Promise<boolean> {
  await requireSession();
  return !!(readEnv("GOOGLE_SERVICE_ACCOUNT_KEY") && readEnv("GOOGLE_SENDER_EMAIL"));
}

export async function getAvailableSenders(): Promise<string[]> {
  await requireSession();

  // 1. Try Google Workspace Directory API — lists all active users in the domain.
  //    Requires the service account to have domain-wide delegation with scope:
  //    https://www.googleapis.com/auth/admin.directory.user.readonly
  const keyStr = readEnv("GOOGLE_SERVICE_ACCOUNT_KEY");
  const defaultSender = readEnv("GOOGLE_SENDER_EMAIL")?.trim() ?? "admin@remoteleverage.com";
  const domain = process.env.GOOGLE_WORKSPACE_DOMAIN ?? "remoteleverage.com";

  if (keyStr) {
    try {
      const keyJson = JSON.parse(normalizeJsonObjectString(keyStr));
      const auth = new GoogleAuth({
        credentials: { client_email: keyJson.client_email, private_key: keyJson.private_key },
        scopes: ["https://www.googleapis.com/auth/admin.directory.user.readonly"],
        clientOptions: { subject: defaultSender }, // must be a super-admin
      });
      const token = await auth.getAccessToken();

      const res = await fetch(
        `https://admin.googleapis.com/admin/directory/v1/users?domain=${domain}&maxResults=100&orderBy=email&projection=basic&query=isAdmin=false OR isAdmin=true`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (res.ok) {
        const data = await res.json();
        const emails: string[] = (data.users ?? [])
          .filter((u: { suspended?: boolean; archived?: boolean }) => !u.suspended && !u.archived)
          .map((u: { primaryEmail: string }) => u.primaryEmail)
          .sort((a: string, b: string) => a.localeCompare(b));

        if (emails.length > 0) return emails;
      } else {
        const errText = await res.text().catch(() => "");
        console.warn(`[HRIQ] Directory API failed (${res.status}): ${errText.slice(0, 200)}`);
        console.warn("[HRIQ] To enable workspace sender list, grant domain-wide delegation scope: https://www.googleapis.com/auth/admin.directory.user.readonly");
      }
    } catch {
      // Directory API not enabled or scope not granted — fall through to env var
    }
  }

  // 2. Fallback: GOOGLE_SENDER_EMAILS comma-separated list in env
  const envSenders = process.env.GOOGLE_SENDER_EMAILS ?? process.env.GOOGLE_SENDER_EMAIL ?? "";
  const list = envSenders.split(",").map((s) => s.trim()).filter(Boolean);
  return list.length > 0 ? list : [defaultSender];
}


type EmailAttachment = {
  filename: string;
  content: Buffer;
  mimeType: string;
};

export async function sendViaGmail(
  to: string,
  subject: string,
  htmlBody: string,
  from?: string,
  calendarInvite?: CalendarInvite,
  attachments?: EmailAttachment[],
  replyTo?: string,
) {
  try {
    const session = await requireSession();
    const keyStr = readEnv("GOOGLE_SERVICE_ACCOUNT_KEY");
    const defaultSender = readEnv("GOOGLE_SENDER_EMAIL");
    const senderEmail = (from ?? defaultSender)?.trim();

    if (!keyStr || !senderEmail) {
      throw new HriqError("HRIQ-1701");
    }

    // Auto-set Reply-To from logged-in user's email if not explicitly provided
    // Display name is always "Remote Leverage" — the admin's email is the actual reply target
    const effectiveReplyTo = replyTo ?? (session.email
      ? `Remote Leverage <${session.email}>`
      : undefined);

    const keyJson = JSON.parse(normalizeJsonObjectString(keyStr));

    const auth = new GoogleAuth({
      credentials: { client_email: keyJson.client_email, private_key: keyJson.private_key },
      scopes: ["https://www.googleapis.com/auth/gmail.send"],
      clientOptions: { subject: senderEmail },
    });

    const client = await auth.getClient();
    const token = await client.getAccessToken();

    const boundary = `boundary_${Date.now()}`;
    const altBoundary = `alt_${Date.now()}`;

    // RFC 2047 encode subject if it contains non-ASCII characters (emoji, accents, etc.)
    const encodedSubject = /[^\x00-\x7F]/.test(subject)
      ? `=?UTF-8?B?${Buffer.from(subject, "utf-8").toString("base64")}?=`
      : subject;

    const parts: string[] = [
      `From: Remote Leverage <${senderEmail}>`,
      `To: ${to}`,
      ...(effectiveReplyTo ? [`Reply-To: ${effectiveReplyTo}`] : []),
      `Subject: ${encodedSubject}`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/related; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
      "",
      `--${altBoundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from(htmlBody, "utf-8").toString("base64").replace(/(.{76})/g, "$1\r\n"),
      "",
      `--${altBoundary}--`];


    if (calendarInvite) {
      const ics = buildIcsContent(calendarInvite);
      parts.push(
        `--${boundary}`,
        'Content-Type: text/calendar; method=REQUEST; charset="UTF-8"',
        'Content-Disposition: attachment; filename="remote-leverage-onboarding.ics"',
        "Content-Transfer-Encoding: 7bit",
        "",
        ics,
      );
    }

    if (attachments?.length) {
      for (const att of attachments) {
        parts.push(
          `--${boundary}`,
          `Content-Type: ${att.mimeType}; name="${att.filename}"`,
          `Content-Disposition: attachment; filename="${att.filename}"`,
          "Content-Transfer-Encoding: base64",
          "",
          att.content.toString("base64").replace(/(.{76})/g, "$1\r\n"),
        );
      }
    }

    parts.push(`--${boundary}--`);

    const rawEmail = parts.join("\r\n");
    const encoded = Buffer.from(rawEmail).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

    // Throttle + retry on 429
    await gmailSendWithRetry(encoded, token.token!);

    return { success: true };
  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[send-email.ts:sendViaGmail] FAILED to send email to:", to, "error:", _msg);
    throw err;
  }
}

/**
 * System-level email send for cron jobs and background tasks.
 * Does NOT require an authenticated session.
 */
export async function sendViaGmailSystem(
  to: string,
  subject: string,
  htmlBody: string,
  attachments?: EmailAttachment[],
) {
  try {
    const keyStr = readEnv("GOOGLE_SERVICE_ACCOUNT_KEY");
    const senderEmail = readEnv("GOOGLE_SENDER_EMAIL")?.trim();

    if (!keyStr || !senderEmail) {
      throw new HriqError("HRIQ-1701");
    }

    const keyJson = JSON.parse(normalizeJsonObjectString(keyStr));

    const auth = new GoogleAuth({
      credentials: { client_email: keyJson.client_email, private_key: keyJson.private_key },
      scopes: ["https://www.googleapis.com/auth/gmail.send"],
      clientOptions: { subject: senderEmail },
    });

    const client = await auth.getClient();
    const token = await client.getAccessToken();

    const encodedSubject = /[^\x00-\x7F]/.test(subject)
      ? `=?UTF-8?B?${Buffer.from(subject, "utf-8").toString("base64")}?=`
      : subject;

    const boundary = `boundary_${Date.now()}`;
    const altBoundary = `alt_${Date.now()}`;

    const parts: string[] = [
      `From: Remote Leverage <${senderEmail}>`,
      `To: ${to}`,
      `Subject: ${encodedSubject}`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/related; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
      "",
      `--${altBoundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from(htmlBody, "utf-8").toString("base64").replace(/(.{76})/g, "$1\r\n"),
      "",
      `--${altBoundary}--`];

    if (attachments?.length) {
      for (const att of attachments) {
        parts.push(
          `--${boundary}`,
          `Content-Type: ${att.mimeType}; name="${att.filename}"`,
          `Content-Disposition: attachment; filename="${att.filename}"`,
          "Content-Transfer-Encoding: base64",
          "",
          att.content.toString("base64").replace(/(.{76})/g, "$1\r\n"),
        );
      }
    }

    parts.push(`--${boundary}--`);

    const rawEmail = parts.join("\r\n");

    const encoded = Buffer.from(rawEmail).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

    // Throttle + retry on 429
    await gmailSendWithRetry(encoded, token.token!);

    return { success: true };
  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[send-email.ts:sendViaGmailSystem] FAILED to send email to:", to, "error:", _msg);
    throw err;
  }
}

export async function sendOrgAdminInviteEmail(email: string, orgName: string, adminName?: string, from?: string) {
  await requireSession();
  const { adminInviteEmail } = await import("@/app/actions/hriq/email-templates");
  const emp = await database.employee.findFirst({
    where: { OR: [{ workEmail: { equals: email, mode: "insensitive" } }, { personalEmail: { equals: email, mode: "insensitive" } }] },
    select: { username: true },
  });
  const fallbackSubject = `You've been invited to manage ${orgName} on Remote Leverage`;
  const fallbackHtml = adminInviteEmail(adminName ?? "", orgName, emp?.username ?? undefined);
  const rendered = await buildEmail("org_admin_invite", { admin_name: adminName ?? "", org_name: orgName, email, username: emp?.username ?? email, password: DEFAULT_PASSWORD, login_url: normalizeAppUrl(APP_URL) + "/sign-in" }, fallbackHtml, fallbackSubject);
  await sendViaGmail(email, rendered.subject, rendered.html, from);
}

/** System-level org admin invite — does NOT require a user session. Used by automated flows (payment callbacks, external onboarding completion). */
export async function sendOrgAdminInviteEmailSystem(email: string, orgName: string, adminName?: string) {
  const { adminInviteEmail } = await import("@/app/actions/hriq/email-templates");
  const emp = await database.employee.findFirst({
    where: { OR: [{ workEmail: { equals: email, mode: "insensitive" } }, { personalEmail: { equals: email, mode: "insensitive" } }] },
    select: { username: true },
  });
  const fallbackSubject = `You've been invited to manage ${orgName} on Remote Leverage`;
  const fallbackHtml = adminInviteEmail(adminName ?? "", orgName, emp?.username ?? undefined);
  const rendered = await buildEmail("org_admin_invite", { admin_name: adminName ?? "", org_name: orgName, email, username: emp?.username ?? email, password: DEFAULT_PASSWORD, login_url: normalizeAppUrl(APP_URL) + "/sign-in" }, fallbackHtml, fallbackSubject);
  await sendViaGmailSystem(email, rendered.subject, rendered.html);
}

const ROLE_DISPLAY: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  manager: "Manager",
  va: "Virtual Assistant",
  member: "Member",
};

export async function sendTeamInviteEmail(email: string, role: string, name?: string, from?: string) {
  await requireSession();
  const safeRole = ROLE_DISPLAY[role] ?? role;
  const { teamInviteEmail } = await import("@/app/actions/hriq/email-templates");
  const emp = await database.employee.findFirst({
    where: { OR: [{ workEmail: { equals: email, mode: "insensitive" } }, { personalEmail: { equals: email, mode: "insensitive" } }] },
    select: { username: true },
  });
  const fallbackSubject = "You've been invited to Remote Leverage";
  const fallbackHtml = teamInviteEmail(name ?? "", safeRole, emp?.username ?? undefined);
  const rendered = await buildEmail("team_invite", { name: name ?? "", role: safeRole, username: emp?.username ?? email, password: DEFAULT_PASSWORD, login_url: normalizeAppUrl(APP_URL) + "/sign-in" }, fallbackHtml, fallbackSubject);
  await sendViaGmail(email, rendered.subject, rendered.html, from);
}

export async function sendOnboardingEmail(
  email: string,
  contractorName: string,
  details: {
    employeeId?: string;
    zoomLink?: string;
    zoomDate?: string;
    zoomDuration?: number;
    formLinks?: { name: string; url: string }[];
    onboardingData?: { payRate?: string; currency?: string; startDate?: string; jobTitle?: string };
    timeDoctorEmail?: string;
    slackEmail?: string;
    slackInviteLink?: string;
    paymentSetupType?: "stripe" | "wise" | "both" | "cadana" | "none";
  },
  from?: string
) {
  await requireSession();
  const appUrl = normalizeAppUrl(APP_URL);
  // Use selfServiceToken for contractor info URL (IDOR fix)
  let contractorInfoUrl = "";
  if (details.employeeId) {
    const { ensureSelfServiceToken } = await import("@/lib/hriq/utils");
    const sst = await ensureSelfServiceToken(details.employeeId);
    contractorInfoUrl = `${appUrl}/contractor-info/${sst}`;
  }
  const safeName = escapeHtml(contractorName);
  const safeStartDate = (() => {
    const raw = details.onboardingData?.startDate?.trim();
    if (!raw) return "TBD";
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return escapeHtml(raw);
    return escapeHtml(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "UTC",
        month: "long",
        day: "numeric",
        year: "numeric",
      }).format(parsed)
    );
  })();
  const safeZoomDate = (() => {
    if (!details.zoomDate) return "";
    const parsed = smartParseDatetime(details.zoomDate);
    const label = Number.isNaN(parsed.getTime())
      ? details.zoomDate
      : `${new Intl.DateTimeFormat("en-US", {
          timeZone: PACIFIC_TIMEZONE,
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZoneName: "short",
        }).format(parsed)} (Pacific Time)`;
    return escapeHtml(label);
  })();

  const calendarInvite = (() => {
    if (!details.zoomLink || !details.zoomDate) return undefined;
    const start = smartParseDatetime(details.zoomDate);
    if (Number.isNaN(start.getTime())) return undefined;
    const durationMs = (details.zoomDuration ?? 60) * 60 * 1000;
    const end = new Date(start.getTime() + durationMs);
    return {
      startIso: start.toISOString(),
      endIso: end.toISOString(),
      summary: "Remote Leverage Onboarding",
      description: `Join Zoom Meeting: ${details.zoomLink}`,
      location: details.zoomLink,
    } satisfies CalendarInvite;
  })();

  const { welcomeEmail: buildWelcomeEmail } = await import("@/app/actions/hriq/email-templates");

  // Dashboard credentials are no longer included in the welcome email.
  // They are sent separately when the super admin approves the contractor's info submission.

  const welcomeHtml = buildWelcomeEmail(safeName, safeStartDate, {
    contractorInfoUrl: contractorInfoUrl || undefined,
    zoomLink: details.zoomLink,
    zoomDate: safeZoomDate || undefined,
    payRate: details.onboardingData?.payRate?.trim(),
    currency: details.onboardingData?.currency?.trim() || "USD",
    formLinks: details.formLinks,
    bookkeepingEmails: process.env.BOOKKEEPING_EMAILS ?? "bookkeeping@remoteleverage.com",
    timeDoctorEmail: details.timeDoctorEmail,
    slackEmail: details.slackEmail,
    slackInviteLink: details.slackInviteLink || undefined,
    slackWorkspaceUrl: process.env.SLACK_WORKSPACE_URL || undefined,
    paymentSetupType: details.paymentSetupType || undefined,
  });

  const payRateStr = details.onboardingData?.payRate?.trim();
  const currencyStr = details.onboardingData?.currency?.trim() || "USD";
  const formattedRate = payRateStr ? `$${payRateStr.replace(/^\$/, "")}/hr ${currencyStr}` : "";
  const zoomSection = details.zoomLink && safeZoomDate
    ? `<br/><br/><div style="margin-top:12px;padding-top:12px;border-top:1px solid #1e2444;"><div style="font-size:13px;font-weight:700;color:#f0f4ff;margin-bottom:8px;">Zoom Orientation</div><div style="font-size:13px;color:#dde2f0;line-height:1.5;margin-bottom:10px;">Scheduled for <strong>${safeZoomDate}</strong>.</div><a href="${details.zoomLink}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:700;">Join Zoom Meeting</a></div>`
    : details.zoomLink
    ? `<br/><br/><div style="margin-top:12px;padding-top:12px;border-top:1px solid #1e2444;"><div style="font-size:13px;font-weight:700;color:#f0f4ff;margin-bottom:8px;">Zoom Orientation</div><div style="font-size:13px;color:#dde2f0;line-height:1.5;margin-bottom:10px;">Your orientation meeting is ready.</div><a href="${details.zoomLink}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:700;">Join Zoom Meeting</a></div>`
    : "";
  const docLinksHtml = details.formLinks?.map(f => `<a href="${f.url}" style="display:inline-block;width:100%;box-sizing:border-box;border:1px solid #1e2444;border-radius:8px;padding:10px 14px;text-decoration:none;color:#f0f4ff;font-size:13px;font-weight:600;background:#12162b;margin-bottom:8px;">${escapeHtml(f.name)} →</a>`).join("") ?? "";
  const slackJoinHtml = details.slackInviteLink ? `<a href="${details.slackInviteLink}" style="display:inline-block;background:#4A154B;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:700;margin-bottom:8px;">Join Slack Workspace</a><br/><div style="font-size:11px;color:#b45309;font-weight:600;margin-bottom:12px;">This is a one-time use link. It will expire after you join.</div>` : "";
  const slackWsUrl = process.env.SLACK_WORKSPACE_URL || "https://remoteleverageva.slack.com";

  const fallbackSubject = "Welcome to Remote Leverage — Your Dashboard & Onboarding";
  const rendered = await buildEmail("welcome_email", {
    name: safeName,
    start_date: safeStartDate,
    pay_rate: formattedRate,
    zoom_section: zoomSection,
    document_links: docLinksHtml,
    td_email: details.timeDoctorEmail ?? "",
    slack_email: details.slackEmail ?? "",
    slack_workspace_url: slackWsUrl,
    slack_join_button: slackJoinHtml,
    contractor_info_url: contractorInfoUrl || "",
    email: "",
    password: "",
    username: "",
    login_url: normalizeAppUrl(APP_URL),
  }, welcomeHtml, fallbackSubject);

  await sendViaGmail(email, rendered.subject, rendered.html, from, calendarInvite);
}

export async function sendZoomHostNotificationEmail(
  hostEmail: string,
  details: {
    meetingTitle: string;
    meetingDate: string;
    duration: number;
    startUrl: string;
    joinUrl: string;
    attendeeNames?: string[];
  },
  from?: string
) {
  await requireSession();
  const safeMeetingDate = (() => {
    const parsed = smartParseDatetime(details.meetingDate);
    if (Number.isNaN(parsed.getTime())) return escapeHtml(details.meetingDate);
    return escapeHtml(
      new Intl.DateTimeFormat("en-US", {
        timeZone: PACIFIC_TIMEZONE,
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      }).format(parsed)
    );
  })();

  const start = smartParseDatetime(details.meetingDate);
  const calendarInvite = !Number.isNaN(start.getTime())
    ? {
        startIso: start.toISOString(),
        endIso: new Date(start.getTime() + details.duration * 60 * 1000).toISOString(),
        summary: `[Host] ${details.meetingTitle}`,
        description: `You are the host for this meeting.\n\nStart URL: ${details.startUrl}\nJoin URL: ${details.joinUrl}`,
        location: details.joinUrl,
      } satisfies CalendarInvite
    : undefined;

  const { zoomHostEmail } = await import("@/app/actions/hriq/email-templates");
  const fallbackHtml = zoomHostEmail(details.meetingTitle, safeMeetingDate, details.duration, details.startUrl, details.joinUrl, details.attendeeNames);
  const fallbackSubject = `Zoom Meeting Created: ${details.meetingTitle}`;
  const rendered = await buildEmail("zoom_host_notification", { meeting_title: details.meetingTitle, meeting_date: safeMeetingDate, duration: String(details.duration), start_url: details.startUrl, join_url: details.joinUrl }, fallbackHtml, fallbackSubject);
  await sendViaGmail(hostEmail, rendered.subject, rendered.html, from, calendarInvite);
}

export async function sendZoomCancellationEmail(
  email: string,
  contractorName: string,
  details: {
    meetingDate?: string;
    reason?: string;
  },
  from?: string
) {
  const safeMeetingDate = (() => {
    if (!details.meetingDate) return undefined;
    const parsed = smartParseDatetime(details.meetingDate);
    if (Number.isNaN(parsed.getTime())) return details.meetingDate;
    return new Intl.DateTimeFormat("en-US", {
      timeZone: PACIFIC_TIMEZONE,
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(parsed);
  })();

  const { zoomCancellationEmail } = await import("@/app/actions/hriq/email-templates");
  const fallbackHtml = zoomCancellationEmail(contractorName, safeMeetingDate, details.reason);
  const fallbackSubject = "Zoom Orientation Cancelled — Remote Leverage";
  const meetingDateText = safeMeetingDate ? ` scheduled for <strong>${safeMeetingDate}</strong>` : "";
  const reasonText = details.reason ? ` <strong>Reason:</strong> ${details.reason}` : "";
  const rendered = await buildEmail("zoom_cancellation", { name: contractorName, meeting_date_text: meetingDateText, reason_text: reasonText }, fallbackHtml, fallbackSubject);
  await sendViaGmail(email, rendered.subject, rendered.html, from);
}

export async function sendPaymentNotificationEmail(email: string, name: string, amount: string, currency: string, paymentType: string, from?: string) {
  await requireSession();
  const { paymentNotificationEmail } = await import("@/app/actions/hriq/email-templates");
  const fallbackHtml = paymentNotificationEmail(name, amount, currency, paymentType);
  const fallbackSubject = `Payment Processed — $${amount} ${currency}`;
  const rendered = await buildEmail("payment_processed", { name, amount, currency, payment_type: paymentType, date: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }), dashboard_url: normalizeAppUrl(APP_URL) }, fallbackHtml, fallbackSubject);
  await sendViaGmail(email, rendered.subject, rendered.html, from);
}

export async function sendTaskAssignmentEmail(email: string, name: string, taskTitle: string, dueDate?: string, from?: string) {
  await requireSession();
  const { taskAssignmentEmail } = await import("@/app/actions/hriq/email-templates");
  const fallbackHtml = taskAssignmentEmail(name, taskTitle, dueDate);
  const fallbackSubject = `New Task: ${taskTitle}`;
  const rendered = await buildEmail("task_assignment", { name, task_title: taskTitle, due_date: dueDate ?? "No due date", dashboard_url: normalizeAppUrl(APP_URL) }, fallbackHtml, fallbackSubject);
  await sendViaGmail(email, rendered.subject, rendered.html, from);
}

//  Document Notification Emails 

/** Notify admin that a document was signed (called from webhook — no session) */
export async function sendDocumentSignedAdminEmailSystem(
  adminEmail: string,
  contractorName: string,
  documentName: string,
) {
  const { documentSignedAdminEmail } = await import("@/app/actions/hriq/email-templates");
  const appUrl = normalizeAppUrl(APP_URL);
  const fallbackHtml = documentSignedAdminEmail(contractorName, documentName, appUrl);
  const fallbackSubject = `Document Signed: ${documentName} — ${contractorName}`;
  const rendered = await buildEmail("document_signed_admin", { contractor_name: contractorName, document_name: documentName, dashboard_url: appUrl }, fallbackHtml, fallbackSubject);
  await sendViaGmailSystem(adminEmail, rendered.subject, rendered.html);
}

/** Notify admin that all onboarding forms are signed (called from webhook — no session) */
export async function sendAllFormsSignedAdminEmailSystem(
  adminEmail: string,
  contractorName: string,
  formCount: number,
) {
  const { allFormsSignedAdminEmail } = await import("@/app/actions/hriq/email-templates");
  const appUrl = normalizeAppUrl(APP_URL);
  const fallbackHtml = allFormsSignedAdminEmail(contractorName, formCount, appUrl);
  const fallbackSubject = `All Onboarding Forms Signed — ${contractorName}`;
  const rendered = await buildEmail("all_forms_signed_admin", { contractor_name: contractorName, form_count: String(formCount), dashboard_url: appUrl }, fallbackHtml, fallbackSubject);
  await sendViaGmailSystem(adminEmail, rendered.subject, rendered.html);
}

/** Notify admin that a contractor uploaded a document (called from contractor self-service) */
export async function sendDocumentUploadedAdminEmailSystem(
  adminEmail: string,
  contractorName: string,
  documentName: string,
  documentType: string,
) {
  const { documentUploadedAdminEmail } = await import("@/app/actions/hriq/email-templates");
  const appUrl = normalizeAppUrl(APP_URL);
  const fallbackHtml = documentUploadedAdminEmail(contractorName, documentName, documentType, appUrl);
  const fallbackSubject = `New Document Uploaded — ${contractorName}`;
  const rendered = await buildEmail("document_uploaded_admin", { contractor_name: contractorName, document_name: documentName, document_type: documentType.replace(/_/g, " "), dashboard_url: appUrl }, fallbackHtml, fallbackSubject);
  await sendViaGmailSystem(adminEmail, rendered.subject, rendered.html);
}

/** Notify contractor that their document was verified */
export async function sendDocumentVerifiedEmail(email: string, contractorName: string, documentName: string, from?: string) {
  await requireSession();
  const { documentVerifiedEmail } = await import("@/app/actions/hriq/email-templates");
  const appUrl = normalizeAppUrl(APP_URL);
  const fallbackHtml = documentVerifiedEmail(contractorName, documentName, appUrl);
  const fallbackSubject = `Document Verified: ${documentName}`;
  const rendered = await buildEmail("document_verified", { name: contractorName, document_name: documentName, dashboard_url: appUrl }, fallbackHtml, fallbackSubject);
  await sendViaGmail(email, rendered.subject, rendered.html, from);
}

/** Notify contractor that their document was rejected */
/** Notify contractor their onboarding has been rescheduled. */
export async function sendRescheduleEmail(
  email: string,
  contractorName: string,
  details: {
    newStartDate: string;
    newZoomDate?: string;
    orgName?: string;
  },
) {
  await requireSession();
  const safeStartDate = (() => {
    const parsed = new Date(details.newStartDate as any);
    if (Number.isNaN(parsed.getTime())) return escapeHtml(details.newStartDate);
    return escapeHtml(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "UTC",
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      }).format(parsed)
    );
  })();

  const safeZoomDate = details.newZoomDate
    ? (() => {
        const parsed = pacificToUtc(details.newZoomDate);
        if (Number.isNaN(parsed.getTime())) return undefined;
        return escapeHtml(
          new Intl.DateTimeFormat("en-US", {
            timeZone: PACIFIC_TIMEZONE,
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
            timeZoneName: "short",
          }).format(parsed)
        );
      })()
    : undefined;

  const { rescheduleEmail } = await import("@/app/actions/hriq/email-templates");
  const html = rescheduleEmail(escapeHtml(contractorName), safeStartDate, safeZoomDate, details.orgName);
  const subject = details.orgName
    ? `Schedule Update — ${details.orgName}`
    : "Schedule Update — Remote Leverage";
  const zoomDateRow = safeZoomDate ? `<br/><strong>New Orientation Date:</strong> ${safeZoomDate}` : "";
  const rendered = await buildEmail("reschedule_notice", { name: escapeHtml(contractorName), org_name: details.orgName ?? "Remote Leverage", start_date: safeStartDate, zoom_date_row: zoomDateRow, dashboard_url: normalizeAppUrl(APP_URL) }, html, subject);
  await sendViaGmail(email, rendered.subject, rendered.html);
}

/** Client-branded onboarding email — includes Time Doctor, dashboard login, contractor info. */
export async function sendClientOnboardingEmail(
  email: string,
  contractorName: string,
  orgName: string,
  details: {
    employeeId?: string;
    onboardingData?: { payRate?: string; currency?: string; startDate?: string; jobTitle?: string };
    documentNames?: string[];
    bodyText?: string;
    paymentSetupType?: "stripe" | "wise" | "both" | "cadana" | "none";
    timeDoctorEmail?: string;
    dashboardCredentials?: { email: string; password: string; username?: string; loginUrl: string };
  },
  from?: string
) {
  await requireSession();
  const appUrl = normalizeAppUrl(APP_URL);
  // Use selfServiceToken for contractor info URL (IDOR fix)
  let contractorInfoUrl = "";
  if (details.employeeId) {
    const { ensureSelfServiceToken } = await import("@/lib/hriq/utils");
    const sst = await ensureSelfServiceToken(details.employeeId);
    contractorInfoUrl = `${appUrl}/contractor-info/${sst}`;
  }
  const safeName = escapeHtml(contractorName);
  const safeStartDate = (() => {
    const raw = details.onboardingData?.startDate?.trim();
    if (!raw) return "TBD";
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return escapeHtml(raw);
    return escapeHtml(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "UTC",
        month: "long",
        day: "numeric",
        year: "numeric",
      }).format(parsed)
    );
  })();

  const { clientWelcomeEmail } = await import("@/app/actions/hriq/email-templates");

  const html = clientWelcomeEmail(safeName, safeStartDate, orgName, {
    contractorInfoUrl: contractorInfoUrl || undefined,
    payRate: details.onboardingData?.payRate?.trim(),
    currency: details.onboardingData?.currency?.trim() || "USD",
    documentNames: details.documentNames,
    bodyText: details.bodyText,
    paymentSetupType: details.paymentSetupType || undefined,
    timeDoctorEmail: details.timeDoctorEmail,
    dashboardCredentials: details.dashboardCredentials,
  });

  const fallbackSubject = `Welcome to ${orgName} — Onboarding`;
  const payRateStr = details.onboardingData?.payRate?.trim();
  const currStr = details.onboardingData?.currency?.trim() || "USD";
  const creds = details.dashboardCredentials;
  const rendered = await buildEmail("client_welcome_onboarding", {
    name: safeName, start_date: safeStartDate, org_name: orgName,
    pay_rate: payRateStr ? `$${payRateStr.replace(/^\$/, "")}/hr ${currStr}` : "",
    body_text: details.bodyText ?? "",
    documents_section: details.documentNames?.map((n, i) => `${i + 1}. ${n}`).join("<br/>") ?? "",
    contractor_info_url: contractorInfoUrl || "",
    td_email: details.timeDoctorEmail ?? "",
    login_url: creds?.loginUrl ?? appUrl,
    username: creds?.username ?? creds?.email ?? "",
    password: creds?.password ?? "",
  }, html, fallbackSubject);

  await sendViaGmail(email, rendered.subject, rendered.html, from);
}

export async function sendDocumentRejectedEmail(email: string, contractorName: string, documentName: string, reason?: string, from?: string) {
  await requireSession();
  const { documentRejectedEmail } = await import("@/app/actions/hriq/email-templates");
  const appUrl = normalizeAppUrl(APP_URL);
  const fallbackHtml = documentRejectedEmail(contractorName, documentName, reason, appUrl);
  const fallbackSubject = `Document Needs Attention: ${documentName}`;
  const rendered = await buildEmail("document_rejected", { name: contractorName, document_name: documentName, reason: reason ?? "", dashboard_url: appUrl }, fallbackHtml, fallbackSubject);
  await sendViaGmail(email, rendered.subject, rendered.html, from);
}

/** Send KYC verification email to client org admin (requires active session). */
export async function sendClientKycEmail(email: string, adminName: string, orgName: string, verificationUrl: string, from?: string) {
  await requireSession();
  const { clientKycVerificationEmail } = await import("@/app/actions/hriq/email-templates");
  const fallbackHtml = clientKycVerificationEmail(adminName, orgName, verificationUrl);
  const fallbackSubject = `Identity Verification Required — ${orgName}`;
  const rendered = await buildEmail("client_kyc", { admin_name: adminName, org_name: orgName, verification_url: verificationUrl }, fallbackHtml, fallbackSubject);
  await sendViaGmail(email, rendered.subject, rendered.html, from);
}

/** Send internal payment link email — for orgs where RL has already collected all info. */
export async function sendInternalPaymentLinkEmail(
  email: string,
  contactName: string,
  companyName: string,
  paymentUrl: string,
  plan: string,
  vaCount: number,
  annualTotal: number,
  expiresAt: Date,
) {
  const { internalPaymentLinkEmail } = await import("@/app/actions/hriq/email-templates");
  const html = internalPaymentLinkEmail(contactName, companyName, paymentUrl, plan, vaCount, annualTotal, expiresAt);
  const fallbackSubject = `Your Remote Leverage dashboard is ready — complete payment to get started`;
  const planLabel = plan === "both" ? "PPP + COR" : plan === "ppp" ? "PPP — Performance & Payroll" : "COR — Contractor of Record";
  const planColor = plan === "cor" ? "#9333ea" : "#f97316";
  const expiresStr = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(expiresAt);
  const rendered = await buildEmail("internal_payment_link", {
    contact_name: contactName, company_name: companyName, payment_url: paymentUrl,
    plan_label: planLabel, plan_color: planColor,
    va_count: String(vaCount), annual_total: `$${annualTotal.toLocaleString()}`,
    expires_date: expiresStr,
  }, html, fallbackSubject);
  await sendViaGmailSystem(email, rendered.subject, rendered.html);
}

/** Send onboarding link email to client (system — no active user session required). */
export async function sendExternalOnboardingLinkEmailSystem(
  email: string,
  contactName: string,
  companyName: string,
  onboardingUrl: string,
  expiresAt: Date,
) {
  const { externalOnboardingLinkEmail } = await import("@/app/actions/hriq/email-templates");
  const html = externalOnboardingLinkEmail(contactName, companyName, onboardingUrl, expiresAt);
  const fallbackSubject = `Complete your onboarding — ${companyName || "Remote Leverage"}`;
  const expiresStr = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(expiresAt);
  const rendered = await buildEmail("external_onboarding_link", { contact_name: contactName, company_name: companyName, onboarding_url: onboardingUrl, expires_date: expiresStr }, html, fallbackSubject);
  await sendViaGmailSystem(email, rendered.subject, rendered.html);
}
