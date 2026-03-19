"use server";

import { requireRole } from "@repo/auth/session";
import { database } from "@repo/database";
import { revalidatePath } from "next/cache";
import { HriqError } from "@/lib/hriq/errors";

const ALLOWED_ROLES = ["super_admin", "admin", "manager", "member"] as const;
type AllowedRole = (typeof ALLOWED_ROLES)[number];

/**
 * Get the org membership(s) and role for an employee's linked user account.
 * Only super_admins can view this.
 */
export async function getEmployeePermissions(employeeId: string) {
  await requireRole("super_admin");

  const employee = await database.employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      linkedUserId: true,
      legalFirstName: true,
      legalLastName: true,
      organizationId: true,
    },
  });

  if (!employee) throw new HriqError("HRIQ-0201", "Employee not found");
  if (!employee.linkedUserId) {
    return { linked: false as const, employeeId, memberships: [] };
  }

  const memberships = await database.organizationMember.findMany({
    where: { userId: employee.linkedUserId },
    include: {
      organization: { select: { id: true, name: true, slug: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return {
    linked: true as const,
    employeeId,
    linkedUserId: employee.linkedUserId,
    memberships: memberships.map((m) => ({
      id: m.id,
      organizationId: m.organizationId,
      organizationName: m.organization.name,
      organizationSlug: m.organization.slug,
      role: m.role,
      createdAt: m.createdAt,
    })),
  };
}

/**
 * Change the role for an employee's linked user within a specific org membership.
 * Only super_admins can do this.
 */
export async function changeEmployeeRole(
  employeeId: string,
  membershipId: string,
  newRole: string
) {
  try {
    const session = await requireRole("super_admin");

    if (!(ALLOWED_ROLES as unknown as string[]).includes(newRole)) {
      throw new HriqError("HRIQ-1504", `Invalid role: ${newRole}`);
    }

    // Verify the employee exists and has a linked user
    const employee = await database.employee.findUnique({
      where: { id: employeeId },
      select: { linkedUserId: true, legalFirstName: true, legalLastName: true },
    });
    if (!employee?.linkedUserId) {
      throw new HriqError("HRIQ-0209", "Employee has no linked user account");
    }

    // Verify the membership belongs to the linked user
    const membership = await database.organizationMember.findFirst({
      where: { id: membershipId, userId: employee.linkedUserId },
      select: { id: true, role: true, userId: true, organizationId: true },
    });
    if (!membership) {
      throw new HriqError("HRIQ-1505", "Membership not found for this user");
    }

    // Prevent changing own role
    if (membership.userId === session.userId) {
      throw new HriqError("HRIQ-0105", "Cannot change your own role");
    }

    const oldRole = membership.role;

    const updated = await database.organizationMember.update({
      where: { id: membershipId },
      data: { role: newRole },
    });

    // Audit log
    try {
      await database.auditLog.create({
        data: {
          actorType: "user",
          actorUserId: session.userId,
          action: "employee.role_changed",
          objectType: "organization_member",
          objectId: membershipId,
          oldValue: { role: oldRole },
          newValue: { role: newRole },
          reason: `Role changed for ${employee.legalFirstName} ${employee.legalLastName} (employee: ${employeeId})`,
        },
      });
    } catch (auditErr) {
      console.error("[HRIQ] Audit log write failed (non-blocking):", auditErr);
    }

    revalidatePath("/[orgSlug]/employees/[id]", "page");
    revalidatePath("/[orgSlug]/settings", "page");

    return { success: true, newRole: updated.role };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[employee-permissions.ts:changeEmployeeRole]", _msg);
    return { error: _msg };
  }
}
