"use server";
import { getContractorEmail } from "@/lib/hriq/utils";

import { database } from "@repo/database";
import { requireRole, requireOrg } from "@repo/auth/session";
import { revalidatePath } from "next/cache";
import { APP_URL, normalizeAppUrl, getSupabaseAdmin, getSignedStorageUrl, sanitizeDecimal } from "./constants";
import { HriqError } from "@/lib/hriq/errors";

/**
 * Get contractor info for the self-service form (no auth required — accessed via secure token).
 * SECURITY: Uses selfServiceToken (random 256-bit hex) instead of employee ID to prevent IDOR.
 */
export async function getContractorForInfoForm(token: string) {
  const employee = await database.employee.findFirst({
    where: { selfServiceToken: token },
    select: {
      id: true,
      legalFirstName: true,
      secondName: true,
      legalLastName: true,
      secondLastName: true,
      preferredName: true,
      personalEmail: true,
      workEmail: true,
      phoneNumber: true,
      mobileNumber: true,
      dateOfBirth: true,
      streetAddress: true,
      city: true,
      stateProvince: true,
      postalCode: true,
      country: true,
      bankName: true,
      bankAccountName: true,
      bankAccountNumber: true,
      bankSwiftCode: true,
      bankRoutingNumber: true,
      debitCardNumber: true,
      bankAddress: true,
      paymentPlatform: true,
      paymentAccountInfo: true,
      preferredPaymentMethod: true,
      compensationType: true,
      hourlyRate: true,
      monthlySalary: true,
      startDate: true,
      emergencyContactName: true,
      emergencyContactPhone: true,
      emergencyContactRelation: true,
      employmentStatus: true,
      infoApprovalStatus: true,
      photoUrl: true,
    },
  });

  if (!employee) return null;

  // Only allow access for employees in onboarding or pre-hire status
  const allowed = ["pre_hire", "onboarding_scheduled", "onboarding_in_progress", "active"];
  if (!allowed.includes(employee.employmentStatus)) return null;

  // Check if a Gov ID document already exists
  const existingGovId = await database.document.findFirst({
    where: { employeeId: employee.id, documentType: "id_document" },
    select: { id: true, documentName: true, status: true },
    orderBy: { createdAt: "desc" },
  });

  return { ...employee, hasGovId: !!existingGovId, govIdDocName: existingGovId?.documentName ?? null };
}

/**
 * Submit contractor information from the self-service form.
 * Updates employee record, creates document records for approval,
 * and marks the Government ID onboarding step.
 */
export async function submitContractorInfo(
  token: string,
  data: {
    // Personal
    preferredName?: string;
    secondName?: string;
    secondLastName?: string;
    dateOfBirth?: string;
    phoneNumber?: string;
    mobileNumber?: string;
    // Compensation
    compensationType?: string;
    hourlyRate?: string;
    monthlySalary?: string;
    // Address
    streetAddress?: string;
    city?: string;
    stateProvince?: string;
    postalCode?: string;
    country?: string;
    // Banking
    bankName?: string;
    bankAccountName?: string;
    bankAccountNumber?: string;
    bankSwiftCode?: string;
    bankRoutingNumber?: string;
    debitCardNumber?: string;
    bankAddress?: string;
    paymentPlatform?: string;
    paymentAccountInfo?: string;
    bankExtraData?: Record<string, string | undefined>;
    // Emergency contact
    emergencyContactName?: string;
    emergencyContactPhone?: string;
    emergencyContactRelation?: string;
  }
) {
  const employee = await database.employee.findFirst({
    where: { selfServiceToken: token },
    select: { id: true, organizationId: true, employmentStatus: true, infoApprovalStatus: true, legalFirstName: true, legalLastName: true },
  });

  if (!employee) throw new HriqError("HRIQ-0201");

  const allowed = ["pre_hire", "onboarding_scheduled", "onboarding_in_progress", "active"];
  if (!allowed.includes(employee.employmentStatus)) throw new HriqError("HRIQ-1901");

  // One-time use: block resubmission if already submitted (pending_review or approved)
  // Allow resubmission only when rejected (admin asked contractor to fix info)
  if (employee.infoApprovalStatus === "pending_review" || employee.infoApprovalStatus === "approved") {
    throw new HriqError("HRIQ-1906", "Your information has already been submitted. Please contact your onboarding coordinator if you need to make changes.");
  }

  // Update employee record with all provided info
  const updateData: Record<string, unknown> = {};
  if (data.preferredName) updateData.preferredName = data.preferredName;
  if (data.secondName !== undefined) updateData.secondName = data.secondName || null;
  if (data.secondLastName !== undefined) updateData.secondLastName = data.secondLastName || null;
  if (data.dateOfBirth) updateData.dateOfBirth = new Date(data.dateOfBirth as any);
  if (data.phoneNumber) updateData.phoneNumber = data.phoneNumber;
  if (data.mobileNumber) updateData.mobileNumber = data.mobileNumber;
  // Compensation — read-only for contractors, set by admin only.
  // Do NOT update compensationType, hourlyRate, or monthlySalary from this form.
  if (data.streetAddress) updateData.streetAddress = data.streetAddress;
  if (data.city) updateData.city = data.city;
  if (data.stateProvince) updateData.stateProvince = data.stateProvince;
  if (data.postalCode) updateData.postalCode = data.postalCode;
  if (data.country) updateData.country = data.country;
  if (data.bankName) updateData.bankName = data.bankName;
  if (data.bankAccountName) updateData.bankAccountName = data.bankAccountName;
  if (data.bankAccountNumber) updateData.bankAccountNumber = data.bankAccountNumber;
  if (data.bankSwiftCode !== undefined) updateData.bankSwiftCode = data.bankSwiftCode || null;
  if (data.bankRoutingNumber !== undefined) updateData.bankRoutingNumber = data.bankRoutingNumber || null;
  if (data.debitCardNumber !== undefined) updateData.debitCardNumber = data.debitCardNumber || null;
  if (data.bankAddress) updateData.bankAddress = data.bankAddress;
  if (data.paymentPlatform) updateData.paymentPlatform = data.paymentPlatform;
  if (data.paymentAccountInfo) updateData.paymentAccountInfo = data.paymentAccountInfo;
  // Save country-specific extra banking fields to JSON column
  if (data.bankExtraData) {
    const cleaned = Object.fromEntries(
      Object.entries(data.bankExtraData).filter(([, v]) => v && v.trim())
    );
    if (Object.keys(cleaned).length > 0) {
      updateData.bankExtraData = cleaned;
    }
  }
  if (data.emergencyContactName) updateData.emergencyContactName = data.emergencyContactName;
  if (data.emergencyContactPhone) updateData.emergencyContactPhone = data.emergencyContactPhone;
  if (data.emergencyContactRelation) updateData.emergencyContactRelation = data.emergencyContactRelation;

  if (Object.keys(updateData).length > 0) {
    await database.employee.update({
      where: { id: employee.id },
      data: {
        ...updateData,
        infoApprovalStatus: "pending_review",
      },
    });
  } else {
    await database.employee.update({
      where: { id: employee.id },
      data: { infoApprovalStatus: "pending_review" },
    });
  }

  // Auto-validate payment method compliance against the admin-set method (if any)
  try {
    const empWithMethod = await database.employee.findUnique({
      where: { id: employee.id },
      select: { preferredPaymentMethod: true, bankName: true, bankAccountName: true, bankAccountNumber: true, bankSwiftCode: true, bankRoutingNumber: true, bankAddress: true, country: true, currency: true },
    });
    const method = empWithMethod?.preferredPaymentMethod as "cadana" | "wise" | null;
    if (method === "cadana" || method === "wise") {
      const { validatePaymentMethod } = await import("@/app/actions/hriq/payment-validation");
      const result = await validatePaymentMethod(method, {
        bankName: empWithMethod!.bankName,
        bankAccountName: empWithMethod!.bankAccountName,
        bankAccountNumber: empWithMethod!.bankAccountNumber,
        bankSwiftCode: empWithMethod!.bankSwiftCode,
        bankRoutingNumber: empWithMethod!.bankRoutingNumber,
        bankAddress: empWithMethod!.bankAddress,
        country: empWithMethod!.country,
        currency: empWithMethod!.currency,
      });
      await database.employee.update({
        where: { id: employee.id },
        data: { paymentMethodVerified: result.valid },
      });
    }
  } catch (err) { console.warn("[contractor-info:submitContractorInfo] Suppressed error:", err); }

  // Create or update document record for admin to review (bank info submission)
  const existingBankDoc = await database.document.findFirst({
    where: { employeeId: employee.id, documentType: "bank_details" },
    orderBy: { createdAt: "desc" },
  });
  if (existingBankDoc) {
    await database.document.update({
      where: { id: existingBankDoc.id },
      data: {
        description: `Updated by ${employee.legalFirstName} ${employee.legalLastName} via contractor info form`,
        status: "pending",
        uploadedByName: `${employee.legalFirstName} ${employee.legalLastName}`,
      },
    });
  } else {
    await database.document.create({
      data: {
        employeeId: employee.id,
        documentType: "bank_details",
        documentName: "Bank & Personal Details (Self-Service Submission)",
        description: `Submitted by ${employee.legalFirstName} ${employee.legalLastName} via contractor info form`,
        status: "pending",
        uploadedByName: `${employee.legalFirstName} ${employee.legalLastName}`,
      },
    });
  }

  // Mark the email_form step as "sent" (submitted by contractor, awaiting admin approval).
  // The step will be completed when the admin approves via approveContractorInfo().
  const infoSessions = await database.onboardingSession.findMany({
    where: { employeeId: employee.id, status: { in: ["not_started", "in_progress"] } },
    include: {
      steps: {
        where: {
          stepType: "email_form",
          status: { not: "completed" },
        },
      },
    },
  });

  // Batch-update all matching email_form steps to "sent" (avoids N+1)
  const stepIds = infoSessions.flatMap((sess) => sess.steps.map((s) => s.id));
  if (stepIds.length > 0) {
    await database.onboardingStep.updateMany({
      where: { id: { in: stepIds } },
      data: {
        status: "sent",
        completedByName: `${employee.legalFirstName} ${employee.legalLastName} (submitted)`,
      },
    });
  }

  const { recomputeSessionProgress } = await import("@/lib/hriq/utils");
  for (const sess of infoSessions) {
    await recomputeSessionProgress(sess.id);
  }

  // Revalidate pages that show contractor info status
  const { revalidatePath } = await import("next/cache");
  revalidatePath("/", "layout");

  return { success: true, pendingApproval: true };
}

/**
 * Upload a government ID from the contractor info form and create a document record.
 */
export async function uploadContractorGovId(formData: FormData): Promise<{ url: string }> {
  const token = formData.get("token") as string;
  const file = formData.get("file") as File;

  if (!token) throw new HriqError("HRIQ-1805");
  if (!file || file.size === 0) throw new HriqError("HRIQ-1801");
  if (file.size > 10 * 1024 * 1024) throw new HriqError("HRIQ-1802");

  const employee = await database.employee.findFirst({
    where: { selfServiceToken: token },
    select: { id: true, organizationId: true, legalFirstName: true, legalLastName: true },
  });
  if (!employee) throw new HriqError("HRIQ-0201");

  // Upload to Supabase storage
  const supabase = getSupabaseAdmin();

  const ext = file.name.split(".").pop() ?? "pdf";
  const timestamp = Date.now();
  const path = `employees/${employee.id}/gov_id_${timestamp}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage
    .from("org-documents")
    .upload(path, buffer, { contentType: file.type, upsert: true });
  if (error) throw new HriqError("HRIQ-1804", `Upload failed: ${error.message}`);

  const signedUrl = await getSignedStorageUrl("org-documents", path);

  // Create or update document record for approval (avoid duplicates on re-upload)
  const existingIdDoc = await database.document.findFirst({
    where: { employeeId: employee.id, documentType: "id_document", description: { contains: "via contractor info form" } },
    orderBy: { createdAt: "desc" },
  });
  if (existingIdDoc) {
    await database.document.update({
      where: { id: existingIdDoc.id },
      data: {
        documentName: `Government ID — ${file.name}`,
        description: `Updated by ${employee.legalFirstName} ${employee.legalLastName} via contractor info form`,
        fileUrl: signedUrl,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        status: "pending",
      },
    });
  } else {
    await database.document.create({
      data: {
        employeeId: employee.id,
        documentType: "id_document",
        documentName: `Government ID — ${file.name}`,
        description: `Uploaded by ${employee.legalFirstName} ${employee.legalLastName} via contractor info form`,
        fileUrl: signedUrl,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        status: "pending",
        uploadedByName: `${employee.legalFirstName} ${employee.legalLastName}`,
      },
    });
  }

  // Mark the Government ID onboarding step as completed
  const sessions = await database.onboardingSession.findMany({
    where: { employeeId: employee.id, status: { in: ["not_started", "in_progress"] } },
    include: {
      steps: { where: { stepType: "document", documentType: "id_document" } },
    },
  });

  // Batch-update all matching document steps to completed (avoids N+1)
  const docStepIds = sessions.flatMap((sess) =>
    sess.steps.filter((s) => s.status !== "completed").map((s) => s.id)
  );
  if (docStepIds.length > 0) {
    await database.onboardingStep.updateMany({
      where: { id: { in: docStepIds } },
      data: {
        status: "completed",
        completedAt: new Date(),
        completedByName: `${employee.legalFirstName} ${employee.legalLastName} (self-service)`,
      },
    });
  }

  const { recomputeSessionProgress } = await import("@/lib/hriq/utils");
  for (const sess of sessions) {
    await recomputeSessionProgress(sess.id);
  }

  return { url: signedUrl };
}

/**
 * Super admin approves contractor info submission.
 * This triggers: account provisioning, onboarding step completion, and credentials email.
 */
export async function approveContractorInfo(employeeId: string) {
  try {
    const session = await requireOrg();
    if (session.orgRole !== "super_admin" && session.orgRole !== "admin") {
      throw new Error("Insufficient permissions");
    }

    const employee = await database.employee.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        infoApprovalStatus: true,
        organizationId: true,
      },
    });
    if (!employee) throw new HriqError("HRIQ-0201");
    // org-scoped admins can only approve contractors in their own org
    if (session.orgRole !== "super_admin" && employee.organizationId !== session.orgId) {
      throw new Error("Insufficient permissions");
    }
    if (employee.infoApprovalStatus === "approved") {
      return { alreadyApproved: true };
    }

    // 1) Mark as approved
    await database.employee.update({
      where: { id: employeeId },
      data: { infoApprovalStatus: "approved" },
    });

    // 2) Complete the Contractor Info Form (email_form) step
    const sessions = await database.onboardingSession.findMany({
      where: { employeeId, status: { in: ["not_started", "in_progress"] } },
      include: {
        steps: {
          where: {
            stepType: "email_form",
            status: { not: "completed" },
          },
        },
      },
    });

    // Batch-update all matching email_form steps to completed (avoids N+1)
    const approveStepIds = sessions.flatMap((sess) => sess.steps.map((s) => s.id));
    if (approveStepIds.length > 0) {
      await database.onboardingStep.updateMany({
        where: { id: { in: approveStepIds } },
        data: {
          status: "completed",
          completedAt: new Date(),
          completedByName: "Admin (info approved)",
        },
      });
    }

    const { recomputeSessionProgress } = await import("@/lib/hriq/utils");
    for (const sess of sessions) {
      await recomputeSessionProgress(sess.id);
    }

    revalidatePath("/[orgSlug]/hiring", "page");
    revalidatePath(`/[orgSlug]/employees/${employeeId}`, "page");

    return { approved: true };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[contractor-info.ts:approveContractorInfo]", _msg);
    return { error: _msg };
  }
}

/**
 * Super admin rejects contractor info — contractor must resubmit.
 */
export async function rejectContractorInfo(employeeId: string, reason?: string) {
  try {
    const session = await requireOrg();
    if (session.orgRole !== "super_admin" && session.orgRole !== "admin") {
      throw new Error("Insufficient permissions");
    }

    const employee = await database.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, legalFirstName: true, personalEmail: true, workEmail: true, preferredName: true, selfServiceToken: true, organizationId: true },
    });
    if (!employee) throw new HriqError("HRIQ-0201");
    if (session.orgRole !== "super_admin" && employee.organizationId !== session.orgId) {
      throw new Error("Insufficient permissions");
    }
    if (!employee) throw new HriqError("HRIQ-0201");

    await database.employee.update({
      where: { id: employeeId },
      data: { infoApprovalStatus: "rejected" },
    });

    // Notify contractor via email
    const email = getContractorEmail(employee);
    if (email && employee.selfServiceToken) {
      try {
        const { sendViaGmail } = await import("./send-email");
        const { layout, heading, greeting, paragraph, primaryButton } = await import("./email-templates");
        const appUrl = normalizeAppUrl(APP_URL);
        const name = employee.preferredName ?? employee.legalFirstName;
        const reasonHtml = reason ? `<br/><br/><strong>Reason:</strong> ${reason}` : "";
        const html = layout(
          heading("Information Update Required") +
          greeting(name) +
          paragraph(`Your submitted information needs to be updated before we can finalize your onboarding.${reasonHtml}`) +
          primaryButton("Update Your Information ", `${appUrl}/contractor-info/${employee.selfServiceToken}`)
        );
        try {
          await sendViaGmail(email, "Action Required — Please Update Your Information", html);
        } catch (emailErr) {
          console.error("[HRIQ] Email send failed (non-blocking):", emailErr);
        }
      } catch (err) {
        console.error("[HRIQ-1703] rejectContractorInfo — email failed:", err);
      }
    }

    revalidatePath("/[orgSlug]/hiring", "page");
    revalidatePath(`/[orgSlug]/employees/${employeeId}`, "page");

    return { rejected: true };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[contractor-info.ts:rejectContractorInfo]", _msg);
    return { error: _msg };
  }
}

/**
 * Send the contractor info form link to the contractor.
 * Auto-generates a selfServiceToken if one doesn't exist yet.
 */
export async function sendContractorInfoLink(
  employeeId: string
): Promise<{ success: boolean; message: string }> {
  const session = await requireRole("super_admin", "admin");

  const employee = await database.employee.findFirst({
    where: session.orgRole === "super_admin" ? { id: employeeId } : { id: employeeId, organizationId: session.orgId },
    select: {
      id: true,
      legalFirstName: true,
      legalLastName: true,
      preferredName: true,
      personalEmail: true,
      workEmail: true,
      selfServiceToken: true,
    },
  });

  if (!employee) return { success: false, message: "Employee not found." };

  const email = getContractorEmail(employee);
  if (!email) return { success: false, message: "No email address on file for this contractor." };

  // Generate token if missing
  let token = employee.selfServiceToken;
  if (!token) {
    token = crypto.randomUUID();
    await database.employee.update({
      where: { id: employeeId },
      data: { selfServiceToken: token },
    });
  }

  try {
    const { sendViaGmail } = await import("./send-email");
    const { layout, heading, greeting, paragraph, primaryButton } = await import("./email-templates");
    const appUrl = normalizeAppUrl(APP_URL);
    const name = employee.preferredName ?? employee.legalFirstName;

    const html = layout(
      heading("We Need a Bit More Info") +
      greeting(name) +
      paragraph("We just need a few more details from you to keep things moving. It only takes a couple of minutes — please click the link below to fill in your information.") +
      primaryButton("Complete Your Information", `${appUrl}/contractor-info/${token}`)
    );

    try {
      await sendViaGmail(email, "Quick Request — Please Complete Your Information", html);
    } catch (emailErr) {
      console.error("[HRIQ] Email send failed (non-blocking):", emailErr);
    }
  } catch (err) {
    console.error("[HRIQ-1703] sendContractorInfoLink — email failed:", err);
    return { success: false, message: "Failed to send email. Please try again." };
  }

  try {
    await database.auditLog.create({
      data: {
        organizationId: session.orgId,
        actorType: "user",
        actorUserId: session.userId,
        action: "employee.contractor_info_link_sent",
        objectType: "employee",
        objectId: employeeId,
        newValue: { recipientEmail: email },
      },
    });
  } catch (auditErr) {
    console.error("[HRIQ] Audit log write failed (non-blocking):", auditErr);
  }

  revalidatePath(`/[orgSlug]/employees/${employeeId}`, "page");

  const contractorName = `${employee.legalFirstName} ${employee.legalLastName}`;
  return { success: true, message: `Info form link sent to ${contractorName} at ${email}.` };
}
