/**
 * QuickBooks Webhook Handler
 *
 * QB sends POST notifications when entities (Invoice, Payment, etc.) change.
 * We listen for Invoice updates where Balance = 0 (fully paid) and then:
 *   1. Find the matching HRIQ ClientInvoice by qbInvoiceId
 *   2. Mark it as paid
 *   3. Trigger Wise payouts for all pending contractor payments in that period
 *
 * Verification: QB signs each webhook with HMAC-SHA256 using QB_WEBHOOK_VERIFIER_TOKEN.
 * Set QB_WEBHOOK_VERIFIER_TOKEN in Vercel env — it's shown once in the QB developer portal
 * when you create the webhook subscription.
 *
 * QB webhook docs: https://developer.intuit.com/app/developer/qbo/docs/develop/webhooks
 */

import { createHmac } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { database } from "@repo/database";

// ─── Signature Verification ──────────────────────────────────────────────────────

function verifyQBSignature(payload: string, signature: string, token: string): boolean {
  const hmac = createHmac("sha256", token);
  hmac.update(payload);
  const expected = hmac.digest("base64");
  // Constant-time comparison to prevent timing attacks
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

// ─── QB Invoice Fetch ────────────────────────────────────────────────────────────

async function fetchQBInvoice(qbInvoiceId: string, accessToken: string) {
  const companyId = process.env.QB_COMPANY_ID;
  if (!companyId) return null;

  const url = `https://quickbooks.api.intuit.com/v3/company/${companyId}/invoice/${qbInvoiceId}?minorversion=75`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    console.warn(`[QB Webhook] Failed to fetch invoice ${qbInvoiceId}: HTTP ${res.status}`);
    return null;
  }

  const data = await res.json();
  return data?.Invoice ?? null;
}

// ─── Handle a Single Invoice Update ─────────────────────────────────────────────

async function handleInvoiceUpdate(qbInvoiceId: string, realmId: string) {
  // Look up the matching HRIQ client invoice
  const clientInvoice = await database.clientInvoice.findFirst({
    where: { qbInvoiceId },
    select: {
      id: true,
      status: true,
      organizationId: true,
      periodStart: true,
      periodEnd: true,
      totalAmount: true,
    },
  });

  if (!clientInvoice) {
    console.info(`[QB Webhook] No HRIQ invoice found for QB invoice ${qbInvoiceId} — skipping`);
    return;
  }

  // If already paid or void in HRIQ, nothing to do
  if (clientInvoice.status === "paid" || clientInvoice.status === "void") {
    console.info(`[QB Webhook] HRIQ invoice ${clientInvoice.id} already ${clientInvoice.status} — skipping`);
    return;
  }

  // Fetch the live QB invoice to check its Balance
  const { getQBAccessToken } = await import("@/app/actions/hriq/quickbooks");
  const accessToken = await getQBAccessToken();
  if (!accessToken) {
    console.warn(`[QB Webhook] No QB access token — cannot verify invoice ${qbInvoiceId} balance`);
    return;
  }

  const qbInvoice = await fetchQBInvoice(qbInvoiceId, accessToken);
  if (!qbInvoice) {
    console.warn(`[QB Webhook] Could not fetch QB invoice ${qbInvoiceId}`);
    return;
  }

  const balance = Number(qbInvoice.Balance ?? 0);
  const totalAmt = Number(qbInvoice.TotalAmt ?? 0);

  // Invoice is paid when Balance reaches 0 and TotalAmt > 0
  if (balance !== 0 || totalAmt === 0) {
    console.info(`[QB Webhook] Invoice ${qbInvoiceId} not yet fully paid — Balance: ${balance}, Total: ${totalAmt}`);
    return;
  }

  console.info(`[QB Webhook] Invoice ${qbInvoiceId} is PAID. Marking HRIQ invoice ${clientInvoice.id} as paid and triggering Wise payouts.`);

  // Mark as paid in HRIQ using atomic update
  const marked = await database.clientInvoice.updateMany({
    where: {
      id: clientInvoice.id,
      status: { notIn: ["paid", "void"] },
    },
    data: {
      status: "paid",
      paidAt: new Date(),
      paymentMethod: "quickbooks",
      paymentReference: qbInvoiceId,
    },
  });

  if (marked.count === 0) {
    console.info(`[QB Webhook] HRIQ invoice ${clientInvoice.id} was already updated by a concurrent request — skipping payout trigger`);
    return;
  }

  // Check if org uses cor, then trigger Wise payouts
  try {
    const orgProfile = await database.organizationProfile.findUnique({
      where: { organizationId: clientInvoice.organizationId },
      select: { paymentMethod: true },
    });

    const pm = orgProfile?.paymentMethod;
    if (pm === "cor" || pm === "both") {
      const { triggerWisePayoutsForPaidInvoice } = await import("@/app/actions/hriq/quickbooks");
      const result = await triggerWisePayoutsForPaidInvoice(clientInvoice.id);
      console.info(
        `[QB Webhook] Wise payouts triggered for invoice ${clientInvoice.id}: ` +
        `${result.triggered} sent, ${result.failed} failed`,
      );
      if (result.failed > 0) {
        console.error("[QB Webhook] Payout failures:", result.errors);
      }
    } else {
      console.info(`[QB Webhook] Org payment method is "${pm}" — skipping Wise payouts`);
    }
  } catch (err) {
    console.error(`[QB Webhook] Failed to trigger Wise payouts for invoice ${clientInvoice.id}:`, err);
    // Don't rethrow — the invoice is already marked paid; payouts can be retried manually
  }

  // Audit log
  await database.auditLog.create({
    data: {
      action: "client_invoice.paid_via_qb_webhook",
      actorType: "system",
      actorDescription: "QuickBooks webhook",
      objectType: "client_invoice",
      objectId: clientInvoice.id,
      organizationId: clientInvoice.organizationId,
      newValue: {
        qbInvoiceId,
        realmId,
        balance,
        totalAmount: totalAmt,
        paidAt: new Date().toISOString(),
      },
    },
  }).catch((err) => console.error("[QB Webhook] Audit log failed:", err));
}

// ─── Route Handler ───────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const verifierToken = process.env.QB_WEBHOOK_VERIFIER_TOKEN;

  // Reject immediately if webhook token is not configured
  if (!verifierToken) {
    console.error("[QB Webhook] QB_WEBHOOK_VERIFIER_TOKEN is not set — rejecting webhook");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const signature = request.headers.get("intuit-signature") ?? "";
  const rawBody = await request.text();

  // Verify signature
  if (!verifyQBSignature(rawBody, signature, verifierToken)) {
    console.warn("[QB Webhook] Invalid signature — rejecting request");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // Parse payload
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // QB expects a 200 response quickly — process async after acknowledging
  // We process inline but with a timeout guard to avoid Vercel function timeouts
  const eventNotifications: any[] = payload?.eventNotifications ?? [];

  for (const notification of eventNotifications) {
    const realmId: string = notification?.realmId ?? "";
    const entities: any[] = notification?.dataChangeEvent?.entities ?? [];

    for (const entity of entities) {
      // We only care about Invoice updates
      if (entity?.name !== "Invoice") continue;
      if (entity?.operation !== "Update" && entity?.operation !== "Create") continue;

      const qbInvoiceId: string = entity?.id;
      if (!qbInvoiceId) continue;

      // Process non-blocking so we don't hold up the QB acknowledgement
      handleInvoiceUpdate(qbInvoiceId, realmId).catch((err) =>
        console.error(`[QB Webhook] handleInvoiceUpdate failed for QB invoice ${qbInvoiceId}:`, err),
      );
    }
  }

  // QB requires a 200 OK immediately to acknowledge receipt
  return NextResponse.json({ received: true });
}

// QB also sends a GET request to verify the webhook endpoint during setup
export async function GET(request: NextRequest) {
  // QB doesn't use a challenge parameter like Stripe — just return 200
  return NextResponse.json({ status: "ok" });
}
