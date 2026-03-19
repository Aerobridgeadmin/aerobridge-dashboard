import { NextRequest, NextResponse } from "next/server";
import { database } from "@repo/database";

/**
 * Stripe Connect Account Onboarding — Return URL
 * User is redirected here after completing the Stripe onboarding flow.
 * Handles both employee-level AND organization-level Connect accounts.
 */
export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get("account");
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_WEB_URL || "").replace(/\/+$/, "") || "https://hriq.remoteleverage.com";

  if (!accountId) {
    return NextResponse.redirect(`${appUrl}/stripe-connect/complete?status=error`);
  }

  try {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    const account = await stripe.accounts.retrieve(accountId);

    const status = account.payouts_enabled && account.details_submitted
      ? "verified"
      : account.details_submitted
        ? "restricted"
        : "onboarding";

    // Try employee first
    const employee = await database.employee.findFirst({
      where: { stripeAccountId: accountId },
      select: { id: true, legalFirstName: true, organizationId: true, organization: { select: { slug: true } } },
    });

    if (employee) {
      await database.employee.update({
        where: { id: employee.id },
        data: { stripeAccountStatus: status },
      });

      // Auto-complete payment_setup onboarding step
      if (status === "verified" || status === "restricted") {
        try {
          const activeSession = await database.onboardingSession.findFirst({
            where: { employeeId: employee.id, status: { notIn: ["completed", "cancelled"] } },
            select: { id: true },
            orderBy: { createdAt: "desc" },
          });
          if (activeSession) {
            const paymentStep = await database.onboardingStep.findFirst({
              where: { sessionId: activeSession.id, stepType: "payment_setup", status: { not: "completed" } },
            });
            if (paymentStep) {
              await database.onboardingStep.update({
                where: { id: paymentStep.id },
                data: { status: "completed", completedAt: new Date() },
              });
              const { recomputeSessionProgress } = await import("@/lib/hriq/utils");
              await recomputeSessionProgress(activeSession.id);
            }
          }
        } catch (stepErr) {
          console.error("[Stripe Connect] Return: Failed to complete payment step:", stepErr);
        }
      }

      return NextResponse.redirect(`${appUrl}/stripe-connect/complete?status=${status}&name=${encodeURIComponent(employee.legalFirstName ?? "")}`);
    }

    // Try organization
    const org = await database.organization.findFirst({
      where: { stripeConnectAccountId: accountId },
      select: { id: true, name: true, slug: true },
    });

    if (org) {
      await database.organization.update({
        where: { id: org.id },
        data: { stripeConnectStatus: status },
      });

      // If verified, redirect to the org dashboard directly
      if (status === "verified" || status === "restricted") {
        return NextResponse.redirect(`${appUrl}/stripe-connect/complete?status=${status}&name=${encodeURIComponent(org.name ?? "")}`);
      }
      return NextResponse.redirect(`${appUrl}/stripe-connect/complete?status=${status}&name=${encodeURIComponent(org.name ?? "")}`);
    }

    console.error(`[Stripe Connect] Return: No employee or org found for account ${accountId}`);
    return NextResponse.redirect(`${appUrl}/stripe-connect/complete?status=error`);
  } catch (err) {
    console.error("[Stripe Connect] Return route error:", err);
    return NextResponse.redirect(`${appUrl}/stripe-connect/complete?status=error`);
  }
}
