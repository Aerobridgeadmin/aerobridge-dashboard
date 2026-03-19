import { database } from "@repo/database";
import { NextResponse } from "next/server";
import { serialize } from "@/lib/hriq/serialize";

/**
 * Veriff Webhook Handler
 *
 * Receives two types of notifications:
 * 1. Events (code 7001=started, 7002=submitted) — status updates
 * 2. Decisions (code 9001=approved, 9102-9104=declined, 9121=resubmission) — final verdict
 *
 * Webhook URL: https://hriq.remoteleverage.com/api/webhooks/veriff
 * Signature: X-HMAC-SIGNATURE header (HMAC SHA-256 of body with VERIFF_API_SECRET)
 */

export async function POST(request: Request) {
 try {
 const body = await request.text();
 const signature = request.headers.get("x-hmac-signature") || request.headers.get("X-HMAC-SIGNATURE") || "";

 // Verify webhook signature — REQUIRED in production
 const veriffSecret = process.env.VERIFF_API_SECRET;
 if (!veriffSecret) {
 if (process.env.NODE_ENV === "production") {
 console.error("[Veriff Webhook] VERIFF_API_SECRET not configured — rejecting request");
 return NextResponse.json({ error: "Not configured"}, { status: 500 });
 }
 console.warn("[Veriff Webhook] VERIFF_API_SECRET not set — skipping signature check (dev only)");
 } else {
 const { verifyWebhookSignature } = await import("@repo/integrations/veriff");
 const valid = await verifyWebhookSignature(body, signature);
 if (!valid) {
 console.error("[Veriff Webhook] Invalid signature");
 return NextResponse.json({ error: "Invalid signature"}, { status: 401 });
 }
 }

 const payload = JSON.parse(body);
 const code = payload.code || payload.verification?.code;
 const action = payload.action;
 const vendorData = payload.vendorData || payload.verification?.vendorData;
 const verificationId = payload.id || payload.verification?.id;

 console.info(`[Veriff Webhook] action=${action} code=${code} vendorData=${vendorData} verificationId=${verificationId}`);

 if (!vendorData) {
 console.error("[Veriff Webhook] No vendorData (organizationId) in payload");
 return NextResponse.json({ error: "Missing vendorData"}, { status: 400 });
 }

 // ─── Route: contractor vs org ─────────────────────────────────────────
 // Contractor sessions use vendorData = "contractor:{employeeId}"
 if (vendorData.startsWith("contractor:")) {
   const employeeId = vendorData.replace("contractor:", "");
   return handleContractorWebhook({ employeeId, verificationId, action, code, payload });
 }

 // Look up org profile by vendorData (organizationId) or veriff session ID
 const profile = await database.organizationProfile.findFirst({
 where: {
 OR: [
 { organizationId: vendorData },
 { veriffSessionId: verificationId },
 ],
 },
 select: {
 organizationId: true,
 kycStatus: true,
 veriffSessionId: true,
 adminEmail: true,
 adminName: true,
 organization: { select: { name: true } },
 },
 });

 if (!profile) {
 console.error(`[Veriff Webhook] No org profile found for vendorData=${vendorData}`);
 return NextResponse.json({ ok: true }); // 200 to prevent retries
 }

 // Guard: ensure the org still exists (profile could be orphaned if org was deleted)
 if (!profile.organization) {
 console.error(`[Veriff Webhook] Profile found but org is missing (orphan) for vendorData=${vendorData}`);
 return NextResponse.json({ ok: true });
 }

 const orgId = profile.organizationId;
 const orgName = profile.organization.name;

 // ─── Handle Events (status transitions) ────────────────────────────

 if (action === "event") {
 const { eventCodeToStatus } = await import("@repo/integrations/veriff");
 const newStatus = eventCodeToStatus(code);

 if (newStatus && profile.kycStatus !== "approved") {
 await database.organizationProfile.update({
 where: { organizationId: orgId },
 data: { kycStatus: newStatus },
 });

 console.info(`[Veriff Webhook] Updated org ${orgId} KYC status to: ${newStatus}`);
 }

 return NextResponse.json({ ok: true });
 }

 // ─── Handle Decisions (final verdict) ──────────────────────────────

 if (action !== "decision") {
 console.warn(`[Veriff Webhook] Unrecognized action: ${action} — ignoring`);
 return NextResponse.json({ ok: true });
 }

 const { decisionCodeToStatus, decisionCodeToReason } = await import("@repo/integrations/veriff");
 const decisionStatus = decisionCodeToStatus(code);
 const decisionReason = decisionCodeToReason(code);

 const person = payload.verification?.person || {};
 const document = payload.verification?.document || {};

 const verifiedName = [person.firstName, person.lastName].filter(Boolean).join(" ") || null;

 // Update org profile
 await database.organizationProfile.update({
 where: { organizationId: orgId },
 data: {
 kycStatus: decisionStatus,
 veriffDecision: payload as object,
 kycVerifiedName: verifiedName,
 kycDocumentType: document.type || null,
 kycDocumentCountry: document.country || null,
 kycRejectionReason: decisionStatus !== "approved"? decisionReason : null,
 kycVerifiedAt: decisionStatus === "approved"? new Date() : null,
 },
 });

 // On approval: activate the admin's user account and mark org as active
 if (decisionStatus === "approved"&& profile.adminEmail) {
 try {
 // Activate admin user
 await database.appUser.updateMany({
 where: { email: { equals: profile.adminEmail, mode: "insensitive"} },
 data: { isActive: true },
 });

 console.info(`[Veriff Webhook] Activated admin user ${profile.adminEmail} for org ${orgId}`);
 } catch (activationErr) {
 console.error("[Veriff Webhook] Failed to activate admin user:", activationErr);
 }
 }

 // Audit log
 await database.auditLog.create({
 data: {
 organizationId: orgId,
 actorType: "system",
 action: `kyc.${decisionStatus}`,
 objectType: "organization",
 objectId: orgId,
 newValue: serialize({
 code,
 status: decisionStatus,
 reason: decisionReason,
 verifiedName,
 documentType: document.type,
 documentCountry: document.country,
 }),
 },
 });

 console.info(`[Veriff Webhook] Decision for org ${orgId} (${orgName}): ${decisionStatus} — ${decisionReason}`);

 // ─── Send notification emails ────────────────────────────────────

 try {
 if (decisionStatus === "approved") {
 // Notify RL admin that client org is verified
 const { sendViaGmailSystem } = await import("@/app/actions/hriq/send-email");
 const { kycApprovedAdminNotification } = await import("@/app/actions/hriq/email-templates");
 await sendViaGmailSystem(
 "recruiters@remoteleverage.com",
 `KYC Approved: ${orgName}`,
 kycApprovedAdminNotification(orgName, verifiedName || "Unknown", document.type, document.country),
 );

 // Notify the client admin
 if (profile.adminEmail) {
 const { kycApprovedClientEmail } = await import("@/app/actions/hriq/email-templates");
 await sendViaGmailSystem(
 profile.adminEmail,
 `Identity Verified — Welcome to Remote Leverage`,
 kycApprovedClientEmail(profile.adminName || "there", orgName),
 );
 }
 } else if (decisionStatus === "declined"|| decisionStatus === "resubmission_requested") {
 // Notify RL admin
 const { sendViaGmailSystem } = await import("@/app/actions/hriq/send-email");
 const { kycDeclinedAdminNotification } = await import("@/app/actions/hriq/email-templates");
 await sendViaGmailSystem(
 "recruiters@remoteleverage.com",
 `KYC ${decisionStatus === "declined"? "Declined": "Resubmission Needed"}: ${orgName}`,
 kycDeclinedAdminNotification(orgName, decisionStatus, decisionReason),
 );

 // Notify the client admin if resubmission requested
 if (decisionStatus === "resubmission_requested"&& profile.adminEmail) {
 const { kycResubmissionClientEmail } = await import("@/app/actions/hriq/email-templates");
 await sendViaGmailSystem(
 profile.adminEmail,
 `Action Needed: Identity Verification — ${orgName}`,
 kycResubmissionClientEmail(profile.adminName || "there", orgName, decisionReason),
 );
 }
 }
 } catch (emailErr) {
 console.error("[Veriff Webhook] Failed to send notification email:", emailErr);
 }

 return NextResponse.json({ ok: true });
 } catch (err) {
 console.error("[Veriff Webhook] Unhandled error:", err);
 return NextResponse.json({ error: "Internal server error"}, { status: 500 });
 }
}

// Veriff may also send GET for health checks
export async function GET() {
 return NextResponse.json({ status: "ok", handler: "veriff-webhook"});
}

// ─── Contractor Webhook Handler ───────────────────────────────────────────────

async function handleContractorWebhook({
  employeeId,
  verificationId,
  action,
  code,
  payload,
}: {
  employeeId: string;
  verificationId: string;
  action: string;
  code: number;
  payload: Record<string, unknown>;
}) {
  const employee = await database.employee.findFirst({
    where: {
      OR: [
        { id: employeeId },
        { veriffSessionId: verificationId },
      ],
    },
    select: {
      id: true,
      legalFirstName: true,
      legalLastName: true,
      personalEmail: true,
      workEmail: true,
      organizationId: true,
      veriffStatus: true,
    },
  });

  if (!employee) {
    console.error(`[Veriff Webhook] No employee found for id=${employeeId} sessionId=${verificationId}`);
    return NextResponse.json({ ok: true });
  }

  // ─── Events ──────────────────────────────────────────────────────────
  if (action === "event") {
    const { eventCodeToStatus } = await import("@repo/integrations/veriff");
    const newStatus = eventCodeToStatus(code);
    if (newStatus && employee.veriffStatus !== "approved") {
      await database.employee.update({
        where: { id: employee.id },
        data: { veriffStatus: newStatus },
      });
      console.info(`[Veriff Webhook] Contractor ${employee.id} Veriff status → ${newStatus}`);
    }
    return NextResponse.json({ ok: true });
  }

  if (action !== "decision") {
    return NextResponse.json({ ok: true });
  }

  // ─── Decision ────────────────────────────────────────────────────────
  const { decisionCodeToStatus, decisionCodeToReason } = await import("@repo/integrations/veriff");
  const decisionStatus = decisionCodeToStatus(code);
  const decisionReason = decisionCodeToReason(code);

  const person = (payload as any).verification?.person || {};
  const document = (payload as any).verification?.document || {};
  const verifiedName = [person.firstName, person.lastName].filter(Boolean).join(" ") || null;

  await database.employee.update({
    where: { id: employee.id },
    data: {
      veriffStatus: decisionStatus,
      veriffDecision: payload as object,
      veriffVerifiedName: verifiedName,
      veriffDocumentType: document.type || null,
      veriffDocumentCountry: document.country || null,
      veriffRejectionReason: decisionStatus !== "approved" ? decisionReason : null,
      veriffVerifiedAt: decisionStatus === "approved" ? new Date() : null,
    },
  });

  // Audit log
  await database.auditLog.create({
    data: {
      organizationId: employee.organizationId ?? "",
      actorType: "system",
      action: `contractor.veriff.${decisionStatus}`,
      objectType: "employee",
      objectId: employee.id,
      newValue: serialize({
        code,
        status: decisionStatus,
        reason: decisionReason,
        verifiedName,
        documentType: document.type,
        documentCountry: document.country,
      }),
    },
  }).catch(() => {});

  console.info(`[Veriff Webhook] Contractor ${employee.id} decision: ${decisionStatus}`);

  // Notify RL team on approval
  if (decisionStatus === "approved") {
    try {
      const { sendViaGmailSystem } = await import("@/app/actions/hriq/send-email");
      const fullName = `${employee.legalFirstName} ${employee.legalLastName}`.trim();
      await sendViaGmailSystem(
        "recruiters@remoteleverage.com",
        `Contractor KYC Approved: ${fullName}`,
        `<p>Contractor <strong>${fullName}</strong> has completed Veriff identity verification.</p><p>Verified name: ${verifiedName || "N/A"}<br>Document: ${document.type || "N/A"} (${document.country || "N/A"})</p>`,
      );
    } catch (e) {
      console.error("[Veriff Webhook] Failed to send contractor approval email:", e);
    }
  }

  return NextResponse.json({ ok: true });
}
