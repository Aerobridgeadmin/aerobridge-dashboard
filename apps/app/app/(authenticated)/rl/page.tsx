import { requireRole } from "@repo/auth/session";
import { database } from "@repo/database";
import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import Link from "next/link";
import { Header } from "../components/header";
import { RLDashboardCharts } from "./dashboard-charts";

export const metadata: Metadata = {
  title: "RL Admin Dashboard",
  description: "Remote Leverage super admin dashboard",
};

export const revalidate = 30;

const RLDashboard = async () => {
  const session = await requireRole("super_admin");

  // Find RL's home org to scope stats
  const ownMembership = await database.organizationMember.findFirst({
    where: { userId: session.userId, role: "super_admin" },
    select: { organizationId: true },
  });
  const rlOrgId = ownMembership?.organizationId ?? null;
  const rlFilter = rlOrgId ? { organizationId: rlOrgId } : {};
  const rlEmployeeFilter = rlOrgId ? { employee: { organizationId: rlOrgId } } : {};

  const [
    orgCount,
    employeeCount,
    activeOnboarding,
    employeesByStatus,
    recentOrgs,
    recentAudit,
    pendingPayments,
    userCount,
  ] = await Promise.all([
    // Client orgs only (exclude RL's own org)
    database.organization.count(rlOrgId ? { where: { id: { not: rlOrgId } } } : undefined),
    // Only RL's contractors
    database.employee.count({ where: rlFilter }),
    database.onboardingSession.count({ where: { status: "in_progress", ...( rlOrgId ? { employee: { organizationId: rlOrgId } } : {}) } }),
    database.employee.groupBy({
      by: ["employmentStatus"],
      where: rlFilter,
      _count: { id: true },
    }),
    // Client orgs (exclude RL)
    database.organization.findMany({
      where: rlOrgId ? { id: { not: rlOrgId } } : {},
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { _count: { select: { members: true, employees: true } } },
    }),
    database.auditLog.findMany({
      orderBy: { timestamp: "desc" },
      take: 8,
    }),
    database.payment.count({ where: { status: "pending", ...rlEmployeeFilter } }),
    database.appUser.count(),
  ]);

  const statusData = employeesByStatus.map((s) => ({
    name: s.employmentStatus.replace(/_/g, " "),
    value: s._count.id,
  }));

  return (
    <>
      <Header page="Dashboard" pages={["RL Internal"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        {/* Stat Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-xl border bg-card p-6">
            <div className="text-sm font-medium text-muted-foreground">Organizations</div>
            <div className="text-3xl font-bold">{orgCount}</div>
          </div>
          <div className="rounded-xl border bg-card p-6">
            <div className="text-sm font-medium text-muted-foreground">Total Contractors</div>
            <div className="text-3xl font-bold">{employeeCount}</div>
          </div>
          <div className="rounded-xl border bg-card p-6">
            <div className="text-sm font-medium text-muted-foreground">Active Onboarding</div>
            <div className="text-3xl font-bold">{activeOnboarding}</div>
          </div>
          <div className="rounded-xl border bg-card p-6">
            <div className="text-sm font-medium text-muted-foreground">Registered Users</div>
            <div className="text-3xl font-bold">{userCount}</div>
          </div>
        </div>

        {/* Charts Row */}
        <RLDashboardCharts statusData={statusData} />

        {/* Quick Actions + Recent Activity */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Recent Organizations */}
          <div className="rounded-xl border bg-card p-6">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Recent Organizations</h3>
              <Link href="/rl/organizations" className="text-sm text-primary hover:underline">View all</Link>
            </div>
            <div className="mt-4 space-y-3">
              {recentOrgs.map((org) => (
                <div key={org.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <div className="font-medium">{org.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {org._count.members} members · {org._count.employees} employees
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(org.createdAt).toLocaleDateString()}</span>
                </div>
              ))}
              {recentOrgs.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">No organizations yet.</p>
              )}
            </div>
          </div>

          {/* Activity Feed */}
          <div className="rounded-xl border bg-card p-6">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Recent Activity</h3>
              <Link href="/rl/settings/security" className="text-sm text-primary hover:underline">Audit log</Link>
            </div>
            <div className="mt-4 space-y-3">
              {recentAudit.map((log) => (
                <div key={log.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <div className="text-sm font-medium capitalize">{log.action.replace(/\./g, " → ")}</div>
                    <div className="text-xs text-muted-foreground">{log.objectType}</div>
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(log.timestamp).toLocaleString()}</span>
                </div>
              ))}
              {recentAudit.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">No activity yet.</p>
              )}
            </div>
          </div>
        </div>

      </div>
    </>
  );
};

export default RLDashboard;
