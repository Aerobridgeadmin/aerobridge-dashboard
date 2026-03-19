import { database } from "@repo/database";
import { NextResponse } from "next/server";

export const maxDuration = 300;

/**
 * Daily cron: automatically audit all recently offboarded employees
 * against connected services (Slack, Google Workspace, Zoom, etc.)
 * to catch any accounts that weren't properly removed.
 *
 * Schedule: Daily at 6am UTC  vercel.json: "0 6 * * *"
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find offboarded employees from the last 30 days who still have email addresses
  // (after 30 days the PII scrub removes emails so we can't audit them)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const offboarded = await database.employee.findMany({
    where: {
      employmentStatus: "offboarded",
      endDate: { gte: thirtyDaysAgo },
      OR: [
        { workEmail: { not: null } },
        { personalEmail: { not: null } },
      ],
    },
    select: {
      id: true,
      legalFirstName: true,
      legalLastName: true,
      workEmail: true,
      personalEmail: true,
      endDate: true,
    },
    orderBy: { endDate: "desc" },
  });

  if (offboarded.length === 0) {
    return NextResponse.json({ message: "No recently offboarded employees to audit", audited: 0 });
  }

  // Determine the app URL for internal API calls
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  let audited = 0;
  let totalFlags = 0;
  const results: Array<{ name: string; email: string; flags: number; status: string }> = [];

  for (const emp of offboarded) {
    const email = emp.workEmail ?? emp.personalEmail;
    if (!email) continue;

    const name = `${emp.legalFirstName} ${emp.legalLastName}`;

    try {
      const res = await fetch(`${appUrl}/api/offboarding-audit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.CRON_SECRET}`,
        },
        body: JSON.stringify({
          employee_email: email.trim().toLowerCase(),
          employee_name: name,
          initiated_by: "daily_cron",
        }),
      });

      const data = await res.json();
      if (data.error) {
        results.push({ name, email, flags: 0, status: `error: ${data.error}` });
      } else {
        const flags = data.total_flags ?? 0;
        totalFlags += flags;
        audited++;
        results.push({ name, email, flags, status: flags > 0 ? "flagged" : "clear" });
      }
    } catch (err) {
      results.push({ name, email, flags: 0, status: `error: ${err instanceof Error ? err.message : "unknown"}` });
    }
  }

  return NextResponse.json({
    message: `Audited ${audited} offboarded employees — ${totalFlags} total flags found`,
    audited,
    totalFlags,
    totalEmployees: offboarded.length,
    results,
  });
}
