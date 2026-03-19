import { database } from "@repo/database";
import type { Metadata } from "next";
import { VerifyClient } from "./verify-client";

export const metadata: Metadata = {
  title: "Identity Verification — Remote Leverage",
  description:
    "Verify your identity securely to complete your organization onboarding with Remote Leverage.",
};

export default async function VerifyPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;

  // Look up org profile by Veriff session ID
  const profile = await database.organizationProfile.findFirst({
    where: { veriffSessionId: sessionId },
    select: {
      adminName: true,
      adminEmail: true,
      kycStatus: true,
      kycSessionUrl: true,
      veriffSessionId: true,
      organization: { select: { name: true } },
    },
  });

  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0c10] p-4">
        <div className="w-full max-w-md text-center">
          <img
            src="/logo.png"
            alt="Remote Leverage"
            className="mx-auto mb-4 h-16 w-16"
          />
          <h1 className="text-xl font-bold text-white">Verification Not Found</h1>
          <p className="mt-2 text-sm text-white/50">
            This verification link is no longer valid or has expired. Please
            contact your Remote Leverage coordinator for a new link.
          </p>
        </div>
      </div>
    );
  }

  if (profile.kycStatus === "approved") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0c10] p-4">
        <div className="mx-auto w-full max-w-lg">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-lg">
            <div
              className="px-6 py-8 text-center"
              style={{
                background: "linear-gradient(135deg, #00B0BB 0%, #00DB65 100%)",
              }}
            >
              <img
                src="/logo.png"
                alt="Remote Leverage"
                className="mx-auto mb-3 h-14 w-14 rounded-xl"
              />
              <h1 className="text-xl font-bold text-white">
                Already Verified
              </h1>
            </div>
            <div className="p-6 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15">
                <svg
                  className="h-8 w-8 text-emerald-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <p className="text-sm text-white/60">
                Identity verification for{" "}
                <strong>{profile.organization.name}</strong> has already been
                completed. No further action is needed.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Handle terminal/expired statuses where verification can't proceed
  // "submitted" or "resubmission_requested": show a pending/waiting screen rather than re-launching
  if (profile.kycStatus === "submitted") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0c10] p-4">
        <div className="mx-auto w-full max-w-lg text-center">
          <img src="/logo.png" alt="Remote Leverage" className="mx-auto mb-4 h-16 w-16 rounded-xl" />
          <h1 className="text-xl font-bold text-white">Verification Submitted</h1>
          <p className="mt-2 text-sm text-white/50">
            Thank you! Your identity documents for <strong>{profile.organization.name}</strong> have been submitted and are under review. You'll receive an email once the review is complete — this usually takes just a few minutes.
          </p>
          <p className="mt-4 text-xs text-white/30">You can safely close this page.</p>
        </div>
      </div>
    );
  }

  if (profile.kycStatus === "resubmission_requested") {
    return (
      <VerifyClient
        sessionUrl={profile.kycSessionUrl ?? ""}
        adminName={profile.adminName || "there"}
        orgName={profile.organization.name}
        kycStatus="resubmission_requested"
      />
    );
  }

  const terminalStatuses = ["expired", "declined", "abandoned"];
  if (terminalStatuses.includes(profile.kycStatus || "")) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0c10] p-4">
        <div className="mx-auto w-full max-w-lg">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-lg">
            <div
              className="px-6 py-8 text-center"
              style={{
                background: "linear-gradient(135deg, #00B0BB 0%, #00DB65 100%)",
              }}
            >
              <img
                src="/logo.png"
                alt="Remote Leverage"
                className="mx-auto mb-3 h-14 w-14 rounded-xl"
              />
              <h1 className="text-xl font-bold text-white">
                {profile.kycStatus === "expired"
                  ? "Verification Expired"
                  : profile.kycStatus === "declined"
                    ? "Verification Declined"
                    : "Verification Unavailable"}
              </h1>
            </div>
            <div className="p-6 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-yellow-500/15">
                <svg
                  className="h-8 w-8 text-yellow-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
              </div>
              <p className="text-sm text-white/60">
                {profile.kycStatus === "expired"
                  ? "This verification link has expired."
                  : profile.kycStatus === "declined"
                    ? "Your identity verification was not approved."
                    : "This verification session is no longer available."}
                {" "}Please contact your Remote Leverage coordinator to receive a
                new verification link.
              </p>
              {profile.kycStatus === "declined" && (
                <p className="mt-3 text-xs text-white/40">
                  Your coordinator can send a new verification email from the
                  organization dashboard.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Guard: if session URL is missing, can't proceed
  if (!profile.kycSessionUrl) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0c10] p-4">
        <div className="w-full max-w-md text-center">
          <img
            src="/logo.png"
            alt="Remote Leverage"
            className="mx-auto mb-4 h-16 w-16"
          />
          <h1 className="text-xl font-bold text-white">Verification Not Ready</h1>
          <p className="mt-2 text-sm text-white/50">
            The verification session is being prepared. Please try again in a
            moment, or contact your Remote Leverage coordinator.
          </p>
        </div>
      </div>
    );
  }

  return (
    <VerifyClient
      sessionUrl={profile.kycSessionUrl}
      adminName={profile.adminName || "there"}
      orgName={profile.organization.name}
      kycStatus={profile.kycStatus || "created"}
    />
  );
}
