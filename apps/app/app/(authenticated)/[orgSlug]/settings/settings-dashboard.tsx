"use client";

import {
  resetContractorPassword,
  getUnlinkedEmployees,
} from "@/app/actions/hriq/payroll";
import { useErrorDialog } from "@/app/(authenticated)/components/error-dialog";
import { PaymentsTab } from "./payments-tab";
import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import { useParams } from "next/navigation";

type HealthIssue = {
  key: string;
  label: string;
  count: number;
  severity: "critical" | "warning" | "info";
  category: "payroll" | "profile" | "integrity" | "onboarding" | "security";
  link?: string;
};

const CATEGORY_META: Record<string, { label: string; icon: string; color: string }> = {
  payroll: { label: "Payroll & Payments", icon: "💰", color: "text-red-700 dark:text-red-300" },
  profile: { label: "Profile Completeness", icon: "👤", color: "text-blue-700 dark:text-blue-300" },
  integrity: { label: "Data Integrity", icon: "🔗", color: "text-purple-700 dark:text-purple-300" },
  onboarding: { label: "Onboarding & Documents", icon: "📋", color: "text-emerald-700 dark:text-emerald-300" },
  security: { label: "Security & Offboarding", icon: "🛡️", color: "text-orange-700 dark:text-orange-300" },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: "bg-red-500",
  warning: "bg-amber-500",
  info: "bg-blue-400",
};

const SEVERITY_BADGE: Record<string, string> = {
  critical: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  info: "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300",
};

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin", admin: "Admin", manager: "Manager", member: "Member",
};
const ROLE_COLORS: Record<string, string> = {
  super_admin: "bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300",
  admin: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300",
  manager: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
  va: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  member: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

type Props = {
  session: { email: string; userId: string; role: string; name: string | null };
  stats: { orgCount: number; userCount: number; employeeCount: number; activeUsers: number; memberCount: number; pendingInvites: number; activeEmployees: number; timesheetPeriodCount: number; pendingTimesheets: number };
  rlOrgId: string | null;
  unlinkedEmployees: Array<{ id: string; legalFirstName: string; legalLastName: string; personalEmail: string | null; workEmail: string | null; jobTitle: string | null }>;
  healthIssues?: HealthIssue[];
};

function DefaultPasswordRow() {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const pw = "!TvRemote2026!";
  const handleCopy = () => { navigator.clipboard.writeText(pw).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); };
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">Default Password</span>
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs">{visible ? pw : "••••••••••••••"}</span>
        <button type="button" onClick={() => setVisible(!visible)} className="text-[10px] text-muted-foreground hover:text-foreground" title={visible ? "Hide" : "Reveal"}>
          {visible ? "Hide" : "Show"}
        </button>
        <button type="button" onClick={handleCopy} className="text-[10px] text-muted-foreground hover:text-foreground" title="Copy to clipboard">
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
}

export function SettingsDashboard({ session, stats, rlOrgId, unlinkedEmployees: _, healthIssues = [] }: Props) {
  const [tab, setTab] = useState<"overview" | "health" | "accounts" | "payments" | "account">("overview");
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const [severityFilter, setSeverityFilter] = useState<"all" | "critical" | "warning" | "info">("all");
  const [showZero, setShowZero] = useState(false);

  const activeIssues = healthIssues.filter((i) => i.count > 0);
  const criticalCount = activeIssues.filter((i) => i.severity === "critical").length;
  const warningCount = activeIssues.filter((i) => i.severity === "warning").length;
  const infoCount = activeIssues.filter((i) => i.severity === "info").length;
  const totalFlagged = activeIssues.reduce((s, i) => s + i.count, 0);

  const filteredIssues = (showZero ? healthIssues : activeIssues).filter(
    (i) => severityFilter === "all" || i.severity === severityFilter
  );

  const categories = ["payroll", "profile", "integrity", "onboarding", "security"] as const;
  const issuesByCategory = Object.fromEntries(
    categories.map((cat) => [cat, filteredIssues.filter((i) => i.category === cat)])
  );

  const tabs = [
    { key: "overview"  as const, label: "Overview" },
    { key: "health"    as const, label: `System Health${criticalCount > 0 ? ` (${criticalCount})` : ""}`, alert: criticalCount > 0 },
    { key: "accounts"  as const, label: "Accounts" },
    { key: "payments"  as const, label: "Payments" },
    { key: "account"   as const, label: "My Account" },
  ];

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="flex gap-1 rounded-lg bg-muted p-1 min-w-max sm:min-w-0">
          {tabs.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`relative flex-1 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors ${tab === t.key ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {t.label}
              {"alert" in t && t.alert && <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" /><span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" /></span>}
            </button>
          ))}
        </div>
      </div>

      {/* Overview Tab — summary banner + stats */}
      {tab === "overview" && (
        <div className="space-y-4">
          {/* Health summary banner */}
          {activeIssues.length > 0 && (
            <button
              onClick={() => setTab("health")}
              className="w-full rounded-xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <svg className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                    {totalFlagged} data issues across {activeIssues.length} checks need attention
                  </div>
                  <div className="flex gap-2 mt-1">
                    {criticalCount > 0 && <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_BADGE.critical}`}>{criticalCount} critical</span>}
                    {warningCount > 0 && <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_BADGE.warning}`}>{warningCount} warnings</span>}
                    {infoCount > 0 && <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_BADGE.info}`}>{infoCount} info</span>}
                  </div>
                </div>
                <svg className="h-5 w-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </div>
            </button>
          )}

        <div className="grid gap-4 md:grid-cols-2">
          {/* Platform Stats */}
          <div className="rounded-xl border bg-card p-6">
            <h3 className="font-semibold">Platform Statistics</h3>
            <div className="mt-4 space-y-3">
              <StatRow label="Client Organizations" value={stats.orgCount} />
              <StatRow label="Total Contractors" value={stats.employeeCount} />
              <StatRow label="Active Contractors" value={stats.activeEmployees} />
              <StatRow label="Registered Users" value={stats.userCount} />
              <StatRow label="Active Users" value={stats.activeUsers} />
              <StatRow label="Org Memberships" value={stats.memberCount} />
              <StatRow label="Pending Invitations" value={stats.pendingInvites} />
              <StatRow label="Pay Periods" value={stats.timesheetPeriodCount} />
              <StatRow label="Pending Timesheets" value={stats.pendingTimesheets} />
            </div>
          </div>

          {/* Internal Links */}
          <div className="rounded-xl border bg-card p-6">
              <h3 className="font-semibold">Admin Tools</h3>
              <div className="mt-4 space-y-2">
                {[
                  { label: "User Management", href: "settings/users", desc: "Manage roles, deactivate accounts" },
                  { label: "Audit Log", href: "settings/security", desc: "Review recent platform activity" },
                  { label: "Workflow Templates", href: "settings/workflows", desc: "Configure onboarding flows" },
                  { label: "Email Templates", href: "settings/email-templates", desc: "Edit email content, preview, and publish" },
                  { label: "RecruitCRM Sync", href: "pending-hires", desc: "Review imported candidates" },
                ].map(({ label, href, desc }) => (
                  <Link key={href} href={href} className="flex items-center justify-between rounded-lg border px-3 py-2.5 hover:bg-muted/50 transition-colors">
                    <div>
                      <div className="text-sm font-medium">{label}</div>
                      <div className="text-xs text-muted-foreground">{desc}</div>
                    </div>
                    <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                  </Link>
                ))}
              </div>
            </div>
        </div>
        </div>
      )}

      {/* System Health Tab — full categorized deep-dive */}
      {tab === "health" && (
        <div className="space-y-4">
          {/* Score bar */}
          <div className="rounded-xl border bg-card p-5">
            <div className="flex flex-wrap items-center gap-4 mb-4">
              <div>
                <div className="text-2xl font-bold">{healthIssues.length - activeIssues.length}<span className="text-base font-normal text-muted-foreground">/{healthIssues.length} checks passing</span></div>
                <div className="text-xs text-muted-foreground mt-0.5">{totalFlagged} total items flagged across {activeIssues.length} failing checks</div>
              </div>
              <div className="ml-auto flex gap-2">
                {criticalCount > 0 && <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${SEVERITY_BADGE.critical}`}>{criticalCount} critical</span>}
                {warningCount > 0 && <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${SEVERITY_BADGE.warning}`}>{warningCount} warnings</span>}
                {infoCount > 0 && <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${SEVERITY_BADGE.info}`}>{infoCount} info</span>}
              </div>
            </div>
            {/* Score progress bar */}
            <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden flex">
              {criticalCount > 0 && <div className="bg-red-500 transition-all" style={{ width: `${(criticalCount / healthIssues.length) * 100}%` }} />}
              {warningCount > 0 && <div className="bg-amber-500 transition-all" style={{ width: `${(warningCount / healthIssues.length) * 100}%` }} />}
              {infoCount > 0 && <div className="bg-blue-400 transition-all" style={{ width: `${(infoCount / healthIssues.length) * 100}%` }} />}
              <div className="bg-emerald-500 flex-1 transition-all" />
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Filter:</span>
            {(["all", "critical", "warning", "info"] as const).map((s) => (
              <button key={s} onClick={() => setSeverityFilter(s)} className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${severityFilter === s ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
                {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
            <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
              <input type="checkbox" checked={showZero} onChange={(e) => setShowZero(e.target.checked)} className="rounded border-muted-foreground/30" />
              Show passing checks
            </label>
          </div>

          {/* Category sections */}
          {categories.map((cat) => {
            const issues = issuesByCategory[cat] ?? [];
            if (issues.length === 0) return null;
            const meta = CATEGORY_META[cat];
            const catCritical = issues.filter((i) => i.severity === "critical" && i.count > 0).length;
            return (
              <div key={cat} className="rounded-xl border bg-card overflow-hidden">
                <div className="px-4 py-3 border-b bg-muted/30 flex items-center gap-2">
                  <span>{meta.icon}</span>
                  <h3 className={`text-sm font-semibold ${meta.color}`}>{meta.label}</h3>
                  {catCritical > 0 && <span className={`ml-auto inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${SEVERITY_BADGE.critical}`}>{catCritical} critical</span>}
                </div>
                <div className="divide-y">
                  {issues.map((issue) => (
                    <div key={issue.key} className={`flex items-center gap-3 px-4 py-2.5 ${issue.count === 0 ? "opacity-50" : "hover:bg-muted/30"} transition-colors`}>
                      <span className={`inline-block h-2 w-2 rounded-full flex-shrink-0 ${issue.count === 0 ? "bg-emerald-500" : SEVERITY_DOT[issue.severity]}`} />
                      <span className={`text-sm flex-1 ${issue.count === 0 ? "text-muted-foreground line-through" : ""}`}>{issue.label}</span>
                      <span className={`font-mono text-sm font-semibold min-w-[3ch] text-right ${issue.count === 0 ? "text-emerald-600 dark:text-emerald-400" : issue.severity === "critical" ? "text-red-600 dark:text-red-400" : issue.severity === "warning" ? "text-amber-600 dark:text-amber-400" : "text-blue-600 dark:text-blue-400"}`}>
                        {issue.count === 0 ? "✓" : issue.count}
                      </span>
                      {issue.link && issue.count > 0 && (
                        <Link href={`/${orgSlug}/${issue.link}`} className="rounded-md border px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                          View
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {filteredIssues.length === 0 && (
            <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
              No issues match the current filter.
            </div>
          )}
        </div>
      )}

      {/* Accounts Tab */}
      {tab === "accounts" && <AccountsTab />}

      {/* Payments Tab */}
      {tab === "payments" && <PaymentsTab />}

      {/* My Account Tab */}
      {tab === "account" && (
        <div className="max-w-lg space-y-4">
          <div className="rounded-xl border bg-card p-6">
            <h3 className="font-semibold">My Account</h3>
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground">
                  {(session.name ?? session.email).charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="text-lg font-medium">{session.name ?? "Admin"}</div>
                  <div className="text-sm text-muted-foreground">{session.email}</div>
                </div>
              </div>
              <div className="mt-4 space-y-2 rounded-lg bg-muted/50 p-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">User ID</span>
                  <span className="font-mono text-xs">{session.userId.slice(0, 20)}...</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Role</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[session.role] ?? ""}`}>
                    {ROLE_LABELS[session.role] ?? session.role}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">RL Org ID</span>
                  <span className="font-mono text-xs">{rlOrgId?.slice(0, 20) ?? "N/A"}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function AccountsTab() {
  const [isPending, startTransition] = useTransition();
  const { showError, showSuccess } = useErrorDialog();
  const [unlinked, setUnlinked] = useState<Array<{ id: string; employeeNumber: string; legalFirstName: string; legalLastName: string; personalEmail: string | null }>>([]);
  const [loaded, setLoaded] = useState(false);
  const [resetTarget, setResetTarget] = useState<string | null>(null);
  const [customPassword, setCustomPassword] = useState("");

  const loadUnlinked = useCallback(() => {
    startTransition(async () => {
      try {
        const data = await getUnlinkedEmployees();
        setUnlinked(data);
        setLoaded(true);
      } catch (err) {
        showError({ title: "Load failed", message: err instanceof Error ? err.message : "Error" });
      }
    });
  }, [showError]);

  useEffect(() => { loadUnlinked(); }, [loadUnlinked]);

  const handleProvision = (employeeId: string) => {
    startTransition(async () => {
      try {
        const { provisionContractorDashboard } = await import("@/app/actions/hriq/contractor-dashboard");
        const result = await provisionContractorDashboard(employeeId);
        if ("error" in result) { showError({ title: "Error", message: (result as any).error ?? "An error occurred" }); return; }
        showSuccess(`Dashboard created for ${(result as any).email}. Default password sent via email.`);
        loadUnlinked();
      } catch (err) {
        showError({ title: "Provision failed", message: err instanceof Error ? err.message : "Error" });
      }
    });
  };

  const handleBulkProvision = () => {
    startTransition(async () => {
      let created = 0; let failed = 0;
      for (const emp of unlinked) {
        try {
          const { provisionContractorDashboard } = await import("@/app/actions/hriq/contractor-dashboard");
          await provisionContractorDashboard(emp.id);
          created++;
        } catch { failed++; }
      }
      showSuccess(`Provisioned ${created} accounts${failed > 0 ? ` (${failed} failed)` : ""}. Default password sent via email.`);
      loadUnlinked();
    });
  };

  const handleReset = (employeeId: string) => {
    startTransition(async () => {
      try {
        const result = await resetContractorPassword(employeeId, customPassword || undefined);
        if ("error" in result) { showError({ title: "Error", message: (result as any).error ?? "An error occurred" }); return; }
        showSuccess(`Password reset for ${(result as any).name}.`);
        setResetTarget(null);
        setCustomPassword("");
      } catch (err) {
        showError({ title: "Reset failed", message: err instanceof Error ? err.message : "Error" });
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Unlinked Contractors */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Unlinked Active Contractors</h3>
            <p className="text-xs text-muted-foreground">Active contractors without a dashboard login.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={loadUnlinked} disabled={isPending} className="h-8 rounded-md border px-3 text-xs font-medium hover:bg-accent disabled:opacity-50">Refresh</button>
            {unlinked.length > 0 && (
              <button onClick={handleBulkProvision} disabled={isPending} className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {isPending ? "Provisioning..." : `Provision All (${unlinked.length})`}
              </button>
            )}
          </div>
        </div>
        {!loaded ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">Loading...</div>
        ) : unlinked.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">All active contractors have dashboard accounts.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">#</th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {unlinked.map((emp) => (
                  <tr key={emp.id} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="px-4 py-3 text-xs text-muted-foreground">{emp.employeeNumber}</td>
                    <td className="px-4 py-3 text-sm font-medium">{emp.legalFirstName} {emp.legalLastName}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{emp.personalEmail}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => handleProvision(emp.id)} disabled={isPending}
                        className="h-7 rounded-md bg-primary px-3 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                        Create Account
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Password Reset */}
      <div className="rounded-xl border bg-card p-6">
        <h3 className="font-semibold">Password Reset</h3>
        <p className="text-xs text-muted-foreground mt-1">Reset a contractor&apos;s dashboard password by their employee ID.</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            value={resetTarget ?? ""}
            onChange={(e) => setResetTarget(e.target.value)}
            placeholder="Employee ID (e.g. cmlv9z7nq...)"
            className="h-10 flex-1 min-w-[200px] rounded-md border border-input bg-background px-3 text-sm"
          />
          <input
            value={customPassword}
            onChange={(e) => setCustomPassword(e.target.value)}
            placeholder="New password (blank = default)"
            className="h-10 w-56 rounded-md border border-input bg-background px-3 text-sm"
          />
          <button onClick={() => resetTarget && handleReset(resetTarget)} disabled={isPending || !resetTarget}
            className="h-10 rounded-md bg-amber-600 px-5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">
            {isPending ? "Resetting..." : "Reset Password"}
          </button>
        </div>
      </div>

      {/* Defaults Reference */}
      <div className="rounded-xl border bg-card p-6">
        <h3 className="font-semibold">Account Defaults</h3>
        <div className="mt-4 space-y-2">
          <DefaultPasswordRow />
          <div className="flex justify-between text-sm"><span className="text-muted-foreground">Login Method</span><span className="text-xs">Email + Password</span></div>
          <div className="flex justify-between text-sm"><span className="text-muted-foreground">Dashboard URL</span><span className="font-mono text-xs">hriq.remoteleverage.com/sign-in</span></div>
          <div className="flex justify-between text-sm"><span className="text-muted-foreground">Role Assigned</span><span className="text-xs">VA (self-service)</span></div>
        </div>
      </div>
    </div>
  );
}
