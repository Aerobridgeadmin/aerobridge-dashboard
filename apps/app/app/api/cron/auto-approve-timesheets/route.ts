import { database } from "@repo/database";
import { NextResponse } from "next/server";

export const maxDuration = 60;

/**
 * Daily cron: auto-approve timesheets that have passed their autoApproveAt deadline.
 * The autoApproveAt is set to 2 business days after submission.
 * If no admin reviews within that window, the timesheet is auto-approved.
 *
 * Schedule: Daily at 6am UTC  vercel.json: "0 6 * * *"
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  // Find all submitted timesheets past their auto-approve deadline
  // Exclude submissions in locked periods (locked periods should not be auto-approved)
  const overdue = await database.timesheetSubmission.findMany({
    where: {
      status: "submitted",
      autoApproveAt: { lte: now },
      period: { status: { not: "locked" } },
    },
    include: {
      period: { select: { name: true, startDate: true, endDate: true } },
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
    },
  });

  if (overdue.length === 0) {
    return NextResponse.json({ message: "No timesheets to auto-approve", approved: 0 });
  }

  // Approve each timesheet atomically with its payment record to prevent orphans.
  // If the cron times out midway, un-processed timesheets stay as "submitted"
  // and will be picked up on the next run.
  const results: Array<{ name: string; period: string; hours: number; status: string }> = [];

  for (const sub of overdue) {
    const name = sub.employee.preferredName ?? sub.employee.legalFirstName;
    const email = (sub.employee.personalEmail ?? sub.employee.workEmail)?.trim();
    const hours = Number(sub.totalHours);
    const rate = sub.employee.hourlyRate ? Number(sub.employee.hourlyRate) : 0;
    const bonusAmt = Number((sub as any).bonusTotal ?? 0);
    const estimatedPay = hours * rate + bonusAmt;

    // Atomically: approve timesheet + create payment in one transaction
    try {
      const amount = Math.round((hours * rate + bonusAmt) * 100) / 100;
      await database.$transaction(async (tx: any) => {
        // Claim the timesheet (atomic status check prevents double-processing)
        const claimed = await tx.timesheetSubmission.updateMany({
          where: { id: sub.id, status: "submitted" },
          data: { status: "auto_approved", approvedAt: now, approvedByName: "Auto-Approved" },
        });
        if (claimed.count === 0) return; // Already processed by another run

        const existing = await tx.payment.findFirst({
          where: { employeeId: sub.employeeId, periodStart: sub.period.startDate, periodEnd: sub.period.endDate },
          select: { id: true },
        });
        if (existing) return; // Payment already exists

        await tx.payment.create({
          data: {
            employeeId: sub.employeeId,
            paymentType: "salary",
            amount: String(amount),
            currency: sub.employee.currency ?? "USD",
            periodStart: sub.period.startDate,
            periodEnd: sub.period.endDate,
            hoursWorked: String(hours),
            hourlyRate: String(rate),
            description: rate > 0
              ? `${sub.period.name} — ${hours}h @ $${rate}/hr${bonusAmt > 0 ? ` + $${bonusAmt} bonus` : ""}`
              : `${sub.period.name} — ${hours}h (no rate set)`,
            status: "pending",
            processedByName: "Auto-Approved",
          },
        });
      });
    } catch (payErr) {
      // Swallow duplicate key errors from concurrent runs
      if (payErr instanceof Error && payErr.message.includes("Unique constraint")) { /* skip */ }
      else {
        console.error(`[AutoApprove] Payment creation failed for ${sub.employeeId}:`, payErr);
        import("@/lib/hriq/sentry").then(({ captureServerException }) => captureServerException(payErr, { action: "autoApproveTimesheets", employeeId: sub.employeeId })).catch(() => {});
      }
    }

    if (email) {
      try {
        const { sendViaGmailSystem } = await import("@/app/actions/hriq/send-email");
        const { timesheetApprovedEmail } = await import("@/app/actions/hriq/email-templates");
        const html = timesheetApprovedEmail(name, sub.period.name, hours, estimatedPay > 0 ? estimatedPay : undefined, sub.employee.currency ?? undefined);
        const subject = `Timesheet Auto-Approved — ${sub.period.name}`;
        await sendViaGmailSystem(email, subject, html);
        results.push({ name: `${sub.employee.legalFirstName} ${sub.employee.legalLastName}`, period: sub.period.name, hours, status: "approved+emailed" });
      } catch (err) {
        console.error(`[AutoApprove] Email failed for ${email}:`, err);
        results.push({ name: `${sub.employee.legalFirstName} ${sub.employee.legalLastName}`, period: sub.period.name, hours, status: "approved:email-failed" });
      }
    } else {
      results.push({ name: `${sub.employee.legalFirstName} ${sub.employee.legalLastName}`, period: sub.period.name, hours, status: "approved:no-email" });
    }
  }

  // Housekeeping: clean up expired/used login verification codes (>24 hours old)
  let verificationsCleaned = 0;
  try {
    const result = await database.loginVerification.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
          { usedAt: { not: null }, createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        ],
      },
    });
    verificationsCleaned = result.count;
  } catch (err) {
    console.error("[AutoApprove] Login verification cleanup failed:", err);
  }

  return NextResponse.json({
    message: `Auto-approved ${overdue.length} timesheets`,
    approved: overdue.length,
    verificationsCleaned,
    results,
  });
}
