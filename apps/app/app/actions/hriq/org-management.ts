"use server";

import { requireRole } from "@repo/auth/session";
import { database } from "@repo/database";
import { generateEmployeeNumber, generateSelfServiceToken, checkEmailConflicts } from "@/lib/hriq/utils";
import { sanitizeDecimal } from "./constants";
import { revalidatePath } from "next/cache";
import { HriqError } from "@/lib/hriq/errors";

//  Contractor Management (org-scoped for super_admin) 

export async function addContractorToOrg(orgId: string, data: {
  legalFirstName: string;
  legalLastName: string;
  employmentType: string;
  personalEmail?: string;
  workEmail?: string;
  preferredName?: string;
  department?: string;
  jobTitle?: string;
  location?: string;
  country?: string;
  phone?: string;
  hourlyRate?: string;
  monthlySalary?: string;
  compensationType?: string;
  currency?: string;
  startDate?: string;
  timezone?: string;
}) {
  const session = await requireRole("super_admin");

  const org = await database.organization.findUnique({ where: { id: orgId } });
  if (!org) throw new HriqError("HRIQ-1601");

  // Cross-system email conflict check
  const emailToCheck = (data.personalEmail ?? data.workEmail)?.trim().toLowerCase();
  if (emailToCheck) {
    const conflict = await checkEmailConflicts(emailToCheck, {
      allowSameOrg: orgId,
      context: "adding a contractor to this organization",
    });
    if (conflict.hasConflict) {
      return { error: `[HRIQ-0203] ${conflict.message}` } as any;
    }

    // Same-org duplicate check
    const existing = await database.employee.findFirst({
      where: {
        organizationId: orgId,
        employmentStatus: { not: "offboarded" },
        OR: [
          { personalEmail: { equals: emailToCheck, mode: "insensitive" } },
          { workEmail: { equals: emailToCheck, mode: "insensitive" } },
        ],
      },
      select: { id: true, legalFirstName: true, legalLastName: true },
    });
    if (existing) {
      return { error: `[HRIQ-0203] Email "${emailToCheck}" is already used by ${existing.legalFirstName} ${existing.legalLastName} in this organization.` } as any;
    }
  }

  const compType = data.compensationType === "monthly" ? "monthly" : "hourly";
  const newEmployee = await database.employee.create({
    data: {
      organizationId: orgId,
      employeeNumber: await generateEmployeeNumber(orgId),
      selfServiceToken: generateSelfServiceToken(),
      legalFirstName: data.legalFirstName,
      legalLastName: data.legalLastName,
      employmentType: data.employmentType,
      personalEmail: data.personalEmail || undefined,
      workEmail: data.workEmail || undefined,
          preferredName: data.preferredName || undefined,
          timezone: data.timezone || undefined,
      department: data.department || undefined,
      jobTitle: data.jobTitle || undefined,
      location: data.location || undefined,
      country: data.country || undefined,
      phoneNumber: data.phone || undefined,
      compensationType: compType,
      hourlyRate: compType === "hourly" ? (sanitizeDecimal(data.hourlyRate) || undefined) : undefined,
      monthlySalary: compType === "monthly" ? (sanitizeDecimal(data.monthlySalary || data.hourlyRate) || undefined) : undefined,
      currency: data.currency ?? "USD",
      startDate: data.startDate ? new Date(data.startDate as any) : undefined,
      photoUrl: org.logoUrl || undefined,
      createdByUserId: session.userId,
    },
  });

  revalidatePath("/[orgSlug]/employees", "page");
  revalidatePath("/[orgSlug]/organizations", "page");

  return newEmployee;
}

//  Payment Management (org-scoped for super_admin) 

export async function recordPaymentForOrg(orgId: string, data: {
  employeeId: string;
  amount: string;
  currency?: string;
  paymentType: string;
  paymentMethod?: string;
  periodStart?: string;
  periodEnd?: string;
  notes?: string;
}) {
  const session = await requireRole("super_admin");

  const employee = await database.employee.findFirst({
    where: { id: data.employeeId, organizationId: orgId },
  });
  if (!employee) throw new HriqError("HRIQ-1902", "Not in this organization");

  const parsedAmount = Number(data.amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    throw new HriqError("HRIQ-0804", "Payment amount must be a positive number");
  }

  const payment = await database.payment.create({
    data: {
      employeeId: data.employeeId,
      amount: data.amount,
      currency: data.currency ?? "USD",
      paymentType: data.paymentType,
      paymentMethod: data.paymentMethod || undefined,
      periodStart: data.periodStart ? new Date(data.periodStart as any) : undefined,
      periodEnd: data.periodEnd ? new Date(data.periodEnd as any) : undefined,
      notes: data.notes || undefined,
      status: "pending",
    },
  });

  revalidatePath("/[orgSlug]/payments", "page");
  revalidatePath("/[orgSlug]/payroll", "page");
  revalidatePath("/[orgSlug]/organizations", "page");

  return payment;
}

export async function updatePaymentStatusForOrg(paymentId: string, status: string) {
  try {
    await requireRole("super_admin");

    const ALLOWED_STATUSES = ["pending", "processing", "completed", "failed", "cancelled"];
    if (!ALLOWED_STATUSES.includes(status)) {
      throw new HriqError("HRIQ-0803", `Invalid payment status: ${status}`);
    }

    const payment = await database.payment.findUnique({ where: { id: paymentId }, select: { id: true, employeeId: true } });
    if (!payment) throw new HriqError("HRIQ-0801");

    const updated = await database.payment.update({
      where: { id: paymentId },
      data: {
        status,
        ...(status === "completed" ? { paymentDate: new Date() } : {}),
      },
    });

    revalidatePath("/[orgSlug]/payments", "page");
    revalidatePath("/[orgSlug]/payroll", "page");
    revalidatePath("/[orgSlug]/organizations", "page");

    return updated;

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[org-management.ts:updatePaymentStatusForOrg]", _msg);
    return { error: _msg };
  }
}

//  Task Management (org-scoped for super_admin) 

export async function createTaskForOrg(orgId: string, data: {
  employeeId: string;
  title: string;
  description?: string;
  taskType?: string;
  dueDate?: string;
}) {
  await requireRole("super_admin");

  const employee = await database.employee.findFirst({
    where: { id: data.employeeId, organizationId: orgId },
  });
  if (!employee) throw new HriqError("HRIQ-1902", "Not in this organization");

  const task = await database.task.create({
    data: {
      employeeId: data.employeeId,
      title: data.title,
      description: data.description || undefined,
      taskType: data.taskType ?? "custom",
      dueDate: data.dueDate ? new Date(data.dueDate as any) : undefined,
      status: "pending",
    },
  });

  revalidatePath("/[orgSlug]/organizations", "page");

  return task;
}

export async function completeTaskForOrg(taskId: string) {
  try {
    await requireRole("super_admin");

    const task = await database.task.findUnique({ where: { id: taskId }, select: { id: true, status: true } });
    if (!task) throw new HriqError("HRIQ-0901", "Task not found");
    if (task.status === "completed") return task;

    const updated = await database.task.update({
      where: { id: taskId },
      data: { status: "completed", completedAt: new Date() },
    });

    revalidatePath("/[orgSlug]/organizations", "page");

    return updated;

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[org-management.ts:completeTaskForOrg]", _msg);
    return { error: _msg };
  }
}

//  Document Management (org-scoped for super_admin) 

export async function addDocumentForOrg(orgId: string, data: {
  employeeId: string;
  documentType: string;
  documentName: string;
  fileUrl?: string;
  fileName?: string;
}) {
  await requireRole("super_admin");

  const employee = await database.employee.findFirst({
    where: { id: data.employeeId, organizationId: orgId },
  });
  if (!employee) throw new HriqError("HRIQ-1902", "Not in this organization");

  const doc = await database.document.create({
    data: {
      employeeId: data.employeeId,
      documentType: data.documentType,
      documentName: data.documentName,
      fileUrl: data.fileUrl || undefined,
      fileName: data.fileName || undefined,
      status: "pending",
    },
  });

  revalidatePath("/[orgSlug]/organizations", "page");

  return doc;
}

export async function verifyDocumentForOrg(documentId: string, _userId?: string) {
  try {
    const session = await requireRole("super_admin");

    const document = await database.document.findUnique({ where: { id: documentId }, select: { id: true } });
    if (!document) throw new HriqError("HRIQ-0301");

    const updated = await database.document.update({
      where: { id: documentId },
      data: { status: "verified", verifiedByUserId: session.userId, verifiedAt: new Date() },
    });

    revalidatePath("/[orgSlug]/organizations", "page");

    return updated;

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[org-management.ts:verifyDocumentForOrg]", _msg);
    return { error: _msg };
  }
}

//  Invite Member to specific org (super_admin) 

export async function inviteMemberToOrg(orgId: string, data: {
  email: string;
  role: string;
  name?: string;
}) {
  const session = await requireRole("super_admin");

  const org = await database.organization.findUnique({ where: { id: orgId }, select: { name: true } });
  if (!org) throw new HriqError("HRIQ-1601");

  const allowedRoles = ["super_admin", "admin", "manager", "member"];
  if (!allowedRoles.includes(data.role)) throw new HriqError("HRIQ-1504", `Invalid role: ${data.role}`);

  const email = data.email.toLowerCase().trim();

  // Cross-system email conflict check — warn if email is used as a contractor elsewhere
  const conflict = await checkEmailConflicts(email, {
    allowSameOrg: orgId,
    context: "inviting a member to this organization",
  });
  if (conflict.hasConflict && conflict.details.employeeRecords.length > 0) {
    return { error: `[HRIQ-0203] ${conflict.message}` } as any;
  }

  const invitation = await database.organizationInvitation.create({
    data: {
      organizationId: orgId,
      email,
      role: data.role,
      invitedBy: session.userId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  await database.approvedEmail.upsert({
    where: { email_organizationId: { email, organizationId: orgId } },
    create: { email, role: data.role, organizationId: orgId, addedByUserId: session.userId },
    update: { role: data.role },
  });

  // Provision Supabase Auth account (email + password) so they can also log in without Google
  const { getSupabaseAdmin, DEFAULT_PASSWORD } = await import("./constants");
  const supabaseAdmin = getSupabaseAdmin();
  const displayName = data.name || email.split("@")[0];

  try {
    const existingAppUserForAuth = await database.appUser.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { supabaseUserId: true },
    });

    let userId: string;
    if (existingAppUserForAuth) {
      userId = existingAppUserForAuth.supabaseUserId;
      // Don't reset the password for existing users — they already have credentials
    } else {
      const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: DEFAULT_PASSWORD,
        email_confirm: true,
        user_metadata: {
          name: displayName,
          activeOrganizationId: orgId,
          role: data.role,
          isFirstLogin: true,
        },
      });
      if (createErr) throw new Error(createErr.message);
      userId = newUser?.user?.id ?? "";
    }

    if (userId) {
      // Create app_user + org membership
      await database.appUser.upsert({
        where: { email },
        create: { supabaseUserId: userId, email, displayName },
        update: { displayName },
      });

      const existingMember = await database.organizationMember.findFirst({
        where: { userId, organizationId: orgId },
      });
      if (!existingMember) {
        await database.organizationMember.create({
          data: { userId, organizationId: orgId, role: data.role },
        });
      }
    }
  } catch (provisionErr) {
    console.error("[HRIQ] Failed to provision auth account for invite:", provisionErr);
  }

  // Send invite email
  try {
    const { sendTeamInviteEmail } = await import("./send-email");
    await sendTeamInviteEmail(email, data.role, data.name);
  } catch (e) { console.error("[HRIQ-1703] OrgManagement — failed to send invite email:", e); }

  revalidatePath("/[orgSlug]/settings", "page");
  revalidatePath("/[orgSlug]/organizations", "page");

  return invitation;
}
