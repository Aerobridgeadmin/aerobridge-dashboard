import { NextResponse } from "next/server";
import { database } from "@repo/database";

/**
 * Check current Stripe Connect status for the logged-in user's org or employee.
 * Used by the /stripe-connect/complete page to poll for verification.
 */
export async function POST() {
  try {
    const { getSessionContext } = await import("@repo/auth/session");
    const session = await getSessionContext();
    if (!session) return NextResponse.json({ status: "error" }, { status: 401 });

    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

    // Try org-level first (client admin)
    if (session.orgId) {
      const org = await database.organization.findUnique({
        where: { id: session.orgId },
        select: { stripeConnectAccountId: true, stripeConnectStatus: true },
      });

      if (org?.stripeConnectAccountId) {
        const account = await stripe.accounts.retrieve(org.stripeConnectAccountId);
        const newStatus = account.payouts_enabled && account.details_submitted
          ? "verified"
          : account.details_submitted
            ? "restricted"
            : "onboarding";

        if (newStatus !== org.stripeConnectStatus) {
          await database.organization.update({
            where: { id: session.orgId },
            data: { stripeConnectStatus: newStatus },
          });
        }

        return NextResponse.json({ status: newStatus, type: "org" });
      }
    }

    // Try employee-level (contractor)
    const employee = await database.employee.findFirst({
      where: { linkedUserId: session.userId, stripeAccountId: { not: null } },
      select: { id: true, stripeAccountId: true, stripeAccountStatus: true },
    });

    if (employee?.stripeAccountId) {
      const account = await stripe.accounts.retrieve(employee.stripeAccountId);
      const newStatus = account.payouts_enabled && account.details_submitted
        ? "verified"
        : account.details_submitted
          ? "restricted"
          : "onboarding";

      if (newStatus !== employee.stripeAccountStatus) {
        await database.employee.update({
          where: { id: employee.id },
          data: { stripeAccountStatus: newStatus },
        });
      }

      return NextResponse.json({ status: newStatus, type: "employee" });
    }

    return NextResponse.json({ status: "none" });
  } catch (err) {
    console.error("[check-status] Error:", err);
    return NextResponse.json({ status: "error" });
  }
}
