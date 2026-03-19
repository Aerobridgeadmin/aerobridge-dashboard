import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const connectWebhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  if (!webhookSecret && !connectWebhookSecret) {
    console.error("[Stripe Webhook] No webhook secrets configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    console.error("[Stripe Webhook] STRIPE_SECRET_KEY not configured");
    return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
  }

  const stripe = new Stripe(stripeKey);

  // Try both secrets — account events use STRIPE_WEBHOOK_SECRET,
  // Connect events (direct charges on contractor accounts) use STRIPE_CONNECT_WEBHOOK_SECRET
  let event: Stripe.Event | null = null;
  const secrets = [webhookSecret, connectWebhookSecret].filter(Boolean) as string[];
  for (const secret of secrets) {
    try {
      event = stripe.webhooks.constructEvent(body, signature, secret);
      break;
    } catch {
      // Try next secret
    }
  }

  if (!event) {
    console.error("[Stripe Webhook] Signature verification failed with all secrets");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.payment_status === "paid") {
          if (session.metadata?.hriq_type === "onboarding_payment" && session.metadata?.hriq_onboarding_token) {
            const { completeExternalOnboarding } = await import("@/app/actions/hriq/org-onboarding");
            await completeExternalOnboarding(session.metadata.hriq_onboarding_token);
          } else if (session.metadata?.hriq_payment_model === "ppp" && session.metadata?.hriq_line_item_id) {
            // PPP direct charge on contractor's Express account — event comes from connected account
            const { handlePPPLineItemPayment } = await import("@/app/actions/hriq/stripe");
            await handlePPPLineItemPayment(session);
          } else if (session.metadata?.hriq_client_invoice_id) {
            const { handleClientInvoiceCheckoutCompleted } = await import("@/app/actions/hriq/stripe");
            await handleClientInvoiceCheckoutCompleted(session);
          } else {
            const { handleCheckoutCompleted } = await import("@/app/actions/hriq/stripe");
            await handleCheckoutCompleted(session);
          }
        }
        break;
      }

      case "checkout.session.async_payment_succeeded": {
        // For ACH / bank transfers that take time to process
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.metadata?.hriq_type === "onboarding_payment" && session.metadata?.hriq_onboarding_token) {
          const { completeExternalOnboarding } = await import("@/app/actions/hriq/org-onboarding");
          await completeExternalOnboarding(session.metadata.hriq_onboarding_token);
        } else if (session.metadata?.hriq_payment_model === "ppp" && session.metadata?.hriq_line_item_id) {
          const { handlePPPLineItemPayment } = await import("@/app/actions/hriq/stripe");
          await handlePPPLineItemPayment(session);
        } else if (session.metadata?.hriq_client_invoice_id) {
          const { handleClientInvoiceCheckoutCompleted } = await import("@/app/actions/hriq/stripe");
          await handleClientInvoiceCheckoutCompleted(session);
        } else {
          const { handleCheckoutCompleted } = await import("@/app/actions/hriq/stripe");
          await handleCheckoutCompleted(session);
        }
        break;
      }

      case "checkout.session.async_payment_failed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const payRunId = session.metadata?.hriq_pay_run_id;
        const clientInvoiceId = session.metadata?.hriq_client_invoice_id;
        if (clientInvoiceId) {
          const { database } = await import("@repo/database");
          // Only revert if not already paid (guard against out-of-order webhooks)
          await database.clientInvoice.updateMany({
            where: { id: clientInvoiceId, status: { not: "paid" } },
            data: { status: "sent" }, // Keep as sent, they can retry
          });
        } else if (payRunId) {
          const { database } = await import("@repo/database");
          await database.payRun.updateMany({
            where: { id: payRunId, status: { not: "completed" } },
            data: { status: "approved" },
          });
        }
        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        const payRunId = session.metadata?.hriq_pay_run_id;
        const clientInvoiceId = session.metadata?.hriq_client_invoice_id;
        const lineItemId = session.metadata?.hriq_line_item_id;

        // PPP per-contractor link expired — clear the payment link on the line item
        if (lineItemId && session.metadata?.hriq_payment_model === "ppp") {
          const { database } = await import("@repo/database");
          await database.clientInvoiceLineItem.updateMany({
            where: { id: lineItemId, paymentStatus: { not: "paid" } },
            data: { paymentLink: null, stripeCheckoutSessionId: null },
          });
        } else if (clientInvoiceId) {
          const { database } = await import("@repo/database");
          // Only clear if not already paid
          await database.clientInvoice.updateMany({
            where: { id: clientInvoiceId, status: { not: "paid" } },
            data: { paymentLink: null },
          });
        } else if (payRunId) {
          const { database } = await import("@repo/database");
          await database.payRun.updateMany({
            where: { id: payRunId, status: { not: "completed" } },
            data: {
              status: "approved",
              paymentLink: null,
            },
          });
        }
        break;
      }

      // Stripe Connect — contractor AND org account status changes
      case "account.updated": {
        const account = event.data.object as Stripe.Account;
        if (account.metadata?.hriq_employee_id || account.metadata?.hriq_org_id) {
          const { handleAccountUpdated } = await import("@/app/actions/hriq/stripe");
          await handleAccountUpdated(account);
        }
        break;
      }

      default: {
        // Stripe Connect — transfer status tracking (not in SDK’s typed union)
        const evtType = event.type as string;
        if (evtType === "transfer.paid" || evtType === "transfer.failed") {
          const transfer = event.data.object as Stripe.Transfer;
          const employeeId = transfer.metadata?.hriq_employee_id;
          const invoiceId = transfer.metadata?.hriq_client_invoice_id;
          if (employeeId && invoiceId) {
            console.info(`[Stripe Connect] Transfer ${transfer.id} ${evtType === "transfer.paid" ? "succeeded" : "failed"} — employee: ${employeeId}, invoice: ${invoiceId}`);
          }
        }
      }

    }
  } catch (err) {
    console.error(`[Stripe Webhook] Error processing ${event.type}:`, err);
    // Return 200 to prevent Stripe from retrying (we logged the error)
    return NextResponse.json({ received: true, error: "Processing failed" }, { status: 200 });
  }

  return NextResponse.json({ received: true });
}
