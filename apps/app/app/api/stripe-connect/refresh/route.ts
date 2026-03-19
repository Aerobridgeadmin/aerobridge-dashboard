import { NextRequest, NextResponse } from "next/server";
import { database } from "@repo/database";

/**
 * Stripe Connect Account Onboarding — Refresh URL
 * Stripe redirects here when the onboarding link expires.
 * We generate a new link and redirect back to Stripe.
 * Handles both employee-level AND organization-level Connect accounts.
 */
export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get("account");
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_WEB_URL || "").replace(/\/+$/, "") || "https://hriq.remoteleverage.com";

  if (!accountId) {
    return NextResponse.redirect(`${appUrl}/stripe-gate`);
  }

  try {
    // Check employee first, then organization
    const employee = await database.employee.findFirst({
      where: { stripeAccountId: accountId },
      select: { id: true },
    });

    const org = !employee
      ? await database.organization.findFirst({
          where: { stripeConnectAccountId: accountId },
          select: { id: true, slug: true },
        })
      : null;

    if (!employee && !org) {
      console.warn(`[Stripe Connect] Refresh: No employee or org found for account ${accountId} — likely orphaned`);
      return NextResponse.redirect(`${appUrl}/stripe-gate`);
    }

    // Generate a new onboarding link — or redirect to dashboard if already verified
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

    // Check if account is already fully set up
    const account = await stripe.accounts.retrieve(accountId);
    if (account.details_submitted && (account.payouts_enabled || account.charges_enabled)) {
      // Already verified — redirect to the completion page instead of re-onboarding
      const name = employee
        ? (await database.employee.findFirst({ where: { id: employee.id }, select: { legalFirstName: true } }))?.legalFirstName ?? ""
        : (org ? (await database.organization.findFirst({ where: { id: org.id }, select: { name: true } }))?.name ?? "" : "");
      return NextResponse.redirect(`${appUrl}/stripe-connect/complete?status=verified&name=${encodeURIComponent(name)}`);
    }

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${appUrl}/api/stripe-connect/refresh?account=${accountId}`,
      return_url: `${appUrl}/api/stripe-connect/return?account=${accountId}`,
      type: "account_onboarding",
    });

    return NextResponse.redirect(accountLink.url);
  } catch (err) {
    console.error("[Stripe Connect] Refresh route error:", err);
    return NextResponse.redirect(`${appUrl}/stripe-gate`);
  }
}
