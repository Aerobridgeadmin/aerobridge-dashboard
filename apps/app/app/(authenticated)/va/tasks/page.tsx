import { requireSession } from "@repo/auth/session";
import { database } from "@repo/database";
import type { Metadata } from "next";
import { Header } from "../../components/header";
import { MyTaskList } from "./my-task-list";

export const metadata: Metadata = { title: "My Tasks" };

const VATasksPage = async () => {
  const session = await requireSession();

  const employee = await database.employee.findFirst({
    where: { linkedUserId: session.userId },
  });

  const tasks = employee
    ? await database.task.findMany({
        where: { employeeId: employee.id },
        orderBy: [{ status: "asc" }, { dueDate: "asc" }],
      })
    : [];

  return (
    <>
      <Header page="My Tasks" pages={["Self Service"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <MyTaskList tasks={tasks} />
      </div>
    </>
  );
};

export default VATasksPage;
