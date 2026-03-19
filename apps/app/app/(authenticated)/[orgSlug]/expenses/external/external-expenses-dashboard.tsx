"use client";

import { shortDate } from "@/lib/hriq/format";
import { useErrorDialog } from "@/app/(authenticated)/components/error-dialog";
import { approveExternalExpense, rejectExternalExpense, batchApproveExternalExpenses } from "@/app/actions/hriq/external-operations";
import { CustomSelect } from "@/app/(authenticated)/components/custom-select";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

type Expense = {
  id: string;
  title: string;
  description: string | null;
  totalAmount: string;
  currency: string;
  status: string;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedReason: string | null;
  createdAt: string;
  updatedAt: string;
  employee: {
    id: string;
    legalFirstName: string;
    legalLastName: string;
    employeeNumber: string;
    organization: { id: string; name: string } | null;
  };
  _count: { items: number };
};
type OrgOption = { id: string; name: string };
type StatRow = { status: string; count: number; total: number };

const STATUS_COLORS: Record<string, string> = {
  approved: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
  submitted: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300",
  reimbursed: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300",
  draft: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

export function ExternalExpensesDashboard({
  expenses,
  organizations,
  stats,
}: {
  expenses: Expense[];
  organizations: OrgOption[];
  stats: StatRow[];
}) {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const [isPending, startTransition] = useTransition();
  const [orgFilter, setOrgFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const { showError, showSuccess } = useErrorDialog();

  const filtered = useMemo(() => {
    let list = expenses;
    if (orgFilter !== "all") list = list.filter((e) => e.employee.organization?.id === orgFilter);
    if (statusFilter !== "all") list = list.filter((e) => e.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((e) =>
        `${e.employee.legalFirstName} ${e.employee.legalLastName}`.toLowerCase().includes(q)
        || e.employee.employeeNumber.toLowerCase().includes(q)
        || e.title.toLowerCase().includes(q)
        || e.employee.organization?.name.toLowerCase().includes(q)
      );
    }
    return list;
  }, [expenses, orgFilter, statusFilter, search]);

  const byOrg = useMemo(() => {
    const map = new Map<string, { org: OrgOption; items: Expense[] }>();
    for (const e of filtered) {
      const orgId = e.employee.organization?.id ?? "unknown";
      const orgName = e.employee.organization?.name ?? "Unknown Org";
      if (!map.has(orgId)) map.set(orgId, { org: { id: orgId, name: orgName }, items: [] });
      map.get(orgId)!.items.push(e);
    }
    return Array.from(map.values()).sort((a, b) => a.org.name.localeCompare(b.org.name));
  }, [filtered]);

  const submittedExpenses = filtered.filter((e) => e.status === "submitted");
  const totalSubmitted = stats.find((s) => s.status === "submitted")?.total ?? 0;
  const totalApproved = stats.find((s) => s.status === "approved")?.total ?? 0;
  const totalAll = stats.reduce((a, s) => a + s.total, 0);

  const toggleSelect = (id: string) => {
    setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };
  const toggleAllSubmitted = () => {
    const ids = submittedExpenses.map((e) => e.id);
    setSelected(ids.every((id) => selected.has(id)) ? new Set() : new Set(ids));
  };

  const handleApprove = (reportId: string) => {
    startTransition(async () => {
      try { await approveExternalExpense(reportId); showSuccess("Expense approved."); }
      catch (err: any) { showError({ title: "Error", message: err.message || "Failed." }); }
    });
  };

  const handleBatchApprove = () => {
    const ids = Array.from(selected).filter((id) => expenses.find((e) => e.id === id)?.status === "submitted");
    if (ids.length === 0) return;
    startTransition(async () => {
      try { await batchApproveExternalExpenses(ids); showSuccess(`${ids.length} expense(s) approved.`); setSelected(new Set()); }
      catch (err: any) { showError({ title: "Error", message: err.message || "Failed." }); }
    });
  };

  const handleReject = () => {
    if (!rejectId || !rejectReason.trim()) return;
    startTransition(async () => {
      try { await rejectExternalExpense(rejectId, rejectReason); showSuccess("Expense rejected."); setRejectId(null); setRejectReason(""); }
      catch (err: any) { showError({ title: "Error", message: err.message || "Failed." }); }
    });
  };

  const orgOptions = [{ value: "all", label: "All Client Orgs" }, ...organizations.map((o) => ({ value: o.id, label: o.name }))];
  const statusOptions = [{ value: "all", label: "All Statuses" }, { value: "submitted", label: "Submitted" }, { value: "approved", label: "Approved" }, { value: "rejected", label: "Rejected" }, { value: "reimbursed", label: "Reimbursed" }, { value: "draft", label: "Draft" }];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <StatCard label="Total Expenses" value={filtered.length} sub={`$${totalAll.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} />
        <StatCard label="Pending Review" value={submittedExpenses.length} sub={`$${totalSubmitted.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} color="text-yellow-600 dark:text-yellow-400" />
        <StatCard label="Approved" value={stats.find((s) => s.status === "approved")?.count ?? 0} sub={`$${totalApproved.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} color="text-green-600 dark:text-green-400" />
        <StatCard label="Client Orgs" value={organizations.length} sub={`${byOrg.length} with expenses`} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-52"><CustomSelect options={orgOptions} value={orgFilter} onValueChange={(v) => { setOrgFilter(v); setSelected(new Set()); }} placeholder="Filter by org" /></div>
        <div className="w-40"><CustomSelect options={statusOptions} value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setSelected(new Set()); }} placeholder="Status" /></div>
        <input type="text" placeholder="Search contractor or title…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 w-64 rounded-lg border bg-background px-3 text-sm" />
        {selected.size > 0 && (
          <button onClick={handleBatchApprove} disabled={isPending} className="ml-auto h-9 rounded-lg bg-green-600 px-4 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
            {isPending ? "Processing…" : `Approve ${selected.size} Expense(s)`}
          </button>
        )}
      </div>

      {submittedExpenses.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <button onClick={toggleAllSubmitted} className="underline hover:text-foreground">
            {submittedExpenses.every((e) => selected.has(e.id)) ? "Deselect all submitted" : `Select all ${submittedExpenses.length} submitted`}
          </button>
        </div>
      )}

      {filtered.length === 0 && (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">No expenses found matching your filters.</div>
      )}

      {byOrg.map(({ org, items }) => (
        <div key={org.id} className="rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="font-semibold">{org.name}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{items.length}</span>
            </div>
            <span className="text-sm font-medium tabular-nums">
              ${items.reduce((s, e) => s + Number(e.totalAmount), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="w-8 px-4 py-2"><span className="sr-only">Select</span></th>
                  <th className="px-3 py-2 text-left">Contractor</th>
                  <th className="px-3 py-2 text-left">Title</th>
                  <th className="px-3 py-2 text-center">Items</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2 text-center">Status</th>
                  <th className="px-3 py-2 text-left">Submitted</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((e) => (
                  <tr key={e.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2">
                      {e.status === "submitted" && (
                        <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggleSelect(e.id)} className="h-4 w-4 rounded border-gray-300" />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Link href={`/${orgSlug}/employees/${e.employee.id}`} className="font-medium hover:underline">
                        {e.employee.legalFirstName} {e.employee.legalLastName}
                      </Link>
                      <div className="text-xs text-muted-foreground">#{e.employee.employeeNumber}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{e.title}</div>
                      {e.description && <div className="text-xs text-muted-foreground truncate max-w-[200px]" title={e.description}>{e.description}</div>}
                    </td>
                    <td className="px-3 py-2 text-center text-xs">{e._count.items}</td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">${Number(e.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })} {e.currency}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[e.status] ?? "bg-muted"}`}>{e.status}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{e.submittedAt ? shortDate(e.submittedAt) : "—"}</td>
                    <td className="px-3 py-2 text-right">
                      {e.status === "submitted" && (
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => handleApprove(e.id)} disabled={isPending} className="h-7 rounded-md bg-green-600 px-2.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50">Approve</button>
                          <button onClick={() => { setRejectId(e.id); setRejectReason(""); }} className="h-7 rounded-md border px-2.5 text-xs font-medium hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-900/30">Reject</button>
                        </div>
                      )}
                      {e.status === "approved" && e.approvedAt && <span className="text-xs text-muted-foreground">{shortDate(e.approvedAt)}</span>}
                      {e.status === "rejected" && e.rejectedReason && <span className="text-xs text-red-500 max-w-[150px] truncate inline-block" title={e.rejectedReason}>{e.rejectedReason}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {rejectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-200">
            <h3 className="font-semibold">Reject Expense Report</h3>
            <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Reason for rejection…" className="mt-3 w-full rounded-lg border bg-background px-3 py-2 text-sm" rows={3} />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setRejectId(null)} className="h-9 rounded-md border px-4 text-sm hover:bg-accent">Cancel</button>
              <button onClick={handleReject} disabled={isPending || !rejectReason.trim()} className="h-9 rounded-md bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">Reject</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: number | string; sub: string; color?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold tabular-nums ${color ?? ""}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}
