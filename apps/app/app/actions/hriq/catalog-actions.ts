"use server";

import { requireRole } from "@repo/auth/session";
import { database } from "@repo/database";

const PPP_PRICE_PER_VA_CENTS = 3000_00; // $3,000 in cents

const COR_PRICE_PER_VA_CENTS = 4200_00; // $4,200 in cents

function getServicePrice(serviceKey: string): number {
  if (serviceKey === "cor") return COR_PRICE_PER_VA_CENTS;
  return PPP_PRICE_PER_VA_CENTS;
}
function getServiceName(serviceKey: string): string {
  if (serviceKey === "cor") return "Contractor of Record (COR)";
  return "Performance & Payroll Package (PPP)";
}

// ─── Unified checkout for ACH / CC ───────────────────────────────────────────
export async function createCatalogCheckout(
  orgId: string,
  vaCount: number,
  serviceKey: string,
  paymentType: "ach" | "cc",
): Promise<{ url: string } | { error: string }> {
  try { await requireRole("super_admin"); } catch (err: any) { return { error: `Permission denied: ${err.message}` }; }

  try {
    const { default: Stripe } = await import("stripe");
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) return { error: "Stripe is not configured." };
    const stripe = new Stripe(stripeKey);

    const org = await database.organization.findUnique({ where: { id: orgId }, include: { profile: true } });
    if (!org) return { error: "Organization not found" };

    let customerId = org.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: org.name,
        email: org.profile?.billingEmail ?? org.profile?.adminEmail ?? undefined,
        metadata: { hriq_org_id: org.id },
      });
      customerId = customer.id;
      await database.organization.update({ where: { id: orgId }, data: { stripeCustomerId: customerId } });
    }

    const basePriceCents = getServicePrice(serviceKey);
    const ccFeeCents = paymentType === "cc" ? Math.round(basePriceCents * 0.03) : 0;
    const totalCents = basePriceCents + ccFeeCents;
    const svcName = getServiceName(serviceKey);
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: paymentType === "cc" ? ["card"] : ["card", "us_bank_account"],
      line_items: [
        {
          price_data: { currency: "usd", product_data: { name: svcName, description: `Annual — ${vaCount} VA${vaCount > 1 ? "s" : ""} × $${basePriceCents / 100}/year` }, unit_amount: totalCents },
          quantity: vaCount,
        },
        ...(paymentType === "cc" ? [{
          price_data: { currency: "usd", product_data: { name: "Credit Card Processing Fee (3%)" }, unit_amount: Math.round(basePriceCents * vaCount * 0.03) },
          quantity: 1,
        }] : []),
      ],
      mode: "payment",
      success_url: `${appUrl}/catalog?payment=success&org=${orgId}`,
      cancel_url: `${appUrl}/catalog?payment=cancelled&org=${orgId}`,
      metadata: { hriq_type: `${serviceKey}_enrollment`, hriq_org_id: orgId },
      expires_at: Math.floor(Date.now() / 1000) + 1800,
    });

    return { url: session.url! };
  } catch (err: any) {
    return { error: err.message || "Failed to create checkout" };
  }
}

// ─── Financing step 2: Splitit installment plan for base amount ───────────────
export async function createCatalogSplititCheckout(
  orgId: string,
  vaCount: number,
  serviceKey: string,
  numberOfInstallments: number = 3,
): Promise<{ url: string } | { error: string }> {
  try { await requireRole("super_admin"); } catch (err: any) { return { error: `Permission denied: ${err.message}` }; }

  try {
    const org = await database.organization.findUnique({ where: { id: orgId }, include: { profile: true } });
    if (!org) return { error: "Organization not found" };

    const basePriceCents = getServicePrice(serviceKey);
    const baseTotal = (basePriceCents / 100) * vaCount;
    // Customer finances the full amount including 10% fee — nothing due today
    const totalWithFee = Math.round(baseTotal * 1.10 * 100) / 100;
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");

    const { createSplititInstallmentPlan } = await import("@repo/integrations/splitit");
    const result = await createSplititInstallmentPlan({
      totalAmount: totalWithFee,
      currency: "USD",
      numberOfInstallments,
      refOrderNumber: orgId,
      customerEmail: org.profile?.billingEmail ?? org.profile?.adminEmail ?? undefined,
      customerName: org.name,
      successUrl: `${appUrl}/catalog?payment=success&org=${orgId}`,
      cancelUrl: `${appUrl}/catalog?payment=cancelled&org=${orgId}`,
    });

    return { url: result.checkoutUrl };
  } catch (err: any) {
    return { error: err.message || "Failed to create Splitit plan" };
  }
}
