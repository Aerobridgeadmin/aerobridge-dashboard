"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@repo/auth/session";
import { database } from "@repo/database";
import { generateEmployeeNumber, generateSelfServiceToken, checkEmailConflicts } from "@/lib/hriq/utils";
import { HriqError } from "@/lib/hriq/errors";
import { serialize } from "@/lib/hriq/serialize";

export async function getPendingHires() {
  await requireRole("super_admin");

  const results = await database.$queryRaw<Array<{
    id: string; recruit_crm_slug: string; first_name: string; last_name: string;
    email: string | null; phone: string | null; position: string | null;
    city: string | null; country: string | null; current_salary: string | null;
    salary_expectation: string | null; linkedin: string | null; skills: string | null;
    status: string; reviewed_by: string | null; reviewed_at: Date | null;
    rejection_reason: string | null; created_employee_id: string | null;
    created_at: Date; updated_at: Date;
  }>>`SELECT * FROM pending_hires ORDER BY created_at DESC`;

  return results;
}

export async function approvePendingHire(pendingHireId: string) {
  try {
    const session = await requireRole("super_admin");

    const rows = await database.$queryRaw<Array<{
      id: string; first_name: string; last_name: string; email: string | null;
      phone: string | null; position: string | null; city: string | null;
      country: string | null; salary_expectation: string | null; skills: string | null;
      linkedin: string | null; recruit_crm_slug: string;
    }>>`SELECT * FROM pending_hires WHERE id = ${pendingHireId} AND status = 'pending'`;

    if (!rows.length) throw new HriqError("HRIQ-2401");
    const hire = rows[0];

    const rlMembership = await database.organizationMember.findFirst({
      where: { userId: session.userId, role: "super_admin" },
      select: { organizationId: true },
    });
    if (!rlMembership) throw new HriqError("HRIQ-1602");

    // Cross-system email conflict check before creating employee
    if (hire.email?.trim()) {
      const conflict = await checkEmailConflicts(hire.email.trim(), {
        allowSameOrg: rlMembership.organizationId,
        context: "approving a pending hire",
      });
      if (conflict.hasConflict) {
        throw new Error(`[HRIQ-0203] Cannot approve: ${conflict.message}`);
      }

      // Same-org duplicate check
      const existing = await database.employee.findFirst({
        where: {
          organizationId: rlMembership.organizationId,
          employmentStatus: { not: "offboarded" },
          OR: [
            { personalEmail: { equals: hire.email.trim(), mode: "insensitive" } },
            { workEmail: { equals: hire.email.trim(), mode: "insensitive" } },
          ],
        },
        select: { id: true, legalFirstName: true, legalLastName: true },
      });
      if (existing) {
        throw new Error(`Email "${hire.email}" is already used by ${existing.legalFirstName} ${existing.legalLastName} in this organization.`);
      }
    }

    // Default photo to org logo
    let defaultPhotoUrl: string | undefined;
    try {
      const orgData = await database.organization.findUnique({ where: { id: rlMembership.organizationId }, select: { logoUrl: true } });
      if (orgData?.logoUrl) defaultPhotoUrl = orgData.logoUrl;
    } catch (err) { console.warn("[pending-hires:approvePendingHire] Suppressed error:", err); }

    const employee = await database.employee.create({
      data: {
        organizationId: rlMembership.organizationId,
        employeeNumber: await generateEmployeeNumber(rlMembership.organizationId),
        selfServiceToken: generateSelfServiceToken(),
        legalFirstName: hire.first_name,
        legalLastName: hire.last_name,
        personalEmail: hire.email || undefined,
        phoneNumber: hire.phone || undefined,
        jobTitle: hire.position || undefined,
        location: [hire.city, hire.country].filter(Boolean).join(", ") || undefined,
        employmentType: "contractor",
        employmentStatus: "pre_hire",
        recruitCrmSlug: hire.recruit_crm_slug,
        photoUrl: defaultPhotoUrl,
        createdByUserId: session.userId,
      },
    });

    await database.$executeRaw`
      UPDATE pending_hires
      SET status = 'approved', reviewed_by = ${session.userId}, reviewed_at = NOW(),
          created_employee_id = ${employee.id}, updated_at = NOW()
      WHERE id = ${pendingHireId}
    `;

    try {
      await database.auditLog.create({
        data: {
          organizationId: rlMembership.organizationId,
          actorType: "user",
          actorUserId: session.userId,
          action: "pending_hire.approved",
          objectType: "employee",
          objectId: employee.id,
          newValue: serialize({ name: `${hire.first_name} ${hire.last_name}`, source: "recruitcrm", slug: hire.recruit_crm_slug }),
        },
      });
    } catch (auditErr) {
      console.error("[HRIQ] Audit log write failed (non-blocking):", auditErr);
    }

    revalidatePath("/[orgSlug]/hiring", "page");

    return employee;

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[pending-hires.ts:approvePendingHire]", _msg);
    return { error: _msg };
  }
}

export async function rejectPendingHire(pendingHireId: string, reason: string) {
  try {
    const session = await requireRole("super_admin");

    await database.$executeRaw`
      UPDATE pending_hires
      SET status = 'rejected', reviewed_by = ${session.userId}, reviewed_at = NOW(),
          rejection_reason = ${reason}, updated_at = NOW()
      WHERE id = ${pendingHireId}
    `;
    revalidatePath("/[orgSlug]/hiring", "page");

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[pending-hires.ts:rejectPendingHire]", _msg);
    return { error: _msg };
  }
}
