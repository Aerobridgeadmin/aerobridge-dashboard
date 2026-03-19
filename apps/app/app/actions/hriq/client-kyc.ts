"use server";

import { requireRole } from "@repo/auth/session";
import { database } from "@repo/database";
import { revalidatePath } from "next/cache";
import { HriqError } from "@/lib/hriq/errors";
import { serialize } from "@/lib/hriq/serialize";

// ─── Initiate KYC Verification ───────────────────────────────────────────────

/**
 * Start a Veriff identity verification session for a client org admin.
 * Creates a Veriff session, stores the session URL, and sends the
 * verification email to the org admin.
 */
export async function initiateClientKyc(organizationId: string) {
  try {
    const session = await requireRole("super_admin");

    // Get org + profile
    const org = await database.organization.findUnique({
      where: { id: organizationId },
      include: { profile: true },
    });
    if (!org) throw new HriqError("HRIQ-1601", "Organization not found");

    const profile = org.profile;
    if (!profile) throw new HriqError("HRIQ-1601", "Organization profile not found — create it first");

    const adminEmail = profile.adminEmail;
    const adminName = profile.adminName || adminEmail?.split("@")[0] || "Admin";
    if (!adminEmail) throw new HriqError("HRIQ-1405", "Organization admin email is required for KYC");

    // Check if already verified
    if (profile.kycStatus === "approved") {
      throw new HriqError("HRIQ-9903", "This organization is already KYC verified");
    }

    // Create Veriff session
    const { createVeriffSession } = await import("@repo/integrations/veriff");

    const veriffResponse = await createVeriffSession({
      organizationId,
      fullName: adminName,
      email: adminEmail,
      documentCountry: profile.country || undefined,
    });

    const veriffSessionId = veriffResponse.verification.id;
    const veriffUrl = veriffResponse.verification.url;

    // Update org profile with session info
    await database.organizationProfile.update({
      where: { organizationId },
      data: {
        kycStatus: "created",
        kycProvider: "veriff",
        veriffSessionId,
        kycSessionUrl: veriffUrl,
        kycInitiatedAt: new Date(),
        kycInitiatedBy: session.userId,
        kycRejectionReason: null,
      },
    });

    // Audit log
    try {
      await database.auditLog.create({
        data: {
          organizationId,
          actorType: "user",
          actorUserId: session.userId,
          action: "kyc.initiated",
          objectType: "organization",
          objectId: organizationId,
          newValue: serialize({
            provider: "veriff",
            sessionId: veriffSessionId,
            adminEmail,
          }),
        },
      });
    } catch (auditErr) {
      console.error("[HRIQ] Audit log write failed (non-blocking):", auditErr);
    }

    // Admin is already on the Veriff screen — no need to email the same link
    const brandedUrl = `${process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://hriq.remoteleverage.com"}/verify/${veriffSessionId}`;

    revalidatePath("/[orgSlug]/settings", "page");
    revalidatePath("/", "layout");

    return {
      sessionId: veriffSessionId,
      verificationUrl: brandedUrl,
      emailSent: false,
    };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[client-kyc.ts:initiateClientKyc]", _msg);
    return { error: _msg };
  }
}

// ─── Resend KYC Email ────────────────────────────────────────────────────────

/**
 * Resend the Veriff verification email to the org admin.
 * Creates a new session if the old one expired.
 */
export async function resendClientKycEmail(organizationId: string) {
  try {
    const session = await requireRole("super_admin");

    const org = await database.organization.findUnique({
      where: { id: organizationId },
      include: { profile: true },
    });
    if (!org) throw new HriqError("HRIQ-1601");
    if (!org.profile) throw new HriqError("HRIQ-1601");

    const profile = org.profile;
    const adminEmail = profile.adminEmail;
    const adminName = profile.adminName || "Admin";
    if (!adminEmail) throw new HriqError("HRIQ-1405", "Organization admin email is required");

    if (profile.kycStatus === "approved") {
      throw new HriqError("HRIQ-9903", "Already verified — no need to resend");
    }

    // If session is expired or old, create a new one
    let veriffUrl = profile.kycSessionUrl;
    let veriffSessionId = profile.veriffSessionId;

    const isExpiredOrMissing =
      !veriffUrl ||
      !veriffSessionId ||
      profile.kycStatus === "expired" ||
      profile.kycStatus === "declined" ||
      profile.kycStatus === "resubmission_requested" ||
      (profile.kycInitiatedAt && Date.now() - profile.kycInitiatedAt.getTime() > 6 * 24 * 60 * 60 * 1000); // >6 days

    if (isExpiredOrMissing) {
      // Create fresh session
      const { createVeriffSession } = await import("@repo/integrations/veriff");
      const veriffResponse = await createVeriffSession({
        organizationId,
        fullName: adminName,
        email: adminEmail,
        documentCountry: profile.country || undefined,
      });
      veriffSessionId = veriffResponse.verification.id;
      veriffUrl = veriffResponse.verification.url;

      await database.organizationProfile.update({
        where: { organizationId },
        data: {
          kycStatus: "created",
          veriffSessionId,
          kycSessionUrl: veriffUrl,
          kycInitiatedAt: new Date(),
          kycRejectionReason: null,
        },
      });
    }

    // Send email — link to our branded page
    const brandedResendUrl = `${process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://hriq.remoteleverage.com"}/verify/${veriffSessionId}`;
    const { sendClientKycEmail } = await import("./send-email");
    try {
      await sendClientKycEmail(adminEmail, adminName, org.name, brandedResendUrl);
    } catch (emailErr) {
      console.error("[HRIQ] Email send failed (non-blocking):", emailErr);
    }

    try {
      await database.auditLog.create({
        data: {
          organizationId,
          actorType: "user",
          actorUserId: session.userId,
          action: "kyc.email_resent",
          objectType: "organization",
          objectId: organizationId,
        },
      });
    } catch (auditErr) {
      console.error("[HRIQ] Audit log write failed (non-blocking):", auditErr);
    }

    revalidatePath("/[orgSlug]/settings", "page");

    return { emailSent: true, newSession: isExpiredOrMissing };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[client-kyc.ts:resendClientKycEmail]", _msg);
    return { error: _msg };
  }
}

// ─── Get KYC Status ──────────────────────────────────────────────────────────

export async function getClientKycStatus(organizationId: string) {
  await requireRole("super_admin");

  const profile = await database.organizationProfile.findUnique({
    where: { organizationId },
    select: {
      kycStatus: true,
      kycProvider: true,
      veriffSessionId: true,
      kycVerifiedAt: true,
      kycVerifiedName: true,
      kycDocumentType: true,
      kycDocumentCountry: true,
      kycRejectionReason: true,
      kycSessionUrl: true,
      kycInitiatedAt: true,
      adminEmail: true,
      adminName: true,
    },
  });

  if (!profile) return null;

  return {
    status: profile.kycStatus || "pending",
    provider: profile.kycProvider,
    sessionId: profile.veriffSessionId,
    verifiedAt: profile.kycVerifiedAt,
    verifiedName: profile.kycVerifiedName,
    documentType: profile.kycDocumentType,
    documentCountry: profile.kycDocumentCountry,
    rejectionReason: profile.kycRejectionReason,
    sessionUrl: profile.kycSessionUrl,
    initiatedAt: profile.kycInitiatedAt,
    adminEmail: profile.adminEmail,
    adminName: profile.adminName,
  };
}

// ─── Manual KYC Override ─────────────────────────────────────────────────────

/**
 * Manually mark an org as KYC verified (for cases where verification
 * was done outside Veriff, e.g. in-person document check).
 */
export async function manualKycApproval(organizationId: string, data: {
  verifiedName: string;
  documentType?: string;
  documentCountry?: string;
  notes?: string;
}) {
  const session = await requireRole("super_admin");

  await database.organizationProfile.update({
    where: { organizationId },
    data: {
      kycStatus: "approved",
      kycProvider: "manual",
      kycVerifiedAt: new Date(),
      kycVerifiedName: data.verifiedName,
      kycDocumentType: data.documentType || null,
      kycDocumentCountry: data.documentCountry || null,
      kycRejectionReason: null,
    },
  });

  try {
    await database.auditLog.create({
      data: {
        organizationId,
        actorType: "user",
        actorUserId: session.userId,
        action: "kyc.manual_approval",
        objectType: "organization",
        objectId: organizationId,
        newValue: serialize(data),
      },
    });
  } catch (auditErr) {
    console.error("[HRIQ] Audit log write failed (non-blocking):", auditErr);
  }

  revalidatePath("/[orgSlug]/settings", "page");
  revalidatePath("/", "layout");

  return { ok: true };
}

// ─── Reset KYC ───────────────────────────────────────────────────────────────

/**
 * Reset KYC status back to pending (e.g. if admin changed, need re-verification).
 */
export async function resetClientKyc(organizationId: string) {
  try {
    const session = await requireRole("super_admin");

    const profile = await database.organizationProfile.findUnique({
      where: { organizationId },
      select: { kycStatus: true },
    });
    if (!profile) throw new HriqError("HRIQ-1601", "Organization profile not found");

    await database.organizationProfile.update({
      where: { organizationId },
      data: {
        kycStatus: "pending",
        kycProvider: null,
        veriffSessionId: null,
        veriffDecision: undefined,
        kycVerifiedAt: null,
        kycVerifiedName: null,
        kycDocumentType: null,
        kycDocumentCountry: null,
        kycRejectionReason: null,
        kycSessionUrl: null,
        kycInitiatedAt: null,
        kycInitiatedBy: null,
      },
    });

    try {
      await database.auditLog.create({
        data: {
          organizationId,
          actorType: "user",
          actorUserId: session.userId,
          action: "kyc.reset",
          objectType: "organization",
          objectId: organizationId,
          oldValue: serialize({ previousStatus: profile?.kycStatus }),
        },
      });
    } catch (auditErr) {
      console.error("[HRIQ] Audit log write failed (non-blocking):", auditErr);
    }

    revalidatePath("/[orgSlug]/settings", "page");
    revalidatePath("/", "layout");

    return { ok: true };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[client-kyc.ts:resetClientKyc]", _msg);
    return { error: _msg };
  }
}

// ─── Self-Service KYC (Login Gate) ───────────────────────────────────────────

/**
 * Called by the client admin themselves after login.
 * Creates a Veriff session for their own org if one doesn't exist.
 * Requires "admin" role (not super_admin).
 */
export async function initiateSelfKyc() {
  try {
    const session = await requireRole("admin", "super_admin");
    const orgId = session.orgId;
    if (!orgId) throw new HriqError("HRIQ-1601", "No active organization");

    const profile = await database.organizationProfile.findUnique({
      where: { organizationId: orgId },
      include: { organization: { select: { name: true } } },
    });

    if (!profile) throw new HriqError("HRIQ-1601", "Organization profile not found");
    if (profile.kycStatus === "approved") {
      return { status: "approved" as const, sessionUrl: null };
    }

    // If there's already a session, reuse it unless it's in a terminal state
    const terminalStatuses = ["expired", "declined", "abandoned"];
    const hasValidSession =
      profile.kycSessionUrl &&
      profile.veriffSessionId &&
      !terminalStatuses.includes(profile.kycStatus || "");

    if (hasValidSession) {
      return {
        status: profile.kycStatus as string,
        sessionUrl: profile.kycSessionUrl,
        sessionId: profile.veriffSessionId,
      };
    }

    // Create new Veriff session
    const adminEmail = profile.adminEmail;
    const adminName = profile.adminName || adminEmail?.split("@")[0] || "Admin";
    if (!adminEmail) throw new HriqError("HRIQ-1405", "Organization admin email is missing");

    const { createVeriffSession } = await import("@repo/integrations/veriff");
    const veriffResponse = await createVeriffSession({
      organizationId: orgId,
      fullName: adminName,
      email: adminEmail,
      documentCountry: profile.country || undefined,
    });

    const veriffSessionId = veriffResponse.verification.id;
    const veriffUrl = veriffResponse.verification.url;

    await database.organizationProfile.update({
      where: { organizationId: orgId },
      data: {
        kycStatus: "created",
        kycProvider: "veriff",
        veriffSessionId,
        kycSessionUrl: veriffUrl,
        kycInitiatedAt: new Date(),
        kycInitiatedBy: session.userId,
        kycRejectionReason: null,
      },
    });

    try {
      await database.auditLog.create({
        data: {
          organizationId: orgId,
          actorType: "user",
          actorUserId: session.userId,
          action: "kyc.self_initiated",
          objectType: "organization",
          objectId: orgId,
        },
      });
    } catch (auditErr) {
      console.error("[HRIQ] Audit log write failed (non-blocking):", auditErr);
    }

    revalidatePath("/[orgSlug]/settings", "page");

    return {
      status: "created" as const,
      sessionUrl: veriffUrl,
      sessionId: veriffSessionId,
    };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[client-kyc.ts:initiateSelfKyc]", _msg);
    return { error: _msg };
  }
}

/**
 * Poll KYC status — used by the gate page to detect when the webhook fires.
 */
export async function checkSelfKycStatus() {
  const session = await requireRole("admin", "super_admin");
  const orgId = session.orgId;
  if (!orgId) return { status: "pending" };

  const profile = await database.organizationProfile.findUnique({
    where: { organizationId: orgId },
    select: { kycStatus: true, kycRejectionReason: true },
  });

  return {
    status: profile?.kycStatus || "pending",
    rejectionReason: profile?.kycRejectionReason || null,
  };
}

/**
 * Fallback: directly query Veriff for the decision and sync to DB.
 * Used when webhook delivery fails or is delayed.
 */
export async function syncVeriffDecision() {
  try {
    const session = await requireRole("admin", "super_admin");
    const orgId = session.orgId;
    if (!orgId) return { status: "pending", synced: false };

    const profile = await database.organizationProfile.findUnique({
      where: { organizationId: orgId },
      select: {
        kycStatus: true,
        veriffSessionId: true,
        organization: { select: { name: true } },
      },
    });

    if (!profile) return { status: "pending", synced: false };
    if (!profile.veriffSessionId) return { status: profile.kycStatus || "pending", synced: false };
    if (profile.kycStatus === "approved") return { status: "approved", synced: false };

    try {
      const { getVeriffDecision, decisionCodeToStatus } = await import("@repo/integrations/veriff");
      const decision = await getVeriffDecision(profile.veriffSessionId);

      if (!decision) return { status: profile.kycStatus || "pending", synced: false };

      const v = decision.verification;
      if (!v || typeof v.code !== "number") return { status: profile.kycStatus || "pending", synced: false };

      const newStatus = decisionCodeToStatus(v.code);
      const verifiedName = [v.person?.firstName, v.person?.lastName].filter(Boolean).join(" ") || null;

      // Update DB
      await database.organizationProfile.update({
        where: { organizationId: orgId },
        data: {
          kycStatus: newStatus,
          veriffDecision: decision as object,
          kycVerifiedName: verifiedName,
          kycDocumentType: v.document?.type || null,
          kycDocumentCountry: v.document?.country || null,
          kycVerifiedAt: newStatus === "approved" ? new Date() : null,
          kycRejectionReason: newStatus !== "approved" ? (v.reason || null) : null,
        },
      });

      // Audit log
      try {
        await database.auditLog.create({
          data: {
            organizationId: orgId,
            actorType: "system",
            action: `kyc.${newStatus}_synced`,
            objectType: "organization",
            objectId: orgId,
            newValue: serialize({
              code: v.code,
              status: newStatus,
              source: "manual_sync",
              verifiedName,
            }),
          },
        });
      } catch (auditErr) {
        console.error("[HRIQ] Audit log write failed (non-blocking):", auditErr);
      }

      console.info(`[KYC Sync] Synced Veriff decision for org ${orgId}: ${newStatus}`);
      revalidatePath("/[orgSlug]/settings", "page");
      revalidatePath("/", "layout");
      return { status: newStatus, synced: true };
    } catch (err) {
      console.error("[KYC Sync] Failed to fetch Veriff decision:", err);
      return { status: profile.kycStatus || "pending", synced: false };
    }

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[client-kyc.ts:syncVeriffDecision]", _msg);
    return { error: _msg };
  }
}
