"use server";

import { revalidatePath } from "next/cache";

import { requireRole, requireOrg } from "@repo/auth/session";
import { database } from "@repo/database";
import { HriqError } from "@/lib/hriq/errors";

export async function updateUserRole(memberId: string, newRole: string) {
  try {
    const session = await requireRole("super_admin");
    const allowedRoles = ["super_admin", "admin", "manager", "member"];
    if (!allowedRoles.includes(newRole)) throw new HriqError("HRIQ-1504", `Invalid role: ${newRole}`);

    const existing = await database.organizationMember.findFirst({ where: { id: memberId, ...(session.orgId ? { organizationId: session.orgId } : {}) }, select: { id: true, userId: true } });
    if (!existing) throw new HriqError("HRIQ-1505");
    if (existing.userId === session.userId) throw new HriqError("HRIQ-0105");

    const membership = await database.organizationMember.update({
      where: { id: memberId },
      data: { role: newRole },
    });

    try {
      await database.auditLog.create({
        data: {
          actorType: "user",
          actorUserId: session.userId,
          action: "user.role_changed",
          objectType: "organization_member",
          objectId: memberId,
          newValue: { role: newRole },
        },
      });
    } catch (auditErr) {
      console.error("[HRIQ] Audit log write failed (non-blocking):", auditErr);
    }

    revalidatePath("/[orgSlug]/settings", "page");

    return membership;

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[users.ts:updateUserRole]", _msg);
    return { error: _msg };
  }
}

export async function deactivateUser(userId: string) {
  try {
    await requireRole("super_admin");

    revalidatePath("/[orgSlug]/settings", "page");
    return database.appUser.update({
      where: { id: userId },
      data: { isActive: false },
    });

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[users.ts:deactivateUser]", _msg);
    return { error: _msg };
  }
}

export async function reactivateUser(userId: string) {
  try {
    await requireRole("super_admin");

    revalidatePath("/[orgSlug]/settings", "page");
    return database.appUser.update({
      where: { id: userId },
      data: { isActive: true },
    });

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[users.ts:reactivateUser]", _msg);
    return { error: _msg };
  }
}
