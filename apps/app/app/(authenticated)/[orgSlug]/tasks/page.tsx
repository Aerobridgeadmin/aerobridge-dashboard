import { getPendingTasks } from "@/app/actions/hriq/tasks";
import { requireOrg, getSessionContext } from "@repo/auth/session";
import { database } from "@repo/database";
import type { Metadata } from "next";
import { Header } from "../../components/header";
import { TaskList } from "./task-list";
import { MyTaskList } from "./my-task-list";

export const metadata: Metadata = { title: "Tasks" };

const TasksPage = async () => {
  const session = await requireOrg();
  const ctx = await getSessionContext();
  const isAdmin = ["super_admin", "admin", "manager"].includes(ctx?.orgRole ?? "");

  if (isAdmin) {
    const [tasks, contractors] = await Promise.all([
      getPendingTasks(),
      database.employee.findMany({
        where: { organizationId: session.orgId, employmentStatus: { not: "offboarded" } },
        select: { id: true, legalFirstName: true, legalLastName: true, employeeNumber: true },
        orderBy: { legalFirstName: "asc" },
      })]);
    return (
      <>
        <Header page="Tasks" pages={[ctx?.orgRole === "super_admin" ? "RL Internal" : "Client Portal"]} />
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0"><TaskList tasks={tasks} contractors={contractors} /></div>
      </>
    );
  }

  // VA/Member view
  const employee = await database.employee.findFirst({ where: { linkedUserId: session.userId, ...(session.orgId ? { organizationId: session.orgId } : {}) } });
  const tasks = employee
    ? await database.task.findMany({ where: { employeeId: employee.id }, orderBy: [{ status: "asc" }, { dueDate: "asc" }], take: 500 })
    : [];

  return (
    <>
      <Header page="My Tasks" pages={["Self Service"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0"><MyTaskList tasks={tasks} /></div>
    </>
  );
};

export default TasksPage;
