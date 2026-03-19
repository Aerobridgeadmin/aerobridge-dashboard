"use client";

import { shortDate, hours as fmtHours } from "@/lib/hriq/format";
import { useErrorDialog } from "@/app/(authenticated)/components/error-dialog";
import { CustomSelect } from "@/app/(authenticated)/components/custom-select";
import { updatePaymentAmount } from "@/app/actions/hriq/payroll";
import { requeuePayment, markSinglePaymentPaid, deletePayment, getPPPCheckoutUrl } from "@/app/actions/hriq/payments";
import { updateClientInvoiceStatus, generateMissingClientInvoices } from "@/app/actions/hriq/client-invoices";
import { createClientInvoiceCheckout, sendInvoicePaymentLinkEmail } from "@/app/actions/hriq/stripe";
import { PayoutDialog } from "@/app/(authenticated)/components/payout-dialog";
import { ManagementGate } from "./management-gate";
import { useRouter } from "next/navigation";
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
  payoutProvider: string | null;
  wiseFee: string | null;
  wiseSourceAmount: string | null;
  wiseTargetAmount: string | null;
  wiseTargetCurrency: string | null;
  wiseTransferStatus: string | null;
  employee: { id: string; legalFirstName: string; legalLastName: string; employeeNumber: string; department?: string | null };
};

type PeriodOption = {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
};

type ClientInvoiceLineItem = {
  id: string;
  description: string | null;
  hoursWorked: string | null;
  hourlyRate: string | null;
  amount: string;
  paymentLink: string | null;
  paymentStatus: string | null;
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
  rlFeeTotal: string;
  totalAmount: string;
  currency: string;
  status: string;
  paidAt: Date | null;
  paymentMethod: string | null;
  paymentReference: string | null;
  paymentLink: string | null;
  stripePaymentIntentId: string | null;
  createdAt: Date;
  organization: { id: string; name: string; profile?: { paymentMethod: string | null } | null };
  lineItems: ClientInvoiceLineItem[];
};

const STATUS_COLORS: Record<string, string> = {
  completed: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300",
  processing: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300",
};

function toDateKey(d: Date | string | null): string {
  if (!d) return "";
  const s = typeof d === "string" ? d : d.toISOString();
  return s.slice(0, 10);
}

type PeriodGroup = {
  periodId: string;
  periodName: string;
  startDate: string;
  endDate: string;
  payments: Payment[];
};

/*  Inline editable amount cell  */
function EditableAmount({ payment, onSaved, readOnly = false }: { payment: Payment; onSaved: () => void; readOnly?: boolean }) {
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
      await updatePaymentAmount(payment.id, value);
      setEditing(false);
      onSaved();
    } catch (err) {
      showError({ title: "Error", message: err instanceof Error ? err.message : "Failed." });
    } finally {
      setSaving(false);
    }
  };

  if (payment.status === "completed" || readOnly) {
    return <span className="font-medium tabular-nums">${Number(payment.amount).toLocaleString("en-US")} {payment.currency}</span>;
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => { setValue(payment.amount); setEditing(true); }}
        className="font-medium tabular-nums hover:underline hover:text-blue-400 transition-colors cursor-pointer"
        title="Click to edit amount"
      >
        ${Number(payment.amount).toLocaleString("en-US")} {payment.currency}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1 justify-end">
      <span className="text-muted-foreground">$</span>
      <input
        ref={inputRef}
        type="number"
        step="0.01"
        min="0"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
        disabled={saving}
        className="w-24 h-7 rounded border bg-background px-2 text-sm text-right tabular-nums"
      />
      <button onClick={save} disabled={saving} className="h-7 rounded bg-blue-600 px-2 text-[10px] font-medium text-white hover:bg-blue-700 disabled:opacity-50">
        {saving ? "..." : "Save"}
      </button>
      <button onClick={() => setEditing(false)} className="h-7 rounded border px-1.5 text-[10px] hover:bg-accent"></button>
    </div>
  );
}

export function PaymentsDashboard({
  payments,
  periods,
  clientInvoices = [],
  isRL = false,
  orgId,
  orgConnect,
  readOnly = false,
  paymentMethod,
}: {
  payments: Payment[];
  periods: PeriodOption[];
  clientInvoices?: ClientInvoice[];
  isRL?: boolean;
  payrollSummary?: unknown;
  orgId?: string;
  orgConnect?: { accountId: string | null; status: string | null };
  readOnly?: boolean;
  paymentMethod?: string | null;
}) {
  const router = useRouter();
  const { showError, showSuccess } = useErrorDialog();
  const [isPending, startTransition] = useTransition();

  const handleRequeue = (paymentId: string) => {
    startTransition(async () => {
      try {
        const result = await requeuePayment(paymentId);
        if (result && "error" in result) throw new Error((result as any).error ?? "Failed");
        showSuccess(`Payment for ${(result as any).name} sent back to payroll.`);
        router.refresh();
      } catch (err) {
        showError({ title: "Error", message: err instanceof Error ? err.message : "Failed to requeue payment." });
      }
    });
  };

  const handleMarkSinglePaid = (paymentId: string) => {
    startTransition(async () => {
      try {
        const result = await markSinglePaymentPaid(paymentId);
        if (result && "error" in result) throw new Error((result as any).error ?? "Failed");
        showSuccess(`Payment for ${(result as any).name} marked as paid ($${Number((result as any).amount).toLocaleString()}).`);
        router.refresh();
      } catch (err) {
        showError({ title: "Error", message: err instanceof Error ? err.message : "Failed to mark payment as paid." });
      }
    });
  };
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
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
  const [payoutId, setPayoutId] = useState<string | null>(null);
  const isPPP = paymentMethod === "ppp";
  const [pppLoading, setPPPLoading] = useState<string | null>(null);
  const handlePPPPay = (paymentId: string) => {
    setPPPLoading(paymentId);
    startTransition(async () => {
      try {
        const result = await getPPPCheckoutUrl(paymentId);
        if ("error" in result) {
          showError({ title: "Payment Link", message: result.error });
          return;
        }
        window.open(result.url, "_blank");
      } catch (err) {
        showError({ title: "Error", message: err instanceof Error ? err.message : "Failed to get payment link" });
      } finally {
        setPPPLoading(null);
      }
    });
  };
  const [showCompleted, setShowCompleted] = useState(true);
  const [activeTab, setActiveTab] = useState<"payments" | "invoices">("payments");
  const [deptFilter, setDeptFilter] = useState("all");

  // Unique departments
  const departments = useMemo(() => {
    const depts = new Set<string>();
    for (const p of payments) {
      if (p.employee.department) depts.add(p.employee.department);
    }
    return [...depts].sort();
  }, [payments]);

  // Filter payments by department
  const filteredPayments = useMemo(() => {
    if (deptFilter === "all") return payments;
    return payments.filter((p) => p.employee.department === deptFilter);
  }, [payments, deptFilter]);

  const dateRangeToPeriod = useMemo(() => {
    const m = new Map<string, PeriodOption>();
    for (const p of periods) m.set(`${toDateKey(p.startDate)}|${toDateKey(p.endDate)}`, p);
    return m;
  }, [periods]);

  const { pendingGroups, completedGroups, totalPending, totalPendingAmount, totalPendingFees } = useMemo(() => {
    const pendingMap = new Map<string, PeriodGroup>();
    const completedMap = new Map<string, PeriodGroup>();

    for (const pay of filteredPayments) {
      const isPendingPay = pay.status === "pending" || pay.status === "processing";
      const map = isPendingPay ? pendingMap : completedMap;
      const key = `${toDateKey(pay.periodStart)}|${toDateKey(pay.periodEnd)}`;
      const period = dateRangeToPeriod.get(key);
      const existing = map.get(key);

      if (existing) {
        existing.payments.push(pay);
      } else {
        map.set(key, {
          periodId: period?.id ?? key,
          periodName: period?.name ?? (pay.periodStart ? `${shortDate(pay.periodStart)} – ${shortDate(pay.periodEnd!)}` : "Unassigned"),
          startDate: toDateKey(period?.startDate ?? pay.periodStart),
          endDate: toDateKey(period?.endDate ?? pay.periodEnd),
          payments: [pay],
        });
      }
    }

    const sortGroups = (groups: PeriodGroup[]) => groups.sort((a, b) => b.startDate.localeCompare(a.startDate));
    const pGroups = sortGroups(Array.from(pendingMap.values()));
    const cGroups = sortGroups(Array.from(completedMap.values()));

    return {
      pendingGroups: pGroups,
      completedGroups: cGroups,
      totalPending: pGroups.reduce((s, g) => s + g.payments.length, 0),
      totalPendingAmount: pGroups.reduce((s, g) => s + g.payments.reduce((s2, p) => s2 + Number(p.amount), 0), 0),
      totalPendingFees: pGroups.reduce((s, g) => s + g.payments.reduce((s2, p) => s2 + Number(p.wiseFee ?? 0), 0), 0),
    };
  }, [filteredPayments, dateRangeToPeriod]);

  if (payments.length === 0) {
    return (
      <div className="rounded-xl border bg-card py-16 text-center">
        <div className="text-lg font-medium">No payments yet</div>
        <p className="text-sm text-muted-foreground mt-1">
          Payments appear here automatically when timesheets are approved in Payroll.
        </p>
      </div>
    );
  }

  return (
    <ManagementGate readOnly={readOnly} isRL={isRL}>
      {(mgmtToken) => (
    <div className="space-y-6">
      {/* Stripe Express Dashboard — admin: org dashboard (COR only), contractor: personal dashboard */}
      {!isRL && orgId && !readOnly && orgConnect?.accountId && paymentMethod !== "ppp" && (
        <StripeExpressDashboardButton orgId={orgId} showError={showError} />
      )}
      {readOnly && (
        <ContractorStripeDashboardButton showError={showError} />
      )}
      {/*  Tab Navigation — show when there are client invoices  */}
      {clientInvoices.length > 0 && (
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
            {isRL ? "Contractor Payments" : "Payments"}
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
            {isRL ? "Client Invoices" : "Invoices"}
            {clientInvoices.filter((i) => i.status === "draft" || i.status === "sent").length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                {clientInvoices.filter((i) => i.status === "draft" || i.status === "sent").length}
              </span>
            )}
          </button>
        </div>
      )}

      {/*  Client Invoices Tab  */}
      {activeTab === "invoices" && clientInvoices.length > 0 && (
        isRL ? (
          <ClientInvoicesTab invoices={clientInvoices} />
        ) : (
          <ClientPayInvoicesView invoices={clientInvoices} />
        )
      )}

      {/*  Contractor Payments Tab  */}
      {activeTab === "payments" && (
        <>
      {/* Department filter */}
      {departments.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Department</span>
          <CustomSelect
            value={deptFilter}
            onValueChange={setDeptFilter}
            triggerClassName="h-9 min-w-[140px]"
            placeholder="All Departments"
            options={[
              { value: "all", label: "All Departments" },
              ...departments.map((d) => ({ value: d, label: d })),
            ]}
          />
        </div>
      )}

      {/*  Pending Payments  */}
      {pendingGroups.length > 0 ? (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">
              {totalPending} payment{totalPending !== 1 ? "s" : ""} awaiting confirmation · ${totalPendingAmount.toLocaleString("en-US")}{totalPendingFees > 0 ? ` + $${totalPendingFees.toFixed(2)} fees` : ""}
            </h2>
          </div>

          {pendingGroups.map((group) => {
            const groupTotal = group.payments.reduce((s, p) => s + Number(p.amount), 0);
            return (
              <div key={group.periodId} className="rounded-xl border bg-card overflow-hidden">
                <div className="px-4 py-3 border-b bg-muted/10 flex items-center justify-between">
                  <div>
                    <div className="font-semibold">{group.periodName}</div>
                    {group.startDate && (
                      <div className="text-xs text-muted-foreground">{shortDate(group.startDate)} — {shortDate(group.endDate)}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground tabular-nums">{group.payments.length} · ${groupTotal.toLocaleString("en-US")}</span>
                  </div>
                </div>

                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-[10px] font-medium text-muted-foreground uppercase">
                      <th className="px-4 py-2">Contractor</th>
                      <th className="px-4 py-2 text-right">Amount</th>
                      <th className="px-4 py-2 text-center">Status</th>
                      <th className="px-4 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.payments.map((p) => (
                      <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="px-4 py-2.5">
                          <span className="font-medium text-sm">
                            {p.employee.legalFirstName} {p.employee.legalLastName}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <EditableAmount payment={p} onSaved={() => router.refresh()} readOnly={readOnly} />
                          {Number(p.wiseFee ?? 0) > 0 && (
                            <div className="text-[10px] text-orange-500">+${Number(p.wiseFee).toFixed(2)} fee</div>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${STATUS_COLORS[p.status] ?? ""}`}>
                            {p.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {!readOnly && p.status === "pending" && (
                            <div className="flex items-center justify-end gap-1.5">
                              {confirmDeleteId === p.id ? (
                                <>
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
                                </>
                              ) : (
                                <>
                                  <button
                                    onClick={() => handleMarkSinglePaid(p.id)}
                                    disabled={isPending}
                                    className="h-7 rounded-md border border-emerald-300 dark:border-emerald-700 px-2.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 disabled:opacity-50"
                                  >
                                    Mark Paid
                                  </button>
                                  {isPPP ? (
                                    <button
                                      onClick={() => handlePPPPay(p.id)}
                                      disabled={isPending || pppLoading === p.id}
                                      className="h-7 rounded-md bg-blue-600 px-2.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                                    >
                                      {pppLoading === p.id ? "..." : "Pay via Stripe"}
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => setPayoutId(p.id)}
                                      className="h-7 rounded-md bg-green-600 px-2.5 text-xs font-medium text-white hover:bg-green-700"
                                    >
                                      Pay
                                    </button>
                                  )}
                                  <button
                                    onClick={() => setConfirmDeleteId(p.id)}
                                    disabled={isPending}
                                    className="h-7 rounded-md border border-red-300 dark:border-red-700 px-2 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
                                    title="Delete payment"
                                  >
                                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </>
      ) : (
        <div className="rounded-xl border bg-card px-4 py-10 text-center">
          <div className="font-medium">All caught up</div>
          <p className="text-sm text-muted-foreground mt-1">No pending payments. New ones appear here when timesheets are approved.</p>
        </div>
      )}

      {/*  Completed Payments  */}
      {completedGroups.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowCompleted(!showCompleted)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg className={`h-3 w-3 transition-transform ${showCompleted ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            {completedGroups.reduce((s, g) => s + g.payments.length, 0)} completed payment{completedGroups.reduce((s, g) => s + g.payments.length, 0) !== 1 ? "s" : ""}
          </button>

          {showCompleted && (
            <div className="mt-3 space-y-4">
              {completedGroups.map((group) => (
                <div key={group.periodId} className="rounded-xl border bg-card overflow-hidden opacity-75">
                  <div className="px-4 py-2.5 border-b bg-muted/10">
                    <div className="font-medium text-sm">{group.periodName}</div>
                    {group.startDate && (
                      <div className="text-xs text-muted-foreground">{shortDate(group.startDate)} — {shortDate(group.endDate)}</div>
                    )}
                  </div>
                  <table className="w-full text-sm">
                    <tbody>
                      {group.payments.map((p) => (
                        <tr key={p.id} className="border-b last:border-0">
                          <td className="px-4 py-2 text-muted-foreground">
                            {p.employee.legalFirstName} {p.employee.legalLastName}
                          </td>
                          <td className="px-4 py-2 text-right font-medium tabular-nums text-muted-foreground">
                            ${Number(p.amount).toLocaleString("en-US")}
                            {Number(p.wiseFee ?? 0) > 0 && (
                              <div className="text-[10px] text-orange-500 font-normal">+${Number(p.wiseFee).toFixed(2)} fee</div>
                            )}
                          </td>
                          <td className="px-4 py-2 text-center">
                            <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300">paid</span>
                          </td>
                          <td className="px-4 py-2 text-right text-xs text-muted-foreground">
                            {p.paymentDate ? shortDate(p.paymentDate) : "—"}
                          </td>
                          <td className="px-4 py-2 text-right">
                            {!readOnly && (
                            <button
                              type="button"
                              onClick={() => handleRequeue(p.id)}
                              disabled={isPending}
                              className="h-6 rounded border border-amber-300 dark:border-amber-700 px-2 text-[10px] text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30 disabled:opacity-50"
                              title="Send back to payroll queue"
                            >
                              Requeue
                            </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {/* Payout dialog */}
      {payoutId && (
        <PayoutDialog paymentId={payoutId} onClose={() => setPayoutId(null)} managementToken={mgmtToken} />
      )}
        </>
      )}
    </div>
      )}
    </ManagementGate>
  );
}

//  Client Invoices Tab 

const INVOICE_STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  sent: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300",
  paid: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
  void: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300",
};

function ClientInvoicesTab({ invoices }: { invoices: ClientInvoice[] }) {
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
      } catch (err) {
        showError({ title: "Error", message: err instanceof Error ? err.message : "Failed to update invoice." });
      }
    });
  };

  const handleStripeCheckout = (invoiceId: string) => {
    startTransition(async () => {
      try {
        const result = await createClientInvoiceCheckout(invoiceId);
        if ("error" in result) {
          showError({ title: "Stripe Checkout", message: result.error ?? "An error occurred" });
        } else {
          // Send payment link email automatically
          try {
            await sendInvoicePaymentLinkEmail(invoiceId);
            showSuccess("Payment link created and emailed to client");
          } catch {
            showSuccess("Payment link created (email delivery may have failed)");
          }
        }
      } catch (err) {
        showError({ title: "Stripe Checkout", message: err instanceof Error ? err.message : "Failed to create checkout session." });
      }
    });
  };

  const handleSendPaymentLink = (invoiceId: string) => {
    startTransition(async () => {
      try {
        await sendInvoicePaymentLinkEmail(invoiceId);
        showSuccess("Payment link email sent to client");
      } catch (err) {
        showError({ title: "Send Payment Link", message: err instanceof Error ? err.message : "Failed to send payment link email." });
      }
    });
  };

  const handleSyncQB = (invoiceId: string) => {
    startTransition(async () => {
      try {
        const { syncInvoiceToQBAndSendEmail } = await import("@/app/actions/hriq/client-invoices");
        const result = await syncInvoiceToQBAndSendEmail(invoiceId);
        if ("error" in result) {
          showError({ title: "QB Sync", message: result.error ?? "Failed to sync to QuickBooks" });
        } else {
          showSuccess(result.emailSent ? "Synced to QB and emailed billing contact" : "Synced to QB (no billing email on file)");
        }
      } catch (err) {
        showError({ title: "QB Sync", message: err instanceof Error ? err.message : "Failed to sync to QuickBooks." });
      }
    });
  };

  const handleGenerateInvoices = () => {
    startTransition(async () => {
      try {
        const rawResult = await generateMissingClientInvoices();
        if ("error" in rawResult) { showError({ title: "Error", message: (rawResult as any).error ?? "Error" }); return; }
        const result = rawResult as { created: number; message: string };
        showSuccess(result.message ?? `Generated ${result.created} invoice(s)`);
      } catch (err) {
        showError({ title: "Generate Invoices", message: err instanceof Error ? err.message : "Failed to generate invoices." });
      }
    });
  };

  const renderInvoiceRow = (invoice: ClientInvoice) => {
    const isExpanded = expandedId === invoice.id;
    return (
      <div key={invoice.id} className="rounded-xl border bg-card overflow-hidden">
        <div
          className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-muted/20 transition-colors"
          onClick={() => setExpandedId(isExpanded ? null : invoice.id)}
        >
          <div className="flex items-center gap-4 min-w-0">
            <div className="min-w-0">
              <div className="font-semibold text-sm">{invoice.organization.name}</div>
              <div className="text-xs text-muted-foreground">
                {invoice.invoiceNumber} · {invoice.periodName ?? `${shortDate(invoice.periodStart)} – ${shortDate(invoice.periodEnd)}`}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <div className="font-semibold tabular-nums">${Number(invoice.totalAmount).toLocaleString("en-US")}</div>
              {Number(invoice.rlFeeTotal) > 0 && (
                <div className="text-[10px] text-muted-foreground">
                  incl. ${Number(invoice.rlFeeTotal).toLocaleString("en-US")} fee
                </div>
              )}
            </div>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${INVOICE_STATUS_COLORS[invoice.status] ?? ""}`}>
              {invoice.status}
            </span>
            <svg
              className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>

        {isExpanded && (
          <div className="border-t">
            {/* Line items */}
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
                    <td className="px-4 py-2">
                      {li.employee.legalFirstName} {li.employee.legalLastName}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{li.hoursWorked ? fmtHours(Number(li.hoursWorked)) : "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{li.hourlyRate ? `$${Number(li.hourlyRate)}` : "—"}</td>
                    <td className="px-4 py-2 text-right font-medium tabular-nums">${Number(li.amount).toLocaleString("en-US")}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/10">
                  <td colSpan={3} className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Subtotal</td>
                  <td className="px-4 py-2 text-right font-medium tabular-nums">${Number(invoice.subtotal).toLocaleString("en-US")}</td>
                </tr>
                {Number(invoice.rlFeeTotal) > 0 && (
                  <tr className="bg-muted/10">
                    <td colSpan={3} className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">
                      RL Service Fee ({invoice.rlFeeType === "percentage" ? `${Number(invoice.rlFeeTotal) > 0 ? ((Number(invoice.rlFeeTotal) / Number(invoice.subtotal)) * 100).toFixed(1) : 0}%` : invoice.rlFeeType ?? "flat"})
                    </td>
                    <td className="px-4 py-2 text-right font-medium tabular-nums">${Number(invoice.rlFeeTotal).toLocaleString("en-US")}</td>
                  </tr>
                )}
                <tr className="border-t bg-muted/20">
                  <td colSpan={3} className="px-4 py-2 text-right text-sm font-semibold">Total</td>
                  <td className="px-4 py-2 text-right text-sm font-semibold tabular-nums">${Number(invoice.totalAmount).toLocaleString("en-US")}</td>
                </tr>
              </tfoot>
            </table>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t bg-muted/5">
              {/* QB/ACH — COR org, no payment link yet */}
              {(invoice.status === "draft" || invoice.status === "sent") && !invoice.paymentLink && invoice.organization.profile?.paymentMethod === "cor" && (
                <button
                  onClick={() => handleSyncQB(invoice.id)}
                  disabled={isPending}
                  className="h-8 rounded-md bg-emerald-600 px-3 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
                  {isPending ? "Syncing QB…" : "Sync QB Invoice & Send"}
                </button>
              )}
              {/* Stripe — non-COR org, no payment link yet */}
              {(invoice.status === "draft" || invoice.status === "sent") && !invoice.paymentLink && invoice.organization.profile?.paymentMethod !== "cor" && (
                <button
                  onClick={() => handleStripeCheckout(invoice.id)}
                  disabled={isPending}
                  className="h-8 rounded-md bg-violet-600 px-3 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50 flex items-center gap-1.5"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
                  {isPending ? "Creating..." : "Send Stripe Payment Link"}
                </button>
              )}
              {(invoice.status === "draft" || invoice.status === "sent") && invoice.paymentLink && (
                <div className="flex items-center gap-1.5">
                  <a href={invoice.paymentLink} target="_blank" rel="noopener noreferrer"
                    className={`h-8 rounded-md px-3 text-xs font-medium inline-flex items-center gap-1.5 ${invoice.organization.profile?.paymentMethod === "cor" ? "bg-emerald-600/10 border border-emerald-600/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-600/20" : "bg-violet-600/10 border border-violet-600/30 text-violet-600 dark:text-violet-400 hover:bg-violet-600/20"}`}>
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
                    {invoice.organization.profile?.paymentMethod === "cor" ? "Pay via ACH" : "View Payment Link"}
                  </a>
                  <button
                    onClick={() => invoice.organization.profile?.paymentMethod === "cor" ? handleSyncQB(invoice.id) : handleSendPaymentLink(invoice.id)}
                    disabled={isPending}
                    className={`h-8 rounded-md border px-3 text-xs font-medium disabled:opacity-50 ${invoice.organization.profile?.paymentMethod === "cor" ? "border-emerald-600/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-600/10" : "border-violet-600/30 text-violet-600 dark:text-violet-400 hover:bg-violet-600/10"}`}
                  >
                    {isPending ? "..." : "Resend Email"}
                  </button>
                </div>
              )}

              {/* Manual Status Actions */}
              {invoice.status === "draft" && (
                <>
                  {confirmAction?.id === invoice.id && confirmAction.action === "sent" ? (
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleStatusChange(invoice.id, "sent")} disabled={isPending} className="h-8 rounded-md bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                        {isPending ? "..." : "Confirm Send"}
                      </button>
                      <button onClick={() => setConfirmAction(null)} className="h-8 rounded-md border px-2 text-xs hover:bg-accent">Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmAction({ id: invoice.id, action: "sent" })} className="h-8 rounded-md border px-3 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
                      Mark as Sent
                    </button>
                  )}
                </>
              )}
              {(invoice.status === "draft" || invoice.status === "sent") && (
                <>
                  {confirmAction?.id === invoice.id && confirmAction.action === "paid" ? (
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleStatusChange(invoice.id, "paid")} disabled={isPending} className="h-8 rounded-md bg-emerald-600 px-3 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                        {isPending ? "..." : "Confirm Paid"}
                      </button>
                      <button onClick={() => setConfirmAction(null)} className="h-8 rounded-md border px-2 text-xs hover:bg-accent">Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmAction({ id: invoice.id, action: "paid" })} className="h-8 rounded-md border px-3 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
                      Mark as Paid
                    </button>
                  )}
                </>
              )}
              {invoice.status !== "void" && invoice.status !== "paid" && (
                <button onClick={() => handleStatusChange(invoice.id, "void")} className="h-8 rounded-md border px-3 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
                  Void
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Generate Invoices Action */}
      <div className="flex items-center justify-between">
        <div />
        <button
          onClick={handleGenerateInvoices}
          disabled={isPending}
          className="h-8 rounded-md border px-3 text-xs font-medium hover:bg-accent disabled:opacity-50 flex items-center gap-1.5"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          {isPending ? "Generating..." : "Generate Invoices"}
        </button>
      </div>

      {unpaid.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">
              {unpaid.length} outstanding invoice{unpaid.length !== 1 ? "s" : ""} · ${totalUnpaid.toLocaleString("en-US")}
            </h2>
          </div>
          <div className="space-y-3">
            {unpaid.map(renderInvoiceRow)}
          </div>
        </>
      )}

      {unpaid.length === 0 && (
        <div className="rounded-xl border bg-card px-4 py-10 text-center">
          <div className="font-medium">No outstanding invoices</div>
          <p className="text-sm text-muted-foreground mt-1">Client invoices are generated automatically when contractor payments are created.</p>
        </div>
      )}

      {paid.length > 0 && (
        <div>
          <details className="group">
            <summary className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer list-none">
              <svg className="h-3 w-3 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              {paid.length} paid invoice{paid.length !== 1 ? "s" : ""}
            </summary>
            <div className="mt-3 space-y-3">
              {paid.map(renderInvoiceRow)}
            </div>
          </details>
        </div>
      )}

      {voided.length > 0 && (
        <div>
          <details className="group">
            <summary className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer list-none">
              <svg className="h-3 w-3 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              {voided.length} voided invoice{voided.length !== 1 ? "s" : ""}
            </summary>
            <div className="mt-3 space-y-3 opacity-50">
              {voided.map(renderInvoiceRow)}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

/** Client-facing invoice view — PPP clients see per-contractor Pay buttons */
function ClientPayInvoicesView({ invoices }: { invoices: ClientInvoice[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const unpaid = invoices.filter((i) => i.status === "draft" || i.status === "sent");
  const paid = invoices.filter((i) => i.status === "paid");

  const LINE_STATUS: Record<string, { label: string; cls: string }> = {
    paid: { label: "Paid", cls: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300" },
    pending: { label: "Pending", cls: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300" },
  };

  const renderInvoice = (invoice: ClientInvoice) => {
    const isExpanded = expandedId === invoice.id;
    const allPaid = invoice.lineItems.every((li) => li.paymentStatus === "paid");
    const paidCount = invoice.lineItems.filter((li) => li.paymentStatus === "paid").length;

    return (
      <div key={invoice.id} className="rounded-xl border bg-card overflow-hidden">
        <div
          className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-muted/20 transition-colors"
          onClick={() => setExpandedId(isExpanded ? null : invoice.id)}
        >
          <div className="min-w-0">
            <div className="font-semibold text-sm">{invoice.periodName ?? "Invoice"}</div>
            <div className="text-xs text-muted-foreground">
              {invoice.invoiceNumber} · {invoice.lineItems.length} contractor{invoice.lineItems.length !== 1 ? "s" : ""}
              {!allPaid && paidCount > 0 && ` · ${paidCount}/${invoice.lineItems.length} paid`}
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <div className="font-semibold tabular-nums">${Number(invoice.totalAmount).toLocaleString("en-US", { minimumFractionDigits: 2 })}</div>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${
              invoice.status === "paid" ? "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300"
              : "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300"
            }`}>
              {allPaid ? "Paid" : invoice.status}
            </span>
            <svg
              className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
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
                  <th className="px-4 py-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lineItems.map((li) => {
                  const isPaid = li.paymentStatus === "paid";
                  const statusCfg = LINE_STATUS[li.paymentStatus ?? "pending"] ?? LINE_STATUS.pending;
                  return (
                    <tr key={li.id} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-2.5">{li.employee.legalFirstName} {li.employee.legalLastName}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{li.hoursWorked ? `${Number(li.hoursWorked)}h` : "—"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{li.hourlyRate ? `$${Number(li.hourlyRate)}/hr` : "—"}</td>
                      <td className="px-4 py-2.5 text-right font-medium tabular-nums">${Number(li.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                      <td className="px-4 py-2.5 text-center">
                        {isPaid ? (
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusCfg.cls}`}>{statusCfg.label}</span>
                        ) : li.paymentLink ? (
                          <a
                            href={li.paymentLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
                          >
                            Pay ${Number(li.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">Setup pending</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/10">
                  <td colSpan={3} className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Total</td>
                  <td className="px-4 py-2 text-right font-semibold tabular-nums">${Number(invoice.totalAmount).toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {unpaid.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">
              {unpaid.length} invoice{unpaid.length !== 1 ? "s" : ""} pending payment
            </h2>
          </div>
          <div className="space-y-3">{unpaid.map(renderInvoice)}</div>
        </>
      )}

      {unpaid.length === 0 && paid.length === 0 && (
        <div className="rounded-xl border bg-card px-4 py-10 text-center">
          <div className="font-medium">No invoices yet</div>
          <p className="text-sm text-muted-foreground mt-1">Invoices will appear here when your contractors submit approved timesheets.</p>
        </div>
      )}

      {unpaid.length === 0 && paid.length > 0 && (
        <div className="rounded-xl border bg-card px-4 py-10 text-center">
          <div className="flex items-center justify-center gap-2">
            <svg className="h-5 w-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            <span className="font-medium">All caught up</span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">All invoices are paid.</p>
        </div>
      )}

      {paid.length > 0 && (
        <details className="group">
          <summary className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer list-none">
            <svg className="h-3 w-3 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            {paid.length} paid invoice{paid.length !== 1 ? "s" : ""}
          </summary>
          <div className="mt-3 space-y-3">{paid.map(renderInvoice)}</div>
        </details>
      )}
    </div>
  );
}

function StripeExpressDashboardButton({
  orgId,
  showError,
}: {
  orgId: string;
  showError: (opts: { title: string; message: string }) => void;
}) {
  const [isPending, startTransition] = useTransition();

  const handleDashboard = () => {
    startTransition(async () => {
      try {
        const { getOrgConnectDashboardLink } = await import("@/app/actions/hriq/stripe");
        const result = await getOrgConnectDashboardLink(orgId);
        if ("error" in result) {
          showError({ title: "Dashboard Error", message: (result as any).error ?? "An error occurred" });
        } else {
          window.open((result as any).url, "_blank");
        }
      } catch (err) {
        showError({ title: "Error", message: err instanceof Error ? err.message : "Failed." });
      }
    });
  };

  return (
    <div className="flex items-center justify-between rounded-lg border bg-card px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900/40">
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-violet-600 dark:text-violet-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" />
          </svg>
        </div>
        <span className="text-sm font-medium">View your payment transfers and history on Stripe</span>
      </div>
      <button
        type="button"
        disabled={isPending}
        onClick={handleDashboard}
        className="h-8 rounded-md bg-violet-600 px-3 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50"
      >
        {isPending ? "Opening..." : "Open Stripe Dashboard"}
      </button>
    </div>
  );
}

function ContractorStripeDashboardButton({
  showError,
}: {
  showError: (opts: { title: string; message: string }) => void;
}) {
  const [isPending, startTransition] = useTransition();

  const handleDashboard = () => {
    startTransition(async () => {
      try {
        const { getContractorStripeDashboard } = await import("@/app/actions/hriq/stripe");
        const result = await getContractorStripeDashboard();
        if ("error" in result) {
          showError({ title: "Stripe Dashboard", message: (result as any).error ?? "An error occurred" });
        } else {
          window.open((result as any).url, "_blank");
        }
      } catch (err) {
        showError({ title: "Error", message: err instanceof Error ? err.message : "Failed." });
      }
    });
  };

  return (
    <div className="flex items-center justify-between rounded-lg border bg-card px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" />
          </svg>
        </div>
        <span className="text-sm font-medium">View your earnings, payouts, and bank details on Stripe</span>
      </div>
      <button
        type="button"
        disabled={isPending}
        onClick={handleDashboard}
        className="h-8 rounded-md bg-emerald-600 px-3 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {isPending ? "Opening..." : "My Stripe Dashboard"}
      </button>
    </div>
  );
}
