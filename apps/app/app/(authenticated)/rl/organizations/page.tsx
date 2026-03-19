import { getOrganizations } from "@/app/actions/hriq/invitations";
import type { Metadata } from "next";
import { Header } from "../../components/header";
import { OrganizationsList } from "./organizations-list";

export const metadata: Metadata = {
  title: "Client Organizations",
  description: "Manage client organizations",
};

const OrganizationsPage = async () => {
  const organizations = await getOrganizations();

  return (
    <>
      <Header page="Client Organizations" pages={["RL Internal"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <OrganizationsList organizations={organizations} />
      </div>
    </>
  );
};

export default OrganizationsPage;
