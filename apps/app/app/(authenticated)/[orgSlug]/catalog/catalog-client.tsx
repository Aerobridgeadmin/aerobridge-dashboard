"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useErrorDialog } from "@/app/(authenticated)/components/error-dialog";
import { createCatalogCheckout, createCatalogSplititCheckout } from "@/app/actions/hriq/catalog-actions";

// ─── Service definitions ────────────────────────────────────────────────
// Add new services here — the page adapts automatically.

const PPP_JOTFORM_URL = "https://form.jotform.com/260197622868165";
const COR_JOTFORM_URL = "https://form.jotform.com/260197622868165";

type ServiceDef = {
  key: string;
  name: string;
  shortName: string;
  tagline: string;
  priceLabel: string;       // e.g. "$3,000"
  priceSuffix: string;      // e.g. "/VA/year"
  pricePerVA: number;
  color: string;
  icon: string;
  features: string[];
  matchAgreement: (name: string) => boolean;
  jotformUrl?: string;
};

const SERVICES: ServiceDef[] = [
  {
    key: "ppp",
    name: "Performance & Payroll",
    shortName: "PPP",
    tagline: "Your contractor, your team. We track their hours, process payroll on schedule, and manage all HR paperwork. You pay them directly via Stripe.",
    priceLabel: "$3,000",
    priceSuffix: "per VA per year",
    pricePerVA: 3000,
    color: "orange",
    icon: "P",
    features: [
      "Contractor works under your company",
      "Direct payments via Stripe Connect",
      "Time tracking and payroll processing",
      "HR and compliance documents managed",
    ],
    matchAgreement: (n) => {
      const l = n.toLowerCase();
      return l.includes("ppp") || l.includes("performance");
    },
    jotformUrl: PPP_JOTFORM_URL,
  },
  {
    key: "cor",
    name: "Contractor of Record",
    shortName: "COR",
    tagline: "We take on the contractor. They work under Remote Leverage, we handle all legal liability and compliance. You just pay us one simple invoice.",
    priceLabel: "$4,200",
    priceSuffix: "per VA per year",
    pricePerVA: 4200,
    color: "blue",
    icon: "C",
    features: [
      "Contractor works under Remote Leverage",
      "We handle all legal liability",
      "One invoice from us each pay period",
      "International contractor payments handled",
    ],
    matchAgreement: (n) => {
      const l = n.toLowerCase();
      return l.includes("cor") || l.includes("contractor of record");
    },
    jotformUrl: COR_JOTFORM_URL,
  },
];

// ─── Types ──────────────────────────────────────────────────────────────

type OrgProfile = {
  adminName: string | null;
  adminEmail: string | null;
  adminPhone: string | null;
  adminTitle: string | null;
  billingEmail: string | null;
  address: string | null;
  country: string | null;
} | null;

type OrgData = {
  id: string;
  name: string;
  slug: string;
  stripeCustomerId: string | null;
  profile: OrgProfile;
  serviceAgreements: {
    id: string; name: string; feeType: string; feeAmount: number;
    status: string; startDate: string; notes: string | null;
  }[];
  _count: { employees: number };
};

// ─── Helpers ────────────────────────────────────────────────────────────

function CheckIcon({ className = "h-4 w-4" }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>;
}
function ExternalIcon({ className = "h-4 w-4" }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>;
}

function buildPrefillUrl(svc: ServiceDef, org: OrgData): string {
  if (!svc.jotformUrl) return "#";
  const p = org.profile;
  const params = new URLSearchParams();
  if (p?.adminName) {
    const parts = p.adminName.split(" ");
    params.set("name[first]", parts[0] ?? "");
    params.set("name[last]", parts.slice(1).join(" ") ?? "");
  }
  if (org.name) params.set("officialBusiness", org.name);
  if (p?.adminTitle) params.set("title", p.adminTitle);
  if (p?.address) params.set("address[addr_line1]", p.address);
  if (p?.adminEmail || p?.billingEmail) params.set("email", p?.billingEmail ?? p?.adminEmail ?? "");
  if (p?.adminPhone) params.set("phoneNumber[full]", p.adminPhone);
  const today = new Date();
  params.set("date[month]", String(today.getMonth() + 1).padStart(2, "0"));
  params.set("date[day]", String(today.getDate()).padStart(2, "0"));
  params.set("date[year]", String(today.getFullYear()));
  return `${svc.jotformUrl}?${params.toString()}`;
}

const BADGE_COLORS: Record<string, string> = {
  orange: "bg-orange-500",
  blue: "bg-blue-500",
  purple: "bg-purple-500",
  green: "bg-green-500",
  teal: "bg-teal-500",
};

const ACCENT_COLORS: Record<string, { btn: string; btnHover: string; light: string; ring: string }> = {
  orange: { btn: "bg-orange-600", btnHover: "hover:bg-orange-700", light: "bg-orange-50 dark:bg-orange-950/20", ring: "ring-orange-500/30" },
  blue: { btn: "bg-blue-600", btnHover: "hover:bg-blue-700", light: "bg-blue-50 dark:bg-blue-950/20", ring: "ring-blue-500/30" },
  purple: { btn: "bg-purple-600", btnHover: "hover:bg-purple-700", light: "bg-purple-50 dark:bg-purple-950/20", ring: "ring-purple-500/30" },
  green: { btn: "bg-green-600", btnHover: "hover:bg-green-700", light: "bg-green-50 dark:bg-green-950/20", ring: "ring-green-500/30" },
  teal: { btn: "bg-teal-600", btnHover: "hover:bg-teal-700", light: "bg-teal-50 dark:bg-teal-950/20", ring: "ring-teal-500/30" },
};

// ─── Component ──────────────────────────────────────────────────────────

export function CatalogClient({ orgs, orgSlug }: { orgs: OrgData[]; orgSlug: string }) {
  const router = useRouter();
  const { showError, showSuccess } = useErrorDialog();
  const [isPending, startTransition] = useTransition();

  const [activeSvc, setActiveSvc] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Enrollment modal state
  const [enrollingOrg, setEnrollingOrg] = useState<OrgData | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<"pending" | "processing" | "splitit_processing" | "paid">("pending");
  const [paymentType, setPaymentType] = useState<"ach" | "cc" | "finance">("ach");
  const [installments, setInstallments] = useState(6);
  const [contractStatus, setContractStatus] = useState<"pending" | "sent" | "signed">("pending");

  const svc = SERVICES.find((s) => s.key === activeSvc);

  const filteredOrgs = search
    ? orgs.filter((o) => o.name.toLowerCase().includes(search.toLowerCase()))
    : orgs;

  function enrolledCount(s: ServiceDef) {
    return orgs.filter((o) => o.serviceAgreements.some((sa) => s.matchAgreement(sa.name))).length;
  }

  // ── Enrollment ──

  const openEnroll = (org: OrgData) => {
    if (!svc) return;
    const alreadyEnrolled = org.serviceAgreements.some((sa) => svc.matchAgreement(sa.name));
    setEnrollingOrg(org);
    setPaymentStatus(alreadyEnrolled ? "paid" : "pending");
    setContractStatus(alreadyEnrolled ? "signed" : "pending");
  };

  const closeEnroll = () => {
    setEnrollingOrg(null);
    setPaymentStatus("pending");
    setContractStatus("pending");
  };

  const handlePay = () => {
    if (!enrollingOrg || !svc) return;
    startTransition(async () => {
      try {
        if (paymentType === "finance") {
          const result = await createCatalogSplititCheckout(enrollingOrg.id, Math.max(enrollingOrg._count.employees, 1), svc.key, installments);
          if ("error" in result) { showError({ title: "Payment Error", message: result.error ?? "An error occurred" }); return; }
          window.location.href = (result as any).url;
        } else {
          const result = await createCatalogCheckout(enrollingOrg.id, Math.max(enrollingOrg._count.employees, 1), svc.key, paymentType);
          if ("error" in result) { showError({ title: "Payment Error", message: result.error ?? "An error occurred" }); return; }
          window.open((result as any).url, "_blank");
          setPaymentStatus("processing");
        }
      } catch (err) {
        showError({ title: "Payment Failed", message: err instanceof Error ? err.message : "Failed to create payment session." });
      }
    });
  };

  const confirmPayment = () => setPaymentStatus("paid");

  const handleSendContract = () => {
    if (!enrollingOrg || !svc) return;
    window.open(buildPrefillUrl(svc, enrollingOrg), "_blank");
    setContractStatus("sent");
  };

  const confirmContractAndEnroll = () => {
    if (!enrollingOrg || !svc) return;
    startTransition(async () => {
      try {
        const { upsertAgreement } = await import("@/app/actions/hriq/service-agreements");
        await upsertAgreement({
          organizationId: enrollingOrg.id,
          name: `${svc.name} (${svc.shortName})`,
          feeType: "per_contractor",
          feeAmount: svc.pricePerVA,
          billingCycle: "yearly",
          notes: `${svc.shortName} - ${svc.priceLabel} ${svc.priceSuffix}. ${svc.tagline}`,
        });
        setContractStatus("signed");
        showSuccess(`${enrollingOrg.name} is now enrolled in ${svc.shortName}.`);
        router.refresh();
      } catch (err) {
        showError({ title: "Enrollment Failed", message: err instanceof Error ? err.message : "Failed to save agreement." });
      }
    });
  };

  const isFullyEnrolled = paymentStatus === "paid" && contractStatus === "signed";

  return (
    <div className="space-y-8">

      {/* ── Hero ─────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Service Catalog</h1>
        <p className="text-muted-foreground mt-1">Pay, manage, and equip your global team with these solutions</p>
      </div>

      {/* ── Service Cards (Deel-style) ───────────────────────── */}
      <div className={`grid gap-5 ${SERVICES.length === 1 ? "grid-cols-1 max-w-md" : SERVICES.length === 2 ? "grid-cols-1 md:grid-cols-2" : SERVICES.length <= 4 ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-4" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"}`}>
        {SERVICES.map((s) => {
          const enrolled = enrolledCount(s);
          const isActive = activeSvc === s.key;
          const accent = ACCENT_COLORS[s.color] ?? ACCENT_COLORS.blue;
          return (
            <div
              key={s.key}
              className={`flex flex-col rounded-2xl border bg-card p-6 transition-all ${isActive ? `ring-2 ${accent.ring} shadow-lg` : "hover:shadow-md"}`}
            >
              {/* Badge + Title */}
              <div className="flex items-center gap-3 mb-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${BADGE_COLORS[s.color] ?? "bg-gray-500"} text-white text-lg font-bold`}>
                  {s.icon}
                </div>
                <div>
                  <h3 className="font-bold leading-tight">{s.name}</h3>
                  {enrolled > 0 && (
                    <span className="text-[10px] font-medium text-green-600 dark:text-green-400">{enrolled} org{enrolled !== 1 ? "s" : ""} enrolled</span>
                  )}
                </div>
              </div>

              {/* Tagline */}
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">{s.tagline}</p>

              {/* Price */}
              <div className="mb-4">
                <div className="text-xs text-muted-foreground mb-0.5">From</div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold">{s.priceLabel}</span>
                  <span className="text-sm text-muted-foreground">{s.priceSuffix}</span>
                </div>
              </div>

              {/* CTA */}
              <button
                type="button"
                onClick={() => setActiveSvc(isActive ? null : s.key)}
                className={`w-full h-10 rounded-lg text-sm font-semibold transition-colors mb-5 ${
                  isActive
                    ? "border-2 border-current bg-transparent hover:bg-accent"
                    : `${accent.btn} text-white ${accent.btnHover}`
                }`}
              >
                {isActive ? "Hide Organizations" : "View Organizations"}
              </button>

              {/* Features */}
              <div className="mt-auto space-y-2.5 pt-4 border-t">
                {s.features.map((f) => (
                  <div key={f} className="flex items-start gap-2">
                    <CheckIcon className="h-4 w-4 mt-0.5 shrink-0 text-green-500" />
                    <span className="text-sm text-muted-foreground leading-snug">{f}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Organization Table (shown when a service is selected) */}
      {svc && (
        <div className="animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-lg font-semibold">{svc.name} — Organizations</h2>
              <p className="text-xs text-muted-foreground">{enrolledCount(svc)} of {orgs.length} enrolled</p>
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search organizations..."
              className="flex h-9 w-64 rounded-md border border-input bg-background px-3 py-1 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="rounded-xl border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left text-sm text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Organization</th>
                    <th className="px-4 py-3 font-medium">VAs</th>
                    <th className="px-4 py-3 font-medium">Annual Cost</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrgs.map((org) => {
                    const isEnrolled = org.serviceAgreements.some((sa) => svc.matchAgreement(sa.name));
                    const vaCount = org._count.employees;
                    const annualCost = Math.max(vaCount, 1) * svc.pricePerVA;
                    const accent = ACCENT_COLORS[svc.color] ?? ACCENT_COLORS.blue;
                    return (
                      <tr key={org.id} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="px-4 py-3">
                          <Link href={`/${orgSlug}/organizations/${org.id}`} className="font-medium hover:underline">{org.name}</Link>
                          {org.profile?.adminName && <div className="text-xs text-muted-foreground">{org.profile.adminName}{org.profile.adminTitle ? `, ${org.profile.adminTitle}` : ""}</div>}
                        </td>
                        <td className="px-4 py-3 text-sm tabular-nums">{vaCount}</td>
                        <td className="px-4 py-3 text-sm font-medium tabular-nums">${annualCost.toLocaleString()}/yr</td>
                        <td className="px-4 py-3">
                          {isEnrolled ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 dark:bg-green-900 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:text-green-200">
                              <CheckIcon className="h-3 w-3" /> Active
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full bg-gray-100 dark:bg-gray-800 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:text-gray-400">Not Enrolled</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => openEnroll(org)}
                            className={`inline-flex h-8 items-center rounded-md px-3 text-xs font-medium ${isEnrolled ? "border hover:bg-accent" : `${accent.btn} text-white ${accent.btnHover}`}`}
                          >
                            {isEnrolled ? "Manage" : "Enroll"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredOrgs.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No organizations found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Enrollment Modal (simplified — yearly, keep it light) ── */}
      {enrollingOrg && svc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-xl animate-in fade-in slide-in-from-bottom-2 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>

            {/* Header */}
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-bold">{enrollingOrg.name}</h2>
              <button onClick={closeEnroll} className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-muted text-lg">&times;</button>
            </div>
            <p className="text-sm text-muted-foreground mb-5">Enroll in {svc.name}</p>

            {/* Already enrolled */}
            {isFullyEnrolled && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-4">
                  <CheckIcon className="h-5 w-5 text-green-600 shrink-0" />
                  <div>
                    <div className="text-sm font-semibold text-green-800 dark:text-green-200">Enrolled in {svc.shortName}</div>
                    <p className="text-xs text-green-700 dark:text-green-300">Payment complete. Contract signed.</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {svc.jotformUrl && (
                    <a href={buildPrefillUrl(svc, enrollingOrg)} target="_blank" rel="noopener noreferrer" className="flex-1 inline-flex h-9 items-center justify-center gap-1.5 rounded-md border text-xs font-medium hover:bg-accent">
                      <ExternalIcon className="h-3.5 w-3.5" /> View Contract
                    </a>
                  )}
                  <Link href={`/${orgSlug}/organizations/${enrollingOrg.id}`} onClick={closeEnroll} className="flex-1 inline-flex h-9 items-center justify-center gap-1.5 rounded-md border text-xs font-medium hover:bg-accent">
                    Org Details
                  </Link>
                </div>
                <button type="button" onClick={closeEnroll} className="w-full h-9 rounded-md border text-sm font-medium hover:bg-accent">Close</button>
              </div>
            )}

            {/* Not enrolled — simplified 2-step */}
            {!isFullyEnrolled && (
              <div className="space-y-4">

                {/* Quick summary */}
                <div className="rounded-xl bg-muted/50 p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Service</span>
                    <span className="font-medium">{svc.name}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Contractors</span>
                    <span className="font-medium">{Math.max(enrollingOrg._count.employees, 1)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Rate</span>
                    <span className="font-medium">{svc.priceLabel} {svc.priceSuffix}</span>
                  </div>
                  <div className="flex justify-between text-sm pt-2 border-t font-bold">
                    <span>Annual total</span>
                    <span>${(Math.max(enrollingOrg._count.employees, 1) * svc.pricePerVA).toLocaleString()}</span>
                  </div>
                </div>

                {/* Step 1: Payment */}
                <div className={`rounded-xl border p-4 ${paymentStatus === "paid" ? "border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/10" : ""}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${paymentStatus === "paid" ? "bg-green-500 text-white" : "bg-muted text-muted-foreground"}`}>
                      {paymentStatus === "paid" ? <CheckIcon className="h-3 w-3" /> : "1"}
                    </div>
                    <h3 className="font-semibold text-sm">Payment</h3>
                  </div>

                  {paymentStatus === "pending" && (() => {
                    const vaCount = Math.max(enrollingOrg._count.employees, 1);
                    const baseTotal = vaCount * svc.pricePerVA;
                    const ccFee = Math.round(baseTotal * 0.03 * 100) / 100;
                    const financingFee = Math.round(baseTotal * 0.10 * 100) / 100;
                    return (
                      <div className="space-y-3">
                        {/* Payment type selector */}
                        <div className="space-y-2">
                          {[
                            { key: "ach", label: "ACH / Debit", sub: "No processing fee", badge: null },
                            { key: "cc", label: "Credit Card", sub: `+3% card fee (+$${ccFee.toLocaleString()})`, badge: `$${(baseTotal + ccFee).toLocaleString()}` },
                            { key: "finance", label: "Finance with Splitit", sub: `1st installment of ~$${Math.round((baseTotal * 1.1) / installments).toLocaleString()} due today. ${installments} payments total ($${Math.round(baseTotal * 1.1).toLocaleString()} incl. 10% fee)`, badge: `$${Math.round((baseTotal * 1.1) / installments).toLocaleString()} due today` },
                          ].map(({ key, label, sub, badge }) => (
                            <label key={key} className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${paymentType === key ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}>
                              <input type="radio" name="catalogPaymentType" value={key} checked={paymentType === key} onChange={() => setPaymentType(key as any)} className="mt-0.5 accent-primary" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-sm font-medium">{label}</span>
                                  {badge && <span className="text-xs font-semibold text-primary shrink-0">{badge}</span>}
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
                              </div>
                            </label>
                          ))}
                        </div>
                        {paymentType === "finance" && (
                          <div className="flex gap-2">
                            {[3, 6].map(n => (
                              <button key={n} type="button" onClick={() => setInstallments(n)} className={`flex-1 h-8 rounded-md text-xs font-semibold border transition-colors ${installments === n ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}>
                                {n}mo
                              </button>
                            ))}
                          </div>
                        )}
                        <button type="button" disabled={isPending} onClick={handlePay} className="w-full h-10 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">
                          {isPending ? "Creating..." : paymentType === "finance" ? `Finance $${Math.round(baseTotal * 1.1).toLocaleString()} — 1st Payment Due Today` : paymentType === "cc" ? `Pay $${(baseTotal + ccFee).toLocaleString()} by Card` : `Pay $${baseTotal.toLocaleString()} by ACH`}
                        </button>
                      </div>
                    );
                  })()}
                  {paymentStatus === "processing" && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
                        <div className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                        Checkout opened — click below once payment is complete.
                      </div>
                      <button type="button" onClick={confirmPayment} className="w-full h-9 rounded-md border text-sm font-medium hover:bg-accent">
                        Payment completed
                      </button>
                    </div>
                  )}
                  {paymentStatus === "splitit_processing" && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
                        <div className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                        Splitit checkout opened — click below once your installment plan is set up.
                      </div>
                      <button type="button" onClick={confirmPayment} className="w-full h-9 rounded-md border text-sm font-medium hover:bg-accent">
                        I've completed Splitit setup
                      </button>
                    </div>
                  )}
                  {paymentStatus === "paid" && (
                    <p className="text-xs text-green-700 dark:text-green-300 font-medium">Payment confirmed</p>
                  )}
                </div>

                {/* Step 2: Contract (only after payment) */}
                {paymentStatus === "paid" && (
                  <div className={`rounded-xl border p-4 ${contractStatus === "signed" ? "border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/10" : ""}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${contractStatus === "signed" ? "bg-green-500 text-white" : "bg-muted text-muted-foreground"}`}>
                        {contractStatus === "signed" ? <CheckIcon className="h-3 w-3" /> : "2"}
                      </div>
                      <h3 className="font-semibold text-sm">Service Agreement</h3>
                    </div>

                    {contractStatus === "pending" && (
                      <>
                        <p className="text-xs text-muted-foreground mb-3">Opens a pre-filled contract for the client to review and sign.</p>
                        <button type="button" onClick={handleSendContract} className={`w-full h-10 rounded-lg ${(ACCENT_COLORS[svc.color] ?? ACCENT_COLORS.blue).btn} text-white text-sm font-semibold ${(ACCENT_COLORS[svc.color] ?? ACCENT_COLORS.blue).btnHover} flex items-center justify-center gap-2`}>
                          <ExternalIcon className="h-4 w-4" /> Open Contract
                        </button>
                      </>
                    )}
                    {contractStatus === "sent" && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
                          <div className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                          Waiting for signature...
                        </div>
                        <div className="flex gap-2">
                          <button type="button" onClick={handleSendContract} className="flex-1 h-9 rounded-md border text-xs font-medium hover:bg-accent">Reopen</button>
                          <button type="button" disabled={isPending} onClick={confirmContractAndEnroll} className="flex-1 h-9 rounded-md bg-green-600 text-white text-xs font-semibold hover:bg-green-700 disabled:opacity-50">
                            {isPending ? "Saving..." : "Signed — enroll"}
                          </button>
                        </div>
                      </div>
                    )}
                    {contractStatus === "signed" && (
                      <p className="text-xs text-green-700 dark:text-green-300 font-medium">Contract signed</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
