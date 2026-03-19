"use client";

import { CustomSelect } from "@/app/(authenticated)/components/custom-select";
import { SearchableSelect } from "@/app/(authenticated)/components/searchable-select";
import { COUNTRY_OPTIONS } from "@/lib/hriq/country-options";

import Link from "next/link";
import { shortDate } from "@/lib/hriq/format";
import { useState, useTransition } from "react";
import { useErrorDialog } from "@/app/(authenticated)/components/error-dialog";
import { updateClientAdminProfile, updateOrgBillingPreferences } from "@/app/actions/hriq/contractor-self-service";
import { useRouter } from "next/navigation";

const PLAN_LABELS: Record<string, string> = { ppp: "PPP", cor: "COR", both: "PPP + COR" };
const PLAN_DESC: Record<string, string> = {
  ppp: "Payroll Processing & Payment — direct Stripe payouts to contractors",
  cor: "Contractor of Record — international payroll via Wise",
  both: "Full service — Stripe payouts + international Wise transfers",
};
const TERMS_LABELS: Record<string, string> = {
  net_30: "Net 30", net_15: "Net 15", net_7: "Net 7", due_on_receipt: "Due on Receipt",
};
const KYC_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending:   { label: "Not Started",  color: "text-gray-600 dark:text-gray-300",     bg: "bg-gray-100 dark:bg-gray-800" },
  submitted: { label: "Under Review", color: "text-blue-700 dark:text-blue-300",    bg: "bg-blue-50 dark:bg-blue-900/30" },
  approved:  { label: "Verified",     color: "text-green-700 dark:text-green-300",   bg: "bg-green-50 dark:bg-green-900/30" },
  declined:  { label: "Declined",     color: "text-red-700 dark:text-red-300",       bg: "bg-red-50 dark:bg-red-900/30" },
  expired:   { label: "Expired",      color: "text-orange-700 dark:text-orange-300", bg: "bg-orange-50 dark:bg-orange-900/30" },
};

type Props = {
  orgName: string;
  orgCreatedAt: string;
  profile: {
    planType: string | null;
    paymentMethod: string | null;
    vaSeats: number | null;
    kycStatus: string | null;
    kycVerifiedAt: string | null;
    billingEmail: string | null;
    billingMethod: string | null;
    paymentTerms: string | null;
    adminName: string | null;
    adminEmail: string | null;
    adminPhone: string | null;
    adminTitle: string | null;
    country: string | null;
    address: string | null;
    website: string | null;
    industry: string | null;
  } | null;
  employeeCount: number;
  session: { email: string; userId: string; name: string | null };
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b last:border-0 text-sm gap-4">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-medium text-right">{value ?? "—"}</span>
    </div>
  );
}

function Card({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b">
        <h3 className="font-semibold text-sm">{title}</h3>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

export function ClientAdminSettingsView({ orgName, orgCreatedAt, profile, employeeCount, session }: Props) {
  const [tab, setTab] = useState<"overview" | "account">("overview");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    adminName: profile?.adminName ?? "",
    adminPhone: profile?.adminPhone ?? "",
    adminTitle: profile?.adminTitle ?? "",
    address: profile?.address ?? "",
    country: profile?.country ?? "",
  });
  const [billingForm, setBillingForm] = useState({
    billingEmail: profile?.billingEmail ?? "",
    billingMethod: profile?.billingMethod ?? "ach",
    paymentTerms: profile?.paymentTerms ?? "net_30",
  });
  const [billingEditing, setBillingEditing] = useState(false);
  const [billingPending, startBillingTransition] = useTransition();
  const [isPending, startTransition] = useTransition();
  const { showError, showSuccess } = useErrorDialog();
  const router = useRouter();

  const plan = profile?.planType || profile?.paymentMethod || "ppp";
  const kycStatus = profile?.kycStatus || "pending";
  const kyc = KYC_CONFIG[kycStatus] ?? KYC_CONFIG.pending;
  const seatsUsed = employeeCount;
  const seatsTotal = profile?.vaSeats;

  const handleSave = () => {
    startTransition(async () => {
      try {
        await updateClientAdminProfile(form);
        showSuccess("Profile updated.");
        setEditing(false);
        router.refresh();
      } catch (e) {
        showError({ title: "Error", message: e instanceof Error ? e.message : "Failed to save." });
      }
    });
  };

  const handleBillingSave = () => {
    startBillingTransition(async () => {
      try {
        await updateOrgBillingPreferences(billingForm);
        showSuccess("Billing preferences updated.");
        setBillingEditing(false);
        router.refresh();
      } catch (e) {
        showError({ title: "Billing Error", message: e instanceof Error ? e.message : "Failed to save." });
      }
    });
  };

  return (
    <div className="space-y-6 w-full">
      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        {[{ key: "overview" as const, label: "Overview" }, { key: "account" as const, label: "My Account" }].map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${tab === t.key ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Overview ─────────────────────────────── */}
      {tab === "overview" && (
        <div className="space-y-4">
          {/* KYC alert */}
          {kycStatus !== "approved" && (
            <div className={`flex items-start gap-3 rounded-xl border p-4 ${kyc.bg}`}>
              <svg className={`h-5 w-5 mt-0.5 shrink-0 ${kyc.color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              <div className="flex-1">
                <p className={`text-sm font-semibold ${kyc.color}`}>Identity Verification: {kyc.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {kycStatus === "pending" && "Complete identity verification to unlock full platform access."}
                  {kycStatus === "submitted" && "Your verification is being reviewed. This usually takes a few minutes."}
                  {kycStatus === "declined" && "Verification was declined. Contact your Remote Leverage coordinator."}
                  {kycStatus === "expired" && "Your verification session expired. Please restart the process."}
                </p>
              </div>
            </div>
          )}

          {/* Plan card */}
          <Card title="Your Plan">
            <div className="flex items-start gap-4 rounded-lg bg-muted/40 border p-4 mb-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <svg className="h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-sm">{PLAN_LABELS[plan] ?? plan.toUpperCase()} Plan</p>
                <p className="text-xs text-muted-foreground mt-0.5">{PLAN_DESC[plan] ?? "Custom arrangement"}</p>
              </div>
            </div>
            {seatsTotal != null && (
              <div className="mb-4">
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                  <span>VA Seats Used</span>
                  <span>{seatsUsed} / {seatsTotal}</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${seatsUsed >= seatsTotal ? "bg-red-500" : seatsUsed >= seatsTotal - 1 ? "bg-amber-400" : "bg-primary"}`}
                    style={{ width: `${Math.min(100, (seatsUsed / seatsTotal) * 100)}%` }}
                  />
                </div>
              </div>
            )}
            <div>
              <Row label="Payment Method" value={PLAN_LABELS[plan] ?? plan} />
              <Row label="Billing Terms" value={TERMS_LABELS[profile?.paymentTerms ?? "net_30"] ?? profile?.paymentTerms} />
              {profile?.billingEmail && <Row label="Billing Email" value={profile.billingEmail} />}
              {seatsTotal != null && <Row label="Contractors" value={`${seatsUsed} active`} />}
            </div>
          </Card>

          {/* Organisation */}
          <Card title="Organization">
            <Row label="Company" value={orgName} />
            {profile?.industry && <Row label="Industry" value={profile.industry} />}
            {profile?.website && (
              <Row label="Website" value={
                <a href={profile.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate max-w-[200px] block">{profile.website}</a>
              } />
            )}
            <Row label="Member Since" value={new Date(orgCreatedAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })} />
          </Card>

          {/* Billing Preferences */}
          <Card
            title="Billing Preferences"
            action={
              billingEditing ? (
                <div className="flex gap-2">
                  <button type="button"
                    onClick={() => { setBillingEditing(false); setBillingForm({ billingEmail: profile?.billingEmail ?? "", billingMethod: profile?.billingMethod ?? "ach", paymentTerms: profile?.paymentTerms ?? "net_30" }); }}
                    className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border">Cancel</button>
                  <button type="button" onClick={handleBillingSave} disabled={billingPending}
                    className="text-xs px-3 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">{billingPending ? "Saving…" : "Save"}</button>
                </div>
              ) : (
                <button type="button" onClick={() => setBillingEditing(true)} className="text-xs text-primary hover:underline">Edit</button>
              )
            }
          >
            {billingEditing ? (
              <div className="space-y-4">
                {/* Payment Method */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-2">
                    Payment Method
                    {(plan === "cor" || plan === "both") && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-2 py-0.5 text-[10px] font-medium">ACH required for COR</span>
                    )}
                  </label>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {([
                      { value: "ach",         label: "ACH / Bank Transfer", desc: "Direct bank debit — required for COR" },
                      { value: "credit_card", label: "Credit Card",          desc: "Card on file via Stripe" },
                      { value: "wire",        label: "Wire Transfer",        desc: "International wire" },
                    ] as const).map(({ value, label, desc }) => {
                      const locked = (plan === "cor" || plan === "both") && value !== "ach";
                      return (
                        <button
                          key={value}
                          type="button"
                          disabled={locked}
                          onClick={() => !locked && setBillingForm(f => ({ ...f, billingMethod: value }))}
                          className={`rounded-lg border p-3 text-left transition-colors ${billingForm.billingMethod === value ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50"} ${locked ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
                        >
                          <p className="text-sm font-medium">{label}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                          {locked && <p className="text-[10px] text-amber-600 mt-1">Not available for COR</p>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Payment Terms */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Payment Terms</label>
                  <CustomSelect
                    value={billingForm.paymentTerms}
                    onValueChange={(v) => setBillingForm(f => ({ ...f, paymentTerms: v }))}
                    triggerClassName="h-9 w-full"
                    placeholder="Select..."
                    options={[
                      { value: "net_30", label: "Net 30" },
                      { value: "net_15", label: "Net 15" },
                      { value: "net_7", label: "Net 7" },
                      { value: "due_on_receipt", label: "Due on Receipt" },
                    ]}
                  />
                </div>

                {/* Billing Email */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Billing Email</label>
                  <input
                    type="email"
                    value={billingForm.billingEmail}
                    onChange={(e) => setBillingForm(f => ({ ...f, billingEmail: e.target.value }))}
                    placeholder="billing@yourcompany.com"
                    className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Invoices and payment reminders are sent to this address.</p>
                </div>
              </div>
            ) : (
              <div>
                <Row label="Payment Method" value={
                  <span className="flex items-center gap-1.5">
                    {billingForm.billingMethod === "ach"         && "ACH / Bank Transfer"}
                    {billingForm.billingMethod === "credit_card" && "Credit Card"}
                    {billingForm.billingMethod === "wire"        && "Wire Transfer"}
                    {!billingForm.billingMethod                  && "—"}
                    {(plan === "cor" || plan === "both") && (
                      <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-2 py-0.5 text-[10px] font-medium">Required for COR</span>
                    )}
                  </span>
                } />
                <Row label="Payment Terms" value={TERMS_LABELS[billingForm.paymentTerms] ?? billingForm.paymentTerms} />
                <Row label="Billing Email" value={billingForm.billingEmail || "—"} />
              </div>
            )}
          </Card>

          {/* Identity Verification */}
          <Card title="Identity Verification (KYC)">
            <Row label="Status" value={
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${kyc.bg} ${kyc.color}`}>{kyc.label}</span>
            } />
            {profile?.kycVerifiedAt && <Row label="Verified On" value={shortDate(profile.kycVerifiedAt)} />}
            {kycStatus !== "approved" && (
              <div className="mt-4 pt-3 border-t">
                <Link href="/kyc-gate" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                  {kycStatus === "pending" ? "Start Verification" : kycStatus === "submitted" ? "Check Status" : "Restart Verification"}
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                </Link>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ── My Account ────────────────────────────── */}
      {tab === "account" && (
        <div className="space-y-4">
          <Card
            title="Personal Information"
            action={
              editing ? (
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setEditing(false); setForm({ adminName: profile?.adminName ?? "", adminPhone: profile?.adminPhone ?? "", adminTitle: profile?.adminTitle ?? "", address: profile?.address ?? "", country: profile?.country ?? "" }); }}
                    className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border">Cancel</button>
                  <button type="button" onClick={handleSave} disabled={isPending}
                    className="text-xs px-3 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">{isPending ? "Saving…" : "Save"}</button>
                </div>
              ) : (
                <button type="button" onClick={() => setEditing(true)} className="text-xs text-primary hover:underline">Edit</button>
              )
            }
          >
            {/* Avatar header */}
            <div className="flex items-center gap-4 pb-4 mb-2 border-b">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
                {(profile?.adminName ?? session.email ?? "?").charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-semibold">{profile?.adminName || session.name || "—"}</p>
                <p className="text-xs text-muted-foreground">{profile?.adminEmail || session.email}</p>
                <span className="inline-flex mt-1 items-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 px-2 py-0.5 text-[10px] font-medium">Client Admin · {orgName}</span>
              </div>
            </div>

            {editing ? (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  {([
                    { label: "Full Name", key: "adminName", placeholder: "Your name" },
                    { label: "Phone Number", key: "adminPhone", placeholder: "+1 (555) 123-4567" },
                    { label: "Job Title", key: "adminTitle", placeholder: "e.g., Operations Manager" },
                  ] as const).map(({ label, key, placeholder }) => (
                    <div key={key}>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
                      <input type="text" value={form[key]}
                        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                        placeholder={placeholder}
                        className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                    </div>
                  ))}
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Country</label>
                    <SearchableSelect value={form.country} onValueChange={(v) => setForm((f) => ({ ...f, country: v }))} placeholder="Select country..." triggerClassName="h-9 w-full" options={[...COUNTRY_OPTIONS]} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Address</label>
                    <input type="text" value={form.address}
                      onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                      placeholder="123 Main St"
                      className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                  Email cannot be changed here. Contact your Remote Leverage coordinator to update your login credentials.
                </div>
              </div>
            ) : (
              <div>
                <Row label="Full Name" value={profile?.adminName || "—"} />
                <Row label="Email" value={profile?.adminEmail || session.email} />
                <Row label="Phone" value={profile?.adminPhone} />
                <Row label="Title" value={profile?.adminTitle} />
                {profile?.address && <Row label="Address" value={profile.address} />}
                {profile?.country && <Row label="Country" value={profile.country} />}
              </div>
            )}
          </Card>

          <Card title="Role & Access">
            <Row label="Role" value={<span className="inline-flex items-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 px-2.5 py-0.5 text-xs font-medium">Client Admin</span>} />
            <Row label="Organization" value={orgName} />
            <Row label="Login" value={profile?.adminEmail || session.email} />
            <div className="pt-3 mt-1 border-t">
              <p className="text-xs text-muted-foreground">To change your login credentials or reset your password, contact your Remote Leverage coordinator.</p>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
