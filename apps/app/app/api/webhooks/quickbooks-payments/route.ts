/**
 * QuickBooks Payments Webhook Handler
 *
 * QB Payments sends a notification when a charge status changes.
 * We listen for SETTLED → mark AchCollection COLLECTED → unblock Wise payouts.
 * On DECLINED → mark FAILED, reschedule retry.
 *
 * Register this URL in Intuit Developer Portal:
 *   https://developer.intuit.com/app/developer/qbo/docs/develop/webhooks
 *   Entity: Charge, Events: Update
 *
 * Verification: same HMAC-SHA256 as QB accounting webhook.
 * Uses QB_WEBHOOK_VERIFIER_TOKEN env var (shared with /api/webhooks/quickbooks).
 */

import { createHmac } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { database } from "@repo/database";

function verifyQBSignature(
  payload: string,
  signature: string,
  token: string,
): boolean {
  const hmac = createHmac("sha256", token);
  hmac.update(payload);
  const expected = hmac.digest("base64");
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("intuit-signature") ?? "";
  const verifierToken = process.env.QB_WEBHOOK_VERIFIER_TOKEN ?? "";

  // Verify signature (skip if no token configured — dev only)
  if (verifierToken && !verifyQBSignature(body, signature, verifierToken)) {
    console.warn("[QB Payments Webhook] Invalid signature — ignoring");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // QB Payments webhook shape:
  // { "eventNotifications": [{ "realmId": "...", "dataChangeEvent": { "entities": [...] } }] }
  const notifications = payload?.eventNotifications ?? [];

  for (const notification of notifications) {
    const entities = notification?.dataChangeEvent?.entities ?? [];

    for (const entity of entities) {
      if (entity.name !== "Charge" && entity.name !== "Payment") continue;

      const chargeId = entity.id;
      if (!chargeId) continue;

      try {
        await handleChargeUpdate(chargeId);
      } catch (err: any) {
        console.error(`[QB Payments Webhook] Failed to handle charge ${chargeId}:`, err.message);
      }
    }
  }

  return NextResponse.json({ received: true });
}

async function handleChargeUpdate(qbChargeId: string) {
  // Find the AchCollection linked to this charge
  const collection = await database.achCollection.findFirst({
    where: { qbChargeId },
    include: { organization: { select: { name: true } } },
  });

  if (!collection) {
    console.log(`[QB Payments Webhook] No AchCollection for charge ${qbChargeId} — ignoring`);
    return;
  }

  // Already terminal — skip
  if (["COLLECTED", "PERMANENTLY_FAILED"].includes(collection.status)) {
    return;
  }

  // Fetch fresh charge status from QB
  const { getCharge, addBusinessDays } = await import(
    "@repo/integrations/quickbooks-payments"
  );
  const { getQBAccessToken } = await import(
    "@/app/actions/hriq/quickbooks"
  );

  const accessToken = await getQBAccessToken();
  if (!accessToken) {
    console.error("[QB Payments Webhook] QB not connected — cannot fetch charge status");
    return;
  }

  const charge = await getCharge(qbChargeId, accessToken);
  const orgName = (collection as any).organization?.name ?? collection.organizationId;

  if (charge.status === "SETTLED") {
    await database.achCollection.update({
      where: { id: collection.id },
      data: {
        status: "COLLECTED",
        collectedAt: new Date(),
        failureReason: null,
      },
    });

    console.info(
      `[QB Payments Webhook] ✅ ${orgName} ${collection.payPeriod}: ACH SETTLED — $${collection.amount} collected`,
    );

    // Post success to Slack ops channel
    const opsChannel = process.env.SLACK_OPS_CHANNEL ?? process.env.SLACK_NEW_HIRE_CHANNEL;
    if (opsChannel) {
      import("@repo/integrations/slack")
        .then(({ postSlackMessage }) =>
          postSlackMessage(
            opsChannel,
            `✅ *ACH collected* — ${orgName} (${collection.payPeriod})\n$${collection.amount} settled. Contractor Wise payouts are now unblocked.`,
          ),
        )
        .catch(() => {});
    }
  } else if (charge.status === "DECLINED" || charge.status === "CANCELLED") {
    const isLastRetry = collection.retryCount >= 2;
    const nextDate = addBusinessDays(new Date(), 1);

    await database.achCollection.update({
      where: { id: collection.id },
      data: {
        status: isLastRetry ? "PERMANENTLY_FAILED" : "FAILED",
        retryCount: { increment: 1 },
        failureReason: `QB charge ${charge.status}`,
        scheduledDate: isLastRetry ? undefined : nextDate,
      },
    });

    console.warn(
      `[QB Payments Webhook] ❌ ${orgName} ${collection.payPeriod}: charge ${charge.status} (retry ${collection.retryCount + 1}/3)`,
    );

    const opsChannel = process.env.SLACK_OPS_CHANNEL ?? process.env.SLACK_NEW_HIRE_CHANNEL;
    if (opsChannel) {
      const msg = isLastRetry
        ? `🚨 *ACH PERMANENTLY FAILED* — ${orgName} (${collection.payPeriod})\n$${collection.amount} DECLINED after 3 attempts. Wise payout blocked. Manual intervention required.`
        : `⚠️ *ACH charge declined* — ${orgName} (${collection.payPeriod})\n$${collection.amount} — retry ${collection.retryCount + 1}/3 scheduled for ${nextDate.toDateString()}`;

      import("@repo/integrations/slack")
        .then(({ postSlackMessage }) => postSlackMessage(opsChannel, msg))
        .catch(() => {});
    }
  } else {
    // PENDING, AUTHORIZED — still in-flight, no action needed
    console.log(`[QB Payments Webhook] Charge ${qbChargeId} status: ${charge.status} — waiting`);
  }
}
