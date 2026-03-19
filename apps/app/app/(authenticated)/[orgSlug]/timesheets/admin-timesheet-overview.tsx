"use client";

import { useState, useMemo, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { unrejectTimesheet, getTimesheetDetail, approveTimesheet, rejectTimesheet } from "@/app/actions/hriq/timesheets";
import { useErrorDialog } from "@/app/(authenticated)/components/error-dialog";
import { Search, X, Filter, ChevronDown, ChevronUp, ChevronRight, Clock, FileText, DollarSign, CheckCircle2, XCircle } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";

type ContractorRow = {
  id: string;
  employeeNumber: string | null;
  name: string;
  preferredName: string | null;
  secondLastName: string | null;
  workEmail: string | null;
  photoUrl: string | null;
  submissionId: string | null;
  status: "not_started" | "draft" | "submitted" | "approved" | "auto_approved" | "rejected";
  totalHours: number;
  bonusTotal: number;
  submittedAt: Date | null;
  department: string | null;
  orgName: string | null;
};

type Period = {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  status: string;
};

const STATUS_CONFIG: Record<ContractorRow["status"], { label: string; classes: string; order: number }> = {
  not_started:  { label: "Not Started",    classes: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400", order: 5 },
  draft:        { label: "In Progress",    classes: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300", order: 4 },
  submitted:    { label: "Submitted",      classes: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300", order: 3 },
  approved:     { label: "Approved",       classes: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300", order: 1 },
  auto_approved:{ label: "Auto-Approved",  classes: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300", order: 2 },
  rejected:     { label: "Rejected",       classes: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300", order: 0 },
};

type SortKey = "name" | "hours" | "status";
type SortDir = "asc" | "desc";

function fmtHours(h: number) {
  if (h === 0) return "\u2014";
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

function InitialsAvatar({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  if (photoUrl && !photoUrl.endsWith("/logo.png")) {
    return (
      <img
        src={photoUrl}
        alt={name}
        className="h-8 w-8 rounded-full object-cover flex-shrink-0"
        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
      />
    );
  }
  return (
    <div className="h-8 w-8 rounded-md bg-white dark:bg-white/90 p-0.5 flex items-center justify-center flex-shrink-0">
      <img src="/logo.png" alt="RL" className="h-full w-full object-contain" />
    </div>
  );
}

export function AdminTimesheetOverview({
  contractors,
  periods,
  initialPeriodId,
}: {
  contractors: ContractorRow[];
  periods: Period[];
  initialPeriodId: string | null;
}) {
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(initialPeriodId);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ContractorRow["status"] | "all">("all");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [orgFilter, setOrgFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [showFilters, setShowFilters] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { showError } = useErrorDialog();

  // Expanded row state
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [detailCache, setDetailCache] = useState<Record<string, any>>({});
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);

  const handleRowClick = useCallback(async (rowKey: string, submissionId: string | null) => {
    if (expandedKey === rowKey) {
      setExpandedKey(null);
      return;
    }
    setExpandedKey(rowKey);
    if (!submissionId) return; // not_started — nothing to fetch
    if (detailCache[submissionId]) return; // already cached
    setLoadingDetail(submissionId);
    try {
      const detail = await getTimesheetDetail(submissionId);
      if (detail) setDetailCache(prev => ({ ...prev, [submissionId]: detail }));
    } catch (err) {
      console.error("[TimesheetDetail] fetch failed:", err);
    } finally {
      setLoadingDetail(null);
    }
  }, [expandedKey, detailCache]);

  const handleApprove = (submissionId: string) => {
    startTransition(async () => {
      try {
        const result = await approveTimesheet(submissionId);
        if (result && "error" in result) throw new Error((result as any).error);
        router.refresh();
      } catch (err) {
        showError({ title: "Error", message: err instanceof Error ? err.message : "Failed to approve." });
      }
    });
  };

  const handleReject = (submissionId: string) => {
    const reason = prompt("Rejection reason:");
    if (!reason) return;
    startTransition(async () => {
      try {
        const result = await rejectTimesheet(submissionId, reason);
        if (result && "error" in result) throw new Error((result as any).error);
        router.refresh();
      } catch (err) {
        showError({ title: "Error", message: err instanceof Error ? err.message : "Failed to reject." });
      }
    });
  };

  const handleUnreject = (submissionId: string) => {
    startTransition(async () => {
      try {
        const result = await unrejectTimesheet(submissionId);
        if (result && "error" in result) throw new Error(result.error ?? "Failed to unreject");
        router.refresh();
      } catch (err) {
        showError({ title: "Error", message: err instanceof Error ? err.message : "Failed to unreject timesheet." });
      }
    });
  };

  const selectedPeriod = periods.find(p => p.id === (selectedPeriodId ?? periods[0]?.id)) ?? null;

  // Derive unique departments and orgs for filter dropdowns
  const departments = useMemo(() => {
    const set = new Set<string>();
    contractors.forEach(c => { if (c.department) set.add(c.department); });
    return Array.from(set).sort();
  }, [contractors]);

  const orgs = useMemo(() => {
    const set = new Set<string>();
    contractors.forEach(c => { if (c.orgName) set.add(c.orgName); });
    return Array.from(set).sort();
  }, [contractors]);

  // Period-scoped rows (before search/status filter)
  const effectivePeriodId = selectedPeriodId ?? periods[0]?.id ?? null;
  const periodRows = useMemo(() => {
    return effectivePeriodId
      ? contractors.filter(c => (c as any).periodId === effectivePeriodId)
      : contractors;
  }, [contractors, effectivePeriodId]);

  // Apply all filters + sort
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    let rows = periodRows;

    if (q) {
      rows = rows.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.preferredName ?? "").toLowerCase().includes(q) ||
        (c.secondLastName ?? "").toLowerCase().includes(q) ||
        (c.workEmail ?? "").toLowerCase().includes(q) ||
        (c.employeeNumber ?? "").toLowerCase().includes(q) ||
        (c.department ?? "").toLowerCase().includes(q) ||
        (c.orgName ?? "").toLowerCase().includes(q)
      );
    }

    if (statusFilter !== "all") {
      rows = rows.filter(c => c.status === statusFilter);
    }

    if (departmentFilter !== "all") {
      rows = rows.filter(c => c.department === departmentFilter);
    }

    if (orgFilter !== "all") {
      rows = rows.filter(c => c.orgName === orgFilter);
    }

    return [...rows].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "hours") cmp = a.totalHours - b.totalHours;
      else if (sortKey === "status") cmp = (STATUS_CONFIG[a.status]?.order ?? 5) - (STATUS_CONFIG[b.status]?.order ?? 5);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [periodRows, search, statusFilter, departmentFilter, orgFilter, sortKey, sortDir]);

  // Summary counts (period-scoped, not filtered by search/status)
  const total = periodRows.length;
  const submitted = periodRows.filter(c => ["submitted", "approved", "auto_approved"].includes(c.status)).length;
  const approved = periodRows.filter(c => ["approved", "auto_approved"].includes(c.status)).length;
  const totalHours = periodRows.reduce((sum, c) => sum + c.totalHours, 0);

  const activeFilterCount = [statusFilter !== "all", departmentFilter !== "all", orgFilter !== "all"].filter(Boolean).length;
  const hasAnyFilter = !!(search || statusFilter !== "all" || departmentFilter !== "all" || orgFilter !== "all");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronDown className="h-3 w-3 opacity-30" />;
    return sortDir === "asc"
      ? <ChevronUp className="h-3 w-3 text-primary" />
      : <ChevronDown className="h-3 w-3 text-primary" />;
  };

  const clearAllFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setDepartmentFilter("all");
    setOrgFilter("all");
  };

  return (
    <div className="space-y-4">
      {/* Period selector */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-muted-foreground whitespace-nowrap">Pay Period</label>
          <Select value={selectedPeriodId ?? periods[0]?.id ?? ""} onValueChange={v => setSelectedPeriodId(v)}>
            <SelectTrigger className="h-9 min-w-[240px] text-sm">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              {periods
                .filter(p => new Date(p.startDate).toISOString().split("T")[0] <= new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }))
                .map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {selectedPeriod && (
          <span className="text-xs text-muted-foreground">
            {new Date(selectedPeriod.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
            {" \u2013 "}
            {new Date(selectedPeriod.endDate).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
          </span>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Total Contractors" value={String(total)} />
        <SummaryCard label="Submitted" value={`${submitted} / ${total}`} />
        <SummaryCard label="Approved" value={`${approved} / ${total}`} accent="emerald" />
        <SummaryCard label="Total Hours" value={fmtHours(totalHours)} />
      </div>

      {/* Search + filter toggle */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, nickname, email, ID..."
            className="h-9 w-full rounded-lg border bg-background pl-9 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowFilters(f => !f)}
          className={`inline-flex items-center gap-1.5 h-9 rounded-lg border px-3 text-sm font-medium transition-colors ${showFilters || activeFilterCount > 0 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background text-muted-foreground hover:text-foreground"}`}
        >
          <Filter className="h-3.5 w-3.5" />
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-0.5 inline-flex items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground leading-none px-1.5 py-0.5">
              {activeFilterCount}
            </span>
          )}
        </button>

        {hasAnyFilter && (
          <>
            <span className="text-xs text-muted-foreground tabular-nums">{filtered.length} of {total}</span>
            <button
              type="button"
              onClick={clearAllFilters}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              Clear all
            </button>
          </>
        )}
      </div>

      {/* Expandable filter row */}
      {showFilters && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/20 px-4 py-3">
          <div className="flex items-center gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <Select value={statusFilter} onValueChange={v => setStatusFilter(v as any)}>
              <SelectTrigger className="h-8 text-xs min-w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="not_started">Not Started</SelectItem>
                <SelectItem value="draft">In Progress</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="auto_approved">Auto-Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {departments.length > 0 && (
            <div className="flex items-center gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Department</label>
              <Select value={departmentFilter} onValueChange={v => setDepartmentFilter(v)}>
                <SelectTrigger className="h-8 text-xs max-w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All departments</SelectItem>
                  {departments.map(d => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {orgs.length > 1 && (
            <div className="flex items-center gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Organization</label>
              <Select value={orgFilter} onValueChange={v => setOrgFilter(v)}>
                <SelectTrigger className="h-8 text-xs max-w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All organizations</SelectItem>
                  {orgs.map(o => (
                    <SelectItem key={o} value={o}>{o}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}

      {/* Contractor table */}
      <div className="rounded-xl border overflow-hidden">
        {/* Sortable header */}
        <div className="grid grid-cols-[auto_1fr_auto_auto] sm:grid-cols-[auto_1fr_auto_auto_auto] gap-x-4 px-4 py-2 bg-muted/30 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          <div className="col-span-1 hidden sm:block">#</div>
          <button type="button" onClick={() => toggleSort("name")} className="flex items-center gap-1 text-left uppercase">
            Contractor <SortIcon col="name" />
          </button>
          <button type="button" onClick={() => toggleSort("hours")} className="flex items-center justify-end gap-1 uppercase">
            Hours <SortIcon col="hours" />
          </button>
          <div className="text-right hidden sm:block uppercase">Bonus</div>
          <button type="button" onClick={() => toggleSort("status")} className="flex items-center justify-end gap-1 uppercase">
            Status <SortIcon col="status" />
          </button>
        </div>

        {filtered.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            {hasAnyFilter
              ? "No contractors match the current filters."
              : total === 0 ? "No active contractors found." : "No submissions for this period."
            }
          </div>
        ) : (
          <div className="divide-y">
            {filtered.map(c => {
              const cfg = STATUS_CONFIG[c.status] ?? STATUS_CONFIG.not_started;
              const rowKey = c.id + (c.submissionId ?? "") + ((c as any).periodId ?? "");
              const isExpanded = expandedKey === rowKey;
              const detail = c.submissionId ? detailCache[c.submissionId] : null;
              const isLoading = loadingDetail === c.submissionId;
              const isClickable = c.status !== "not_started";

              return (
                <div key={rowKey}>
                  <div
                    className={`grid grid-cols-[auto_1fr_auto_auto] sm:grid-cols-[auto_1fr_auto_auto_auto] gap-x-4 px-4 py-3 items-center transition-colors ${isClickable ? "cursor-pointer hover:bg-muted/30" : "hover:bg-muted/10"} ${isExpanded ? "bg-muted/20" : ""}`}
                    onClick={() => isClickable && handleRowClick(rowKey, c.submissionId)}
                  >
                    <div className="text-xs text-muted-foreground font-mono hidden sm:block">
                      {c.employeeNumber ?? "\u2014"}
                    </div>

                    <div className="flex items-center gap-2.5 min-w-0">
                      {isClickable && (
                        <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`} />
                      )}
                      <InitialsAvatar name={c.name} photoUrl={c.photoUrl} />
                      <div className="min-w-0">
                        <span className="text-sm font-medium truncate block">{c.name}</span>
                        {(c.department || c.orgName) && (
                          <span className="text-[11px] text-muted-foreground truncate block">
                            {[c.department, c.orgName].filter(Boolean).join(" \u00B7 ")}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-right text-sm tabular-nums font-medium">
                      {fmtHours(c.totalHours)}
                    </div>

                    <div className="text-right text-sm tabular-nums text-muted-foreground hidden sm:block">
                      {c.bonusTotal > 0 ? `+$${c.bonusTotal.toFixed(2)}` : "\u2014"}
                    </div>

                    <div className="flex items-center justify-end gap-2">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.classes}`}>
                        {cfg.label}
                      </span>
                      {c.status === "rejected" && c.submissionId && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleUnreject(c.submissionId!); }}
                          disabled={isPending}
                          className="rounded-md border border-amber-200 dark:border-amber-800 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 disabled:opacity-50 transition-colors"
                        >
                          {isPending ? "..." : "Unreject"}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded detail panel */}
                  {isExpanded && (
                    <div className="bg-muted/10 border-t px-6 py-4 animate-in slide-in-from-top-1 fade-in duration-150">
                      {isLoading ? (
                        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                          Loading timesheet details...
                        </div>
                      ) : !detail ? (
                        <p className="py-2 text-sm text-muted-foreground">No submission data available.</p>
                      ) : (
                        <TimesheetDetailPanel detail={detail} status={c.status} submissionId={c.submissionId!} onApprove={handleApprove} onReject={handleReject} isPending={isPending} />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {filtered.some(c => c.status === "not_started") && (
        <p className="text-xs text-muted-foreground">
          Contractors marked "Not Started" are active but have not yet begun their timesheet for this period.
        </p>
      )}
    </div>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: string; accent?: "emerald" }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${accent === "emerald" ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
        {value}
      </p>
    </div>
  );
}

type DailyEntry = { date: string; timeIn?: string; timeOut?: string; hours: number; note?: string; tdHours?: number };
type BonusEntry = { description: string; amount: number };

function TimesheetDetailPanel({
  detail,
  status,
  submissionId,
  onApprove,
  onReject,
  isPending,
}: {
  detail: any;
  status: string;
  submissionId: string;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  isPending: boolean;
}) {
  const dailyEntries: DailyEntry[] = Array.isArray(detail.dailyEntries) ? detail.dailyEntries : [];
  const bonuses: BonusEntry[] = Array.isArray(detail.bonuses) ? detail.bonuses : [];
  const hasDaily = dailyEntries.length > 0;
  const totalHours = Number(detail.totalHours ?? 0);
  const bonusTotal = Number(detail.bonusTotal ?? 0);
  const rate = detail.employee?.hourlyRate ? Number(detail.employee.hourlyRate) : null;
  const currency = detail.employee?.currency ?? "USD";

  // Legacy Mon-Sun hours
  const legacyDays = [
    { day: "Mon", hours: Number(detail.mondayHours ?? 0), start: detail.mondayStart },
    { day: "Tue", hours: Number(detail.tuesdayHours ?? 0), start: detail.tuesdayStart },
    { day: "Wed", hours: Number(detail.wednesdayHours ?? 0), start: detail.wednesdayStart },
    { day: "Thu", hours: Number(detail.thursdayHours ?? 0), start: detail.thursdayStart },
    { day: "Fri", hours: Number(detail.fridayHours ?? 0), start: detail.fridayStart },
    { day: "Sat", hours: Number(detail.saturdayHours ?? 0), start: detail.saturdayStart },
    { day: "Sun", hours: Number(detail.sundayHours ?? 0), start: detail.sundayStart },
  ];
  const hasLegacy = !hasDaily && legacyDays.some(d => d.hours > 0);

  const fmtDate = (d: string) => {
    try {
      return new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    } catch { return d; }
  };

  return (
    <div className="space-y-4">
      {/* Period info */}
      {detail.period && (
        <div className="text-xs text-muted-foreground">
          {detail.period.name} ({new Date(detail.period.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} - {new Date(detail.period.endDate).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })})
          {detail.submittedAt && <> | Submitted {new Date(detail.submittedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</>}
        </div>
      )}

      {/* Daily entries table */}
      {hasDaily && (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30 text-xs text-muted-foreground uppercase">
                <th className="px-3 py-2 text-left font-medium">Date</th>
                <th className="px-3 py-2 text-left font-medium">Time In</th>
                <th className="px-3 py-2 text-right font-medium">Hours</th>
                <th className="px-3 py-2 text-left font-medium">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {dailyEntries.map((entry, i) => {
                const isModified = entry.tdHours != null && Math.round(entry.hours * 60) !== Math.round(entry.tdHours * 60);
                return (
                  <tr key={i} className={`${entry.hours === 0 ? "text-muted-foreground/50" : ""} ${isModified ? "bg-amber-50/50 dark:bg-amber-950/10" : ""}`}>
                    <td className="px-3 py-1.5 text-xs">{fmtDate(entry.date)}</td>
                    <td className="px-3 py-1.5 text-xs tabular-nums">{entry.timeIn || "\u2014"}</td>
                    <td className="px-3 py-1.5 text-xs tabular-nums text-right font-medium">
                      {entry.hours > 0 ? fmtHours(entry.hours) : "\u2014"}
                      {isModified && (
                        <span className="ml-1 text-[9px] text-amber-600 dark:text-amber-400" title={`Time Doctor: ${fmtHours(entry.tdHours!)}`}>
                          (TD: {fmtHours(entry.tdHours!)})
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground truncate max-w-[200px]">
                      {isModified && <span className="text-amber-600 dark:text-amber-400 font-medium">✎ </span>}
                      {entry.note || ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-muted/20 font-semibold">
                <td className="px-3 py-2 text-xs" colSpan={2}>Total</td>
                <td className="px-3 py-2 text-xs text-right tabular-nums">{fmtHours(totalHours)}</td>
                <td className="px-3 py-2"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Legacy Mon-Sun display */}
      {hasLegacy && (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30 text-xs text-muted-foreground uppercase">
                {legacyDays.map(d => <th key={d.day} className="px-2 py-2 text-center font-medium">{d.day}</th>)}
                <th className="px-2 py-2 text-center font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                {legacyDays.map(d => (
                  <td key={d.day} className="px-2 py-1.5 text-center text-xs tabular-nums">
                    {d.hours > 0 ? fmtHours(d.hours) : "\u2014"}
                    {d.start && <div className="text-[10px] text-muted-foreground">{d.start}</div>}
                  </td>
                ))}
                <td className="px-2 py-1.5 text-center text-xs tabular-nums font-semibold">{fmtHours(totalHours)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Bonuses */}
      {bonuses.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium">Bonuses / Commissions</span>
          </div>
          <div className="rounded-lg border divide-y">
            {bonuses.map((b, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-1.5 text-xs">
                <span>{b.description}</span>
                <span className="font-medium tabular-nums">${b.amount.toFixed(2)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between px-3 py-2 text-xs font-semibold bg-muted/20">
              <span>Bonus Total</span>
              <span className="tabular-nums">${bonusTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Notes */}
      {detail.notes && (
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium">Notes</span>
          </div>
          <p className="text-xs text-muted-foreground bg-muted/20 rounded-md px-3 py-2 whitespace-pre-wrap">{detail.notes}</p>
        </div>
      )}

      {/* Earnings summary */}
      {rate && totalHours > 0 && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>{fmtHours(totalHours)} x ${rate.toFixed(2)}/{currency} = <span className="font-semibold text-foreground">${(totalHours * rate).toFixed(2)}</span></span>
          {bonusTotal > 0 && <span>+ ${bonusTotal.toFixed(2)} bonus = <span className="font-semibold text-foreground">${(totalHours * rate + bonusTotal).toFixed(2)}</span></span>}
        </div>
      )}

      {/* Action buttons */}
      {(status === "submitted") && (
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onApprove(submissionId); }}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Approve
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onReject(submissionId); }}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-md border border-red-200 dark:border-red-800 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
          >
            <XCircle className="h-3.5 w-3.5" /> Reject
          </button>
        </div>
      )}
    </div>
  );
}
