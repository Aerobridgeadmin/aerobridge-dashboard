"use client";

import { approveExpenseReport, rejectExpenseReport } from "@/app/actions/hriq/expenses";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Report = {
  id: string;
  title: string;
  description: string | null;
  totalAmount: unknown;
  currency: string;
  status: string;
  submittedAt: Date | null;
  createdAt: Date;
  employee: { id: string; legalFirstName: string; legalLastName: string };
  _count: { items: number };
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800",
  submitted: "bg-blue-100 text-blue-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  reimbursed: "bg-purple-100 text-purple-800",
};

export function ExpenseManager({ reports }: { reports: Report[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleApprove = (id: string) => {
    startTransition(async () => {
      await approveExpenseReport(id);
      router.refresh();
    });
  };

  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const handleReject = (id: string) => {
    setRejectingId(id);
    setRejectReason("");
  };

  const confirmReject = () => {
    if (!rejectingId || !rejectReason.trim()) return;
    startTransition(async () => {
      await rejectExpenseReport(rejectingId, rejectReason);
      setRejectingId(null);
      router.refresh();
    });
  };

  const pending = reports.filter((r) => r.status === "submitted");
  const totalPending = pending.reduce((s, r) => s + Number(r.totalAmount), 0);
  const totalApproved = reports.filter((r) => r.status === "approved" || r.status === "reimbursed").reduce((s, r) => s + Number(r.totalAmount), 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border bg-card p-6">
          <div className="text-sm font-medium text-muted-foreground">Total Reports</div>
          <div className="text-3xl font-bold">{reports.length}</div>
        </div>
        <div className="rounded-xl border bg-card p-6">
          <div className="text-sm font-medium text-muted-foreground">Pending Review</div>
          <div className="text-3xl font-bold">${totalPending.toLocaleString()}</div>
        </div>
        <div className="rounded-xl border bg-card p-6">
          <div className="text-sm font-medium text-muted-foreground">Approved Total</div>
          <div className="text-3xl font-bold">${totalApproved.toLocaleString()}</div>
        </div>
      </div>

      {pending.length > 0 && (
        <div className="rounded-xl border bg-card p-6">
          <h2 className="text-lg font-semibold">Pending Approval ({pending.length})</h2>
          <div className="mt-4 space-y-3">
            {pending.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <div className="font-medium">{r.title}</div>
                  <div className="text-sm text-muted-foreground">
                    {r.employee.legalFirstName} {r.employee.legalLastName} · {r._count.items} items · ${Number(r.totalAmount).toLocaleString()} {r.currency}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleApprove(r.id)} disabled={isPending} className="h-8 rounded-md bg-green-600 px-3 text-xs font-medium text-white hover:bg-green-700">Approve</button>
                  <button onClick={() => handleReject(r.id)} disabled={isPending} className="h-8 rounded-md border px-3 text-xs font-medium text-red-600 hover:bg-red-50">Reject</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-card p-6">
        <h2 className="text-lg font-semibold">All Expense Reports</h2>
        <div className="mt-4 space-y-2">
          {reports.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="text-sm font-medium">{r.title}</div>
                <div className="text-xs text-muted-foreground">
                  {r.employee.legalFirstName} {r.employee.legalLastName} · ${Number(r.totalAmount).toLocaleString()} · {r._count.items} items
                </div>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${STATUS_COLORS[r.status] ?? ""}`}>{r.status}</span>
            </div>
          ))}
          {reports.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No expense reports yet.</p>}
        </div>
      </div>

      {rejectingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setRejectingId(null)}>
          <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">Reject Expense Report</h3>
            <div className="mt-3">
              <label className="text-sm font-medium">Reason *</label>
              <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} placeholder="Explain why this report is being rejected..." className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </div>
            <div className="mt-4 flex justify-end gap-3">
              <button onClick={() => setRejectingId(null)} className="h-9 rounded-md border px-4 text-sm">Cancel</button>
              <button onClick={confirmReject} disabled={isPending || !rejectReason.trim()} className="h-9 rounded-md bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">Reject</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
