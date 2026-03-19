"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import { useErrorDialog } from "@/app/(authenticated)/components/error-dialog";
import type { PaymentsSettingsData, OrgBillingRow, ContractorPaymentRow } from "@/app/actions/hriq/settings-payments";
import {
  CheckCircle2Icon,
  XCircleIcon,
  ClockIcon,
  RefreshCwIcon,
  SendIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  BuildingIcon,
  UserIcon,
} from "lucide-react";

// ─── Status badges ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string | null }) {
  if (!status || status === "none") {
    return <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><XCircleIcon className="h-3.5 w-3.5" />Not set up</span>;
  }
  const cfg: Record<string, { icon: React.ReactNode; cls: string }> = {
    verified:    { icon: <CheckCircle2Icon className="h-3.5 w-3.5" />, cls: "text-emerald-600 dark:text-emerald-400" },
    restricted:  { icon: <CheckCircle2Icon className="h-3.5 w-3.5" />, cls: "text-amber-600 dark:text-amber-400" },
    onboarding:  { icon: <ClockIcon className="h-3.5 w-3.5" />,       cls: "text-blue-600 dark:text-blue-400" },
    pending:     { icon: <ClockIcon className="h-3.5 w-3.5" />,       cls: "text-blue-600 dark:text-blue-400" },
    disabled:    { icon: <XCircleIcon className="h-3.5 w-3.5" />,     cls: "text-red-600 dark:text-red-400" },
    active:      { icon: <CheckCircle2Icon className="h-3.5 w-3.5" />, cls: "text-emerald-600 dark:text-emerald-400" },
  };
  const c = cfg[status] ?? { icon: <ClockIcon className="h-3.5 w-3.5" />, cls: "text-muted-foreground" };
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${c.cls}`}>
      {c.icon}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function MethodPill({ method }: { method: string | null }) {
  const cfg: Record<string, string> = {
    ppp:  "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
    cor:  "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    both: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
  };
  if (!method) return <span className="text-xs text-muted-foreground">No method</span>;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${cfg[method] ?? "bg-zinc-100 text-zinc-600"}`}>
      {method}
    </span>
  );
}

// ─── Section header ──────────────────────────────────────────────────────────

function SectionHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border bg-card px-5 py-4">
      <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary flex-shrink-0">
        {icon}
      </div>
      <div>
        <h3 className="font-semibold text-sm">{title}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
      </div>
    </div>
  );
}

// ─── Org Billing section (Stripe Checkout) ───────────────────────────────────

function OrgBillingSection({ orgs, onResendSetup }: {
  orgs: OrgBillingRow[];
  onResendSetup: (orgId: string, adminEmail: string, orgName: string) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const billingOrgs = orgs.filter(o => o.paymentMethod && ["ppp", "cor", "both"].includes(o.paymentMethod));

  return (
    <div className="space-y-2">
      <SectionHeader
        icon={<BuildingIcon className="h-4 w-4" />}
        title="Stripe Billing — Client Payment Methods"
        subtitle="Stripe Checkout used to charge client orgs for contractor invoices. This is separate from Stripe Connect (contractor payouts)."
      />
      <div className="rounded-xl border overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-4 py-2 bg-muted/30 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          <div>Organization</div>
          <div>Method</div>
          <div>Stripe Customer</div>
          <div>Stripe Connect (Org)</div>
          <div>Action</div>
        </div>
        <div className="divide-y">
          {billingOrgs.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No client organizations with payment methods configured.</p>
          )}
          {billingOrgs.map(org => (
            <div key={org.orgId}>
              <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-4 py-3 items-center hover:bg-muted/20">
                <div>
                  <p className="text-sm font-medium">{org.orgName}</p>
                  {org.adminEmail && <p className="text-xs text-muted-foreground">{org.adminEmail}</p>}
                </div>
                <MethodPill method={org.paymentMethod} />
                {/* Stripe Billing Customer ID */}
                <div className="text-right">
                  {org.stripeCustomerId
                    ? <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><CheckCircle2Icon className="h-3.5 w-3.5" />Customer set</span>
                    : <span className="text-xs text-muted-foreground flex items-center gap-1"><XCircleIcon className="h-3.5 w-3.5" />No customer</span>
                  }
                </div>
                {/* Org Stripe Connect (for PPP orgs) */}
                <div className="text-right">
                  {(org.paymentMethod === "ppp" || org.paymentMethod === "both")
                    ? <StatusBadge status={org.stripeConnectStatus} />
                    : <span className="text-xs text-muted-foreground">—</span>
                  }
                </div>
                {/* Action */}
                <div className="flex justify-end">
                  <button
                    onClick={() => org.adminEmail && onResendSetup(org.orgId, org.adminEmail, org.orgName)}
                    disabled={!org.adminEmail}
                    title={org.adminEmail ? "Resend billing setup email" : "No admin email on file"}
                    className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <SendIcon className="h-3 w-3" />
                    Resend Setup
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Contractor Connect section (Stripe Connect Express per contractor) ───────

function ContractorConnectSection({ contractors, onResendConnect }: {
  contractors: ContractorPaymentRow[];
  onResendConnect: (employeeId: string, name: string) => void;
}) {
  const pppContractors = contractors.filter(c => c.paymentMethod === "ppp" || c.paymentMethod === "both");

  // Group by org
  const byOrg = pppContractors.reduce<Record<string, ContractorPaymentRow[]>>((acc, c) => {
    (acc[c.orgId] = acc[c.orgId] ?? []).push(c);
    return acc;
  }, {});

  const [openOrgs, setOpenOrgs] = useState<Set<string>>(new Set(Object.keys(byOrg)));
  const toggleOrg = (id: string) => setOpenOrgs(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  return (
    <div className="space-y-2">
      <SectionHeader
        icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>}
        title="Stripe Connect Express — Contractor Payout Accounts (PPP)"
        subtitle="Each PPP contractor needs their own Stripe Express account to receive payouts directly from client invoices. Distinct from the org-level billing Stripe."
      />
      <div className="space-y-2">
        {pppContractors.length === 0 && (
          <div className="rounded-xl border px-4 py-8 text-center text-sm text-muted-foreground">No contractors in PPP organizations.</div>
        )}
        {Object.entries(byOrg).map(([orgId, rows]) => {
          const orgName = rows[0]?.orgName ?? orgId;
          const allReady = rows.every(r => r.stripeAccountStatus === "verified" || r.stripeAccountStatus === "restricted");
          const isOpen = openOrgs.has(orgId);
          return (
            <div key={orgId} className="rounded-xl border overflow-hidden">
              <button
                onClick={() => toggleOrg(orgId)}
                className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-2 text-sm font-medium">
                  {isOpen ? <ChevronDownIcon className="h-4 w-4 text-muted-foreground" /> : <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />}
                  {orgName}
                  <span className="text-xs text-muted-foreground font-normal">({rows.length} contractor{rows.length !== 1 ? "s" : ""})</span>
                </div>
                {allReady
                  ? <span className="text-xs text-emerald-600 font-medium flex items-center gap-1"><CheckCircle2Icon className="h-3.5 w-3.5" />All ready</span>
                  : <span className="text-xs text-amber-600 font-medium flex items-center gap-1"><ClockIcon className="h-3.5 w-3.5" />{rows.filter(r => !["verified","restricted"].includes(r.stripeAccountStatus ?? "")).length} incomplete</span>
                }
              </button>
              {isOpen && (
                <div className="divide-y">
                  <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-3 px-4 py-2 bg-muted/10 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    <div>#</div><div>Contractor</div><div>Account ID</div><div>Status</div><div>Action</div>
                  </div>
                  {rows.map(c => (
                    <div key={c.employeeId} className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-3 px-4 py-3 items-center hover:bg-muted/20">
                      <div className="text-xs text-muted-foreground font-mono">{c.employeeNumber ?? "—"}</div>
                      <div>
                        <p className="text-sm font-medium">{c.name}</p>
                        {c.email && <p className="text-xs text-muted-foreground">{c.email}</p>}
                      </div>
                      <div className="text-right font-mono text-xs text-muted-foreground">
                        {c.stripeAccountId ? c.stripeAccountId.slice(0, 18) + "…" : "—"}
                      </div>
                      <div className="text-right">
                        <StatusBadge status={c.stripeAccountStatus} />
                      </div>
                      <div className="flex justify-end">
                        <button
                          onClick={() => onResendConnect(c.employeeId, c.name)}
                          className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs hover:bg-accent"
                        >
                          <SendIcon className="h-3 w-3" />
                          {c.stripeAccountId ? "Resend Link" : "Send Invite"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Wise section (COR) ───────────────────────────────────────────────────────

function WiseSection({ contractors }: { contractors: ContractorPaymentRow[] }) {
  const corContractors = contractors.filter(c => c.paymentMethod === "cor" || c.paymentMethod === "both");
  const byOrg = corContractors.reduce<Record<string, ContractorPaymentRow[]>>((acc, c) => {
    (acc[c.orgId] = acc[c.orgId] ?? []).push(c);
    return acc;
  }, {});
  const [openOrgs, setOpenOrgs] = useState<Set<string>>(new Set(Object.keys(byOrg)));
  const toggleOrg = (id: string) => setOpenOrgs(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  return (
    <div className="space-y-2">
      <SectionHeader
        icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20M12 2a14.5 14.5 0 0 1 0 20M2 12h20"/></svg>}
        title="Wise — International Contractor Payouts (COR)"
        subtitle="COR contractors receive payments via Wise international transfers. Contractors set up their bank details on first login through the payment gate."
      />
      <div className="space-y-2">
        {corContractors.length === 0 && (
          <div className="rounded-xl border px-4 py-8 text-center text-sm text-muted-foreground">No contractors in COR organizations.</div>
        )}
        {Object.entries(byOrg).map(([orgId, rows]) => {
          const orgName = rows[0]?.orgName ?? orgId;
          const allReady = rows.every(r => r.wiseRecipientId !== null && r.wiseRecipientId !== -1);
          const isOpen = openOrgs.has(orgId);
          return (
            <div key={orgId} className="rounded-xl border overflow-hidden">
              <button
                onClick={() => toggleOrg(orgId)}
                className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-2 text-sm font-medium">
                  {isOpen ? <ChevronDownIcon className="h-4 w-4 text-muted-foreground" /> : <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />}
                  {orgName}
                  <span className="text-xs text-muted-foreground font-normal">({rows.length} contractor{rows.length !== 1 ? "s" : ""})</span>
                </div>
                {allReady
                  ? <span className="text-xs text-emerald-600 font-medium flex items-center gap-1"><CheckCircle2Icon className="h-3.5 w-3.5" />All ready</span>
                  : <span className="text-xs text-amber-600 font-medium flex items-center gap-1"><ClockIcon className="h-3.5 w-3.5" />{rows.filter(r => !r.wiseRecipientId || r.wiseRecipientId === -1).length} incomplete</span>
                }
              </button>
              {isOpen && (
                <div className="divide-y">
                  <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-3 px-4 py-2 bg-muted/10 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    <div>#</div><div>Contractor</div><div>Recipient ID</div><div>Currency</div><div>Status</div>
                  </div>
                  {rows.map(c => {
                    const hasRecipient = c.wiseRecipientId !== null && c.wiseRecipientId !== -1;
                    const isPlaceholder = c.wiseRecipientId === -1;
                    return (
                      <div key={c.employeeId} className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-3 px-4 py-3 items-center hover:bg-muted/20">
                        <div className="text-xs text-muted-foreground font-mono">{c.employeeNumber ?? "—"}</div>
                        <div>
                          <p className="text-sm font-medium">{c.name}</p>
                          {c.email && <p className="text-xs text-muted-foreground">{c.email}</p>}
                        </div>
                        <div className="text-right font-mono text-xs text-muted-foreground">
                          {hasRecipient ? String(c.wiseRecipientId) : isPlaceholder ? "placeholder" : "—"}
                        </div>
                        <div className="text-right text-xs text-muted-foreground uppercase">
                          {c.wiseRecipientCurrency ?? "—"}
                        </div>
                        <div className="text-right">
                          {hasRecipient
                            ? <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"><CheckCircle2Icon className="h-3.5 w-3.5" />Ready</span>
                            : isPlaceholder
                              ? <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400" title="Bank details saved but Wise recipient not yet synced"><ClockIcon className="h-3.5 w-3.5" />Bank saved, not synced</span>
                              : c.hasBankDetails
                                ? <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400"><ClockIcon className="h-3.5 w-3.5" />Bank details pending sync</span>
                                : <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><XCircleIcon className="h-3.5 w-3.5" />No bank details</span>
                          }
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main tab component ───────────────────────────────────────────────────────

export function PaymentsTab() {
  const [data, setData] = useState<PaymentsSettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const { showError, showSuccess } = useErrorDialog();

  const loadData = useCallback(() => {
    setLoading(true);
    startTransition(async () => {
      try {
        const { getPaymentsSettingsData } = await import("@/app/actions/hriq/settings-payments");
        const result = await getPaymentsSettingsData();
        setData(result);
      } catch (err) {
        showError({ title: "Load failed", message: err instanceof Error ? err.message : "Error" });
      } finally {
        setLoading(false);
      }
    });
  }, [showError]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleResendOrgSetup = (orgId: string, adminEmail: string, orgName: string) => {
    startTransition(async () => {
      try {
        const { sendOrgStripeSetupEmail } = await import("@/app/actions/hriq/stripe");
        const result = await sendOrgStripeSetupEmail(adminEmail, orgName, orgId);
        if ("error" in result) { showError({ title: "Failed", message: result.error }); return; }
        showSuccess(`Billing setup email sent to ${adminEmail}`);
      } catch (err) {
        showError({ title: "Failed", message: err instanceof Error ? err.message : "Error" });
      }
    });
  };

  const handleResendConnect = (employeeId: string, name: string) => {
    startTransition(async () => {
      try {
        const { sendStripeConnectInvite } = await import("@/app/actions/hriq/stripe");
        const result = await sendStripeConnectInvite(employeeId);
        if ("error" in result) { showError({ title: "Failed", message: result.error }); return; }
        showSuccess(`Stripe Connect invite sent to ${name}`);
        loadData();
      } catch (err) {
        showError({ title: "Failed", message: err instanceof Error ? err.message : "Error" });
      }
    });
  };

  if (loading) {
    return <div className="py-12 text-center text-sm text-muted-foreground">Loading payment data...</div>;
  }
  if (!data) return null;

  return (
    <div className="space-y-8">
      {/* Refresh */}
      <div className="flex justify-end">
        <button onClick={loadData} disabled={isPending} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50">
          <RefreshCwIcon className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Explainer */}
      <div className="rounded-xl border border-dashed bg-muted/20 px-4 py-3 text-xs text-muted-foreground space-y-1">
        <p><strong className="text-foreground">Stripe Billing</strong> — Charges client orgs for contractor invoices via Stripe Checkout. One Stripe Customer per org.</p>
        <p><strong className="text-foreground">Stripe Connect Express</strong> — Each PPP contractor has their own Stripe Express account to receive payouts. Completely separate from billing.</p>
        <p><strong className="text-foreground">Wise</strong> — COR contractors receive international transfers. They set up bank details on first login. Recipient ID -1 means bank details saved but not yet synced to Wise.</p>
      </div>

      <OrgBillingSection orgs={data.orgs} onResendSetup={handleResendOrgSetup} />
      <ContractorConnectSection contractors={data.contractors} onResendConnect={handleResendConnect} />
      <WiseSection contractors={data.contractors} />
    </div>
  );
}

// Re-export data type so settings-dashboard can import it
export type { PaymentsSettingsData };
