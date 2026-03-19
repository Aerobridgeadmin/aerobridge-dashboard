"use server";
import { getContractorEmail } from "@/lib/hriq/utils";

import { revalidatePath } from "next/cache";

import { database } from "@repo/database";
import { APP_URL, normalizeAppUrl } from "./constants";

/**
 * Admin action: require a contractor to complete Wise payment setup on next login.
 * Sets a flag on the employee record that the authenticated layout gate checks.
 * When the contractor next logs in, they'll be redirected to the payment gate
 * and must complete Wise setup before accessing the dashboard.
 */
export async function setWiseGateRequired(
  employeeId: string,
  required: boolean = true
): Promise<{ success: true } | { error: string }> {
  const { requireOrg } = await import("@repo/auth/session");
  const session = await requireOrg();

  if (!["super_admin", "admin"].includes(session.orgRole)) {
    return { error: "Only admins can manage Wise login gates" };
  }

  const employee = await database.employee.findFirst({
    where: { id: employeeId },
    select: { id: true, legalFirstName: true, legalLastName: true, organizationId: true },
  });
  if (!employee) return { error: "Employee not found" };

  await database.employee.update({
    where: { id: employeeId },
    data: { wiseGateRequired: required },
  });

  // Audit log
  try {
    await database.auditLog.create({
      data: {
        organizationId: employee.organizationId ?? undefined,
        actorType: "user",
        actorUserId: session.userId,
        action: required ? "admin.wise_gate_enabled" : "admin.wise_gate_disabled",
        objectType: "employee",
        objectId: employeeId,
        newValue: { wiseGateRequired: required },
        reason: required
          ? `Admin required ${employee.legalFirstName} ${employee.legalLastName} to set up Wise on next login`
          : `Admin removed Wise setup requirement for ${employee.legalFirstName} ${employee.legalLastName}`,
      },
    }).catch(() => {});
  } catch (err) { console.warn("[wise-setup:setWiseGateRequired] Suppressed error:", err); }

  revalidatePath("/[orgSlug]/employees/[id]", "page");
  return { success: true };
}

/**
 * Contractor self-service: save banking information for Wise international payouts.
 * Stores the details on the employee record and marks the onboarding step complete.
 */
export async function saveContractorWiseInfo(data: {
  currency: string;
  accountHolderName: string;
  bankName: string;
  accountNumber: string;
  routingNumber?: string;
  swiftCode?: string;
  country: string;
  wiseTag?: string;
  address?: {
    streetAddress?: string;
    city?: string;
    state?: string;
    postalCode?: string;
  };
  extraData?: {
    accountType?: string;
    rut?: string;
    idType?: string;
    idNumber?: string;
    phoneNumber?: string;
    bankCode?: string;
  };
}): Promise<{ ok: true } | { error: string }> {
  const { requireSession } = await import("@repo/auth/session");
  const session = await requireSession();

  // Find the employee linked to the current user — scoped to active org if available
  const employee = await database.employee.findFirst({
    where: {
      linkedUserId: session.userId,
      ...(session.orgId ? { organizationId: session.orgId } : {}),
    },
    select: {
      id: true,
      organizationId: true,
      wiseRecipientId: true,
    },
  });

  if (!employee) return { error: "No linked employee record found" };

  // Wise tag mode — just save the @username
  const isWiseTag = Boolean(data.wiseTag?.trim());
  if (isWiseTag) {
    const tag = data.wiseTag!.trim();
    if (!tag.startsWith("@")) return { error: "Wise tag must start with @" };

    await database.employee.update({
      where: { id: employee.id },
      data: {
        bankName: "Wise",
        bankAccountNumber: tag,
        bankAccountName: data.accountHolderName?.trim() || tag,
        wiseRecipientCurrency: data.currency?.trim() || "USD",
        wiseRecipientType: "wise_tag",
        wiseRecipientSyncedAt: new Date(),
        wiseRecipientId: employee.wiseRecipientId ?? -1,
        wiseGateRequired: false,
        preferredPaymentMethod: "wise",
      },
    });

    revalidatePath("/", "layout");
    return { ok: true };
  }

  // Bank account mode — validate required fields
  if (!data.currency?.trim()) return { error: "Currency is required" };
  if (!data.accountHolderName?.trim()) return { error: "Account holder name is required" };
  if (!data.bankName?.trim()) return { error: "Bank name is required" };
  if (!data.accountNumber?.trim()) return { error: "Account number is required" };
  if (!data.country?.trim()) return { error: "Country is required" };

  try {
    // Update employee with Wise payout information
    // We store banking details in the existing fields and mark Wise as set up
    await database.employee.update({
      where: { id: employee.id },
      data: {
        bankName: data.bankName.trim(),
        bankAccountNumber: data.accountNumber.trim(),
        bankAccountName: data.accountHolderName.trim(),
        bankSwiftCode: data.swiftCode?.trim() || null,
        bankRoutingNumber: data.routingNumber?.trim() || null,
        wiseRecipientCurrency: data.currency.trim(),
        wiseRecipientType: "bank_account",
        wiseRecipientSyncedAt: new Date(),
        // Use a placeholder ID (actual Wise recipient will be created on first transfer)
        wiseRecipientId: employee.wiseRecipientId ?? -1,
        // Clear the Wise login gate flag now that setup is complete
        wiseGateRequired: false,
        // Store country if not already set
        country: data.country.trim(),
        // Save address fields for Wise recipient creation
        ...(data.address?.streetAddress ? { streetAddress: data.address.streetAddress.trim() } : {}),
        ...(data.address?.city ? { city: data.address.city.trim() } : {}),
        ...(data.address?.state ? { stateProvince: data.address.state.trim() } : {}),
        ...(data.address?.postalCode ? { postalCode: data.address.postalCode.trim() } : {}),
        // Store country-specific extra fields (RUT, accountType, national ID, etc.)
        ...(data.extraData && Object.keys(data.extraData).length > 0
          ? { bankExtraData: data.extraData }
          : {}),
      },
    });

    // Auto-complete the Wise payment onboarding step if one exists
    const wiseStep = await database.onboardingStep.findFirst({
      where: {
        session: { employeeId: employee.id, status: { not: "cancelled" } },
        stepType: "payment_setup",
        stepName: { contains: "Wise" },
        status: { not: "completed" },
      },
      select: { id: true },
    });

    if (wiseStep) {
      await database.onboardingStep.update({
        where: { id: wiseStep.id },
        data: { status: "completed", completedAt: new Date() },
      }).catch(() => {});
    }

    // Audit log
    try {
      await database.auditLog.create({
        data: {
          organizationId: employee.organizationId ?? undefined,
          actorType: "user",
          actorUserId: session.userId,
          action: "contractor.wise_setup_completed",
          objectType: "employee",
          objectId: employee.id,
          newValue: {
            currency: data.currency,
            bankName: data.bankName,
            country: data.country,
          },
        },
      }).catch(() => {});
    } catch (auditErr) {
      console.error("[HRIQ] Audit log write failed (non-blocking):", auditErr);
    }

    revalidatePath("/contractor-payment-gate");
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    console.error("[Wise Setup] saveContractorWiseInfo failed:", err);
    return { error: err instanceof Error ? err.message : "Failed to save payment details" };
  }
}

// ─── Token-Based Wise Setup (no auth — link sent via email) ──────────────────

/**
 * Fetch contractor data for the standalone Wise setup form (accessed via secure token).
 * No authentication required — uses selfServiceToken for IDOR protection.
 */
export async function getEmployeeForWiseSetup(token: string) {
  const employee = await database.employee.findFirst({
    where: { selfServiceToken: token },
    select: {
      id: true,
      legalFirstName: true,
      legalLastName: true,
      country: true,
      currency: true,
      bankName: true,
      bankAccountName: true,
      bankAccountNumber: true,
      bankSwiftCode: true,
      bankRoutingNumber: true,
      streetAddress: true,
      city: true,
      stateProvince: true,
      postalCode: true,
      wiseRecipientId: true,
      wiseRecipientCurrency: true,
      employmentStatus: true,
    },
  });

  if (!employee) return null;
  const allowed = ["pre_hire", "onboarding_scheduled", "onboarding_in_progress", "active"];
  if (!allowed.includes(employee.employmentStatus)) return null;
  return employee;
}

/**
 * Save Wise payment details from the standalone token-based form.
 * No session required — validates via selfServiceToken.
 */
export async function submitWiseSetup(
  token: string,
  data: {
    currency: string;
    accountHolderName: string;
    bankName: string;
    accountNumber: string;
    routingNumber?: string;
    swiftCode?: string;
    country: string;
    address?: {
      streetAddress?: string;
      city?: string;
      state?: string;
      postalCode?: string;
    };
    extraData?: {
      accountType?: string;
      rut?: string;
      idType?: string;
      idNumber?: string;
      phoneNumber?: string;
      bankCode?: string;
    };
  }
): Promise<{ ok: true } | { error: string }> {
  const employee = await database.employee.findFirst({
    where: { selfServiceToken: token },
    select: { id: true, organizationId: true, wiseRecipientId: true },
  });

  if (!employee) return { error: "Invalid or expired link" };

  if (!data.currency?.trim()) return { error: "Currency is required" };
  if (!data.accountHolderName?.trim()) return { error: "Account holder name is required" };
  if (!data.bankName?.trim()) return { error: "Bank name is required" };
  if (!data.accountNumber?.trim()) return { error: "Account number is required" };
  if (!data.country?.trim()) return { error: "Country is required" };

  try {
    await database.employee.update({
      where: { id: employee.id },
      data: {
        bankName: data.bankName.trim(),
        bankAccountNumber: data.accountNumber.trim(),
        bankAccountName: data.accountHolderName.trim(),
        bankSwiftCode: data.swiftCode?.trim() || null,
        bankRoutingNumber: data.routingNumber?.trim() || null,
        wiseRecipientCurrency: data.currency.trim(),
        wiseRecipientType: "bank_account",
        wiseRecipientSyncedAt: new Date(),
        wiseRecipientId: employee.wiseRecipientId ?? -1,
        wiseGateRequired: false,
        preferredPaymentMethod: "wise",
        country: data.country.trim(),
        ...(data.address?.streetAddress ? { streetAddress: data.address.streetAddress.trim() } : {}),
        ...(data.address?.city ? { city: data.address.city.trim() } : {}),
        ...(data.address?.state ? { stateProvince: data.address.state.trim() } : {}),
        ...(data.address?.postalCode ? { postalCode: data.address.postalCode.trim() } : {}),
        ...(data.extraData && Object.keys(data.extraData).length > 0
          ? { bankExtraData: data.extraData }
          : {}),
      },
    });

    // Run actual payment validation
    try {
      const { validatePaymentMethod } = await import("@/app/actions/hriq/payment-validation");
      const result = await validatePaymentMethod("wise", {
        bankName: data.bankName.trim(),
        bankAccountName: data.accountHolderName.trim(),
        bankAccountNumber: data.accountNumber.trim(),
        bankSwiftCode: data.swiftCode?.trim() || null,
        bankRoutingNumber: data.routingNumber?.trim() || null,
        bankAddress: null,
        country: data.country.trim(),
        currency: data.currency.trim(),
      });
      await database.employee.update({
        where: { id: employee.id },
        data: { paymentMethodVerified: result.valid },
      });
    } catch (err) { console.warn("[wise-setup:submitWiseSetup] Suppressed error:", err); }

    try {
      await database.auditLog.create({
        data: {
          organizationId: employee.organizationId ?? undefined,
          actorType: "system",
          action: "contractor.wise_setup_via_link",
          objectType: "employee",
          objectId: employee.id,
          newValue: { currency: data.currency, bankName: data.bankName, country: data.country },
        },
      }).catch(() => {});
    } catch (err) { console.warn("[wise-setup:submitWiseSetup] Suppressed error:", err); }

    return { ok: true };
  } catch (err) {
    console.error("[Wise Setup] submitWiseSetup failed:", err);
    return { error: err instanceof Error ? err.message : "Failed to save payment details" };
  }
}

/**
 * Admin action: send the contractor a Wise setup link via email.
 * Auto-generates a selfServiceToken if one doesn't exist yet.
 */
export async function sendWiseSetupLink(
  employeeId: string
): Promise<{ success: boolean; message: string }> {
  const { requireRole } = await import("@repo/auth/session");
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
      heading("Set Up Your Payment Details") +
      greeting(name) +
      paragraph("To ensure you get paid on time, we need your banking information for international transfers via Wise. It only takes a couple of minutes — please click the link below to set up your payment details.") +
      primaryButton("Set Up Wise Payment", `${appUrl}/wise-setup/${token}`)
    );

    try {
      await sendViaGmail(email, "Action Required — Set Up Your Payment Details", html);
    } catch (emailErr) {
      console.error("[HRIQ] Email send failed (non-blocking):", emailErr);
    }
  } catch (err) {
    console.error("[Wise Setup] sendWiseSetupLink — email failed:", err);
    return { success: false, message: "Failed to send email. Please try again." };
  }

  try {
    await database.auditLog.create({
      data: {
        organizationId: session.orgId,
        actorType: "user",
        actorUserId: session.userId,
        action: "employee.wise_setup_link_sent",
        objectType: "employee",
        objectId: employeeId,
        newValue: { recipientEmail: email },
      },
    });
  } catch (err) { console.warn("[wise-setup:sendWiseSetupLink] Suppressed error:", err); }

  revalidatePath(`/[orgSlug]/employees/${employeeId}`, "page");

  const contractorName = `${employee.legalFirstName} ${employee.legalLastName}`;
  return { success: true, message: `Wise setup link sent to ${contractorName} at ${email}.` };
}
