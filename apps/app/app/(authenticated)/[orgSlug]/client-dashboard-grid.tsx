"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useCallback } from "react";
import { Users, ClipboardList, DollarSign, Building2, CheckCircle2, ArrowRight, Settings, Mail } from "lucide-react";
import { CustomizableDashboard, type WidgetDef } from "../components/customizable-dashboard";
import { WelcomeBanner } from "../components/welcome-banner";

//  Types 
type EmployeeRow = { id: string; legalFirstName: string; legalLastName: string; jobTitle: string | null; employmentStatus: string };
type TimesheetRow = { id: string; status: string; totalHours: unknown; employee: { legalFirstName: string; legalLastName: string }; period: { name: string } };
type DeptItem = { name: string; value: number };
type PayItem = { name: string; value: number; count: number };

export type ClientDashboardData = {
  orgRole: string;
  orgName: string;
  orgLogoUrl: string | null;
  employeeCount: number;
  activeCount: number;
  pendingTimesheets: number;
  pendingTasks: number;
  pendingPayments: number;
  departmentCount: number;
  deptData: DeptItem[];
  paymentData: PayItem[];
  recentEmployees: EmployeeRow[];
  recentTimesheets: TimesheetRow[];
};

//  Widget definitions 
const WIDGETS: WidgetDef[] = [
  { id: "stats", label: "Key Metrics", description: "Contractors, timesheets, payments, departments", size: "full" },
  { id: "getting_started", label: "Getting Started", description: "Quick setup checklist for new organizations", size: "full" },
  { id: "charts", label: "Charts", description: "Department and payment breakdowns", size: "full" },
  { id: "quick_actions", label: "Quick Actions", description: "Shortcuts to common tasks", size: "third" },
  { id: "recent_contractors", label: "Recent Contractors", description: "Latest contractor profiles", size: "third" },
  { id: "recent_timesheets", label: "Recent Timesheets", description: "Latest timesheet submissions", size: "third" },
];

const DEFAULT_ORDER = WIDGETS.map((w) => w.id);

// Lazy-load charts
import dynamic from "next/dynamic";
const ClientDashboardCharts = dynamic(() => import("./dashboard-charts").then((m) => m.ClientDashboardCharts), {
  loading: () => <div className="h-72 animate-pulse rounded-xl border bg-card" />,
});

//  Main component 
export function ClientDashboardGrid({ data }: { data: ClientDashboardData }) {
  const isNew = data.employeeCount === 0;

  const renderWidget = useCallback((id: string) => {
    switch (id) {
      case "stats": return <StatsWidget data={data} />;
      case "getting_started": return isNew ? <GettingStartedWidget data={data} /> : null;
      case "charts": return <ClientDashboardCharts deptData={data.deptData} paymentData={data.paymentData} />;
      case "quick_actions": return <QuickActionsWidget orgRole={data.orgRole} />;
      case "recent_contractors": return <RecentContractorsWidget employees={data.recentEmployees} />;
      case "recent_timesheets": return <RecentTimesheetsWidget submissions={data.recentTimesheets} />;
      default: return null;
    }
  }, [data, isNew]);

  return (
    <>
      <WelcomeBanner role={data.orgRole} orgName={data.orgName} orgLogoUrl={data.orgLogoUrl} />
      <CustomizableDashboard
        storageKey="client_dashboard_widgets"
        widgets={WIDGETS}
        defaultOrder={DEFAULT_ORDER}
        renderWidget={renderWidget}
      />
    </>
  );
}

/*  Stat Card  */
function StatCard({ label, value, sub, icon, accent }: { label: string; value: number | string; sub?: string; icon: React.ReactNode; accent: string }) {
  return (
    <div className="group relative overflow-hidden rounded-xl border bg-card p-5 transition-all hover:shadow-md hover:border-primary/20">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">{label}</div>
          <div className={`mt-1 text-3xl font-bold ${accent}`}>{value}</div>
          {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted/50">
          {icon}
        </div>
      </div>
    </div>
  );
}

/*  Stats Widget  */
function StatsWidget({ data }: { data: ClientDashboardData }) {
  return (
    <div className="grid gap-4 md:grid-cols-4">
      <StatCard
        label="Total Contractors"
        value={data.employeeCount}
        sub={`${data.activeCount} active`}
        icon={<Users className="h-4 w-4 text-blue-500" />}
        accent={data.employeeCount > 0 ? "text-blue-600 dark:text-blue-400" : ""}
      />
      <StatCard
        label="Pending Timesheets"
        value={data.pendingTimesheets}
        sub={data.pendingTimesheets > 0 ? "Awaiting review" : "All caught up"}
        icon={<ClipboardList className="h-4 w-4 text-amber-500" />}
        accent={data.pendingTimesheets > 0 ? "text-amber-600 dark:text-amber-400" : "text-green-600 dark:text-green-400"}
      />
      <StatCard
        label="Pending Payments"
        value={data.pendingPayments}
        sub={data.pendingPayments > 0 ? "Processing" : "No pending"}
        icon={<DollarSign className="h-4 w-4 text-orange-500" />}
        accent={data.pendingPayments > 0 ? "text-orange-600 dark:text-orange-400" : ""}
      />
      <StatCard
        label="Departments"
        value={data.departmentCount}
        sub={data.departmentCount > 0 ? `Across ${data.employeeCount} contractors` : "No departments yet"}
        icon={<Building2 className="h-4 w-4 text-muted-foreground" />}
        accent=""
      />
    </div>
  );
}

/*  Getting Started Widget  */
function GettingStartedWidget({ data }: { data: ClientDashboardData }) {
  const steps = [
    { done: true, label: "Account created", desc: "Your organization is set up and ready to go", icon: <Building2 className="h-4 w-4" /> },
    { done: data.employeeCount > 0, label: "Add contractors", desc: "Your RL team will onboard contractors for you", icon: <Users className="h-4 w-4" /> },
    { done: data.pendingTimesheets > 0 || data.recentTimesheets.length > 0, label: "Review timesheets", desc: "Approve weekly timesheets from your contractors", icon: <ClipboardList className="h-4 w-4" /> },
    { done: data.paymentData.some(p => p.value > 0), label: "Track payments", desc: "View payment history and invoices", icon: <DollarSign className="h-4 w-4" /> },
  ];

  const completed = steps.filter(s => s.done).length;
  const pct = Math.round((completed / steps.length) * 100);

  return (
    <div className="rounded-xl border bg-gradient-to-br from-card to-primary/[0.03] p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-base">Getting Started</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Complete these steps to get the most out of your dashboard</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-sm font-bold">{pct}%</div>
            <div className="text-[10px] text-muted-foreground">Complete</div>
          </div>
          <div className="relative h-10 w-10">
            <svg className="h-10 w-10" viewBox="0 0 40 40">
              <circle cx="20" cy="20" r="17" fill="none" stroke="currentColor" className="text-muted/30" strokeWidth="2.5" />
              <circle cx="20" cy="20" r="17" fill="none" stroke="currentColor" className="text-primary" strokeWidth="2.5"
                strokeDasharray={`${(pct / 100) * 106.8} 106.8`}
                strokeLinecap="round"
                transform="rotate(-90 20 20)"
                style={{ transition: "stroke-dasharray 0.5s ease" }}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold">{completed}/{steps.length}</span>
          </div>
        </div>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {steps.map((step, i) => (
          <div key={i} className={`flex items-center gap-3 rounded-lg border p-3 transition ${step.done ? "bg-muted/30 border-green-500/20" : "hover:bg-muted/50"}`}>
            <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${step.done ? "bg-green-500/20 text-green-500" : "bg-muted/50 text-muted-foreground"}`}>
              {step.done ? <CheckCircle2 className="h-4 w-4" /> : step.icon}
            </div>
            <div className="min-w-0">
              <div className={`text-sm font-medium ${step.done ? "line-through text-muted-foreground" : ""}`}>{step.label}</div>
              <div className="text-[11px] text-muted-foreground truncate">{step.desc}</div>
            </div>
          </div>
        ))}
      </div>
      {data.employeeCount === 0 && (
        <div className="mt-4 rounded-lg bg-primary/5 border border-primary/10 px-4 py-3 flex items-center justify-center gap-2">
          <Mail className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Your Remote Leverage account manager will set up your contractors. Need help?{" "}
            <a href="mailto:support@remoteleverage.com" className="text-primary font-medium hover:underline">Contact us</a>
          </p>
        </div>
      )}
    </div>
  );
}

/*  Quick Actions Widget  */
function QuickActionsWidget({ orgRole }: { orgRole: string }) {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const actions: { icon: React.ReactNode; label: string; href: string; desc: string }[] = [
    { icon: <Users className="h-5 w-5 text-blue-500" />, label: "Contractors", href: `/${orgSlug}/employees`, desc: "View your team" },
    { icon: <ClipboardList className="h-5 w-5 text-amber-500" />, label: "Timesheets", href: `/${orgSlug}/payroll`, desc: "Review hours" },
    { icon: <DollarSign className="h-5 w-5 text-green-500" />, label: "Payments", href: `/${orgSlug}/payments`, desc: "Payment history" },
    ...(orgRole === "admin" ? [
      { icon: <Settings className="h-5 w-5 text-muted-foreground" />, label: "Settings", href: `/${orgSlug}/settings`, desc: "Manage org" },
    ] : []),
  ];

  return (
    <div className="rounded-xl border bg-card p-5">
      <h3 className="font-semibold text-sm mb-3">Quick Actions</h3>
      <div className="grid grid-cols-2 gap-2">
        {actions.map((action) => (
          <Link key={action.label} href={action.href} className="group flex flex-col items-center rounded-lg border p-3 text-center transition-all hover:bg-muted/50 hover:border-primary/20 hover:shadow-sm">
            <div className="mb-1.5 group-hover:scale-110 transition-transform">{action.icon}</div>
            <div className="text-xs font-medium">{action.label}</div>
            <div className="text-[10px] text-muted-foreground">{action.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

/*  Recent Contractors  */
function RecentContractorsWidget({ employees }: { employees: EmployeeRow[] }) {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm">Recent Contractors</h3>
        {employees.length > 0 && <Link href={`/${orgSlug}/employees`} className="flex items-center gap-1 text-xs text-primary hover:underline">View all <ArrowRight className="h-3 w-3" /></Link>}
      </div>
      {employees.length > 0 ? (
        <div className="space-y-2">
          {employees.map((emp) => (
            <Link key={emp.id} href={`/${orgSlug}/employees/${emp.id}`} className="flex items-center justify-between rounded-lg border p-2.5 transition-colors hover:bg-muted/50">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 text-xs font-bold">
                  {emp.legalFirstName[0]}{emp.legalLastName[0]}
                </div>
                <div>
                  <div className="text-sm font-medium">{emp.legalFirstName} {emp.legalLastName}</div>
                  <div className="text-[11px] text-muted-foreground">{emp.jobTitle ?? "No title"}</div>
                </div>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${emp.employmentStatus === "active" ? "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300" : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"}`}>
                {emp.employmentStatus.replace(/_/g, " ")}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Users className="h-8 w-8 text-muted-foreground/20 mb-2" />
          <p className="text-sm font-medium text-muted-foreground">No contractors yet</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Contractors will appear here once your team is onboarded</p>
        </div>
      )}
    </div>
  );
}

/*  Recent Timesheets  */
function RecentTimesheetsWidget({ submissions }: { submissions: TimesheetRow[] }) {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm">Recent Timesheets</h3>
        {submissions.length > 0 && <Link href={`/${orgSlug}/payroll`} className="flex items-center gap-1 text-xs text-primary hover:underline">View all <ArrowRight className="h-3 w-3" /></Link>}
      </div>
      {submissions.length > 0 ? (
        <div className="space-y-2">
          {submissions.map((ts) => (
            <div key={ts.id} className="flex items-center justify-between rounded-lg border p-2.5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-amber-500/20 to-orange-500/20 text-xs font-bold">
                  {ts.employee.legalFirstName[0]}{ts.employee.legalLastName[0]}
                </div>
                <div>
                  <div className="text-sm font-medium">{ts.employee.legalFirstName} {ts.employee.legalLastName}</div>
                  <div className="text-[11px] text-muted-foreground">{ts.period.name} · {Number(ts.totalHours)}h</div>
                </div>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${
                ts.status === "approved" || ts.status === "auto_approved" ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                : ts.status === "submitted" ? "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
                : ts.status === "rejected" ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
                : "bg-muted text-muted-foreground"
              }`}>{ts.status === "submitted" ? "pending" : ts.status === "auto_approved" ? "approved" : ts.status}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <ClipboardList className="h-8 w-8 text-muted-foreground/20 mb-2" />
          <p className="text-sm font-medium text-muted-foreground">No timesheets yet</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Timesheets will appear here once contractors start logging hours</p>
        </div>
      )}
    </div>
  );
}
