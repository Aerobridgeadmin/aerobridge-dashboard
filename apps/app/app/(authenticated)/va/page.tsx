import { requireSession } from "@repo/auth/session";
import { database } from "@repo/database";
import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "../components/header";

export const metadata: Metadata = {
  title: "My Dashboard",
  description: "Virtual assistant self-service dashboard",
};

const VADashboard = async () => {
  const session = await requireSession();

  const employee = await database.employee.findFirst({
    where: { linkedUserId: session.userId },
    include: {
      tasks: { orderBy: { dueDate: "asc" } },
      onboardingSessions: {
        where: { status: { in: ["not_started", "in_progress"] } },
        include: { steps: true },
        take: 1,
      },
      payments: { orderBy: { createdAt: "desc" }, take: 5 },
      documents: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });

  if (!employee) {
    return (
      <>
        <Header page="My Dashboard" pages={["Self Service"]} />
        <div className="flex flex-1 items-center justify-center p-4">
          <div className="text-center">
            <img src="/logo.png" alt="Remote Leverage" className="mx-auto mb-4 h-16 w-16" />
            <h2 className="text-lg font-semibold">No Employee Profile Found</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Your account is not yet linked to an employee record. Please contact your administrator.
            </p>
          </div>
        </div>
      </>
    );
  }

  const openTasks = employee.tasks.filter((t) => t.status === "pending" || t.status === "in_progress");
  const completedTasks = employee.tasks.filter((t) => t.status === "completed");
  const taskCompletionRate = employee.tasks.length > 0 ? Math.round((completedTasks.length / employee.tasks.length) * 100) : 0;

  const onboarding = employee.onboardingSessions[0];
  const onboardingProgress = onboarding
    ? Math.round((onboarding.steps.filter((s) => s.status === "completed").length / Math.max(onboarding.steps.length, 1)) * 100)
    : null;

  const totalPaid = employee.payments.filter((p) => p.status === "completed").reduce((s, p) => s + Number(p.amount), 0);

  return (
    <>
      <Header page="My Dashboard" pages={["Self Service"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        {/* Welcome Card */}
        <div className="rounded-xl border bg-card p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
              {(employee.preferredName ?? employee.legalFirstName).charAt(0)}
            </div>
            <div>
              <h2 className="text-xl font-semibold">
                Welcome back, {employee.preferredName ?? employee.legalFirstName}
              </h2>
              <p className="text-sm text-muted-foreground">
                {employee.jobTitle ?? employee.employmentType} · {employee.department ?? "No department"}
              </p>
            </div>
          </div>
        </div>

        {/* Onboarding Banner */}
        {onboarding && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-blue-900 dark:text-blue-100">Onboarding In Progress</h3>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  {onboardingProgress}% complete — {onboarding.steps.filter((s) => s.status !== "completed").length} steps remaining
                </p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-full border-4 border-blue-300 text-sm font-bold text-blue-700 dark:border-blue-700 dark:text-blue-300">
                {onboardingProgress}%
              </div>
            </div>
          </div>
        )}

        {/* Stats Row */}
        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-xl border bg-card p-4 text-center">
            <div className="text-2xl font-bold">{openTasks.length}</div>
            <div className="text-xs text-muted-foreground">Open Tasks</div>
          </div>
          <div className="rounded-xl border bg-card p-4 text-center">
            <div className="text-2xl font-bold">{taskCompletionRate}%</div>
            <div className="text-xs text-muted-foreground">Task Completion</div>
          </div>
          <div className="rounded-xl border bg-card p-4 text-center">
            <div className="text-2xl font-bold capitalize">{employee.employmentStatus.replace(/_/g, " ")}</div>
            <div className="text-xs text-muted-foreground">Status</div>
          </div>
          <div className="rounded-xl border bg-card p-4 text-center">
            <div className="text-2xl font-bold">${totalPaid.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Total Paid</div>
          </div>
        </div>

        {/* Tasks + Payments */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Open Tasks */}
          <div className="rounded-xl border bg-card p-6">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">My Tasks</h3>
              <Link href="/va/tasks" className="text-sm text-primary hover:underline">View all</Link>
            </div>
            <div className="mt-4 space-y-2">
              {openTasks.slice(0, 5).map((task) => (
                <div key={task.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <div className="text-sm font-medium">{task.title}</div>
                    {task.dueDate && (
                      <div className="text-xs text-muted-foreground">Due: {new Date(task.dueDate).toLocaleDateString()}</div>
                    )}
                  </div>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize">{task.status.replace(/_/g, " ")}</span>
                </div>
              ))}
              {openTasks.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">No open tasks. You&apos;re all caught up!</p>
              )}
            </div>
          </div>

          {/* Recent Payments */}
          <div className="rounded-xl border bg-card p-6">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Recent Payments</h3>
              <Link href="/va/payments" className="text-sm text-primary hover:underline">View all</Link>
            </div>
            <div className="mt-4 space-y-2">
              {employee.payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <div className="text-sm font-medium">{p.amount} {p.currency}</div>
                    <div className="text-xs text-muted-foreground capitalize">{p.paymentType}</div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${p.status === "completed" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}`}>
                    {p.status}
                  </span>
                </div>
              ))}
              {employee.payments.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">No payment records yet.</p>
              )}
            </div>
          </div>
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Link href="/va/tasks" className="rounded-xl border bg-card p-4 text-center transition-colors hover:bg-muted/50">
            <div className="text-xl">📋</div>
            <div className="mt-1 text-sm font-medium">My Tasks</div>
          </Link>
          <Link href="/va/timesheets" className="rounded-xl border bg-card p-4 text-center transition-colors hover:bg-muted/50">
            <div className="text-xl">⏱️</div>
            <div className="mt-1 text-sm font-medium">Timesheets</div>
          </Link>
          <Link href="/va/documents" className="rounded-xl border bg-card p-4 text-center transition-colors hover:bg-muted/50">
            <div className="text-xl">📄</div>
            <div className="mt-1 text-sm font-medium">Documents</div>
          </Link>
          <Link href="/va/announcements" className="rounded-xl border bg-card p-4 text-center transition-colors hover:bg-muted/50">
            <div className="text-xl">📢</div>
            <div className="mt-1 text-sm font-medium">Announcements</div>
          </Link>
        </div>
      </div>
    </>
  );
};

export default VADashboard;
