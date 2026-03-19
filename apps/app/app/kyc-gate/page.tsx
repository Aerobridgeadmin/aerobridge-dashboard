import { currentUser } from "@repo/auth/server";
import { getSessionContext } from "@repo/auth/session";
import { database } from "@repo/database";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { KycGateClient } from "./kyc-gate-client";

export const metadata: Metadata = {
  title: "Identity Verification — Remote Leverage",
  description:
    "Complete identity verification to activate your organization dashboard.",
};

export default async function KycGatePage({
  searchParams,
}: {
  searchParams: Promise<{ verified?: string }>;
}) {
  const [user, session, params] = await Promise.all([
    currentUser(),
    getSessionContext(),
    searchParams,
  ]);

  if (!user || !session) {
    redirect("/sign-in");
  }

  const orgId = session.orgId;
  if (!orgId) {
    redirect("/");
  }

  // Super admins skip KYC gate entirely
  if (session.orgRole === "super_admin") {
    const org = await database.organization.findUnique({
      where: { id: orgId },
      select: { slug: true },
    });
    redirect(`/${org?.slug || ""}`);
  }

  // Get org profile with KYC status
  const profile = await database.organizationProfile.findUnique({
    where: { organizationId: orgId },
    select: {
      kycStatus: true,
      kycSessionUrl: true,
      veriffSessionId: true,
      kycInitiatedAt: true,
      kycRejectionReason: true,
      adminName: true,
      adminEmail: true,
      country: true,
      organization: { select: { name: true, slug: true } },
    },
  });

  if (!profile) {
    redirect("/");
  }

  // ?verified=1: client just completed Veriff and was sent back here to let the
  // server do a proper redirect. Veriff webhooks can take a few seconds — poll
  // up to 8s for kycStatus to reach "approved" before falling through to the
  // submitted UI (which continues polling client-side every 3s).
  if (params.verified === "1" && profile.kycStatus !== "approved") {
    let latestStatus = profile.kycStatus;
    for (let attempt = 0; attempt < 8; attempt++) {
      await new Promise<void>((resolve) => setTimeout(resolve, 1000));
      const fresh = await database.organizationProfile.findUnique({
        where: { organizationId: orgId },
        select: { kycStatus: true },
      });
      latestStatus = fresh?.kycStatus ?? latestStatus;
      if (latestStatus === "approved") break;
    }
    if (latestStatus === "approved") {
      redirect(`/${profile.organization.slug}`);
    }
    // Still not approved after 8s — fall through to client with "submitted" state
    // so client-side polling resumes immediately
  }

  // Already approved — go straight to dashboard
  if (profile.kycStatus === "approved") {
    redirect(`/${profile.organization.slug}`);
  }

  const terminalStatuses = ["expired", "declined", "abandoned"];
  const hasValidSession =
    profile.kycSessionUrl &&
    profile.veriffSessionId &&
    !terminalStatuses.includes(profile.kycStatus || "");

  // If coming from ?verified=1 but webhook hasn't fired yet, force "submitted"
  // so the client immediately starts polling rather than re-launching the SDK
  const effectiveStatus =
    params.verified === "1" && profile.kycStatus !== "approved"
      ? "submitted"
      : (profile.kycStatus || "pending");

  return (
    <KycGateClient
      orgName={profile.organization.name}
      orgSlug={profile.organization.slug}
      adminName={profile.adminName || user.user_metadata?.name || "there"}
      sessionUrl={hasValidSession ? profile.kycSessionUrl! : null}
      kycStatus={effectiveStatus}
      rejectionReason={profile.kycRejectionReason || null}
    />
  );
}
