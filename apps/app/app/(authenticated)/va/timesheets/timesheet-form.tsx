"use client";

import { submitTimesheet } from "@/app/actions/hriq/timesheets";
import type { TimesheetSubmission, TimesheetPeriod } from "@repo/database";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800",
  submitted: "bg-blue-100 text-blue-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  auto_approved: "bg-green-100 text-green-800",
};

type TimesheetWithPeriod = TimesheetSubmission & { period: TimesheetPeriod };

export function TimesheetForm({ timesheets, openPeriods: serverOpenPeriods }: { timesheets: TimesheetWithPeriod[]; openPeriods: TimesheetPeriod[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [hours, setHours] = useState<Record<string, number>>({
    monday: 0, tuesday: 0, wednesday: 0, thursday: 0, friday: 0, saturday: 0, sunday: 0,
  });
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const total = Object.values(hours).reduce((sum, h) => sum + h, 0);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const periodId = fd.get("periodId") as string;
    if (!periodId) { setError("Please select a period"); return; }

    startTransition(async () => {
      try {
        await submitTimesheet({
          periodId,
          mondayHours: hours.monday,
          tuesdayHours: hours.tuesday,
          wednesdayHours: hours.wednesday,
          thursdayHours: hours.thursday,
          fridayHours: hours.friday,
          saturdayHours: hours.saturday,
          sundayHours: hours.sunday,
          notes,
        });
        setError(null);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to submit");
      }
    });
  };

  const openPeriods = serverOpenPeriods;

  return (
    <div className="space-y-6">
      {/* Submit Timesheet */}
      <div className="rounded-xl border bg-card p-6">
        <h2 className="text-lg font-semibold">Submit Timesheet</h2>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
          )}

          {openPeriods.length > 0 ? (
            <div>
              <label className="text-sm font-medium">Period *</label>
              <select name="periodId" required className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Select period...</option>
                {openPeriods.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No open timesheet periods available. Contact your administrator.</p>
          )}

          <div>
            <label className="text-sm font-medium">Daily Hours</label>
            <div className="mt-2 grid grid-cols-7 gap-2">
              {DAYS.map((day, i) => (
                <div key={day} className="text-center">
                  <label className="text-xs text-muted-foreground">{DAY_LABELS[i]}</label>
                  <input
                    type="number"
                    min="0"
                    max="24"
                    step="0.25"
                    value={hours[day]}
                    onChange={(e) => setHours((prev) => ({ ...prev, [day]: Number(e.target.value) || 0 }))}
                    className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-2 py-2 text-center text-sm"
                  />
                </div>
              ))}
            </div>
            <div className="mt-2 text-right text-sm font-medium">
              Total: <span className="text-lg">{total.toFixed(2)}h</span>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional notes about this week..."
              className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={isPending || openPeriods.length === 0}
            className="h-10 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isPending ? "Submitting..." : "Submit Timesheet"}
          </button>
        </form>
      </div>

      {/* History */}
      <div>
        <h2 className="text-lg font-semibold">My Timesheet History</h2>
        <div className="mt-3 space-y-2">
          {timesheets.map((ts) => (
            <div key={ts.id} className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{ts.period.name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${STATUS_COLORS[ts.status] ?? ""}`}>
                    {ts.status.replace(/_/g, " ")}
                  </span>
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {Number(ts.totalHours)}h total
                  {ts.submittedAt && ` · Submitted ${new Date(ts.submittedAt).toLocaleDateString()}`}
                  {ts.approvedAt && ` · Approved ${new Date(ts.approvedAt).toLocaleDateString()}`}
                </div>
                {ts.rejectionReason && (
                  <p className="mt-1 text-sm text-red-600">Rejection: {ts.rejectionReason}</p>
                )}
              </div>
            </div>
          ))}
          {timesheets.length === 0 && (
            <div className="py-8 text-center text-muted-foreground">No timesheets submitted yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
