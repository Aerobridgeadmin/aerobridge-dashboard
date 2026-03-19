"use client";

import { shortDate } from "@/lib/hriq/format";
import { useErrorDialog } from "@/app/(authenticated)/components/error-dialog";
import { verifyExternalDocument, rejectExternalDocument, batchVerifyExternalDocuments } from "@/app/actions/hriq/external-operations";
import { CustomSelect } from "@/app/(authenticated)/components/custom-select";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

type Document = {
  id: string;
  documentType: string;
  documentName: string;
  description: string | null;
  fileUrl: string | null;
  fileName: string | null;
  fileSize: number | null;
  status: string;
  rejectionReason: string | null;
  isExpired: boolean;
  isConfidential: boolean;
  expiryDate: string | null;
  issuedDate: string | null;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  employee: {
    id: string;
    legalFirstName: string;
    legalLastName: string;
    employeeNumber: string;
    organization: { id: string; name: string } | null;
  };
};
type OrgOption = { id: string; name: string };
type StatRow = { status: string; count: number };

const STATUS_COLORS: Record<string, string> = {
  verified: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300",
  expired: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

export function ExternalDocumentsDashboard({
  documents,
  organizations,
  stats,
}: {
  documents: Document[];
  organizations: OrgOption[];
  stats: StatRow[];
}) {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const [isPending, startTransition] = useTransition();
  const [orgFilter, setOrgFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const { showError, showSuccess } = useErrorDialog();

  const docTypes = useMemo(() => {
    const types = new Set(documents.map((d) => d.documentType));
    return Array.from(types).sort();
  }, [documents]);

  const filtered = useMemo(() => {
    let list = documents;
    if (orgFilter !== "all") list = list.filter((d) => d.employee.organization?.id === orgFilter);
    if (statusFilter !== "all") list = list.filter((d) => d.status === statusFilter);
    if (typeFilter !== "all") list = list.filter((d) => d.documentType === typeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((d) =>
        `${d.employee.legalFirstName} ${d.employee.legalLastName}`.toLowerCase().includes(q)
        || d.employee.employeeNumber.toLowerCase().includes(q)
        || d.documentName.toLowerCase().includes(q)
        || d.employee.organization?.name.toLowerCase().includes(q)
      );
    }
    return list;
  }, [documents, orgFilter, statusFilter, typeFilter, search]);

  const byOrg = useMemo(() => {
    const map = new Map<string, { org: OrgOption; docs: Document[] }>();
    for (const d of filtered) {
      const orgId = d.employee.organization?.id ?? "unknown";
      const orgName = d.employee.organization?.name ?? "Unknown Org";
      if (!map.has(orgId)) map.set(orgId, { org: { id: orgId, name: orgName }, docs: [] });
      map.get(orgId)!.docs.push(d);
    }
    return Array.from(map.values()).sort((a, b) => a.org.name.localeCompare(b.org.name));
  }, [filtered]);

  const pendingDocs = filtered.filter((d) => d.status === "pending");
  const totalPending = stats.find((s) => s.status === "pending")?.count ?? 0;
  const totalVerified = stats.find((s) => s.status === "verified")?.count ?? 0;
  const totalRejected = stats.find((s) => s.status === "rejected")?.count ?? 0;

  const toggleSelect = (id: string) => {
    setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };
  const toggleAllPending = () => {
    const ids = pendingDocs.map((d) => d.id);
    setSelected(ids.every((id) => selected.has(id)) ? new Set() : new Set(ids));
  };

  const handleVerify = (docId: string) => {
    startTransition(async () => {
      try { await verifyExternalDocument(docId); showSuccess("Document verified."); }
      catch (err: any) { showError({ title: "Error", message: err.message || "Failed." }); }
    });
  };

  const handleBatchVerify = () => {
    const ids = Array.from(selected).filter((id) => documents.find((d) => d.id === id)?.status === "pending");
    if (ids.length === 0) return;
    startTransition(async () => {
      try { await batchVerifyExternalDocuments(ids); showSuccess(`${ids.length} document(s) verified.`); setSelected(new Set()); }
      catch (err: any) { showError({ title: "Error", message: err.message || "Failed." }); }
    });
  };

  const handleReject = () => {
    if (!rejectId || !rejectReason.trim()) return;
    startTransition(async () => {
      try { await rejectExternalDocument(rejectId, rejectReason); showSuccess("Document rejected."); setRejectId(null); setRejectReason(""); }
      catch (err: any) { showError({ title: "Error", message: err.message || "Failed." }); }
    });
  };

  const orgOptions = [{ value: "all", label: "All Client Orgs" }, ...organizations.map((o) => ({ value: o.id, label: o.name }))];
  const statusOptions = [{ value: "all", label: "All Statuses" }, { value: "pending", label: "Pending" }, { value: "verified", label: "Verified" }, { value: "rejected", label: "Rejected" }];
  const typeOptions = [{ value: "all", label: "All Types" }, ...docTypes.map((t) => ({ value: t, label: t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) }))];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <StatCard label="Total Documents" value={filtered.length} sub={`across ${byOrg.length} org(s)`} />
        <StatCard label="Pending Review" value={totalPending} sub="awaiting verification" color="text-yellow-600 dark:text-yellow-400" />
        <StatCard label="Verified" value={totalVerified} sub="approved" color="text-green-600 dark:text-green-400" />
        <StatCard label="Rejected" value={totalRejected} sub="needs resubmission" color="text-red-600 dark:text-red-400" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-52"><CustomSelect options={orgOptions} value={orgFilter} onValueChange={(v) => { setOrgFilter(v); setSelected(new Set()); }} placeholder="Filter by org" /></div>
        <div className="w-36"><CustomSelect options={statusOptions} value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setSelected(new Set()); }} placeholder="Status" /></div>
        <div className="w-40"><CustomSelect options={typeOptions} value={typeFilter} onValueChange={(v) => setTypeFilter(v)} placeholder="Type" /></div>
        <input type="text" placeholder="Search contractor or doc…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 w-64 rounded-lg border bg-background px-3 text-sm" />
        {selected.size > 0 && (
          <button onClick={handleBatchVerify} disabled={isPending} className="ml-auto h-9 rounded-lg bg-green-600 px-4 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
            {isPending ? "Processing…" : `Verify ${selected.size} Doc(s)`}
          </button>
        )}
      </div>

      {pendingDocs.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <button onClick={toggleAllPending} className="underline hover:text-foreground">
            {pendingDocs.every((d) => selected.has(d.id)) ? "Deselect all pending" : `Select all ${pendingDocs.length} pending`}
          </button>
        </div>
      )}

      {filtered.length === 0 && (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">No documents found matching your filters.</div>
      )}

      {byOrg.map(({ org, docs }) => (
        <div key={org.id} className="rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="font-semibold">{org.name}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{docs.length}</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="w-8 px-4 py-2"><span className="sr-only">Select</span></th>
                  <th className="px-3 py-2 text-left">Contractor</th>
                  <th className="px-3 py-2 text-left">Document</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-center">Status</th>
                  <th className="px-3 py-2 text-left">Uploaded</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2">
                      {d.status === "pending" && (
                        <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggleSelect(d.id)} className="h-4 w-4 rounded border-gray-300" />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Link href={`/${orgSlug}/employees/${d.employee.id}`} className="font-medium hover:underline">
                        {d.employee.legalFirstName} {d.employee.legalLastName}
                      </Link>
                      <div className="text-xs text-muted-foreground">#{d.employee.employeeNumber}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{d.documentName}</div>
                      {d.fileUrl && <a href={d.fileUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline">View file</a>}
                    </td>
                    <td className="px-3 py-2 text-xs">{d.documentType.replace(/_/g, " ")}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[d.status] ?? "bg-muted"}`}>{d.status}</span>
                      {d.isExpired && <span className="ml-1 text-[10px] text-red-500">expired</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{shortDate(d.createdAt)}</td>
                    <td className="px-3 py-2 text-right">
                      {d.status === "pending" && (
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => handleVerify(d.id)} disabled={isPending} className="h-7 rounded-md bg-green-600 px-2.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50">Verify</button>
                          <button onClick={() => { setRejectId(d.id); setRejectReason(""); }} className="h-7 rounded-md border px-2.5 text-xs font-medium hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-900/30">Reject</button>
                        </div>
                      )}
                      {d.status === "verified" && d.verifiedAt && <span className="text-xs text-muted-foreground">{shortDate(d.verifiedAt)}</span>}
                      {d.status === "rejected" && d.rejectionReason && <span className="text-xs text-red-500 max-w-[150px] truncate inline-block" title={d.rejectionReason}>{d.rejectionReason}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* Reject dialog */}
      {rejectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-200">
            <h3 className="font-semibold">Reject Document</h3>
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
