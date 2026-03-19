/**
 * Shared email template system for Remote Leverage.
 * All emails use a consistent professional layout.
 */

import { APP_URL, DEFAULT_PASSWORD, normalizeAppUrl } from "./constants";

function appUrl(): string {
 return normalizeAppUrl(APP_URL);
}

export function esc(value: string): string {
 return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// ─── Dark / Stars Theme ──────────────────────────────────────────────────────────

// Core palette
const D = {
  bg:          "#080b18",   // outermost page background
  card:        "#0e1120",   // email card background
  cardBorder:  "#1a1f3a",   // card border
  section:     "#12162b",   // inner section / card bg
  sectionBorder:"#1e2444",  // inner section border
  text:        "#dde2f0",   // body copy
  textMuted:   "#7c87b0",   // secondary / label text
  textHeading: "#f0f4ff",   // heading text
  textStrong:  "#ffffff",   // bold/strong text
  orange:      "#f97316",
  purple:      "#9333ea",
  teal:        "#00b0bb",
  divider:     "#1a1f3a",
};

/** Sparse star field rendered as an SVG data-URI — works in all email clients. */
function starsBg(): string {
  // 60 hand-placed stars at random positions within 600×90 header space
  const pts = [
    [14,8],[52,22],[88,6],[120,31],[167,12],[210,25],[248,8],[290,19],[330,5],[375,28],
    [412,14],[450,7],[490,24],[530,11],[565,30],[580,6],[22,46],[70,58],[110,42],[150,67],
    [195,50],[240,72],[285,55],[320,40],[360,63],[405,48],[445,70],[480,38],[520,54],[558,44],
    [8,78],[45,85],[92,75],[138,83],[180,77],[225,88],[268,80],[305,74],[350,86],[390,79],
    [432,84],[468,76],[510,88],[545,72],[575,82],[30,36],[75,15],[130,52],[220,40],[315,28],
    [410,62],[500,45],[560,22],[18,62],[96,30],[188,68],[280,16],[370,50],[460,34],[540,58],
  ];
  const circles = pts.map(([cx, cy], i) => {
    const r = i % 5 === 0 ? 1.2 : i % 3 === 0 ? 1.5 : 0.9;
    const op = (0.4 + (i % 7) * 0.08).toFixed(2);
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="white" opacity="${op}"/>`;
  }).join("");
  // Encode minimal SVG as data URI (no btoa — just percent-encode the relevant chars)
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='600' height='90'>${circles}</svg>`;
  const encoded = svg.replace(/#/g, "%23").replace(/'/g, "%27").replace(/</g, "%3C").replace(/>/g, "%3E");
  return `url("data:image/svg+xml,${encoded}")`;
}

// Layout 

function header(): string {
  const stars = starsBg();
  return `
  <div style="position:relative;padding:22px 24px 20px;background:linear-gradient(135deg,#1a0a2e 0%,#0e0b28 40%,#081424 100%);background-image:${stars},linear-gradient(135deg,#1a0a2e 0%,#0e0b28 40%,#081424 100%);background-size:cover,cover;background-repeat:no-repeat,no-repeat;">
    <table cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
      <td style="vertical-align:middle;width:44px;">
        <img src="${appUrl()}/logo.png" alt="RL" width="44" height="44" style="display:block;border-radius:10px;width:44px;height:44px;max-width:44px;box-shadow:0 0 16px rgba(249,115,22,0.4);"/>
      </td>
      <td style="vertical-align:middle;padding-left:12px;">
        <div style="font-size:17px;font-weight:700;letter-spacing:0.3px;background:linear-gradient(90deg,#f97316,#9333ea);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;color:#f97316;">Remote Leverage</div>
        <div style="font-size:10px;color:rgba(255,255,255,0.4);margin-top:1px;letter-spacing:0.8px;text-transform:uppercase;">HRIQ Platform</div>
      </td>
      <td style="vertical-align:middle;text-align:right;">
        <div style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#f97316;box-shadow:0 0 6px #f97316,14px 0 0 0 #9333ea,14px 0 6px #9333ea;"></div>
      </td>
    </tr></table>
  </div>`;
}

function footer(extra?: string): string {
  return `
  <div style="padding:20px 24px;border-top:1px solid ${D.divider};background:${D.card};">
    ${extra ? `<div style="font-size:12px;color:${D.textMuted};line-height:1.5;margin-bottom:12px;">${extra}</div>` : ""}
    ${securityTrustBadgeHtml()}
    <div style="font-size:11px;color:${D.textMuted};line-height:1.6;margin-top:12px;opacity:0.7;">
      © ${new Date().getFullYear()} Remote Leverage LLC · 1900 Camden Ave, San Jose, CA 95124<br/>
      <a href="https://www.remoteleverage.com" style="color:${D.textMuted};text-decoration:underline;">remoteleverage.com</a>
    </div>
  </div>`;
}

/** Wraps body content in the standard dark email chrome. */
export function layout(body: string, footerExtra?: string): string {
  return `
  <div style="margin:0;padding:0;background:${D.bg};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
    <div style="max-width:600px;margin:24px auto;background:${D.card};border:1px solid ${D.cardBorder};border-radius:14px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.6);">
      ${header()}
      <div style="padding:28px 24px;background:${D.card};">
        ${body}
      </div>
      ${footer(footerExtra)}
    </div>
  </div>`;
}

// Reusable Components 

export function heading(text: string): string {
 return `<div style="font-size:22px;font-weight:700;color:${D.textHeading};margin:0 0 16px;line-height:1.3;">${text}</div>`;
}

export function greeting(name: string): string {
  return `<div style="font-size:14px;color:${D.text};margin-bottom:16px;line-height:1.6;">Hi ${esc(name)},</div>`;
}

export function paragraph(html: string): string {
  return `<div style="font-size:14px;color:${D.text};line-height:1.65;margin-bottom:16px;">${html}</div>`;
}

export function primaryButton(label: string, url: string): string {
  return `
  <div style="text-align:center;margin:24px 0;">
    <a href="${url}" style="display:inline-block;background:linear-gradient(135deg,#f97316 0%,#9333ea 100%);color:#ffffff;padding:14px 40px;border-radius:10px;text-decoration:none;font-size:15px;font-weight:700;letter-spacing:0.3px;box-shadow:0 4px 20px rgba(249,115,22,0.35);">${label}</a>
  </div>`;
}

export function secondaryButton(label: string, url: string): string {
  return `<a href="${url}" style="display:inline-block;background:${D.section};color:${D.text};padding:10px 20px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600;border:1px solid ${D.sectionBorder};">${label}</a>`;
}

export function card(title: string, content: string): string {
  return `
  <div style="margin-bottom:16px;border:1px solid ${D.sectionBorder};border-radius:12px;background:${D.section};padding:16px;">
    <div style="font-size:14px;font-weight:700;color:${D.textHeading};margin-bottom:10px;">${title}</div>
    <div style="font-size:13px;color:${D.text};line-height:1.65;">${content}</div>
  </div>`;
}

export function highlightBox(color: "orange" | "green" | "red" | "yellow" | "blue", content: string): string {
  const styles: Record<string, { bg: string; border: string; text: string; glow: string }> = {
    orange: { bg: "#1c1008",  border: "#7c3410", text: "#fb923c", glow: "rgba(249,115,22,0.1)" },
    green:  { bg: "#0a1c0e",  border: "#14532d", text: "#4ade80", glow: "rgba(74,222,128,0.1)" },
    red:    { bg: "#1c0808",  border: "#7f1d1d", text: "#f87171", glow: "rgba(248,113,113,0.1)" },
    yellow: { bg: "#1a1500",  border: "#78350f", text: "#fbbf24", glow: "rgba(251,191,36,0.1)" },
    blue:   { bg: "#080e1c",  border: "#1e3a6e", text: "#60a5fa", glow: "rgba(96,165,250,0.1)" },
  };
  const s = styles[color];
  return `
  <div style="margin-bottom:16px;padding:14px 16px;border-radius:10px;background:${s.bg};border:1px solid ${s.border};box-shadow:0 0 12px ${s.glow};">
    <div style="font-size:13px;color:${s.text};line-height:1.6;">${content}</div>
  </div>`;
}

export function statusBadge(label: string, color: string): string {
  return `<span style="display:inline-block;padding:3px 12px;border-radius:6px;font-size:12px;font-weight:700;color:#fff;background:${color};vertical-align:middle;">${label}</span>`;
}

export function dataRow(label: string, value: string): string {
  return `
  <tr>
    <td style="padding:6px 14px 6px 0;font-size:13px;color:${D.textMuted};white-space:nowrap;vertical-align:top;font-weight:500;">${label}:</td>
    <td style="padding:6px 0;font-size:13px;font-weight:600;color:${D.textHeading};">${value}</td>
  </tr>`;
}

export function dataTable(rows: string): string {
  return `<table cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-bottom:4px;">${rows}</table>`;
}

export function numberedStep(num: number, title: string, body: string): string {
  return `
  <div style="margin-bottom:14px;border:1px solid ${D.sectionBorder};border-radius:12px;overflow:hidden;">
    <div style="padding:12px 16px;background:${D.section};border-bottom:1px solid ${D.sectionBorder};display:flex;align-items:center;">
      <span style="display:inline-block;width:24px;height:24px;border-radius:50%;background:linear-gradient(135deg,#f97316,#9333ea);color:#fff;text-align:center;font-size:12px;font-weight:700;line-height:24px;margin-right:10px;vertical-align:middle;flex-shrink:0;">${num}</span>
      <span style="font-size:14px;font-weight:700;color:${D.textHeading};vertical-align:middle;">${title}</span>
    </div>
    <div style="padding:12px 16px;font-size:13px;color:${D.text};line-height:1.65;background:${D.card};">${body}</div>
 </div>`;
}

export function divider(): string {
  return `<div style="border-top:1px solid ${D.divider};margin:20px 0;"></div>`;
}

/** Clean security indicator for email footers. */
export function securityTrustBadgeHtml(): string {
  return `
  <div style="margin:16px 0 4px;text-align:center;">
    <a href="${appUrl()}/security" style="text-decoration:none;color:${D.textMuted};font-size:11px;" target="_blank">
      &#x1F6E1; Protected by <strong style="color:${D.text};">Snyk</strong>
    </a>
  </div>`;
}

// Reusable Content Blocks 

/** Dashboard feature list shown in welcome & reminder emails. */
export function dashboardFeatures(): string {
  return card("Your Dashboard", `
    Once logged in, you'll have access to:<br/><br/>
    <strong style="color:${D.orange};">Timesheets</strong> — Submit your weekly hours for approval<br/>
    <strong style="color:${D.orange};">Payments</strong> — Track your payment history and amounts<br/>
    <strong style="color:${D.orange};">Documents</strong> — Upload and download your documents<br/>
    <strong style="color:${D.orange};">Contracts</strong> — View and sign your agreements<br/>
    <strong style="color:${D.orange};">Tasks</strong> — See assigned work and deadlines<br/>
    <strong style="color:${D.orange};">Profile</strong> — Keep your personal &amp; banking info current
  `);
}

/** Step-by-step timesheet instructions. */
export function timesheetInstructions(): string {
  return `
  <div style="margin-bottom:16px;border:1px solid ${D.sectionBorder};border-radius:12px;overflow:hidden;">
    <div style="padding:12px 16px;background:${D.section};border-bottom:1px solid ${D.sectionBorder};">
      <span style="font-size:14px;font-weight:700;color:${D.textHeading};">How to Submit Your Timesheet</span>
    </div>
    <div style="padding:14px 16px;font-size:13px;color:${D.text};line-height:1.75;background:${D.card};">
      Your hours from <strong>Time Doctor</strong> sync automatically — just review and submit.<br/><br/>
      <strong style="color:${D.orange};">Step 1:</strong> Go to <strong>Timesheets</strong> in the left menu.<br/>
      <strong style="color:${D.orange};">Step 2:</strong> Find the current open pay period and click <strong>"Fill Timesheet."</strong><br/>
      <strong style="color:${D.orange};">Step 3:</strong> Your hours are pre-filled from Time Doctor. Review each day and adjust if needed using the quick-fill buttons (8h, 4h, etc.) or type custom hours.<br/>
      <strong style="color:${D.orange};">Step 4:</strong> Review your total hours and click <strong>"Submit for Approval."</strong><br/><br/>
      <span style="color:${D.textMuted};">You'll receive a reminder if your timesheet hasn't been submitted.</span>
    </div>
  </div>`;
}

/** Login credentials box for the welcome email. */
export function credentialsBox(email: string, password: string, username?: string, loginUrl?: string): string {
 const url = loginUrl ?? "";
 const safePassword = password || DEFAULT_PASSWORD;
 const displayName = username || email;
 // This box has a LIGHT background (#fff7ed) — must use dark text, not the email dark-theme tokens
 return `
 <div style="margin-bottom:16px;border:2px solid #f97316;border-radius:10px;background:#fff7ed;padding:16px 18px;">
 <div style="font-size:14px;font-weight:700;color:#c2410c;margin-bottom:10px;">Your Login Credentials</div>
 <table cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-bottom:4px;">
 <tr>
   <td style="padding:6px 14px 6px 0;font-size:13px;color:#78716c;white-space:nowrap;vertical-align:top;font-weight:500;">Dashboard:</td>
   <td style="padding:6px 0;font-size:13px;font-weight:600;color:#1c1917;"><a href="${url}" style="color:#2563eb;font-weight:600;text-decoration:underline;">${url.replace("https://", "")}</a></td>
 </tr>
 <tr>
   <td style="padding:6px 14px 6px 0;font-size:13px;color:#78716c;white-space:nowrap;vertical-align:top;font-weight:500;">Email:</td>
   <td style="padding:6px 0;font-size:14px;font-weight:700;color:#1c1917;">${esc(displayName)}</td>
 </tr>
 <tr>
   <td style="padding:6px 14px 6px 0;font-size:13px;color:#78716c;white-space:nowrap;vertical-align:top;font-weight:500;">Password:</td>
   <td style="padding:6px 0;font-size:14px;font-weight:700;color:#1c1917;"><span style="font-family:monospace;letter-spacing:0.5px;color:#1c1917;background:#fed7aa;padding:2px 8px;border-radius:4px;">${esc(safePassword)}</span></td>
 </tr>
 </table>
 <div style="margin-top:10px;padding:8px 12px;background:#fffbeb;border-radius:6px;font-size:12px;color:#92400e;line-height:1.5;">
 Sign in with your <strong>email</strong> and <strong>password</strong> above.
 </div>
 </div>`;
}

// Full Email Templates 

/** Timesheet approved notification. */
export function timesheetApprovedEmail(name: string, periodName: string, hours: number, estimatedPay?: number, currency?: string): string {
 const payRow = estimatedPay ? dataRow("Estimated Pay", `$${estimatedPay.toFixed(2)} ${currency ?? "USD"}`) : "";
 return layout(
 heading("Timesheet Approved") +
 greeting(name) +
 paragraph("Great news — your timesheet has been reviewed and approved.") +
 `<div style="margin-bottom:16px;border:1px solid ${D.sectionBorder};border-radius:12px;padding:16px;background:${D.section};">
 ${dataTable(
 dataRow("Period", esc(periodName)) +
 dataRow("Total Hours", `${hours}h`) +
 payRow +
 dataRow("Status", statusBadge("Approved", "#16a34a"))
 )}
 </div>` +
 primaryButton("View My Timesheets", `${appUrl()}/go/timesheets`),
 "Payment will be processed according to the regular pay schedule."
 );
}

/** Timesheet rejected notification. */
export function timesheetRejectedEmail(name: string, periodName: string, hours: number, reason?: string): string {
 return layout(
 heading("Timesheet Needs Revision") +
 greeting(name) +
 paragraph("Your timesheet has been reviewed and requires changes before it can be approved.") +
 `<div style="margin-bottom:16px;border:1px solid ${D.sectionBorder};border-radius:12px;padding:16px;background:${D.section};">
 ${dataTable(
 dataRow("Period", esc(periodName)) +
 dataRow("Total Hours", `${hours}h`) +
 dataRow("Status", statusBadge("Rejected", "#dc2626"))
 )}
 </div>` +
 (reason ? highlightBox("red", `<strong>Reason:</strong> ${esc(reason)}`) : "") +
 paragraph("Please review the feedback above, make the necessary corrections, and resubmit your timesheet.") +
 primaryButton("Resubmit My Timesheet ", `${appUrl()}/go/timesheets`) +
 divider() +
 timesheetInstructions(),
 "If you have questions about the feedback, reach out to your coordinator."
 );
}

/** Mid-cycle nudge for contractors who haven't started their timesheet at all. */
export function timesheetStartReminderEmail(name: string, periodName: string, startDate: string, endDate: string): string {
 return layout(
 heading("Time to Fill Out Your Timesheet") +
 greeting(name) +
 paragraph(`The timesheet period <strong>${esc(periodName)}</strong> (${esc(startDate)} – ${esc(endDate)}) is open and we haven't seen any hours logged from you yet. Start filling out your timesheet now so you don't have to rush at the end of the cycle.`) +
 primaryButton("Start My Timesheet", `${appUrl()}/go/timesheets`) +
 divider() +
 timesheetInstructions() +
 highlightBox("blue", "Already working on it? You can safely disregard this email."),
 "Submit your timesheet so it can be reviewed and approved."
 );
}

/** Welcome email — onboarding steps, dashboard credentials & instructions. */
export function welcomeEmail(
 name: string,
 startDate: string,
 opts: {
 contractorInfoUrl?: string;
 zoomLink?: string;
 zoomDate?: string;
 payRate?: string;
 currency?: string;
 formLinks?: { name: string; url: string }[];
 bookkeepingEmails?: string;
 dashboardCredentials?: { email: string; password: string; username?: string; loginUrl: string };
 timeDoctorEmail?: string;
 slackEmail?: string;
 slackInviteLink?: string;
 slackWorkspaceUrl?: string;
 paymentSetupType?: "stripe" | "wise" | "both" | "cadana" | "none";
 }
): string {

 // ── 1. Details (pay, start date) + Zoom ────────────────────────────────────

 const detailRows: string[] = [];
 if (opts.payRate) { const _r = opts.payRate.replace(/^\$/, ""); detailRows.push(dataRow("Pay Rate", `$${esc(_r)}/hr ${esc(opts.currency ?? "USD")}`)); }
 detailRows.push(dataRow("Start Date", esc(startDate)));
 const detailsHtml = `<div style="margin-bottom:16px;border:1px solid ${D.sectionBorder};border-radius:12px;padding:16px;background:${D.section};">
 <div style="font-size:14px;font-weight:700;color:${D.textHeading};margin-bottom:8px;">Your Details</div>
 ${dataTable(detailRows.join(""))}
 ${opts.zoomLink ? `<div style="margin-top:12px;padding-top:12px;border-top:1px solid ${D.sectionBorder};">
 <div style="font-size:13px;font-weight:700;color:${D.textHeading};margin-bottom:8px;">Zoom Orientation</div>
 <div style="font-size:13px;color:${D.text};line-height:1.5;margin-bottom:10px;">${opts.zoomDate ? `Scheduled for <strong>${esc(opts.zoomDate)}</strong>.` : "Your orientation meeting is ready."}</div>
 <a href="${opts.zoomLink}"style="display:inline-block;background:#2563eb;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:700;">Join Zoom Meeting</a>
 </div>` : ""}
 </div>`;

 // ── Numbered steps ──────────────────────────────────────────────────────────

 let stepNum = 0;
 const steps: string[] = [];

 // ── 2. Documents to sign ─────────────────────────────────────────────────

 if (opts.formLinks?.length) {
 stepNum++;
 const formButtons = opts.formLinks.map((f) => `<a href="${f.url}"style="display:inline-block;width:100%;box-sizing:border-box;border:1px solid ${D.sectionBorder};border-radius:8px;padding:10px 14px;text-decoration:none;color:${D.textHeading};font-size:13px;font-weight:600;background:${D.section};margin-bottom:8px;">${esc(f.name)} →</a>`).join("");
 steps.push(numberedStep(stepNum, "Sign Your Documents", `
 Please complete and sign each of the following forms. <strong>These are required before your start date.</strong><br/><br/>
 ${formButtons}
 `));
 }

 // ── 3. Time Doctor ───────────────────────────────────────────────────────

 stepNum++;
 const tdEmail = opts.timeDoctorEmail;
 const tdBody = tdEmail
 ? `Your Time Doctor account has been created. You will receive a password reset email from Time Doctor — use it to set your password.<br/><br/>
 <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 14px;margin-bottom:12px;">
 <div style="font-size:12px;font-weight:700;color:#166534;margin-bottom:4px;">Your Time Doctor Login</div>
 <div style="font-size:13px;color:#15803d;"><strong>Username:</strong> ${esc(tdEmail)}</div>
 <div style="font-size:11px;color:#16a34a;margin-top:2px;">Set your password using the reset email, then <a href="https://2.timedoctor.com/downloads" style="color:#2563eb;font-weight:600;">download the Desktop App</a>.</div>
 </div>
 Log in at your scheduled start time on <strong>${esc(startDate)}</strong>.`
 : `Your Time Doctor account has been created. Check your inbox for a password reset email from Time Doctor, set your password, then <a href="https://2.timedoctor.com/downloads" style="color:#2563eb;font-weight:600;">download the Desktop App</a>.<br/>
 Log in at your scheduled start time on <strong>${esc(startDate)}</strong>.`;
 steps.push(numberedStep(stepNum, "Set Up Time Doctor", tdBody));

 // ── 4. Slack ─────────────────────────────────────────────────────────────

 stepNum++;
 const slEmail = opts.slackEmail;
 const slackUrl = opts.slackWorkspaceUrl || "https://remoteleverageva.slack.com";
 const slackJoinLink = opts.slackInviteLink;
 const joinButton = slackJoinLink
 ? `<a href="${slackJoinLink}"style="display:inline-block;background:#4A154B;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:700;margin-bottom:8px;">Join Slack Workspace </a><br/><div style="font-size:11px;color:#b45309;font-weight:600;margin-bottom:12px;">This is a one-time use link. It will expire after you join.</div>`
 : "";
 const slackBody = slEmail
 ? `${joinButton}
 <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px 14px;margin-bottom:12px;">
 <div style="font-size:12px;font-weight:700;color:#1e40af;margin-bottom:4px;">Your Slack Details</div>
 <div style="font-size:13px;color:#60a5fa;"><strong>Email:</strong> ${esc(slEmail)}</div>
 <div style="font-size:13px;color:#60a5fa;"><strong>Workspace:</strong> <a href="${slackUrl}"style="color:#2563eb;">${slackUrl.replace("https://", "")}</a></div>
 </div>
 <a href="https://slack.com/downloads"style="color:#2563eb;font-weight:600;">Download Slack</a> and install it on your work computer. Update your profile picture to a professional photo.`
 : joinButton
 ? `${joinButton}<br/>
 <a href="https://slack.com/downloads"style="color:#2563eb;font-weight:600;">Download Slack</a> and install it on your work computer. Update your profile picture to a professional photo.`
 : `Download and install <a href="https://slack.com/downloads"style="color:#2563eb;font-weight:600;">Slack</a> on your work computer.<br/>
 Accept the email invitation we'll send and update your profile picture to a professional photo.`;
 steps.push(numberedStep(stepNum, "Set Up Slack", slackBody));

 // ── 5. Contractor Info ───────────────────────────────────────────────────

 stepNum++;
 const infoBody = opts.contractorInfoUrl
 ? `Complete your personal details, upload your government-issued ID, and provide your banking information. <strong>This is required before your start date.</strong><br/><br/><a href="${opts.contractorInfoUrl}"style="display:inline-block;background:linear-gradient(135deg,#f97316,#9333ea);color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:700;">Complete Your Information →</a>`
 : `Complete the <strong>New Contractor Form</strong> and <strong>New Employee Details Form</strong> provided by your coordinator. <strong>This is required before your start date.</strong>`;
 steps.push(numberedStep(stepNum, "Complete Your Contractor Information", infoBody));

 // ── 6. Grammarly ─────────────────────────────────────────────────────────

 stepNum++;
 steps.push(numberedStep(stepNum, "Install Grammarly", `
 Download the <a href="https://www.grammarly.com/"style="color:#2563eb;">Grammarly browser extension</a> to keep all your written communication clear and professional.
 `));

 // ── 7. Payment Setup (conditional — non-RL orgs only) ────────────────────

 const pSetup = opts.paymentSetupType;
 if (pSetup && pSetup !== "none") {
 stepNum++;
 const payBody = `Once you have completed all your documents and forms, you will be sent a <strong>login code</strong> to access your contractor dashboard.<br/><br/>When you log in for the first time, you will be guided through setting up your payment account to receive payouts.`;
 steps.push(numberedStep(stepNum, "Dashboard Access &amp; Payment Setup", payBody));
 }

 // ── 8. Timesheet ─────────────────────────────────────────────────────────

 stepNum++;
 steps.push(numberedStep(stepNum, "Submit Your Timesheet", `
 Your timesheets are submitted through the <strong>HRIQ Dashboard</strong>. Your hours from <strong>Time Doctor</strong> sync automatically — just review and submit.<br/><br/>
 <strong>1.</strong> Log into your dashboard and click <strong>Timesheets</strong> in the left menu.<br/>
 <strong>2.</strong> Find the current open pay period and click <strong>"Fill Timesheet."</strong><br/>
 <strong>3.</strong> Your hours are pre-filled from Time Doctor. Review each day and adjust if needed using the quick-fill buttons (8h, 4h, etc.) or type custom hours.<br/>
 <strong>4.</strong> Review your total hours and click <strong>"Submit for Approval."</strong><br/><br/>
 <span style="color:${D.textMuted};">You'll receive a reminder if your timesheet hasn't been submitted.</span>
 `));

 // ── Dashboard credentials ────────────────────────────────────────────────

 const dashboardUrl = `${appUrl()}/va`;
 const creds = opts.dashboardCredentials;
 const dashboardHtml = creds
 ? divider() +
 heading("Your Dashboard Access") +
 paragraph("Your contractor dashboard is ready. Use the credentials below to log in and manage your timesheets, payments, documents, and more.") +
 credentialsBox(creds.email, creds.password, creds.username, creds.loginUrl) +
 primaryButton("Login to My Dashboard →", creds.loginUrl) +
 highlightBox("blue", `<strong>Bookmark your dashboard:</strong> <a href="${dashboardUrl}"style="color:#2563eb;font-weight:600;text-decoration:underline;">${dashboardUrl.replace("https://", "")}</a> — this is your home base for timesheets, payments, documents, and more.`) +
 dashboardFeatures() +
 highlightBox("yellow", "<strong>Security Notice:</strong> You will be required to change your password on your first login. Do not share your login credentials with anyone. If you have trouble signing in, contact your coordinator for assistance.")
 : "";

 // ── Assemble ─────────────────────────────────────────────────────────────

 return layout(
 heading(`Welcome aboard, ${esc(name)}!`) +
 paragraph(`Congratulations — you're hired! Your start date is <strong>${esc(startDate)}</strong>. Please complete the following steps before your first day:`) +
 detailsHtml +
 steps.join("") +
 dashboardHtml,
 "We're excited to have you on the team! — Maria Villatoro, Recruiting Manager · <a href=\"mailto:maria@remoteleverage.com\"style=\"color:#6b7280;\">maria@remoteleverage.com</a> · (650) 203-6357"
 );
}

/** Admin invitation email. */
export function adminInviteEmail(name: string, orgName: string, username?: string): string {
 const loginField = `Email: <code style="background:#1a1a2e;padding:2px 8px;border-radius:4px;color:#e0e0e0;">${esc(username || "your email")}</code><br/>`;
 return layout(
 heading("Admin Invitation") +
 greeting(name || "there") +
 paragraph(`You've been invited to manage <strong>${esc(orgName)}</strong> on the Remote Leverage platform. As an admin, you'll have full access to manage contractors, timesheets, payments, and more.`) +
 highlightBox("green", `<strong>Your Login Credentials:</strong><br/>${loginField}Password: <code style="background:#1a1a2e;padding:2px 8px;border-radius:4px;color:#e0e0e0;">${DEFAULT_PASSWORD}</code><br/><br/>Sign in with your <strong>email</strong> and this password.<br/><br/><span style="background:#fef3c7;padding:2px 6px;border-radius:4px;color:#92400e;font-weight:600;"> You will be required to change your password on first login.</span>`) +
 primaryButton("Sign In Now ", `${appUrl()}/sign-in`) +
 highlightBox("blue", "This invitation expires in 14 days."),
 );
}

/** Team member invitation email. */
export function teamInviteEmail(name: string, role: string, username?: string): string {
 const loginField = `Username: <code style="background:#1a1a2e;padding:2px 8px;border-radius:4px;color:#e0e0e0;">${esc(username || "your email")}</code><br/>`;
 return layout(
 heading("You're Invited to Remote Leverage") +
 greeting(name || "there") +
 paragraph(`You've been invited to join Remote Leverage as <strong>${esc(role)}</strong>. An account has been created for you.`) +
 highlightBox("green", `<strong>Your Login Credentials:</strong><br/>${loginField}Password: <code style="background:#1a1a2e;padding:2px 8px;border-radius:4px;color:#e0e0e0;">${DEFAULT_PASSWORD}</code><br/><br/>As a Remote Leverage team member, you can sign in with <strong>Google SSO</strong> (recommended) or use your <strong>username</strong> + this password.<br/><br/><strong>You will be required to change your password on first login.</strong>`) +
 primaryButton("Sign In Now ", `${appUrl()}/sign-in`) +
 highlightBox("blue", "Welcome to the team!"),
 );
}

/** Payment processed notification. */
export function paymentNotificationEmail(name: string, amount: string, currency: string, paymentType: string): string {
 return layout(
 heading("Payment Processed") +
 greeting(name) +
 paragraph("A payment has been processed for you. Here are the details:") +
 `<div style="margin-bottom:16px;border:1px solid ${D.sectionBorder};border-radius:12px;padding:16px;background:${D.section};">
 ${dataTable(
 dataRow("Amount", `<span style="font-size:18px;font-weight:700;color:#111827;">$${esc(amount)} ${esc(currency)}</span>`) +
 dataRow("Type", esc(paymentType)) +
 dataRow("Date", new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric"})) +
 dataRow("Status", statusBadge("Processed", "#16a34a"))
 )}
 </div>` +
 primaryButton("View Payment History", `${appUrl()}/go/payments`),
 "Payments typically arrive within 2–3 business days depending on your bank."
 );
}

/** Task assignment notification. */
export function taskAssignmentEmail(name: string, taskTitle: string, dueDate?: string): string {
 const dueDateRow = dueDate ? dataRow("Due Date", esc(dueDate)) : "";
 return layout(
 heading("New Task Assigned") +
 greeting(name) +
 paragraph("You've been assigned a new task. Please review the details below and complete it by the due date.") +
 `<div style="margin-bottom:16px;border:1px solid ${D.sectionBorder};border-radius:12px;padding:16px;background:${D.section};">
 ${dataTable(
 dataRow("Task", `<strong>${esc(taskTitle)}</strong>`) +
 dueDateRow +
 dataRow("Status", statusBadge("Assigned", "#f97316"))
 )}
 </div>` +
 primaryButton("View My Tasks", `${appUrl()}/go/tasks`),
 );
}

/** Zoom meeting created — host notification. */
export function zoomHostEmail(title: string, date: string, duration: number, startUrl: string, joinUrl: string, attendees?: string[]): string {
 const attendeesHtml = attendees?.length
 ? card(`Attendees (${attendees.length})`, attendees.map((n) => `• ${esc(n)}`).join("<br/>"))
 : "";
 return layout(
 heading("Zoom Meeting Scheduled") +
 paragraph("An onboarding orientation meeting has been created under your account.") +
 `<div style="margin-bottom:16px;border:1px solid ${D.sectionBorder};border-radius:12px;padding:16px;background:${D.section};">
 ${dataTable(
 dataRow("Meeting", `<strong>${esc(title)}</strong>`) +
 dataRow("Date", esc(date)) +
 dataRow("Duration", `${duration} minutes`)
 )}
 <div style="margin-top:12px;">
 <a href="${startUrl}"style="display:inline-block;background:#2563eb;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:700;margin-right:8px;">Start Meeting (Host)</a>
 ${secondaryButton("Copy Join Link", joinUrl)}
 </div>
 </div>` +
 attendeesHtml,
 "A calendar invite is attached to this email."
 );
}

/** Zoom meeting cancelled notification. */
export function zoomCancellationEmail(name: string, meetingDate?: string, reason?: string): string {
 return layout(
 heading("Orientation Meeting Cancelled") +
 greeting(name) +
 paragraph(`Your Zoom orientation meeting${meetingDate ? ` scheduled for <strong>${esc(meetingDate)}</strong>` : ""} has been cancelled.${reason ? ` <strong>Reason:</strong> ${esc(reason)}` : ""}`) +
 paragraph("You'll receive a new invitation once a replacement meeting is scheduled. Please disregard any previous calendar invites for this session."),
 "Questions? Contact your onboarding coordinator."
 );
}

export function credentialsEmail(name: string, creds: { email: string; password: string; username?: string; loginUrl: string }): string {
 const loginRow = `<tr><td style="padding:6px 0;font-weight:600;width:120px;">Email</td><td><strong>${esc(creds.username || creds.email)}</strong></td></tr>`;
 return layout(
 heading("Your Dashboard Is Ready") +
 greeting(name) +
 paragraph("Your information has been approved and your Remote Leverage dashboard account is now active. Here are your login credentials:") +
 card("Login Credentials", `
 <table style="width:100%;border-collapse:collapse;">
 <tr><td style="padding:6px 0;font-weight:600;width:120px;">Login URL</td><td><a href="${esc(creds.loginUrl)}"style="color:#9333ea;">${esc(creds.loginUrl)}</a></td></tr>
 ${loginRow}
 <tr><td style="padding:6px 0;font-weight:600;">Password</td><td><code style="background:#f5f5f5;padding:2px 6px;border-radius:4px;">${esc(creds.password)}</code></td></tr>
 </table>
 `) +
 paragraph("After logging in with your password, you'll receive a verification code at your email. Enter it to complete sign-in.") +
 highlightBox("yellow", "<strong>Important:</strong> You will be required to change your password on your first login. Please choose a strong, unique password.") +
 primaryButton("Go to Dashboard ", creds.loginUrl),
 "Keep your credentials safe. Contact your manager if you have any issues logging in."
 );
}

// Document Notification Emails 

export function documentSignedAdminEmail(
 contractorName: string,
 documentName: string,
 dashboardUrl: string,
 orgSlug = "rl",
): string {
 return layout(
 heading("Document Signed") +
 paragraph(`<strong>${esc(contractorName)}</strong> has signed <strong>${esc(documentName)}</strong>.`) +
 paragraph("The document has been automatically verified and added to their file.") +
 primaryButton("View Documents ", `${dashboardUrl}/${orgSlug}/documents`),
 "This is an automated notification from the onboarding system."
 );
}

export function allFormsSignedAdminEmail(
 contractorName: string,
 formCount: number,
 dashboardUrl: string,
): string {
 return layout(
 heading("All Onboarding Forms Signed") +
 highlightBox("green", `<strong>${esc(contractorName)}</strong> has completed all ${formCount} onboarding form${formCount !== 1 ? "s": ""}.`) +
 paragraph("You can now review their information and proceed with activation.") +
 primaryButton("Go to Hiring Pipeline ", `${dashboardUrl}/rl/hiring`),
 "This is an automated notification from the onboarding system."
 );
}

export function documentUploadedAdminEmail(
 contractorName: string,
 documentName: string,
 documentType: string,
 dashboardUrl: string,
 orgSlug = "rl",
): string {
 return layout(
 heading("New Document Uploaded") +
 paragraph(`<strong>${esc(contractorName)}</strong> has uploaded a new document for your review.`) +
 dataTable(
 dataRow("Document", esc(documentName)) +
 dataRow("Type", esc(documentType.replace(/_/g, ""))) +
 dataRow("Status", "Pending Review")
 ) +
 primaryButton("Review Document ", `${dashboardUrl}/${orgSlug}/documents`),
 "This is an automated notification from Remote Leverage."
 );
}

export function documentVerifiedEmail(
 contractorName: string,
 documentName: string,
 dashboardUrl: string,
): string {
 return layout(
 heading("Document Verified") +
 greeting(contractorName) +
 highlightBox("green", `Your document <strong>${esc(documentName)}</strong> has been reviewed and verified.`) +
 paragraph("No further action is needed for this document.") +
 primaryButton("View My Documents ", `${dashboardUrl}/go/documents`),
 "This is an automated notification from Remote Leverage."
 );
}

export function documentRejectedEmail(
 contractorName: string,
 documentName: string,
 reason: string | undefined,
 dashboardUrl: string,
): string {
 return layout(
 heading("Document Needs Attention") +
 greeting(contractorName) +
 highlightBox("red", `Your document <strong>${esc(documentName)}</strong> was not accepted.`) +
 (reason ? paragraph(`<strong>Reason:</strong> ${esc(reason)}`) : "") +
 paragraph("Please upload a corrected version at your earliest convenience.") +
 primaryButton("Upload New Version ", `${dashboardUrl}/go/documents`),
 "This is an automated notification from Remote Leverage."
 );
}

/** Reschedule notification email — sent when start date or zoom is changed. */
export function rescheduleEmail(
 name: string,
 newStartDate: string,
 newZoomDate?: string,
 orgName?: string,
): string {
 const org = orgName ? esc(orgName) : "Remote Leverage";
 const isClient = !!orgName;

 const detailRows = [dataRow("New Start Date", `<strong>${newStartDate}</strong>`)];
 if (newZoomDate) detailRows.push(dataRow("New Orientation Date", `<strong>${newZoomDate}</strong>`));

 const body =
 heading("Schedule Update") +
 paragraph(`Hi ${esc(name)},`) +
 paragraph(`Your onboarding schedule with <strong>${org}</strong> has been updated. Please note the new dates below:`) +
 `<div style="margin-bottom:16px;border:1px solid ${D.sectionBorder};border-radius:12px;padding:16px;background:${D.section};">
 <div style="font-size:14px;font-weight:700;color:${D.textHeading};margin-bottom:8px;">Updated Details</div>
 ${dataTable(detailRows.join(""))}
 </div>` +
 (newZoomDate
 ? highlightBox("blue", "Your Zoom orientation meeting has been rescheduled. An updated calendar invite will be sent separately.")
 : "") +
 paragraph("If you have any questions about the updated schedule, please reach out to your coordinator.");

 return isClient
 ? clientLayout(org, body, `— ${org}`)
 : layout(body, `— The ${org} Team`);
}

// Client-Branded Emails 

function clientHeader(orgName: string): string {
  const stars = starsBg();
  return `
  <div style="padding:22px 24px 20px;background:linear-gradient(135deg,#1a0a2e 0%,#0e0b28 40%,#081424 100%);background-image:${stars},linear-gradient(135deg,#1a0a2e 0%,#0e0b28 40%,#081424 100%);background-size:cover,cover;background-repeat:no-repeat,no-repeat;">
    <table cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
      <td style="vertical-align:middle;">
        <div style="font-size:17px;font-weight:700;letter-spacing:0.3px;color:#ffffff;">${esc(orgName)}</div>
        <div style="font-size:10px;color:rgba(255,255,255,0.45);margin-top:2px;letter-spacing:0.6px;">Managed by <span style="background:linear-gradient(90deg,#f97316,#9333ea);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;color:#f97316;">Remote Leverage</span></div>
      </td>
      <td style="vertical-align:middle;text-align:right;">
        <div style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#f97316;box-shadow:0 0 6px #f97316,14px 0 0 0 #9333ea,14px 0 6px #9333ea;"></div>
      </td>
    </tr></table>
  </div>`;
}

function clientFooter(orgName: string, extra?: string): string {
  return `
  <div style="padding:20px 24px;border-top:1px solid ${D.divider};background:${D.card};">
    ${extra ? `<div style="font-size:12px;color:${D.textMuted};line-height:1.5;margin-bottom:12px;">${extra}</div>` : ""}
    ${securityTrustBadgeHtml()}
    <div style="font-size:11px;color:${D.textMuted};line-height:1.6;margin-top:12px;opacity:0.7;">
      ${esc(orgName)} · Managed by <a href="${appUrl()}" style="color:${D.textMuted};text-decoration:underline;">Remote Leverage</a><br/>
      © ${new Date().getFullYear()} Remote Leverage LLC
    </div>
  </div>`;
}

export function clientLayout(orgName: string, body: string, footerExtra?: string): string {
  return `
  <div style="margin:0;padding:0;background:${D.bg};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
    <div style="max-width:600px;margin:24px auto;background:${D.card};border:1px solid ${D.cardBorder};border-radius:14px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.6);">
      ${clientHeader(orgName)}
      <div style="padding:28px 24px;background:${D.card};">
        ${body}
      </div>
      ${clientFooter(orgName, footerExtra)}
    </div>
  </div>`;
}

/** Client-branded onboarding welcome email (non-RL orgs).
 * Includes Time Doctor setup, contractor info form, dashboard login, documents, and payment setup.
 */
export function clientWelcomeEmail(
 name: string,
 startDate: string,
 orgName: string,
 opts: {
 contractorInfoUrl?: string;
 payRate?: string;
 currency?: string;
 bodyText?: string;
 documentNames?: string[];
 paymentSetupType?: "stripe" | "wise" | "both" | "cadana" | "none";
 timeDoctorEmail?: string;
 dashboardCredentials?: { email: string; password: string; username?: string; loginUrl: string };
 }
): string {
 // Details card
 const detailRows: string[] = [];
 if (opts.payRate) { const _r = opts.payRate.replace(/^\$/, ""); detailRows.push(dataRow("Pay Rate", `$${esc(_r)}/hr ${esc(opts.currency ?? "USD")}`)); }
 detailRows.push(dataRow("Start Date", esc(startDate)));
 const detailsHtml = detailRows.length
 ? `<div style="margin-bottom:16px;border:1px solid ${D.sectionBorder};border-radius:12px;padding:16px;background:${D.section};">
 <div style="font-size:14px;font-weight:700;color:${D.textHeading};margin-bottom:8px;">Your Details</div>
 ${dataTable(detailRows.join(""))}
 </div>`
 : "";

 // Custom body text from admin
 const bodyTextHtml = opts.bodyText?.trim()
 ? paragraph(esc(opts.bodyText).replace(/\n/g, "<br/>"))
 : "";

 // Document signing section
 const docsHtml = opts.documentNames?.length
 ? card("Documents to Complete", `
 Please review and sign the following documents before your start date:<br/><br/>
 ${opts.documentNames.map((name, idx) =>
 `<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;margin-bottom:6px;border:1px solid #e5e7eb;border-radius:8px;background:#fff;">
 <span style="display:inline-block;width:20px;height:20px;border-radius:50%;background:#f97316;color:#fff;text-align:center;font-size:11px;font-weight:700;line-height:20px;flex-shrink:0;">${idx + 1}</span>
 <span style="font-size:13px;font-weight:600;color:#111827;">${esc(name)}</span>
 </div>`
 ).join("")}
 `)
 : "";

 // Contractor Info step
 const infoStepHtml = opts.contractorInfoUrl
 ? numberedStep(
 (opts.documentNames?.length ?? 0) + 1,
 "Complete Your Information",
 `Fill in your personal details and banking information. <strong>This is required before your start date.</strong><br/><br/>
 <a href="${opts.contractorInfoUrl}"style="display:inline-block;background:linear-gradient(135deg,#f97316,#9333ea);color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:700;">Complete Your Information </a>`
 )
 : "";

 // Step: Time Doctor setup (non-RL orgs use Time Doctor too)
 const tdEmail = opts.timeDoctorEmail;
 const infoStepNum = (opts.documentNames?.length ?? 0) + 1;
 const tdStepNum = infoStepNum + (opts.contractorInfoUrl ? 1 : 0) + 1;
 const tdBody = tdEmail
   ? `Your Time Doctor account has been created. You will receive a password reset email from Time Doctor — use it to set your password.<br/><br/>
<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 14px;margin-bottom:12px;">
<div style="font-size:12px;font-weight:700;color:#166534;margin-bottom:4px;">Your Time Doctor Login</div>
<div style="font-size:13px;color:#15803d;"><strong>Username:</strong> ${esc(tdEmail)}</div>
<div style="font-size:11px;color:#16a34a;margin-top:2px;">Set your password using the reset email, then <a href="https://2.timedoctor.com/downloads" style="color:#2563eb;font-weight:600;">download the Desktop App</a>.</div>
</div>
Log in at your scheduled start time on <strong>${esc(startDate)}</strong>.`
   : `Your Time Doctor account has been created. Check your inbox for a password reset email from Time Doctor, set your password, then <a href="https://2.timedoctor.com/downloads" style="color:#2563eb;font-weight:600;">download the Desktop App</a>.<br/>
Log in at your scheduled start time on <strong>${esc(startDate)}</strong>.`;
 const tdHtml = numberedStep(tdStepNum, "Set Up Time Doctor", tdBody);

 // Step: Dashboard credentials (if provisioned)
 const creds = opts.dashboardCredentials;
 const dashStepNum = tdStepNum + 1;
 const dashHtml = creds
   ? numberedStep(dashStepNum, "Access Your Contractor Dashboard",
     `Your contractor dashboard has been set up. Log in to track your time, view payments, and manage your profile.<br/><br/>
<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px 16px;margin-bottom:12px;">
<div style="font-size:12px;font-weight:700;color:#1e40af;margin-bottom:8px;">Dashboard Login Details</div>
<div style="font-size:13px;color:#1e40af;margin-bottom:4px;"><strong>Login URL:</strong> <a href="${creds.loginUrl}" style="color:#2563eb;">${esc(creds.loginUrl)}</a></div>
<div style="font-size:13px;color:#1e40af;margin-bottom:4px;"><strong>Username:</strong> ${esc(creds.username || creds.email)}</div>
<div style="font-size:13px;color:#1e40af;"><strong>Temporary Password:</strong> <code style="background:#dbeafe;padding:2px 6px;border-radius:4px;font-family:monospace;">${esc(creds.password || DEFAULT_PASSWORD)}</code></div>
</div>
<div style="font-size:11px;color:#9ca3af;">You will be asked to change your password on first login.</div>`)
   : "";

 // Step: Payment setup
 const pSetup = opts.paymentSetupType;
 const payStepNum = dashStepNum + (creds ? 1 : 0);
 const paySetupHtml = (pSetup && pSetup !== "none")
   ? numberedStep(payStepNum, "Set Up Your Payment Account",
     `Once you have completed all your documents and forms, you will receive a <strong>login code</strong> to access your dashboard.<br/><br/>
When you first log in, you will be guided through setting up your bank account to receive payments securely.`)
   : "";

 return clientLayout(
 orgName,
 heading(`Welcome aboard, ${esc(name)}!`) +
 paragraph(`Congratulations — you're hired! Your start date is <strong>${esc(startDate)}</strong>.${opts.documentNames?.length ? " Please complete the following before your first day:" : ""}`) +
 detailsHtml +
 bodyTextHtml +
 docsHtml +
 infoStepHtml +
 tdHtml +
 dashHtml +
 paySetupHtml,
 `We're excited to have you on the team! — ${esc(orgName)}`
 );
}

/** Client-branded dashboard credentials email (non-RL orgs).
 * Sent when a contractor is activated and their dashboard account is provisioned.
 * Only contains login credentials — no Time Doctor, documents, or payment setup
 * since those were already covered in the initial onboarding welcome email.
 */
export function clientDashboardCredentialsEmail(
  name: string,
  orgName: string,
  creds: { email: string; password: string; username?: string; loginUrl: string },
): string {
  return clientLayout(
    orgName,
    heading(`Your Dashboard is Ready, ${esc(name)}!`) +
    paragraph(`Your contractor dashboard for <strong>${esc(orgName)}</strong> has been set up. You can now log in to track your time, view payments, and manage your profile.`) +
    `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:18px 20px;margin-bottom:20px;">
<div style="font-size:14px;font-weight:700;color:#1e40af;margin-bottom:12px;">Your Login Details</div>
<table cellpadding="0" cellspacing="0" border="0" style="width:100%;">
<tr>
  <td style="padding:6px 14px 6px 0;font-size:13px;color:#6b7280;white-space:nowrap;vertical-align:top;font-weight:500;">Login URL:</td>
  <td style="padding:6px 0;font-size:13px;font-weight:600;"><a href="${creds.loginUrl}" style="color:#2563eb;text-decoration:underline;">${esc(creds.loginUrl)}</a></td>
</tr>
<tr>
  <td style="padding:6px 14px 6px 0;font-size:13px;color:#6b7280;white-space:nowrap;vertical-align:top;font-weight:500;">Username:</td>
  <td style="padding:6px 0;font-size:14px;font-weight:700;color:#111827;">${esc(creds.username || creds.email)}</td>
</tr>
<tr>
  <td style="padding:6px 14px 6px 0;font-size:13px;color:#6b7280;white-space:nowrap;vertical-align:top;font-weight:500;">Temporary Password:</td>
  <td style="padding:6px 0;font-size:14px;font-weight:700;color:#111827;"><code style="background:#dbeafe;padding:2px 8px;border-radius:4px;font-family:monospace;">${esc(creds.password || DEFAULT_PASSWORD)}</code></td>
</tr>
</table>
</div>` +
    `<div style="text-align:center;margin:20px 0;">
<a href="${creds.loginUrl}" style="display:inline-block;background:linear-gradient(135deg,#2563eb,#7c3aed);color:#fff;padding:12px 28px;border-radius:10px;text-decoration:none;font-size:14px;font-weight:700;">Log In to Your Dashboard →</a>
</div>` +
    paragraph(`<span style="font-size:12px;color:#9ca3af;">You will be asked to change your password on first login.</span>`),
    `We're excited to have you on the team!`
  );
}

/** Payment setup invite email — Stripe Connect onboarding. */
export function paymentSetupEmail(name: string, onboardingUrl: string): string {
 return layout(
 heading(`Set Up Your Payment Account`) +
 greeting(name) +
 paragraph("To receive your payments from Remote Leverage, you need to set up your payment account. This is a secure, one-time process that verifies your identity and connects your bank account.") +
 card("What You'll Need", `
 <div style="font-size:13px;color:${D.text};line-height:1.75;">
 Government-issued photo ID (passport, driver's license, or national ID)<br/>
 Your bank account details (routing & account number)<br/>
 Your home address<br/>
 Tax information (SSN for US, or tax ID for other countries)
 </div>
 `) +
 `<div style="text-align:center;margin:24px 0;">` +
 primaryButton("Complete Payment Setup →", onboardingUrl) +
 `</div>` +
 highlightBox("blue", "<strong>This link expires in 24 hours.</strong> If it expires, your coordinator can resend it from the dashboard.") +
 numberedStep(1, "Verify Your Identity", "Upload a photo of your government ID and take a selfie for identity verification. This is handled securely by our payment provider.") +
 numberedStep(2, "Add Your Bank Account", "Enter your bank account details so we can deposit your payments directly. You can update this later if needed.") +
 numberedStep(3, "Confirm Your Details", "Review your information and submit. Once verified, you'll start receiving payments automatically after each approved timesheet.") +
 highlightBox("green", "<strong>Your data is secure.</strong> Payment processing is handled by Stripe, a PCI Level 1 certified provider trusted by millions of businesses worldwide. Remote Leverage never sees or stores your banking details."),
 "Need help? Reply to this email or contact your coordinator. — Remote Leverage Team"
 );
}

// ─── Veriff KYC Email Templates ──────────────────────────────────────────────

/** Client onboarding KYC verification email — sent to org admin with Veriff link. */
export function clientKycVerificationEmail(
 adminName: string,
 orgName: string,
 verificationUrl: string,
): string {
 return layout(
 heading("Verify Your Identity") +
 greeting(adminName) +
 paragraph(
 `Welcome to Remote Leverage! As part of onboarding <strong>${esc(orgName)}</strong>, ` +
 `we need to verify the identity of the primary account administrator. ` +
 `This is a quick, secure process that typically takes less than 2 minutes.`
 ) +
 card("What You'll Need", `
 <div style="font-size:13px;color:${D.text};line-height:1.75;">
 A government-issued photo ID (passport, driver's license, or national ID)<br/>
 A device with a camera (phone or laptop with webcam)<br/>
 Good lighting for the selfie step
 </div>
 `) +
 primaryButton("Start Identity Verification →", verificationUrl) +
 numberedStep(1, "Scan Your ID", "Take a clear photo of the front (and back if applicable) of your government-issued ID.") +
 numberedStep(2, "Take a Selfie", "A quick selfie to match your face to your ID photo. This ensures no one else is using your identity.") +
 numberedStep(3, "Automatic Review", "Our verification partner Veriff will review your submission. Most verifications are approved within minutes.") +
 highlightBox("blue", "<strong>This link expires in 7 days.</strong> If it expires, your Remote Leverage coordinator can resend it.") +
 highlightBox("green",
 "<strong>Your privacy is protected.</strong> Identity verification is handled by Veriff, "+
 "a certified identity verification provider. Remote Leverage does not store your ID documents. "+
 "Your data is processed in compliance with GDPR and SOC 2 standards."
 ),
 "Questions? Reply to this email or contact your Remote Leverage coordinator. — Remote Leverage Team"
 );
}

/** KYC approved — sent to client org admin. */
export function kycApprovedClientEmail(adminName: string, orgName: string): string {
 return layout(
 heading("Your Dashboard is Active ") +
 greeting(adminName) +
 paragraph(
 `Great news! Your identity has been successfully verified and your <strong>${esc(orgName)}</strong> dashboard is now active on Remote Leverage.`
 ) +
 highlightBox("green",
 "<strong>What's next?</strong><br/>"+
 "• Your dashboard is ready — log in to manage contractors, timesheets, and payments<br/>"+
 "• Your Remote Leverage team is ready to start onboarding your contractors<br/>"+
 "• Contact your coordinator if you need to add team members"
 ) +
 primaryButton("Open Your Dashboard →", `${appUrl()}`),
 "Welcome aboard! — Remote Leverage Team"
 );
}

/** KYC resubmission needed — sent to client org admin. */
export function kycResubmissionClientEmail(adminName: string, orgName: string, reason: string): string {
 return layout(
 heading("Verification Needs Attention") +
 greeting(adminName) +
 paragraph(
 `We weren't able to fully verify your identity for <strong>${esc(orgName)}</strong>. ` +
 `Don't worry — this usually happens when the ID photo is unclear or the lighting was insufficient.`
 ) +
 highlightBox("yellow",
 `<strong>Reason:</strong> ${esc(reason)}`
 ) +
 paragraph(
 "Your Remote Leverage coordinator will send you a new verification link shortly. "+
 "Here are some tips for a successful verification:"
 ) +
 card("Tips for Success", `
 <div style="font-size:13px;color:${D.text};line-height:1.75;">
 Make sure your ID is not expired<br/>
 Place your ID on a flat, dark surface with good lighting<br/>
 Ensure all text and the photo on your ID are clearly visible<br/>
 For the selfie, face the camera directly with good lighting<br/>
 Remove glasses, hats, or anything covering your face
 </div>
 `),
 "Need help? Reply to this email. — Remote Leverage Team"
 );
}

/** KYC approved — admin notification sent to RL team. */
export function kycApprovedAdminNotification(
 orgName: string,
 verifiedName: string,
 documentType?: string | null,
 documentCountry?: string | null,
): string {
 const details = [
 dataRow("Organization", `<strong>${esc(orgName)}</strong>`),
 dataRow("Verified Name", esc(verifiedName)),
 ...(documentType ? [dataRow("Document Type", esc(documentType))] : []),
 ...(documentCountry ? [dataRow("Document Country", esc(documentCountry))] : []),
 dataRow("Verified At", new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles"})),
 dataRow("Status", statusBadge("Approved", "#16a34a")),
 ];
 return layout(
 heading("Client KYC Approved ") +
 paragraph(`The identity verification for <strong>${esc(orgName)}</strong> has been approved.`) +
 `<div style="margin-bottom:16px;border:1px solid ${D.sectionBorder};border-radius:12px;padding:16px;background:${D.section};">
 ${dataTable(details.join(""))}
 </div>` +
 primaryButton("View Organization →", `${appUrl()}/rl/organizations`),
 "Automated notification from HRIQ"
 );
}

/** KYC declined/resubmission — admin notification sent to RL team. */
export function kycDeclinedAdminNotification(
 orgName: string,
 status: string,
 reason: string,
): string {
 const statusColor = status === "declined"? "#dc2626": "#f59e0b";
 const statusLabel = status === "declined"? "Declined": "Resubmission Needed";
 return layout(
 heading(`Client KYC: ${statusLabel}`) +
 paragraph(`The identity verification for <strong>${esc(orgName)}</strong> was not approved.`) +
 highlightBox(status === "declined"? "red": "yellow",
 `<strong>Status:</strong> ${statusLabel}<br/><strong>Reason:</strong> ${esc(reason)}`
 ) +
 (status === "resubmission_requested"
 ? paragraph("The client has been notified to resubmit. You can also resend the verification link from the org detail page.")
 : paragraph("You may need to contact the client to resolve this. You can initiate a new verification from the org detail page.")
 ) +
 primaryButton("View Organization →", `${appUrl()}/rl/organizations`),
 "Automated notification from HRIQ"
 );
}

/** Email sent to client with their onboarding link. */
export function externalOnboardingLinkEmail(
  contactName: string,
  companyName: string,
  onboardingUrl: string,
  expiresAt: Date,
): string {
  const expiresStr = new Intl.DateTimeFormat("en-US", {
    month: "long", day: "numeric", year: "numeric",
  }).format(expiresAt);

  const benefitRow = (num: string, title: string, desc: string) =>
    `<tr><td style="padding:10px 12px;vertical-align:top;width:36px;">
      <div style="width:32px;height:32px;border-radius:8px;background:rgba(249,115,22,0.12);text-align:center;line-height:32px;font-size:14px;font-weight:700;color:${D.orange};">${num}</div>
    </td><td style="padding:10px 12px;">
      <div style="font-weight:600;font-size:14px;color:${D.textHeading};">${title}</div>
      <div style="font-size:12px;color:${D.textMuted};margin-top:2px;">${desc}</div>
    </td></tr>`;

  return layout(
    heading("Welcome to Remote Leverage") +
    greeting(contactName || "there") +
    paragraph(
      `We're looking forward to working with <strong>${esc(companyName || "your organization")}</strong>. ` +
      `We'll handle everything related to your remote contractors so you can focus on growing your business.`
    ) +
    `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0;border:1px solid ${D.sectionBorder};border-radius:12px;overflow:hidden;">
      <tr><td style="padding:14px 16px;background:${D.section};border-bottom:1px solid ${D.sectionBorder};">
        <div style="font-weight:700;font-size:15px;color:${D.textHeading};">What we handle for you</div>
        <div style="font-size:12px;color:#6b7280;margin-top:2px;">Everything you need to manage your remote team, in one place.</div>
      </td></tr>
      <tr><td style="padding:0;background:${D.card};">
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:${D.card};">
          ${benefitRow("1", "Time Tracking & Monitoring", "Your contractors' work hours and productivity tracked via Time Doctor with full visibility.")}
          ${benefitRow("2", "Payroll Processing", "Contractor payments processed on schedule each pay cycle. No missed payments.")}
          ${benefitRow("3", "HR & Document Management", "Contracts, compliance docs, onboarding forms, and tax info — all managed.")}
          ${benefitRow("4", "Reporting & Dashboard", "A live dashboard showing hours worked, payments processed, and contractor status.")}
        </table>
      </td></tr>
    </table>` +
    `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
      <tr><td style="padding:14px 16px;background:${D.section};border-bottom:1px solid ${D.sectionBorder};">
        <div style="font-weight:700;font-size:15px;color:${D.textHeading};">Our Service Plans</div>
        <div style="font-size:12px;color:${D.textMuted};margin-top:2px;">During onboarding, you'll choose the plan that fits your needs.</div>
      </td></tr>
      <tr><td style="padding:16px;background:${D.card};">
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-spacing:0;">
          <tr>
            <td style="padding:12px;border:1px solid rgba(249,115,22,0.3);border-radius:10px;vertical-align:top;width:50%;background:rgba(249,115,22,0.05);">
              <div style="font-weight:700;font-size:13px;color:#f97316;">PPP - Performance &amp; Payroll</div>
              <div style="font-size:20px;font-weight:700;color:${D.textHeading};margin:4px 0;">$3,000<span style="font-size:12px;font-weight:400;color:${D.textMuted};">/VA/year</span></div>
              <div style="font-size:11px;color:${D.textMuted};line-height:1.5;">You pay contractors directly via Stripe. We handle time tracking, payroll, and HR.</div>
            </td>
            <td style="width:12px;"></td>
            <td style="padding:12px;border:1px solid rgba(147,51,234,0.3);border-radius:10px;vertical-align:top;width:50%;background:rgba(147,51,234,0.05);">
              <div style="font-weight:700;font-size:13px;color:#9333ea;">COR - Contractor of Record</div>
              <div style="font-size:20px;font-weight:700;color:${D.textHeading};margin:4px 0;">$4,200<span style="font-size:12px;font-weight:400;color:${D.textMuted};">/VA/year</span></div>
              <div style="font-size:11px;color:${D.textMuted};line-height:1.5;">We become the employer of record. One invoice, we handle payments and compliance.</div>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>` +
    paragraph(
      `To get started, we need a few details about your organization. ` +
      `It takes about <strong>5 minutes</strong> and you can save your progress anytime.`
    ) +
    primaryButton("Start Onboarding", onboardingUrl) +
    (() => {
      const steps = [
        "<strong>Step 1</strong> &mdash; Your company name, industry, and location",
        "<strong>Step 2</strong> &mdash; A primary contact for your account",
        "<strong>Step 3</strong> &mdash; Choose your service plan (PPP or COR)",
        "<strong>Step 4</strong> &mdash; Any extra notes or preferences",
        "<strong>Step 5</strong> &mdash; Quick review, then you're done!",
      ].map((s, i) => `<div style="padding:6px 0;font-size:13px;color:${D.text};${i < 4 ? `border-bottom:1px solid ${D.divider};` : ""}">${s}</div>`).join("");
      return card("Here's what we'll ask", steps);
    })() +
    `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0;border:1px solid #14532d;border-radius:10px;background:#0a1c0e;">
      <tr><td style="padding:14px 16px;">
        <div style="font-weight:600;font-size:13px;color:#4ade80;margin-bottom:6px;">After you submit:</div>
        <div style="font-size:12px;color:#86efac;line-height:1.7;">
          1. We set up your organization in our system (usually within 1 business day)<br/>
          2. You'll receive login credentials for your dashboard<br/>
          3. A quick identity verification (government ID + selfie, about 2 minutes)<br/>
          4. Start managing your team — add contractors, review timesheets, approve payroll
        </div>
      </td></tr>
    </table>` +
    paragraph(
      `This link is valid until <strong>${expiresStr}</strong>. If you have any questions at all, ` +
      `just reply to this email and a real person on our team will get back to you.`
    ) +
    paragraph("Looking forward to working together,<br/><strong>The Remote Leverage Team</strong>"),
    "This link is unique to your organization. Please do not share it publicly."
  );
}

/**
 * Internal payment link email — sent when RL admin has already collected all
 * org info internally. Client just needs to complete payment to unlock their dashboard.
 */
export function internalPaymentLinkEmail(
  contactName: string,
  companyName: string,
  paymentUrl: string,
  plan: string,
  vaCount: number,
  annualTotal: number,
  expiresAt: Date,
): string {
  const expiresStr = new Intl.DateTimeFormat("en-US", {
    month: "long", day: "numeric", year: "numeric",
  }).format(expiresAt);

  const planLabel = plan === "both" ? "PPP + COR" : plan === "ppp" ? "PPP — Performance & Payroll" : "COR — Contractor of Record";
  const planColor = plan === "cor" ? "#9333ea" : "#f97316";

  return layout(
    heading("Your Dashboard Is Ready") +
    greeting(contactName || "there") +
    paragraph(
      `We've finished setting up your <strong>${esc(companyName)}</strong> workspace on the Remote Leverage platform. ` +
      `One step left — complete your payment and you'll have immediate access to your dashboard.`
    ) +

    // Plan summary card
    `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0;border:1px solid ${D.sectionBorder};border-radius:12px;overflow:hidden;">
      <tr><td style="padding:16px;background:${D.section};">
        <div style="font-size:11px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;color:${D.textMuted};margin-bottom:12px;">Your Plan</div>
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
          <tr>
            <td style="vertical-align:top;">
              <div style="font-weight:700;font-size:15px;color:${planColor};">${esc(planLabel)}</div>
              <div style="font-size:12px;color:${D.textMuted};margin-top:3px;">${vaCount} contractor${vaCount !== 1 ? "s" : ""} · Annual plan</div>
            </td>
            <td style="text-align:right;vertical-align:top;">
              <div style="font-size:22px;font-weight:700;color:${D.textHeading};">$${annualTotal.toLocaleString()}</div>
              <div style="font-size:11px;color:${D.textMuted};">per year</div>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>` +

    // Payment options note
    `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0;border:1px solid ${D.sectionBorder};border-radius:12px;overflow:hidden;">
      <tr><td style="padding:14px 16px;background:${D.section};">
        <div style="font-weight:600;font-size:13px;color:${D.textHeading};margin-bottom:8px;">Choose how to pay</div>
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
          <tr>
            <td style="padding:6px 8px;background:rgba(0,176,187,0.08);border-radius:8px;text-align:center;width:30%;">
              <div style="font-size:12px;font-weight:600;color:#00b0bb;">ACH / Bank</div>
              <div style="font-size:10px;color:${D.textMuted};margin-top:2px;">No fee</div>
            </td>
            <td style="width:8px;"></td>
            <td style="padding:6px 8px;background:rgba(249,115,22,0.08);border-radius:8px;text-align:center;width:30%;">
              <div style="font-size:12px;font-weight:600;color:#f97316;">Credit Card</div>
              <div style="font-size:10px;color:${D.textMuted};margin-top:2px;">+3% fee</div>
            </td>
            <td style="width:8px;"></td>
            <td style="padding:6px 8px;background:rgba(147,51,234,0.08);border-radius:8px;text-align:center;width:30%;">
              <div style="font-size:12px;font-weight:600;color:#9333ea;">Splitit</div>
              <div style="font-size:10px;color:${D.textMuted};margin-top:2px;">3–6 months</div>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>` +

    primaryButton("Complete Payment", paymentUrl) +

    // What happens after
    `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0;border:1px solid #14532d;border-radius:10px;background:#0a1c0e;">
      <tr><td style="padding:14px 16px;">
        <div style="font-weight:600;font-size:13px;color:#4ade80;margin-bottom:6px;">Once payment is confirmed:</div>
        <div style="font-size:12px;color:#86efac;line-height:1.8;">
          1. You'll receive your login credentials immediately by email<br/>
          2. First login includes a quick 2-minute ID verification (Veriff)<br/>
          3. Your dashboard is live — add contractors, review timesheets, approve payroll
        </div>
      </td></tr>
    </table>` +

    paragraph(
      `This link expires <strong>${expiresStr}</strong>. If you have any questions, just reply to this email.`
    ) +
    paragraph("Looking forward to working together,<br/><strong>The Remote Leverage Team</strong>"),
    "This payment link is unique to your organization. Please do not share it publicly."
  );
}


/**
 * Offboarding notification email sent to the contractor when offboarding is initiated.
 */
export function offboardingNotificationEmail(
  name: string,
  opts: {
    endDate?: string;
    reason?: string;
    orgName?: string;
    timesheetNote?: boolean;
  }
): string {
  const orgLabel = opts.orgName ?? "Remote Leverage";
  const endDateStr = opts.endDate ?? "effective immediately";

  return layout(
    heading("Offboarding Notice") +
    greeting(name) +
    paragraph(
      `We are writing to inform you that your engagement with <strong>${esc(orgLabel)}</strong> is concluding as of <strong>${esc(endDateStr)}</strong>.`
    ) +
    (opts.reason
      ? paragraph(`<strong>Reason:</strong> ${esc(opts.reason)}`)
      : "") +
    card("What Happens Next", `
      ${dataRow("Last Working Day", esc(endDateStr))}
      ${dataRow("System Access", "Will be revoked within 24 hours of your last working day")}
      ${dataRow("Final Payment", "Any outstanding payments will be processed on the next scheduled payout date")}
    `) +
    (opts.timesheetNote
      ? highlightBox("yellow",
          "<strong>Important — Timesheet Reminder:</strong> Please ensure you submit your final timesheet before your last working day. " +
          "If your timesheet is not submitted by the next payout date, payment may not be processed on time."
        )
      : "") +
    highlightBox("blue",
      "<strong>Action Items Before Your Last Day:</strong><br/>" +
      "1. Submit any outstanding timesheets<br/>" +
      "2. Complete any pending deliverables or handoff documentation<br/>" +
      "3. Ensure your payment information is up to date for final payout"
    ) +
    paragraph(
      "If you have any questions about this process or your final payment, please reach out to your manager or the Remote Leverage operations team."
    ) +
    paragraph("Thank you for your contributions.<br/>The Remote Leverage Team")
  );
}

/**
 * Data retention notice sent to offboarded contractors before PII is scrubbed.
 */
export function dataRetentionNoticeEmail(
  name: string,
  scrubDate: string,
): string {
  return layout(
    heading("Data Retention Notice") +
    greeting(name) +
    paragraph(
      `As part of our data retention policy, your personal information associated with your previous engagement will be removed from our systems on <strong>${esc(scrubDate)}</strong> (30 days after offboarding).`
    ) +
    paragraph(
      "This includes personal contact details, banking information, and identification documents. " +
      "Payment records and timesheet history will be retained for accounting and compliance purposes."
    ) +
    paragraph(
      "If you need copies of any documents or records, please contact <a href=\"mailto:admin@remoteleverage.com\" style=\"color:#00B0BB;\">admin@remoteleverage.com</a> before the above date."
    ) +
    paragraph("Best regards,<br/>The Remote Leverage Team")
  );
}

// ─── Client Invoice Payment Request ─────────────────────────────────────────────

/**
 * Email sent to the client when a contractor timesheet is approved and
 * their org uses cor. Contains QB payment link + full breakdown.
 */
export function clientInvoicePaymentRequestEmail(opts: {
  clientName: string;
  invoiceNumber: string;
  periodName: string;
  periodStart: Date;
  periodEnd: Date;
  lineItems: Array<{
    employeeName: string;
    description: string;
    hoursWorked: number;
    hourlyRate: number;
    amount: number;
    bonusAmount?: number;
  }>;
  subtotal: number;
  rlFeeTotal: number;
  totalAmount: number;
  currency: string;
  paymentLink?: string;
  dueDate?: Date;
}): string {
  const fmtDate = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const fmtMoney = (n: number) =>
    `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const contractorRows = opts.lineItems
    .map((li) =>
      dataRow(
        esc(li.employeeName),
        `${li.hoursWorked}h @ $${li.hourlyRate}/hr${li.bonusAmount && li.bonusAmount > 0 ? ` + $${li.bonusAmount} bonus` : ""} = <strong>${fmtMoney(li.amount)}</strong>`,
      ),
    )
    .join("");

  const feeRow =
    opts.rlFeeTotal > 0
      ? dataRow("Management Fee", fmtMoney(opts.rlFeeTotal))
      : "";

  const totalRow = dataRow(
    "Total Due",
    `<span style="font-size:18px;font-weight:700;color:#111827;">${fmtMoney(opts.totalAmount)}</span>`,
  );

  const payButton = opts.paymentLink
    ? primaryButton("Pay Now", opts.paymentLink)
    : highlightBox(
        "yellow",
        "Payment link not available. Please contact <a href=\"mailto:admin@remoteleverage.com\" style=\"color:#92400e;\">admin@remoteleverage.com</a> to arrange payment.",
      );

  const dueDateNote = opts.dueDate
    ? paragraph(
        `Payment is due by <strong>${fmtDate(opts.dueDate)}</strong>. If you have questions about this invoice, reply to this email or reach out to your account manager.`,
      )
    : "";

  return (
    heading(`Invoice ${esc(opts.invoiceNumber)} — Payment Required`) +
    greeting(opts.clientName) +
    paragraph(
      `A payroll period has been processed and payment is now due for your contractors. ` +
      `Below is the breakdown for <strong>${esc(opts.periodName)}</strong> ` +
      `(${fmtDate(opts.periodStart)} — ${fmtDate(opts.periodEnd)}).`,
    ) +
    dataTable(contractorRows + (opts.rlFeeTotal > 0 ? `<tr><td colspan="2"><div style="border-top:1px solid #e5e7eb;margin:6px 0;"></div></td></tr>` : "") + feeRow + totalRow) +
    `<div style="margin:20px 0;"></div>` +
    payButton +
    dueDateNote +
    paragraph(
      "This invoice was generated automatically by HRIQ. Once your payment is received, " +
      "contractor payouts will be processed within 1 business day.",
    ) +
    paragraph("Thank you,<br/><strong>Remote Leverage Billing</strong>")
  );
}

// ─── Contractor Veriff KYC Email ─────────────────────────────────────────────

/** Identity verification email sent to a contractor via the Actions menu. */
export function contractorVeriffEmail(name: string, verificationUrl: string): string {
  return layout(
    heading("Verify Your Identity") +
    greeting(name) +
    paragraph(
      "As part of your onboarding with Remote Leverage, we need to verify your identity. " +
      "This is a quick, secure process handled by our verification partner Veriff and typically takes less than 2 minutes."
    ) +
    card("What You'll Need", `
      <div style="font-size:13px;color:${D.text};line-height:1.75;">
        A government-issued photo ID (passport, driver's license, or national ID)<br/>
        A device with a camera (phone or laptop with webcam)<br/>
        Good lighting for the selfie step
      </div>
    `) +
    `<div style="text-align:center;margin:24px 0;">` +
    primaryButton("Verify My Identity →", verificationUrl) +
    `</div>` +
    numberedStep(1, "Scan Your ID", "Take a clear photo of the front (and back if applicable) of your government-issued ID.") +
    numberedStep(2, "Take a Selfie", "A quick selfie to match your face to your ID photo, ensuring the identity is yours.") +
    numberedStep(3, "Automatic Review", "Veriff reviews your submission instantly. Most verifications are approved within minutes.") +
    highlightBox("blue", "<strong>This link expires in 7 days.</strong> If it expires, your coordinator can resend it from the dashboard.") +
    highlightBox("green",
      "<strong>Your privacy is protected.</strong> Identity verification is handled by Veriff, " +
      "a certified provider. Remote Leverage does not store your ID documents."
    ),
    "Questions? Reply to this email or contact your Remote Leverage coordinator. — Remote Leverage Team"
  );
}

// ─── Bulk Action: Dashboard Link Email ───────────────────────────────────────

/**
 * Email sent via bulk action giving contractors their dashboard login link.
 */
export function dashboardLinkEmail(
  name: string,
  dashboardUrl: string,
  orgName?: string,
): string {
  const brand = orgName ? esc(orgName) : "Remote Leverage";
  return layout(
    heading("Your Dashboard Link") +
    greeting(name) +
    paragraph(
      `Here's your link to access the <strong>${brand}</strong> dashboard. ` +
      "Use it to view your timesheets, payments, documents, and more."
    ) +
    primaryButton("Open Dashboard →", dashboardUrl) +
    dashboardFeatures() +
    highlightBox("blue",
      "<strong>Bookmark this link</strong> so you can access your dashboard anytime. " +
      "If you have trouble logging in, reach out to your coordinator."
    ),
    "— The Remote Leverage Team"
  );
}

// ─── Bulk Action: Custom / Generic Email ─────────────────────────────────────

/**
 * Generic branded email for bulk sends — admin provides subject + body.
 */
export function genericBulkEmail(
  name: string,
  bodyHtml: string,
  ctaLabel?: string,
  ctaUrl?: string,
): string {
  return layout(
    greeting(name) +
    paragraph(bodyHtml) +
    (ctaLabel && ctaUrl ? primaryButton(ctaLabel, ctaUrl) : ""),
    "— The Remote Leverage Team"
  );
}
