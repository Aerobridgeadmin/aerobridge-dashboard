import { requireOrg } from "@repo/auth/session";
import { database } from "@repo/database";
import { getPendingInvitations } from "@/app/actions/hriq/invitations";
import type { Metadata } from "next";
import { Header } from "../../../components/header";
import { TeamSettings } from "./team-settings";

export const metadata: Metadata = { title: "Team Settings" };

const TeamPage = async () => {
  const session = await requireOrg();

  const [members, invitations] = await Promise.all([
    database.organizationMember.findMany({
      where: { organizationId: session.orgId },
      orderBy: { createdAt: "desc" },
    }),
    getPendingInvitations(),
  ]);

  return (
    <>
      <Header page="Team" pages={["Client Portal", "Settings"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <TeamSettings members={members} invitations={invitations} />
      </div>
    </>
  );
};

export default TeamPage;
