import { requireOrg } from "@repo/auth/session";
import { database } from "@repo/database";
import { getPendingInvitations } from "@/app/actions/hriq/invitations";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Header } from "../../../components/header";
import { TeamSettings } from "./team-settings";

export const metadata: Metadata = { title: "Team Settings" };

const TeamPage = async () => {
  const session = await requireOrg();

  // Only admins and super_admins can manage team settings
  if (!["super_admin", "admin"].includes(session.orgRole)) {
    const org = await database.organization.findUnique({
      where: { id: session.orgId },
      select: { slug: true },
    });
    redirect(`/${org?.slug ?? ""}`);
  }

  const [members, invitations] = await Promise.all([
    database.organizationMember.findMany({
      where: { organizationId: session.orgId },
      orderBy: { createdAt: "desc" },
    }),
    getPendingInvitations(),
  ]);

  return (
    <>
      <Header page="Team" pages={[session.orgRole === "super_admin" ? "RL Internal" : "Client Portal", "Settings"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <TeamSettings members={members} invitations={invitations} currentRole={session.orgRole} />
      </div>
    </>
  );
};

export default TeamPage;
