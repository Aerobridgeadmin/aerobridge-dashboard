"use client";

import { approveTimeOff, rejectTimeOff, createTimeOffPolicy } from "@/app/actions/hriq/time-off";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Request = {
  id: string;
  startDate: Date;
  endDate: Date;
  totalDays: unknown;
  reason: string | null;
  status: string;
  createdAt: Date;
  employee: { id: string; legalFirstName: string; legalLastName: string; employeeNumber: string };
  policy: { name: string; type: string };
};

type Policy = { id: string; name: string; type: string; daysPerYear: number };

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-500",
};

export function TimeOffManager({ requests, policies }: { requests: Request[]; policies: Policy[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showPolicyForm, setShowPolicyForm] = useState(false);

  const handleApprove = (id: string) => {
    startTransition(async () => {
      await approveTimeOff(id);
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
      await rejectTimeOff(rejectingId, rejectReason);
      setRejectingId(null);
      router.refresh();
    });
  };

  const handleCreatePolicy = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await createTimeOffPolicy({
        name: fd.get("name") as string,
        type: fd.get("type") as string,
        daysPerYear: Number(fd.get("daysPerYear")),
        carryOverMax: Number(fd.get("carryOverMax")) || 0,
      });
      setShowPolicyForm(false);
      router.refresh();
    });
  };

  const pending = requests.filter((r) => r.status === "pending");

  return (
    <div className="space-y-6">
      {/* Policies */}
      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Time Off Policies ({policies.length})</h2>
          <button onClick={() => setShowPolicyForm(!showPolicyForm)} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            {showPolicyForm ? "Cancel" : "Add Policy"}
          </button>
        </div>
        {showPolicyForm && (
          <form onSubmit={handleCreatePolicy} className="mt-4 grid gap-3 rounded-lg border p-4 md:grid-cols-4">
            <input name="name" placeholder="Policy name" required className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
            <select name="type" className="h-9 rounded-md border border-input bg-background px-3 text-sm">
              <option value="vacation">Vacation</option>
              <option value="sick">Sick Leave</option>
              <option value="personal">Personal</option>
              <option value="parental">Parental</option>
            </select>
            <input name="daysPerYear" type="number" placeholder="Days/year" required className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
            <button type="submit" disabled={isPending} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">Create</button>
          </form>
        )}
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {policies.map((p) => (
            <div key={p.id} className="rounded-lg border p-4">
              <div className="font-medium">{p.name}</div>
              <div className="text-sm text-muted-foreground capitalize">{p.type} · {p.daysPerYear} days/year</div>
            </div>
          ))}
          {policies.length === 0 && <p className="col-span-3 text-center text-sm text-muted-foreground">No policies configured. Add one to get started.</p>}
        </div>
      </div>

      {/* Pending Requests */}
      {pending.length > 0 && (
        <div className="rounded-xl border bg-card p-6">
          <h2 className="text-lg font-semibold">Pending Requests ({pending.length})</h2>
          <div className="mt-4 space-y-3">
            {pending.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <div className="font-medium">{r.employee.legalFirstName} {r.employee.legalLastName}</div>
                  <div className="text-sm text-muted-foreground">
                    {r.policy.name} · {new Date(r.startDate).toLocaleDateString()} – {new Date(r.endDate).toLocaleDateString()} · {Number(r.totalDays)} days
                  </div>
                  {r.reason && <div className="mt-1 text-sm">{r.reason}</div>}
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

      {/* All Requests */}
      <div className="rounded-xl border bg-card p-6">
        <h2 className="text-lg font-semibold">All Requests</h2>
        <div className="mt-4 space-y-2">
          {requests.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="text-sm font-medium">{r.employee.legalFirstName} {r.employee.legalLastName} — {r.policy.name}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(r.startDate).toLocaleDateString()} – {new Date(r.endDate).toLocaleDateString()} · {Number(r.totalDays)} days
                </div>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${STATUS_COLORS[r.status] ?? ""}`}>{r.status}</span>
            </div>
          ))}
          {requests.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No time-off requests yet.</p>}
        </div>
      </div>

      {/* Reject Dialog */}
      {rejectingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setRejectingId(null)}>
          <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">Reject Request</h3>
            <div className="mt-3">
              <label className="text-sm font-medium">Reason *</label>
              <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} placeholder="Explain why this request is being rejected..." className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
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
