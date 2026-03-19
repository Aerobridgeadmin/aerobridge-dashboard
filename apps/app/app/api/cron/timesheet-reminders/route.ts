import { database } from "@repo/database";
import { NextResponse } from "next/server";

export const maxDuration = 120;

/**
 * Weekly cron: email contractors who haven't submitted timesheets for open periods.
 * Schedule: Every Monday at 9am UTC  vercel.json: "0 9 * * 1"
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get only the CURRENT open period (started but not yet ended)
  const now = new Date();
  const openPeriods = await database.timesheetPeriod.findMany({
    where: {
      status: "open",
      startDate: { lte: now },  // Period has started
    },
    include: {
      submissions: { select: { employeeId: true } },
      organization: { select: { id: true, name: true } },
    },
  });

  if (openPeriods.length === 0) {
    return NextResponse.json({ message: "No open periods", sent: 0 });
  }

  // Hoist imports outside the loop to avoid repeated dynamic import overhead
  const { sendViaGmailSystem } = await import("@/app/actions/hriq/send-email");
  const { timesheetStartReminderEmail } = await import("@/app/actions/hriq/email-templates");

  let totalSent = 0;
  const results: Array<{ name: string; period: string; status: string }> = [];

  // Collect all emails to send across all periods first, then batch
  const emailJobs: Array<{ fullName: string; periodName: string; email: string; firstName: string; startLabel: string; endLabel: string }> = [];

  for (const period of openPeriods) {
    const submittedEmployeeIds = new Set(period.submissions.map((s: any) => s.employeeId));

    // Get active contractors in this org who haven't started their timesheet
    const missingContractors = await database.employee.findMany({
      where: {
        organizationId: period.organizationId,
        employmentStatus: "active",
        linkedUserId: { not: null },
        id: { notIn: Array.from(submittedEmployeeIds) },
      },
      select: {
        legalFirstName: true,
        legalLastName: true,
        preferredName: true,
        personalEmail: true,
        workEmail: true,
        linkedUserId: true,
      },
    });

    // Only email contractors who have actually logged in at least once
    const loggedInUsers = await database.appUser.findMany({
      where: {
        supabaseUserId: { in: missingContractors.map((c: any) => c.linkedUserId).filter(Boolean) },
        loginCount: { gt: 0 },
      },
      select: { supabaseUserId: true },
    });
    const loggedInSet = new Set(loggedInUsers.map((u: any) => u.supabaseUserId));
    const filteredContractors = missingContractors.filter((c: any) => loggedInSet.has(c.linkedUserId));

    for (const contractor of filteredContractors) {
      const email = (contractor.personalEmail ?? contractor.workEmail)?.trim();
      if (!email) continue;
      emailJobs.push({
        fullName: `${contractor.legalFirstName} ${contractor.legalLastName}`,
        periodName: period.name,
        email,
        firstName: contractor.preferredName ?? contractor.legalFirstName,
        startLabel: new Date(period.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        endLabel: new Date(period.endDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      });
    }
  }

  // Send in batches of 10 concurrently to stay within Gmail rate limits and timeout
  const BATCH_SIZE = 10;
  for (let i = 0; i < emailJobs.length; i += BATCH_SIZE) {
    const batch = emailJobs.slice(i, i + BATCH_SIZE);
    const settled = await Promise.allSettled(
      batch.map(async (job) => {
        const html = timesheetStartReminderEmail(job.firstName, job.periodName, job.startLabel, job.endLabel);
        await sendViaGmailSystem(job.email, `Time to Fill Out Your Timesheet — ${job.periodName}`, html);
        return job;
      })
    );
    for (let j = 0; j < settled.length; j++) {
      const outcome = settled[j];
      const job = batch[j];
      if (outcome.status === "fulfilled") {
        totalSent++;
        results.push({ name: job.fullName, period: job.periodName, status: "sent" });
      } else {
        results.push({ name: job.fullName, period: job.periodName, status: `error:${outcome.reason instanceof Error ? outcome.reason.message : "unknown"}` });
      }
    }
  }

  return NextResponse.json({
    message: `Sent ${totalSent} timesheet reminders`,
    sent: totalSent,
    results,
  });
}
