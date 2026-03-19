"use client";

import { approveTimesheet, rejectTimesheet, createTimesheetPeriod } from "@/app/actions/hriq/timesheets";
import type { TimesheetSubmission, TimesheetPeriod, Employee } from "@repo/database";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type SubmissionWithRelations = TimesheetSubmission & {
  employee: { id: string; legalFirstName: string; legalLastName: string; employeeNumber: string; hourlyRate: string | null; currency: string };
  period: TimesheetPeriod;
};

type PeriodWithCount = TimesheetPeriod & { _count: { submissions: number } };

export function TimesheetApprovals({
  pending,
  periods,
}: {
  pending: SubmissionWithRelations[];
  periods: PeriodWithCount[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showCreatePeriod, setShowCreatePeriod] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const handleApprove = (id: string) => {
    startTransition(async () => {
      await approveTimesheet(id);
      router.refresh();
    });
  };

  const handleReject = () => {
    if (!rejectingId || !rejectReason) return;
    startTransition(async () => {
      await rejectTimesheet(rejectingId, rejectReason);
      setRejectingId(null);
      setRejectReason("");
      router.refresh();
    });
  };

  const handleCreatePeriod = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await createTimesheetPeriod({
        name: fd.get("name") as string,
        startDate: fd.get("startDate") as string,
        endDate: fd.get("endDate") as string,
      });
      setShowCreatePeriod(false);
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      {/* Pending Approvals */}
      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Pending Approvals ({pending.length})</h2>
          <button type="button" onClick={() => setShowCreatePeriod(true)} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            + New Period
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {pending.map((sub) => {
            const total = Number(sub.totalHours);
            const rate = sub.employee.hourlyRate ? Number(sub.employee.hourlyRate) : 0;
            const cost = (total * rate).toFixed(2);

            return (
              <div key={sub.id} className="rounded-xl border bg-card p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Link href={`/client/employees/${sub.employee.id}`} className="font-medium hover:underline">
                        {sub.employee.legalFirstName} {sub.employee.legalLastName}
                      </Link>
                      <span className="text-xs text-muted-foreground">{sub.employee.employeeNumber}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{sub.period.name}</p>
                    <div className="mt-2 flex gap-4 text-sm">
                      <span><strong>{total}h</strong> total</span>
                      {rate > 0 && <span>{sub.employee.currency} {cost}</span>}
                      {sub.autoApproveAt && (
                        <span className="text-xs text-orange-600 dark:text-orange-400">
                          Auto-approves {new Date(sub.autoApproveAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex gap-2 text-xs text-muted-foreground">
                      <span>M:{String(sub.mondayHours)}</span>
                      <span>T:{String(sub.tuesdayHours)}</span>
                      <span>W:{String(sub.wednesdayHours)}</span>
                      <span>Th:{String(sub.thursdayHours)}</span>
                      <span>F:{String(sub.fridayHours)}</span>
                      <span>Sa:{String(sub.saturdayHours)}</span>
                      <span>Su:{String(sub.sundayHours)}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => handleApprove(sub.id)} disabled={isPending} className="rounded-md bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700 disabled:opacity-50">
                      Approve
                    </button>
                    <button type="button" onClick={() => setRejectingId(sub.id)} className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400">
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {pending.length === 0 && (
            <div className="py-8 text-center text-muted-foreground">No pending timesheets.</div>
          )}
        </div>
      </div>

      {/* Periods */}
      <div>
        <h2 className="text-lg font-semibold">Timesheet Periods</h2>
        <div className="mt-3 space-y-2">
          {periods.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <span className="font-medium">{p.name}</span>
                <span className="ml-2 text-sm text-muted-foreground">
                  {new Date(p.startDate).toLocaleDateString()} - {new Date(p.endDate).toLocaleDateString()}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-muted px-2 py-0.5 text-xs">{p._count.submissions} submissions</span>
                <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${p.status === "open" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>
                  {p.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Reject Dialog */}
      {rejectingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl border bg-background p-6 shadow-lg">
            <h2 className="text-lg font-semibold">Reject Timesheet</h2>
            <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Reason for rejection..." rows={3} className="mt-3 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            <div className="mt-4 flex justify-end gap-3">
              <button type="button" onClick={() => { setRejectingId(null); setRejectReason(""); }} className="h-10 rounded-md border px-4 text-sm">Cancel</button>
              <button type="button" onClick={handleReject} disabled={isPending || !rejectReason} className="h-10 rounded-md bg-red-600 px-4 text-sm text-white hover:bg-red-700 disabled:opacity-50">Reject</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Period Dialog */}
      {showCreatePeriod && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl border bg-background p-6 shadow-lg">
            <h2 className="text-lg font-semibold">New Timesheet Period</h2>
            <form onSubmit={handleCreatePeriod} className="mt-4 space-y-4">
              <div>
                <label className="text-sm font-medium">Name *</label>
                <input name="name" required placeholder='e.g., "Week of Feb 17, 2026"' className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Start Date *</label>
                  <input name="startDate" type="date" required className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-sm font-medium">End Date *</label>
                  <input name="endDate" type="date" required className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
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
