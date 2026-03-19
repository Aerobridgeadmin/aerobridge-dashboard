"use client";

import { useParams } from "next/navigation";

import Link from "next/link";
import { useCallback } from "react";
import { shortDate } from "@/lib/hriq/format";
import { CustomizableDashboard, type WidgetDef } from "../components/customizable-dashboard";
import { WelcomeBanner } from "../components/welcome-banner";
import { RLDashboardCharts } from "./rl-dashboard-charts";
import { ActivityFeedCompact } from "../components/activity-feed";

//  Types 
type StatusItem = { name: string; value: number };
type OrgRow = { id: string; name: string; _count: { members: number; employees: number } };
type TimesheetRow = { id: string; status: string; totalHours: unknown; employee: { legalFirstName: string; legalLastName: string }; period: { name: string } };
type AuditRow = { id: string; action: string; objectType: string; timestamp: Date | string; actorDescription?: string | null; objectId?: string | null; newValue?: Record<string, unknown> | null };
type InfoApproval = { id: string; legalFirstName: string; legalLastName: string };

export type DashboardData = {
  orgCount: number;
  employeeCount: number;
  activeOnboarding: number;
  userCount: number;
  pendingTimesheets: number;
  unpaidAmount: number;
  pendingPayAmount: number;
  totalPaid: number;
  statusData: StatusItem[];
  recentOrgs: OrgRow[];
  recentSubmissions: TimesheetRow[];
  recentAudit: AuditRow[];
  pendingInfoApprovals: InfoApproval[];
};

//  Widget definitions 
const WIDGETS: WidgetDef[] = [
  { id: "stats", label: "Key Metrics", description: "Orgs, contractors, onboarding, users", size: "full" },
  { id: "payroll", label: "Payroll Overview", description: "Pending reviews, unpaid, processing totals", size: "full" },
  { id: "charts", label: "Contractor Distribution", description: "Status breakdown donut chart", size: "full" },
  { id: "recent_orgs", label: "Recent Organizations", description: "Newest client organizations", size: "third" },
  { id: "recent_timesheets", label: "Recent Timesheets", description: "Latest timesheet submissions", size: "third" },
  { id: "activity", label: "Activity Feed", description: "Recent audit log events", size: "third" },
  { id: "quick_actions", label: "Quick Actions", description: "Shortcuts to common tasks", size: "third" },
];

const DEFAULT_ORDER = WIDGETS.map((w) => w.id);

//  Main component 
export function RLDashboardGrid({ data }: { data: DashboardData }) {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const renderWidget = useCallback((id: string) => {
    switch (id) {
      case "stats": return <StatsWidget data={data} />;
      case "payroll": return <PayrollWidget data={data} />;
      case "charts": return <RLDashboardCharts statusData={data.statusData} />;
      case "recent_orgs": return <RecentOrgsWidget orgs={data.recentOrgs} />;
      case "recent_timesheets": return <RecentTimesheetsWidget submissions={data.recentSubmissions} />;
      case "activity": return <ActivityWidget audit={data.recentAudit} />;
      case "quick_actions": return <QuickActionsWidget />;
      default: return null;
    }
  }, [data]);

  return (
    <>
      <WelcomeBanner role="super_admin" orgName="Remote Leverage" />
      <CustomizableDashboard
        storageKey="rl_dashboard_widgets"
        widgets={WIDGETS}
        defaultOrder={DEFAULT_ORDER}
        renderWidget={renderWidget}
      />
    </>
  );
}

//  Widgets 

function StatsWidget({ data }: { data: DashboardData }) {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
      <div className="rounded-xl border bg-card p-5">
        <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Organizations</div>
        <div className="text-2xl font-bold mt-1">{data.orgCount}</div>
      </div>
      <div className="rounded-xl border bg-card p-5">
        <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Contractors</div>
        <div className="text-2xl font-bold mt-1">{data.employeeCount}</div>
      </div>
      <div className="rounded-xl border bg-card p-5">
        <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Active Onboarding</div>
        <div className="text-2xl font-bold mt-1">{data.activeOnboarding}</div>
        {data.pendingInfoApprovals.length > 0 && (
          <Link href={`/${orgSlug}/hiring`} className="mt-2 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 hover:underline">
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-white">{data.pendingInfoApprovals.length}</span>
            info approval{data.pendingInfoApprovals.length > 1 ? "s" : ""} pending
          </Link>
        )}
      </div>
      <div className="rounded-xl border bg-card p-5">
        <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Platform Users</div>
        <div className="text-2xl font-bold mt-1">{data.userCount}</div>
        <div className="text-[10px] text-muted-foreground mt-0.5">Login accounts</div>
      </div>
    </div>
  );
}

function PayrollWidget({ data }: { data: DashboardData }) {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  if (data.pendingTimesheets === 0 && data.unpaidAmount === 0 && data.pendingPayAmount === 0 && data.totalPaid === 0) return null;
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">Payroll Overview</h3>
        <Link href={`/${orgSlug}/payroll`} className="text-xs text-primary hover:underline">Open Payroll</Link>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {data.pendingTimesheets > 0 && (
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 p-3">
            <div className="text-xl font-bold text-amber-600">{data.pendingTimesheets}</div>
            <div className="text-[10px] text-amber-700 dark:text-amber-400 font-medium uppercase">Pending Review</div>
          </div>
        )}
        {data.unpaidAmount > 0 && (
          <div className="rounded-lg bg-red-50 dark:bg-red-950/30 p-3">
            <div className="text-xl font-bold text-red-600 tabular-nums">${Math.round(data.unpaidAmount).toLocaleString("en-US")}</div>
            <div className="text-[10px] text-red-700 dark:text-red-400 font-medium uppercase">Approved, Unpaid</div>
          </div>
        )}
        {data.pendingPayAmount > 0 && (
          <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 p-3">
            <div className="text-xl font-bold text-blue-600 tabular-nums">${Math.round(data.pendingPayAmount).toLocaleString("en-US")}</div>
            <div className="text-[10px] text-blue-700 dark:text-blue-400 font-medium uppercase">Processing</div>
          </div>
        )}
        <div className="rounded-lg bg-green-50 dark:bg-green-950/30 p-3">
          <div className="text-xl font-bold text-green-600 tabular-nums">${Math.round(data.totalPaid).toLocaleString("en-US")}</div>
          <div className="text-[10px] text-green-700 dark:text-green-400 font-medium uppercase">Total Paid</div>
        </div>
      </div>
    </div>
  );
}

function RecentOrgsWidget({ orgs }: { orgs: OrgRow[] }) {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm">Recent Orgs</h3>
        <Link href={`/${orgSlug}/organizations`} className="text-xs text-primary hover:underline">All</Link>
      </div>
      <div className="space-y-2">
        {orgs.map((org) => (
          <Link key={org.id} href={`/${orgSlug}/organizations/${org.id}`} className="flex items-center justify-between rounded-lg border p-2.5 hover:bg-muted/30 transition-colors">
            <div>
              <div className="text-sm font-medium">{org.name}</div>
              <div className="text-[10px] text-muted-foreground">{org._count.members} members · {org._count.employees} contractors</div>
            </div>
          </Link>
        ))}
        {orgs.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">No organizations yet.</p>}
      </div>
    </div>
  );
}

function RecentTimesheetsWidget({ submissions }: { submissions: TimesheetRow[] }) {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm">Recent Timesheets</h3>
        <Link href={`/${orgSlug}/payroll`} className="text-xs text-primary hover:underline">Payroll</Link>
      </div>
      <div className="space-y-2">
        {submissions.map((ts) => (
          <div key={ts.id} className="flex items-center justify-between rounded-lg border p-2.5">
            <div>
              <div className="text-sm font-medium">{ts.employee.legalFirstName} {ts.employee.legalLastName}</div>
              <div className="text-[10px] text-muted-foreground">{ts.period.name} · {Number(ts.totalHours)}h</div>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${
              ts.status === "approved" || ts.status === "auto_approved" ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
              : ts.status === "submitted" ? "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
              : ts.status === "rejected" ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
              : "bg-muted text-muted-foreground"
            }`}>{ts.status === "submitted" ? "pending" : ts.status === "auto_approved" ? "approved" : ts.status}</span>
          </div>
        ))}
        {submissions.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">No timesheets yet.</p>}
      </div>
    </div>
  );
}

function ActivityWidget({ audit }: { audit: AuditRow[] }) {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm">Activity</h3>
        <Link href={`/${orgSlug}/settings/security`} className="text-xs text-primary hover:underline">Audit log</Link>
      </div>
      <ActivityFeedCompact entries={audit} />
    </div>
  );
}

function QuickActionsWidget() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  return (
    <div className="rounded-xl border bg-card p-5">
      <h3 className="font-semibold text-sm mb-3">Quick Actions</h3>
      <div className="grid grid-cols-2 gap-2">
        <Link href={`/${orgSlug}/organizations/new`} className="rounded-lg border p-3 text-center text-sm hover:bg-muted/50 transition-colors">
          <div className="text-lg text-muted-foreground font-bold">NEW</div>
          <div className="mt-1 font-medium">Add Client</div>
        </Link>
        <Link href={`/${orgSlug}/hiring`} className="rounded-lg border p-3 text-center text-sm hover:bg-muted/50 transition-colors">
          <div className="text-lg text-muted-foreground font-bold">ORG</div>
          <div className="mt-1 font-medium">Hiring Pipeline</div>
        </Link>
        <Link href={`/${orgSlug}/settings`} className="rounded-lg border p-3 text-center text-sm hover:bg-muted/50 transition-colors">
          <div className="text-lg text-muted-foreground font-bold">SYS</div>
          <div className="mt-1 font-medium">Settings</div>
        </Link>
        <Link href={`/${orgSlug}/settings/users`} className="rounded-lg border p-3 text-center text-sm hover:bg-muted/50 transition-colors">
          <div className="text-lg text-muted-foreground font-bold">USR</div>
          <div className="mt-1 font-medium">All Users</div>
        </Link>
        <Link href={`/${orgSlug}/settings/security`} className="rounded-lg border p-3 text-center text-sm hover:bg-muted/50 transition-colors">
          <div className="mt-1 font-medium">Audit Log</div>
        </Link>
      </div>
    </div>
  );
}
