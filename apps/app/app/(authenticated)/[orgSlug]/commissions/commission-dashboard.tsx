"use client";

import { useState, useTransition, useMemo, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CustomSelect } from "@/app/(authenticated)/components/custom-select";
import {
  createCommission,
  approveCommission,
  rejectCommission,
  deleteCommission,
  bulkApproveCommissions,
  bulkCreateCommissions,
} from "@/app/actions/hriq/commissions";
import {
  syncCommissionsFromQBAndRCRM,
  type SyncResult,
} from "@/app/actions/hriq/commission-sync";

// ─── Types ────────────────────────────────────────────────────────────────────

type Employee = {
  id: string;
  legalFirstName: string;
  legalLastName: string;
  preferredName: string | null;
  department: string | null;
  photoUrl?: string | null;
};

type CommissionRow = {
  id: string;
  commissionType: string;
  commissionTier: string;
  employeeId: string;
  clientName: string | null;
  revenueAmount: string | null;
  qbPaymentRef: string | null;
  qbVendorName: string | null;
  qbPaymentAmount: string | null;
  qbPaymentDate: string | null;
  qbInvoiceNumber: string | null;
  commissionRate: string;
  commissionAmount: string;
  currency: string;
  status: string;
  assignedByName: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  description: string | null;
  notes: string | null;
  createdAt: string;
  employee: Employee;
};

type Stats = {
  pending: { count: number; total: number };
  approved: { count: number; total: number };
  paid: { count: number; total: number };
};

type Props = {
  commissions: CommissionRow[];
  employees: Employee[];
  stats: Stats;
  canManage: boolean;
  role: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const TIER_LABELS: Record<string, string> = {
  standard: "Standard (0.6%)",
  bundle: "Bundle (1%)",
  ae: "Account Exec (1.2%)",
  bundle_ae: "Bundle+AE (2%)",
  ppp: "PPP (2%)",
  bundle_fill: "Bundle Fill ($20)",
};

const TIER_RATES: Record<string, number> = {
  standard: 0.006,
  bundle: 0.01,
  ae: 0.012,
  bundle_ae: 0.02,
  ppp: 0.02,
  bundle_fill: 0,
};

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  paid: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
};

const fmt = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

// ─── Component ────────────────────────────────────────────────────────────────

export function CommissionDashboard({ commissions, employees, stats, canManage, role }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [filter, setFilter] = useState<{ status: string; employee: string; tier: string }>({
    status: "all",
    employee: "all",
    tier: "all",
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showSync, setShowSync] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }, []);

  // ─── Auto-refresh every 5 minutes ───
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  useEffect(() => {
    const interval = setInterval(() => {
      router.refresh();
      setLastRefreshed(new Date());
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [router]);

  // ─── Filtered data ───
  const filtered = useMemo(() => {
    return commissions.filter((c) => {
      if (filter.status !== "all" && c.status !== filter.status) return false;
      if (filter.employee !== "all" && c.employeeId !== filter.employee) return false;
      if (filter.tier !== "all" && c.commissionTier !== filter.tier) return false;
      return true;
    });
  }, [commissions, filter]);

  const uniqueEmployees = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of commissions) {
      const name = c.employee.preferredName ?? c.employee.legalFirstName;
      map.set(c.employeeId, name);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [commissions]);

  const filteredTotal = useMemo(
    () => filtered.reduce((s, c) => s + Number(c.commissionAmount), 0),
    [filtered]
  );

  // ─── Actions ───
  const handleApprove = (id: string) => {
    startTransition(async () => {
      const res = await approveCommission(id);
      if (res.approved) {
        showToast(`Approved ${fmt(res.amount)} for ${res.employeeName}${res.addedToTimesheet ? " (added to timesheet)" : ""}`);
        router.refresh();
      }
    });
  };

  const handleReject = (id: string) => {
    const reason = prompt("Rejection reason (optional):");
    if (reason === null) return;
    startTransition(async () => {
      await rejectCommission(id, reason || undefined);
      showToast("Commission rejected");
      router.refresh();
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm("Delete this commission entry?")) return;
    startTransition(async () => {
      await deleteCommission(id);
      showToast("Commission deleted");
      router.refresh();
    });
  };

  const handleBulkApprove = () => {
    if (selected.size === 0) return;
    if (!confirm(`Approve ${selected.size} commission(s)?`)) return;
    startTransition(async () => {
      const res = await bulkApproveCommissions(Array.from(selected));
      showToast(`${res.approved} approved, ${res.failed} failed`);
      setSelected(new Set());
      router.refresh();
    });
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const pending = filtered.filter((c) => c.status === "pending").map((c) => c.id);
    if (selected.size >= pending.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(pending));
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground shadow-lg animate-in slide-in-from-bottom-2">
          {toast}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Pending" count={stats.pending.count} total={stats.pending.total} color="amber" />
        <StatCard label="Approved" count={stats.approved.count} total={stats.approved.total} color="emerald" />
        <StatCard label="Paid Out" count={stats.paid.count} total={stats.paid.total} color="blue" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <CustomSelect
          value={filter.status}
          onValueChange={(v) => setFilter((f) => ({ ...f, status: v }))}
          triggerClassName="h-8 min-w-[130px]"
          placeholder="All Statuses"
          options={[
            { value: "all", label: "All Statuses" },
            { value: "pending", label: "Pending" },
            { value: "approved", label: "Approved" },
            { value: "rejected", label: "Rejected" },
            { value: "paid", label: "Paid" },
          ]}
        />
        <CustomSelect
          value={filter.employee}
          onValueChange={(v) => setFilter((f) => ({ ...f, employee: v }))}
          triggerClassName="h-8 min-w-[160px]"
          placeholder="All Team Members"
          options={[
            { value: "all", label: "All Team Members" },
            ...uniqueEmployees.map(([id, name]) => ({ value: id, label: name })),
          ]}
        />
        <CustomSelect
          value={filter.tier}
          onValueChange={(v) => setFilter((f) => ({ ...f, tier: v }))}
          triggerClassName="h-8 min-w-[130px]"
          placeholder="All Tiers"
          options={[
            { value: "all", label: "All Tiers" },
            ...Object.entries(TIER_LABELS).map(([k, v]) => ({ value: k, label: v })),
          ]}
        />

        <div className="ml-auto flex gap-2">
          {selected.size > 0 && (
            <button
              onClick={handleBulkApprove}
              disabled={isPending}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Approve {selected.size} Selected
            </button>
          )}
          {canManage && (
            <>
              <button
                onClick={() => setShowSync(true)}
                className="rounded-md border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50"
              >
                QB + CRM Sync
              </button>
              <button
                onClick={() => setShowImport(true)}
                className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
              >
                Import CSV
              </button>
              <button
                onClick={() => setShowAdd(true)}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                + Add Commission
              </button>
            </>
          )}
        </div>
      </div>

      {/* Summary line */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Showing {filtered.length} commission{filtered.length !== 1 ? "s" : ""} &middot; Total: {fmt(filteredTotal)}
        </p>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground/60 tabular-nums">
            Updated {lastRefreshed.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
          </span>
          <button
            onClick={() => { router.refresh(); setLastRefreshed(new Date()); }}
            disabled={isPending}
            className="rounded-md p-1 text-muted-foreground/60 hover:bg-muted hover:text-foreground disabled:opacity-50 transition-colors"
            title="Refresh now"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="min-w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              {canManage && (
                <th className="w-8 p-2">
                  <input type="checkbox" onChange={toggleAll} checked={selected.size > 0 && selected.size >= filtered.filter((c) => c.status === "pending").length} />
                </th>
              )}
              <th className="p-2 text-left font-medium">Team Member</th>
              <th className="p-2 text-left font-medium">Client</th>
              <th className="p-2 text-right font-medium">Revenue</th>
              <th className="p-2 text-left font-medium">Tier</th>
              <th className="p-2 text-right font-medium">Commission</th>
              <th className="p-2 text-left font-medium">Status</th>
              <th className="p-2 text-left font-medium">Date</th>
              {canManage && <th className="p-2 text-right font-medium">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={canManage ? 9 : 7} className="p-8 text-center text-muted-foreground">
                  No commissions found
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr key={c.id} className={`hover:bg-muted/30 ${selected.has(c.id) ? "bg-primary/5" : ""}`}>
                  {canManage && (
                    <td className="p-2">
                      {c.status === "pending" && (
                        <input
                          type="checkbox"
                          checked={selected.has(c.id)}
                          onChange={() => toggleSelect(c.id)}
                        />
                      )}
                    </td>
                  )}
                  <td className="p-2 font-medium">
                    {c.employee.preferredName ?? c.employee.legalFirstName} {c.employee.legalLastName}
                  </td>
                  <td className="p-2 text-muted-foreground">{c.clientName ?? "—"}</td>
                  <td className="p-2 text-right tabular-nums">{c.revenueAmount ? fmt(Number(c.revenueAmount)) : "—"}</td>
                  <td className="p-2">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                      {TIER_LABELS[c.commissionTier] ?? c.commissionTier}
                    </span>
                  </td>
                  <td className="p-2 text-right font-semibold tabular-nums">{fmt(Number(c.commissionAmount))}</td>
                  <td className="p-2">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[c.status] ?? ""}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="p-2 text-muted-foreground text-xs">
                    {new Date(c.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </td>
                  {canManage && (
                    <td className="p-2 text-right">
                      {c.status === "pending" && (
                        <div className="flex justify-end gap-1">
                          <button onClick={() => handleApprove(c.id)} disabled={isPending} className="rounded px-2 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 disabled:opacity-50">
                            Approve
                          </button>
                          <button onClick={() => handleReject(c.id)} disabled={isPending} className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50">
                            Reject
                          </button>
                          <button onClick={() => handleDelete(c.id)} disabled={isPending} className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50">
                            ×
                          </button>
                        </div>
                      )}
                      {c.status === "approved" && (
                        <span className="text-xs text-muted-foreground">by {c.approvedByName ?? "—"}</span>
                      )}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Commission Dialog */}
      {showAdd && (
        <AddCommissionDialog
          employees={employees}
          onClose={() => setShowAdd(false)}
          onSuccess={(msg) => { setShowAdd(false); showToast(msg); router.refresh(); }}
        />
      )}

      {/* Import Dialog */}
      {showImport && (
        <ImportDialog
          onClose={() => setShowImport(false)}
          onSuccess={(msg) => { setShowImport(false); showToast(msg); router.refresh(); }}
        />
      )}

      {/* QB + CRM Sync Dialog */}
      {showSync && (
        <SyncDialog
          onClose={() => setShowSync(false)}
          onSuccess={(msg) => { setShowSync(false); showToast(msg); router.refresh(); }}
        />
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const bg = color === "amber" ? "bg-amber-50 dark:bg-amber-950/20" :
    color === "emerald" ? "bg-emerald-50 dark:bg-emerald-950/20" :
    "bg-blue-50 dark:bg-blue-950/20";
  const text = color === "amber" ? "text-amber-700 dark:text-amber-300" :
    color === "emerald" ? "text-emerald-700 dark:text-emerald-300" :
    "text-blue-700 dark:text-blue-300";

  return (
    <div className={`rounded-lg border p-4 ${bg}`}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${text}`}>{fmt(total)}</p>
      <p className="text-xs text-muted-foreground">{count} commission{count !== 1 ? "s" : ""}</p>
    </div>
  );
}

function AddCommissionDialog({
  employees,
  onClose,
  onSuccess,
}: {
  employees: Employee[];
  onClose: () => void;
  onSuccess: (msg: string) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    employeeId: "",
    tier: "standard",
    clientName: "",
    revenueAmount: "",
    commissionOverride: "",
    notes: "",
  });

  const autoAmount = useMemo(() => {
    const rev = Number(form.revenueAmount) || 0;
    if (form.tier === "bundle_fill") return 20;
    const rate = TIER_RATES[form.tier] ?? 0.006;
    return Number((rev * rate).toFixed(2));
  }, [form.tier, form.revenueAmount]);

  const handleSubmit = () => {
    if (!form.employeeId) return;
    startTransition(async () => {
      try {
        await createCommission({
          employeeId: form.employeeId,
          commissionTier: form.tier,
          clientName: form.clientName || undefined,
          revenueAmount: Number(form.revenueAmount) || undefined,
          commissionAmount: Number(form.commissionOverride) || autoAmount,
          notes: form.notes || undefined,
        });
        onSuccess("Commission created");
      } catch (err: any) {
        alert(err.message);
      }
    });
  };

  return (
    <Overlay onClose={onClose} title="Add Commission">
      <div className="space-y-3">
        <div>
          <span className="text-xs font-medium">Team Member *</span>
          <CustomSelect
            value={form.employeeId}
            onValueChange={(v) => setForm((f) => ({ ...f, employeeId: v }))}
            triggerClassName="mt-1 h-9 w-full"
            placeholder="Select..."
            options={employees.map((e) => ({
              value: e.id,
              label: `${e.preferredName ?? e.legalFirstName} ${e.legalLastName}`,
            }))}
          />
        </div>
        <div>
          <span className="text-xs font-medium">Commission Tier *</span>
          <CustomSelect
            value={form.tier}
            onValueChange={(v) => setForm((f) => ({ ...f, tier: v }))}
            triggerClassName="mt-1 h-9 w-full"
            placeholder="Select tier..."
            options={Object.entries(TIER_LABELS).map(([k, v]) => ({ value: k, label: v }))}
          />
        </div>
        <label className="block">
          <span className="text-xs font-medium">Client Name</span>
          <input
            type="text"
            className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={form.clientName}
            onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))}
            placeholder="e.g. John Smith"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium">Revenue Amount ($)</span>
          <input
            type="number"
            step="0.01"
            className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={form.revenueAmount}
            onChange={(e) => setForm((f) => ({ ...f, revenueAmount: e.target.value }))}
            placeholder="0.00"
          />
        </label>
        <div className="rounded-md bg-muted/50 p-3">
          <p className="text-xs text-muted-foreground">
            Auto-calculated: <span className="font-semibold text-foreground">{fmt(autoAmount)}</span>
          </p>
          <label className="mt-2 block">
            <span className="text-xs font-medium">Override Amount (optional)</span>
            <input
              type="number"
              step="0.01"
              className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={form.commissionOverride}
              onChange={(e) => setForm((f) => ({ ...f, commissionOverride: e.target.value }))}
              placeholder={autoAmount.toString()}
            />
          </label>
        </div>
        <label className="block">
          <span className="text-xs font-medium">Notes</span>
          <textarea
            className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm"
            rows={2}
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="rounded-md border px-4 py-2 text-sm hover:bg-muted">Cancel</button>
          <button onClick={handleSubmit} disabled={isPending || !form.employeeId} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
            {isPending ? "Creating..." : "Create Commission"}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

function ImportDialog({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (msg: string) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [csvText, setCsvText] = useState("");
  const [preview, setPreview] = useState<any[]>([]);

  const parseCSV = () => {
    const lines = csvText.trim().split("\n").filter(Boolean);
    if (lines.length < 2) return;
    const rows = lines.slice(1).map((line) => {
      const cols = line.split(",").map((c) => c.trim());
      return {
        employeeName: cols[0] ?? "",
        clientName: cols[1] ?? "",
        revenueAmount: Number(cols[2]) || 0,
        commissionTier: cols[3] ?? "standard",
        commissionAmount: Number(cols[4]) || 0,
        date: cols[5] ?? undefined,
      };
    }).filter((r) => r.employeeName);
    setPreview(rows);
  };

  const handleImport = () => {
    if (preview.length === 0) return;
    startTransition(async () => {
      try {
        const res = await bulkCreateCommissions(preview);
        onSuccess(`Imported ${res.created}, skipped ${res.skipped}${res.errors.length > 0 ? `. Errors: ${res.errors.slice(0, 3).join("; ")}` : ""}`);
      } catch (err: any) {
        alert(err.message);
      }
    });
  };

  return (
    <Overlay onClose={onClose} title="Import Commissions from CSV">
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Format: <code className="rounded bg-muted px-1">TeamMember,Client,Revenue,Tier,Commission,Date</code><br />
          Tiers: standard, bundle, ae, bundle_ae, ppp, bundle_fill
        </p>
        <textarea
          className="block w-full rounded-md border bg-background px-3 py-2 text-sm font-mono"
          rows={8}
          placeholder={"TeamMember,Client,Revenue,Tier,Commission,Date\nSam,Guy Mitchell,4154,bundle,41.54,2026-03-02"}
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
        />
        <div className="flex gap-2">
          <button onClick={parseCSV} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">Preview</button>
          {preview.length > 0 && (
            <span className="text-xs text-muted-foreground self-center">{preview.length} entries parsed</span>
          )}
        </div>
        {preview.length > 0 && (
          <div className="max-h-40 overflow-y-auto rounded border text-xs">
            <table className="w-full">
              <thead className="bg-muted/50"><tr>
                <th className="p-1">Member</th><th className="p-1">Client</th><th className="p-1">Rev</th><th className="p-1">Tier</th><th className="p-1">Comm</th>
              </tr></thead>
              <tbody>{preview.slice(0, 10).map((r, i) => (
                <tr key={i} className="border-t">
                  <td className="p-1">{r.employeeName}</td><td className="p-1">{r.clientName}</td>
                  <td className="p-1">{r.revenueAmount}</td><td className="p-1">{r.commissionTier}</td>
                  <td className="p-1">{r.commissionAmount}</td>
                </tr>
              ))}</tbody>
            </table>
            {preview.length > 10 && <p className="p-1 text-center text-muted-foreground">...and {preview.length - 10} more</p>}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="rounded-md border px-4 py-2 text-sm hover:bg-muted">Cancel</button>
          <button onClick={handleImport} disabled={isPending || preview.length === 0} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
            {isPending ? "Importing..." : `Import ${preview.length} Entries`}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

function SyncDialog({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (msg: string) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [sinceDays, setSinceDays] = useState("90");
  const [mode, setMode] = useState<"config" | "preview" | "done">("config");

  const handlePreview = () => {
    startTransition(async () => {
      try {
        const res = await syncCommissionsFromQBAndRCRM({
          dryRun: true,
          sinceDays: Number(sinceDays) || 90,
        });
        setSyncResult(res);
        setMode("preview");
      } catch (err: any) {
        alert(`Sync preview failed: ${err.message}`);
      }
    });
  };

  const handleSync = () => {
    if (!confirm("This will create commission entries for all matched invoices. Continue?")) return;
    startTransition(async () => {
      try {
        const res = await syncCommissionsFromQBAndRCRM({
          dryRun: false,
          sinceDays: Number(sinceDays) || 90,
        });
        setSyncResult(res);
        setMode("done");
      } catch (err: any) {
        alert(`Sync failed: ${err.message}`);
      }
    });
  };

  return (
    <Overlay onClose={onClose} title="Sync Commissions — QB + RecruitCRM">
      <div className="space-y-4">
        {mode === "config" && (
          <>
            <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 text-xs text-blue-800 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300">
              <p className="font-medium">How this works:</p>
              <p className="mt-1">
                1. Pulls paid invoices from QuickBooks (Balance = $0)<br />
                2. Matches them to Won deals in RecruitCRM via QB Invoice ID<br />
                3. Looks up the job owner (hiring manager) for each deal<br />
                4. Calculates commission based on tier and invoice total<br />
                5. Creates commission entries (skips duplicates)
              </p>
            </div>
            <label className="block">
              <span className="text-xs font-medium">Look back period (days)</span>
              <input
                type="number"
                className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={sinceDays}
                onChange={(e) => setSinceDays(e.target.value)}
                min={7}
                max={365}
              />
              <p className="mt-1 text-xs text-muted-foreground">Only invoices paid within this window will be synced.</p>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={onClose} className="rounded-md border px-4 py-2 text-sm hover:bg-muted">Cancel</button>
              <button
                onClick={handlePreview}
                disabled={isPending}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {isPending ? "Loading preview..." : "Preview Sync"}
              </button>
            </div>
          </>
        )}

        {mode === "preview" && syncResult && (
          <>
            {/* Summary */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border bg-emerald-50 p-3 text-center dark:bg-emerald-950/20">
                <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{syncResult.created}</p>
                <p className="text-xs text-muted-foreground">To create</p>
              </div>
              <div className="rounded-lg border bg-amber-50 p-3 text-center dark:bg-amber-950/20">
                <p className="text-lg font-bold text-amber-700 dark:text-amber-300">{syncResult.skipped}</p>
                <p className="text-xs text-muted-foreground">Already exist</p>
              </div>
              <div className="rounded-lg border bg-red-50 p-3 text-center dark:bg-red-950/20">
                <p className="text-lg font-bold text-red-700 dark:text-red-300">{syncResult.errors.length}</p>
                <p className="text-xs text-muted-foreground">Errors</p>
              </div>
            </div>
            <div className="rounded-md bg-muted/50 p-3 text-xs">
              <p>Total revenue: <span className="font-semibold">{fmt(syncResult.totalRevenue)}</span></p>
              <p>Total commission: <span className="font-semibold">{fmt(syncResult.totalCommission)}</span></p>
            </div>

            {/* Match table */}
            {syncResult.matches.length > 0 && (
              <div className="max-h-60 overflow-y-auto rounded border text-xs">
                <table className="w-full">
                  <thead className="sticky top-0 bg-muted/80">
                    <tr>
                      <th className="p-1.5 text-left">HM</th>
                      <th className="p-1.5 text-left">Client / Deal</th>
                      <th className="p-1.5 text-right">Invoice</th>
                      <th className="p-1.5 text-left">Tier</th>
                      <th className="p-1.5 text-right">Comm</th>
                      <th className="p-1.5 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {syncResult.matches.map((m, i) => (
                      <tr key={i} className="border-t">
                        <td className="p-1.5 font-medium">{m.hmName.split(" ")[0]}</td>
                        <td className="p-1.5 max-w-[120px] truncate" title={m.dealName}>{m.dealName.split(" - ")[0]}</td>
                        <td className="p-1.5 text-right tabular-nums">{fmt(m.qbTotal)}</td>
                        <td className="p-1.5">{m.tier}</td>
                        <td className="p-1.5 text-right tabular-nums">{fmt(m.commission)}</td>
                        <td className="p-1.5">
                          <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${
                            m.status === "created" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" :
                            m.status === "skipped" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" :
                            "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                          }`}>
                            {m.status}{m.reason ? `: ${m.reason}` : ""}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Errors */}
            {syncResult.errors.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-red-600 dark:text-red-400">
                  {syncResult.errors.length} error(s)
                </summary>
                <ul className="mt-1 space-y-0.5 pl-4 text-muted-foreground">
                  {syncResult.errors.slice(0, 20).map((e, i) => (
                    <li key={i}>• {e}</li>
                  ))}
                  {syncResult.errors.length > 20 && (
                    <li>...and {syncResult.errors.length - 20} more</li>
                  )}
                </ul>
              </details>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setMode("config")} className="rounded-md border px-4 py-2 text-sm hover:bg-muted">Back</button>
              <button onClick={onClose} className="rounded-md border px-4 py-2 text-sm hover:bg-muted">Cancel</button>
              {syncResult.created > 0 && (
                <button
                  onClick={handleSync}
                  disabled={isPending}
                  className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {isPending ? "Syncing..." : `Create ${syncResult.created} Commissions`}
                </button>
              )}
            </div>
          </>
        )}

        {mode === "done" && syncResult && (
          <>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-center dark:border-emerald-800 dark:bg-emerald-950/20">
              <p className="text-3xl font-bold text-emerald-700 dark:text-emerald-300">{syncResult.created}</p>
              <p className="text-sm text-emerald-600 dark:text-emerald-400">commissions created</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Revenue: {fmt(syncResult.totalRevenue)} · Commission: {fmt(syncResult.totalCommission)}
              </p>
              {syncResult.skipped > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">{syncResult.skipped} skipped (already existed)</p>
              )}
              {syncResult.errors.length > 0 && (
                <p className="mt-1 text-xs text-red-500">{syncResult.errors.length} errors</p>
              )}
            </div>
            <div className="flex justify-end pt-2">
              <button
                onClick={() => onSuccess(`Synced ${syncResult.created} commissions (${fmt(syncResult.totalCommission)})`)}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </Overlay>
  );
}

function Overlay({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg rounded-xl border bg-background p-6 shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-200">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-muted">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
