import { NextResponse } from "next/server";
import { database } from "@repo/database";

export const maxDuration = 60;

/**
 * Daily cron: fire ACH charges for all COR client orgs where scheduledDate <= today.
 *
 * Flow per collection:
 *   1. Find SCHEDULED collections due today
 *   2. Atomically mark PROCESSING (updateMany prevents double-run)
 *   3. Call QB Payments API to initiate ACH debit
 *   4. Store chargeId — stays PROCESSING until webhook confirms SETTLED/DECLINED
 *   5. On API failure: mark FAILED, reschedule next business day (up to 3 retries)
 *      After 3 retries: PERMANENTLY_FAILED + Slack alert
 *
 * Schedule: '0 12 * * *' UTC (9am Santiago, UTC-3)
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date();
  today.setHours(23, 59, 59, 999);

  const { createAchCharge, addBusinessDays } = await import(
    "@repo/integrations/quickbooks-payments"
  );
  const { getQBAccessToken } = await import(
    "@/app/actions/hriq/quickbooks"
  );
  const accessToken = await getQBAccessToken();

  if (!accessToken) {
    console.error("[ACH Cron] QuickBooks not connected — skipping");
    return NextResponse.json({ error: "QB not connected" }, { status: 200 });
  }

  // Find all due SCHEDULED collections (also retry FAILED ones rescheduled to today)
  const due = await database.achCollection.findMany({
    where: {
      status: { in: ["SCHEDULED", "FAILED"] },
      scheduledDate: { lte: today },
      retryCount: { lt: 3 },
    },
    include: {
      organization: {
        select: { name: true, qbBankAccountToken: true },
      },
    },
  });

  console.info(`[ACH Cron] Found ${due.length} collections due`);

  let fired = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const col of due) {
    const org = (col as any).organization;

    if (!org?.qbBankAccountToken) {
      console.warn(`[ACH Cron] ${org?.name ?? col.organizationId}: no bank token — skipping`);
      errors.push(`${org?.name}: no bank account token`);
      skipped++;
      continue;
    }

    // Idempotency key: collectionId + retryCount (new key per retry attempt)
    const idempotencyKey = `${col.id}-${col.retryCount}`;

    // Atomically claim: only proceed if still in expected status
    const claimed = await database.achCollection.updateMany({
      where: { id: col.id, status: { in: ["SCHEDULED", "FAILED"] } },
      data: { status: "PROCESSING", idempotencyKey },
    });

    if (claimed.count === 0) {
      // Another run got here first
      skipped++;
      continue;
    }

    try {
      const charge = await createAchCharge(
        {
          amount: col.amount,
          currency: "USD",
          bankToken: org.qbBankAccountToken,
          description: `HRIQ payroll ${col.payPeriod} - ${org.name}`,
          idempotencyKey,
        },
        accessToken,
      );

      // Store charge ID — status stays PROCESSING until webhook fires
      await database.achCollection.update({
        where: { id: col.id },
        data: { qbChargeId: charge.id },
      });

      console.info(`[ACH Cron] ${org.name} ${col.payPeriod}: charge ${charge.id} initiated (${charge.status})`);
      fired++;
    } catch (err: any) {
      console.error(`[ACH Cron] ${org.name} ${col.payPeriod}: charge failed —`, err.message);

      const isLastRetry = col.retryCount >= 2;
      const nextDate = addBusinessDays(new Date(), 1);

      await database.achCollection.update({
        where: { id: col.id },
        data: {
          status: isLastRetry ? "PERMANENTLY_FAILED" : "FAILED",
          retryCount: { increment: 1 },
          failureReason: err.message,
          scheduledDate: isLastRetry ? undefined : nextDate,
        },
      });

      // Slack alert for every failure
      const alertMsg = isLastRetry
        ? `🚨 *ACH PERMANENTLY FAILED* — ${org.name} (${col.payPeriod})\n$${col.amount} — 3 retries exhausted. Wise payout blocked. Manual intervention required.`
        : `⚠️ *ACH charge failed* — ${org.name} (${col.payPeriod})\n$${col.amount} — retry ${col.retryCount + 1}/3 scheduled for ${nextDate.toDateString()}\nReason: ${err.message}`;

      const opsChannel = process.env.SLACK_OPS_CHANNEL ?? process.env.SLACK_NEW_HIRE_CHANNEL;
      if (opsChannel) {
        import("@repo/integrations/slack")
          .then(({ postSlackMessage }) => postSlackMessage(opsChannel, alertMsg))
          .catch(() => {});
      }

      errors.push(`${org.name}: ${err.message}`);
      failed++;
    }
  }

  return NextResponse.json({
    fired,
    skipped,
    failed,
    errors,
    total: due.length,
  });
}
