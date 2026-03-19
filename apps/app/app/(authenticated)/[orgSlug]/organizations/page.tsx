import { getOrganizations } from "@/app/actions/hriq/invitations";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionContext } from "@repo/auth/session";
import { Header } from "../../components/header";
import { OrganizationsList } from "./organizations-list";

export const metadata: Metadata = {
  title: "Organizations",
  description: "Manage client organizations",
};

const OrganizationsPage = async () => {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/sign-in");
  if (ctx.orgRole !== "super_admin") redirect("/");

  const organizations = await getOrganizations();

  return (
    <>
      <Header page="Organizations" pages={["RL Internal"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <OrganizationsList organizations={organizations} />
      </div>
    </>
  );
};

export default OrganizationsPage;
