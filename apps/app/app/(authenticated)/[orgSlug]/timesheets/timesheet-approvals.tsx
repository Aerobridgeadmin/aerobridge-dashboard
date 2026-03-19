"use client";


import Image from "next/image";
import { shortDate, hours as fmtHours } from "@/lib/hriq/format";
import { useErrorDialog } from "@/app/(authenticated)/components/error-dialog";

import { approveTimesheet, batchApproveTimesheets, rejectTimesheet, unrejectTimesheet, createTimesheetPeriod } from "@/app/actions/hriq/timesheets";
import { DatePicker } from "@/app/(authenticated)/components/date-picker";
import type { TimesheetSubmission, TimesheetPeriod } from "@repo/database";
import Link from "next/link";
import { useParams, useRouter, usePathname } from "next/navigation";
import { useState, useTransition } from "react";

type SubmissionWithRelations = TimesheetSubmission & {
  employee: { id: string; legalFirstName: string; legalLastName: string; employeeNumber: string; hourlyRate: unknown; currency: string; photoUrl: string | null };
  period: TimesheetPeriod;
};

type PeriodWithCount = TimesheetPeriod & { _count: { submissions: number } };

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const DAY_KEYS = ["mondayHours", "tuesdayHours", "wednesdayHours", "thursdayHours", "fridayHours", "saturdayHours", "sundayHours"] as const;

function TimesheetCard({
  sub,
  onApprove,
  onReject,
  onUnreject,
  isPending,
  showStatus = false,
}: {
  sub: SubmissionWithRelations;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onUnreject?: (id: string) => void;
  isPending: boolean;
  showStatus?: boolean;
  key?: React.Key;
}) {
  const total = Number(sub.totalHours);
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const pathname = usePathname();
  const rate = sub.employee.hourlyRate ? Number(sub.employee.hourlyRate) : 0;
  const baseCost = total * rate;
  const subBonuses = Array.isArray((sub as any).bonuses) ? (sub as any).bonuses as Array<{ description: string; amount: number }> : [];
  const bonusTotal = Number((sub as any).bonusTotal ?? 0);
  const totalCost = baseCost + bonusTotal;
  const dayHours = DAY_KEYS.map((k) => Number(sub[k]));

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center gap-3">
          {sub.employee.photoUrl && !sub.employee.photoUrl.endsWith("/logo.png") ? (
            <Image src={sub.employee.photoUrl} alt="" width={36} height={36} className="h-9 w-9 rounded-full object-cover shrink-0" />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-md shrink-0 bg-white dark:bg-white/90 p-0.5">
              <img src="/logo.png" alt="RL" className="h-full w-full object-contain" />
            </div>
          )}
          <div>
            <Link href={`/${orgSlug}/employees/${sub.employee.id}?from=${encodeURIComponent(pathname)}`} className="font-medium hover:underline text-sm">
              {sub.employee.legalFirstName} {sub.employee.legalLastName}
            </Link>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{sub.employee.employeeNumber}</span>
              <span>·</span>
              <span>{sub.period.name}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 text-right">
          <div>
            <div className="text-lg font-bold tabular-nums">{fmtHours(total)}</div>
            {rate > 0 && (
              <div className="text-xs text-muted-foreground">
                {sub.employee.currency} {totalCost.toFixed(2)}
                {bonusTotal > 0 && <span className="text-muted-foreground ml-1">(incl. ${bonusTotal.toFixed(2)} bonus)</span>}
              </div>
            )}
            {rate === 0 && bonusTotal > 0 && (
              <div className="text-xs font-medium text-muted-foreground">${bonusTotal.toFixed(2)} bonus</div>
            )}
          </div>
          {showStatus && (
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${
              sub.status === "approved" ? "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300" :
              sub.status === "rejected" ? "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300" :
              "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300"
            }`}>
              {sub.status}
            </span>
          )}
        </div>
      </div>

      {/* Daily breakdown - table style */}
      <div className="px-4 py-3 overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              {DAYS.map((day) => (
                <th key={day} className="border border-border bg-muted/30 px-2 py-1.5 text-center font-medium text-muted-foreground">{day}</th>
              ))}
              <th className="border border-border bg-emerald-50 dark:bg-emerald-950/30 px-2 py-1.5 text-center font-semibold text-emerald-700 dark:text-emerald-300">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              {dayHours.map((h, idx) => (
                <td key={idx} className={`border border-border px-2 py-2 text-center font-bold tabular-nums ${h > 8 ? "text-amber-600" : h > 0 ? "" : "text-muted-foreground/40"}`}>
                  {h > 0 ? h : "—"}
                </td>
              ))}
              <td className="border border-border bg-emerald-50/50 dark:bg-emerald-950/20 px-2 py-2 text-center font-bold tabular-nums">{total}</td>
            </tr>
          </tbody>
        </table>
        {sub.notes && (
          <div className="mt-3 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            <span className="font-medium">Note:</span> {sub.notes}
          </div>
        )}
        {sub.autoApproveAt && sub.status === "submitted" && (
          <div className="mt-2 text-xs text-amber-600 dark:text-amber-400">
             Auto-approves {shortDate(sub.autoApproveAt as any)}
          </div>
        )}
        {sub.rejectionReason && (
          <div className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-300">
            <span className="font-medium">Rejection reason:</span> {sub.rejectionReason}
          </div>
        )}
        {subBonuses.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {subBonuses.map((b: any, i: any) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-md bg-orange-50 px-2 py-1 text-xs text-orange-700 dark:bg-orange-950 dark:text-orange-300">
                {b.description} <span className="font-semibold">${Number(b.amount).toFixed(2)}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      {onApprove && onReject && sub.status === "submitted" && (
        <div className="flex border-t">
          <button
            type="button"
            onClick={() => onApprove(sub.id)}
            disabled={isPending}
            className="flex-1 py-2.5 text-sm font-medium text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-900/20 disabled:opacity-50 transition-colors"
          >
            Approve
          </button>
          <div className="w-px bg-border" />
          <button
            type="button"
            onClick={() => onReject(sub.id)}
            disabled={isPending}
            className="flex-1 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors"
          >
             Reject
          </button>
        </div>
      )}
      {onUnreject && sub.status === "rejected" && (
        <div className="flex border-t">
          <button
            type="button"
            onClick={() => onUnreject(sub.id)}
            disabled={isPending}
            className="flex-1 py-2.5 text-sm font-medium text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-900/20 disabled:opacity-50 transition-colors"
          >
            Unreject (move back to submitted)
          </button>
        </div>
      )}
    </div>
  );
}

export function TimesheetApprovals({
  pending,
  recent,
  periods,
}: {
  pending: SubmissionWithRelations[];
  recent: SubmissionWithRelations[];
  periods: PeriodWithCount[];
}) {
  const [isPending, startTransition] = useTransition();
  const [showCreatePeriod, setShowCreatePeriod] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [activeTab, setActiveTab] = useState<"pending" | "recent" | "periods">("pending");
  const { showError, showSuccess } = useErrorDialog();
  const router = useRouter();

  const handleApprove = (id: string) => {
    startTransition(async () => {
      try {
        const approveResult = await approveTimesheet(id);
        if (approveResult && "error" in approveResult) throw new Error(approveResult.error ?? "Failed to approve");
        showSuccess("Timesheet approved.");
        router.refresh();
      } catch (err) {
        showError({ title: "Error", message: err instanceof Error ? err.message : "Failed to approve timesheet." });
      }
    });
  };

  const handleApproveAll = () => {
    startTransition(async () => {
      try {
        const result = await batchApproveTimesheets(pending.map((s) => s.id));
        if ("error" in result) {
          showError({ title: "Error", message: result.error ?? "Failed to approve timesheets." });
          return;
        }
        showSuccess(`Approved ${(result as any).approved ?? 0} timesheet${((result as any).approved ?? 0) !== 1 ? "s" : ""}.`);
        router.refresh();
      } catch (err) {
        showError({ title: "Error", message: err instanceof Error ? err.message : "Failed to approve all timesheets." });
      }
    });
  };

  const handleReject = () => {
    if (!rejectingId || !rejectReason) return;
    startTransition(async () => {
      try {
        const rejectResult = await rejectTimesheet(rejectingId, rejectReason);
        if (rejectResult && "error" in rejectResult) throw new Error(rejectResult.error ?? "Failed to reject");
        setRejectingId(null);
        setRejectReason("");
        router.refresh();
      } catch (err) {
        showError({ title: "Error", message: err instanceof Error ? err.message : "Failed to reject timesheet." });
      }
    });
  };

  const handleUnreject = (id: string) => {
    startTransition(async () => {
      try {
        const result = await unrejectTimesheet(id);
        if (result && "error" in result) throw new Error(result.error ?? "Failed to unreject");
        router.refresh();
      } catch (err) {
        showError({ title: "Error", message: err instanceof Error ? err.message : "Failed to unreject timesheet." });
      }
    });
  };

  const handleCreatePeriod = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await createTimesheetPeriod({
          name: fd.get("name") as string,
          startDate: fd.get("startDate") as string,
          endDate: fd.get("endDate") as string,
        });
        setShowCreatePeriod(false);
        showSuccess("Period created.");
      } catch (err) {
        showError({ title: "Error", message: err instanceof Error ? err.message : "Failed to create period." });
      }
    });
  };

  // Summary stats
  const totalPendingHours = pending.reduce((sum, s) => sum + Number(s.totalHours), 0);
  const totalPendingCost = pending.reduce((sum, s) => {
    const rate = s.employee.hourlyRate ? Number(s.employee.hourlyRate) : 0;
    const bonus = Number((s as any).bonusTotal ?? 0);
    return sum + Number(s.totalHours) * rate + bonus;
  }, 0);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  const openPeriods = periods.filter((p) => p.status === "open" && new Date(p.startDate as any).toISOString().split("T")[0] <= today);

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs font-medium text-muted-foreground">Pending Review</div>
          <div className="mt-1 text-2xl font-bold">{pending.length}</div>
          <div className="text-xs text-muted-foreground">timesheet{pending.length !== 1 ? "s" : ""}</div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs font-medium text-muted-foreground">Total Hours</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{fmtHours(totalPendingHours)}</div>
          <div className="text-xs text-muted-foreground">pending approval</div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs font-medium text-muted-foreground">Estimated Cost</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">${totalPendingCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          <div className="text-xs text-muted-foreground">across all pending</div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs font-medium text-muted-foreground">Open Periods</div>
          <div className="mt-1 text-2xl font-bold">{openPeriods.length}</div>
          <div className="text-xs text-muted-foreground">{periods.length} total periods</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between border-b">
        <div className="flex">
          {(["pending", "recent", "periods"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "pending" && `Pending (${pending.length})`}
              {tab === "recent" && "Recently Processed"}
              {tab === "periods" && "Periods"}
            </button>
          ))}
        </div>
        <div className="flex gap-2 pb-1">
          {activeTab === "pending" && pending.length > 1 && (
            <button
              type="button"
              onClick={handleApproveAll}
              disabled={isPending}
              className="h-8 rounded-md bg-green-600 px-3 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {isPending ? "Approving..." : `Approve All (${pending.length})`}
            </button>
          )}
          {activeTab === "periods" && (
            <button
              type="button"
              onClick={() => setShowCreatePeriod(true)}
              className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              + New Period
            </button>
          )}
        </div>
      </div>

      {/* Pending Tab */}
      {activeTab === "pending" && (
        <div className="space-y-3">
          {pending.length > 0 ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {pending.map((sub) => (
                <TimesheetCard
                  key={sub.id}
                  sub={sub}
                  onApprove={handleApprove}
                  onReject={(id: string): void => { setRejectingId(id); }}
                  isPending={!!isPending}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border bg-card py-12 text-center">
              <div className="text-3xl mb-2"></div>
              <div className="text-lg font-medium">All caught up!</div>
              <div className="text-sm text-muted-foreground mt-1">No timesheets waiting for review.</div>
            </div>
          )}
        </div>
      )}

      {/* Recent Tab */}
      {activeTab === "recent" && (
        <div className="space-y-3">
          {recent.length > 0 ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {recent.map((sub) => (
                <TimesheetCard key={sub.id} sub={sub} isPending={!!isPending} showStatus onUnreject={handleUnreject} />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border bg-card py-12 text-center">
              <div className="text-sm text-muted-foreground">No recently processed timesheets.</div>
            </div>
          )}
        </div>
      )}

      {/* Periods Tab */}
      {activeTab === "periods" && (
        <div className="space-y-3">
          {periods.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-xl border bg-card p-4">
              <div>
                <div className="font-medium">{p.name}</div>
                <div className="mt-0.5 text-sm text-muted-foreground">
                  {new Date(p.startDate as any).toLocaleDateString("en-US", { timeZone: "UTC" })} — {new Date(p.endDate as any).toLocaleDateString("en-US", { timeZone: "UTC" })}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="rounded-md bg-muted px-2 py-0.5 text-xs tabular-nums">{p._count.submissions} submission{p._count.submissions !== 1 ? "s" : ""}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                  p.status === "open" ? "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300" :
                  "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                }`}>
                  {p.status}
                </span>
              </div>
            </div>
          ))}
          {periods.length === 0 && (
            <div className="rounded-xl border bg-card py-12 text-center">
              <div className="text-sm text-muted-foreground">No periods yet. Create your first timesheet period to get started.</div>
            </div>
          )}
        </div>
      )}

      {/* Reject Dialog */}
      {rejectingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-200" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold">Reject Timesheet</h2>
            <p className="mt-1 text-sm text-muted-foreground">Please provide a reason for the rejection. The contractor will be notified.</p>
            <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Reason for rejection..." rows={3} className="mt-3 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" autoFocus />
            <div className="mt-4 flex justify-end gap-3">
              <button type="button" onClick={() => { setRejectingId(null); setRejectReason(""); }} className="h-10 rounded-md border px-4 text-sm">Cancel</button>
              <button type="button" onClick={handleReject} disabled={isPending || !rejectReason} className="h-10 rounded-md bg-red-600 px-4 text-sm text-white hover:bg-red-700 disabled:opacity-50">Reject</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Period Dialog */}
      {showCreatePeriod && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-200" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold">New Timesheet Period</h2>
            <p className="mt-1 text-sm text-muted-foreground">Create a new period for contractors to submit their hours.</p>
            <form onSubmit={handleCreatePeriod} className="mt-4 space-y-4">
              <div>
                <label className="text-sm font-medium">Period Name *</label>
                <input name="name" required placeholder='e.g., "Week of Feb 17, 2026"' className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Start Date *</label>
                  <DatePicker name="startDate" required className="mt-1" />
                </div>
                <div>
                  <label className="text-sm font-medium">End Date *</label>
                  <DatePicker name="endDate" required className="mt-1" />
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowCreatePeriod(false)} className="h-10 rounded-md border px-4 text-sm">Cancel</button>
                <button type="submit" disabled={isPending} className="h-10 rounded-md bg-primary px-4 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
