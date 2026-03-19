import { getContractTemplates, getSigningRequests } from "@/app/actions/hriq/contracts";
import { requireOrg } from "@repo/auth/session";
import { database } from "@repo/database";
import type { Metadata } from "next";
import { Header } from "../../components/header";
import { ContractsView } from "./contracts-view";

export const metadata: Metadata = {
  title: "Contracts",
  description: "Manage contract templates and signing requests",
};

const ContractsPage = async () => {
  const session = await requireOrg();
  const [templates, requests, contractors] = await Promise.all([
    getContractTemplates(),
    getSigningRequests(),
    database.employee.findMany({
      where: { organizationId: session.orgId, employmentStatus: { not: "offboarded" } },
      select: { id: true, legalFirstName: true, legalLastName: true, employeeNumber: true, personalEmail: true, workEmail: true },
      orderBy: { legalFirstName: "asc" },
    }),
  ]);

  return (
    <>
      <Header page="Contracts" pages={["RL Internal"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <ContractsView templates={templates} requests={requests} contractors={contractors} />
      </div>
    </>
  );
};

export default ContractsPage;
