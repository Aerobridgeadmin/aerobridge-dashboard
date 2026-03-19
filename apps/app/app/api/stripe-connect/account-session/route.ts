import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { database } from "@repo/database";
import { getSessionContext } from "@repo/auth/session";

/**
 * Create a Stripe AccountSession for embedded Connect components.
 * The client secret returned allows rendering onboarding, payouts, payments
 * components directly inside HRIQ without redirecting to Stripe.
 */
export async function POST(request: NextRequest) {
  try {
    // Auth: require logged-in user with access to the employee's org
    const session = await getSessionContext();
    if (!session) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
    }

    const { employeeId } = await request.json();
    if (!employeeId) {
      return NextResponse.json({ error: "Missing employeeId" }, { status: 400 });
    }

    // Scope query: super_admins can access any employee; others only their org
    const whereClause: any = { id: employeeId };
    if (session.orgRole !== "super_admin" && session.orgId) {
      whereClause.organizationId = session.orgId;
    }

    const employee = await database.employee.findFirst({
      where: whereClause,
      select: { stripeAccountId: true },
    });

    if (!employee?.stripeAccountId) {
      return NextResponse.json({ error: "No Stripe account for this contractor" }, { status: 404 });
    }

    const stripe = new Stripe(stripeKey);

    const accountSession = await stripe.accountSessions.create({
      account: employee.stripeAccountId,
      components: {
        account_onboarding: { enabled: true },
        account_management: { enabled: true },
        payouts: { enabled: true },
        payments: { enabled: true },
        balances: { enabled: true },
      },
    });

    return NextResponse.json({ clientSecret: accountSession.client_secret });
  } catch (err: any) {
    console.error("[Stripe Connect] AccountSession creation failed:", err.message);
    return NextResponse.json(
      { error: "Failed to create account session" },
      { status: 500 }
    );
  }
}
