import { requireRole } from "@repo/auth/session";
import { getExternalTasks, getExternalTaskStats } from "@/app/actions/hriq/external-operations";
import { getClientOrganizations } from "@/app/actions/hriq/external-finance";
import type { Metadata } from "next";
import { Header } from "../../../components/header";
import { ExternalTasksDashboard } from "./external-tasks-dashboard";
import { serialize } from "@/lib/hriq/serialize";

export const metadata: Metadata = { title: "External Tasks" };

const ExternalTasksPage = async () => {
  await requireRole("super_admin");

  const [tasks, stats, organizations] = await Promise.all([
    getExternalTasks(),
    getExternalTaskStats(),
    getClientOrganizations(),
  ]);

  return (
    <>
      <Header page="External Tasks" pages={["Client Orgs"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <ExternalTasksDashboard tasks={serialize(tasks)} organizations={organizations} stats={stats} />
      </div>
    </>
  );
};

export default ExternalTasksPage;
