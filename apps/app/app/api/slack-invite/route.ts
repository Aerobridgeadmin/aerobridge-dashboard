import { NextRequest, NextResponse } from "next/server";
import { database } from "@repo/database";

/**
 * Single-use Slack invite redirect.
 * The welcome email links to /api/slack-invite?token=<uuid>.
 * On first click, we redirect to the real Slack invite URL and burn the token.
 * Subsequent clicks get a friendly "already used" page.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");

  if (!token) {
    return new NextResponse(errorPage("Invalid link", "This Slack invite link is missing a token."), {
      status: 400,
      headers: { "Content-Type": "text/html" },
    });
  }

  const slackInviteUrl = process.env.SLACK_INVITE_LINK;
  if (!slackInviteUrl) {
    return new NextResponse(errorPage("Configuration error", "Slack invite link is not configured. Please contact your administrator."), {
      status: 500,
      headers: { "Content-Type": "text/html" },
    });
  }

  // Atomically look up and burn the token in one operation to prevent double-use
  // updateMany with the token filter ensures only the first request succeeds
  const result = await database.employee.updateMany({
    where: { slackInviteToken: token },
    data: { slackInviteToken: null },
  });

  if (result.count === 0) {
    return new NextResponse(
      errorPage(
        "Link already used",
        "This Slack invite link has already been used. If you need a new invite, please contact your onboarding coordinator."
      ),
      { status: 410, headers: { "Content-Type": "text/html" } }
    );
  }

  // Redirect to the actual Slack invite URL
  return NextResponse.redirect(slackInviteUrl, 302);
}

function errorPage(title: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — Remote Leverage</title>
  <link rel="icon" href="/logo.png" type="image/png">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; background: linear-gradient(135deg, #f97316 0%, #ec4899 40%, #7c3aed 100%); padding: 20px; }
    .card { max-width: 440px; width: 100%; text-align: center; padding: 48px 36px; background: rgba(255,255,255,0.95); backdrop-filter: blur(12px); border-radius: 16px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); }
    .logo { display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 32px; }
    .logo img { width: 36px; height: 36px; border-radius: 6px; }
    .logo span { font-size: 18px; font-weight: 700; color: #111827; }
    .icon { width: 48px; height: 48px; margin: 0 auto 20px; background: #fef2f2; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
    .icon svg { width: 24px; height: 24px; color: #ef4444; }
    h1 { font-size: 22px; font-weight: 700; color: #111827; margin-bottom: 8px; }
    p { font-size: 15px; color: #6b7280; line-height: 1.7; }
    .contact { margin-top: 28px; padding-top: 20px; border-top: 1px solid #f3f4f6; }
    .contact a { display: inline-flex; align-items: center; gap: 6px; color: #7c3aed; text-decoration: none; font-weight: 600; font-size: 14px; transition: color 0.15s; }
    .contact a:hover { color: #6d28d9; }
    .footer { margin-top: 24px; font-size: 12px; color: rgba(255,255,255,0.7); }
    .footer a { color: rgba(255,255,255,0.9); text-decoration: none; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <img src="/logo.png" alt="Remote Leverage">
      <span>Remote Leverage</span>
    </div>
    <div class="icon">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"/></svg>
    </div>
    <h1>${title}</h1>
    <p>${message}</p>
    <div class="contact">
      <a href="mailto:maria@remoteleverage.com">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"/></svg>
        Contact your coordinator
      </a>
    </div>
  </div>
  <div class="footer">© ${new Date().getFullYear()} <a href="https://www.remoteleverage.com">Remote Leverage LLC</a></div>
</body>
</html>`;
}
