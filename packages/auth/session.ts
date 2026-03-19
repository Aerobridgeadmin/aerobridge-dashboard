import "server-only";

import { database } from "@repo/database";
import { createClient } from "./server";
import { defineAbilitiesFor, type AppAbility, type AppRole } from "./abilities";

export type SessionContext = {
  userId: string;
  email: string;
  name: string | null;
  orgId: string | null;
  orgRole: AppRole;
  ability: AppAbility;
};

async function getDevBypassSession(): Promise<SessionContext | null> {
  if (process.env.NODE_ENV === "production") return null;
  const devEntryEnabled =
    process.env.DEV_ENTRY_ENABLED === "true" ||
    process.env.NEXT_PUBLIC_DEV_ENTRY_ENABLED === "true" ||
    !!process.env.DEV_ENTRY_USER_ID;
  if (!devEntryEnabled) return null;

  const envUserId = process.env.DEV_ENTRY_USER_ID?.trim();
  const fallbackSuperAdmin = await database.organizationMember.findFirst({
    where: { role: "super_admin" },
    select: { userId: true },
    orderBy: { createdAt: "asc" },
  });
  const devUserId = envUserId ?? fallbackSuperAdmin?.userId ?? null;
  if (!devUserId) return null;

  const memberships = await database.organizationMember.findMany({
    where: { userId: devUserId },
    select: { organizationId: true, role: true },
    orderBy: { createdAt: "asc" },
  });
  if (memberships.length === 0) return null;

  const preferredOrgId = process.env.DEV_ENTRY_ORG_ID?.trim();
  const chosenMembership =
    memberships.find((m: any) => m.organizationId === preferredOrgId) ?? memberships[0]!;

  const appUser = await database.appUser.findFirst({
    where: { supabaseUserId: devUserId },
    select: { email: true, displayName: true },
  });

  const allowedRoles: AppRole[] = ["super_admin", "admin", "manager", "member"];
  const orgRole = allowedRoles.includes(chosenMembership.role as AppRole)
    ? (chosenMembership.role as AppRole)
    : "member";
  return {
    userId: devUserId,
    email: appUser?.email ?? process.env.DEV_ENTRY_EMAIL ?? "dev-entry@local.test",
    name: appUser?.displayName ?? process.env.DEV_ENTRY_NAME ?? "Dev Entry",
    orgId: chosenMembership.organizationId,
    orgRole,
    ability: defineAbilitiesFor(orgRole),
  };
}

/**
 * Get the full session context for the current request.
 * Resolves the Supabase user, their active org, their role in that org,
 * and builds CASL abilities.
 */
export async function getSessionContext(): Promise<SessionContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return getDevBypassSession();
  }

  const orgId =
    (user.user_metadata?.activeOrganizationId as string | null) ?? null;

  let orgRole: AppRole = "member";
  let resolvedOrgId = orgId;

  if (resolvedOrgId) {
    // Validate the org still exists (cascade-deleted orgs leave stale metadata)
    const orgExists = await database.organization.findUnique({
      where: { id: resolvedOrgId },
      select: { id: true },
    });
    if (!orgExists) {
      resolvedOrgId = null; // Org was deleted, treat as no active org
    }
  }

  if (resolvedOrgId) {
    const membership = await database.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId: resolvedOrgId,
        },
      },
    });

    if (membership) {
      orgRole = membership.role as AppRole;
    }

    // Super admins can impersonate any org — check their home org membership
    if (!membership || orgRole === "member") {
      const anyMembership = await database.organizationMember.findFirst({
        where: { userId: user.id, role: "super_admin" },
      });
      if (anyMembership) {
        orgRole = "super_admin";
      }
    }
  } else {
    // No active org — still check if user is a super_admin in any org
    const anyMembership = await database.organizationMember.findFirst({
      where: { userId: user.id, role: "super_admin" },
    });
    if (anyMembership) {
      orgRole = "super_admin";
    }
  }

  const ability = defineAbilitiesFor(orgRole);

  return {
    userId: user.id,
    email: user.email ?? "",
    name: (user.user_metadata?.name as string) ?? null,
    orgId: resolvedOrgId,
    orgRole,
    ability,
  };
}

/**
 * Require an authenticated session. Throws if not authenticated.
 * Use in Server Components and Server Actions.
 */
export async function requireSession(): Promise<SessionContext> {
  const session = await getSessionContext();
  if (!session) {
    throw new Error("Authentication required");
  }
  return session;
}

/**
 * Require a specific role (or higher). Throws if insufficient permissions.
 */
export async function requireRole(
  ...allowedRoles: AppRole[]
): Promise<SessionContext> {
  const session = await requireSession();
  if (!allowedRoles.includes(session.orgRole)) {
    throw new Error(
      `Insufficient permissions. Required: ${allowedRoles.join(", ")}. Got: ${session.orgRole}`
    );
  }
  return session;
}

/**
 * Require an active organization. Throws if no org is selected.
 * For super_admins without an active org, auto-resolves to their home org.
 */
export async function requireOrg(): Promise<
  SessionContext & { orgId: string }
> {
  const session = await requireSession();

  if (session.orgId) {
    return session as SessionContext & { orgId: string };
  }

  // Auto-resolve: find user's org membership (any role)
  const membership = await database.organizationMember.findFirst({
    where: { userId: session.userId },
    select: { organizationId: true },
    orderBy: { createdAt: "desc" },
  });
  if (membership) {
    return { ...session, orgId: membership.organizationId } as SessionContext & { orgId: string };
  }

  // Fallback: resolve org via linked employee record (for VAs without org membership)
  const employee = await database.employee.findFirst({
    where: { linkedUserId: session.userId },
    select: { organizationId: true },
  });
  if (employee?.organizationId) {
    return { ...session, orgId: employee.organizationId } as SessionContext & { orgId: string };
  }

  throw new Error("No organization selected");
}

/**
 * Get all organizations the current user belongs to.
 */
export async function getUserOrganizations(userId: string) {
  return database.organizationMember.findMany({
    where: { userId },
    include: {
      organization: true,
    },
  });
}
