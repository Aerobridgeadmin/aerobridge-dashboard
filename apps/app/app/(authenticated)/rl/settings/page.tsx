import { requireRole } from "@repo/auth/session";
import { database } from "@repo/database";
import type { Metadata } from "next";
import { Header } from "../../components/header";
import { SettingsDashboard } from "./settings-dashboard";

export const metadata: Metadata = { title: "Platform Settings" };

const RLSettingsPage = async () => {
  const session = await requireRole("super_admin");

  const [orgCount, userCount, employeeCount, activeUsers, memberCount, pendingInvites] = await Promise.all([
    database.organization.count(),
    database.appUser.count(),
    database.employee.count(),
    database.appUser.count({ where: { isActive: true } }),
    database.organizationMember.count(),
    database.organizationInvitation.count({ where: { acceptedAt: null, expiresAt: { gt: new Date() } } }),
  ]);

  // Get RL's own org members
  const ownMembership = await database.organizationMember.findFirst({
    where: { userId: session.userId, role: "super_admin" },
    select: { organizationId: true },
  });

  const rlMembers = ownMembership
    ? await database.organizationMember.findMany({
        where: { organizationId: ownMembership.organizationId },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const rlOrgId = ownMembership?.organizationId ?? null;

  // Get all app_users for the member display
  const allUsers = await database.appUser.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const integrations = {
    supabase: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    stripe: !!process.env.STRIPE_SECRET_KEY,
    resend: !!process.env.RESEND_TOKEN,
    zoom: !!(process.env.ZOOM_ACCOUNT_ID && process.env.ZOOM_CLIENT_ID),
    jotform: !!process.env.JOTFORM_API_KEY,
    sentry: !!process.env.SENTRY_DSN,
    posthog: !!process.env.NEXT_PUBLIC_POSTHOG_KEY,
    knock: !!process.env.KNOCK_SECRET_API_KEY,
    liveblocks: !!process.env.LIVEBLOCKS_SECRET,
    google: !!process.env.GOOGLE_CLIENT_ID,
  };

  return (
    <>
      <Header page="Settings" pages={["RL Internal"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <SettingsDashboard
          session={{ email: session.email, userId: session.userId, role: session.orgRole, name: session.name }}
          stats={{ orgCount, userCount, employeeCount, activeUsers, memberCount, pendingInvites }}
          integrations={integrations}
          rlMembers={rlMembers}
          rlOrgId={rlOrgId}
          allUsers={allUsers}
        />
      </div>
    </>
  );
};

export default RLSettingsPage;
