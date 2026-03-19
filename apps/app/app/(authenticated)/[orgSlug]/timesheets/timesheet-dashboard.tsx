"use client";


import Image from "next/image";
import { shortDate, fullDate, hours as fmtHours } from "@/lib/hriq/format";
import { useErrorDialog } from "@/app/(authenticated)/components/error-dialog";
import { CustomSelect } from "@/app/(authenticated)/components/custom-select";
import { DatePicker } from "@/app/(authenticated)/components/date-picker";
import { MissingTimesheets } from "./missing-timesheets";
import { approveTimesheet, unapproveTimesheet, batchApproveTimesheets, rejectTimesheet, unrejectTimesheet, deleteTimesheetPeriod, createTimesheetPeriod, forceSubmitDraft, approveTimesheetAdjustment, denyTimesheetAdjustment, unsubmitTimesheet } from "@/app/actions/hriq/timesheets";
import { generatePeriodsForYear } from "@/app/actions/hriq/payroll";
import type { TimesheetSubmission, TimesheetPeriod } from "@repo/database";
import Link from "next/link";
import { useParams, useRouter, usePathname } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

type Sub = TimesheetSubmission & {
  employee: { id: string; legalFirstName: string; legalLastName: string; employeeNumber: string; hourlyRate: unknown; currency: string; photoUrl: string | null; department: string | null; preferredPaymentMethod: string | null };
  period: TimesheetPeriod;
};
type PeriodWithCount = TimesheetPeriod & { _count: { submissions: number } };

//  Period Group 

function PeriodGroup({
  period,
  subs,
  readOnly = false,
}: {
  period: TimesheetPeriod;
  subs: Sub[];
  readOnly?: boolean;
}) {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const [localPending, setLocalPending] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { showError, showSuccess } = useErrorDialog();

  const pendingSubs = subs.filter((s) => s.status === "submitted");
  const approvedSubs = subs.filter((s) => s.status === "approved" || s.status === "auto_approved");
  const rejectedSubs = subs.filter((s) => s.status === "rejected");
  const draftSubs = subs.filter((s) => s.status === "draft");
  const totalHours = subs.reduce((sum, s) => sum + Number(s.totalHours), 0);
  const pendingHours = pendingSubs.reduce((sum, s) => sum + Number(s.totalHours), 0);
  const totalCost = subs.reduce((sum, s) => {
    const rate = s.employee.hourlyRate ? Number(s.employee.hourlyRate) : 0;
    return sum + Number(s.totalHours) * rate + Number((s as any).bonusTotal ?? 0);
  }, 0);
  const isPending = localPending !== null;

  const handleApprove = async (id: string) => {
    setLocalPending(id);
    try {
      const approveResult = await approveTimesheet(id);
      if (approveResult && "error" in approveResult) throw new Error(approveResult.error ?? "Failed to approve");
      showSuccess("Timesheet approved.");
    } catch (err) {
      showError({ title: "Error", message: err instanceof Error ? err.message : "Failed." });
    } finally {
      setLocalPending(null);
    }
  };

  const handleApproveAll = async () => {
    if (pendingSubs.length === 0) return;
    setLocalPending("all");
    try {
      const result = await batchApproveTimesheets(pendingSubs.map((s) => s.id));
      if ("error" in result) { showError({ title: "Error", message: result.error ?? "An error occurred" }); return; }
      showSuccess(`Approved ${(result as any).approved ?? 0} timesheet${((result as any).approved ?? 0) > 1 ? "s" : ""}.`);
    } catch (err) {
      showError({ title: "Error", message: err instanceof Error ? err.message : "Failed." });
    } finally {
      setLocalPending(null);
    }
  };

  const handleReject = async () => {
    if (!rejectingId || !rejectReason.trim()) return;
    setLocalPending(rejectingId);
    try {
      const rejectResult = await rejectTimesheet(rejectingId, rejectReason);
      if (rejectResult && "error" in rejectResult) throw new Error(rejectResult.error ?? "Failed to reject");
      setRejectingId(null);
      setRejectReason("");
    } catch (err) {
      showError({ title: "Error", message: err instanceof Error ? err.message : "Failed." });
    } finally {
      setLocalPending(null);
    }
  };

  const handleUnapprove = async (submissionId: string) => {
    setLocalPending(submissionId);
    try {
      const result = await unapproveTimesheet(submissionId);
      if (result && "error" in result) throw new Error((result as any).error ?? "Failed");
      showSuccess(`Timesheet for ${(result as any).name} moved back to submitted.`);
      router.refresh();
    } catch (err) {
      showError({ title: "Error", message: err instanceof Error ? err.message : "Failed to un-approve." });
    } finally {
      setLocalPending(null);
    }
  };

  const handleForceSubmit = async (submissionId: string) => {
    setLocalPending(submissionId);
    try {
      const result = await forceSubmitDraft(submissionId);
      if (result && "error" in result) throw new Error(result.error ?? "Failed");
      showSuccess(`Submitted draft for ${(result as any).name}.`);
      router.refresh();
    } catch (err) {
      showError({ title: "Error", message: err instanceof Error ? err.message : "Failed to submit draft." });
    } finally {
      setLocalPending(null);
    }
  };

  const handleDelete = async () => {
    setShowDeleteConfirm(false);
    setLocalPending("delete");
    try {
      await deleteTimesheetPeriod(period.id);
      showSuccess(`Deleted period "${period.name}".`);
    } catch (err) {
      showError({ title: "Error", message: err instanceof Error ? err.message : "Failed." });
    } finally {
      setLocalPending(null);
    }
  };

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {/* Period Header */}
      <div className="flex items-center gap-4 px-4 py-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold truncate">{period.name}</span>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${
              period.status === "open" ? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300" :
              "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
            }`}>
              {period.status}
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {shortDate(period.startDate)} — {fullDate(period.endDate)}
          </div>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          {pendingSubs.length > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
              {pendingSubs.length} pending
            </span>
          )}
          <div className="text-right hidden sm:block">
            <div className="text-sm font-bold tabular-nums">{fmtHours(totalHours)}</div>
            {totalCost > 0 && <div className="text-[10px] text-muted-foreground">${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>}
          </div>
          <div className="flex gap-1 text-[10px] text-muted-foreground">
            <span className="rounded bg-green-100 px-1.5 py-0.5 text-green-700 dark:bg-green-900/40 dark:text-green-300">{approvedSubs.length}</span>
            {draftSubs.length > 0 && <span className="rounded bg-yellow-100 px-1.5 py-0.5 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300">{draftSubs.length} draft</span>}
            {rejectedSubs.length > 0 && <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-700 dark:bg-red-900/40 dark:text-red-300">{rejectedSubs.length}</span>}
            <span className="rounded bg-muted px-1.5 py-0.5">{subs.length} total</span>
          </div>
          {/* Delete period — subtle icon, admin only */}
          {!readOnly && (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isPending}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-50"
              title="Delete this period"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Submissions */}
        <div className="border-t">
          {/* Bulk approve bar — only when there are pending timesheets */}
          {pendingSubs.length > 0 && !readOnly && (
            <div className="flex items-center justify-between bg-amber-50 px-4 py-2 dark:bg-amber-900/10">
              <span className="text-xs font-medium text-amber-800 dark:text-amber-200">
                {pendingSubs.length} timesheet{pendingSubs.length > 1 ? "s" : ""} awaiting review ({fmtHours(pendingHours)})
              </span>
              <button
                type="button"
                onClick={handleApproveAll}
                disabled={isPending}
                className="h-7 rounded-md bg-green-600 px-3 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {isPending ? "…" : `Approve All (${pendingSubs.length})`}
              </button>
            </div>
          )}

          {/* Table header */}
          <div className="hidden sm:grid grid-cols-[1fr_80px_70px_80px_auto] gap-2 px-4 py-2 text-[10px] font-medium text-muted-foreground uppercase border-b bg-muted/20">
            <div>Contractor</div>
            <div className="text-right">Hours</div>
            <div className="text-right">Rate</div>
            <div className="text-right">Est. Pay</div>
            <div className="text-right">Actions</div>
          </div>

          {/* Rows */}
          {subs.length > 0 ? subs.map((sub, idx) => {
            const total = Number(sub.totalHours);
            const rate = sub.employee.hourlyRate ? Number(sub.employee.hourlyRate) : 0;
            const bonusAmt = Number((sub as any).bonusTotal ?? 0);
            const cost = total * rate + bonusAmt;
            const method = (sub.employee.preferredPaymentMethod ?? "").toLowerCase();
            const methodLabel = method === "wise" ? "Wise" : method === "cadana" ? "Cadana" : "";

            // Show a group separator when payment method changes within the same status group
            const prevSub = idx > 0 ? subs[idx - 1] : null;
            const prevMethod = prevSub ? (prevSub.employee.preferredPaymentMethod ?? "").toLowerCase() : "";
            const prevStatus = prevSub?.status ?? "";
            const statusGroup = sub.status === "approved" || sub.status === "auto_approved" ? "approved" : sub.status;
            const prevStatusGroup = prevStatus === "approved" || prevStatus === "auto_approved" ? "approved" : prevStatus;
            const showMethodHeader = idx === 0 || method !== prevMethod || statusGroup !== prevStatusGroup;

            return (
              <div key={sub.id}>
                {showMethodHeader && methodLabel && (
                  <div className="flex items-center gap-2 px-4 py-1.5 bg-muted/40 border-b">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      method === "wise" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" :
                      "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300"
                    }`}>{methodLabel}</span>
                  </div>
                )}
              <div className={`grid grid-cols-1 sm:grid-cols-[1fr_80px_70px_80px_auto] gap-2 items-center px-4 py-2.5 border-b last:border-0 ${sub.status === "submitted" ? "bg-amber-50/50 dark:bg-amber-900/5" : ""}`}>
                {/* Name */}
                <div className="flex items-center gap-2 min-w-0">
                  {sub.employee.photoUrl && !sub.employee.photoUrl.endsWith("/logo.png") ? (
                    <Image src={sub.employee.photoUrl} alt="" width={28} height={28} className="h-7 w-7 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="flex h-7 w-7 items-center justify-center rounded-md shrink-0 bg-white dark:bg-white/90 p-0.5">
                      <img src="/logo.png" alt="RL" className="h-full w-full object-contain" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <Link href={`/${orgSlug}/employees/${sub.employee.id}?from=${encodeURIComponent(pathname)}`} className="text-sm font-medium hover:underline truncate">
                        {sub.employee.legalFirstName} {sub.employee.legalLastName}
                      </Link>
                      {method && (
                        <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold leading-none ${
                          method === "wise" ? "bg-emerald-100/70 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                          method === "cadana" ? "bg-sky-100/70 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400" :
                          "bg-muted text-muted-foreground"
                        }`}>{method === "wise" ? "W" : method === "cadana" ? "C" : method.charAt(0).toUpperCase()}</span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground">{sub.employee.employeeNumber}</div>
                  </div>
                </div>

                {/* Total Hours */}
                <div className="text-right">
                  <span className="text-sm font-bold tabular-nums">{fmtHours(total)}</span>
                </div>

                {/* Rate */}
                <div className="text-right text-xs text-muted-foreground tabular-nums">
                  {rate > 0 ? `$${rate}/h` : "—"}
                </div>

                {/* Cost */}
                <div className="text-right text-xs font-medium tabular-nums">
                  {cost > 0 ? `$${cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                  {bonusAmt > 0 && <div className="text-[10px] text-muted-foreground">incl. ${bonusAmt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} bonus</div>}
                </div>

                {/* Actions */}
                <div className="flex flex-wrap items-center justify-end gap-1">
                  {readOnly ? (
                    <div className="flex items-center gap-1">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${
                      sub.status === "approved" || sub.status === "auto_approved" ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" :
                      sub.status === "rejected" ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" :
                      sub.status === "submitted" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" :
                      "bg-gray-100 text-gray-500"
                    }`}>
                      {sub.status === "auto_approved" ? "approved" : sub.status}
                    </span>
                    {(sub.status === "approved" || sub.status === "auto_approved") && sub.approvedByName && (
                      <span className="text-[9px] text-muted-foreground">by {sub.approvedByName}</span>
                    )}
                    {sub.status === "rejected" && (
                      <button
                        type="button"
                        onClick={async () => {
                          setLocalPending(sub.id);
                          try {
                            const result = await unrejectTimesheet(sub.id);
                            if (result && "error" in result) throw new Error(result.error ?? "Failed");
                            router.refresh();
                          } catch (err) {
                            showError({ title: "Error", message: err instanceof Error ? err.message : "Failed to unreject." });
                          } finally {
                            setLocalPending(null);
                          }
                        }}
                        disabled={isPending}
                        className="h-6 rounded border border-amber-200 dark:border-amber-800 px-1.5 text-[10px] text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 disabled:opacity-50"
                        title="Move back to submitted"
                      >
                        Unreject
                      </button>
                    )}
                    </div>
                  ) : sub.status === "submitted" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleApprove(sub.id)}
                        disabled={isPending}
                        className="h-6 rounded bg-green-600 px-2 text-[11px] font-medium text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => setRejectingId(sub.id)}
                        disabled={isPending}
                        className="h-6 rounded border border-red-200 px-2 text-[11px] text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400"
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          setLocalPending(sub.id);
                          try {
                            const result = await unsubmitTimesheet(sub.id);
                            if (result && "error" in result) throw new Error(result.error ?? "Failed");
                            showSuccess("Timesheet moved back to draft.");
                            router.refresh();
                          } catch (err) {
                            showError({ title: "Error", message: err instanceof Error ? err.message : "Failed to unsubmit." });
                          } finally {
                            setLocalPending(null);
                          }
                        }}
                        disabled={isPending}
                        className="h-6 rounded border px-2 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                        title="Move back to draft so contractor can re-edit"
                      >
                        Unsubmit
                      </button>
                      {(sub as any).adjustmentStatus === "requested" && (
                        <div className="flex items-center gap-1 ml-1">
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 cursor-help" title={(sub as any).adjustmentNote ?? ""}>
                            Edit Request{(sub as any).adjustmentNote ? `: ${(sub as any).adjustmentNote.slice(0, 60)}${(sub as any).adjustmentNote.length > 60 ? "…" : ""}` : ""}
                          </span>
                          <button type="button" onClick={async () => { setLocalPending(sub.id); try { const r = await approveTimesheetAdjustment(sub.id); if ("error" in r) throw new Error(r.error); showSuccess("Adjustment acknowledged — apply the edit from the detail view"); router.refresh(); } catch (e) { showError({ title: "Error", message: e instanceof Error ? e.message : "Failed" }); } finally { setLocalPending(null); } }} disabled={isPending} className="h-5 rounded bg-green-600 px-1.5 text-[9px] font-medium text-white hover:bg-green-700 disabled:opacity-50">Apply</button>
                          <button type="button" onClick={async () => { setLocalPending(sub.id); try { const r = await denyTimesheetAdjustment(sub.id); if ("error" in r) throw new Error(r.error); router.refresh(); } catch (e) { showError({ title: "Error", message: e instanceof Error ? e.message : "Failed" }); } finally { setLocalPending(null); } }} disabled={isPending} className="h-5 rounded border px-1.5 text-[9px] text-muted-foreground hover:bg-accent disabled:opacity-50">Deny</button>
                        </div>
                      )}
                    </>
                  ) : sub.status === "draft" ? (
                    <button
                      type="button"
                      onClick={() => handleForceSubmit(sub.id)}
                      disabled={isPending}
                      className="h-6 rounded bg-blue-600 px-2 text-[11px] font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      Submit
                    </button>
                  ) : (
                    <div className="flex items-center gap-1">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${
                        sub.status === "approved" || sub.status === "auto_approved" ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" :
                        sub.status === "rejected" ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" :
                        "bg-gray-100 text-gray-500"
                      }`}>
                        {sub.status === "auto_approved" ? "approved" : sub.status}
                      </span>
                      {(sub.status === "approved" || sub.status === "auto_approved") && sub.approvedByName && (
                        <span className="text-[9px] text-muted-foreground">by {sub.approvedByName}</span>
                      )}
                      {(sub.status === "approved" || sub.status === "auto_approved") && (
                        <button
                          type="button"
                          onClick={() => handleUnapprove(sub.id)}
                          disabled={isPending}
                          className="h-6 rounded border px-1.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                          title="Move back to submitted"
                        >
                          Undo
                        </button>
                      )}
                      {sub.status === "rejected" && (
                        <button
                          type="button"
                          onClick={async () => {
                            setLocalPending(sub.id);
                            try {
                              const result = await unrejectTimesheet(sub.id);
                              if (result && "error" in result) throw new Error(result.error ?? "Failed");
                              router.refresh();
                            } catch (err) {
                              showError({ title: "Error", message: err instanceof Error ? err.message : "Failed to unreject." });
                            } finally {
                              setLocalPending(null);
                            }
                          }}
                          disabled={isPending}
                          className="h-6 rounded border border-amber-200 dark:border-amber-800 px-1.5 text-[10px] text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 disabled:opacity-50"
                          title="Move back to submitted"
                        >
                          Unreject
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
              </div>
            );
          }) : (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              No submissions for this period yet.
            </div>
          )}

          {/* Period cost summary */}
          {subs.length > 0 && totalCost > 0 && (
            <div className="hidden sm:grid grid-cols-[1fr_80px_70px_80px_100px] gap-2 items-center px-4 py-2 border-t bg-muted/20">
              <div className="text-xs font-bold text-muted-foreground uppercase">Period Total</div>
              <div className="text-right text-sm font-bold tabular-nums">{fmtHours(totalHours)}</div>
              <div />
              <div className="text-right text-sm font-bold tabular-nums text-emerald-600">${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              <div />
            </div>
          )}
        </div>

      {/* Reject Dialog */}
      {rejectingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-200" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold">Reject Timesheet</h2>
            <p className="mt-1 text-sm text-muted-foreground">The contractor will be notified.</p>
            <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Reason for rejection..." rows={3} className="mt-3 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" autoFocus />
            <div className="mt-4 flex justify-end gap-3">
              <button type="button" onClick={() => { setRejectingId(null); setRejectReason(""); }} className="h-10 rounded-md border px-4 text-sm">Cancel</button>
              <button type="button" onClick={handleReject} disabled={isPending || !rejectReason.trim()} className="h-10 rounded-md bg-red-600 px-4 text-sm text-white hover:bg-red-700 disabled:opacity-50">Reject</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Period Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-200" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-red-600">Delete Pay Period</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Are you sure you want to delete <span className="font-semibold text-foreground">{period.name}</span> and all its submissions? This cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={() => setShowDeleteConfirm(false)} className="h-10 rounded-md border px-4 text-sm hover:bg-accent">Cancel</button>
              <button type="button" onClick={handleDelete} disabled={isPending} className="h-10 rounded-md bg-red-600 px-4 text-sm text-white hover:bg-red-700 disabled:opacity-50">
                {isPending ? "Deleting..." : "Delete Period"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

//  Main Dashboard 

export function TimesheetDashboard({
  submissions,
  periods,
  readOnly = false,
}: {
  submissions: Sub[];
  periods: PeriodWithCount[];
  readOnly?: boolean;
}) {
  const { showError, showSuccess } = useErrorDialog();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [genYear, setGenYear] = useState(new Date().getFullYear());
  const [selectedPeriodId, setSelectedPeriodId] = useState(() => {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }); // YYYY-MM-DD in PST
    const current = periods.find((p) => {
      const start = new Date(p.startDate as any).toISOString().split("T")[0];
      const end = new Date(p.endDate as any).toISOString().split("T")[0];
      return today >= start && today <= end;
    });
    if (current) return current.id;
    const withPending = periods.find((p) => submissions.some((s) => s.periodId === p.id && s.status === "submitted"));
    if (withPending) return withPending.id;
    const sorted = [...periods].sort((a, b) => new Date(b.startDate as any).getTime() - new Date(a.startDate as any).getTime());
    return sorted.length > 0 ? sorted[0].id : "";
  });
  const [deptFilter, setDeptFilter] = useState("all");
  const [payMethodFilter, setPayMethodFilter] = useState("all");

  // Unique departments from submissions
  const departments = useMemo(() => {
    const depts = new Set<string>();
    for (const s of submissions) {
      if (s.employee.department) depts.add(s.employee.department);
    }
    return [...depts].sort();
  }, [submissions]);

  const selectedPeriod = periods.find((p) => p.id === selectedPeriodId);
  const periodSubs = useMemo(() => {
    let subs = submissions.filter((s) => s.periodId === selectedPeriodId);
    if (deptFilter !== "all") subs = subs.filter((s) => s.employee.department === deptFilter);
    if (payMethodFilter !== "all") {
      subs = subs.filter((s) => {
        const method = (s.employee.preferredPaymentMethod ?? "").toLowerCase();
        return method === payMethodFilter;
      });
    }
    // Sort: pending first, then approved, then rest. Within each status group, sort by payment method then name.
    const statusOrder: Record<string, number> = { submitted: 0, draft: 1, approved: 2, auto_approved: 2, rejected: 3 };
    const methodOrder: Record<string, number> = { wise: 0, cadana: 1 };
    subs = [...subs].sort((a, b) => {
      const sa = statusOrder[a.status] ?? 9;
      const sb = statusOrder[b.status] ?? 9;
      if (sa !== sb) return sa - sb;
      const ma = methodOrder[(a.employee.preferredPaymentMethod ?? "").toLowerCase()] ?? 9;
      const mb = methodOrder[(b.employee.preferredPaymentMethod ?? "").toLowerCase()] ?? 9;
      if (ma !== mb) return ma - mb;
      return (a.employee.legalLastName ?? "").localeCompare(b.employee.legalLastName ?? "");
    });
    return subs;
  }, [submissions, selectedPeriodId, deptFilter, payMethodFilter]);

  const periodOptions = useMemo(() => {
    const countMap = new Map<string, { drafts: number; awaiting: number; approved: number }>();
    for (const s of submissions) {
      const entry = countMap.get(s.periodId) ?? { drafts: 0, awaiting: 0, approved: 0 };
      if (s.status === "draft") entry.drafts++;
      else if (s.status === "submitted") entry.awaiting++;
      else if (s.status === "approved" || s.status === "auto_approved") entry.approved++;
      countMap.set(s.periodId, entry);
    }
    // Only show periods whose start_date has arrived (hide future periods)
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
    return [...periods]
      .filter((p) => {
        const start = new Date(p.startDate as any).toISOString().split("T")[0];
        return start <= today;
      })
      .sort((a, b) => new Date(b.startDate as any).getTime() - new Date(a.startDate as any).getTime())
      .map((p) => {
        const counts = countMap.get(p.id);
        let label = `${p.name} (${shortDate(p.startDate)} – ${shortDate(p.endDate)})`;
        if (counts) {
          const parts: string[] = [];
          if (counts.awaiting) parts.push(`${counts.awaiting} awaiting review`);
          if (counts.drafts) parts.push(`${counts.drafts} draft${counts.drafts > 1 ? "s" : ""}`);
          if (counts.approved) parts.push(`${counts.approved} approved`);
          if (parts.length) label += ` · ${parts.join(", ")}`;
        }
        return { value: p.id, label };
      });
  }, [periods, submissions]);

  const handleCreatePeriod = () => {
    if (!newName.trim() || !newStart || !newEnd) {
      showError({ title: "Missing fields", message: "Please fill in name, start date, and end date." });
      return;
    }
    startTransition(async () => {
      try {
        await createTimesheetPeriod({ name: newName.trim(), startDate: newStart, endDate: newEnd });
        showSuccess(`Created period "${newName.trim()}".`);
        setShowCreateForm(false);
        setNewName("");
        setNewStart("");
        setNewEnd("");
        router.refresh();
      } catch (err) {
        showError({ title: "Error", message: err instanceof Error ? err.message : "Failed to create period" });
      }
    });
  };

  const handleGenerateYear = () => {
    startTransition(async () => {
      try {
        const rawResult = await generatePeriodsForYear(genYear);
        if ("error" in rawResult) { showError({ title: "Error", message: (rawResult as any).error ?? "An error occurred" }); return; }
        const result = rawResult as Exclude<typeof rawResult, { error: string }>;
        showSuccess(`Created ${result.created ?? 0} periods for ${result.year ?? ""}${(result.skipped ?? 0) > 0 ? ` (${result.skipped} already existed)` : ""}.`);
        router.refresh();
      } catch (err) {
        showError({ title: "Error", message: err instanceof Error ? err.message : "Failed to generate periods" });
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* Period selector + Create button */}
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-sm font-medium text-muted-foreground shrink-0">Pay Period</label>
        <div className="flex-1 min-w-[240px] max-w-md overflow-hidden">
          <CustomSelect
            value={selectedPeriodId}
            onValueChange={setSelectedPeriodId}
            placeholder="Select pay period..."
            triggerClassName="w-full"
            options={periodOptions}
          />
        </div>
        {departments.length > 1 && (
          <div className="shrink-0 min-w-[160px]">
            <CustomSelect
              value={deptFilter}
              onValueChange={setDeptFilter}
              placeholder="All Departments"
              triggerClassName="w-full"
              options={[
                { value: "all", label: "All Departments" },
                ...departments.map((d) => ({ value: d, label: d })),
              ]}
            />
          </div>
        )}
        <div className="shrink-0 min-w-[120px]">
          <CustomSelect
            value={payMethodFilter}
            onValueChange={setPayMethodFilter}
            placeholder="All Methods"
            triggerClassName="w-full"
            options={[
              { value: "all", label: "All Methods" },
              { value: "wise", label: "Wise" },
              { value: "cadana", label: "Cadana" },
            ]}
          />
        </div>
        {!readOnly && (
        <button
          type="button"
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="h-9 rounded-md border px-3 text-sm font-medium hover:bg-accent transition-colors"
        >
          {showCreateForm ? "Cancel" : "+ Create Period"}
        </button>
        )}
        {/* Missing timesheets reminder button — hide once the period's submission window has closed */}
        {selectedPeriodId && selectedPeriod && new Date(selectedPeriod.endDate as any).getTime() >= new Date(new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" })).getTime() && (
          <MissingTimesheets periodId={selectedPeriodId} />
        )}
      </div>

      {/* Create Period Panel */}
      {showCreateForm && (
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <h3 className="font-semibold text-sm">Create Pay Period</h3>

          {/* Quick generate */}
          <div className="flex items-center gap-2 pb-3 border-b">
            <span className="text-sm text-muted-foreground">Quick:</span>
            <CustomSelect
              value={String(genYear)}
              onValueChange={(v) => setGenYear(Number(v))}
              triggerClassName="h-8 w-24 text-xs"
              options={[2025, 2026, 2027].map((y) => ({ value: String(y), label: String(y) }))}
            />
            <button
              type="button"
              onClick={handleGenerateYear}
              disabled={isPending}
              className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isPending ? "Generating..." : `Generate ${genYear} Semi-Monthly`}
            </button>
          </div>

          {/* Manual create */}
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Or create a custom period:</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                placeholder="Period name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              />
              <DatePicker
                value={newStart}
                onChange={(v) => setNewStart(v)}
                placeholder="Start date"
              />
              <DatePicker
                value={newEnd}
                onChange={(v) => setNewEnd(v)}
                placeholder="End date"
              />
            </div>
            <button
              type="button"
              onClick={handleCreatePeriod}
              disabled={isPending || !newName.trim() || !newStart || !newEnd}
              className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isPending ? "Creating..." : "Create Period"}
            </button>
          </div>
        </div>
      )}

      {/* Selected period content */}
      {selectedPeriod && (
        <PeriodGroup
          period={selectedPeriod}
          subs={periodSubs}
          readOnly={readOnly}
        />
      )}

      {!selectedPeriod && periods.length === 0 && (
        <div className="rounded-xl border bg-card py-12 text-center">
          <div className="text-lg font-medium">No pay periods yet</div>
          <div className="text-sm text-muted-foreground mt-1">Click &quot;+ Create Period&quot; above to get started.</div>
        </div>
      )}
    </div>
  );
}
