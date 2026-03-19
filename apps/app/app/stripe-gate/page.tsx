import { currentUser } from "@repo/auth/server";
import { getSessionContext } from "@repo/auth/session";
import { database } from "@repo/database";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { StripeGateClient } from "./stripe-gate-client";

export const metadata: Metadata = {
  title: "Payment Setup — Remote Leverage",
  description: "Set up your Stripe account to receive and view contractor payments.",
};

export default async function StripeGatePage() {
  const [user, session] = await Promise.all([
    currentUser(),
    getSessionContext(),
  ]);

  if (!user || !session) {
    redirect("/sign-in");
  }

  const orgId = session.orgId;
  if (!orgId) {
    redirect("/");
  }

  // Super admins and RL org skip this gate
  const RL_ORG_ID = process.env.RL_ORGANIZATION_ID ?? "org_rl_001";
  if (session.orgRole === "super_admin" || orgId === RL_ORG_ID) {
    const org = await database.organization.findUnique({
      where: { id: orgId },
      select: { slug: true },
    });
    redirect(`/${org?.slug || ""}`);
  }

  const org = await database.organization.findUnique({
    where: { id: orgId },
    select: {
      name: true,
      slug: true,
      stripeConnectAccountId: true,
      stripeConnectStatus: true,
      profile: { select: { adminName: true, adminEmail: true, country: true, paymentMethod: true } },
    },
  });

  if (!org) {
    redirect("/");
  }

  // Only ppp and both orgs need Stripe Connect — skip for everyone else
  const orgPaymentMethod = org.profile?.paymentMethod ?? null;
  if (orgPaymentMethod !== "ppp" && orgPaymentMethod !== "both") {
    redirect(`/${org.slug}`);
  }

  // Already set up — go to dashboard
  const activeStatuses = ["verified", "restricted"];
  if (org.stripeConnectAccountId && activeStatuses.includes(org.stripeConnectStatus ?? "")) {
    redirect(`/${org.slug}`);
  }

  return (
    <StripeGateClient
      orgId={orgId}
      orgName={org.name}
      orgSlug={org.slug}
      adminName={org.profile?.adminName || user.user_metadata?.name || "there"}
      hasAccount={!!org.stripeConnectAccountId}
      status={org.stripeConnectStatus ?? "none"}
    />
  );
}
