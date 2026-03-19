import { requireOrg } from "@repo/auth/session";
import { database } from "@repo/database";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "../components/header";
import { ClientDashboardCharts } from "./dashboard-charts";

export const metadata: Metadata = {
  title: "Client Dashboard",
  description: "Client admin dashboard",
};

const ClientDashboard = async () => {
  let session;
  try {
    session = await requireOrg();
  } catch {
    redirect("/");
  }

  const [
    employeeCount,
    activeCount,
    pendingTasks,
    pendingPayments,
    completedTasks30d,
    totalTasks30d,
    recentEmployees,
    announcements,
    paymentSummary,
    departmentStats,
  ] = await Promise.all([
    database.employee.count({ where: { organizationId: session.orgId } }),
    database.employee.count({ where: { organizationId: session.orgId, employmentStatus: "active" } }),
    database.task.count({ where: { employee: { organizationId: session.orgId }, status: "pending" } }),
    database.payment.count({ where: { employee: { organizationId: session.orgId }, status: "pending" } }),
    database.task.count({
      where: {
        employee: { organizationId: session.orgId },
        status: "completed",
        completedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
    }),
    database.task.count({
      where: {
        employee: { organizationId: session.orgId },
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
    }),
    database.employee.findMany({
      where: { organizationId: session.orgId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, legalFirstName: true, legalLastName: true, jobTitle: true, employmentStatus: true, createdAt: true },
    }),
    database.announcement.findMany({
      where: { organizationId: session.orgId, isActive: true },
      orderBy: { createdAt: "desc" },
      take: 3,
    }),
    database.payment.findMany({
      where: { employee: { organizationId: session.orgId } },
      select: { status: true, amount: true },
    }),
    database.employee.groupBy({
      by: ["department"],
      where: { organizationId: session.orgId, department: { not: null } },
      _count: { id: true },
    }),
  ]);

  const taskCompletionRate = totalTasks30d > 0 ? Math.round((completedTasks30d / totalTasks30d) * 100) : 0;

  const deptData = departmentStats.map((d) => ({
    name: d.department ?? "Unassigned",
    value: d._count.id,
  }));

  const paymentByStatus = new Map<string, { value: number; count: number }>();
  for (const p of paymentSummary) {
    const existing = paymentByStatus.get(p.status) ?? { value: 0, count: 0 };
    existing.value += Number(p.amount);
    existing.count += 1;
    paymentByStatus.set(p.status, existing);
  }
  const paymentData = Array.from(paymentByStatus.entries()).map(([name, data]) => ({
    name,
    value: data.value,
    count: data.count,
  }));

  return (
    <>
      <Header page="Client Portal" pages={["Dashboard"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        {/* Announcements Banner */}
        {announcements.length > 0 && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-blue-900 dark:text-blue-100">{announcements[0].title}</h3>
                <p className="text-sm text-blue-700 dark:text-blue-300">{announcements[0].content?.slice(0, 120)}</p>
              </div>
              <Link href="/client/announcements" className="text-sm text-blue-600 hover:underline dark:text-blue-400">View all</Link>
            </div>
          </div>
        )}

        {/* Stat Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-xl border bg-card p-6">
            <div className="text-sm font-medium text-muted-foreground">Total Contractors</div>
            <div className="text-3xl font-bold">{employeeCount}</div>
            <div className="mt-1 text-xs text-muted-foreground">{activeCount} active</div>
          </div>
          <div className="rounded-xl border bg-card p-6">
            <div className="text-sm font-medium text-muted-foreground">Pending Tasks</div>
            <div className="text-3xl font-bold">{pendingTasks}</div>
            <div className="mt-1 text-xs text-muted-foreground">{taskCompletionRate}% completion (30d)</div>
          </div>
          <div className="rounded-xl border bg-card p-6">
            <div className="text-sm font-medium text-muted-foreground">Pending Payments</div>
            <div className="text-3xl font-bold">{pendingPayments}</div>
          </div>
          <div className="rounded-xl border bg-card p-6">
            <div className="text-sm font-medium text-muted-foreground">Departments</div>
            <div className="text-3xl font-bold">{departmentStats.length}</div>
          </div>
        </div>

        {/* Charts */}
        <ClientDashboardCharts deptData={deptData} paymentData={paymentData} />

        {/* Recent Employees + Quick Actions */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border bg-card p-6">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Recent Contractors</h3>
              <Link href="/client/employees" className="text-sm text-primary hover:underline">View all</Link>
            </div>
            <div className="mt-4 space-y-3">
              {recentEmployees.map((emp) => (
                <Link key={emp.id} href={`/client/employees/${emp.id}`} className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50">
                  <div>
                    <div className="font-medium">{emp.legalFirstName} {emp.legalLastName}</div>
                    <div className="text-xs text-muted-foreground">{emp.jobTitle ?? "No title"}</div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${emp.employmentStatus === "active" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-500"}`}>
                    {emp.employmentStatus}
                  </span>
                </Link>
              ))}
              {recentEmployees.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">No employees yet.</p>
              )}
            </div>
          </div>

          <div className="rounded-xl border bg-card p-6">
            <h3 className="font-semibold">Quick Actions</h3>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Link href="/client/employees" className="rounded-lg border p-4 text-center transition-colors hover:bg-muted/50">
                <div className="text-2xl">👥</div>
                <div className="mt-1 text-sm font-medium">Contractors</div>
              </Link>
              <Link href="/client/tasks" className="rounded-lg border p-4 text-center transition-colors hover:bg-muted/50">
                <div className="text-2xl">📋</div>
                <div className="mt-1 text-sm font-medium">Tasks</div>
              </Link>
              <Link href="/client/payments" className="rounded-lg border p-4 text-center transition-colors hover:bg-muted/50">
                <div className="text-2xl">💰</div>
                <div className="mt-1 text-sm font-medium">Payments</div>
              </Link>
              <Link href="/client/timesheets" className="rounded-lg border p-4 text-center transition-colors hover:bg-muted/50">
                <div className="text-2xl">⏱️</div>
                <div className="mt-1 text-sm font-medium">Timesheets</div>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default ClientDashboard;
