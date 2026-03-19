"use client";

import { approvePayRun, rejectPayRun } from "@/app/actions/hriq/pay-runs";
import { useErrorDialog } from "@/app/(authenticated)/components/error-dialog";
import { useRouter , useParams} from "next/navigation";
import { useState, useTransition, useEffect } from "react";

type PayRunData = {
  id: string;
  name: string;
  orgName: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  totalAmount: number;
  rlFeeTotal: number;
  grandTotal: number;
  currency: string;
  notes: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  paymentLink: string | null;
};

type ItemData = {
  id: string;
  employeeName: string;
  employeeNumber: string;
  description: string | null;
  hoursWorked: number | null;
  hourlyRate: number | null;
  grossAmount: number;
  deductions: number;
  netAmount: number;
};

const fmtDate = (iso: string) => new Date(iso as any).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const fmtMoney = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

const STATUS_LABELS: Record<string, string> = {
  pending_approval: "Pending Your Approval",
  approved: "Approved",
  processing: "Awaiting Payment",
  completed: "Completed",
};

const STATUS_COLORS: Record<string, string> = {
  pending_approval: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  approved: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300",
  processing: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300",
  completed: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
};

export function ClientPayRunReview({ payRun, items, isRL = false }: { payRun: PayRunData; items: ItemData[]; isRL?: boolean }) {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [action, setAction] = useState<"approve" | "reject" | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const { showError, showSuccess } = useErrorDialog();
  const [managementPassword, setManagementPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [sessionAuthorized, setSessionAuthorized] = useState(!isRL); // Non-RL orgs are pre-authorized

  useEffect(() => {
    if (!isRL) { setSessionAuthorized(true); return; }
    try {
      const cached = sessionStorage.getItem("hriq_mgmt_session");
      if (cached) {
        const { token, expiresAt } = JSON.parse(cached);
        if (token && expiresAt > Date.now()) {
          setManagementPassword(token);
          setSessionAuthorized(true);
        } else {
          sessionStorage.removeItem("hriq_mgmt_session");
        }
      }
    } catch {}
  }, [isRL]);

  const isPendingApproval = payRun.status === "pending_approval";

  const handleApprove = async () => {
    if (isRL && !managementPassword.trim()) { setPasswordError("Management password is required"); return; }
    setPasswordError(null);

    let tokenToUse = managementPassword;
    if (isRL && !sessionAuthorized) {
      try {
        const { createManagementSession } = await import("@/app/actions/hriq/management-auth");
        const session = await createManagementSession(managementPassword);
        tokenToUse = session.token;
        try { sessionStorage.setItem("hriq_mgmt_session", JSON.stringify({ token: session.token, expiresAt: session.expiresAt })); } catch {}
        setManagementPassword(tokenToUse);
        setSessionAuthorized(true);
      } catch (err: any) {
        const msg = err?.message ?? "";
        setPasswordError(msg.includes("0851") ? "Invalid management password" : msg);
        setManagementPassword("");
        return;
      }
    }

    startTransition(async () => {
      try {
        await approvePayRun(payRun.id, tokenToUse);
        showSuccess("Pay run approved");
        setAction(null);
        router.refresh();
      } catch (err) {
        showError({ title: "Failed", message: err instanceof Error ? err.message : "Error" });
      }
    });
  };

  const handleReject = () => {
    startTransition(async () => {
      try {
        await rejectPayRun(payRun.id, rejectReason);
        showSuccess("Pay run rejected — Remote Leverage has been notified");
        setAction(null);
        router.push(`/${orgSlug}/payroll`);
      } catch (err) {
        showError({ title: "Failed", message: err instanceof Error ? err.message : "Error" });
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold">{payRun.name}</h2>
              <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_COLORS[payRun.status] ?? ""}`}>
                {STATUS_LABELS[payRun.status] ?? payRun.status}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {fmtDate(payRun.periodStart)} — {fmtDate(payRun.periodEnd)}
            </p>
          </div>

          {isPendingApproval && action === null && (
            <div className="flex gap-2">
              <button
                onClick={() => setAction("approve")}
                className="h-9 rounded-md bg-green-600 px-5 text-sm font-medium text-white hover:bg-green-700"
              >
                Approve
              </button>
              <button
                onClick={() => setAction("reject")}
                className="h-9 rounded-md border border-red-200 px-4 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400"
              >
                Reject
              </button>
            </div>
          )}
          {payRun.status === "processing" && payRun.paymentLink && (
            <a
              href={payRun.paymentLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center rounded-md bg-indigo-600 px-5 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Pay Now
            </a>
          )}
        </div>

        {/* Approve Confirmation */}
        {action === "approve" && (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950 space-y-3">
            <p className="text-sm font-medium text-green-800 dark:text-green-200">
              Approve this pay run for {fmtMoney(payRun.grandTotal)}?
            </p>
            {isRL && sessionAuthorized && (
              <div className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                Session Authorized
              </div>
            )}
            {isRL && !sessionAuthorized && (
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" /></svg>
                  Management Password
                </label>
                <input
                  type="password"
                  value={managementPassword}
                  onChange={(e) => { setManagementPassword(e.target.value); setPasswordError(null); }}
                  onKeyDown={(e) => e.key === "Enter" && managementPassword.trim() && handleApprove()}
                  placeholder="Enter management password"
                  autoComplete="off"
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-amber-500/30"
                />
                {passwordError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{passwordError}</p>}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={handleApprove} disabled={isPending || (isRL && !sessionAuthorized && !managementPassword.trim())} className="h-8 rounded-md bg-green-600 px-4 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50">
                {isPending ? "Approving..." : "Confirm Approval"}
              </button>
              <button onClick={() => setAction(null)} className="h-8 rounded-md border px-3 text-xs hover:bg-accent">Cancel</button>
            </div>
          </div>
        )}

        {/* Reject Form */}
        {action === "reject" && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
            <p className="text-sm font-medium text-red-800 dark:text-red-200">Reject this pay run?</p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection (optional)"
              rows={2}
              className="mt-2 w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
            <div className="mt-2 flex gap-2">
              <button onClick={handleReject} disabled={isPending} className="h-8 rounded-md bg-red-600 px-4 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50">
                {isPending ? "Rejecting..." : "Confirm Rejection"}
              </button>
              <button onClick={() => setAction(null)} className="h-8 rounded-md border px-3 text-xs hover:bg-accent">Cancel</button>
            </div>
          </div>
        )}

        {/* Summary Cards */}
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border p-4">
            <div className="text-xs font-medium text-muted-foreground">Contractor Pay</div>
            <div className="text-2xl font-bold">{fmtMoney(payRun.totalAmount)}</div>
            <div className="text-xs text-muted-foreground">{items.length} contractors</div>
          </div>
          {payRun.rlFeeTotal > 0 && (
            <div className="rounded-lg border p-4">
              <div className="text-xs font-medium text-muted-foreground">Management Fee</div>
              <div className="text-2xl font-bold">{fmtMoney(payRun.rlFeeTotal)}</div>
            </div>
          )}
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
            <div className="text-xs font-medium text-muted-foreground">Total Due</div>
            <div className="text-2xl font-bold">{fmtMoney(payRun.grandTotal)}</div>
          </div>
        </div>

        {payRun.approvedByName && (
          <p className="mt-4 text-xs text-muted-foreground">
            Approved by {payRun.approvedByName} on {fmtDate(payRun.approvedAt!)}
          </p>
        )}
        {payRun.paidAt && (
          <p className="mt-1 text-xs text-green-600">Paid on {fmtDate(payRun.paidAt)}</p>
        )}
      </div>

      {/* Line Items */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="border-b px-6 py-4">
          <h3 className="font-semibold">Contractor Breakdown</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Contractor</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Description</th>
              <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Hours</th>
              <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Rate</th>
              <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium">{item.employeeName}</div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{item.description}</td>
                <td className="px-4 py-3 text-right tabular-nums">{item.hoursWorked ?? "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums">{item.hourlyRate ? `$${item.hourlyRate}` : "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold">{fmtMoney(item.netAmount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t bg-muted/30 font-semibold">
              <td colSpan={4} className="px-4 py-3 text-right">Total Contractor Pay</td>
              <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(items.reduce((s, i) => s + i.netAmount, 0))}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {payRun.notes && (
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs font-medium text-muted-foreground">Notes</div>
          <p className="mt-1 text-sm">{payRun.notes}</p>
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          if (window.history.length > 1) {
            router.back();
          } else {
            router.push(`/${orgSlug}/payroll`);
          }
        }}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
        Back
      </button>
    </div>
  );
}
