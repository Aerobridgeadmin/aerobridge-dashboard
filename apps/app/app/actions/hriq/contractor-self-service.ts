"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@repo/auth/session";
import { database } from "@repo/database";
import { HriqError } from "@/lib/hriq/errors";

/**
 * Get the current contractor's full profile.
 */
export async function getMyProfile() {
  const session = await requireSession();

  // Primary lookup: by linked user ID
  const profileSelect = {
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
      monthlySalary: true,
      bankExtraData: true,
      paymentMethodVerified: true,
      emergencyContactName: true,
      emergencyContactPhone: true,
      emergencyContactRelation: true,
      photoUrl: true,
      jobTitle: true,
      department: true,
      employmentType: true,
      employmentStatus: true,
      hourlyRate: true,
      currency: true,
      timezone: true,
      startDate: true,
      employeeNumber: true,
      dailyHoursTarget: true,
  } as const;

  let employee = await database.employee.findFirst({
    where: { linkedUserId: session.userId, ...(session.orgId ? { organizationId: session.orgId } : {}) },
    select: profileSelect,
  });

  // Fallback: if no match by linked user ID, try matching by email
  // This handles cases where a user logs in with a different auth provider (e.g. personal Gmail vs work SSO)
  if (!employee && session.email) {
    employee = await database.employee.findFirst({
      where: {
        OR: [
          { personalEmail: { equals: session.email, mode: "insensitive" } },
          { workEmail: { equals: session.email, mode: "insensitive" } },
        ],
        ...(session.orgId ? { organizationId: session.orgId } : {}),
      },
      select: profileSelect,
    });

    // Auto-link this auth user to the employee for future lookups
    // Only if the employee doesn't already have a different linked user
    if (employee) {
      const currentEmployee = await database.employee.findUnique({
        where: { id: employee.id },
        select: { linkedUserId: true },
      });
      if (!currentEmployee?.linkedUserId) {
        try {
          await database.employee.update({
            where: { id: employee.id },
            data: { linkedUserId: session.userId },
          });
          console.log(`[getMyProfile] Auto-linked user ${session.userId} (${session.email}) to employee ${employee.id}`);
        } catch (e) {
          console.warn(`[getMyProfile] Could not auto-link:`, e);
        }
      }
    }
  }

  if (!employee) throw new HriqError("HRIQ-2501");
  return employee;
}

/**
 * Update the current contractor's editable profile fields.
 */
export async function updateMyProfile(data: {
  preferredName?: string;
  secondName?: string;
  secondLastName?: string;
  phoneNumber?: string;
  mobileNumber?: string;
  dateOfBirth?: string;
  streetAddress?: string;
  city?: string;
  stateProvince?: string;
  postalCode?: string;
  country?: string;
  timezone?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelation?: string;
  bankName?: string;
  bankAccountName?: string;
  bankAccountNumber?: string;
  bankSwiftCode?: string;
  bankRoutingNumber?: string;
  debitCardNumber?: string;
  bankAddress?: string;
  paymentPlatform?: string;
  paymentAccountInfo?: string;
  bankExtraData?: Record<string, string>;
  // Super admin only fields
  legalFirstName?: string;
  legalLastName?: string;
  personalEmail?: string;
  jobTitle?: string;
  department?: string;
  startDate?: string;
  hourlyRate?: string;
  currency?: string;
  employeeNumber?: string;
  employmentStatus?: string;
  employmentType?: string;
}) {
  const session = await requireSession();
  const isSuper = session.orgRole === "super_admin";

  const employee = await database.employee.findFirst({
    where: { linkedUserId: session.userId, ...(session.orgId ? { organizationId: session.orgId } : {}) },
    select: { id: true },
  });

  // Email fallback (same as getMyProfile)
  const emp = employee ?? (session.email ? await database.employee.findFirst({
    where: {
      OR: [
        { personalEmail: { equals: session.email, mode: "insensitive" } },
        { workEmail: { equals: session.email, mode: "insensitive" } },
      ],
      ...(session.orgId ? { organizationId: session.orgId } : {}),
    },
    select: { id: true },
  }) : null);

  if (!emp) throw new HriqError("HRIQ-2501");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: Record<string, any> = {
    preferredName: data.preferredName || undefined,
    secondName: data.secondName !== undefined ? (data.secondName || null) : undefined,
    secondLastName: data.secondLastName !== undefined ? (data.secondLastName || null) : undefined,
    phoneNumber: data.phoneNumber || undefined,
    mobileNumber: data.mobileNumber || undefined,
    dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth as any) : undefined,
    streetAddress: data.streetAddress || undefined,
    city: data.city || undefined,
    stateProvince: data.stateProvince || undefined,
    postalCode: data.postalCode || undefined,
    country: data.country || undefined,
    timezone: data.timezone || undefined,
    emergencyContactName: data.emergencyContactName || undefined,
    emergencyContactPhone: data.emergencyContactPhone || undefined,
    emergencyContactRelation: data.emergencyContactRelation || undefined,
    bankName: data.bankName || undefined,
    bankAccountName: data.bankAccountName || undefined,
    bankAccountNumber: data.bankAccountNumber || undefined,
    bankSwiftCode: data.bankSwiftCode || undefined,
    bankRoutingNumber: data.bankRoutingNumber !== undefined ? (data.bankRoutingNumber || null) : undefined,
    debitCardNumber: data.debitCardNumber !== undefined ? (data.debitCardNumber || null) : undefined,
    bankAddress: data.bankAddress || undefined,
    paymentPlatform: data.paymentPlatform || undefined,
    paymentAccountInfo: data.paymentAccountInfo || undefined,
    ...(data.bankExtraData && Object.keys(data.bankExtraData).length > 0 ? { bankExtraData: data.bankExtraData } : {}),
  };

  // Super admins can edit protected fields
  if (isSuper) {
    if (data.legalFirstName) updateData.legalFirstName = data.legalFirstName;
    if (data.legalLastName) updateData.legalLastName = data.legalLastName;
    if (data.personalEmail !== undefined) updateData.personalEmail = data.personalEmail || null;
    if (data.jobTitle !== undefined) updateData.jobTitle = data.jobTitle || null;
    if (data.department !== undefined) updateData.department = data.department || null;
    if (data.startDate) updateData.startDate = new Date(data.startDate as any);
    if (data.hourlyRate !== undefined) updateData.hourlyRate = data.hourlyRate || null;
    if (data.currency) updateData.currency = data.currency;
    if (data.employeeNumber) updateData.employeeNumber = data.employeeNumber;
    if (data.employmentStatus) {
      const ALLOWED_STATUSES = [
        "pre_hire", "onboarding_scheduled", "onboarding_in_progress",
        "active", "leave", "offboarding_in_progress", "offboarded",
      ];
      const normalized = data.employmentStatus.replace(/ /g, "_");
      if (!ALLOWED_STATUSES.includes(normalized)) {
        throw new HriqError("HRIQ-0205", `Invalid status: ${data.employmentStatus}`);
      }
      updateData.employmentStatus = normalized;
    }
    if (data.employmentType) updateData.employmentType = data.employmentType;
  }

  const updated = await database.employee.update({
    where: { id: emp.id },
    data: updateData,
  });

  // Auto-validate payment method compliance after banking changes
  try {
    const empData = await database.employee.findUnique({
      where: { id: emp.id },
      select: { preferredPaymentMethod: true, bankName: true, bankAccountName: true, bankAccountNumber: true, bankSwiftCode: true, bankRoutingNumber: true, bankAddress: true, country: true, currency: true },
    });
    const method = empData?.preferredPaymentMethod as "cadana" | "wise" | null;
    if (method === "cadana" || method === "wise") {
      const { validatePaymentMethod } = await import("@/app/actions/hriq/payment-validation");
      const result = await validatePaymentMethod(method, {
        bankName: empData!.bankName, bankAccountName: empData!.bankAccountName,
        bankAccountNumber: empData!.bankAccountNumber, bankSwiftCode: empData!.bankSwiftCode,
        bankRoutingNumber: empData!.bankRoutingNumber, bankAddress: empData!.bankAddress,
        country: empData!.country, currency: empData!.currency,
      });
      await database.employee.update({ where: { id: emp.id }, data: { paymentMethodVerified: result.valid } });
    }
  } catch (err) { console.warn("[contractor-self-service:updateMyProfile] Suppressed error:", err); }

  revalidatePath("/profile", "page");

  return updated;
}

/**
 * Upload a document for the current contractor.
 */
export async function uploadMyDocument(data: {
  documentName: string;
  documentType: string;
  fileUrl: string;
  description?: string;
}) {
  const session = await requireSession();

  const employee = await database.employee.findFirst({
    where: { linkedUserId: session.userId, ...(session.orgId ? { organizationId: session.orgId } : {}) },
    select: { id: true, legalFirstName: true, legalLastName: true, personalEmail: true },
  });

  if (!employee) throw new HriqError("HRIQ-2501");

  const doc = await database.document.create({
    data: {
      employeeId: employee.id,
      documentName: data.documentName,
      documentType: data.documentType,
      fileUrl: data.fileUrl,
      description: data.description,
      status: "pending",
    },
  });

  // Notify admin (fire-and-forget)
  try {
    const adminEmail = (process.env.GOOGLE_SENDER_EMAIL ?? "").trim();
    if (adminEmail) {
      const { sendDocumentUploadedAdminEmailSystem } = await import("./send-email");
      const contractorName = `${employee.legalFirstName ?? ""} ${employee.legalLastName ?? ""}`.trim() || employee.personalEmail || "Contractor";
      await sendDocumentUploadedAdminEmailSystem(adminEmail, contractorName, data.documentName, data.documentType);
    }
  } catch (e) {
    console.error("[Documents] Failed to notify admin of upload:", e);
  }

  revalidatePath("/profile", "page");

  return doc;
}

/**
 * Get the current contractor's signed contracts (read-only).
 */
export async function getMyContracts() {
  const session = await requireSession();

  const employee = await database.employee.findFirst({
    where: { linkedUserId: session.userId, ...(session.orgId ? { organizationId: session.orgId } : {}) },
    select: { id: true },
  });

  if (!employee) return [];

  return database.contractSigningRequest.findMany({
    where: { employeeId: employee.id },
    include: {
      template: {
        select: { name: true, description: true, category: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Get the current client admin's profile from org_profiles + app_users.
 */
export async function getMyClientAdminProfile() {
  const session = await requireSession();
  if (!session.orgId) throw new HriqError("HRIQ-2502");
  if (!["admin", "super_admin", "manager"].includes(session.orgRole ?? ""))
    throw new HriqError("HRIQ-0105", "Admin access required");

  const [profile, appUser] = await Promise.all([
    database.organizationProfile.findUnique({
      where: { organizationId: session.orgId },
      select: {
        adminName: true,
        adminEmail: true,
        adminPhone: true,
        adminTitle: true,
        country: true,
        address: true,
        website: true,
        organization: { select: { name: true, logoUrl: true, slug: true } },
      },
    }),
    database.appUser.findFirst({
      where: { supabaseUserId: session.userId },
      select: { displayName: true, email: true, profilePicture: true },
    }),
  ]);

  return { profile, appUser };
}

/**
 * Update the current client admin's editable profile fields.
 * Sensitive fields (email) cannot be changed here.
 */
export async function updateClientAdminProfile(data: {
  displayName?: string;
  adminPhone?: string;
  adminTitle?: string;
  country?: string;
  address?: string;
}) {
  const session = await requireSession();
  if (!session.orgId) throw new HriqError("HRIQ-2503");
  // Only admins of that org can edit their own profile
  if (session.orgRole !== "admin") throw new HriqError("HRIQ-2504");

  await Promise.all([
    database.organizationProfile.update({
      where: { organizationId: session.orgId },
      data: {
        adminName: data.displayName || undefined,
        adminPhone: data.adminPhone || undefined,
        adminTitle: data.adminTitle || undefined,
        country: data.country || undefined,
        address: data.address || undefined,
      },
    }),
    database.appUser.updateMany({
      where: { supabaseUserId: session.userId },
      data: { displayName: data.displayName || undefined },
    }),
  ]);

  revalidatePath("/profile");
  revalidatePath("/", "layout");
}

/**
 * Update billing preferences (billingEmail, billingMethod, paymentTerms).
 * Client admins can update their own org's billing settings.
 * Super admins can also call this (orgId comes from session).
 */
export async function updateOrgBillingPreferences(data: {
  billingEmail?: string;
  billingMethod?: string;
  paymentTerms?: string;
}): Promise<{ ok: true } | { error: string }> {
  try {
    const session = await requireSession();
    if (!session.orgId) return { error: "No organization context" };
    if (session.orgRole !== "admin" && session.orgRole !== "super_admin")
      return { error: "Admin access required" };

    // COR orgs must use ACH
    const profile = await database.organizationProfile.findUnique({
      where: { organizationId: session.orgId },
      select: { paymentMethod: true },
    });
    const method = profile?.paymentMethod ?? "ppp";
    const isCOR = method === "cor" || method === "both";
    if (isCOR && data.billingMethod && data.billingMethod !== "ach") {
      return { error: "COR organizations are required to use ACH as their billing method." };
    }

    await database.organizationProfile.update({
      where: { organizationId: session.orgId },
      data: {
        billingEmail:  data.billingEmail  !== undefined ? data.billingEmail  : undefined,
        billingMethod: data.billingMethod !== undefined ? data.billingMethod : undefined,
        paymentTerms:  data.paymentTerms  !== undefined ? data.paymentTerms  : undefined,
      },
    });

    revalidatePath("/settings");
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to update billing preferences";
    console.error("[updateOrgBillingPreferences]", msg);
    return { error: msg };
  }
}
