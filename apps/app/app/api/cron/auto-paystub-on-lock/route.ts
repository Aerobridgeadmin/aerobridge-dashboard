import { database } from "@repo/database";
import { NextResponse } from "next/server";

export const maxDuration = 120; // paystub PDF generation can be slow

/**
 * Nightly cron: auto-approve submitted timesheets in LOCKED periods and
 * generate + deliver paystubs for each.
 *
 * Why this exists:
 * ─────────────────
 * When an admin locks a timesheet period, `lockTimesheetPeriod` auto-submits
 * all drafts. However the regular `auto-approve-timesheets` cron explicitly
 * SKIPS locked periods (by design — it only processes open periods).
 * This cron fills the gap: at midnight the day after lock, it:
 *   1. Auto-approves every submitted timesheet in locked periods
 *   2. Creates a payment record for each
 *   3. Generates a PDF paystub and emails it to the contractor + processor
 *
 * Schedule: Daily at 8:00 AM UTC  →  vercel.json: "0 8 * * *"
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const results: Array<{
    employee: string;
    period: string;
    hours: number;
    amount: number;
    paystub: string;
  }> = [];
  const errors: string[] = [];

  try {
    // ── 1. Find all submitted timesheets sitting inside locked periods ──────
    //    These are the ones the regular auto-approve cron deliberately skips.
    const pendingSubmissions = await database.timesheetSubmission.findMany({
      where: {
        status: "submitted",
        period: { status: "locked" },
      },
      include: {
        period: { select: { id: true, name: true, startDate: true, endDate: true } },
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

    if (pendingSubmissions.length === 0) {
      return NextResponse.json({
        message: "No submitted timesheets in locked periods",
        processed: 0,
      });
    }

    // ── 2. For each submission: approve → create payment → generate paystub ─
    for (const sub of pendingSubmissions) {
      const emp = sub.employee;
      const name = `${emp.legalFirstName} ${emp.legalLastName}`;
      const hours = Number(sub.totalHours ?? 0);
      const rate = emp.hourlyRate ? Number(emp.hourlyRate) : 0;
      const bonusAmt = Number((sub as any).bonusTotal ?? 0);
      const amount = Math.round((hours * rate + bonusAmt) * 100) / 100;

      try {
        // ── 2a. Atomically approve + create payment ──────────────────────────
        let paymentId: string | null = null;

        await database.$transaction(async (tx: any) => {
          // Claim the timesheet (atomic status check prevents double-processing)
          const claimed = await tx.timesheetSubmission.updateMany({
            where: { id: sub.id, status: "submitted" },
            data: {
              status: "auto_approved",
              approvedAt: now,
              approvedByName: "Auto-Approved (Lock)",
            },
          });
          if (claimed.count === 0) return; // Already processed

          // Prevent duplicate payments for same employee + period
          const existing = await tx.payment.findFirst({
            where: {
              employeeId: emp.id,
              periodStart: sub.period.startDate,
              periodEnd: sub.period.endDate,
            },
            select: { id: true },
          });
          if (existing) {
            paymentId = existing.id;
            return;
          }

          const payment = await tx.payment.create({
            data: {
              employeeId: emp.id,
              paymentType: "salary",
              amount: String(amount),
              currency: emp.currency ?? "USD",
              periodStart: sub.period.startDate,
              periodEnd: sub.period.endDate,
              paymentDate: now,
              hoursWorked: String(hours),
              hourlyRate: String(rate),
              description:
                rate > 0
                  ? `${sub.period.name} — ${hours}h @ $${rate}/hr${bonusAmt > 0 ? ` + $${bonusAmt} bonus` : ""}`
                  : `${sub.period.name} — ${hours}h (no rate set)`,
              status: "completed",
              processedByName: "Auto-Paystub (Lock)",
            },
          });
          paymentId = payment.id;
        });

        if (!paymentId) {
          errors.push(`${name}: transaction returned no payment ID`);
          continue;
        }

        // ── 2b. Generate + deliver paystub (outside transaction, non-blocking) ─
        let paystubStatus = "skipped";
        try {
          const { generateAndDeliverPaystub } = await import(
            "@/app/actions/hriq/paystub"
          );
          const result = await generateAndDeliverPaystub(paymentId);
          paystubStatus =
            result && "error" in result ? `error: ${result.error}` : "delivered";
        } catch (psErr: any) {
          paystubStatus = `error: ${psErr.message}`;
          console.error(
            `[AutoPaystubLock] Paystub failed for ${name}:`,
            psErr.message
          );
        }

        // ── 2c. Email approval notification ──────────────────────────────────
        const email = (emp.personalEmail ?? emp.workEmail)?.trim();
        if (email) {
          try {
            const { sendViaGmailSystem } = await import(
              "@/app/actions/hriq/send-email"
            );
            const { timesheetApprovedEmail } = await import(
              "@/app/actions/hriq/email-templates"
            );
            const displayName = emp.preferredName ?? emp.legalFirstName;
            const html = timesheetApprovedEmail(
              displayName,
              sub.period.name,
              hours,
              amount > 0 ? amount : undefined,
              emp.currency ?? undefined
            );
            await sendViaGmailSystem(
              email,
              `Timesheet Auto-Approved — ${sub.period.name}`,
              html
            );
          } catch (emailErr: any) {
            console.error(
              `[AutoPaystubLock] Email failed for ${email}:`,
              emailErr.message
            );
          }
        }

        results.push({
          employee: name,
          period: sub.period.name,
          hours,
          amount,
          paystub: paystubStatus,
        });
      } catch (err: any) {
        // Swallow duplicate key errors from concurrent runs
        if (err.message?.includes("Unique constraint")) {
          results.push({
            employee: name,
            period: sub.period.name,
            hours,
            amount,
            paystub: "duplicate-skipped",
          });
        } else {
          console.error(`[AutoPaystubLock] Failed for ${name}:`, err);
          import("@/lib/hriq/sentry").then(({ captureServerException }) => captureServerException(err, { action: "autoPaystubOnLock", employeeId: emp.id })).catch(() => {});
          errors.push(`${name}: ${err.message}`);
        }
      }
    }

    return NextResponse.json({
      message: `Processed ${results.length} timesheets from locked periods`,
      processed: results.length,
      errors: errors.length > 0 ? errors : undefined,
      results,
    });
  } catch (err: any) {
    console.error("[AutoPaystubLock] Fatal error:", err);
    import("@/lib/hriq/sentry").then(({ captureServerException }) => captureServerException(err, { action: "autoPaystubOnLock" })).catch(() => {});
    return NextResponse.json(
      { error: err.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
