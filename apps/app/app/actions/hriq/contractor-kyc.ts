"use server";
import { getContractorEmail } from "@/lib/hriq/utils";

import { requireRole } from "@repo/auth/session";
import { database } from "@repo/database";

/**
 * Create a Veriff identity verification session for a contractor and
 * send them the link via email.
 */
export async function sendContractorVeriff(
  employeeId: string,
): Promise<{ sessionId: string; verificationUrl: string } | { error: string }> {
  try {
    const session = await requireRole("super_admin", "admin");

    const employee = await database.employee.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        legalFirstName: true,
        legalLastName: true,
        personalEmail: true,
        workEmail: true,
        country: true,
        location: true,
        organizationId: true,
      },
    });

    if (!employee) return { error: "Contractor not found" };

    const email = getContractorEmail(employee);
    if (!email) return { error: "Contractor has no email address" };

    const fullName = `${employee.legalFirstName} ${employee.legalLastName}`.trim();

    const { createVeriffSession } = await import("@repo/integrations/veriff");
    const veriffResponse = await createVeriffSession({
      organizationId: `contractor:${employee.id}`,  // prefixed so webhook routes to employee, not org
      fullName,
      email,
      documentCountry: employee.country ?? employee.location ?? undefined,
    });

    const veriffSessionId = veriffResponse.verification.id;
    const veriffUrl = veriffResponse.verification.url;
    // Contractors go directly to Veriff — our /verify/ page only supports org profiles
    const contractorVeriffLink = veriffUrl;

    // Store session on the employee record
    await database.employee.update({
      where: { id: employeeId },
      data: {
        veriffSessionId,
        veriffStatus: "created",
        veriffRejectionReason: null,
      },
    });

    // Audit log
    try {
      await database.auditLog.create({
        data: {
          organizationId: employee.organizationId ?? "",
          actorType: "user",
          actorUserId: session.userId,
          action: "contractor.veriff_sent",
          objectType: "employee",
          objectId: employeeId,
          newValue: { sessionId: veriffSessionId, email },
        },
      }).catch(() => {});
    } catch (auditErr) {
      console.error("[HRIQ] Audit log write failed (non-blocking):", auditErr);
    }

    // Send email
    try {
      const { sendViaGmail } = await import("./send-email");
      const { contractorVeriffEmail } = await import("./email-templates");
      const { buildEmail } = await import("./email-template-engine");
      const fallbackHtml = contractorVeriffEmail(employee.legalFirstName, contractorVeriffLink);
      const fallbackSubject = "Verify Your Identity — Remote Leverage";
      const rendered = await buildEmail("kyc_veriff", { name: employee.legalFirstName, verification_url: contractorVeriffLink }, fallbackHtml, fallbackSubject);
      await sendViaGmail(
        email,
        rendered.subject,
        rendered.html,
      );
    } catch (emailErr) {
      console.error("[contractor-kyc] Email failed:", emailErr);
      // Session created — return success even if email fails
    }

    return { sessionId: veriffSessionId, verificationUrl: contractorVeriffLink };
  } catch (err: any) {
    console.error("[contractor-kyc] sendContractorVeriff failed:", err.message);
    return { error: err.message || "Failed to send Veriff link" };
  }
}
