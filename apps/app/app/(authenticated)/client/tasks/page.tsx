import { getPendingTasks } from "@/app/actions/hriq/tasks";
import { requireOrg } from "@repo/auth/session";
import { database } from "@repo/database";
import type { Metadata } from "next";
import { Header } from "../../components/header";
import { TaskList } from "./task-list";

export const metadata: Metadata = {
  title: "Tasks",
  description: "Manage pending tasks across all contractors",
};

const TasksPage = async () => {
  const session = await requireOrg();
  const [tasks, contractors] = await Promise.all([
    getPendingTasks(),
    database.employee.findMany({
      where: { organizationId: session.orgId, employmentStatus: { not: "offboarded" } },
      select: { id: true, legalFirstName: true, legalLastName: true, employeeNumber: true },
      orderBy: { legalFirstName: "asc" },
    }),
  ]);

  return (
    <>
      <Header page="Tasks" pages={["RL Internal"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <TaskList tasks={tasks} contractors={contractors} />
      </div>
    </>
  );
};

export default TasksPage;
