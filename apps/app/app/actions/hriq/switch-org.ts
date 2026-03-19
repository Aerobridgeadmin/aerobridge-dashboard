"use server";

import { requireRole } from "@repo/auth/session";
import { createClient } from "@repo/auth/server";
import { database } from "@repo/database";
import { HriqError } from "@/lib/hriq/errors";
import { RL_ORG_ID } from "./constants";

export async function switchOrganization(orgId: string) {
  try {
    const session = await requireRole("super_admin");

    // Only RL platform super_admins can switch organizations
    const rlMembership = await database.organizationMember.findFirst({
      where: { userId: session.userId, organizationId: RL_ORG_ID, role: "super_admin" },
      select: { id: true },
    });
    if (!rlMembership) throw new HriqError("HRIQ-1603", "Only RL admins can switch organizations");

    // Verify the org exists
    const org = await database.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true },
    });
    if (!org) throw new HriqError("HRIQ-1601");

    // Update the user's activeOrganizationId in Supabase metadata
    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({
      data: { activeOrganizationId: orgId },
    });

    if (error) throw new HriqError("HRIQ-1604", `Failed to switch org: ${error.message}`);

    return { orgId: org.id, orgName: org.name };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[switch-org.ts:switchOrganization]", _msg);
    return { error: _msg };
  }
}

export async function clearOrganization() {
  try {
    const session = await requireRole("super_admin");

    // Only RL platform super_admins can clear org context
    const rlMembership = await database.organizationMember.findFirst({
      where: { userId: session.userId, organizationId: RL_ORG_ID, role: "super_admin" },
      select: { id: true },
    });
    if (!rlMembership) throw new HriqError("HRIQ-1603", "Only RL admins can switch organizations");

    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({
      data: { activeOrganizationId: null },
    });

    if (error) throw new HriqError("HRIQ-1605", `Failed to clear org: ${error.message}`);

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[switch-org.ts:clearOrganization]", _msg);
    return { error: _msg };
  }
}

export async function getAllOrganizations() {
  try {
    const session = await requireRole("super_admin");

  // Only RL platform super_admins can view all organizations
  const rlMembership = await database.organizationMember.findFirst({
    where: { userId: session.userId, organizationId: RL_ORG_ID, role: "super_admin" },
    select: { id: true },
  });
  if (!rlMembership) {
    return [];
  }

  return database.organization.findMany({
    select: { id: true, name: true, slug: true, logoUrl: true },
    orderBy: { name: "asc" },
  });
  } catch {
    // Non-super-admin users silently get empty list
    return [];
  }
}
