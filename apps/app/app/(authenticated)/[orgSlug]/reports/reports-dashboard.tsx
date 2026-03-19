"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { hours as fmtHours } from "@/lib/hriq/format";
import { CustomSelect } from "@/app/(authenticated)/components/custom-select";
import {
  Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis, Legend, CartesianGrid, Area, AreaChart,
} from "recharts";
import {
  DownloadIcon, FilterIcon, CalendarIcon, BuildingIcon,
  UsersIcon, ClockIcon, DollarSignIcon, ClipboardListIcon,
  FileTextIcon, TrendingUpIcon, CheckCircleIcon, XCircleIcon,
  AlertCircleIcon, ArrowUpIcon, ArrowDownIcon, ShieldCheckIcon,
  HeartPulseIcon,
} from "lucide-react";
import { OffboardingAuditTab } from "./offboarding-audit";

//  Types 

type Org = { id: string; name: string; slug: string };
type Employee = {
  id: string; organizationId: string | null; legalFirstName: string; legalLastName: string;
  employmentStatus: string; onboardingStatus: string; employmentType: string;
  department: string | null; jobTitle: string | null; country: string | null;
  currency: string; hourlyRate: unknown; startDate: string | null;
  endDate: string | null; createdAt: string; linkedUserId: string | null;
  organization: { name: string } | null;
};
type OnboardingSession = {
  id: string; status: string; overallProgress: number;
  startedAt: string | null; completedAt: string | null; createdAt: string;
  employee: { id: string; legalFirstName: string; legalLastName: string; organizationId: string | null; organization: { name: string } | null };
  _count: { steps: number };
};
type Payment = {
  id: string; amount: number; currency: string; status: string;
  paymentDate: string | null; periodStart: string | null; periodEnd: string | null;
  hoursWorked: number | null; createdAt: string;
  employee: { id: string; legalFirstName: string; legalLastName: string; organizationId: string | null; department?: string | null; organization: { name: string } | null };
};
type TimesheetSub = {
  id: string; status: string; totalHours: number;
  submittedAt: string | null; approvedAt: string | null; createdAt: string;
  employee: { id: string; legalFirstName: string; legalLastName: string; organizationId: string | null; department?: string | null; organization: { name: string } | null };
  period: { name: string; startDate: string; endDate: string } | null;
};
type Task = {
  id: string; status: string; dueDate: string | null;
  completedAt: string | null; createdAt: string;
  employee: { organizationId: string | null; organization: { name: string } | null };
};
type Document = {
  id: string; documentType: string | null; status: string | null; createdAt: string;
  employee: { organizationId: string | null; organization: { name: string } | null };
};
type AuditLog = {
  id: string; action: string; objectType: string; timestamp: string;
  actorDescription: string | null; organizationId: string | null;
};

type Props = {
  isSuperAdmin: boolean;
  organizations: Org[];
  employees: Employee[];
  onboardingSessions: OnboardingSession[];
  payments: Payment[];
  timesheetSubmissions: TimesheetSub[];
  tasks: Task[];
  documents: Document[];
  auditLogs: AuditLog[];
};

//  Colors 

const COLORS = ["#f97316", "#a855f7", "#3b82f6", "#22c55e", "#eab308", "#ef4444", "#06b6d4", "#ec4899", "#8b5cf6", "#14b8a6"];
const STATUS_COLORS: Record<string, string> = {
  active: "#22c55e", pre_hire: "#3b82f6", onboarding: "#f97316",
  terminated: "#ef4444", on_leave: "#eab308", completed: "#22c55e",
  in_progress: "#f97316", not_started: "#6b7280", pending: "#eab308",
  approved: "#22c55e", rejected: "#ef4444", submitted: "#3b82f6",
  processing: "#a855f7", paid: "#22c55e", draft: "#6b7280",
};

//  Helpers 

function fmtCurrency(n: number, cur = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(n);
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d as any).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtLabel(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getMonthKey(d: string) {
  const dt = new Date(d as any);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthLabel(key: string) {
  const [y, m] = key.split("-");
  const dt = new Date(Number(y as any), Number(m) - 1);
  return dt.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function downloadCSV(filename: string, headers: string[], rows: string[][]) {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const csv = [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

//  Main Component 

const TABS = [
  { id: "overview", label: "Overview", icon: TrendingUpIcon },
  { id: "labor_cost", label: "Labor Cost", icon: DollarSignIcon },
  { id: "onboarding", label: "Onboarding", icon: UsersIcon },
  { id: "contractors", label: "Contractors", icon: UsersIcon },
  { id: "payments", label: "Payments", icon: DollarSignIcon },
  { id: "timesheets", label: "Timesheets", icon: ClockIcon },
  { id: "data_health", label: "Data Health", icon: HeartPulseIcon },
  { id: "offboarding", label: "Offboarding Audit", icon: ShieldCheckIcon },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function ReportsDashboard(props: Props) {
  const { isSuperAdmin, organizations } = props;
  const searchParams = useSearchParams();
  const initialTab = TABS.some((t) => t.id === searchParams.get("tab")) ? (searchParams.get("tab") as TabId) : "overview";
  const [tab, setTab] = useState<TabId>(initialTab);
  const [orgFilter, setOrgFilter] = useState<string>("all");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  // Unique departments
  const allDepartments = useMemo(() => {
    const depts = new Set<string>();
    for (const e of props.employees) {
      if (e.department) depts.add(e.department);
    }
    return [...depts].sort();
  }, [props.employees]);

  //  Filtered data 

  const filterByOrg = useCallback(
    <T extends { employee?: { organizationId?: string | null } | null; organizationId?: string | null }>(items: T[]): T[] => {
      if (orgFilter === "all") return items;
      return items.filter((i) => {
        const oid = (i as any).employee?.organizationId ?? (i as any).organizationId;
        return oid === orgFilter;
      });
    },
    [orgFilter]
  );

  const filterByDate = useCallback(
    <T extends { createdAt?: string }>(items: T[]): T[] => {
      let result = items;
      if (dateFrom) result = result.filter((i) => (i.createdAt ?? "") >= dateFrom);
      if (dateTo) result = result.filter((i) => (i.createdAt ?? "") <= dateTo + "T23:59:59");
      return result;
    },
    [dateFrom, dateTo]
  );

  const filterByDept = useCallback(
    <T extends { department?: string | null; employee?: { department?: string | null } | null }>(items: T[]): T[] => {
      if (deptFilter === "all") return items;
      return items.filter((i) => {
        const dept = (i as any).department ?? (i as any).employee?.department;
        return dept === deptFilter;
      });
    },
    [deptFilter]
  );

  const employees = useMemo(() => filterByDept(filterByDate(filterByOrg(props.employees))), [props.employees, filterByOrg, filterByDate, filterByDept]);
  const onboardings = useMemo(() => filterByDate(filterByOrg(props.onboardingSessions)), [props.onboardingSessions, filterByOrg, filterByDate]);
  const payments = useMemo(() => filterByDept(filterByDate(filterByOrg(props.payments))), [props.payments, filterByOrg, filterByDate, filterByDept]);
  const timesheets = useMemo(() => filterByDept(filterByDate(filterByOrg(props.timesheetSubmissions))), [props.timesheetSubmissions, filterByOrg, filterByDate, filterByDept]);
  const tasks = useMemo(() => filterByDate(filterByOrg(props.tasks)), [props.tasks, filterByOrg, filterByDate]);

  return (
    <div className="space-y-4">
      {/*  Filters  */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3">
        <FilterIcon className="h-4 w-4 text-muted-foreground" />
        {isSuperAdmin && (
          <CustomSelect
            value={orgFilter}
            onValueChange={setOrgFilter}
            triggerClassName="h-9 min-w-[170px]"
            placeholder="All Organizations"
            options={[
              { value: "all", label: "All Organizations" },
              ...organizations.map((o) => ({ value: o.id, label: o.name })),
            ]}
          />
        )}
        {allDepartments.length > 1 && (
          <CustomSelect
            value={deptFilter}
            onValueChange={setDeptFilter}
            triggerClassName="h-9 min-w-[160px]"
            placeholder="All Departments"
            options={[
              { value: "all", label: "All Departments" },
              ...allDepartments.map((d) => ({ value: d, label: d })),
            ]}
          />
        )}
        <div className="flex items-center gap-1.5">
          <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm" />
          <span className="text-xs text-muted-foreground">to</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm" />
        </div>
        {(orgFilter !== "all" || deptFilter !== "all" || dateFrom || dateTo) && (
          <button onClick={() => { setOrgFilter("all"); setDeptFilter("all"); setDateFrom(""); setDateTo(""); }}
            className="h-9 rounded-md border px-3 text-xs hover:bg-muted">Clear Filters</button>
        )}
      </div>

      {/*  Tabs  */}
      <div className="flex gap-1 overflow-x-auto rounded-xl border bg-card p-1">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}>
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/*  Content  */}
      {tab === "overview" && <OverviewTab employees={employees} onboardings={onboardings} payments={payments} timesheets={timesheets} tasks={tasks} isSuperAdmin={isSuperAdmin} />}
      {tab === "labor_cost" && <LaborCostTab employees={employees} payments={payments} timesheets={timesheets} />}
      {tab === "onboarding" && <OnboardingTab onboardings={onboardings} employees={employees} />}
      {tab === "contractors" && <ContractorsTab employees={employees} />}
      {tab === "payments" && <PaymentsTab payments={payments} />}
      {tab === "timesheets" && <TimesheetsTab timesheets={timesheets} />}
      {tab === "data_health" && <DataHealthTab />}
      {tab === "offboarding" && <OffboardingAuditTab />}
    </div>
  );
}

//  KPI Card 

function KPI({ label, value, sub, trend, icon: Icon }: {
  label: string; value: string | number; sub?: string; trend?: { value: number; label: string }; icon: any;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      {trend && (
        <div className={`mt-1 flex items-center gap-1 text-xs ${trend.value >= 0 ? "text-green-500" : "text-red-500"}`}>
          {trend.value >= 0 ? <ArrowUpIcon className="h-3 w-3" /> : <ArrowDownIcon className="h-3 w-3" />}
          {Math.abs(trend.value)}% {trend.label}
        </div>
      )}
    </div>
  );
}

//  Chart Cards 

function ChartCard({ title, children, onExport }: { title: string; children?: React.ReactNode; onExport?: () => void }) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        {onExport && (
          <button onClick={onExport} className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted">
            <DownloadIcon className="h-3 w-3" /> Export
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function PieChartWidget({ data }: { data: { name: string; value: number }[] }) {
  if (data.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">No data</p>;
  return (
    <div className="h-[250px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value" nameKey="name"
            label={({ name, value }) => `${name}: ${value}`}>
            {data.map((d, i) => <Cell key={i} fill={STATUS_COLORS[d.name.toLowerCase().replace(/ /g, "_")] ?? COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function BarChartWidget({ data, layout = "vertical" }: { data: { name: string; value: number }[]; layout?: "vertical" | "horizontal" }) {
  if (data.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">No data</p>;
  return (
    <div className="h-[250px]">
      <ResponsiveContainer width="100%" height="100%">
        {layout === "vertical" ? (
          <BarChart data={data} layout="vertical" margin={{ left: 10 }}>
            <XAxis type="number" />
            <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {data.map((d, i) => <Cell key={i} fill={STATUS_COLORS[d.name.toLowerCase().replace(/ /g, "_")] ?? COLORS[i % COLORS.length]} />)}
            </Bar>
          </BarChart>
        ) : (
          <BarChart data={data} margin={{ bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-45} textAnchor="end" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="value" fill="#f97316" radius={[4, 4, 0, 0]} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

//  Table Component 

function DataTable({ headers, rows, maxRows = 20 }: { headers: string[]; rows: string[][]; maxRows?: number }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? rows : rows.slice(0, maxRows);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            {headers.map((h) => <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {visible.map((row, i) => (
            <tr key={i} className="border-b last:border-0 hover:bg-muted/50">
              {row.map((cell, j) => <td key={j} className="px-3 py-2 text-sm">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > maxRows && !showAll && (
        <button onClick={() => setShowAll(true)} className="mt-2 w-full py-2 text-center text-xs text-primary hover:underline">
          Show all {rows.length} rows
        </button>
      )}
    </div>
  );
}

// 
// OVERVIEW TAB
// 

function OverviewTab({ employees, onboardings, payments, timesheets, tasks, isSuperAdmin }: {
  employees: Employee[]; onboardings: OnboardingSession[]; payments: Payment[];
  timesheets: TimesheetSub[]; tasks: Task[]; isSuperAdmin: boolean;
}) {
  const active = employees.filter((e) => e.employmentStatus === "active").length;
  const totalPaid = payments.filter((p) => p.status === "completed").reduce((s, p) => s + Number(p.amount), 0);
  const completedOnboardings = onboardings.filter((o) => o.status === "completed").length;
  const pendingTimesheets = timesheets.filter((t) => t.status === "submitted").length;
  const totalHours = timesheets.filter((t) => t.status === "approved" || t.status === "auto_approved").reduce((s, t) => s + Number(t.totalHours), 0);

  // Onboardings by month (trend)
  const obByMonth = new Map<string, number>();
  for (const o of onboardings) {
    const key = getMonthKey(o.createdAt);
    obByMonth.set(key, (obByMonth.get(key) ?? 0) + 1);
  }
  const obTrend = Array.from(obByMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([key, count]) => ({ name: getMonthLabel(key), value: count }));

  // Hires by month
  const hiresByMonth = new Map<string, number>();
  for (const e of employees) {
    const key = getMonthKey(e.createdAt);
    hiresByMonth.set(key, (hiresByMonth.get(key) ?? 0) + 1);
  }
  const hiresTrend = Array.from(hiresByMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([key, count]) => ({ name: getMonthLabel(key), value: count }));

  // Payments by month
  const payByMonth = new Map<string, number>();
  for (const p of payments) {
    if (p.status !== "completed") continue;
    const key = getMonthKey(p.createdAt);
    payByMonth.set(key, (payByMonth.get(key) ?? 0) + Number(p.amount));
  }
  const payTrend = Array.from(payByMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([key, val]) => ({ name: getMonthLabel(key), value: Math.round(val) }));

  // By org breakdown
  const byOrg = new Map<string, { name: string; employees: number; onboardings: number; payments: number }>();
  for (const e of employees) {
    const name = e.organization?.name ?? "Unknown";
    const oid = e.organizationId ?? "?";
    if (!byOrg.has(oid)) byOrg.set(oid, { name, employees: 0, onboardings: 0, payments: 0 });
    byOrg.get(oid)!.employees++;
  }
  for (const o of onboardings) {
    const oid = o.employee.organizationId ?? "?";
    if (byOrg.has(oid)) byOrg.get(oid)!.onboardings++;
  }
  for (const p of payments) {
    const oid = p.employee.organizationId ?? "?";
    if (byOrg.has(oid)) byOrg.get(oid)!.payments += Number(p.amount);
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KPI label="Total Contractors" value={employees.length} sub={`${active} active`} icon={UsersIcon} />
        <KPI label="Onboardings" value={onboardings.length} sub={`${completedOnboardings} completed`} icon={CheckCircleIcon} />
        <KPI label="Total Paid" value={fmtCurrency(totalPaid)} sub={`${payments.filter((p) => p.status === "completed").length} payments`} icon={DollarSignIcon} />
        <KPI label="Approved Hours" value={totalHours.toLocaleString()} sub={`${pendingTimesheets} pending approval`} icon={ClockIcon} />
        <KPI label="Tasks" value={tasks.length} sub={`${tasks.filter((t) => t.status === "completed").length} completed`} icon={ClipboardListIcon} />
      </div>

      {/* Trend Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <ChartCard title="New Hires by Month">
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={hiresTrend}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip />
                <Area type="monotone" dataKey="value" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
        <ChartCard title="Onboardings by Month">
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={obTrend}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip />
                <Area type="monotone" dataKey="value" stroke="#f97316" fill="#f97316" fillOpacity={0.15} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      {payTrend.length > 0 && (
        <ChartCard title="Monthly Payments (Completed)">
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={payTrend}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => fmtCurrency(v)} />
                <Bar dataKey="value" fill="#22c55e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      )}

      {/* Org Breakdown Table (super_admin only) */}
      {isSuperAdmin && byOrg.size > 1 && (
        <ChartCard title="By Organization"
          onExport={() => {
            const headers = ["Organization", "Contractors", "Onboardings", "Total Payments"];
            const rows = Array.from(byOrg.values()).map((o) => [o.name, String(o.employees), String(o.onboardings), fmtCurrency(o.payments)]);
            downloadCSV("org-breakdown.csv", headers, rows);
          }}>
          <DataTable
            headers={["Organization", "Contractors", "Onboardings", "Total Payments"]}
            rows={Array.from(byOrg.values())
              .sort((a, b) => b.employees - a.employees)
              .map((o) => [o.name, String(o.employees), String(o.onboardings), fmtCurrency(o.payments)])}
          />
        </ChartCard>
      )}
    </div>
  );
}

// 
// LABOR COST TAB
// 

function LaborCostTab({ employees, payments, timesheets }: { employees: Employee[]; payments: Payment[]; timesheets: TimesheetSub[] }) {
  const activeEmps = employees.filter((e) => e.employmentStatus === "active");

  // Build a lookup: employee id → hourly rate
  const empRateMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of activeEmps) m.set(e.id, Number(e.hourlyRate ?? 0));
    return m;
  }, [activeEmps]);

  // Build department → cost data from approved timesheets (actual labor cost)
  const deptData = useMemo(() => {
    const map = new Map<string, { headcount: number; laborCost: number; totalPaid: number; approvedHours: number; employeeIds: Set<string> }>();

    // Initialize departments from active employees
    for (const e of activeEmps) {
      const dept = e.department || "Unassigned";
      const entry = map.get(dept) ?? { headcount: 0, laborCost: 0, totalPaid: 0, approvedHours: 0, employeeIds: new Set() };
      entry.headcount++;
      map.set(dept, entry);
    }

    // Sum approved timesheet hours × rate per department (actual labor cost)
    for (const ts of timesheets) {
      if (ts.status !== "approved" && ts.status !== "auto_approved") continue;
      const empId = ts.employee.id;
      const emp = activeEmps.find((e) => e.id === empId);
      const dept = emp?.department || ts.employee.department || "Unassigned";
      const entry = map.get(dept) ?? { headcount: 0, laborCost: 0, totalPaid: 0, approvedHours: 0, employeeIds: new Set() };
      const hours = Number(ts.totalHours ?? 0);
      const rate = empRateMap.get(empId) ?? 0;
      entry.approvedHours += hours;
      entry.laborCost += hours * rate;
      entry.employeeIds.add(empId);
      map.set(dept, entry);
    }

    // Sum completed payments by department
    for (const p of payments) {
      if (p.status !== "completed") continue;
      const emp = activeEmps.find((e) => e.id === p.employee.id);
      const dept = emp?.department || p.employee.department || "Unassigned";
      const entry = map.get(dept) ?? { headcount: 0, laborCost: 0, totalPaid: 0, approvedHours: 0, employeeIds: new Set() };
      entry.totalPaid += Number(p.amount ?? 0);
      map.set(dept, entry);
    }

    return [...map.entries()]
      .map(([dept, data]) => ({
        department: dept,
        headcount: data.headcount,
        laborCost: data.laborCost,
        totalPaid: data.totalPaid,
        approvedHours: data.approvedHours,
        avgRate: data.approvedHours > 0 ? data.laborCost / data.approvedHours : 0,
      }))
      .sort((a, b) => b.laborCost - a.laborCost);
  }, [activeEmps, payments, timesheets, empRateMap]);

  const totalHeadcount = deptData.reduce((s, d) => s + d.headcount, 0);
  const totalLaborCost = deptData.reduce((s, d) => s + d.laborCost, 0);
  const totalPaid = deptData.reduce((s, d) => s + d.totalPaid, 0);
  const totalHours = deptData.reduce((s, d) => s + d.approvedHours, 0);

  const COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#14b8a6", "#f97316"];

  const chartData = deptData
    .filter((d) => d.laborCost > 0)
    .map((d, i) => ({
      name: d.department,
      value: Math.round(d.laborCost),
      fill: COLORS[i % COLORS.length],
    }));

  const fmt = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground">Total Headcount</div>
          <div className="text-2xl font-bold mt-1">{totalHeadcount}</div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground">Labor Cost</div>
          <div className="text-2xl font-bold mt-1">{fmt(totalLaborCost)}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Approved hours × rate</div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground">Approved Hours</div>
          <div className="text-2xl font-bold mt-1">{totalHours.toLocaleString(undefined, { maximumFractionDigits: 1 })}</div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground">Total Paid</div>
          <div className="text-2xl font-bold mt-1">{fmt(totalPaid)}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Completed payments</div>
        </div>
      </div>
      {totalLaborCost > 0 && totalPaid > 0 && Math.abs(totalLaborCost - totalPaid) > 1 && (
        <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 px-4 py-2.5 text-xs text-blue-800 dark:text-blue-300">
          <strong>Why do these differ?</strong> Labor Cost = approved timesheet hours × hourly rate. Total Paid = actual completed payments, which may include bonuses, commissions, adjustments, or exclude contractors still awaiting payment.
        </div>
      )}

      {/* Chart + table side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie chart */}
        <div className="rounded-xl border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">Labor Cost by Department</h3>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(val: number) => fmt(val)} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-16 text-center text-sm text-muted-foreground">No approved timesheets yet for this period</p>
          )}
        </div>

        {/* Bar chart */}
        <div className="rounded-xl border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">Headcount by Department</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={deptData} layout="vertical" margin={{ left: 100 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
              <XAxis type="number" />
              <YAxis dataKey="department" type="category" tick={{ fontSize: 12 }} width={95} />
              <Tooltip />
              <Bar dataKey="headcount" fill="#6366f1" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Department breakdown table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/10">
          <h3 className="text-sm font-semibold">Department Breakdown</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-4 py-2 font-medium">Department</th>
                <th className="px-4 py-2 font-medium text-right">Headcount</th>
                <th className="px-4 py-2 font-medium text-right">Approved Hours</th>
                <th className="px-4 py-2 font-medium text-right">Avg $/hr</th>
                <th className="px-4 py-2 font-medium text-right">Labor Cost</th>
                <th className="px-4 py-2 font-medium text-right">Total Paid</th>
                <th className="px-4 py-2 font-medium text-right">% of Total</th>
              </tr>
            </thead>
            <tbody>
              {deptData.map((d, i) => (
                <tr key={d.department} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2.5 font-medium flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    {d.department}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{d.headcount}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{d.approvedHours > 0 ? d.approvedHours.toLocaleString(undefined, { maximumFractionDigits: 1 }) : "0"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{d.avgRate > 0 ? `$${d.avgRate.toFixed(2)}` : "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium">{d.laborCost > 0 ? fmt(d.laborCost) : "$0"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{d.totalPaid > 0 ? fmt(d.totalPaid) : "$0"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{totalLaborCost > 0 ? `${((d.laborCost / totalLaborCost) * 100).toFixed(1)}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/20 font-semibold">
                <td className="px-4 py-2.5">Total</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{totalHeadcount}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{totalHours.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{totalHours > 0 ? `$${(totalLaborCost / totalHours).toFixed(2)}` : "—"}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmt(totalLaborCost)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmt(totalPaid)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{totalLaborCost > 0 ? "100%" : "—"}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Export buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            const csvHeaders = ["Department", "Headcount", "Approved Hours", "Avg $/hr", "Labor Cost", "Total Paid", "% of Total"];
            const csvRows: string[][] = [];
            for (const d of deptData) {
              csvRows.push([d.department, String(d.headcount), d.approvedHours.toFixed(2), d.avgRate.toFixed(2), d.laborCost.toFixed(2), d.totalPaid.toFixed(2), totalLaborCost > 0 ? ((d.laborCost / totalLaborCost) * 100).toFixed(1) + "%" : "0%"]);
            }
            csvRows.push(["Total", String(totalHeadcount), totalHours.toFixed(2), totalHours > 0 ? (totalLaborCost / totalHours).toFixed(2) : "0", totalLaborCost.toFixed(2), totalPaid.toFixed(2), "100%"]);
            downloadCSV("labor-cost-by-department.csv", csvHeaders, csvRows);
          }}
          className="inline-flex items-center gap-2 h-9 rounded-md border px-4 text-sm hover:bg-muted"
        >
          <DownloadIcon className="h-4 w-4" /> Export CSV
        </button>
        <button
          type="button"
          onClick={async () => {
            const { generateLaborCostPDF, downloadPDFBlob } = await import("@/lib/hriq/pdf-reports");
            const now = new Date();
            const pdfBytes = await generateLaborCostPDF({
              title: "Labor Cost Report",
              dateRange: undefined,
              generatedAt: now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }),
              summary: [
                { label: "Headcount", value: String(totalHeadcount) },
                { label: "Labor Cost", value: `$${totalLaborCost.toLocaleString("en-US", { maximumFractionDigits: 0 })}` },
                { label: "Approved Hours", value: totalHours.toLocaleString(undefined, { maximumFractionDigits: 1 }) },
                { label: "Total Paid", value: `$${totalPaid.toLocaleString("en-US", { maximumFractionDigits: 0 })}` },
              ],
              departments: deptData.map((d) => ({
                ...d,
                pctOfTotal: totalLaborCost > 0 ? `${((d.laborCost / totalLaborCost) * 100).toFixed(1)}%` : "—",
              })),
              totals: {
                headcount: totalHeadcount,
                hours: totalHours,
                avgRate: totalHours > 0 ? `$${(totalLaborCost / totalHours).toFixed(2)}` : "—",
                laborCost: `$${totalLaborCost.toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
                totalPaid: `$${totalPaid.toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
              },
            });
            downloadPDFBlob(pdfBytes, "labor-cost-by-department.pdf");
          }}
          className="inline-flex items-center gap-2 h-9 rounded-md border px-4 text-sm hover:bg-muted"
        >
          <FileTextIcon className="h-4 w-4" /> Department PDF
        </button>
        <button
          type="button"
          onClick={async () => {
            const { generateFullPayrollPDF, downloadPDFBlob } = await import("@/lib/hriq/pdf-reports");
            const now = new Date();
            // Build contractor-level rows from approved timesheets
            const approvedTS = timesheets.filter((t) => t.status === "approved" || t.status === "auto_approved");
            const rows = approvedTS.map((ts) => {
              const rate = empRateMap.get(ts.employee.id) ?? 0;
              const hours = Number(ts.totalHours ?? 0);
              const emp = activeEmps.find((e) => e.id === ts.employee.id);
              return {
                name: `${ts.employee.legalFirstName} ${ts.employee.legalLastName}`,
                department: emp?.department || ts.employee.department || "Unassigned",
                hours,
                rate,
                bonus: 0, // bonusTotal not on TimesheetSub type in reports
                totalPay: hours * rate,
                status: ts.status,
                period: ts.period?.name ?? "",
              };
            }).sort((a, b) => a.department.localeCompare(b.department) || a.name.localeCompare(b.name));

            const pdfBytes = await generateFullPayrollPDF({
              title: "Full Payroll Report",
              periodName: "All Periods",
              dateRange: "Active Contractors",
              generatedAt: now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }),
              summary: [
                { label: "Headcount", value: String(totalHeadcount) },
                { label: "Labor Cost", value: `$${totalLaborCost.toLocaleString("en-US", { maximumFractionDigits: 0 })}` },
                { label: "Approved Hours", value: totalHours.toLocaleString(undefined, { maximumFractionDigits: 1 }) },
                { label: "Total Paid", value: `$${totalPaid.toLocaleString("en-US", { maximumFractionDigits: 0 })}` },
              ],
              rows,
              byDepartment: deptData.map((d) => ({
                ...d,
                pctOfTotal: totalLaborCost > 0 ? `${((d.laborCost / totalLaborCost) * 100).toFixed(1)}%` : "—",
              })),
              totals: {
                headcount: totalHeadcount,
                hours: totalHours,
                avgRate: totalHours > 0 ? `$${(totalLaborCost / totalHours).toFixed(2)}` : "—",
                laborCost: `$${totalLaborCost.toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
                totalPaid: `$${totalPaid.toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
              },
            });
            downloadPDFBlob(pdfBytes, "full-payroll-report.pdf");
          }}
          className="inline-flex items-center gap-2 h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <FileTextIcon className="h-4 w-4" /> Full Payroll Report PDF
        </button>
      </div>
    </div>
  );
}

// 
// ONBOARDING TAB
// 

function OnboardingTab({ onboardings, employees }: { onboardings: OnboardingSession[]; employees: Employee[] }) {
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = statusFilter === "all" ? onboardings : onboardings.filter((o) => o.status === statusFilter);
  const statuses = [...new Set(onboardings.map((o) => o.status))];

  // Status breakdown
  const byStatus = new Map<string, number>();
  for (const o of onboardings) byStatus.set(o.status, (byStatus.get(o.status) ?? 0) + 1);
  const statusData = Array.from(byStatus.entries()).map(([name, value]) => ({ name: fmtLabel(name), value }));

  // Avg completion time (days)
  const completed = onboardings.filter((o) => o.completedAt && o.startedAt);
  const avgDays = completed.length > 0
    ? Math.round(completed.reduce((s, o) => s + (new Date(o.completedAt! as any).getTime() - new Date(o.startedAt! as any).getTime()) / 86400000, 0) / completed.length)
    : 0;

  // By org
  const byOrg = new Map<string, number>();
  for (const o of onboardings) {
    const name = o.employee.organization?.name ?? "Unknown";
    byOrg.set(name, (byOrg.get(name) ?? 0) + 1);
  }
  const orgData = Array.from(byOrg.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

  // Onboarding status of employees
  const empByOb = new Map<string, number>();
  for (const e of employees) empByOb.set(e.onboardingStatus, (empByOb.get(e.onboardingStatus) ?? 0) + 1);
  const empObData = Array.from(empByOb.entries()).map(([name, value]) => ({ name: fmtLabel(name), value }));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KPI label="Total Onboardings" value={onboardings.length} icon={UsersIcon} />
        <KPI label="Completed" value={completed.length} sub={onboardings.length > 0 ? `${Math.round((completed.length / onboardings.length) * 100)}% completion rate` : undefined} icon={CheckCircleIcon} />
        <KPI label="In Progress" value={onboardings.filter((o) => o.status === "in_progress").length} icon={AlertCircleIcon} />
        <KPI label="Avg Completion" value={`${avgDays} days`} sub="start to finish" icon={ClockIcon} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <ChartCard title="Onboarding Status"><PieChartWidget data={statusData} /></ChartCard>
        <ChartCard title="Employee Onboarding Status"><PieChartWidget data={empObData} /></ChartCard>
        {orgData.length > 1 && <ChartCard title="Onboardings by Organization"><BarChartWidget data={orgData.slice(0, 10)} /></ChartCard>}
      </div>

      <ChartCard title="Onboarding Sessions"
        onExport={() => {
          const headers = ["Employee", "Organization", "Status", "Progress", "Started", "Completed", "Steps"];
          const rows = filtered.map((o) => [
            `${o.employee.legalFirstName} ${o.employee.legalLastName}`,
            o.employee.organization?.name ?? "—",
            fmtLabel(o.status), `${o.overallProgress}%`,
            fmtDate(o.startedAt), fmtDate(o.completedAt), String(o._count.steps),
          ]);
          downloadCSV("onboarding-report.csv", headers, rows);
        }}>
        <div className="mb-3 flex gap-2">
          <CustomSelect
            value={statusFilter}
            onValueChange={setStatusFilter}
            triggerClassName="h-8 min-w-[120px] text-xs"
            placeholder="All Statuses"
            options={[
              { value: "all", label: "All Statuses" },
              ...statuses.map((s) => ({ value: s, label: fmtLabel(s) })),
            ]}
          />
          <span className="ml-auto text-xs text-muted-foreground">{filtered.length} sessions</span>
        </div>
        <DataTable
          headers={["Employee", "Org", "Status", "Progress", "Started", "Completed"]}
          rows={filtered.map((o) => [
            `${o.employee.legalFirstName} ${o.employee.legalLastName}`,
            o.employee.organization?.name ?? "—",
            fmtLabel(o.status),
            `${o.overallProgress}%`,
            fmtDate(o.startedAt),
            fmtDate(o.completedAt),
          ])}
        />
      </ChartCard>
    </div>
  );
}

// 
// CONTRACTORS TAB
// 

function ContractorsTab({ employees }: { employees: Employee[] }) {
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = statusFilter === "all" ? employees : employees.filter((e) => e.employmentStatus === statusFilter);
  const statuses = [...new Set(employees.map((e) => e.employmentStatus))];

  // Status breakdown
  const byStatus = new Map<string, number>();
  for (const e of employees) byStatus.set(e.employmentStatus, (byStatus.get(e.employmentStatus) ?? 0) + 1);
  const statusData = Array.from(byStatus.entries()).map(([name, value]) => ({ name: fmtLabel(name), value }));

  // By department
  const byDept = new Map<string, number>();
  for (const e of employees) byDept.set(e.department ?? "Unassigned", (byDept.get(e.department ?? "Unassigned") ?? 0) + 1);
  const deptData = Array.from(byDept.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

  // By country
  const byCountry = new Map<string, number>();
  for (const e of employees) byCountry.set(e.country ?? "Unknown", (byCountry.get(e.country ?? "Unknown") ?? 0) + 1);
  const countryData = Array.from(byCountry.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

  // By type
  const byType = new Map<string, number>();
  for (const e of employees) byType.set(e.employmentType, (byType.get(e.employmentType) ?? 0) + 1);
  const typeData = Array.from(byType.entries()).map(([name, value]) => ({ name: fmtLabel(name), value }));

  // Account status
  const withAccounts = employees.filter((e) => e.linkedUserId).length;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KPI label="Total Contractors" value={employees.length} icon={UsersIcon} />
        <KPI label="Active" value={employees.filter((e) => e.employmentStatus === "active").length} icon={CheckCircleIcon} />
        <KPI label="With Accounts" value={withAccounts} sub={`${employees.length - withAccounts} without`} icon={UsersIcon} />
        <KPI label="Countries" value={byCountry.size} icon={BuildingIcon} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <ChartCard title="By Status"><PieChartWidget data={statusData} /></ChartCard>
        <ChartCard title="By Contract Type"><PieChartWidget data={typeData} /></ChartCard>
        {deptData.length > 1 && <ChartCard title="By Department"><BarChartWidget data={deptData.slice(0, 10)} /></ChartCard>}
        {countryData.length > 1 && <ChartCard title="By Country"><BarChartWidget data={countryData.slice(0, 10)} /></ChartCard>}
      </div>

      <ChartCard title="Contractor List"
        onExport={() => {
          const headers = ["Name", "Organization", "Status", "Type", "Department", "Country", "Rate", "Start Date", "Has Account"];
          const rows = filtered.map((e) => [
            `${e.legalFirstName} ${e.legalLastName}`, e.organization?.name ?? "—",
            fmtLabel(e.employmentStatus), fmtLabel(e.employmentType),
            e.department ?? "—", e.country ?? "—",
            e.hourlyRate ? `${String(e.hourlyRate)} ${e.currency}/hr` : "—",
            fmtDate(e.startDate), e.linkedUserId ? "Yes" : "No",
          ]);
          downloadCSV("contractors-report.csv", headers, rows);
        }}>
        <div className="mb-3 flex gap-2">
          <CustomSelect
            value={statusFilter}
            onValueChange={setStatusFilter}
            triggerClassName="h-8 min-w-[120px] text-xs"
            placeholder="All Statuses"
            options={[
              { value: "all", label: "All Statuses" },
              ...statuses.map((s) => ({ value: s, label: fmtLabel(s) })),
            ]}
          />
          <span className="ml-auto text-xs text-muted-foreground">{filtered.length} contractors</span>
        </div>
        <DataTable
          headers={["Name", "Org", "Status", "Type", "Country", "Rate", "Start"]}
          rows={filtered.map((e) => [
            `${e.legalFirstName} ${e.legalLastName}`, e.organization?.name ?? "—",
            fmtLabel(e.employmentStatus), fmtLabel(e.employmentType),
            e.country ?? "—", e.hourlyRate ? `${String(e.hourlyRate)} ${e.currency}` : "—",
            fmtDate(e.startDate),
          ])}
        />
      </ChartCard>
    </div>
  );
}

// 
// PAYMENTS TAB
// 

function PaymentsTab({ payments }: { payments: Payment[] }) {
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = statusFilter === "all" ? payments : payments.filter((p) => p.status === statusFilter);
  const statuses = [...new Set(payments.map((p) => p.status))];

  const totalAmount = payments.reduce((s, p) => s + Number(p.amount), 0);
  const completedAmount = payments.filter((p) => p.status === "completed").reduce((s, p) => s + Number(p.amount), 0);
  const pendingAmount = payments.filter((p) => p.status === "pending").reduce((s, p) => s + Number(p.amount), 0);

  // By status
  const byStatus = new Map<string, number>();
  for (const p of payments) byStatus.set(p.status, (byStatus.get(p.status) ?? 0) + 1);
  const statusData = Array.from(byStatus.entries()).map(([name, value]) => ({ name: fmtLabel(name), value }));

  // Amount by status
  const amtByStatus = new Map<string, number>();
  for (const p of payments) amtByStatus.set(p.status, (amtByStatus.get(p.status) ?? 0) + Number(p.amount));
  const amtData = Array.from(amtByStatus.entries()).map(([name, value]) => ({ name: fmtLabel(name), value: Math.round(value) }));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KPI label="Total Payments" value={payments.length} icon={DollarSignIcon} />
        <KPI label="Total Amount" value={fmtCurrency(totalAmount)} icon={DollarSignIcon} />
        <KPI label="Completed" value={fmtCurrency(completedAmount)} icon={CheckCircleIcon} />
        <KPI label="Pending" value={fmtCurrency(pendingAmount)} icon={AlertCircleIcon} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <ChartCard title="Payments by Status"><PieChartWidget data={statusData} /></ChartCard>
        <ChartCard title="Amount by Status"><BarChartWidget data={amtData} layout="horizontal" /></ChartCard>
      </div>

      <ChartCard title="Payment Records"
        onExport={() => {
          const headers = ["Employee", "Organization", "Amount", "Currency", "Status", "Payment Date", "Period"];
          const rows = filtered.map((p) => [
            `${p.employee.legalFirstName} ${p.employee.legalLastName}`,
            p.employee.organization?.name ?? "—",
            String(Number(p.amount).toFixed(2)), p.currency, fmtLabel(p.status),
            fmtDate(p.paymentDate),
            p.periodStart && p.periodEnd ? `${fmtDate(p.periodStart)} - ${fmtDate(p.periodEnd)}` : "—",
          ]);
          downloadCSV("payments-report.csv", headers, rows);
        }}>
        <div className="mb-3 flex gap-2">
          <CustomSelect
            value={statusFilter}
            onValueChange={setStatusFilter}
            triggerClassName="h-8 min-w-[120px] text-xs"
            placeholder="All Statuses"
            options={[
              { value: "all", label: "All Statuses" },
              ...statuses.map((s) => ({ value: s, label: fmtLabel(s) })),
            ]}
          />
          <span className="ml-auto text-xs text-muted-foreground">{filtered.length} payments</span>
        </div>
        <DataTable
          headers={["Employee", "Org", "Amount", "Status", "Date"]}
          rows={filtered.map((p) => [
            `${p.employee.legalFirstName} ${p.employee.legalLastName}`,
            p.employee.organization?.name ?? "—",
            fmtCurrency(Number(p.amount), p.currency),
            fmtLabel(p.status),
            fmtDate(p.paymentDate ?? p.createdAt),
          ])}
        />
      </ChartCard>
    </div>
  );
}

// 
// TIMESHEETS TAB
// 

function TimesheetsTab({ timesheets }: { timesheets: TimesheetSub[] }) {
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = statusFilter === "all" ? timesheets : timesheets.filter((t) => t.status === statusFilter);
  const statuses = [...new Set(timesheets.map((t) => t.status))];

  const totalHours = timesheets.reduce((s, t) => s + Number(t.totalHours), 0);
  const approvedHours = timesheets.filter((t) => t.status === "approved" || t.status === "auto_approved").reduce((s, t) => s + Number(t.totalHours), 0);
  const avgHours = timesheets.length > 0 ? totalHours / timesheets.length : 0;

  // By status
  const byStatus = new Map<string, number>();
  for (const t of timesheets) byStatus.set(t.status, (byStatus.get(t.status) ?? 0) + 1);
  const statusData = Array.from(byStatus.entries()).map(([name, value]) => ({ name: fmtLabel(name), value }));

  // Hours by status
  const hrsByStatus = new Map<string, number>();
  for (const t of timesheets) hrsByStatus.set(t.status, (hrsByStatus.get(t.status) ?? 0) + Number(t.totalHours));
  const hrsData = Array.from(hrsByStatus.entries()).map(([name, value]) => ({ name: fmtLabel(name), value: Math.round(value) }));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KPI label="Total Submissions" value={timesheets.length} icon={ClockIcon} />
        <KPI label="Total Hours" value={totalHours.toLocaleString(undefined, { maximumFractionDigits: 1 })} icon={ClockIcon} />
        <KPI label="Approved Hours" value={approvedHours.toLocaleString(undefined, { maximumFractionDigits: 1 })} icon={CheckCircleIcon} />
        <KPI label="Avg Hours/Sheet" value={avgHours.toFixed(1)} icon={TrendingUpIcon} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <ChartCard title="Submissions by Status"><PieChartWidget data={statusData} /></ChartCard>
        <ChartCard title="Hours by Status"><BarChartWidget data={hrsData} layout="horizontal" /></ChartCard>
      </div>

      <ChartCard title="Timesheet Submissions"
        onExport={() => {
          const headers = ["Employee", "Organization", "Period", "Hours", "Status", "Submitted", "Approved"];
          const rows = filtered.map((t) => [
            `${t.employee.legalFirstName} ${t.employee.legalLastName}`,
            t.employee.organization?.name ?? "—",
            t.period?.name ?? "—",
            String(Number(t.totalHours).toFixed(2)),
            fmtLabel(t.status),
            fmtDate(t.submittedAt),
            fmtDate(t.approvedAt),
          ]);
          downloadCSV("timesheets-report.csv", headers, rows);
        }}>
        <div className="mb-3 flex gap-2">
          <CustomSelect
            value={statusFilter}
            onValueChange={setStatusFilter}
            triggerClassName="h-8 min-w-[120px] text-xs"
            placeholder="All Statuses"
            options={[
              { value: "all", label: "All Statuses" },
              ...statuses.map((s) => ({ value: s, label: fmtLabel(s) })),
            ]}
          />
          <span className="ml-auto text-xs text-muted-foreground">{filtered.length} submissions</span>
        </div>
        <DataTable
          headers={["Employee", "Org", "Period", "Hours", "Status", "Submitted"]}
          rows={filtered.map((t) => [
            `${t.employee.legalFirstName} ${t.employee.legalLastName}`,
            t.employee.organization?.name ?? "—",
            t.period?.name ?? "—",
            fmtHours(Number(t.totalHours)),
            fmtLabel(t.status),
            fmtDate(t.submittedAt ?? t.createdAt),
          ])}
        />
      </ChartCard>
    </div>
  );
}


// ─── Data Health Tab ────────────────────────────────────────────────────────

function DataHealthTab() {
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ totalActive: number; issues: Array<{ key: string; label: string; count: number; description: string }> }>({ totalActive: 0, issues: [] });

  useEffect(() => {
    (async () => {
      try {
        const { getHealthSummary } = await import("@/app/actions/hriq/health-reports");
        const data = await getHealthSummary();
        setSummary(data);
      } catch (err) {
        console.error("Failed to load health summary:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const downloadCsv = useCallback(async (issueKey: string) => {
    setDownloading(issueKey);
    try {
      const { generateHealthCsv } = await import("@/app/actions/hriq/health-reports");
      const result = await generateHealthCsv(issueKey);
      if ("error" in result) {
        alert(result.error);
        return;
      }
      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("CSV download failed:", err);
    } finally {
      setDownloading(null);
    }
  }, []);

  const downloadFull = useCallback(async () => {
    setDownloading("full");
    try {
      const { generateFullHealthCsv } = await import("@/app/actions/hriq/health-reports");
      const result = await generateFullHealthCsv();
      if ("error" in result) {
        alert(result.error);
        return;
      }
      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Full CSV download failed:", err);
    } finally {
      setDownloading(null);
    }
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <ClockIcon className="mr-2 h-4 w-4 animate-spin" /> Loading health data...
      </div>
    );
  }

  const healthScore = summary.totalActive > 0
    ? Math.round(((summary.totalActive - (summary.issues.reduce((s, i) => Math.max(s, i.count), 0))) / summary.totalActive) * 100)
    : 100;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Data Health Report</h3>
          <p className="text-sm text-muted-foreground">{summary.totalActive} active contractors &middot; {summary.issues.length} issue types found</p>
        </div>
        <button
          onClick={downloadFull}
          disabled={downloading === "full" || summary.issues.length === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          <DownloadIcon className="h-4 w-4" />
          {downloading === "full" ? "Generating..." : "Download Full Report"}
        </button>
      </div>

      {/* Health Score */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Health Score</p>
          <p className={`text-3xl font-bold tabular-nums ${healthScore >= 80 ? "text-emerald-500" : healthScore >= 50 ? "text-amber-500" : "text-red-500"}`}>
            {healthScore}%
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Based on worst issue coverage</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Active Contractors</p>
          <p className="text-3xl font-bold tabular-nums">{summary.totalActive}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Issue Categories</p>
          <p className="text-3xl font-bold tabular-nums">{summary.issues.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">with affected contractors</p>
        </div>
      </div>

      {/* Issue Cards */}
      {summary.issues.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center">
          <CheckCircleIcon className="mx-auto h-10 w-10 text-emerald-500" />
          <p className="mt-3 text-lg font-semibold">All Clear</p>
          <p className="text-sm text-muted-foreground">All active contractor profiles are complete.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {summary.issues.map((issue) => {
            const pct = summary.totalActive > 0 ? Math.round((issue.count / summary.totalActive) * 100) : 0;
            const severity = pct >= 30 ? "red" : pct >= 10 ? "amber" : "yellow";
            const colors = {
              red: { bg: "bg-red-50 dark:bg-red-950/20", border: "border-red-200 dark:border-red-900/40", bar: "bg-red-500", text: "text-red-700 dark:text-red-300" },
              amber: { bg: "bg-amber-50 dark:bg-amber-950/20", border: "border-amber-200 dark:border-amber-900/40", bar: "bg-amber-500", text: "text-amber-700 dark:text-amber-300" },
              yellow: { bg: "bg-yellow-50 dark:bg-yellow-950/20", border: "border-yellow-200 dark:border-yellow-900/40", bar: "bg-yellow-500", text: "text-yellow-700 dark:text-yellow-300" },
            }[severity];

            return (
              <div key={issue.key} className={`rounded-xl border ${colors.border} ${colors.bg} p-4`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <AlertCircleIcon className={`h-4 w-4 ${colors.text}`} />
                      <h4 className="text-sm font-semibold">{issue.label}</h4>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${colors.text} ${colors.bg}`}>
                        {issue.count} contractor{issue.count !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{issue.description}</p>
                    {/* Progress bar */}
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                        <div className={`h-full rounded-full ${colors.bar} transition-all`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs font-medium tabular-nums">{pct}%</span>
                    </div>
                  </div>
                  <button
                    onClick={() => downloadCsv(issue.key)}
                    disabled={downloading === issue.key}
                    className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors disabled:opacity-50"
                  >
                    <DownloadIcon className="h-3.5 w-3.5" />
                    {downloading === issue.key ? "..." : "CSV"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
