import { database } from "@repo/database";
import { NextResponse } from "next/server";

export const maxDuration = 30;

/**
 * Daily cron: auto-close pay periods whose end date has passed.
 *
 * Closes "open" periods where:
 *   - endDate was 3+ days ago (grace period for late submissions)
 *   - No "draft" submissions remain (drafts should be auto-submitted first)
 *
 * This prevents stale periods from cluttering the timesheet dropdown
 * and ensures contractors can only submit to current/recent periods.
 *
 * Schedule: Daily at 5am UTC  vercel.json: "0 5 * * *"
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Grace period: 3 days after period end before auto-closing
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 3);

  // Find open periods that ended before the cutoff
  const stalePeriods = await database.timesheetPeriod.findMany({
    where: {
      status: "open",
      endDate: { lt: cutoff },
    },
    include: {
      submissions: {
        where: { status: "draft" },
        select: { id: true },
      },
    },
  });

  if (stalePeriods.length === 0) {
    return NextResponse.json({ message: "No periods to close", closed: 0 });
  }

  let closed = 0;
  let skipped = 0;
  const results: Array<{ name: string; orgId: string; status: string }> = [];

  for (const period of stalePeriods) {
    // Don't close if there are still drafts (auto-submit cron should handle them first)
    if (period.submissions.length > 0) {
      skipped++;
      results.push({ name: period.name, orgId: period.organizationId, status: `skipped:${period.submissions.length}-drafts-remaining` });
      continue;
    }

    try {
      await database.timesheetPeriod.update({
        where: { id: period.id },
        data: { status: "closed" },
      });
      closed++;
      results.push({ name: period.name, orgId: period.organizationId, status: "closed" });
    } catch (err) {
      results.push({ name: period.name, orgId: period.organizationId, status: `error:${err instanceof Error ? err.message : "unknown"}` });
    }
  }

  return NextResponse.json({
    message: `Closed ${closed} stale periods (${skipped} skipped)`,
    closed,
    skipped,
    results,
  });
}
