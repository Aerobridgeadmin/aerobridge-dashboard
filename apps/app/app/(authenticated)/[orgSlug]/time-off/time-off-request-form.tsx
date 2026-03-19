"use client";
import { useErrorDialog } from "@/app/(authenticated)/components/error-dialog";
import { shortDate } from "@/lib/hriq/format";

import { requestTimeOff } from "@/app/actions/hriq/time-off";
import { CustomSelect } from "@/app/(authenticated)/components/custom-select";
import { DatePicker } from "@/app/(authenticated)/components/date-picker";
import { useState, useTransition } from "react";

type Request = { id: string; startDate: Date; endDate: Date; totalDays: unknown; reason: string | null; status: string; policy: { name: string; type: string } };
type Policy = { id: string; name: string; type: string; daysPerYear: number };

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300",
  approved: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300",
};

export function TimeOffRequestForm({ requests, policies }: { requests: Request[]; policies: Policy[] }) {
  const [isPending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const { showError } = useErrorDialog();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const start = new Date(fd.get("startDate" as any) as string);
    const end = new Date(fd.get("endDate" as any) as string);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    startTransition(async () => {
      try {
        await requestTimeOff({
          policyId: fd.get("policyId") as string,
          startDate: fd.get("startDate") as string,
          endDate: fd.get("endDate") as string,
          totalDays,
          reason: (fd.get("reason") as string) || undefined,
        });
        setShowForm(false);
        
      } catch (err) {
        showError({ title: "Error", message: err instanceof Error ? err.message : "Failed to submit." });
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">My Time Off</h2>
        <button onClick={() => setShowForm(!showForm)} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          {showForm ? "Cancel" : "Request Time Off"}
        </button>
      </div>

      {showForm && (
        <div className="rounded-xl border bg-card p-6">
          <h3 className="font-semibold">New Request</h3>
          <form onSubmit={handleSubmit} className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="text-sm font-medium">Policy *</label>
              <CustomSelect
                name="policyId"
                placeholder="Select..."
                triggerClassName="mt-1 h-10 w-full"
                options={policies.map((p) => ({ value: p.id, label: `${p.name} (${p.daysPerYear} days/year)` }))}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Start Date *</label>
              <DatePicker name="startDate" required className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">End Date *</label>
              <DatePicker name="endDate" required className="mt-1" />
            </div>
            <div className="md:col-span-2">
              <label className="text-sm font-medium">Reason</label>
              <textarea name="reason" rows={2} className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </div>
            <button type="submit" disabled={isPending} className="h-10 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {isPending ? "Submitting..." : "Submit Request"}
            </button>
          </form>
        </div>
      )}

      <div className="space-y-2">
        {requests.map((r) => (
          <div key={r.id} className="flex items-center justify-between rounded-xl border bg-card p-4">
            <div>
              <div className="font-medium">{r.policy.name}</div>
              <div className="text-sm text-muted-foreground">
                {shortDate(r.startDate as any)} – {shortDate(r.endDate as any)} · {Number(r.totalDays)} days
              </div>
              {r.reason && <div className="mt-1 text-sm">{r.reason}</div>}
            </div>
            <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${STATUS_COLORS[r.status] ?? ""}`}>{r.status}</span>
          </div>
        ))}
        {requests.length === 0 && <p className="py-8 text-center text-muted-foreground">No time-off requests. Submit one to get started.</p>}
      </div>
    </div>
  );
}
