"use client";

import { shortDate } from "@/lib/hriq/format";
import { useErrorDialog } from "@/app/(authenticated)/components/error-dialog";
import { completeExternalTask, batchCompleteExternalTasks } from "@/app/actions/hriq/external-operations";
import { CustomSelect } from "@/app/(authenticated)/components/custom-select";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

type Task = {
  id: string;
  taskType: string;
  title: string;
  description: string | null;
  ownerRole: string | null;
  dueDate: string | null;
  status: string;
  isBlocking: boolean;
  completedAt: string | null;
  phase: string | null;
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
  completed: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300",
  in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300",
  cancelled: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  skipped: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

export function ExternalTasksDashboard({
  tasks,
  organizations,
  stats,
}: {
  tasks: Task[];
  organizations: OrgOption[];
  stats: StatRow[];
}) {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const [isPending, startTransition] = useTransition();
  const [orgFilter, setOrgFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { showError, showSuccess } = useErrorDialog();

  const filtered = useMemo(() => {
    let list = tasks;
    if (orgFilter !== "all") list = list.filter((t) => t.employee.organization?.id === orgFilter);
    if (statusFilter !== "all") list = list.filter((t) => t.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((t) =>
        `${t.employee.legalFirstName} ${t.employee.legalLastName}`.toLowerCase().includes(q)
        || t.employee.employeeNumber.toLowerCase().includes(q)
        || t.title.toLowerCase().includes(q)
        || t.employee.organization?.name.toLowerCase().includes(q)
      );
    }
    return list;
  }, [tasks, orgFilter, statusFilter, search]);

  const byOrg = useMemo(() => {
    const map = new Map<string, { org: OrgOption; items: Task[] }>();
    for (const t of filtered) {
      const orgId = t.employee.organization?.id ?? "unknown";
      const orgName = t.employee.organization?.name ?? "Unknown Org";
      if (!map.has(orgId)) map.set(orgId, { org: { id: orgId, name: orgName }, items: [] });
      map.get(orgId)!.items.push(t);
    }
    return Array.from(map.values()).sort((a, b) => a.org.name.localeCompare(b.org.name));
  }, [filtered]);

  const activeTasks = filtered.filter((t) => ["pending", "in_progress"].includes(t.status));
  const totalPending = stats.find((s) => s.status === "pending")?.count ?? 0;
  const totalInProgress = stats.find((s) => s.status === "in_progress")?.count ?? 0;
  const totalCompleted = stats.find((s) => s.status === "completed")?.count ?? 0;
  const blockingCount = filtered.filter((t) => t.isBlocking && t.status !== "completed").length;

  const toggleSelect = (id: string) => {
    setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };
  const toggleAllActive = () => {
    const ids = activeTasks.map((t) => t.id);
    setSelected(ids.every((id) => selected.has(id)) ? new Set() : new Set(ids));
  };

  const handleComplete = (taskId: string) => {
    startTransition(async () => {
      try { await completeExternalTask(taskId); showSuccess("Task completed."); }
      catch (err: any) { showError({ title: "Error", message: err.message || "Failed." }); }
    });
  };

  const handleBatchComplete = () => {
    const ids = Array.from(selected).filter((id) => {
      const t = tasks.find((t) => t.id === id);
      return t && ["pending", "in_progress"].includes(t.status);
    });
    if (ids.length === 0) return;
    startTransition(async () => {
      try { await batchCompleteExternalTasks(ids); showSuccess(`${ids.length} task(s) completed.`); setSelected(new Set()); }
      catch (err: any) { showError({ title: "Error", message: err.message || "Failed." }); }
    });
  };

  const statuses = useMemo(() => Array.from(new Set(tasks.map((t) => t.status))).sort(), [tasks]);
  const orgOptions = [{ value: "all", label: "All Client Orgs" }, ...organizations.map((o) => ({ value: o.id, label: o.name }))];
  const statusOptions = [{ value: "all", label: "All Statuses" }, ...statuses.map((s) => ({ value: s, label: s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) }))];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <StatCard label="Total Tasks" value={filtered.length} sub={`across ${byOrg.length} org(s)`} />
        <StatCard label="Active" value={totalPending + totalInProgress} sub={`${blockingCount} blocking`} color="text-yellow-600 dark:text-yellow-400" />
        <StatCard label="Completed" value={totalCompleted} sub="finished" color="text-green-600 dark:text-green-400" />
        <StatCard label="Client Orgs" value={organizations.length} sub={`${byOrg.length} with tasks`} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-52"><CustomSelect options={orgOptions} value={orgFilter} onValueChange={(v) => { setOrgFilter(v); setSelected(new Set()); }} placeholder="Filter by org" /></div>
        <div className="w-40"><CustomSelect options={statusOptions} value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setSelected(new Set()); }} placeholder="Status" /></div>
        <input type="text" placeholder="Search contractor or task…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 w-64 rounded-lg border bg-background px-3 text-sm" />
        {selected.size > 0 && (
          <button onClick={handleBatchComplete} disabled={isPending} className="ml-auto h-9 rounded-lg bg-green-600 px-4 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
            {isPending ? "Processing…" : `Complete ${selected.size} Task(s)`}
          </button>
        )}
      </div>

      {activeTasks.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <button onClick={toggleAllActive} className="underline hover:text-foreground">
            {activeTasks.every((t) => selected.has(t.id)) ? "Deselect all active" : `Select all ${activeTasks.length} active`}
          </button>
        </div>
      )}

      {filtered.length === 0 && (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">No tasks found matching your filters.</div>
      )}

      {byOrg.map(({ org, items }) => (
        <div key={org.id} className="rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="font-semibold">{org.name}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{items.length}</span>
            </div>
            <span className="text-xs text-muted-foreground">{items.filter((t) => ["pending", "in_progress"].includes(t.status)).length} active</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="w-8 px-4 py-2"><span className="sr-only">Select</span></th>
                  <th className="px-3 py-2 text-left">Contractor</th>
                  <th className="px-3 py-2 text-left">Task</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-center">Due</th>
                  <th className="px-3 py-2 text-center">Status</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((t) => (
                  <tr key={t.id} className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${t.isBlocking && t.status !== "completed" ? "bg-red-50/50 dark:bg-red-900/10" : ""}`}>
                    <td className="px-4 py-2">
                      {["pending", "in_progress"].includes(t.status) && (
                        <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleSelect(t.id)} className="h-4 w-4 rounded border-gray-300" />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Link href={`/${orgSlug}/employees/${t.employee.id}`} className="font-medium hover:underline">
                        {t.employee.legalFirstName} {t.employee.legalLastName}
                      </Link>
                      <div className="text-xs text-muted-foreground">#{t.employee.employeeNumber}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{t.title}</div>
                      {t.description && <div className="text-xs text-muted-foreground truncate max-w-[250px]" title={t.description}>{t.description}</div>}
                      {t.isBlocking && t.status !== "completed" && <span className="text-[10px] font-medium text-red-500">Blocking</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{t.taskType.replace(/_/g, " ")}</td>
                    <td className="px-3 py-2 text-center text-xs text-muted-foreground">{t.dueDate ? shortDate(t.dueDate) : "—"}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[t.status] ?? "bg-muted"}`}>{t.status.replace(/_/g, " ")}</span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {["pending", "in_progress"].includes(t.status) && (
                        <button onClick={() => handleComplete(t.id)} disabled={isPending} className="h-7 rounded-md bg-green-600 px-2.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50">Complete</button>
                      )}
                      {t.status === "completed" && t.completedAt && <span className="text-xs text-muted-foreground">{shortDate(t.completedAt)}</span>}
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
