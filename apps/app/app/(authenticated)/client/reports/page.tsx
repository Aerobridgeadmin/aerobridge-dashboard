import { requireOrg } from "@repo/auth/session";
import { database } from "@repo/database";
import type { Metadata } from "next";
import { Header } from "../../components/header";
import { ReportsCharts } from "./reports-charts";

export const metadata: Metadata = { title: "Reports & Analytics" };

const ReportsPage = async () => {
  const session = await requireOrg();

  const [
    employeesByStatus,
    employeesByDept,
    employeesByType,
    paymentsByMonth,
    taskStats,
  ] = await Promise.all([
    database.employee.groupBy({
      by: ["employmentStatus"],
      where: { organizationId: session.orgId },
      _count: { id: true },
    }),
    database.employee.groupBy({
      by: ["department"],
      where: { organizationId: session.orgId, department: { not: null } },
      _count: { id: true },
    }),
    database.employee.groupBy({
      by: ["employmentType"],
      where: { organizationId: session.orgId },
      _count: { id: true },
    }),
    database.payment.findMany({
      where: { employee: { organizationId: session.orgId } },
      select: { status: true, amount: true },
    }),
    database.task.groupBy({
      by: ["status"],
      where: { employee: { organizationId: session.orgId } },
      _count: { id: true },
    }),
  ]);

  const statusData = employeesByStatus.map((s) => ({ name: s.employmentStatus.replace(/_/g, " "), value: s._count.id }));
  const deptData = employeesByDept.map((d) => ({ name: d.department ?? "N/A", value: d._count.id }));
  const typeData = employeesByType.map((t) => ({ name: t.employmentType.replace(/_/g, " "), value: t._count.id }));
  const paymentByStatus = new Map<string, number>();
  for (const p of paymentsByMonth) {
    paymentByStatus.set(p.status, (paymentByStatus.get(p.status) ?? 0) + Number(p.amount));
  }
  const paymentData = Array.from(paymentByStatus.entries()).map(([name, value]) => ({ name, value }));
  const taskData = taskStats.map((t) => ({ name: t.status.replace(/_/g, " "), value: t._count.id }));

  return (
    <>
      <Header page="Reports" pages={["Client Portal"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <h2 className="text-lg font-semibold">Reports & Analytics</h2>
        <ReportsCharts
          statusData={statusData}
          deptData={deptData}
          typeData={typeData}
          paymentData={paymentData}
          taskData={taskData}
        />
      </div>
    </>
  );
};

export default ReportsPage;
