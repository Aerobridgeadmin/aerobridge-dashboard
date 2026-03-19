"use client";

import { shortDate, hours as fmtHours } from "@/lib/hriq/format";
import { useErrorDialog } from "@/app/(authenticated)/components/error-dialog";
import { CustomSelect } from "@/app/(authenticated)/components/custom-select";
import { approveExternalTimesheet, batchApproveExternalTimesheets, rejectExternalTimesheet, adminSubmitExternalTimesheet, adminUnapproveExternalTimesheet } from "@/app/actions/hriq/external-finance";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

type OrgOption = { id: string; name: string };

type Sub = {
  id: string;
  status: string;
  totalHours: any;
  bonusTotal: any;
  bonuses: any;
  submittedAt: Date | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  notes: string | null;
  rejectionReason: string | null;
  employee: {
    id: string;
    legalFirstName: string;
    legalLastName: string;
    employeeNumber: string;
    hourlyRate: unknown;
    currency: string;
    organization: { id: string; name: string } | null;
  };
  period: {
    id: string;
    name: string;
    startDate: Date;
    endDate: Date;
    status: string;
  };
};

type PeriodExt = {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  status: string;
  organization: { id: string; name: string } | null;
  _count: { submissions: number };
};

const STATUS_COLORS: Record<string, string> = {
  submitted: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300",
  approved: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
  auto_approved: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300",
  draft: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

export function ExternalPayrollDashboard({
  submissions,
  periods,
  organizations,
}: {
  submissions: Sub[];
  periods: PeriodExt[];
  organizations: OrgOption[];
}) {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [orgFilter, setOrgFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const { showError, showSuccess } = useErrorDialog();
  // Optimistic status overrides: submissionId -> status
  const [statusOverrides, setStatusOverrides] = useState<Map<string, string>>(new Map());
  const overrideStatus = (id: string, status: string) =>
    setStatusOverrides((prev) => new Map(prev).set(id, status));

  const filtered = useMemo(() => {
    let list = submissions;
    if (orgFilter !== "all") list = list.filter((s) => s.employee.organization?.id === orgFilter);
    if (statusFilter !== "all") list = list.filter((s) => s.status === statusFilter);
    if (periodFilter !== "all") list = list.filter((s) => s.period.id === periodFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((s) =>
        `${s.employee.legalFirstName} ${s.employee.legalLastName}`.toLowerCase().includes(q)
        || s.employee.employeeNumber.toLowerCase().includes(q)
        || s.employee.organization?.name.toLowerCase().includes(q)
      );
    }
    return list;
  }, [submissions, orgFilter, statusFilter, periodFilter, search]);

  // Group by period, then by org
  const grouped = useMemo(() => {
    const periodMap = new Map<string, { period: Sub["period"]; orgGroups: Map<string, { org: OrgOption; subs: Sub[] }> }>();
    for (const s of filtered) {
      if (!periodMap.has(s.period.id)) {
        periodMap.set(s.period.id, { period: s.period, orgGroups: new Map() });
      }
      const pg = periodMap.get(s.period.id)!;
      const orgId = s.employee.organization?.id ?? "unknown";
      const orgName = s.employee.organization?.name ?? "Unknown Org";
      if (!pg.orgGroups.has(orgId)) pg.orgGroups.set(orgId, { org: { id: orgId, name: orgName }, subs: [] });
      pg.orgGroups.get(orgId)!.subs.push(s);
    }
    return Array.from(periodMap.values())
      .sort((a, b) => new Date(b.period.startDate as any).getTime() - new Date(a.period.startDate as any).getTime());
  }, [filtered]);

  const pendingSubs = filtered.filter((s) => s.status === "submitted");
  const totalHours = filtered.reduce((sum, s) => sum + Number(s.totalHours), 0);
  const totalCost = filtered.reduce((sum, s) => {
    const rate = s.employee.hourlyRate ? Number(s.employee.hourlyRate) : 0;
    return sum + Number(s.totalHours) * rate + Number(s.bonusTotal ?? 0);
  }, 0);

  const handleSubmit = (id: string) => {
    startTransition(async () => {
      try {
        overrideStatus(id, "submitted");
        await adminSubmitExternalTimesheet(id);
        showSuccess("Timesheet submitted.");
      } catch (err: any) {
        overrideStatus(id, "draft");
        showError({ title: "Error", message: err.message || "Failed." });
      }
    });
  };

  const handleApprove = (id: string) => {
    startTransition(async () => {
      try {
        overrideStatus(id, "approved");
        await approveExternalTimesheet(id);
        showSuccess("Timesheet approved.");
      } catch (err: any) {
        overrideStatus(id, "submitted");
        showError({ title: "Error", message: err.message || "Failed." });
      }
    });
  };

  const handleUnapprove = (id: string) => {
    startTransition(async () => {
      try {
        overrideStatus(id, "submitted");
        await adminUnapproveExternalTimesheet(id);
        showSuccess("Timesheet reverted to submitted.");
      } catch (err: any) {
        overrideStatus(id, "approved");
        showError({ title: "Error", message: err.message || "Failed." });
      }
    });
  };

  const handleApproveAll = (ids: string[]) => {
    ids.forEach((id) => overrideStatus(id, "approved"));
    startTransition(async () => {
      try {
        const rawResult = await batchApproveExternalTimesheets(ids);
        if ("error" in rawResult) {
          ids.forEach((id) => overrideStatus(id, "submitted"));
          showError({ title: "Error", message: (rawResult as any).error ?? "An error occurred" });
          return;
        }
        const result = rawResult as Exclude<typeof rawResult, { error: string }>;
        showSuccess(`${result.approved} timesheet(s) approved.`);
      } catch (err: any) {
        ids.forEach((id) => overrideStatus(id, "submitted"));
        showError({ title: "Error", message: err.message || "Failed." });
      }
    });
  };

  const handleReject = (id: string) => {
    if (!rejectReason.trim()) return;
    startTransition(async () => {
      try {
        overrideStatus(id, "rejected");
        await rejectExternalTimesheet(id, rejectReason.trim());
        showSuccess("Timesheet rejected.");
        setRejectingId(null);
        setRejectReason("");
      } catch (err: any) {
        overrideStatus(id, "submitted");
        showError({ title: "Error", message: err.message || "Failed." });
      }
    });
  };

  const orgOptions = [
    { value: "all", label: "All Client Orgs" },
    ...organizations.map((o) => ({ value: o.id, label: o.name })),
  ];

  const statusOptions = [
    { value: "all", label: "All Statuses" },
    { value: "submitted", label: "Submitted" },
    { value: "approved", label: "Approved" },
    { value: "auto_approved", label: "Auto-Approved" },
    { value: "rejected", label: "Rejected" },
    { value: "draft", label: "Draft" },
  ];

  const uniquePeriods = useMemo(() => {
    const seen = new Map<string, { id: string; name: string }>();
    for (const s of submissions) {
      if (!seen.has(s.period.id)) seen.set(s.period.id, { id: s.period.id, name: s.period.name });
    }
    return Array.from(seen.values());
  }, [submissions]);

  const periodOptions = [
    { value: "all", label: "All Periods" },
    ...uniquePeriods.map((p) => ({ value: p.id, label: p.name })),
  ];

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid gap-3 md:grid-cols-4">
        <StatCard label="Total Submissions" value={filtered.length} sub={fmtHours(totalHours)} />
        <StatCard label="Pending Review" value={pendingSubs.length} sub={fmtHours(pendingSubs.reduce((s, p) => s + Number(p.totalHours), 0))} color="text-yellow-600 dark:text-yellow-400" />
        <StatCard label="Approved" value={filtered.filter((s) => s.status === "approved" || s.status === "auto_approved").length} color="text-green-600 dark:text-green-400" sub="this filter" />
        <StatCard label="Estimated Cost" value={0} sub={`$${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} hideValue />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-56">
          <CustomSelect  options={orgOptions} value={orgFilter} onValueChange={setOrgFilter} placeholder="Filter by org" />
        </div>
        <div className="w-40">
          <CustomSelect  options={statusOptions} value={statusFilter} onValueChange={setStatusFilter} placeholder="Status" />
        </div>
        <div className="w-52">
          <CustomSelect  options={periodOptions} value={periodFilter} onValueChange={setPeriodFilter} placeholder="Period" />
        </div>
        <input
          type="text"
          placeholder="Search contractor or org…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 w-64 rounded-lg border bg-background px-3 text-sm"
        />
      </div>

      {filtered.length === 0 && (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          No timesheet submissions found matching your filters.
        </div>
      )}

      {/* Grouped by period  org */}
      {grouped.map(({ period, orgGroups }) => {
        const allPending = [...orgGroups.values()].flatMap((g) => g.subs.filter((s) => s.status === "submitted"));
        return (
          <div key={period.id} className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">{period.name}</h3>
                <p className="text-xs text-muted-foreground">{shortDate(period.startDate)} – {shortDate(period.endDate)}</p>
              </div>
              {allPending.length > 0 && (
                <button
                  onClick={() => handleApproveAll(allPending.map((s) => s.id))}
                  disabled={isPending}
                  className="h-8 rounded-lg bg-green-600 px-3 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {isPending ? "…" : `Approve All ${allPending.length} Pending`}
                </button>
              )}
            </div>

            {[...orgGroups.values()].map(({ org, subs }) => (
              <div key={org.id} className="rounded-xl border bg-card">
                <div className="flex items-center justify-between border-b px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{org.name}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{subs.length}</span>
                  </div>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {fmtHours(subs.reduce((s, sub) => s + Number(sub.totalHours), 0))} · ${subs.reduce((s, sub) => {
                      const rate = sub.employee.hourlyRate ? Number(sub.employee.hourlyRate) : 0;
                      return s + Number(sub.totalHours) * rate + Number(sub.bonusTotal ?? 0);
                    }, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground">
                        <th className="px-4 py-2 text-left">Contractor</th>
                        <th className="px-3 py-2 text-right">Hours</th>
                        <th className="px-3 py-2 text-right">Rate</th>
                        <th className="px-3 py-2 text-right">Est. Total</th>
                        <th className="px-3 py-2 text-center">Status</th>
                        <th className="px-3 py-2 text-left">Submitted</th>
                        <th className="px-3 py-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subs.map((s) => {
                        const rate = s.employee.hourlyRate ? Number(s.employee.hourlyRate) : 0;
                        const bonus = Number(s.bonusTotal ?? 0);
                        const est = Number(s.totalHours) * rate + bonus;
                        const effectiveStatus = statusOverrides.get(s.id) ?? s.status;
                        return (
                          <tr key={s.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-2">
                              <Link href={`/${orgSlug}/employees/${s.employee.id}?from=${encodeURIComponent(pathname)}`} className="font-medium hover:underline">
                                {s.employee.legalFirstName} {s.employee.legalLastName}
                              </Link>
                              <div className="text-xs text-muted-foreground">#{s.employee.employeeNumber}</div>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">{fmtHours(Number(s.totalHours))}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                              {rate > 0 ? `$${rate}/hr` : "—"}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums font-medium">
                              {rate > 0 ? `$${est.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "—"}
                              {bonus > 0 && <span className="ml-1 text-[10px] text-muted-foreground">incl. ${bonus} bonus</span>}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[effectiveStatus] ?? "bg-muted"}`}>
                                {effectiveStatus.replace("_", " ")}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">
                              {s.submittedAt ? shortDate(s.submittedAt) : "—"}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {effectiveStatus === "draft" && (
                                <button
                                  onClick={() => handleSubmit(s.id)}
                                  disabled={isPending}
                                  className="h-7 rounded-md bg-blue-600 px-2.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                                >
                                  Submit
                                </button>
                              )}
                              {effectiveStatus === "submitted" && (
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    onClick={() => handleApprove(s.id)}
                                    disabled={isPending}
                                    className="h-7 rounded-md bg-green-600 px-2 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => { setRejectingId(s.id); setRejectReason(""); }}
                                    disabled={isPending}
                                    className="h-7 rounded-md border border-red-300 px-2 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950/30"
                                  >
                                    Reject
                                  </button>
                                </div>
                              )}
                              {(effectiveStatus === "approved" || effectiveStatus === "auto_approved") && (
                                <button
                                  onClick={() => handleUnapprove(s.id)}
                                  disabled={isPending}
                                  className="h-7 rounded-md border border-amber-400 px-2 text-xs font-medium text-amber-600 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/30"
                                >
                                  Un-approve
                                </button>
                              )}
                              {effectiveStatus === "rejected" && s.rejectionReason && (
                                <span className="text-xs text-red-500 italic" title={s.rejectionReason}>rejected</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Reject dialog inline */}
                {subs.some((s) => s.id === rejectingId) && (
                  <div className="border-t px-4 py-3">
                    <p className="text-xs font-medium mb-1.5">Reason for rejection:</p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && rejectingId && handleReject(rejectingId)}
                        placeholder="Enter reason…"
                        className="h-8 flex-1 rounded border bg-background px-2 text-sm"
                        autoFocus
                      />
                      <button
                        onClick={() => rejectingId && handleReject(rejectingId)}
                        disabled={isPending || !rejectReason.trim()}
                        className="h-8 rounded bg-red-600 px-3 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        Reject
                      </button>
                      <button
                        onClick={() => { setRejectingId(null); setRejectReason(""); }}
                        className="h-8 rounded border px-3 text-xs hover:bg-accent"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function StatCard({ label, value, sub, color, hideValue }: { label: string; value: number; sub: string; color?: string; hideValue?: boolean }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      {!hideValue && <div className={`text-2xl font-bold tabular-nums ${color ?? ""}`}>{value}</div>}
      <div className={`text-${hideValue ? "xl font-bold tabular-nums" : "xs text-muted-foreground"}`}>{sub}</div>
    </div>
  );
}
