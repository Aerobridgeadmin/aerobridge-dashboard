"use client";

import { CustomSelect } from "@/app/(authenticated)/components/custom-select";
import { useErrorDialog } from "@/app/(authenticated)/components/error-dialog";

import { approveExpenseReport, rejectExpenseReport } from "@/app/actions/hriq/expenses";
import { useMemo, useState, useTransition } from "react";
import { shortDate } from "@/lib/hriq/format";

type Report = {
  id: string;
  title: string;
  description: string | null;
  totalAmount: unknown;
  currency: string;
  status: string;
  submittedAt: Date | null;
  createdAt: Date;
  employee: { id: string; legalFirstName: string; legalLastName: string };
  _count: { items: number };
};

type PaymentRecord = {
  id: string;
  paymentType: string;
  amount: string;
  currency: string;
  status: string;
  periodStart: Date | null;
  periodEnd: Date | null;
  paymentDate: Date | null;
  paymentMethod: string | null;
  hoursWorked: string | null;
  hourlyRate: string | null;
  description: string | null;
  notes: string | null;
  createdAt: Date;
  employee: { id: string; legalFirstName: string; legalLastName: string };
};

// Unified row type for the combined table
type UnifiedRow = {
  id: string;
  type: "payroll" | "expense" | "bonus" | "reimbursement";
  title: string;
  employee: string;
  employeeId: string;
  amount: number;
  currency: string;
  status: string;
  date: Date;
  meta: string;
  original: Report | PaymentRecord;
};

const TYPE_FILTERS = [
  { key: "all", label: "All" },
  { key: "payroll", label: "Payroll" },
  { key: "expense", label: "Expenses" },
  { key: "bonus", label: "Bonuses" },
  { key: "reimbursement", label: "Reimbursements" },
] as const;

const STATUS_FILTERS = [
  { key: "all", label: "All Statuses" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "completed", label: "Completed" },
  { key: "rejected", label: "Rejected" },
] as const;

type TypeFilter = (typeof TYPE_FILTERS)[number]["key"];
type StatusFilter = (typeof STATUS_FILTERS)[number]["key"];

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  submitted: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300",
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  processing: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300",
  approved: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
  completed: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300",
  reimbursed: "bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300",
};

const TYPE_BADGES: Record<string, { cls: string; label: string }> = {
  payroll: { cls: "bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300", label: "Payroll" },
  expense: { cls: "bg-orange-50 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300", label: "Expense" },
  bonus: { cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300", label: "Bonus" },
  reimbursement: { cls: "bg-purple-50 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300", label: "Reimbursement" },
};

function classifyPaymentType(paymentType: string): "payroll" | "bonus" | "reimbursement" {
  const t = paymentType.toLowerCase();
  if (t.includes("bonus") || t.includes("commission")) return "bonus";
  if (t.includes("reimburse") || t.includes("expense")) return "reimbursement";
  return "payroll";
}

export function ExpenseManager({ reports, payments }: { reports: Report[]; payments: PaymentRecord[] }) {
  const [isPending, startTransition] = useTransition();
  const { showError } = useErrorDialog();
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");

  // Build unified rows
  const unified = useMemo<UnifiedRow[]>(() => {
    const rows: UnifiedRow[] = [];

    for (const r of reports) {
      rows.push({
        id: r.id,
        type: "expense",
        title: r.title,
        employee: `${r.employee.legalFirstName} ${r.employee.legalLastName}`,
        employeeId: r.employee.id,
        amount: Number(r.totalAmount),
        currency: r.currency,
        status: r.status,
        date: r.submittedAt ?? r.createdAt,
        meta: `${r._count.items} item${r._count.items !== 1 ? "s" : ""}`,
        original: r,
      });
    }

    for (const p of payments) {
      const type = classifyPaymentType(p.paymentType);
      const period = p.periodStart && p.periodEnd
        ? `${shortDate(p.periodStart)} \u2013 ${shortDate(p.periodEnd)}`
        : p.description ?? p.paymentType;
      const hours = p.hoursWorked ? `${p.hoursWorked}h` : "";
      const rate = p.hourlyRate ? `@ $${p.hourlyRate}/hr` : "";
      const meta = [hours, rate, p.paymentMethod].filter(Boolean).join(" \u00b7 ");

      rows.push({
        id: p.id,
        type,
        title: period,
        employee: `${p.employee.legalFirstName} ${p.employee.legalLastName}`,
        employeeId: p.employee.id,
        amount: Number(p.amount),
        currency: p.currency,
        status: p.status,
        date: p.paymentDate ?? p.createdAt,
        meta,
        original: p,
      });
    }

    rows.sort((a, b) => new Date((b.date as Date | string | number as any)).getTime() - new Date((a.date as Date | string | number as any)).getTime());
    return rows;
  }, [reports, payments]);

  // Apply filters
  const filtered = useMemo(() => {
    let rows = unified;

    if (typeFilter !== "all") {
      rows = rows.filter((r) => r.type === typeFilter);
    }

    if (statusFilter !== "all") {
      rows = rows.filter((r) => {
        if (statusFilter === "pending") return r.status === "pending" || r.status === "submitted" || r.status === "processing";
        if (statusFilter === "approved") return r.status === "approved";
        if (statusFilter === "completed") return r.status === "completed" || r.status === "reimbursed";
        if (statusFilter === "rejected") return r.status === "rejected" || r.status === "failed";
        return true;
      });
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((r) =>
        r.title.toLowerCase().includes(q) ||
        r.employee.toLowerCase().includes(q) ||
        r.meta.toLowerCase().includes(q)
      );
    }

    return rows;
  }, [unified, typeFilter, statusFilter, search]);

  // Summary stats
  const totalPayroll = unified.filter((r) => r.type === "payroll").reduce((s, r) => s + r.amount, 0);
  const totalExpenses = unified.filter((r) => r.type === "expense").reduce((s, r) => s + r.amount, 0);
  const totalBonuses = unified.filter((r) => r.type === "bonus").reduce((s, r) => s + r.amount, 0);
  const totalPending = unified.filter((r) => r.status === "pending" || r.status === "submitted" || r.status === "processing").reduce((s, r) => s + r.amount, 0);

  // Expense approval handlers
  const handleApprove = (id: string) => {
    startTransition(async () => {
      try {
        await approveExpenseReport(id);
      } catch (err) {
        showError({ title: "Error", message: err instanceof Error ? err.message : "Failed to approve expense." });
      }
    });
  };

  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const confirmReject = () => {
    if (!rejectingId || !rejectReason.trim()) return;
    startTransition(async () => {
      try {
        await rejectExpenseReport(rejectingId, rejectReason);
        setRejectingId(null);
      } catch (err) {
        showError({ title: "Error", message: err instanceof Error ? err.message : "Failed to reject expense." });
      }
    });
  };

  const pendingExpenses = unified.filter((r) => r.type === "expense" && r.status === "submitted");

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <button type="button" onClick={() => { setTypeFilter("payroll"); setStatusFilter("all"); }} className={`rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/30 ${typeFilter === "payroll" ? "border-primary ring-1 ring-primary/20" : ""}`}>
          <div className="text-[10px] font-medium text-muted-foreground uppercase">Payroll</div>
          <div className="text-2xl font-bold mt-1 tabular-nums">${totalPayroll.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
          <div className="text-xs text-muted-foreground">{unified.filter((r) => r.type === "payroll").length} payments</div>
        </button>
        <button type="button" onClick={() => { setTypeFilter("expense"); setStatusFilter("all"); }} className={`rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/30 ${typeFilter === "expense" ? "border-primary ring-1 ring-primary/20" : ""}`}>
          <div className="text-[10px] font-medium text-muted-foreground uppercase">Expenses</div>
          <div className="text-2xl font-bold mt-1 tabular-nums">${totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
          <div className="text-xs text-muted-foreground">{reports.length} reports</div>
        </button>
        <button type="button" onClick={() => { setTypeFilter("bonus"); setStatusFilter("all"); }} className={`rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/30 ${typeFilter === "bonus" ? "border-primary ring-1 ring-primary/20" : ""}`}>
          <div className="text-[10px] font-medium text-muted-foreground uppercase">Bonuses</div>
          <div className="text-2xl font-bold mt-1 tabular-nums">${totalBonuses.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
          <div className="text-xs text-muted-foreground">{unified.filter((r) => r.type === "bonus").length} entries</div>
        </button>
        <button type="button" onClick={() => { setTypeFilter("all"); setStatusFilter("pending"); }} className={`rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/30 ${statusFilter === "pending" && typeFilter === "all" ? "border-primary ring-1 ring-primary/20" : ""}`}>
          <div className="text-[10px] font-medium text-muted-foreground uppercase">Pending</div>
          <div className="text-2xl font-bold mt-1 tabular-nums text-amber-600">${totalPending.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
          <div className="text-xs text-muted-foreground">awaiting action</div>
        </button>
      </div>

      {/* Pending Expense Approvals */}
      {pendingExpenses.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20 p-4">
          <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-200">Expense Reports Pending Approval ({pendingExpenses.length})</h3>
          <div className="mt-3 space-y-2">
            {pendingExpenses.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-lg border bg-card p-3">
                <div>
                  <div className="text-sm font-medium">{r.title}</div>
                  <div className="text-xs text-muted-foreground">{r.employee} · {r.meta} · ${r.amount.toLocaleString()} {r.currency}</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleApprove(r.id)} disabled={isPending} className="h-8 rounded-md bg-green-600 px-3 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50">Approve</button>
                  <button onClick={() => { setRejectingId(r.id); setRejectReason(""); }} disabled={isPending} className="h-8 rounded-md border px-3 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50">Reject</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters Bar */}
      <div className="rounded-xl border bg-card p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Type Filter Tabs */}
          <div className="flex flex-wrap gap-1">
            {TYPE_FILTERS.map((f) => {
              const count = f.key === "all" ? unified.length : unified.filter((r) => r.type === f.key).length;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setTypeFilter(f.key)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    typeFilter === f.key
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {f.label}
                  <span className="ml-1 opacity-70">{count}</span>
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            {/* Status Dropdown */}
            <CustomSelect
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as StatusFilter)}
              triggerClassName="h-8 min-w-[120px] text-xs"
              placeholder="All"
              options={STATUS_FILTERS.map((f) => ({ value: f.key, label: f.label }))}
            />
            {/* Search */}
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="h-8 w-40 rounded-md border border-input bg-background px-2 text-xs"
            />
            {/* Clear */}
            {(typeFilter !== "all" || statusFilter !== "all" || search) && (
              <button
                type="button"
                onClick={() => { setTypeFilter("all"); setStatusFilter("all"); setSearch(""); }}
                className="h-8 rounded-md border px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Unified Table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        {/* Desktop Header */}
        <div className="hidden md:grid grid-cols-[1fr_140px_100px_100px_90px_80px] gap-2 px-4 py-2.5 border-b bg-muted/30 text-[10px] font-medium text-muted-foreground uppercase">
          <div>Description</div>
          <div>Contractor</div>
          <div>Type</div>
          <div className="text-right">Amount</div>
          <div>Status</div>
          <div>Date</div>
        </div>

        <div className="divide-y">
          {filtered.map((row) => {
            const badge = TYPE_BADGES[row.type];
            return (
              <div key={`${row.type}-${row.id}`} className="px-4 py-3 hover:bg-muted/20 transition-colors">
                {/* Desktop */}
                <div className="hidden md:grid grid-cols-[1fr_140px_100px_100px_90px_80px] gap-2 items-center">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{row.title}</div>
                    {row.meta && <div className="text-[11px] text-muted-foreground truncate">{row.meta}</div>}
                  </div>
                  <div className="text-sm truncate">{row.employee}</div>
                  <div><span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${badge.cls}`}>{badge.label}</span></div>
                  <div className="text-sm font-semibold tabular-nums text-right">${row.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  <div><span className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${STATUS_COLORS[row.status] ?? ""}`}>{row.status}</span></div>
                  <div className="text-[11px] text-muted-foreground">{shortDate(row.date)}</div>
                </div>

                {/* Mobile */}
                <div className="md:hidden">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{row.title}</span>
                        <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-medium ${badge.cls}`}>{badge.label}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">{row.employee}</div>
                      {row.meta && <div className="text-[11px] text-muted-foreground">{row.meta}</div>}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-semibold tabular-nums">${row.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      <div className="flex items-center justify-end gap-1.5 mt-0.5">
                        <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium capitalize ${STATUS_COLORS[row.status] ?? ""}`}>{row.status}</span>
                        <span className="text-[10px] text-muted-foreground">{shortDate(row.date)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            {unified.length === 0 ? "No expenses or payments recorded yet." : "No results match the current filters."}
          </div>
        )}

        {/* Summary Footer */}
        {filtered.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20">
            <div className="text-xs text-muted-foreground">{filtered.length} of {unified.length} entries</div>
            <div className="text-sm font-bold tabular-nums">
              Total: ${filtered.reduce((s, r) => s + r.amount, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        )}
      </div>

      {/* Reject Dialog */}
      {rejectingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-200" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">Reject Expense Report</h3>
            <div className="mt-3">
              <label className="text-sm font-medium">Reason *</label>
              <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} placeholder="Explain why this report is being rejected..." className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </div>
            <div className="mt-4 flex justify-end gap-3">
              <button onClick={() => setRejectingId(null)} className="h-9 rounded-md border px-4 text-sm">Cancel</button>
              <button onClick={confirmReject} disabled={isPending || !rejectReason.trim()} className="h-9 rounded-md bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">Reject</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
