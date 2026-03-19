"use client";

import { shortDate } from "@/lib/hriq/format";
import { CustomSelect } from "@/app/(authenticated)/components/custom-select";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";

type Contract = {
  id: string;
  status: string;
  sentAt: string | null;
  viewedAt: string | null;
  signedAt: string | null;
  declinedAt: string | null;
  expiresAt: string | null;
  signedDocumentUrl: string | null;
  signerEmail: string | null;
  signerName: string | null;
  createdAt: string;
  updatedAt: string;
  employee: {
    id: string;
    legalFirstName: string;
    legalLastName: string;
    employeeNumber: string;
    organization: { id: string; name: string } | null;
  };
  template: { id: string; name: string; category: string };
};
type OrgOption = { id: string; name: string };
type StatRow = { status: string; count: number };

const STATUS_COLORS: Record<string, string> = {
  signed: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300",
  sent: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300",
  viewed: "bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300",
  declined: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300",
  expired: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

export function ExternalContractsDashboard({
  contracts,
  organizations,
  stats,
}: {
  contracts: Contract[];
  organizations: OrgOption[];
  stats: StatRow[];
}) {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const [orgFilter, setOrgFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    let list = contracts;
    if (orgFilter !== "all") list = list.filter((c) => c.employee.organization?.id === orgFilter);
    if (statusFilter !== "all") list = list.filter((c) => c.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) =>
        `${c.employee.legalFirstName} ${c.employee.legalLastName}`.toLowerCase().includes(q)
        || c.employee.employeeNumber.toLowerCase().includes(q)
        || c.template.name.toLowerCase().includes(q)
        || c.employee.organization?.name.toLowerCase().includes(q)
      );
    }
    return list;
  }, [contracts, orgFilter, statusFilter, search]);

  const byOrg = useMemo(() => {
    const map = new Map<string, { org: OrgOption; items: Contract[] }>();
    for (const c of filtered) {
      const orgId = c.employee.organization?.id ?? "unknown";
      const orgName = c.employee.organization?.name ?? "Unknown Org";
      if (!map.has(orgId)) map.set(orgId, { org: { id: orgId, name: orgName }, items: [] });
      map.get(orgId)!.items.push(c);
    }
    return Array.from(map.values()).sort((a, b) => a.org.name.localeCompare(b.org.name));
  }, [filtered]);

  const statuses = useMemo(() => Array.from(new Set(contracts.map((c) => c.status))).sort(), [contracts]);
  const totalSigned = stats.find((s) => s.status === "signed")?.count ?? 0;
  const totalPending = stats.filter((s) => ["pending", "sent", "viewed"].includes(s.status)).reduce((a, s) => a + s.count, 0);

  const orgOptions = [{ value: "all", label: "All Client Orgs" }, ...organizations.map((o) => ({ value: o.id, label: o.name }))];
  const statusOptions = [{ value: "all", label: "All Statuses" }, ...statuses.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <StatCard label="Total Contracts" value={filtered.length} sub={`across ${byOrg.length} org(s)`} />
        <StatCard label="Awaiting Signature" value={totalPending} sub="sent, viewed, or pending" color="text-yellow-600 dark:text-yellow-400" />
        <StatCard label="Signed" value={totalSigned} sub="completed" color="text-green-600 dark:text-green-400" />
        <StatCard label="Client Orgs" value={organizations.length} sub={`${byOrg.length} with contracts`} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-52"><CustomSelect options={orgOptions} value={orgFilter} onValueChange={setOrgFilter} placeholder="Filter by org" /></div>
        <div className="w-40"><CustomSelect options={statusOptions} value={statusFilter} onValueChange={setStatusFilter} placeholder="Status" /></div>
        <input type="text" placeholder="Search contractor or template…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 w-64 rounded-lg border bg-background px-3 text-sm" />
      </div>

      {filtered.length === 0 && (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">No contracts found matching your filters.</div>
      )}

      {byOrg.map(({ org, items }) => (
        <div key={org.id} className="rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="font-semibold">{org.name}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{items.length}</span>
            </div>
            <span className="text-xs text-muted-foreground">{items.filter((c) => c.status === "signed").length} signed</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="px-3 py-2 text-left">Contractor</th>
                  <th className="px-3 py-2 text-left">Template</th>
                  <th className="px-3 py-2 text-left">Category</th>
                  <th className="px-3 py-2 text-center">Status</th>
                  <th className="px-3 py-2 text-left">Sent</th>
                  <th className="px-3 py-2 text-left">Signed</th>
                  <th className="px-3 py-2 text-right">Document</th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2">
                      <Link href={`/${orgSlug}/employees/${c.employee.id}`} className="font-medium hover:underline">
                        {c.employee.legalFirstName} {c.employee.legalLastName}
                      </Link>
                      <div className="text-xs text-muted-foreground">#{c.employee.employeeNumber}</div>
                    </td>
                    <td className="px-3 py-2 font-medium">{c.template.name}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{c.template.category}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[c.status] ?? "bg-muted"}`}>{c.status}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{c.sentAt ? shortDate(c.sentAt) : "—"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{c.signedAt ? shortDate(c.signedAt) : "—"}</td>
                    <td className="px-3 py-2 text-right">
                      {c.signedDocumentUrl && (
                        <a href={c.signedDocumentUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline">View</a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
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
