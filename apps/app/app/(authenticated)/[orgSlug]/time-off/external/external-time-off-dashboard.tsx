"use client";

import { shortDate } from "@/lib/hriq/format";
import { useErrorDialog } from "@/app/(authenticated)/components/error-dialog";
import { approveExternalTimeOff, rejectExternalTimeOff, batchApproveExternalTimeOff } from "@/app/actions/hriq/external-operations";
import { CustomSelect } from "@/app/(authenticated)/components/custom-select";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

type TimeOffReq = {
  id: string;
  startDate: string;
  endDate: string;
  totalDays: string;
  reason: string | null;
  status: string;
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
  policy: { name: string; type: string };
};
type OrgOption = { id: string; name: string };
type StatRow = { status: string; count: number; totalDays: number };

const STATUS_COLORS: Record<string, string> = {
  approved: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300",
  cancelled: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

export function ExternalTimeOffDashboard({
  requests,
  organizations,
  stats,
}: {
  requests: TimeOffReq[];
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
    let list = requests;
    if (orgFilter !== "all") list = list.filter((r) => r.employee.organization?.id === orgFilter);
    if (statusFilter !== "all") list = list.filter((r) => r.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) =>
        `${r.employee.legalFirstName} ${r.employee.legalLastName}`.toLowerCase().includes(q)
        || r.employee.employeeNumber.toLowerCase().includes(q)
        || r.policy.name.toLowerCase().includes(q)
        || r.employee.organization?.name.toLowerCase().includes(q)
      );
    }
    return list;
  }, [requests, orgFilter, statusFilter, search]);

  const byOrg = useMemo(() => {
    const map = new Map<string, { org: OrgOption; items: TimeOffReq[] }>();
    for (const r of filtered) {
      const orgId = r.employee.organization?.id ?? "unknown";
      const orgName = r.employee.organization?.name ?? "Unknown Org";
      if (!map.has(orgId)) map.set(orgId, { org: { id: orgId, name: orgName }, items: [] });
      map.get(orgId)!.items.push(r);
    }
    return Array.from(map.values()).sort((a, b) => a.org.name.localeCompare(b.org.name));
  }, [filtered]);

  const pendingReqs = filtered.filter((r) => r.status === "pending");
  const totalPending = stats.find((s) => s.status === "pending")?.count ?? 0;
  const totalApproved = stats.find((s) => s.status === "approved")?.count ?? 0;
  const approvedDays = stats.find((s) => s.status === "approved")?.totalDays ?? 0;

  const toggleSelect = (id: string) => {
    setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };
  const toggleAllPending = () => {
    const ids = pendingReqs.map((r) => r.id);
    setSelected(ids.every((id) => selected.has(id)) ? new Set() : new Set(ids));
  };

  const handleApprove = (reqId: string) => {
    startTransition(async () => {
      try { await approveExternalTimeOff(reqId); showSuccess("Time-off approved."); }
      catch (err: any) { showError({ title: "Error", message: err.message || "Failed." }); }
    });
  };

  const handleBatchApprove = () => {
    const ids = Array.from(selected).filter((id) => requests.find((r) => r.id === id)?.status === "pending");
    if (ids.length === 0) return;
    startTransition(async () => {
      try { await batchApproveExternalTimeOff(ids); showSuccess(`${ids.length} request(s) approved.`); setSelected(new Set()); }
      catch (err: any) { showError({ title: "Error", message: err.message || "Failed." }); }
    });
  };

  const handleReject = () => {
    if (!rejectId || !rejectReason.trim()) return;
    startTransition(async () => {
      try { await rejectExternalTimeOff(rejectId, rejectReason); showSuccess("Time-off rejected."); setRejectId(null); setRejectReason(""); }
      catch (err: any) { showError({ title: "Error", message: err.message || "Failed." }); }
    });
  };

  const orgOptions = [{ value: "all", label: "All Client Orgs" }, ...organizations.map((o) => ({ value: o.id, label: o.name }))];
  const statusOptions = [{ value: "all", label: "All Statuses" }, { value: "pending", label: "Pending" }, { value: "approved", label: "Approved" }, { value: "rejected", label: "Rejected" }, { value: "cancelled", label: "Cancelled" }];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <StatCard label="Total Requests" value={filtered.length} sub={`across ${byOrg.length} org(s)`} />
        <StatCard label="Pending" value={totalPending} sub="awaiting approval" color="text-yellow-600 dark:text-yellow-400" />
        <StatCard label="Approved" value={totalApproved} sub={`${approvedDays} day(s) total`} color="text-green-600 dark:text-green-400" />
        <StatCard label="Client Orgs" value={organizations.length} sub={`${byOrg.length} with requests`} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-52"><CustomSelect options={orgOptions} value={orgFilter} onValueChange={(v) => { setOrgFilter(v); setSelected(new Set()); }} placeholder="Filter by org" /></div>
        <div className="w-40"><CustomSelect options={statusOptions} value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setSelected(new Set()); }} placeholder="Status" /></div>
        <input type="text" placeholder="Search contractor…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 w-64 rounded-lg border bg-background px-3 text-sm" />
        {selected.size > 0 && (
          <button onClick={handleBatchApprove} disabled={isPending} className="ml-auto h-9 rounded-lg bg-green-600 px-4 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
            {isPending ? "Processing…" : `Approve ${selected.size} Request(s)`}
          </button>
        )}
      </div>

      {pendingReqs.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <button onClick={toggleAllPending} className="underline hover:text-foreground">
            {pendingReqs.every((r) => selected.has(r.id)) ? "Deselect all pending" : `Select all ${pendingReqs.length} pending`}
          </button>
        </div>
      )}

      {filtered.length === 0 && (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">No time-off requests found matching your filters.</div>
      )}

      {byOrg.map(({ org, items }) => (
        <div key={org.id} className="rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="font-semibold">{org.name}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{items.length}</span>
            </div>
            <span className="text-xs text-muted-foreground">{items.reduce((s, r) => s + Number(r.totalDays), 0)} day(s) total</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="w-8 px-4 py-2"><span className="sr-only">Select</span></th>
                  <th className="px-3 py-2 text-left">Contractor</th>
                  <th className="px-3 py-2 text-left">Policy</th>
                  <th className="px-3 py-2 text-left">Dates</th>
                  <th className="px-3 py-2 text-center">Days</th>
                  <th className="px-3 py-2 text-left">Reason</th>
                  <th className="px-3 py-2 text-center">Status</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2">
                      {r.status === "pending" && (
                        <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} className="h-4 w-4 rounded border-gray-300" />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Link href={`/${orgSlug}/employees/${r.employee.id}`} className="font-medium hover:underline">
                        {r.employee.legalFirstName} {r.employee.legalLastName}
                      </Link>
                      <div className="text-xs text-muted-foreground">#{r.employee.employeeNumber}</div>
                    </td>
                    <td className="px-3 py-2 text-xs">{r.policy.name} <span className="text-muted-foreground">({r.policy.type})</span></td>
                    <td className="px-3 py-2 text-xs">{shortDate(r.startDate)} – {shortDate(r.endDate)}</td>
                    <td className="px-3 py-2 text-center font-medium tabular-nums">{Number(r.totalDays)}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground max-w-[200px] truncate" title={r.reason ?? undefined}>{r.reason || "—"}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[r.status] ?? "bg-muted"}`}>{r.status}</span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {r.status === "pending" && (
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => handleApprove(r.id)} disabled={isPending} className="h-7 rounded-md bg-green-600 px-2.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50">Approve</button>
                          <button onClick={() => { setRejectId(r.id); setRejectReason(""); }} className="h-7 rounded-md border px-2.5 text-xs font-medium hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-900/30">Reject</button>
                        </div>
                      )}
                      {r.status === "approved" && r.approvedAt && <span className="text-xs text-muted-foreground">{shortDate(r.approvedAt)}</span>}
                      {r.status === "rejected" && r.rejectedReason && <span className="text-xs text-red-500 max-w-[150px] truncate inline-block" title={r.rejectedReason}>{r.rejectedReason}</span>}
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
            <h3 className="font-semibold">Reject Time-Off Request</h3>
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

function StatCard({ label, value, sub, color }: { label: string; value: number; sub: string; color?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold tabular-nums ${color ?? ""}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}
