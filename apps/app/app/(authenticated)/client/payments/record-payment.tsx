"use client";

import { createPayment } from "@/app/actions/hriq/payments";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Employee = { id: string; legalFirstName: string; legalLastName: string; employeeNumber: string };

export function RecordPayment({ employees }: { employees: Employee[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    startTransition(async () => {
      try {
        await createPayment({
          employeeId: fd.get("employeeId") as string,
          amount: fd.get("amount") as string,
          currency: (fd.get("currency") as string) || "USD",
          paymentType: fd.get("paymentType") as string,
          paymentMethod: (fd.get("paymentMethod") as string) || undefined,
          periodStart: (fd.get("periodStart") as string) || undefined,
          periodEnd: (fd.get("periodEnd") as string) || undefined,
          notes: (fd.get("notes") as string) || undefined,
        });
        setOpen(false);
        setError(null);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to record payment");
      }
    });
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
        Record Payment
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-xl border bg-card p-6 shadow-lg">
        <h2 className="text-lg font-semibold">Record Payment</h2>
        {error && <div className="mt-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="text-sm font-medium">Employee *</label>
            <select name="employeeId" required className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">Select employee...</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.legalFirstName} {emp.legalLastName} ({emp.employeeNumber})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Amount *</label>
              <input name="amount" type="number" step="0.01" required className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium">Currency</label>
              <select name="currency" defaultValue="USD" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="PHP">PHP</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Payment Type *</label>
              <select name="paymentType" required className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="salary">Salary</option>
                <option value="bonus">Bonus</option>
                <option value="reimbursement">Reimbursement</option>
                <option value="commission">Commission</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Payment Method</label>
              <select name="paymentMethod" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Select...</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="wise">Wise</option>
                <option value="paypal">PayPal</option>
                <option value="check">Check</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Period Start</label>
              <input name="periodStart" type="date" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium">Period End</label>
              <input name="periodEnd" type="date" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Notes</label>
            <textarea name="notes" rows={2} className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setOpen(false)} className="h-9 rounded-md border px-4 text-sm font-medium hover:bg-accent">Cancel</button>
            <button type="submit" disabled={isPending} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {isPending ? "Recording..." : "Record Payment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
