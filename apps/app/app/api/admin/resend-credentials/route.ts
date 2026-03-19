import { database } from "@repo/database";
import { NextResponse } from "next/server";

export const maxDuration = 120;

/**
 * POST /api/admin/resend-credentials
 * Resend dashboard credential emails to contractors who never received them.
 * Body: { emails: string[] } — personal emails to resend to
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const emails: string[] = body.emails ?? [];
  if (!emails.length) return NextResponse.json({ error: "No emails provided" }, { status: 400 });

  const DEFAULT_PASSWORD = process.env.HRIQ_DEFAULT_PASSWORD ?? "RL2025!";
  const APP_URL = process.env.APP_URL ?? "https://hriq.remoteleverage.com";

  const employees = await database.employee.findMany({
    where: {
      personalEmail: { in: emails, mode: "insensitive" },
      employmentStatus: "active",
      linkedUserId: { not: null },
    },
    select: {
      id: true,
      legalFirstName: true,
      legalLastName: true,
      personalEmail: true,
      workEmail: true,
      linkedUserId: true,
    },
  });

  const { sendViaGmailSystem } = await import("@/app/actions/hriq/send-email");
  const { credentialsBox, layout, heading, paragraph } = await import("@/app/actions/hriq/email-templates");

  const results: { name: string; email: string; status: string }[] = [];

  for (const emp of employees) {
    const email = (emp.personalEmail ?? emp.workEmail)?.trim();
    if (!email) { results.push({ name: `${emp.legalFirstName} ${emp.legalLastName}`, email: "none", status: "skipped_no_email" }); continue; }

    const loginEmail = (emp.workEmail ?? emp.personalEmail)?.trim().toLowerCase() ?? "";
    const name = emp.legalFirstName ?? "Contractor";

    const html = layout(`
      ${heading(`Hi ${name} — Your Dashboard Is Ready`)}
      ${paragraph(`Your Remote Leverage contractor dashboard has been set up. Use the credentials below to log in and access your timesheets, payments, documents, and more.`)}
      ${credentialsBox(loginEmail, DEFAULT_PASSWORD, undefined, APP_URL)}
      ${paragraph(`After logging in for the first time, we strongly recommend changing your password in Settings.`)}
      ${paragraph(`If you have any questions, reply to this email or reach out on Slack.`)}
    `);

    try {
      await sendViaGmailSystem(email, "Your Remote Leverage Dashboard Credentials", html);
      results.push({ name: `${emp.legalFirstName} ${emp.legalLastName}`, email, status: "sent" });
    } catch (err: any) {
      results.push({ name: `${emp.legalFirstName} ${emp.legalLastName}`, email, status: `error: ${err.message?.slice(0, 100)}` });
    }

    // 1s delay between sends to stay under rate limits
    await new Promise((r) => setTimeout(r, 1000));
  }

  return NextResponse.json({ sent: results.filter((r) => r.status === "sent").length, total: results.length, results });
}
