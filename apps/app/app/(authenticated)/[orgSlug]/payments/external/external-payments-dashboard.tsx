"use client";

import { shortDate, hours as fmtHours } from "@/lib/hriq/format";
import { useErrorDialog } from "@/app/(authenticated)/components/error-dialog";
import { markExternalPaymentPaid, batchMarkExternalPaymentsPaid, updateExternalPaymentAmount } from "@/app/actions/hriq/external-finance";
import { deletePayment } from "@/app/actions/hriq/payments";
import { updateClientInvoiceStatus, generateMissingClientInvoices } from "@/app/actions/hriq/client-invoices";
import { createClientInvoiceCheckout, sendInvoicePaymentLinkEmail } from "@/app/actions/hriq/stripe";
import { CustomSelect } from "@/app/(authenticated)/components/custom-select";
import { PayoutDialog } from "@/app/(authenticated)/components/payout-dialog";
import Link from "next/link";
import { useRouter, useParams, usePathname } from "next/navigation";
import { useMemo, useState, useTransition, useRef, useEffect } from "react";

type Payment = {
  id: string;
  status: string;
  amount: string;
  currency: string;
  paymentType: string;
  paymentMethod: string | null;
  paymentDate: Date | null;
  createdAt: Date;
  periodStart: Date | null;
  periodEnd: Date | null;
  hoursWorked: string | null;
  hourlyRate: string | null;
  description: string | null;
  transactionId: string | null;
  employee: {
    id: string;
    legalFirstName: string;
    legalLastName: string;
    employeeNumber: string;
    organization: { id: string; name: string } | null;
  };
};

type OrgOption = { id: string; name: string };
type StatRow = { status: string; count: number; total: number };

type ClientInvoiceLineItem = {
  id: string;
  description: string | null;
  hoursWorked: string | null;
  hourlyRate: string | null;
  amount: string;
  employee: { id: string; legalFirstName: string; legalLastName: string };
};

type ClientInvoice = {
  id: string;
  invoiceNumber: string;
  periodName: string | null;
  periodStart: Date;
  periodEnd: Date;
  subtotal: string;
  rlFeeType: string | null;
  rlFeeAmount: string | null;
  rlFeeTotal: string;
  totalAmount: string;
  currency: string;
  status: string;
  paidAt: Date | null;
  paymentMethod: string | null;
  paymentReference: string | null;
  paymentLink: string | null;
  createdAt: Date;
  organization: { id: string; name: string; profile: { paymentMethod: string | null } | null };
  lineItems: ClientInvoiceLineItem[];
};

const STATUS_COLORS: Record<string, string> = {
  completed: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300",
  processing: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300",
  cancelled: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

const STATUS_ORDER = ["pending", "processing", "completed", "failed", "cancelled"];

/*  Editable amount  */
function EditableAmount({ payment, onSaved }: { payment: Payment; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(payment.amount);
  const [saving, setSaving] = useState(false);
  const { showError } = useErrorDialog();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  const save = async () => {
    if (value === payment.amount) { setEditing(false); return; }
    setSaving(true);
    try {
      await updateExternalPaymentAmount(payment.id, value);
      setEditing(false);
      onSaved();
    } catch (err: any) {
      showError({ title: "Error", message: err.message || "Failed." });
    } finally {
      setSaving(false);
    }
  };

  if (payment.status === "completed") {
    return <span className="font-medium tabular-nums">${Number(payment.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })} {payment.currency}</span>;
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => { setValue(payment.amount); setEditing(true); }}
        className="font-medium tabular-nums hover:underline hover:text-blue-400 transition-colors cursor-pointer"
        title="Click to edit amount"
      >
        ${Number(payment.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })} {payment.currency}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <span className="text-muted-foreground">$</span>
      <input
        ref={inputRef}
        type="number"
        step="0.01"
        min="0"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
        className="h-7 w-24 rounded border bg-background px-2 text-sm tabular-nums"
        disabled={saving}
      />
      <button onClick={save} disabled={saving} className="h-7 rounded bg-green-600 px-2 text-xs text-white hover:bg-green-700 disabled:opacity-50">Save</button>
      <button onClick={() => setEditing(false)} className="h-7 rounded border px-2 text-xs hover:bg-accent"></button>
    </div>
  );
}

/*  Main Dashboard  */
export function ExternalPaymentsDashboard({
  payments,
  organizations,
  stats,
  initialOrgFilter,
  clientInvoices = [],
}: {
  payments: Payment[];
  organizations: OrgOption[];
  stats: StatRow[];
  initialOrgFilter?: string;
  clientInvoices?: ClientInvoice[];
}) {
  const router = useRouter();
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [orgFilter, setOrgFilter] = useState(initialOrgFilter ?? "all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [payoutId, setPayoutId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"payments" | "invoices">("payments");
  const { showError, showSuccess } = useErrorDialog();

  const handleDelete = (paymentId: string) => {
    startTransition(async () => {
      try {
        const result = await deletePayment(paymentId);
        if (result && "error" in result) throw new Error((result as any).error ?? "Failed");
        showSuccess(`Deleted payment for ${(result as any).name} ($${Number((result as any).amount).toLocaleString()}).`);
        setConfirmDeleteId(null);
        router.refresh();
      } catch (err) {
        showError({ title: "Error", message: err instanceof Error ? err.message : "Failed to delete payment." });
        setConfirmDeleteId(null);
      }
    });
  };

  // Client-side filter
  const filtered = useMemo(() => {
    let list = payments;
    if (orgFilter !== "all") list = list.filter((p) => p.employee.organization?.id === orgFilter);
    if (statusFilter !== "all") list = list.filter((p) => p.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) =>
        `${p.employee.legalFirstName} ${p.employee.legalLastName}`.toLowerCase().includes(q)
        || p.employee.employeeNumber.toLowerCase().includes(q)
        || p.employee.organization?.name.toLowerCase().includes(q)
        || p.description?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [payments, orgFilter, statusFilter, search]);

  // Group by org
  const byOrg = useMemo(() => {
    const map = new Map<string, { org: OrgOption; payments: Payment[] }>();
    for (const p of filtered) {
      const orgId = p.employee.organization?.id ?? "unknown";
      const orgName = p.employee.organization?.name ?? "Unknown Org";
      if (!map.has(orgId)) map.set(orgId, { org: { id: orgId, name: orgName }, payments: [] });
      map.get(orgId)!.payments.push(p);
    }
    return Array.from(map.values()).sort((a, b) => a.org.name.localeCompare(b.org.name));
  }, [filtered]);

  // Build lookup: which org+period combos have a paid client invoice?
  const invoiceStatusMap = useMemo(() => {
    const map = new Map<string, { status: string; invoiceNumber: string }>();
    // Process void invoices first, then non-void, so non-void always wins
    const sorted = [...clientInvoices].sort((a, b) =>
      (a.status === "void" ? 0 : 1) - (b.status === "void" ? 0 : 1)
    );
    for (const inv of sorted) {
      const key = `${inv.organization.id}|${new Date(inv.periodStart as any).toISOString().slice(0, 10)}|${new Date(inv.periodEnd as any).toISOString().slice(0, 10)}`;
      map.set(key, { status: inv.status, invoiceNumber: inv.invoiceNumber });
    }
    return map;
  }, [clientInvoices]);

  const getInvoiceStatus = (payment: Payment): { status: string; invoiceNumber: string } | null => {
    if (!payment.periodStart || !payment.periodEnd || !payment.employee.organization?.id) return null;
    const key = `${payment.employee.organization.id}|${new Date(payment.periodStart as any).toISOString().slice(0, 10)}|${new Date(payment.periodEnd as any).toISOString().slice(0, 10)}`;
    return invoiceStatusMap.get(key) ?? null;
  };

  const isPayBlocked = (payment: Payment): boolean => {
    const inv = getInvoiceStatus(payment);
    return inv !== null && inv.status !== "paid";
  };

  const pendingPayments = filtered.filter((p) => p.status === "pending");
  const totalPending = pendingPayments.reduce((s, p) => s + Number(p.amount), 0);
  const totalCompleted = stats.find((s) => s.status === "completed")?.total ?? 0;
  const totalAll = stats.reduce((s, r) => s + r.total, 0);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAllPending = () => {
    const pendingIds = pendingPayments.map((p) => p.id);
    const allSelected = pendingIds.every((id) => selected.has(id));
    setSelected(allSelected ? new Set() : new Set(pendingIds));
  };

  const handleBatchMarkPaid = () => {
    const ids = Array.from(selected).filter((id) => payments.find((p) => p.id === id)?.status === "pending");
    if (ids.length === 0) return;
    startTransition(async () => {
      try {
        await batchMarkExternalPaymentsPaid(ids);
        showSuccess(`${ids.length} payment(s) marked as paid.`);
        setSelected(new Set());
      } catch (err: any) {
        showError({ title: "Error", message: err.message || "Failed." });
      }
    });
  };

  const handleMarkPaid = (paymentId: string) => {
    startTransition(async () => {
      try {
        await markExternalPaymentPaid(paymentId);
        showSuccess("Payment marked as paid.");
      } catch (err: any) {
        showError({ title: "Error", message: err.message || "Failed." });
      }
    });
  };

  const orgOptions = [
    { value: "all", label: "All Client Orgs" },
    ...organizations.map((o) => ({ value: o.id, label: o.name })),
  ];

  const statusOptions = [
    { value: "all", label: "All Statuses" },
    ...STATUS_ORDER.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) })),
  ];

  return (
    <div className="space-y-4">
      {/* Stats cards */}
      <div className="grid gap-3 md:grid-cols-4">
        <StatCard label="Total Payments" value={filtered.length} sub={`$${totalAll.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} />
        <StatCard label="Pending" value={pendingPayments.length} sub={`$${totalPending.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} color="text-yellow-600 dark:text-yellow-400" />
        <StatCard label="Completed" value={stats.find((s) => s.status === "completed")?.count ?? 0} sub={`$${totalCompleted.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} color="text-green-600 dark:text-green-400" />
        <StatCard label="Client Orgs" value={organizations.length} sub={`${byOrg.length} with payments`} />
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 border-b">
        <button
          type="button"
          onClick={() => setActiveTab("payments")}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === "payments"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Contractor Payments
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("invoices")}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === "invoices"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Client Invoices
          {clientInvoices.filter((i) => i.status === "draft" || i.status === "sent").length > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200">
              {clientInvoices.filter((i) => i.status === "draft" || i.status === "sent").length}
            </span>
          )}
        </button>
      </div>

      {/* Client Invoices Tab */}
      {activeTab === "invoices" && (
        <ClientInvoicesSection invoices={clientInvoices} hasPayments={payments.length > 0} />
      )}

      {/* Contractor Payments Tab */}
      {activeTab === "payments" && (<>
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-56">
          <CustomSelect
            options={orgOptions}
            value={orgFilter}
            onValueChange={(v) => { setOrgFilter(v); setSelected(new Set()); }}
            placeholder="Filter by org"
          />
        </div>
        <div className="w-40">
          <CustomSelect
            options={statusOptions}
            value={statusFilter}
            onValueChange={(v) => { setStatusFilter(v); setSelected(new Set()); }}
            placeholder="Status"
          />
        </div>
        <input
          type="text"
          placeholder="Search contractor or org…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 w-64 rounded-lg border bg-background px-3 text-sm"
        />
        {selected.size > 0 && (() => {
          const selectedPayments = payments.filter((p) => selected.has(p.id) && p.status === "pending");
          const anySelectedBlocked = selectedPayments.some(isPayBlocked);
          return anySelectedBlocked ? (
            <span className="ml-auto flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
              Client invoice must be paid first
            </span>
          ) : (
            <button
              onClick={handleBatchMarkPaid}
              disabled={isPending}
              className="ml-auto h-9 rounded-lg bg-green-600 px-4 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {isPending ? "Processing…" : `Mark ${selected.size} as Paid`}
            </button>
          );
        })()}
      </div>

      {/* Select all pending */}
      {pendingPayments.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <button onClick={toggleAllPending} className="underline hover:text-foreground">
            {pendingPayments.every((p) => selected.has(p.id)) ? "Deselect all pending" : `Select all ${pendingPayments.length} pending`}
          </button>
        </div>
      )}

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          No payments found matching your filters.
        </div>
      )}

      {/* Grouped by org */}
      {byOrg.map(({ org, payments: orgPayments }) => {
        // Check if this org has any unpaid invoices blocking payments
        const orgPendingPayments = orgPayments.filter((p) => p.status === "pending");
        const anyBlocked = orgPendingPayments.some(isPayBlocked);
        const blockedInvoice: { status: string; invoiceNumber: string } | null = orgPendingPayments.reduce(
          (found: { status: string; invoiceNumber: string } | null, p: typeof orgPendingPayments[number]) => found ?? (isPayBlocked(p) ? getInvoiceStatus(p) : null), null as { status: string; invoiceNumber: string } | null
        );

        return (
        <div key={org.id} className="rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="font-semibold">{org.name}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{orgPayments.length}</span>
            </div>
            <span className="text-sm font-medium tabular-nums">
              ${orgPayments.reduce((s, p) => s + Number(p.amount), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>

          {/* Client invoice warning banner */}
          {anyBlocked && blockedInvoice && (
            <div className="flex items-center gap-2 border-b bg-amber-50 px-4 py-2.5 dark:bg-amber-950/30">
              <svg className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-xs text-amber-800 dark:text-amber-300">
                <strong>Client must pay first</strong> — Invoice {blockedInvoice.invoiceNumber} is <span className="font-semibold">{blockedInvoice.status}</span>. Go to the Client Invoices tab to {clientInvoices.find(i => i.organization.id === org.id)?.organization.profile?.paymentMethod === "cor" ? "sync the QB invoice and share the ACH payment link" : "send a payment link"}.
              </span>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="w-8 px-4 py-2"><span className="sr-only">Select</span></th>
                  <th className="px-3 py-2 text-left">Contractor</th>
                  <th className="px-3 py-2 text-left">Period</th>
                  <th className="px-3 py-2 text-left">Description</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2 text-center">Status</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orgPayments.map((p) => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2">
                      {p.status === "pending" && (
                        <input
                          type="checkbox"
                          checked={selected.has(p.id)}
                          onChange={() => toggleSelect(p.id)}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Link href={`/${orgSlug}/employees/${p.employee.id}?from=${encodeURIComponent(pathname)}`} className="font-medium hover:underline">
                        {p.employee.legalFirstName} {p.employee.legalLastName}
                      </Link>
                      <div className="text-xs text-muted-foreground">#{p.employee.employeeNumber}</div>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {p.periodStart && p.periodEnd
                        ? `${shortDate(p.periodStart)} – ${shortDate(p.periodEnd)}`
                        : shortDate(p.createdAt)
                      }
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground max-w-[200px] truncate" title={p.description ?? undefined}>
                      {p.description || p.paymentType}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <EditableAmount payment={p} onSaved={() => router.refresh()} />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[p.status] ?? "bg-muted"}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {p.status === "pending" && (
                        confirmDeleteId === p.id ? (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleDelete(p.id)}
                              disabled={isPending}
                              className="h-7 rounded-md bg-red-600 px-2.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                            >
                              {isPending ? "..." : "Confirm Delete"}
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="h-7 rounded-md border px-2 text-xs hover:bg-accent"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : isPayBlocked(p) ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title="Client invoice must be paid first">
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
                              </svg>
                              Locked
                            </span>
                            <button
                              onClick={() => setConfirmDeleteId(p.id)}
                              disabled={isPending}
                              className="h-7 rounded-md border border-red-300 dark:border-red-700 px-2 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
                              title="Delete payment"
                            >
                              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setPayoutId(p.id)}
                              disabled={isPending}
                              className="h-7 rounded-md bg-green-600 px-2.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                            >
                              Pay
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(p.id)}
                              disabled={isPending}
                              className="h-7 rounded-md border border-red-300 dark:border-red-700 px-2 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
                              title="Delete payment"
                            >
                              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          </div>
                        )
                      )}
                      {p.status === "completed" && p.paymentDate && (
                        <span className="text-xs text-muted-foreground">{shortDate(p.paymentDate)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )})}
      {/* Payout dialog */}
      {payoutId && (
        <PayoutDialog paymentId={payoutId} onClose={() => setPayoutId(null)} />
      )}
      </>)}
    </div>
  );
}

/*  Client Invoices Section  */

const INVOICE_STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  sent: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300",
  paid: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
  void: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300",
};

function ClientInvoicesSection({ invoices, hasPayments }: { invoices: ClientInvoice[]; hasPayments?: boolean }) {
  const router = useRouter();
  const { showError, showSuccess } = useErrorDialog();
  const [isPending, startTransition] = useTransition();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ id: string; action: string } | null>(null);

  const unpaid = invoices.filter((i) => i.status === "draft" || i.status === "sent");
  const paid = invoices.filter((i) => i.status === "paid");
  const voided = invoices.filter((i) => i.status === "void");
  const totalUnpaid = unpaid.reduce((s, i) => s + Number(i.totalAmount), 0);

  const handleStatusChange = (invoiceId: string, status: "draft" | "sent" | "paid" | "void") => {
    startTransition(async () => {
      try {
        await updateClientInvoiceStatus(invoiceId, status);
        showSuccess(`Invoice marked as ${status}`);
        setConfirmAction(null);
      } catch (err: any) {
        showError({ title: "Error", message: err.message || "Failed to update invoice." });
      }
    });
  };

  const renderInvoice = (invoice: ClientInvoice) => {
    const isExpanded = expandedId === invoice.id;
    return (
      <div key={invoice.id} className="rounded-xl border bg-card overflow-hidden">
        <div
          className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-muted/20 transition-colors"
          onClick={() => setExpandedId(isExpanded ? null : invoice.id)}
        >
          <div className="min-w-0">
            <div className="font-semibold text-sm">{invoice.organization.name}</div>
            <div className="text-xs text-muted-foreground">
              {invoice.invoiceNumber} · {invoice.periodName ?? `${shortDate(invoice.periodStart)} – ${shortDate(invoice.periodEnd)}`}
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <div className="font-semibold tabular-nums">${Number(invoice.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
              {Number(invoice.rlFeeTotal) > 0 && (
                <div className="text-[10px] text-muted-foreground">incl. ${Number(invoice.rlFeeTotal).toLocaleString()} fee</div>
              )}
            </div>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${INVOICE_STATUS_COLORS[invoice.status] ?? ""}`}>
              {invoice.status}
            </span>
            <svg className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>

        {isExpanded && (
          <div className="border-t">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-[10px] font-medium text-muted-foreground uppercase">
                  <th className="px-4 py-2">Contractor</th>
                  <th className="px-4 py-2 text-right">Hours</th>
                  <th className="px-4 py-2 text-right">Rate</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lineItems.map((li) => (
                  <tr key={li.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-2">{li.employee.legalFirstName} {li.employee.legalLastName}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{li.hoursWorked ? fmtHours(Number(li.hoursWorked)) : "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{li.hourlyRate ? `$${Number(li.hourlyRate)}` : "—"}</td>
                    <td className="px-4 py-2 text-right font-medium tabular-nums">${Number(li.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/10">
                  <td colSpan={3} className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Subtotal</td>
                  <td className="px-4 py-2 text-right font-medium tabular-nums">${Number(invoice.subtotal).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                </tr>
                {Number(invoice.rlFeeTotal) > 0 && (
                  <tr className="bg-muted/10">
                    <td colSpan={3} className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">RL Service Fee</td>
                    <td className="px-4 py-2 text-right font-medium tabular-nums">${Number(invoice.rlFeeTotal).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  </tr>
                )}
                <tr className="border-t bg-muted/20">
                  <td colSpan={3} className="px-4 py-2 text-right text-sm font-semibold">Total Due</td>
                  <td className="px-4 py-2 text-right text-sm font-semibold tabular-nums">${Number(invoice.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                </tr>
              </tfoot>
            </table>

            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t bg-muted/5">
              {/* QB/ACH — COR org, no payment link yet → sync to QB & get link */}
              {(invoice.status === "draft" || invoice.status === "sent") && !invoice.paymentLink && invoice.organization.profile?.paymentMethod === "cor" && (
                <button
                  onClick={() => {
                    startTransition(async () => {
                      try {
                        const { syncInvoiceToQBAndSendEmail } = await import("@/app/actions/hriq/client-invoices");
                        const result = await syncInvoiceToQBAndSendEmail(invoice.id);
                        if ("error" in result) {
                          showError({ title: "QB Error", message: (result as any).error ?? "Failed to sync invoice" });
                          return;
                        }
                        showSuccess((result as any).emailSent
                          ? `QB invoice synced & payment link emailed to billing contact`
                          : `QB invoice synced — payment link ready`
                        );
                      } catch (err: any) {
                        showError({ title: "QB Error", message: err.message || "Failed to sync QB invoice." });
                      }
                    });
                  }}
                  disabled={isPending}
                  className="h-8 rounded-md bg-emerald-600 px-3 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" /></svg>
                  {isPending ? "Syncing QB…" : "Sync QB Invoice & Send"}
                </button>
              )}

              {/* Stripe — non-COR org, no payment link yet */}
              {(invoice.status === "draft" || invoice.status === "sent") && !invoice.paymentLink && invoice.organization.profile?.paymentMethod !== "cor" && (
                <button
                  onClick={() => {
                    startTransition(async () => {
                      try {
                        const result = await createClientInvoiceCheckout(invoice.id);
                        if ("error" in result) {
                          showError({ title: "Stripe Error", message: result.error ?? "An error occurred" });
                          return;
                        }
                        try {
                          const emailResult = await sendInvoicePaymentLinkEmail(invoice.id);
                          if (!("error" in emailResult)) showSuccess(`Payment link created & emailed to ${(emailResult as any).sentTo}`);
                          else showSuccess("Payment link created!");
                        } catch {
                          showSuccess("Payment link created! (Email could not be sent)");
                        }
                      } catch (err: any) {
                        showError({ title: "Stripe Error", message: err.message || "Failed to create payment link." });
                      }
                    });
                  }}
                  disabled={isPending}
                  className="h-8 rounded-md bg-[#635BFF] px-3 text-xs font-medium text-white hover:bg-[#5851DB] disabled:opacity-50 flex items-center gap-1.5"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
                  {isPending ? "Creating…" : "Send Payment Link"}
                </button>
              )}

              {/* Open / Email existing link */}
              {(invoice.status === "draft" || invoice.status === "sent") && invoice.paymentLink && (
                <>
                  <a
                    href={invoice.paymentLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`h-8 rounded-md px-3 text-xs font-medium text-white inline-flex items-center gap-1.5 ${invoice.organization.profile?.paymentMethod === "cor" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-[#635BFF] hover:bg-[#5851DB]"}`}
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
                    {invoice.organization.profile?.paymentMethod === "cor" ? "Pay via ACH" : "Open Link"}
                  </a>
                  <button
                    onClick={() => {
                      startTransition(async () => {
                        try {
                          const result = await sendInvoicePaymentLinkEmail(invoice.id);
                          if (!("error" in result)) showSuccess(`Payment link emailed to ${(result as any).sentTo}`);
                          else showSuccess("Payment link sent!");
                        } catch (err: any) {
                          showError({ title: "Email Error", message: err.message || "Failed to send email." });
                        }
                      });
                    }}
                    disabled={isPending}
                    className="h-8 rounded-md bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
                    {isPending ? "Sending…" : "Resend Email"}
                  </button>
                  <button
                    onClick={() => {
                      startTransition(async () => {
                        try {
                          const result = await createClientInvoiceCheckout(invoice.id);
                          if ("error" in result) {
                            showError({ title: "Stripe Error", message: result.error ?? "An error occurred" });
                            return;
                          }
                          try {
                            const emailResult = await sendInvoicePaymentLinkEmail(invoice.id);
                            if (!("error" in emailResult)) showSuccess(`New link created & emailed to ${(emailResult as any).sentTo}`);
                            else showSuccess("New payment link created!");
                          } catch {
                            showSuccess("New payment link created!");
                          }
                        } catch (err: any) {
                          showError({ title: "Stripe Error", message: err.message || "Failed to create payment link." });
                        }
                      });
                    }}
                    disabled={isPending}
                    className="h-8 rounded-md border px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                  >
                    Regenerate & Resend
                  </button>
                </>
              )}

              {/* Manual mark as paid (fallback for wire / check / etc) */}
              {(invoice.status === "draft" || invoice.status === "sent") && (
                confirmAction?.id === invoice.id && confirmAction.action === "paid" ? (
                  <div className="flex items-center gap-1">
                    <button onClick={() => handleStatusChange(invoice.id, "paid")} disabled={isPending} className="h-8 rounded-md bg-emerald-600 px-3 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50">{isPending ? "…" : "Confirm"}</button>
                    <button onClick={() => setConfirmAction(null)} className="h-8 rounded-md border px-2 text-xs hover:bg-accent">Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmAction({ id: invoice.id, action: "paid" })} className="h-8 rounded-md border border-emerald-600/30 px-3 text-xs text-emerald-600 hover:bg-emerald-600/10">Mark Paid Manually</button>
                )
              )}

              {/* Void */}
              {invoice.status !== "void" && invoice.status !== "paid" && (
                <button onClick={() => handleStatusChange(invoice.id, "void")} className="h-8 rounded-md border px-3 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">Void</button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {unpaid.length > 0 ? (
        <>
          <h2 className="text-sm font-medium text-muted-foreground">
            {unpaid.length} outstanding invoice{unpaid.length !== 1 ? "s" : ""} · ${totalUnpaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </h2>
          <div className="space-y-3">{unpaid.map(renderInvoice)}</div>
        </>
      ) : (
        <div className="rounded-xl border bg-card px-4 py-10 text-center">
          <div className="font-medium">No outstanding invoices</div>
          <p className="text-sm text-muted-foreground mt-1">Client invoices are generated automatically when contractor payments are created from approved timesheets.</p>
          {hasPayments && (
            <button
              disabled={isPending}
              onClick={() => {
                startTransition(async () => {
                  try {
                    const result = await generateMissingClientInvoices();
                    if ("error" in result) {
                      showError({ title: "Error", message: result.error ?? "Unknown error" });
                    } else if (((result as any).created ?? 0) > 0) {
                      showSuccess((result as any).message ?? "Invoices generated");
                    } else {
                      showError({ title: "No invoices generated", message: "All periods already have invoices, or no approved timesheets were found for the payment periods." });
                    }
                  } catch (err: any) {
                    showError({ title: "Error", message: err.message || "Failed to generate invoices." });
                  }
                });
              }}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isPending ? "Generating…" : "Generate Missing Invoices"}
            </button>
          )}
        </div>
      )}

      {paid.length > 0 && (
        <details className="group">
          <summary className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer list-none">
            <svg className="h-3 w-3 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            {paid.length} paid invoice{paid.length !== 1 ? "s" : ""}
          </summary>
          <div className="mt-3 space-y-3">{paid.map(renderInvoice)}</div>
        </details>
      )}

      {voided.length > 0 && (
        <details className="group">
          <summary className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer list-none">
            <svg className="h-3 w-3 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            {voided.length} voided
          </summary>
          <div className="mt-3 space-y-3 opacity-50">{voided.map(renderInvoice)}</div>
        </details>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: number; sub: string; color?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold tabular-nums ${color ?? ""}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}
