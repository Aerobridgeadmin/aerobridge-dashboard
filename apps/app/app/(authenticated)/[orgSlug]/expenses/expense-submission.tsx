"use client";
import { useErrorDialog } from "@/app/(authenticated)/components/error-dialog";
import { shortDate } from "@/lib/hriq/format";

import { createExpenseReport } from "@/app/actions/hriq/expenses";
import { CustomSelect } from "@/app/(authenticated)/components/custom-select";
import { DatePicker } from "@/app/(authenticated)/components/date-picker";
import { useState, useTransition } from "react";

type Report = { id: string; title: string; totalAmount: unknown; currency: string; status: string; createdAt: Date; _count: { items: number } };

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  submitted: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300",
  approved: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300",
  reimbursed: "bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300",
};

const CATEGORIES = ["travel", "meals", "supplies", "software", "equipment", "other"];

export function ExpenseSubmission({ reports }: { reports: Report[] }) {
  const [isPending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [items, setItems] = useState([{ category: "other", description: "", amount: "", date: "" }]);
  const { showError } = useErrorDialog();

  const addItem = () => setItems([...items, { category: "other", description: "", amount: "", date: "" }]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    startTransition(async () => {
      try {
        await createExpenseReport({
          title: fd.get("title") as string,
          description: (fd.get("description") as string) || undefined,
          items: items.map((item) => ({
            category: item.category,
            description: item.description,
            amount: Number(item.amount),
            date: item.date,
          })),
        });
        setShowForm(false);
        setItems([{ category: "other", description: "", amount: "", date: "" }]);
        
      } catch (err) {
        showError({ title: "Error", message: err instanceof Error ? err.message : "Failed to submit." });
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">My Expenses</h2>
        <button onClick={() => setShowForm(!showForm)} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          {showForm ? "Cancel" : "Submit Expense"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-xl border bg-card p-6 space-y-4">
          <h3 className="font-semibold">New Expense Report</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium">Title *</label>
              <input name="title" required className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <input name="description" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Items</label>
              <button type="button" onClick={addItem} className="text-sm text-primary hover:underline">+ Add Item</button>
            </div>
            <div className="mt-2 space-y-2">
              {items.map((item, i) => (
                <div key={i} className="grid grid-cols-4 gap-2">
                  <CustomSelect
                    value={item.category}
                    onValueChange={(value) => {
                      const n = [...items];
                      n[i].category = value;
                      setItems(n);
                    }}
                    triggerClassName="h-9 w-full"
                    options={CATEGORIES.map((c) => ({ value: c, label: c }))}
                  />
                  <input value={item.description} onChange={(e) => { const n = [...items]; n[i].description = e.target.value; setItems(n); }} placeholder="Description" required className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
                  <input type="number" step="0.01" value={item.amount} onChange={(e) => { const n = [...items]; n[i].amount = e.target.value; setItems(n); }} placeholder="Amount" required className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
                  <DatePicker value={item.date} onChange={(v) => { const n = [...items]; n[i].date = v; setItems(n); }} required className="w-32" />
                </div>
              ))}
            </div>
          </div>
          <button type="submit" disabled={isPending} className="h-10 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {isPending ? "Submitting..." : "Submit Report"}
          </button>
        </form>
      )}

      <div className="space-y-2">
        {reports.map((r) => (
          <div key={r.id} className="flex items-center justify-between rounded-xl border bg-card p-4">
            <div>
              <div className="font-medium">{r.title}</div>
              <div className="text-sm text-muted-foreground">${Number(r.totalAmount).toLocaleString()} · {r._count.items} items · {shortDate(r.createdAt as any)}</div>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${STATUS_COLORS[r.status] ?? ""}`}>{r.status}</span>
          </div>
        ))}
        {reports.length === 0 && <p className="py-8 text-center text-muted-foreground">No expense reports yet.</p>}
      </div>
    </div>
  );
}
