import { database } from "@repo/database";
import { NextResponse } from "next/server";

export const maxDuration = 60;

/**
 * Daily cron: auto-submit draft timesheets whose period deadline has passed.
 *
 * Deadline rule: 11:59 PM PST on the period end date.
 * This cron runs at 8:00 AM UTC (midnight PST) so any draft whose
 * period endDate is before today (in PST) gets auto-submitted.
 *
 * Schedule: Daily at 8:00 AM UTC → vercel.json: "0 8 * * *"
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // "Today" in PST — any period that ended before today is past deadline
  const todayPST = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });

  // Find all draft submissions whose period has ended
  const drafts = await database.timesheetSubmission.findMany({
    where: {
      status: { in: ["draft", "rejected"] },
      period: {
        endDate: { lt: new Date(todayPST + "T00:00:00Z") },
        status: { not: "locked" },
      },
      // Must have at least some hours logged
      totalHours: { gt: 0 },
    },
    select: {
      id: true,
      totalHours: true,
      employee: {
        select: {
          id: true,
          legalFirstName: true,
          legalLastName: true,
          preferredName: true,
          personalEmail: true,
          workEmail: true,
          hourlyRate: true,
          currency: true,
        },
      },
      period: { select: { name: true, startDate: true, endDate: true } },
    },
  });

  if (drafts.length === 0) {
    return NextResponse.json({ message: "No drafts to auto-submit", submitted: 0 });
  }

  const results: Array<{ name: string; period: string; hours: number; status: string }> = [];

  for (const draft of drafts) {
    const name = `${draft.employee.legalFirstName} ${draft.employee.legalLastName}`;
    const hours = Number(draft.totalHours);

    // Auto-approve deadline: 2 business days from now
    const autoApproveAt = new Date();
    let daysAdded = 0;
    while (daysAdded < 2) {
      autoApproveAt.setDate(autoApproveAt.getDate() + 1);
      const day = autoApproveAt.getDay();
      if (day !== 0 && day !== 6) daysAdded++;
    }

    try {
      // Atomic claim to prevent double-processing
      const claimed = await database.timesheetSubmission.updateMany({
        where: { id: draft.id, status: { in: ["draft", "rejected"] } },
        data: {
          status: "submitted",
          submittedAt: new Date(),
          autoApproveAt,
        },
      });

      if (claimed.count === 0) {
        results.push({ name, period: draft.period.name, hours, status: "skipped:already-modified" });
        continue;
      }

      // Send notification email
      const email = (draft.employee.personalEmail ?? draft.employee.workEmail)?.trim();
      if (email) {
        try {
          const { sendViaGmailSystem } = await import("@/app/actions/hriq/send-email");
          const { layout, heading, greeting, paragraph } = await import("@/app/actions/hriq/email-templates");
          const displayName = draft.employee.preferredName ?? draft.employee.legalFirstName;

          const html = layout(
            heading("Timesheet Auto-Submitted") +
            greeting(displayName) +
            paragraph(`Your timesheet for <strong>${draft.period.name}</strong> (${hours.toFixed(1)} hours) was automatically submitted because the deadline passed.`) +
            paragraph("If you need to make changes, please request an edit through your dashboard.")
          );

          await sendViaGmailSystem(email, `Timesheet Auto-Submitted — ${draft.period.name}`, html);
          results.push({ name, period: draft.period.name, hours, status: "submitted+emailed" });
        } catch (emailErr) {
          console.error(`[AutoSubmit] Email failed for ${email}:`, emailErr);
          results.push({ name, period: draft.period.name, hours, status: "submitted:email-failed" });
        }
      } else {
        results.push({ name, period: draft.period.name, hours, status: "submitted:no-email" });
      }

    } catch (err) {
      console.error(`[AutoSubmit] Failed for ${draft.id}:`, err);
      results.push({ name, period: draft.period.name, hours, status: "error" });
    }
  }

  return NextResponse.json({
    message: `Auto-submitted ${results.filter((r) => r.status.startsWith("submitted")).length} timesheets`,
    submitted: results.filter((r) => r.status.startsWith("submitted")).length,
    results,
  });
}
