"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ShieldCheckIcon, ShieldAlertIcon, ShieldXIcon, SearchIcon,
  AlertCircleIcon, CheckCircleIcon, XCircleIcon, SettingsIcon,
  HistoryIcon, ChevronRightIcon, ChevronLeftIcon,
  Loader2Icon, DownloadIcon, PhoneIcon, MailIcon, VideoIcon,
  CalendarIcon, DollarSignIcon, MessageSquareIcon, ClipboardIcon,
  KeyIcon, RocketIcon,
} from "lucide-react";
import type { AuditRunSummary, AuditResultDetail, FlaggedEmployee } from "@/app/actions/hriq/admin-alerts";

const SERVICES: Record<string, { label: string; Icon: any }> = {
  slack: { label: "Slack", Icon: MessageSquareIcon },
  quo_openphone: { label: "Quo / OpenPhone", Icon: PhoneIcon },
  recruitcrm: { label: "RecruitCRM", Icon: ClipboardIcon },
  fathom: { label: "Fathom", Icon: VideoIcon },
  google_workspace: { label: "Google Workspace", Icon: KeyIcon },
  zoom: { label: "Zoom", Icon: VideoIcon },
  calendly: { label: "Calendly", Icon: CalendarIcon },
  quickbooks: { label: "QuickBooks", Icon: DollarSignIcon },
};

// Result type from the /api/offboarding-audit POST (snake_case)
type AuditResult = {
  service: string;
  user_found: boolean;
  is_flagged: boolean;
  user_status: string;
  user_id_on_service: string | null;
  user_email_matched: string | null;
  flag_reason: string | null;
};

// Normalize AuditResultDetail (camelCase from server action) → AuditResult (snake_case for UI)
function normalizeDetail(d: AuditResultDetail): AuditResult {
  return {
    service: d.serviceName,
    user_found: d.userFound,
    is_flagged: d.isFlagged,
    user_status: d.userStatus,
    user_id_on_service: d.userIdOnService,
    user_email_matched: d.userEmailMatched,
    flag_reason: d.flagReason,
  };
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; cls: string; Icon: any }> = {
    active:          { label: "ACTIVE", cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", Icon: ShieldXIcon },
    recent_activity: { label: "RECENT ACTIVITY", cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", Icon: ShieldAlertIcon },
    not_found:       { label: "CLEAR", cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400", Icon: CheckCircleIcon },
    suspended:       { label: "SUSPENDED", cls: "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400", Icon: CheckCircleIcon },
    skipped:         { label: "UNAVAILABLE", cls: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400", Icon: SettingsIcon },
    alias:           { label: "ALIAS", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400", Icon: CheckCircleIcon },
    error:           { label: "ERROR", cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400", Icon: AlertCircleIcon },
  };
  const c = config[status] || config.error;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${c.cls}`}>
      <c.Icon className="h-3 w-3" />
      {c.label}
    </span>
  );
}

function ServiceRow({ r }: { r: AuditResult }) {
  const svc = SERVICES[r.service] || { label: r.service, Icon: SettingsIcon };
  return (
    <div className={`flex items-center justify-between rounded-xl border p-3 transition-colors ${
      r.is_flagged ? "border-red-200 bg-red-50/50 dark:border-red-900/50 dark:bg-red-950/20" : "bg-card"
    }`}>
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-muted">
          <svc.Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{svc.label}</p>
          {r.user_email_matched && <p className="text-xs text-muted-foreground truncate">Found: {r.user_email_matched}</p>}
          {r.flag_reason && r.is_flagged && <p className="text-xs text-red-600 dark:text-red-400 mt-0.5 truncate">{r.flag_reason}</p>}
          {r.flag_reason && !r.is_flagged && r.user_status !== "not_found" && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{r.flag_reason}</p>
          )}
        </div>
      </div>
      <StatusBadge status={r.user_status} />
    </div>
  );
}

function downloadAuditCSV(email: string, results: AuditResult[]) {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const headers = ["Service", "Status", "Flagged", "Email Matched", "User ID", "Reason"];
  const rows = results.map((r) => [
    SERVICES[r.service]?.label || r.service,
    r.user_status,
    r.is_flagged ? "YES" : "NO",
    r.user_email_matched || "",
    r.user_id_on_service || "",
    r.flag_reason || "",
  ]);
  const csv = [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `offboarding-audit-${email}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportFlaggedCSV(flagged: FlaggedEmployee[]) {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const headers = ["Employee", "Email", "Service", "Status", "Flagged", "Email Matched", "Reason", "Last Scanned"];
  const rows: string[][] = [];
  for (const emp of flagged) {
    for (const svc of emp.services) {
      rows.push([
        emp.employeeName,
        emp.employeeEmail,
        SERVICES[svc.serviceName]?.label || svc.serviceName,
        svc.userStatus,
        svc.isFlagged ? "YES" : "NO",
        svc.userEmailMatched || "",
        svc.flagReason || "",
        new Date(emp.createdAt).toISOString().slice(0, 19),
      ]);
    }
  }
  const csv = [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `offboarding-audit-flags-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function OffboardingAuditTab() {
  const [view, setView] = useState<"flags" | "run" | "history">("flags");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{ results: AuditResult[]; total_flags: number; employee_email: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<AuditRunSummary[]>([]);
  const [selectedRun, setSelectedRun] = useState<AuditRunSummary | null>(null);
  const [runDetails, setRunDetails] = useState<AuditResult[]>([]);
  const [flaggedEmployees, setFlaggedEmployees] = useState<FlaggedEmployee[]>([]);
  const [flagsLoading, setFlagsLoading] = useState(true);
  const [expandedFlag, setExpandedFlag] = useState<string | null>(null);

  const fetchFlags = useCallback(async () => {
    setFlagsLoading(true);
    try {
      const { getLatestAuditFlags } = await import("@/app/actions/hriq/admin-alerts");
      const flags = await getLatestAuditFlags();
      setFlaggedEmployees(flags);
    } catch {}
    setFlagsLoading(false);
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const { getAuditHistory } = await import("@/app/actions/hriq/admin-alerts");
      const runs = await getAuditHistory(50);
      setHistory(runs);
    } catch {}
  }, []);

  useEffect(() => { fetchHistory(); fetchFlags(); }, [fetchHistory, fetchFlags]);

  async function loadRunDetails(run: AuditRunSummary) {
    setSelectedRun(run);
    try {
      const { getAuditRunDetails } = await import("@/app/actions/hriq/admin-alerts");
      const details = await getAuditRunDetails(run.id);
      setRunDetails(details.map(normalizeDetail));
    } catch {}
  }

  async function runAudit() {
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const res = await fetch(`/api/offboarding-audit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_email: email.trim().toLowerCase(),
          employee_name: name.trim() || email.trim(),
          initiated_by: "hriq-reports",
        }),
      });
      const data = await res.json();
      if (data.error) setError(data.error);
      else { setResults(data); fetchHistory(); }
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }

  const grouped = results?.results ? {
    flagged: results.results.filter((r) => r.is_flagged),
    clear: results.results.filter((r) => !r.is_flagged && (r.user_status === "not_found" || r.user_status === "suspended")),
    issues: results.results.filter((r) => !r.is_flagged && r.user_status !== "not_found" && r.user_status !== "suspended"),
  } : null;

  const flagCount = flaggedEmployees.length;
  const totalFlagCount = flaggedEmployees.reduce((s, f) => s + f.totalFlags, 0);

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-2">
        <button onClick={() => { setView("flags"); setSelectedRun(null); }}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            view === "flags" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}>
          <ShieldAlertIcon className="h-4 w-4" />
          Active Flags{flagCount > 0 ? ` (${totalFlagCount})` : ""}
        </button>
        <button onClick={() => { setView("run"); setSelectedRun(null); }}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            view === "run" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}>
          <SearchIcon className="h-4 w-4" />Run Audit
        </button>
        <button onClick={() => { setView("history"); setSelectedRun(null); }}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            view === "history" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}>
          <HistoryIcon className="h-4 w-4" />History ({history.length})
        </button>
      </div>

      {/* FLAGS VIEW — default */}
      {view === "flags" && (
        <>
          {flagsLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : flaggedEmployees.length === 0 ? (
            <div className="rounded-xl border bg-card p-8 text-center">
              <ShieldCheckIcon className="mx-auto h-10 w-10 text-green-500" />
              <p className="mt-3 text-base font-semibold text-green-700 dark:text-green-400">All Clear</p>
              <p className="mt-1 text-sm text-muted-foreground">No active accounts found on offboarded contractors.</p>
            </div>
          ) : (
            <>
              {/* Summary banner */}
              <div className="flex items-center gap-4 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/20">
                <ShieldAlertIcon className="h-8 w-8 text-red-500 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-base font-semibold text-red-800 dark:text-red-300">
                    {totalFlagCount} Active Account{totalFlagCount !== 1 ? "s" : ""} Found
                  </p>
                  <p className="text-xs text-red-700/80 dark:text-red-400/70">
                    {flagCount} offboarded employee{flagCount !== 1 ? "s" : ""} still have access to company services
                  </p>
                </div>
                <button onClick={() => exportFlaggedCSV(flaggedEmployees)}
                  className="flex items-center gap-1.5 rounded-md border border-red-200 dark:border-red-900/40 px-3 py-1.5 text-xs font-medium hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors flex-shrink-0">
                  <DownloadIcon className="h-3.5 w-3.5" /> Export CSV
                </button>
              </div>

              {/* Per-employee cards */}
              <div className="space-y-3">
                {flaggedEmployees.map((emp) => {
                  const isOpen = expandedFlag === emp.runId;
                  const flaggedServices = emp.services.filter((s) => s.isFlagged);
                  const clearServices = emp.services.filter((s) => !s.isFlagged && (s.userStatus === "not_found" || s.userStatus === "suspended"));
                  return (
                    <div key={emp.runId} className="rounded-xl border border-red-200 bg-card dark:border-red-900/40 overflow-hidden">
                      <button
                        onClick={() => setExpandedFlag(isOpen ? null : emp.runId)}
                        className="flex w-full items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">{emp.employeeName}</p>
                          <p className="text-xs text-muted-foreground">{emp.employeeEmail}</p>
                          <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                            {flaggedServices.map((s) => SERVICES[s.serviceName]?.label || s.serviceName).join(", ")}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-700 dark:bg-red-900/30 dark:text-red-300">
                            {emp.totalFlags} flag{emp.totalFlags !== 1 ? "s" : ""}
                          </span>
                          <ChevronRightIcon className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`} />
                        </div>
                      </button>
                      {isOpen && (
                        <div className="border-t px-4 pb-4 pt-3 space-y-2 bg-muted/10">
                          {flaggedServices.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-red-600 dark:text-red-400 mb-1.5 flex items-center gap-1">
                                <ShieldXIcon className="h-3.5 w-3.5" /> Active — Remove Now
                              </p>
                              {flaggedServices.map((r, i) => <ServiceRow key={i} r={normalizeDetail(r)} />)}
                            </div>
                          )}
                          {clearServices.length > 0 && (
                            <div className="mt-2">
                              <p className="text-xs font-semibold text-green-600 dark:text-green-400 mb-1.5 flex items-center gap-1">
                                <CheckCircleIcon className="h-3.5 w-3.5" /> Confirmed Removed
                              </p>
                              {clearServices.map((r, i) => <ServiceRow key={i} r={normalizeDetail(r)} />)}
                            </div>
                          )}
                          <p className="text-[11px] text-muted-foreground/60 mt-2">
                            Last scanned: {new Date(emp.createdAt).toLocaleString()}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      {/* RUN VIEW */}
      {view === "run" && (
        <>
          <div className="rounded-xl border bg-card p-5">
            <div className="grid gap-3 sm:grid-cols-5">
              <div className="sm:col-span-3">
                <label className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wide">Offboarded Email</label>
                <input type="email" placeholder="name@remoteleverage.com" value={email}
                  onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runAudit()}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wide">Name (optional)</label>
                <input type="text" placeholder="John Smith" value={name}
                  onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runAudit()}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>
            <button onClick={runAudit} disabled={loading || !email.trim()}
              className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? <><Loader2Icon className="h-4 w-4 animate-spin" />Scanning all services...</> : <>
                <ShieldCheckIcon className="h-4 w-4" />Run Offboarding Audit
              </>}
            </button>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-400">
              <XCircleIcon className="h-4 w-4 flex-shrink-0" />{error}
            </div>
          )}

          {grouped && (
            <>
              {/* Summary */}
              <div className={`flex items-center gap-4 rounded-xl border p-4 ${
                grouped.flagged.length > 0
                  ? "border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/20"
                  : "border-green-200 bg-green-50 dark:border-green-900/50 dark:bg-green-950/20"
              }`}>
                {grouped.flagged.length > 0 ? (
                  <ShieldAlertIcon className="h-8 w-8 text-red-500 flex-shrink-0" />
                ) : (
                  <ShieldCheckIcon className="h-8 w-8 text-green-500 flex-shrink-0" />
                )}
                <div className="flex-1">
                  <p className={`text-base font-semibold ${grouped.flagged.length > 0 ? "text-red-800 dark:text-red-300" : "text-green-800 dark:text-green-300"}`}>
                    {grouped.flagged.length > 0
                      ? `${grouped.flagged.length} Active Account${grouped.flagged.length > 1 ? "s" : ""} Found`
                      : "All Checked Services Clear"}
                  </p>
                  <p className="text-xs text-muted-foreground">Scanned for {results?.employee_email}</p>
                </div>
                <button onClick={() => downloadAuditCSV(results!.employee_email, results!.results)}
                  className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted">
                  <DownloadIcon className="h-3 w-3" /> Export
                </button>
              </div>

              {/* KPI row */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border bg-card p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Flagged</p>
                  <p className={`mt-1 text-2xl font-bold ${grouped.flagged.length > 0 ? "text-red-600" : "text-green-600"}`}>{grouped.flagged.length}</p>
                </div>
                <div className="rounded-xl border bg-card p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Cleared</p>
                  <p className="mt-1 text-2xl font-bold text-green-600">{grouped.clear.length}</p>
                </div>
                <div className="rounded-xl border bg-card p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Skipped / Errors</p>
                  <p className="mt-1 text-2xl font-bold text-yellow-600">{grouped.issues.length}</p>
                </div>
              </div>

              {/* Flagged */}
              {grouped.flagged.length > 0 && (
                <div className="rounded-xl border bg-card p-4">
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-red-600 dark:text-red-400">
                    <ShieldXIcon className="h-4 w-4" /> Accounts Still Active — Remove Now
                  </h3>
                  <div className="space-y-2">{grouped.flagged.map((r, i) => <ServiceRow key={i} r={r} />)}</div>
                </div>
              )}

              {/* Clear */}
              {grouped.clear.length > 0 && (
                <div className="rounded-xl border bg-card p-4">
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-green-600 dark:text-green-400">
                    <CheckCircleIcon className="h-4 w-4" /> Confirmed Removed
                  </h3>
                  <div className="space-y-2">{grouped.clear.map((r, i) => <ServiceRow key={i} r={r} />)}</div>
                </div>
              )}



              {/* Issues (errors, skipped, etc) */}
              {grouped.issues.length > 0 && (
                <div className="rounded-xl border bg-card p-4">
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                    <AlertCircleIcon className="h-4 w-4" /> Could Not Verify
                  </h3>
                  <div className="space-y-2">{grouped.issues.map((r, i) => <ServiceRow key={i} r={r} />)}</div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* HISTORY VIEW */}
      {view === "history" && (
        <>
          {selectedRun ? (
            <>
              <button onClick={() => { setSelectedRun(null); setRunDetails([]); }}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                <ChevronLeftIcon className="h-4 w-4" /> Back to history
              </button>
              <div className="rounded-xl border bg-card p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-base font-semibold">{selectedRun.employeeName}</p>
                    <p className="text-sm text-muted-foreground">{selectedRun.employeeEmail}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-xl font-bold ${selectedRun.totalFlags > 0 ? "text-red-600" : "text-green-600"}`}>
                      {selectedRun.totalFlags} flag{selectedRun.totalFlags !== 1 ? "s" : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">{selectedRun.totalServicesChecked} checked</p>
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {new Date(selectedRun.createdAt).toLocaleString()}
                </p>
              </div>
              {runDetails.length > 0 && (
                <div className="flex justify-end">
                  <button onClick={() => downloadAuditCSV(selectedRun.employeeEmail, runDetails)}
                    className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted">
                    <DownloadIcon className="h-3 w-3" /> Export CSV
                  </button>
                </div>
              )}
              <div className="space-y-2">
                {runDetails.map((r, i) => <ServiceRow key={i} r={r} />)}
              </div>
            </>
          ) : (
            <div className="space-y-2">
              {history.length === 0 ? (
                <div className="rounded-xl border bg-card p-8 text-center">
                  <HistoryIcon className="mx-auto h-8 w-8 text-muted-foreground/30" />
                  <p className="mt-2 text-sm text-muted-foreground">No audit runs yet</p>
                </div>
              ) : history.map((run) => (
                <button key={run.id} onClick={() => loadRunDetails(run)}
                  className="flex w-full items-center justify-between rounded-xl border bg-card p-3 text-left transition-colors hover:bg-muted/50">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{run.employeeName || run.employeeEmail}</p>
                    <p className="text-xs text-muted-foreground">{run.employeeEmail}</p>
                    <p className="text-[11px] text-muted-foreground/60 mt-0.5">
                      {new Date(run.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${
                      run.totalFlags > 0 ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    }`}>
                      {run.totalFlags > 0 ? `${run.totalFlags} flag${run.totalFlags > 1 ? "s" : ""}` : "Clear"}
                    </span>
                    <ChevronRightIcon className="h-4 w-4 text-muted-foreground/50" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
