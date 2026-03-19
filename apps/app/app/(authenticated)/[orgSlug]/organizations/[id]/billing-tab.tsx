"use client";

import { CustomSelect } from "@/app/(authenticated)/components/custom-select";

import { upsertAgreement, updateAgreementStatus, deleteAgreement } from "@/app/actions/hriq/service-agreements";
import { DestructiveConfirmDialog } from "@/app/(authenticated)/components/destructive-confirm-dialog";
import { useState, useTransition } from "react";

type Agreement = {
  id: string;
  name: string;
  feeType: string;
  feeAmount: string;
  billingCycle: string;
  status: string;
  startDate: string;
  endDate: string | null;
  notes: string | null;
};

type Props = {
  orgId: string;
  agreements: Agreement[];
  onRefresh: () => void;
  isPending: boolean;
  onAction: (fn: () => Promise<unknown>) => void;
  showError: (opts: { title: string; message: string }) => void;
};

const FEE_LABELS: Record<string, string> = {
  percentage: "% of contractor pay",
  per_contractor: "per contractor",
  flat: "flat fee",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
  paused: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

const fmtDate = (iso: string) => new Date(iso as any).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export function BillingTab({ orgId, agreements, onRefresh, isPending, onAction, showError }: Props) {
  const [localPending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [feeType, setFeeType] = useState("percentage");
  const [feeAmount, setFeeAmount] = useState("");
  const [name, setName] = useState("Default");
  const [billingCycle, setBillingCycle] = useState("per_pay_run");
  const [notes, setNotes] = useState("");

  const activeAgreement = agreements.find((a) => a.status === "active");
  const pending = isPending || localPending;

  const openEdit = (a: Agreement) => {
    setEditId(a.id);
    setFeeType(a.feeType);
    setFeeAmount(a.feeAmount);
    setName(a.name);
    setBillingCycle(a.billingCycle);
    setNotes(a.notes ?? "");
    setShowForm(true);
  };

  const openNew = () => {
    setEditId(null);
    setFeeType("percentage");
    setFeeAmount("");
    setName("Default");
    setBillingCycle("per_pay_run");
    setNotes("");
    setShowForm(true);
  };

  const handleSave = () => {
    if (!feeAmount || Number(feeAmount) < 0) {
      showError({ title: "Invalid", message: "Fee amount is required." });
      return;
    }
    startTransition(async () => {
      try {
        await upsertAgreement({
          id: editId ?? undefined,
          organizationId: orgId,
          name,
          feeType,
          feeAmount: Number(feeAmount),
          billingCycle,
          notes: notes || undefined,
        });
        setShowForm(false);
      } catch (err) {
        showError({ title: "Failed", message: err instanceof Error ? err.message : "Error" });
      }
    });
  };

  const handleStatusChange = (id: string, status: "active" | "paused" | "cancelled") => {
    startTransition(async () => {
      try {
        await updateAgreementStatus(id, status);
      } catch (err) {
        showError({ title: "Failed", message: err instanceof Error ? err.message : "Error" });
      }
    });
  };

  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const handleDelete = (id: string) => {
    setDeleteTargetId(id);
  };

  const confirmDeleteAgreement = async () => {
    if (!deleteTargetId) return;
    try {
      await deleteAgreement(deleteTargetId);
      setDeleteTargetId(null);
    } catch (err) {
      showError({ title: "Failed", message: err instanceof Error ? err.message : "Error" });
    }
  };

  return (
    <div className="space-y-4">
      {/* Active Agreement Card */}
      {activeAgreement ? (
        <div className="rounded-xl border border-green-200 bg-green-50/50 p-6 dark:border-green-800 dark:bg-green-950/30">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">Active Fee Agreement</h3>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS.active}`}>Active</span>
              </div>
              <div className="mt-2 text-2xl font-bold">
                {activeAgreement.feeType === "percentage" ? `${activeAgreement.feeAmount}%` : `$${Number(activeAgreement.feeAmount).toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
                <span className="ml-1 text-sm font-normal text-muted-foreground">{FEE_LABELS[activeAgreement.feeType]}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Billed {activeAgreement.billingCycle === "monthly" ? "monthly" : "per pay run"} · Since {fmtDate(activeAgreement.startDate)}
              </p>
              {activeAgreement.notes && (
                <p className="mt-2 text-sm text-muted-foreground">{activeAgreement.notes}</p>
              )}
            </div>
            <div className="flex gap-1">
              <button onClick={() => openEdit(activeAgreement)} className="h-8 rounded-md border px-3 text-xs hover:bg-accent">Edit</button>
              <button onClick={() => handleStatusChange(activeAgreement.id, "paused")} disabled={pending} className="h-8 rounded-md border border-amber-200 px-3 text-xs text-amber-700 hover:bg-amber-50 disabled:opacity-50 dark:border-amber-800 dark:text-amber-400">Pause</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">No active fee agreement for this organization.</p>
          <p className="mt-1 text-xs text-muted-foreground">Set up a fee agreement so it auto-populates when creating pay runs.</p>
          <button onClick={openNew} className="mt-4 h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Set Up Fee Agreement
          </button>
        </div>
      )}

      {/* Create / Edit Form */}
      {showForm && (
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <h3 className="font-semibold">{editId ? "Edit Agreement" : "New Fee Agreement"}</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium">Agreement Name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="h-9 w-full rounded-md border bg-background px-3 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Fee Type *</label>
              <CustomSelect value={feeType} onValueChange={setFeeType} triggerClassName="h-9 w-full" placeholder="Select..." options={[
                { value: "percentage", label: "Percentage of contractor pay" },
                { value: "per_contractor", label: "Per contractor" },
                { value: "flat", label: "Flat fee per pay run" },
              ]} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">
                Fee Amount {feeType === "percentage" ? "(%)" : "($)"} *
              </label>
              <input type="number" step="0.01" value={feeAmount} onChange={(e) => setFeeAmount(e.target.value)} placeholder={feeType === "percentage" ? "e.g. 15" : "e.g. 500"} className="h-9 w-full rounded-md border bg-background px-3 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Billing Cycle</label>
              <CustomSelect value={billingCycle} onValueChange={setBillingCycle} triggerClassName="h-9 w-full" placeholder="Select..." options={[
                { value: "per_pay_run", label: "Per pay run" },
                { value: "monthly", label: "Monthly" },
              ]} />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium">Notes</label>
              <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal notes about this agreement" className="h-9 w-full rounded-md border bg-background px-3 text-sm" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={pending} className="h-9 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {pending ? "Saving..." : editId ? "Update" : "Create Agreement"}
            </button>
            <button onClick={() => setShowForm(false)} className="h-9 rounded-md border px-4 text-sm hover:bg-accent">Cancel</button>
          </div>
        </div>
      )}

      {/* Agreement History */}
      {agreements.length > 0 && (
        <div className="rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-6 py-4">
            <h3 className="font-semibold">Agreement History</h3>
            {activeAgreement && (
              <button onClick={openNew} className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90">
                + New Agreement
              </button>
            )}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Fee</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Cycle</th>
                <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Since</th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {agreements.map((a) => (
                <tr key={a.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-3 font-medium">{a.name}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {a.feeType === "percentage" ? `${a.feeAmount}%` : `$${Number(a.feeAmount).toFixed(2)}`}
                    <span className="ml-1 text-xs text-muted-foreground">{FEE_LABELS[a.feeType]}</span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{a.billingCycle === "monthly" ? "Monthly" : "Per pay run"}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[a.status] ?? "bg-gray-100 text-gray-700"}`}>
                      {a.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{fmtDate(a.startDate)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {a.status === "paused" && (
                        <button onClick={() => handleStatusChange(a.id, "active")} disabled={pending} className="rounded-md border border-green-200 px-2 py-1 text-xs text-green-700 hover:bg-green-50 disabled:opacity-50 dark:border-green-800 dark:text-green-400">Reactivate</button>
                      )}
                      {a.status !== "cancelled" && (
                        <button onClick={() => openEdit(a)} className="rounded-md border px-2 py-1 text-xs hover:bg-accent">Edit</button>
                      )}
                      {a.status === "cancelled" && (
                        <button onClick={() => handleDelete(a.id)} disabled={pending} className="rounded-md border px-2 py-1 text-xs text-red-500 hover:bg-red-50 disabled:opacity-50">Delete</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <DestructiveConfirmDialog
        open={!!deleteTargetId}
        onClose={() => setDeleteTargetId(null)}
        onConfirm={confirmDeleteAgreement}
        title="Delete Service Agreement"
        description="Permanently delete this cancelled service agreement? This cannot be undone."
        impactLines={[
          { label: "Agreement record deleted", count: 1, severity: "warn" },
        ]}
        confirmLabel="Delete Agreement"
      />
    </div>
  );
}
