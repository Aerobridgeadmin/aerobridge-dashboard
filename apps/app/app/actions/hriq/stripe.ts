"use server";

import Stripe from "stripe";
import { database } from "@repo/database";
import { requireRole } from "@repo/auth/session";
import { revalidatePath } from "next/cache";
import { HriqError } from "@/lib/hriq/errors";
import { hours as fmtHoursDisplay } from "@/lib/hriq/format";

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe is not configured. Add STRIPE_SECRET_KEY to environment variables.");
  return new Stripe(key);
}

//  Ensure Stripe Customer exists for an org 

export async function ensureStripeCustomer(orgId: string): Promise<string> {
  try {
    const org = await database.organization.findUnique({
      where: { id: orgId },
      include: { profile: true },
    });
    if (!org) throw new Error("Organization not found");

    if (org.stripeCustomerId) return org.stripeCustomerId;

    const stripe = getStripe();
    const customer = await stripe.customers.create({
      name: org.name,
      email: org.profile?.billingEmail ?? org.profile?.adminEmail ?? undefined,
      metadata: {
        hriq_org_id: org.id,
        hriq_org_slug: org.slug,
      },
    });

    await database.organization.update({
      where: { id: orgId },
      data: { stripeCustomerId: customer.id },
    });

    return customer.id;

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[stripe.ts:ensureStripeCustomer]", _msg);
    throw new Error(_msg);
  }
}

//  Handle Stripe Webhook: checkout.session.completed 

export async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const payRunId = session.metadata?.hriq_pay_run_id;
  if (!payRunId) {
    console.warn("[Stripe] checkout.session.completed without hriq_pay_run_id metadata");
    return;
  }

  const payRun = await database.payRun.findUnique({
    where: { id: payRunId },
    select: { id: true, status: true },
  });

  if (!payRun) {
    console.error(`[Stripe] Pay run ${payRunId} not found`);
    return;
  }

  if (payRun.status === "completed") return;

  // Atomically claim the pay run to prevent double-processing from webhook retries
  const claimed = await database.payRun.updateMany({
    where: { id: payRunId, status: { not: "completed" } },
    data: {
      stripePaymentIntentId: session.payment_intent as string ?? null,
    },
  });
  if (claimed.count === 0) return;

  try {
    const { completePayRunInternal } = await import("./pay-runs-internal");
    await completePayRunInternal(payRunId);
  } catch (err) {
    console.error(`[Stripe] Failed to complete pay run ${payRunId}:`, err);
  }

  revalidatePath("/[orgSlug]/payroll", "page");
  revalidatePath("/[orgSlug]/payments", "page");
}

//  Create Checkout Session for a Client Invoice 
// Returns { url } on success or { error } on failure (never throws — safe for Next.js server actions)
// For COR orgs: single platform charge, RL transfers to contractors.
// For PPP orgs: use createPPPPaymentLinks instead (per-contractor direct charges).

export async function createClientInvoiceCheckout(invoiceId: string): Promise<{ url: string } | { error: string }> {
  try {
    await requireRole("super_admin");
  } catch (err: any) {
    console.error("[Stripe] Auth failed for createClientInvoiceCheckout:", err.message);
    return { error: `Permission denied: ${err.message}` };
  }

  try {
    const stripe = getStripe();

    const invoice = await database.clientInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        organization: { include: { profile: true } },
        lineItems: {
          include: {
            employee: { select: { legalFirstName: true, legalLastName: true } },
          },
        },
      },
    });

    if (!invoice) return { error: "Invoice not found" };
    if (invoice.status === "paid") return { error: "Invoice is already paid" };
    if (invoice.status === "void") return { error: "Cannot pay a voided invoice" };
    if (invoice.lineItems.length === 0) return { error: "Invoice has no line items" };

    // PPP orgs should use createPPPPaymentLinks, not this function
    if (invoice.organization.profile?.paymentMethod === "ppp") {
      return { error: "PPP invoices use per-contractor payment links. Use createPPPPaymentLinks instead." };
    }

    const totalCents = Math.round(Number(invoice.totalAmount) * 100);
    if (!Number.isFinite(totalCents) || totalCents <= 0) {
      return { error: `Invoice total amount is invalid: $${invoice.totalAmount}` };
    }

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

    for (const li of invoice.lineItems) {
      const amountCents = Math.round(Number(li.amount) * 100);
      if (!Number.isFinite(amountCents) || amountCents <= 0) {
        return { error: `Invalid line item amount for ${li.employee.legalFirstName} ${li.employee.legalLastName}: $${li.amount}` };
      }
      lineItems.push({
        price_data: {
          currency: invoice.currency.toLowerCase(),
          product_data: {
            name: `${li.employee.legalFirstName} ${li.employee.legalLastName}`,
            description: li.description ?? `Contractor payment — ${invoice.periodName ?? ""}`,
          },
          unit_amount: amountCents,
        },
        quantity: 1,
      });
    }

    if (Number(invoice.rlFeeTotal) > 0) {
      lineItems.push({
        price_data: {
          currency: invoice.currency.toLowerCase(),
          product_data: {
            name: "Management Fee",
            description: `Remote Leverage HR services${invoice.rlFeeType === "percentage" && invoice.rlFeeAmount ? ` (${Number(invoice.rlFeeAmount)}%)` : ""}`,
          },
          unit_amount: Math.round(Number(invoice.rlFeeTotal) * 100),
        },
        quantity: 1,
      });
    }

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_WEB_URL || "").replace(/\/+$/, "") || "https://hriq.remoteleverage.com";
    const customerId = await ensureStripeCustomer(invoice.organizationId);

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card", "us_bank_account"],
      line_items: lineItems,
      mode: "payment",
      success_url: `${appUrl}/${invoice.organization.slug}/payments/external?invoice=${invoiceId}&payment=success`,
      cancel_url: `${appUrl}/${invoice.organization.slug}/payments/external?invoice=${invoiceId}&payment=cancelled`,
      metadata: {
        hriq_client_invoice_id: invoiceId,
        hriq_org_id: invoice.organizationId,
        hriq_invoice_number: invoice.invoiceNumber,
        hriq_payment_model: "cor",
      },
      payment_intent_data: {
        metadata: {
          hriq_client_invoice_id: invoiceId,
          hriq_org_id: invoice.organizationId,
          hriq_invoice_number: invoice.invoiceNumber,
        },
        description: `Invoice ${invoice.invoiceNumber} — ${invoice.organization.name}`,
      },
      expires_at: Math.floor(Date.now() / 1000) + 1800,
    });

    await database.clientInvoice.updateMany({
      where: { id: invoiceId, status: { notIn: ["paid", "void"] } },
      data: {
        stripeCheckoutSessionId: session.id,
        stripePaymentIntentId: (session.payment_intent as string) ?? null,
        paymentLink: session.url,
        status: invoice.status === "draft" ? "sent" : invoice.status,
      },
    });

    return { url: session.url! };
  } catch (err: any) {
    console.error("[Stripe] createClientInvoiceCheckout failed:", err.type ?? "", err.message, err.code ?? "", err.param ?? "");
    return { error: err.message || "Failed to create checkout session" };
  }
}

// ═════════════════════════════════════════════
//  PPP: Per-Contractor Direct Charges via Stripe Connect
// ═════════════════════════════════════════════
//
// PPP = Pay-Per-Placement. The client pays each contractor DIRECTLY through
// Stripe Connect. RL never touches the money.
//
// How it works:
// 1. Each contractor has a Stripe Express account under RL's platform.
// 2. For each contractor on the invoice, RL creates a Checkout Session
//    as a DIRECT CHARGE on the contractor's Express account.
// 3. The client clicks each payment link and pays via card/ACH.
// 4. Money goes directly into the contractor's Stripe Express balance.
// 5. Contractor pays out to their bank from their Express dashboard.
// 6. RL takes $0 — no application_fee, no platform balance involvement.
//
// The invoice (generated from timesheets) tells the client exactly
// how much each contractor is owed.

// ─── PPP Per-Contractor Payment Links (Direct Charges) ───────────────────────

/**
 * Create per-contractor Stripe Checkout payment links for a PPP invoice.
 * Uses DIRECT CHARGES: checkout runs on the contractor's Express account.
 * Client pays the contractor directly — money NEVER touches RL's account.
 * Stripe deposits funds into the contractor's Express balance, then pays out
 * to their bank in their local currency.
 *
 * This is the only Stripe Connect model where RL is not a money transmitter.
 *
 * Note: In test mode, Express accounts may have currency/card brand restrictions
 * based on the account's country. In production, most countries support USD charges.
 * For testing, create Express accounts with US country.
 */
export async function createPPPPaymentLinks(invoiceId: string): Promise<{
  links: { lineItemId: string; contractorName: string; amount: number; url: string }[];
  errors: { contractorName: string; reason: string }[];
} | { error: string }> {
  try {
    await requireRole("super_admin", "admin");
  } catch (err: any) {
    return { error: `Permission denied: ${err.message}` };
  }

  try {
    const stripe = getStripe();

    const invoice = await database.clientInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        organization: { include: { profile: true } },
        lineItems: {
          include: {
            employee: {
              select: {
                id: true,
                legalFirstName: true,
                legalLastName: true,
                stripeAccountId: true,
                stripeAccountStatus: true,
              },
            },
          },
        },
      },
    });

    if (!invoice) return { error: "Invoice not found" };
    if (invoice.status === "paid") return { error: "Invoice is already paid" };
    if (invoice.status === "void") return { error: "Cannot pay a voided invoice" };
    if (invoice.organization.profile?.paymentMethod !== "ppp") {
      return { error: "This function is only for PPP organizations" };
    }

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_WEB_URL || "").replace(/\/+$/, "") || "https://hriq.remoteleverage.com";

    const links: { lineItemId: string; contractorName: string; amount: number; url: string }[] = [];
    const errors: { contractorName: string; reason: string }[] = [];

    for (const li of invoice.lineItems) {
      const contractorName = `${li.employee.legalFirstName} ${li.employee.legalLastName}`;
      const amount = Number(li.amount);
      const amountCents = Math.round(amount * 100);

      // Skip already-paid line items
      if ((li as any).paymentStatus === "paid") continue;

      if (!li.employee.stripeAccountId) {
        errors.push({ contractorName, reason: "No Stripe Express account — contractor needs to complete Stripe onboarding" });
        continue;
      }
      if (li.employee.stripeAccountStatus !== "verified") {
        errors.push({ contractorName, reason: `Stripe account not verified (status: ${li.employee.stripeAccountStatus ?? "none"})` });
        continue;
      }
      if (!Number.isFinite(amountCents) || amountCents <= 0) {
        errors.push({ contractorName, reason: `Invalid amount: $${li.amount}` });
        continue;
      }

      try {
        // DIRECT CHARGE on the contractor's Express account.
        // The checkout page runs ON the contractor's Stripe account.
        // Client's payment goes directly into the contractor's Stripe balance.
        // RL's platform account NEVER receives or holds the funds.
        // Stripe pays out to the contractor's bank on their payout schedule.
        const session = await stripe.checkout.sessions.create({
          line_items: [{
            price_data: {
              currency: "usd",
              product_data: {
                name: `Payment to ${contractorName}`,
                description: li.description ?? `Contractor payment — ${invoice.periodName ?? ""}`,
              },
              unit_amount: amountCents,
            },
            quantity: 1,
          }],
          mode: "payment",
          success_url: `${appUrl}/${invoice.organization.slug}/payroll?ppp_li=${li.id}&payment=success`,
          cancel_url: `${appUrl}/${invoice.organization.slug}/payroll?payment=cancelled`,
          metadata: {
            hriq_client_invoice_id: invoiceId,
            hriq_line_item_id: li.id,
            hriq_employee_id: li.employee.id,
            hriq_org_id: invoice.organizationId,
            hriq_invoice_number: invoice.invoiceNumber,
            hriq_payment_model: "ppp",
          },
          payment_intent_data: {
            metadata: {
              hriq_client_invoice_id: invoiceId,
              hriq_line_item_id: li.id,
              hriq_employee_id: li.employee.id,
              hriq_payment_model: "ppp",
            },
            description: `${invoice.invoiceNumber} — ${contractorName}`,
          },
          expires_at: Math.floor(Date.now() / 1000) + 86400,
        }, {
          // This is the key: stripeAccount makes it a DIRECT CHARGE.
          // The checkout runs on the contractor's Express account.
          // Funds go directly to the contractor. RL never touches them.
          stripeAccount: li.employee.stripeAccountId,
        });

        await database.clientInvoiceLineItem.update({
          where: { id: li.id },
          data: {
            stripeCheckoutSessionId: session.id,
            stripePaymentIntentId: (session.payment_intent as string) ?? null,
            paymentLink: session.url,
            paymentStatus: "pending",
          },
        });

        links.push({
          lineItemId: li.id,
          contractorName,
          amount,
          url: session.url!,
        });

        console.info(`[Stripe PPP] Direct charge checkout for ${contractorName}: $${amount.toFixed(2)} → ${li.employee.stripeAccountId}`);
      } catch (err: any) {
        console.error(`[Stripe PPP] Failed to create checkout for ${contractorName}:`, err.message);
        errors.push({ contractorName, reason: err.message });
      }
    }

    // Update invoice status
    if (links.length > 0 && invoice.status === "draft") {
      await database.clientInvoice.update({
        where: { id: invoiceId },
        data: { status: "sent" },
      });
    }

    console.info(`[Stripe PPP] Invoice ${invoice.invoiceNumber}: ${links.length} payment links created, ${errors.length} errors`);
    return { links, errors };
  } catch (err: any) {
    console.error("[Stripe] createPPPPaymentLinks failed:", err.message);
    return { error: err.message || "Failed to create PPP payment links" };
  }
}

/**
 * Handle a PPP per-contractor payment completion.
 * Called from the webhook when a direct charge on a contractor's Express account completes.
 * Marks the line item as paid and checks if all line items are paid to close the invoice.
 */
export async function handlePPPLineItemPayment(session: Stripe.Checkout.Session) {
  const lineItemId = session.metadata?.hriq_line_item_id;
  const invoiceId = session.metadata?.hriq_client_invoice_id;
  if (!lineItemId || !invoiceId) return;

  // Mark line item as paid
  const updated = await database.clientInvoiceLineItem.updateMany({
    where: { id: lineItemId, paymentStatus: { not: "paid" } },
    data: {
      paymentStatus: "paid",
      paidAt: new Date(),
      stripePaymentIntentId: (session.payment_intent as string) ?? null,
    },
  });
  if (updated.count === 0) return; // Already handled

  console.info(`[Stripe PPP] Line item ${lineItemId} paid — invoice ${invoiceId}`);

  // Update the Payment record for this contractor
  try {
    const lineItem = await database.clientInvoiceLineItem.findUnique({
      where: { id: lineItemId },
      select: { employeeId: true },
    });
    const inv = await database.clientInvoice.findUnique({
      where: { id: invoiceId },
      select: { periodStart: true, periodEnd: true },
    });
    if (lineItem && inv) {
      const updatedPayments = await database.payment.findMany({
        where: {
          employeeId: lineItem.employeeId,
          status: { in: ["pending", "processing"] },
          periodStart: inv.periodStart,
          periodEnd: inv.periodEnd,
        },
        select: { id: true },
      });
      await database.payment.updateMany({
        where: {
          employeeId: lineItem.employeeId,
          status: { in: ["pending", "processing"] },
          periodStart: inv.periodStart,
          periodEnd: inv.periodEnd,
        },
        data: {
          status: "completed",
          paymentDate: new Date(),
          paymentMethod: "stripe_connect",
          transactionId: (session.payment_intent as string) ?? session.id,
          payoutProvider: "stripe_connect",
          payoutReference: (session.payment_intent as string) ?? session.id,
          payoutConfirmedAt: new Date(),
        },
      });

      // Generate and deliver paystub for each completed payment
      for (const p of updatedPayments) {
        try {
          const { generateAndDeliverPaystub } = await import("./paystub");
          await generateAndDeliverPaystub(p.id);
        } catch (stubErr) {
          console.error(`[Stripe PPP] Paystub failed for payment ${p.id}:`, stubErr);
        }
      }
    }
  } catch (payErr) {
    console.error(`[Stripe PPP] Failed to update payment record for line item ${lineItemId}:`, payErr);
  }

  // Check if all line items for this invoice are now paid
  const allItems = await database.clientInvoiceLineItem.findMany({
    where: { clientInvoiceId: invoiceId },
    select: { paymentStatus: true },
  });
  const allPaid = allItems.every((item: any) => item.paymentStatus === "paid");

  if (allPaid) {
    await database.clientInvoice.updateMany({
      where: { id: invoiceId, status: { not: "paid" } },
      data: {
        status: "paid",
        paidAt: new Date(),
        paymentMethod: "stripe_ppp",
        paymentReference: `ppp_all_paid_${Date.now()}`,
      },
    });
    console.info(`[Stripe PPP] All contractors paid — invoice ${invoiceId} marked as paid`);
  }

  revalidatePath("/[orgSlug]/payments", "page");
  revalidatePath("/[orgSlug]/payments/external", "page");
}

//  Handle Client Invoice Checkout Completed 

export async function handleClientInvoiceCheckoutCompleted(session: Stripe.Checkout.Session) {
  const paymentModel = session.metadata?.hriq_payment_model;

  // PPP: Direct charge on contractor's Express account → handle per-line-item
  if (paymentModel === "ppp") {
    await handlePPPLineItemPayment(session);
    return;
  }

  // COR: Platform charge → mark invoice paid, transfer to contractor Express accounts
  const invoiceId = session.metadata?.hriq_client_invoice_id;
  if (!invoiceId) return;

  const invoice = await database.clientInvoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, status: true, currency: true },
  });

  if (!invoice || invoice.status === "paid") return;

  const result = await database.clientInvoice.updateMany({
    where: { id: invoiceId, status: { not: "paid" } },
    data: {
      status: "paid",
      paidAt: new Date(),
      paymentMethod: "stripe",
      paymentReference: (session.payment_intent as string) ?? session.id,
      stripePaymentIntentId: (session.payment_intent as string) ?? null,
    },
  });

  if (result.count === 0) return;

  // COR: auto-transfer contractor portions to their Express accounts
  await transferToConnectedAccounts(invoiceId, invoice.currency);

  revalidatePath("/[orgSlug]/payments", "page");
  revalidatePath("/[orgSlug]/payments/external", "page");
}

//  PPP: Email Per-Contractor Payment Links to Client 

/**
 * Email the client admin with per-contractor payment links for a PPP invoice.
 * Each contractor has their own Stripe Checkout link (direct charge on their Express account).
 */
export async function emailPPPPaymentLinks(invoiceId: string): Promise<boolean> {
  try {
    const invoice = await database.clientInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        organization: { include: { profile: { select: { billingEmail: true, adminEmail: true, adminName: true } } } },
        lineItems: {
          include: {
            employee: { select: { legalFirstName: true, legalLastName: true, preferredName: true } },
          },
        },
      },
    });

    if (!invoice) return false;
    const billingEmail = invoice.organization.profile?.billingEmail ?? invoice.organization.profile?.adminEmail;
    if (!billingEmail) return false;

    const orgName = invoice.organization.name;
    const billingName = invoice.organization.profile?.adminName ?? orgName;

    const { sendViaGmailSystem } = await import("./send-email");
    const templates = await import("./email-templates");

    const fmtMoney = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

    // Build per-contractor rows with individual payment buttons
    const contractorRows = invoice.lineItems.map((li: any) => {
      const name = li.employee.preferredName || `${li.employee.legalFirstName} ${li.employee.legalLastName}`;
      const hours = li.hoursWorked ? `${Number(li.hoursWorked)}h` : "\u2014";
      const rate = li.hourlyRate ? `${fmtMoney(Number(li.hourlyRate))}/hr` : "\u2014";
      const amount = fmtMoney(Number(li.amount));
      const payBtn = li.paymentLink
        ? `<a href="${li.paymentLink}" style="display:inline-block;padding:6px 16px;background:#2563eb;color:#fff;border-radius:4px;text-decoration:none;font-size:13px;font-weight:600;">Pay ${amount}</a>`
        : `<span style="color:#dc2626;font-size:13px;">Setup required</span>`;

      return `<tr style="border-bottom:1px solid #eee;">
        <td style="padding:10px 12px;font-size:14px;">${name}</td>
        <td style="padding:10px 12px;text-align:right;font-size:14px;">${hours}</td>
        <td style="padding:10px 12px;text-align:right;font-size:14px;">${rate}</td>
        <td style="padding:10px 12px;text-align:right;font-size:14px;font-weight:600;">${amount}</td>
        <td style="padding:10px 12px;text-align:center;">${payBtn}</td>
      </tr>`;
    }).join("");

    const headerRow = `<tr style="background:#f8f9fa;border-bottom:2px solid #dee2e6;">
      <th style="padding:10px 12px;text-align:left;font-size:12px;text-transform:uppercase;color:#6c757d;font-weight:600;">Contractor</th>
      <th style="padding:10px 12px;text-align:right;font-size:12px;text-transform:uppercase;color:#6c757d;font-weight:600;">Hours</th>
      <th style="padding:10px 12px;text-align:right;font-size:12px;text-transform:uppercase;color:#6c757d;font-weight:600;">Rate</th>
      <th style="padding:10px 12px;text-align:right;font-size:12px;text-transform:uppercase;color:#6c757d;font-weight:600;">Amount</th>
      <th style="padding:10px 12px;text-align:center;font-size:12px;text-transform:uppercase;color:#6c757d;font-weight:600;">Action</th>
    </tr>`;

    const totalRow = `<tr style="border-top:2px solid #333;background:#1a1a2e;color:#fff;">
      <td colspan="3" style="padding:14px 12px;text-align:right;font-size:15px;font-weight:700;">Total</td>
      <td style="padding:14px 12px;text-align:right;font-size:18px;font-weight:700;">${fmtMoney(Number(invoice.totalAmount))}</td>
      <td></td>
    </tr>`;

    const body =
      templates.heading("Contractor Payments Due") +
      templates.greeting(billingName) +
      templates.paragraph(`Invoice <strong>${invoice.invoiceNumber}</strong> for <strong>${invoice.periodName ?? ""}</strong> is ready. Please pay each contractor below using their individual payment link.`) +
      templates.paragraph("Each payment goes directly to the contractor via Stripe — funds are deposited into their account, not held by Remote Leverage.") +
      `<table style="width:100%;border-collapse:collapse;margin:20px 0;border:1px solid #dee2e6;border-radius:8px;overflow:hidden;">
        ${headerRow}${contractorRows}${totalRow}
      </table>` +
      templates.paragraph("<small style=\"color:#6c757d;\">Payment links expire in 24 hours. If a link expires, contact Remote Leverage for a new one.</small>");

    await sendViaGmailSystem(
      billingEmail,
      `Contractor Payments Due — ${fmtMoney(Number(invoice.totalAmount))} — ${orgName}`,
      templates.layout(body, "This is an automated invoice from Remote Leverage."),
    );

    if (invoice.status === "draft") {
      await database.clientInvoice.update({
        where: { id: invoiceId },
        data: { status: "sent" },
      });
    }

    return true;
  } catch (err) {
    console.error("[stripe.ts:emailPPPPaymentLinks]", err instanceof Error ? err.message : err);
    return false;
  }
}

//  Send Invoice Payment Link Email (COR) 

export async function sendInvoicePaymentLinkEmail(invoiceId: string) {
  try {
    await requireRole("super_admin");

    const invoice = await database.clientInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        organization: { include: { profile: true } },
        lineItems: {
          include: { employee: { select: { id: true, legalFirstName: true, legalLastName: true, preferredName: true } } },
        },
      },
    });

    if (!invoice) throw new HriqError("HRIQ-0801", "Invoice not found");
    if (!invoice.paymentLink) throw new HriqError("HRIQ-9903", "No payment link generated yet. Create a checkout session first.");

    const billingEmail = invoice.organization.profile?.billingEmail ?? invoice.organization.profile?.adminEmail;
    if (!billingEmail) throw new HriqError("HRIQ-9903", "No billing email set for this organization.");

    const { sendViaGmailSystem } = await import("./send-email");
    const { layout, heading, greeting, paragraph, primaryButton } = await import("./email-templates");

    const fmtMoney = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
    const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

    const headerRow = `<tr style="background:#f8f9fa;border-bottom:2px solid #dee2e6;">
      <th style="padding:10px 12px;text-align:left;font-size:12px;text-transform:uppercase;color:#6c757d;font-weight:600;">Contractor</th>
      <th style="padding:10px 12px;text-align:right;font-size:12px;text-transform:uppercase;color:#6c757d;font-weight:600;">Hours</th>
      <th style="padding:10px 12px;text-align:right;font-size:12px;text-transform:uppercase;color:#6c757d;font-weight:600;">Rate</th>
      <th style="padding:10px 12px;text-align:right;font-size:12px;text-transform:uppercase;color:#6c757d;font-weight:600;">Amount</th>
    </tr>`;

    const lineItemRows = invoice.lineItems.map((li: any) => {
      const name = li.employee.preferredName || `${li.employee.legalFirstName} ${li.employee.legalLastName}`;
      const hours = li.hoursWorked ? fmtHoursDisplay(Number(li.hoursWorked)) : "\u2014";
      const rate = li.hourlyRate ? fmtMoney(Number(li.hourlyRate)) + "/hr" : "\u2014";
      const amount = fmtMoney(Number(li.amount));
      return `<tr style="border-bottom:1px solid #eee;">
        <td style="padding:10px 12px;font-size:14px;">${name}</td>
        <td style="padding:10px 12px;text-align:right;font-size:14px;font-variant-numeric:tabular-nums;">${hours}</td>
        <td style="padding:10px 12px;text-align:right;font-size:14px;font-variant-numeric:tabular-nums;">${rate}</td>
        <td style="padding:10px 12px;text-align:right;font-size:14px;font-weight:600;font-variant-numeric:tabular-nums;">${amount}</td>
      </tr>`;
    }).join("");

    const subtotalRow = `<tr style="border-top:2px solid #dee2e6;background:#f8f9fa;">
      <td colspan="3" style="padding:10px 12px;text-align:right;font-size:13px;color:#6c757d;">Contractor Subtotal</td>
      <td style="padding:10px 12px;text-align:right;font-size:14px;font-weight:600;font-variant-numeric:tabular-nums;">${fmtMoney(Number(invoice.subtotal))}</td>
    </tr>`;

    const feeRow = Number(invoice.rlFeeTotal) > 0
      ? `<tr style="background:#f8f9fa;">
          <td colspan="3" style="padding:10px 12px;text-align:right;font-size:13px;color:#6c757d;">Management Fee${invoice.rlFeeType === "percentage" && invoice.rlFeeAmount ? ` (${Number(invoice.rlFeeAmount)}%)` : ""}</td>
          <td style="padding:10px 12px;text-align:right;font-size:14px;font-weight:600;font-variant-numeric:tabular-nums;">${fmtMoney(Number(invoice.rlFeeTotal))}</td>
        </tr>`
      : "";

    const totalRow = `<tr style="border-top:2px solid #333;background:#1a1a2e;color:#fff;">
      <td colspan="3" style="padding:14px 12px;text-align:right;font-size:15px;font-weight:700;">Total Due</td>
      <td style="padding:14px 12px;text-align:right;font-size:18px;font-weight:700;font-variant-numeric:tabular-nums;">${fmtMoney(Number(invoice.totalAmount))}</td>
    </tr>`;

    const totalHours = invoice.lineItems.reduce((sum: number, li: any) => sum + (li.hoursWorked ? Number(li.hoursWorked) : 0), 0);

    const body =
      heading("Invoice Payment Due") +
      greeting(invoice.organization.profile?.adminName ?? invoice.organization.name) +
      paragraph(`Please find below the details for invoice <strong>${invoice.invoiceNumber}</strong> covering the pay period <strong>${fmtDate(invoice.periodStart)} \u2014 ${fmtDate(invoice.periodEnd)}</strong>.`) +
      paragraph(`This invoice covers <strong>${invoice.lineItems.length} contractor${invoice.lineItems.length !== 1 ? "s" : ""}</strong> totaling <strong>${fmtHoursDisplay(totalHours)}</strong> of work.`) +
      `<table style="width:100%;border-collapse:collapse;margin:20px 0;border:1px solid #dee2e6;border-radius:8px;overflow:hidden;">
        ${headerRow}${lineItemRows}${subtotalRow}${feeRow}${totalRow}
      </table>` +
      paragraph("Click the button below to complete payment securely via Stripe. We accept credit/debit cards and ACH bank transfers.") +
      primaryButton("Pay Now \u2014 " + fmtMoney(Number(invoice.totalAmount)), invoice.paymentLink) +
      paragraph(`<small style="color:#6c757d;">Invoice #: ${invoice.invoiceNumber} \u00b7 Period: ${fmtDate(invoice.periodStart)} \u2014 ${fmtDate(invoice.periodEnd)}<br/>This payment link expires in 30 minutes. If it expires, contact Remote Leverage for a new link.</small>`);

    try {
      await sendViaGmailSystem(
        billingEmail,
        `Invoice ${invoice.invoiceNumber} \u2014 ${fmtMoney(Number(invoice.totalAmount))} Due \u00b7 ${fmtDate(invoice.periodStart)} \u2014 ${fmtDate(invoice.periodEnd)}`,
        layout(body, "This is an automated invoice from Remote Leverage."),
      );
    } catch (emailErr) {
      console.error("[HRIQ] Email send failed (non-blocking):", emailErr);
    }

    if (invoice.status === "draft") {
      await database.clientInvoice.update({
        where: { id: invoiceId },
        data: { status: "sent" },
      });
    }

    return { success: true, sentTo: billingEmail };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[stripe.ts:sendInvoicePaymentLinkEmail]", _msg);
    return { error: _msg };
  }
}

// ═════════════════════════════════════════════
//  Stripe Connect — COR Auto-transfer to Contractors
// ═════════════════════════════════════════════

/**
 * COR only: After a client invoice is paid via platform charge,
 * transfer each contractor's portion to their connected Stripe Express account.
 * Not used for PPP — PPP uses direct charges on contractor accounts.
 */
async function transferToConnectedAccounts(invoiceId: string, currency: string) {
  try {
    const stripe = getStripe();

    const lineItems = await database.clientInvoiceLineItem.findMany({
      where: { clientInvoiceId: invoiceId },
      include: {
        employee: {
          select: {
            id: true,
            legalFirstName: true,
            legalLastName: true,
            stripeAccountId: true,
            stripeAccountStatus: true,
          },
        },
      },
    });

    for (const li of lineItems) {
      if (!li.employee.stripeAccountId || li.employee.stripeAccountStatus !== "verified") {
        console.warn(
          `[Stripe Connect] Skipping transfer for ${li.employee.legalFirstName} ${li.employee.legalLastName}` +
          ` — no verified connected account (status: ${li.employee.stripeAccountStatus ?? "none"})`
        );
        continue;
      }

      const amountCents = Math.round(Number(li.amount) * 100);
      if (!Number.isFinite(amountCents) || amountCents <= 0) {
        console.error(`[Stripe Connect] Invalid transfer amount for employee ${li.employee.id}: ${li.amount}`);
        continue;
      }

      try {
        // Idempotency key prevents double-transfer if the webhook fires more than once
        const transfer = await stripe.transfers.create({
          amount: amountCents,
          currency: currency.toLowerCase(),
          destination: li.employee.stripeAccountId,
          description: `Invoice payment — ${li.description ?? "contractor services"}`,
          metadata: {
            hriq_client_invoice_id: invoiceId,
            hriq_employee_id: li.employee.id,
            hriq_line_item_id: li.id,
          },
        }, {
          idempotencyKey: `hriq-transfer-${li.id}`,
        });

        console.info(
          `[Stripe Connect] Transfer ${transfer.id}: $${(amountCents / 100).toFixed(2)} → ${li.employee.legalFirstName} ${li.employee.legalLastName} (${li.employee.stripeAccountId})`
        );

        // Mark the corresponding Payment record as completed
        try {
          const invoice = await database.clientInvoice.findUnique({
            where: { id: invoiceId },
            select: { periodStart: true, periodEnd: true },
          });
          if (invoice) {
            const corPayments = await database.payment.findMany({
              where: {
                employeeId: li.employee.id,
                status: { in: ["pending", "processing"] },
                periodStart: invoice.periodStart,
                periodEnd: invoice.periodEnd,
              },
              select: { id: true },
            });
            await database.payment.updateMany({
              where: {
                employeeId: li.employee.id,
                status: { in: ["pending", "processing"] },
                periodStart: invoice.periodStart,
                periodEnd: invoice.periodEnd,
              },
              data: {
                status: "completed",
                paymentDate: new Date(),
                paymentMethod: "stripe_connect",
                transactionId: transfer.id,
                payoutProvider: "stripe_connect",
                payoutReference: transfer.id,
                payoutConfirmedAt: new Date(),
              },
            });

            // Generate and deliver paystub for each completed payment
            for (const p of corPayments) {
              try {
                const { generateAndDeliverPaystub } = await import("./paystub");
                await generateAndDeliverPaystub(p.id);
              } catch (stubErr) {
                console.error(`[Stripe Connect] Paystub failed for payment ${p.id}:`, stubErr);
              }
            }
          }
        } catch (payErr) {
          console.error(`[Stripe Connect] Failed to update payment record for ${li.employee.id}:`, payErr);
        }
      } catch (err: any) {
        console.error(
          `[Stripe Connect] Transfer failed for ${li.employee.legalFirstName} ${li.employee.legalLastName}:`,
          err.message
        );
      }
    }
  } catch (err) {
    console.error("[Stripe Connect] transferToConnectedAccounts failed:", err);
  }
}

/**
 * Handle Stripe account.updated webhook — sync status to HRIQ.
 */
export async function handleAccountUpdated(account: Stripe.Account) {
  const employeeId = account.metadata?.hriq_employee_id;
  const orgId = account.metadata?.hriq_org_id;
  const isOrgAccount = account.metadata?.hriq_type === "client_org";

  // Handle org Connect account updates
  if (isOrgAccount && orgId) {
    const status = deriveAccountStatus(account);
    await database.organization.updateMany({
      where: { id: orgId, stripeConnectAccountId: account.id },
      data: { stripeConnectStatus: status },
    });
    console.info(`[Stripe Connect] Org account ${account.id} → ${status} (org: ${orgId})`);
    return;
  }

  // Handle employee Connect account updates
  if (!employeeId) {
    console.warn("[Stripe Connect] account.updated without hriq_employee_id metadata");
    return;
  }

  const status = deriveAccountStatus(account);

  await database.employee.updateMany({
    where: { id: employeeId, stripeAccountId: account.id },
    data: { stripeAccountStatus: status },
  });

  // Auto-complete the payment_setup onboarding step when verified or restricted (details submitted)
  if (status === "verified" || status === "restricted") {
    try {
      const sessions = await database.onboardingSession.findMany({
        where: { employeeId, status: { not: "completed" } },
        include: {
          steps: {
            where: { stepType: "payment_setup", status: { not: "completed" } },
          },
        },
      });
      for (const session of sessions) {
        for (const step of session.steps) {
          await database.onboardingStep.update({
            where: { id: step.id },
            data: {
              status: "completed",
              completedAt: new Date(),
              completedByName: "Stripe (auto)",
              notes: `Stripe account ${account.id} ${status} — details submitted`,
            },
          });
          console.info(`[Stripe Connect] Auto-completed payment_setup step ${step.id} for employee ${employeeId}`);
        }
      }
    } catch (err) {
      console.error("[Stripe Connect] Failed to auto-complete payment_setup step:", err);
    }
  }

  console.info(`[Stripe Connect] Account ${account.id} → ${status} (employee: ${employeeId})`);
}

/**
 * Standalone Stripe Connect invite — works without an onboarding session.
 * Creates a Stripe Connect account (if needed) and sends the branded invite email.
 * Used when adding contractors directly (not through the hiring pipeline).
 */
export async function sendStripeConnectInvite(employeeId: string): Promise<{ onboardingUrl: string } | { error: string }> {
  try {
    await requireRole("super_admin", "admin");
  } catch (err: any) {
    return { error: `Permission denied: ${err.message}` };
  }

  try {
    const stripe = getStripe();

    const employee = await database.employee.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        legalFirstName: true,
        legalLastName: true,
        personalEmail: true,
        workEmail: true,
        country: true,
        location: true,
        stripeAccountId: true,
        stripeAccountStatus: true,
        organizationId: true,
      },
    });

    if (!employee) return { error: "Employee not found" };
    const email = employee.personalEmail ?? employee.workEmail;
    if (!email) return { error: "Employee has no email address" };

    let accountId: string | null = employee.stripeAccountId;
    let onboardingUrl: string;

    if (accountId) {
      onboardingUrl = await createAccountOnboardingLink(stripe, accountId);
    } else {
      const countryCode = tryMapCountryToStripe(employee.country ?? employee.location);
      if (!countryCode) {
        return { error: `Cannot set up Stripe for ${employee.legalFirstName}: country is missing or set to "Other". Please update their country first.` };
      }

      const account = await createStripeConnectAccount(stripe, {
        countryCode,
        email,
        firstName: employee.legalFirstName,
        lastName: employee.legalLastName,
        employeeId,
        orgId: employee.organizationId ?? "",
      });

      accountId = account.id;
      await database.employee.update({
        where: { id: employeeId },
        data: {
          stripeAccountId: accountId,
          stripeAccountStatus: "onboarding",
        },
      });

      onboardingUrl = await createAccountOnboardingLink(stripe, accountId!);
    }

    // Send branded invite email
    try {
      const { sendViaGmail } = await import("@/app/actions/hriq/send-email");
      const { paymentSetupEmail } = await import("@/app/actions/hriq/email-templates");
      const { buildEmail } = await import("./email-template-engine");
      const fallbackHtml = paymentSetupEmail(employee.legalFirstName, onboardingUrl);
      const fallbackSubject = "Set Up Your Payment Account — Remote Leverage";
      const rendered = await buildEmail("stripe_connect_invite", { name: employee.legalFirstName, onboarding_url: onboardingUrl }, fallbackHtml, fallbackSubject);

      await sendViaGmail(
        email,
        rendered.subject,
        rendered.html,
      );
    } catch (emailErr) {
      console.error("[Stripe Connect] Failed to send invite email:", emailErr);
    }

    return { onboardingUrl };
  } catch (err: any) {
    console.error("[Stripe Connect] sendStripeConnectInvite failed:", err.message);
    return { error: err.message || "Failed to set up payment account" };
  }
}

// ── Helpers ──

async function createAccountOnboardingLink(stripe: Stripe, accountId: string): Promise<string> {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_WEB_URL || "").replace(/\/+$/, "") || "https://hriq.remoteleverage.com";

  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${appUrl}/api/stripe-connect/refresh?account=${accountId}`,
    return_url: `${appUrl}/api/stripe-connect/return?account=${accountId}`,
    type: "account_onboarding",
  });

  return accountLink.url;
}

function deriveAccountStatus(account: Stripe.Account): string {
  if (account.payouts_enabled && account.details_submitted) return "verified";
  if (account.details_submitted && !account.payouts_enabled) return "restricted";
  return "onboarding";
}

// ═══ Org Stripe Setup Email ═══

/**
 * Send a Stripe Checkout setup email to a client org admin.
 * This creates a Stripe Customer for the org (if not already) and sends
 * an email with instructions to set up their payment method for invoicing.
 */
export async function sendOrgStripeSetupEmail(
  adminEmail: string,
  orgName: string,
  orgId: string,
): Promise<{ success: true } | { error: string }> {
  await requireRole("super_admin");

  // Ensure org has a Stripe Customer
  const customerId = await ensureStripeCustomer(orgId);

  // Create a Stripe Checkout Session in setup mode so the client can add a payment method
  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const appUrl = (await import("./constants")).normalizeAppUrl(
    process.env.HRIQ_PUBLIC_DOMAIN ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://hriq.remoteleverage.com"
  );

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "setup",
    payment_method_types: ["card"],
    success_url: `${appUrl}/sign-in?stripe_setup=success`,
    cancel_url: `${appUrl}/sign-in?stripe_setup=cancelled`,
    metadata: { hriq_org_id: orgId },
  });

  // Send email
  const { sendViaGmailSystem } = await import("./send-email");
  const { layout, heading, greeting, paragraph, primaryButton, highlightBox } = await import("./email-templates");

  const body =
    heading("Set Up Your Payment Method") +
    greeting(orgName) +
    paragraph("Welcome to Remote Leverage! To enable seamless invoicing and payments for your contractors, please set up your payment method by clicking the link below.") +
    primaryButton("Set Up Payment Method", session.url!) +
    highlightBox("blue", "<strong>What this does:</strong> Securely saves your card on file for future contractor invoices. You will only be charged when an invoice is generated and approved.") +
    paragraph("<small>This link expires in 24 hours. If it expires, contact Remote Leverage for a new link.</small>");

  try {
    await sendViaGmailSystem(
      adminEmail,
      `Payment Setup Required — ${orgName}`,
      layout(body, "This is an automated notification from Remote Leverage."),
    );
  } catch (emailErr) {
    console.error("[HRIQ] Email send failed (non-blocking):", emailErr);
  }

  return { success: true };
}

/**
 * Create a Stripe Connect Express account for a client organization.
 * PPP orgs get card_payments + transfers so they can accept direct charges.
 * COR orgs get transfers only (they receive transfers from RL's platform).
 */
export async function initOrgConnectAccount(orgId: string): Promise<{ onboardingUrl: string } | { error: string }> {
  try {
    await requireRole("super_admin", "admin");
  } catch (err: any) {
    return { error: `Permission denied: ${err.message}` };
  }

  try {
    const stripe = getStripe();

    const org = await database.organization.findUnique({
      where: { id: orgId },
      select: {
        id: true,
        name: true,
        stripeConnectAccountId: true,
        stripeConnectStatus: true,
        profile: { select: { industry: true, adminEmail: true, country: true, paymentMethod: true } },
      },
    });
    if (!org) return { error: "Organization not found" };

    const isPPP = org.profile?.paymentMethod === "ppp";

    // PPP orgs don't need org-level Stripe Connect — direct charges run on
    // contractor Express accounts. Money goes Client → Contractor, never through RL.
    if (isPPP) {
      return { error: "PPP organizations do not need Stripe Connect setup. Payments go directly to contractor accounts." };
    }

    let accountId = org.stripeConnectAccountId;
    let onboardingUrl: string;
    let isNewAccount = false;

    if (accountId) {
      // Already has an account — check if setup is complete
      if (org.stripeConnectStatus === "verified" || org.stripeConnectStatus === "active") {
        // Fully set up — return Express dashboard link instead of re-running onboarding
        try {
          const loginLink = await stripe.accounts.createLoginLink(accountId);
          return { onboardingUrl: loginLink.url };
        } catch {
          // Fall through to onboarding link if login link fails
        }
      }
      // Account exists but not verified — generate onboarding link to continue setup
      onboardingUrl = await createAccountOnboardingLink(stripe, accountId);
    } else {
      isNewAccount = true;
      // Create new Connect Express account for the org
      const countryCode = mapCountryToStripe(org.profile?.country);
      const email = org.profile?.adminEmail ?? undefined;

      // Only COR/both orgs reach here — they need transfers capability
      // to receive payouts from RL's platform balance
      const capabilities: Stripe.AccountCreateParams.Capabilities = { transfers: { requested: true } };

      const accountParams: Stripe.AccountCreateParams = {
        country: countryCode,
        email,
        business_type: "company" as const,
        company: { name: org.name },
        business_profile: {
          mcc: "7372",
          product_description: `Client organization: ${org.name}`,
        },
        metadata: { hriq_org_id: orgId, hriq_type: "client_org" },
        capabilities,
      };

      // Use "recipient" service agreement only for cross-border countries.
      // US-based orgs on a US platform must use "full" (the default when omitted).
      if (isCrossBorderCountry(countryCode)) {
        accountParams.type = "express";
        accountParams.tos_acceptance = { service_agreement: "recipient" as const };
      } else {
        // For full-Stripe countries (incl. US), use Connect Onboarding with controller config
        accountParams.controller = {
          fees: { payer: "application" },
          losses: { payments: "application" },
          stripe_dashboard: { type: "express" },
          requirement_collection: "stripe",
        };
      }

      const account = await stripe.accounts.create(accountParams);
      accountId = account.id;

      await database.organization.update({
        where: { id: orgId },
        data: {
          stripeConnectAccountId: accountId,
          stripeConnectStatus: "onboarding",
        },
      });

      onboardingUrl = await createAccountOnboardingLink(stripe, accountId);
    }

    // Send onboarding email to org admin only on first account creation
    if (isNewAccount) {
      const adminEmail = org.profile?.adminEmail;
      if (adminEmail) {
        try {
          const { sendViaGmailSystem } = await import("./send-email");
          const { layout, heading, greeting, paragraph, primaryButton, highlightBox } = await import("./email-templates");

          const body =
            heading("Complete Your Stripe Account Setup") +
            greeting(org.name) +
            paragraph("To view your contractor payment history and manage your payout details, please complete your Stripe account setup by clicking the link below.") +
            primaryButton("Complete Stripe Setup", onboardingUrl) +
            highlightBox("blue", "<strong>What this does:</strong> Sets up your Stripe Express account so you can view all contractor payments, transfer history, and manage your banking details through the Stripe dashboard.") +
            paragraph("<small>This link expires in a few minutes. If it expires, you can request a new one from your dashboard.</small>");

          try {
            await sendViaGmailSystem(
              adminEmail,
              `Complete Your Stripe Account Setup — ${org.name}`,
              layout(body, "This is an automated notification from Remote Leverage."),
            );
          } catch (emailErr) {
            console.error("[HRIQ] Email send failed (non-blocking):", emailErr);
          }
        } catch (emailErr) {
          console.error("[Stripe Connect] Failed to send org onboarding email:", emailErr);
        }
      }
    }

    return { onboardingUrl };
  } catch (err: any) {
    console.error("[Stripe Connect] initOrgConnectAccount failed:", err.message);
    return { error: err.message || "Failed to set up organization Stripe account" };
  }
}

/**
 * Get Express Dashboard login link for a client organization.
 */
export async function getOrgConnectDashboardLink(orgId: string): Promise<{ url: string } | { error: string }> {
  try {
    await requireRole("super_admin", "admin");
  } catch (err: any) {
    return { error: `Permission denied: ${err.message}` };
  }

  try {
    const stripe = getStripe();

    const org = await database.organization.findUnique({
      where: { id: orgId },
      select: { stripeConnectAccountId: true, stripeConnectStatus: true },
    });

    if (!org?.stripeConnectAccountId) return { error: "Organization has no Stripe Connect account" };

    const loginLink = await stripe.accounts.createLoginLink(org.stripeConnectAccountId);
    return { url: loginLink.url };
  } catch (err: any) {
    if (err.code === "account_invalid") {
      return { error: "Organization hasn't completed Stripe onboarding yet. Please complete the Stripe setup first." };
    }
    console.error("[Stripe Connect] getOrgConnectDashboardLink failed:", err.message);
    return { error: err.message || "Failed to generate dashboard link" };
  }
}

/**
 * Get Stripe Express dashboard link for a contractor (member role).
 * The contractor can only access their own Express account dashboard.
 */
export async function getContractorStripeDashboard(): Promise<{ url: string } | { error: string }> {
  try {
    const { requireSession } = await import("@repo/auth/session");
    const session = await requireSession();

    const employee = await database.employee.findFirst({
      where: { linkedUserId: session.userId },
      select: { stripeAccountId: true, stripeAccountStatus: true },
    });

    if (!employee?.stripeAccountId) return { error: "No Stripe account linked to your profile" };
    if (employee.stripeAccountStatus !== "verified") return { error: "Your Stripe account is not fully verified yet" };

    const stripe = getStripe();
    const loginLink = await stripe.accounts.createLoginLink(employee.stripeAccountId);
    return { url: loginLink.url };
  } catch (err: any) {
    if (err.code === "account_invalid") {
      return { error: "Your Stripe account setup is not complete. Please contact your coordinator." };
    }
    console.error("[Stripe Connect] getContractorStripeDashboard failed:", err.message);
    return { error: err.message || "Failed to generate dashboard link" };
  }
}

/**
 * Refresh org Connect account status from Stripe.
 */
export async function refreshOrgConnectStatus(orgId: string): Promise<{ status: string } | { error: string }> {
  try {
    await requireRole("super_admin", "admin");
  } catch (err: any) {
    return { error: `Permission denied: ${err.message}` };
  }

  try {
    const stripe = getStripe();

    const org = await database.organization.findUnique({
      where: { id: orgId },
      select: { stripeConnectAccountId: true },
    });

    if (!org?.stripeConnectAccountId) return { error: "No Stripe account" };

    const account = await stripe.accounts.retrieve(org.stripeConnectAccountId);
    const status = deriveAccountStatus(account);

    await database.organization.update({
      where: { id: orgId },
      data: { stripeConnectStatus: status },
    });

    return { status };
  } catch (err: any) {
    return { error: err.message };
  }
}

function mapCountryToStripe(country: string | null | undefined): string {
  const result = tryMapCountryToStripe(country);
  return result ?? "US"; // Legacy fallback for org-level calls
}

/** Strict version — returns null if country is missing or unrecognized. Use for contractor accounts. */
function tryMapCountryToStripe(country: string | null | undefined): string | null {
  if (!country || country === "Other" || country === "other") return null;
  const upper = country.toUpperCase().trim();

  // 2-letter codes pass through if already valid
  if (upper.length === 2 && STRIPE_COUNTRY_CODES.has(upper)) return upper;

  // Full country name → ISO 3166-1 alpha-2
  const mapped = COUNTRY_NAME_TO_CODE[upper];
  if (mapped) return mapped;

  // Fallback: if it's a 2-letter code not in our set, try it anyway
  if (upper.length === 2) return upper;

  return null;
}

/** Countries where card_payments capability is supported (full Stripe accounts).
 *  Cross-border payout-only countries (CL, CO, AR, PH, etc.) only support transfers. */
const CARD_PAYMENTS_COUNTRIES = new Set([
  "AU","AT","BE","BR","BG","CA","HR","CY","CZ","DK","EE","FI","FR","DE","GH",
  "GI","GR","HK","HU","IN","ID","IE","IT","JP","KE","LV","LI","LT","LU","MY",
  "MT","MX","NL","NZ","NG","NO","PL","PT","RO","SG","SK","SI","ZA","ES","SE",
  "CH","TH","AE","GB","US",
]);

function isCrossBorderCountry(countryCode: string): boolean {
  return !CARD_PAYMENTS_COUNTRIES.has(countryCode);
}

/**
 * Create a Stripe Connect Express account for a contractor.
 * All contractors get Express + transfers only (they receive payouts, not process payments).
 * Non-US countries require the "recipient" service agreement per Stripe rules.
 * US accounts on a US platform can use the default (full) agreement.
 */
async function createStripeConnectAccount(
  stripe: Stripe,
  params: { countryCode: string; email: string; firstName: string; lastName: string; employeeId: string; orgId: string }
) {
  const { countryCode, email, firstName, lastName, employeeId, orgId } = params;

  // Determine capabilities based on country.
  // Countries in CARD_PAYMENTS_COUNTRIES can process card payments — request both
  // capabilities to satisfy Stripe's EEA requirement (EE, LV, LT, etc. require
  // card_payments alongside transfers, or the recipient service agreement).
  // Cross-border countries only get transfers with the recipient agreement.
  const supportsCardPayments = CARD_PAYMENTS_COUNTRIES.has(countryCode);
  const capabilities = supportsCardPayments
    ? { transfers: { requested: true }, card_payments: { requested: true } }
    : { transfers: { requested: true } };

  const sharedParams = {
    country: countryCode,
    email,
    type: "express" as const,
    business_type: "individual" as const,
    individual: { first_name: firstName, last_name: lastName, email },
    business_profile: { mcc: "7372", product_description: "Contractor services via Remote Leverage" },
    metadata: { hriq_employee_id: employeeId, hriq_org_id: orgId },
    capabilities,
  };

  // US contractors on a US platform use the default (full) service agreement.
  if (countryCode === "US") {
    return stripe.accounts.create(sharedParams);
  }

  // Non-US countries that support card_payments can use the full agreement
  // (Stripe shows the appropriate TOS during Express onboarding).
  if (supportsCardPayments) {
    return stripe.accounts.create(sharedParams);
  }

  // Cross-border payout-only countries need the "recipient" service agreement.
  return stripe.accounts.create({
    ...sharedParams,
    tos_acceptance: { service_agreement: "recipient" as const },
  });
}

const STRIPE_COUNTRY_CODES = new Set([
  "AR","AM","AU","AT","BS","BH","BE","BJ","BO","BA","BW","BN","BG","KH","CA",
  "CL","CO","CR","CI","CY","CZ","DK","DO","EC","EG","SV","EE","ET","FI","FR",
  "GM","DE","GH","GR","GT","GY","HK","HU","IS","IE","IL","IT","JM","JP","JO",
  "KE","KW","LV","LT","LU","MO","MG","MT","MU","MX","MD","MC","MN","MA","NA",
  "NL","NZ","NG","MK","NO","OM","PK","PA","PY","PE","PH","PL","PT","QA","RO",
  "RW","SA","SN","RS","SG","SK","SI","ZA","KR","ES","LK","SE","CH","TW","TZ",
  "TH","TT","TN","TR","UG","AE","GB","US","UY","UZ","VN",
]);

const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  // A
  "AFGHANISTAN": "AF", "ALBANIA": "AL", "ALGERIA": "DZ", "ANDORRA": "AD",
  "ANGOLA": "AO", "ANTIGUA AND BARBUDA": "AG", "ARGENTINA": "AR", "ARMENIA": "AM",
  "AUSTRALIA": "AU", "AUSTRIA": "AT", "AZERBAIJAN": "AZ",
  // B
  "BAHAMAS": "BS", "BAHRAIN": "BH", "BANGLADESH": "BD", "BARBADOS": "BB",
  "BELARUS": "BY", "BELGIUM": "BE", "BELIZE": "BZ", "BENIN": "BJ",
  "BHUTAN": "BT", "BOLIVIA": "BO", "BOSNIA AND HERZEGOVINA": "BA",
  "BOTSWANA": "BW", "BRAZIL": "BR", "BRUNEI": "BN", "BULGARIA": "BG",
  "BURKINA FASO": "BF", "BURUNDI": "BI",
  // C
  "CABO VERDE": "CV", "CAPE VERDE": "CV", "CAMBODIA": "KH", "CAMEROON": "CM",
  "CANADA": "CA", "CENTRAL AFRICAN REPUBLIC": "CF", "CHAD": "TD", "CHILE": "CL",
  "CHINA": "CN", "COLOMBIA": "CO", "COMOROS": "KM", "CONGO (DRC)": "CD",
  "CONGO (REPUBLIC)": "CG", "COSTA RICA": "CR", "CROATIA": "HR", "CUBA": "CU",
  "CYPRUS": "CY", "CZECH REPUBLIC": "CZ", "CZECHIA": "CZ",
  // D
  "DENMARK": "DK", "DJIBOUTI": "DJ", "DOMINICA": "DM", "DOMINICAN REPUBLIC": "DO",
  // E
  "ECUADOR": "EC", "EGYPT": "EG", "EL SALVADOR": "SV", "EQUATORIAL GUINEA": "GQ",
  "ERITREA": "ER", "ESTONIA": "EE", "ESWATINI": "SZ", "ETHIOPIA": "ET",
  // F
  "FIJI": "FJ", "FINLAND": "FI", "FRANCE": "FR",
  // G
  "GABON": "GA", "GAMBIA": "GM", "GEORGIA": "GE", "GERMANY": "DE",
  "GHANA": "GH", "GREECE": "GR", "GRENADA": "GD", "GUATEMALA": "GT",
  "GUINEA": "GN", "GUINEA-BISSAU": "GW", "GUYANA": "GY",
  // H
  "HAITI": "HT", "HONDURAS": "HN", "HONG KONG": "HK", "HUNGARY": "HU",
  // I
  "ICELAND": "IS", "INDIA": "IN", "INDONESIA": "ID", "IRAN": "IR", "IRAQ": "IQ",
  "IRELAND": "IE", "ISRAEL": "IL", "ITALY": "IT", "IVORY COAST": "CI",
  "COTE D'IVOIRE": "CI",
  // J
  "JAMAICA": "JM", "JAPAN": "JP", "JORDAN": "JO",
  // K
  "KAZAKHSTAN": "KZ", "KENYA": "KE", "KIRIBATI": "KI", "KOSOVO": "XK",
  "KUWAIT": "KW", "KYRGYZSTAN": "KG",
  // L
  "LAOS": "LA", "LATVIA": "LV", "LEBANON": "LB", "LESOTHO": "LS",
  "LIBERIA": "LR", "LIBYA": "LY", "LIECHTENSTEIN": "LI", "LITHUANIA": "LT",
  "LUXEMBOURG": "LU",
  // M
  "MACAO SAR CHINA": "MO", "MACAU": "MO", "MADAGASCAR": "MG", "MALAWI": "MW",
  "MALAYSIA": "MY", "MALDIVES": "MV", "MALI": "ML", "MALTA": "MT",
  "MARSHALL ISLANDS": "MH", "MAURITANIA": "MR", "MAURITIUS": "MU", "MEXICO": "MX",
  "MICRONESIA": "FM", "MOLDOVA": "MD", "MONACO": "MC", "MONGOLIA": "MN",
  "MONTENEGRO": "ME", "MOROCCO": "MA", "MOZAMBIQUE": "MZ", "MYANMAR": "MM",
  // N
  "NAMIBIA": "NA", "NAURU": "NR", "NEPAL": "NP", "NETHERLANDS": "NL",
  "NEW ZEALAND": "NZ", "NICARAGUA": "NI", "NIGER": "NE", "NIGERIA": "NG",
  "NORTH KOREA": "KP", "NORTH MACEDONIA": "MK", "NORWAY": "NO",
  // O
  "OMAN": "OM",
  // P
  "PAKISTAN": "PK", "PALAU": "PW", "PALESTINE": "PS", "PANAMA": "PA",
  "PAPUA NEW GUINEA": "PG", "PARAGUAY": "PY", "PERU": "PE", "PHILIPPINES": "PH",
  "POLAND": "PL", "PORTUGAL": "PT", "PUERTO RICO": "PR",
  // Q
  "QATAR": "QA",
  // R
  "ROMANIA": "RO", "RUSSIA": "RU", "RWANDA": "RW",
  // S
  "SAINT KITTS AND NEVIS": "KN", "SAINT LUCIA": "LC",
  "SAINT VINCENT AND THE GRENADINES": "VC", "SAMOA": "WS", "SAN MARINO": "SM",
  "SAO TOME AND PRINCIPE": "ST", "SAUDI ARABIA": "SA", "SENEGAL": "SN",
  "SERBIA": "RS", "SEYCHELLES": "SC", "SIERRA LEONE": "SL", "SINGAPORE": "SG",
  "SLOVAKIA": "SK", "SLOVENIA": "SI", "SOLOMON ISLANDS": "SB", "SOMALIA": "SO",
  "SOUTH AFRICA": "ZA", "SOUTH KOREA": "KR", "SOUTH SUDAN": "SS", "SPAIN": "ES",
  "SRI LANKA": "LK", "SUDAN": "SD", "SURINAME": "SR", "SWEDEN": "SE",
  "SWITZERLAND": "CH", "SYRIA": "SY",
  // T
  "TAIWAN": "TW", "TAJIKISTAN": "TJ", "TANZANIA": "TZ", "THAILAND": "TH",
  "TIMOR-LESTE": "TL", "TOGO": "TG", "TONGA": "TO",
  "TRINIDAD AND TOBAGO": "TT", "TUNISIA": "TN", "TURKEY": "TR", "TURKMENISTAN": "TM",
  "TUVALU": "TV",
  // U
  "UGANDA": "UG", "UKRAINE": "UA",
  "UNITED ARAB EMIRATES": "AE", "UAE": "AE",
  "UNITED KINGDOM": "GB", "UK": "GB",
  "UNITED STATES": "US", "USA": "US",
  "URUGUAY": "UY", "UZBEKISTAN": "UZ",
  // V
  "VANUATU": "VU", "VATICAN CITY": "VA", "VENEZUELA": "VE", "VIETNAM": "VN",
  // Y
  "YEMEN": "YE",
  // Z
  "ZAMBIA": "ZM", "ZIMBABWE": "ZW",
  // Common aliases
  "BRASIL": "BR", "KOREA": "KR", "HONG KONG SAR CHINA": "HK", "AMERICA": "US",
  "UNITED STATES OF AMERICA": "US",
};

// ─── Contractor Self-Service Payment Setup ──────────────────────────────────
// Used by the contractor payment gate — requires only an active session (any role).
// Finds the employee linked to the current user and creates/resumes Stripe Express setup.

export async function initContractorStripeSetup(): Promise<{ onboardingUrl: string; accountId: string } | { error: string }> {
  const { requireSession } = await import("@repo/auth/session");
  const session = await requireSession();

  // Find employee linked to the logged-in user — scoped to active org if available
  const employee = await database.employee.findFirst({
    where: {
      linkedUserId: session.userId,
      ...(session.orgId ? { organizationId: session.orgId } : {}),
    },
    select: {
      id: true,
      legalFirstName: true,
      legalLastName: true,
      personalEmail: true,
      workEmail: true,
      country: true,
      location: true,
      stripeAccountId: true,
      stripeAccountStatus: true,
      organizationId: true,
    },
  });

  if (!employee) return { error: "No linked employee record found" };
  const email = employee.personalEmail ?? employee.workEmail;
  if (!email) return { error: "Employee has no email address" };

  const stripe = getStripe();
  let accountId = employee.stripeAccountId;

  if (accountId) {
    // Already has an account — check if onboarding is complete
    if (employee.stripeAccountStatus === "verified") {
      // Account is fully set up — return login link instead of onboarding
      try {
        const loginLink = await stripe.accounts.createLoginLink(accountId);
        return { onboardingUrl: loginLink.url, accountId };
      } catch {
        // Fall through to onboarding link if login link fails (account may not be fully active yet)
      }
    }
    // Account exists but not verified — generate onboarding link to continue setup
    const onboardingUrl = await createAccountOnboardingLink(stripe, accountId);
    return { onboardingUrl, accountId };
  }

  // Create fresh Stripe Express account
  const countryCode = tryMapCountryToStripe(employee.country ?? employee.location);
  if (!countryCode) {
    return { error: "Country is required for Stripe setup. Please update your country in your profile or ask your administrator to set it." };
  }
  const account = await createStripeConnectAccount(stripe, {
    countryCode,
    email,
    firstName: employee.legalFirstName,
    lastName: employee.legalLastName,
    employeeId: employee.id,
    orgId: employee.organizationId ?? "",
  });

  accountId = account.id;
  await database.employee.update({
    where: { id: employee.id },
    data: {
      stripeAccountId: accountId,
      stripeAccountStatus: "onboarding",
    },
  });

  // Update onboarding step if one exists
  const paymentStep = await database.onboardingStep.findFirst({
    where: {
      session: { employeeId: employee.id, status: { not: "cancelled" } },
      stepType: "payment_setup",
      stepName: { contains: "Stripe" },
    },
    select: { id: true },
  });
  if (paymentStep) {
    await database.onboardingStep.update({
      where: { id: paymentStep.id },
      data: { status: "sent", notes: `Stripe account: ${accountId}` },
    }).catch((e) => console.error("[background task failed]", e));
  }

  const onboardingUrl = await createAccountOnboardingLink(stripe, accountId!);
  return { onboardingUrl, accountId: accountId! };
}

/** Poll contractor's own Stripe Express account status. */
export async function refreshContractorStripeStatus(): Promise<{ status: string; payoutsEnabled: boolean; detailsSubmitted: boolean } | { error: string }> {
  const { requireSession } = await import("@repo/auth/session");
  const session = await requireSession();

  const employee = await database.employee.findFirst({
    where: {
      linkedUserId: session.userId,
      ...(session.orgId ? { organizationId: session.orgId } : {}),
    },
    select: { id: true, stripeAccountId: true, stripeAccountStatus: true, organizationId: true },
  });

  if (!employee) return { error: "No linked employee record" };
  if (!employee.stripeAccountId) return { error: "No Stripe account" };

  const stripe = getStripe();
  const account = await stripe.accounts.retrieve(employee.stripeAccountId);
  const newStatus = deriveAccountStatus(account);

  if (newStatus !== employee.stripeAccountStatus) {
    await database.employee.update({
      where: { id: employee.id },
      data: { stripeAccountStatus: newStatus },
    });

    // Auto-complete onboarding step
    if (newStatus === "verified" || newStatus === "restricted") {
      const paymentStep = await database.onboardingStep.findFirst({
        where: {
          session: { employeeId: employee.id, status: { not: "cancelled" } },
          stepType: "payment_setup",
          stepName: { contains: "Stripe" },
          status: { not: "completed" },
        },
        select: { id: true },
      });
      if (paymentStep) {
        await database.onboardingStep.update({
          where: { id: paymentStep.id },
          data: { status: "completed", completedAt: new Date() },
        }).catch((e) => console.error("[background task failed]", e));
      }
    }
  }

  return {
    status: newStatus,
    payoutsEnabled: account.payouts_enabled ?? false,
    detailsSubmitted: account.details_submitted ?? false,
  };
}

/**
 * Send the Stripe Connect onboarding link to the org admin.
 * Creates the account if it doesn't exist yet, generates a fresh onboarding link,
 * and emails it to the admin.
 */
export async function sendOrgConnectSetupEmail(orgId: string): Promise<{ success: true; onboardingUrl: string } | { error: string }> {
  try {
    await requireRole("super_admin");
  } catch (err: any) {
    return { error: `Permission denied: ${err.message}` };
  }

  const result = await initOrgConnectAccount(orgId);
  if ("error" in result) return result;

  const org = await database.organization.findUnique({
    where: { id: orgId },
    select: { name: true, profile: { select: { adminEmail: true, adminName: true } } },
  });

  if (!org?.profile?.adminEmail) return { error: "No admin email configured for this organization" };

  const { sendViaGmailSystem } = await import("./send-email");
  const { layout, heading, greeting, paragraph, primaryButton, highlightBox } = await import("./email-templates");

  const body =
    heading("Complete Your Stripe Setup") +
    greeting(org.profile.adminName || org.name) +
    paragraph("To receive and manage contractor payments on HRIQ, please complete your Stripe Connect setup by clicking the link below.") +
    primaryButton("Set Up Stripe Connect", result.onboardingUrl) +
    highlightBox("blue", "<strong>What this does:</strong> Creates your Stripe Express account so you can pay contractors directly and view payout history.") +
    paragraph("<small>This link expires in 24 hours. If it expires, your admin can generate a new one.</small>");

  try {
    await sendViaGmailSystem(
      org.profile.adminEmail,
      `Stripe Connect Setup — ${org.name}`,
      layout(body, "This is an automated notification from Remote Leverage."),
    );
  } catch (emailErr) {
    console.error("[HRIQ] Email send failed (non-blocking):", emailErr);
  }

  revalidatePath("/[orgSlug]/organizations", "page");
  return { success: true, onboardingUrl: result.onboardingUrl };
}
