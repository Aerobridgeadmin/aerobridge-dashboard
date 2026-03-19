"use client";

import Link from "next/link";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  active:      { label: "Active",      color: "text-green-700 dark:text-green-300",   bg: "bg-green-50 dark:bg-green-900/30" },
  pre_hire:    { label: "Pre-Hire",    color: "text-blue-700 dark:text-blue-300",     bg: "bg-blue-50 dark:bg-blue-900/30" },
  on_leave:    { label: "On Leave",    color: "text-amber-700 dark:text-amber-300",   bg: "bg-amber-50 dark:bg-amber-900/30" },
  terminated:  { label: "Terminated",  color: "text-red-700 dark:text-red-300",       bg: "bg-red-50 dark:bg-red-900/30" },
  suspended:   { label: "Suspended",   color: "text-orange-700 dark:text-orange-300", bg: "bg-orange-50 dark:bg-orange-900/30" },
};

const STRIPE_STATUS_MAP: Record<string, { label: string; color: string }> = {
  verified:   { label: "Connected",  color: "text-green-700 dark:text-green-300" },
  onboarding: { label: "Onboarding", color: "text-amber-700 dark:text-amber-300" },
  pending:    { label: "Pending",    color: "text-amber-700 dark:text-amber-300" },
  restricted: { label: "Restricted", color: "text-red-700 dark:text-red-300" },
  disabled:   { label: "Disabled",   color: "text-red-700 dark:text-red-300" },
};

type Props = {
  orgName: string;
  orgPaymentMethod: string | null;
  employee: {
    legalFirstName: string;
    legalLastName: string;
    preferredName: string | null;
    personalEmail: string | null;
    workEmail: string | null;
    jobTitle: string | null;
    department: string | null;
    employmentType: string;
    employmentStatus: string;
    hourlyRate: unknown;
    currency: string;
    timezone: string | null;
    startDate: Date | null;
    employeeNumber: string;
    stripeAccountId: string | null;
    stripeAccountStatus: string | null;
    wiseRecipientId: number | null;
    bankName: string | null;
    paymentPlatform: string | null;
  } | null;
  session: { email: string; name: string | null };
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b last:border-0 text-sm gap-4">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-medium text-right">{value ?? <span className="text-muted-foreground/50">—</span>}</span>
    </div>
  );
}

function Card({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="px-5 py-4 border-b">
        <h3 className="font-semibold text-sm">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

export function ContractorSettingsView({ orgName, orgPaymentMethod, employee, session }: Props) {
  if (!employee) {
    return (
      <div className="space-y-4 w-full">
        <div className="rounded-xl border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">Your contractor profile is still being set up.</p>
          <p className="text-xs text-muted-foreground mt-1">Contact your manager if this persists.</p>
        </div>
      </div>
    );
  }

  const displayName = employee.preferredName || employee.legalFirstName;
  const fullName = `${employee.legalFirstName} ${employee.legalLastName}`;
  const status = STATUS_CONFIG[employee.employmentStatus] ?? STATUS_CONFIG.pre_hire;

  const isPPP = orgPaymentMethod === "ppp" || orgPaymentMethod === "both";
  const isCOR = orgPaymentMethod === "cor" || orgPaymentMethod === "both";
  const stripeConnected = isPPP && !!employee.stripeAccountId;
  const stripeStatusInfo = employee.stripeAccountStatus ? STRIPE_STATUS_MAP[employee.stripeAccountStatus] : null;
  const wiseConnected = isCOR && employee.wiseRecipientId != null && employee.wiseRecipientId !== -1;
  const needsPaymentSetup = (isPPP && !stripeConnected) || (isCOR && !wiseConnected);

  return (
    <div className="space-y-4 w-full">
      <Card title="My Profile">
        <div className="flex items-center gap-4 pb-4 mb-2 border-b">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-semibold">{displayName} {employee.legalLastName}</p>
            <p className="text-xs text-muted-foreground">{employee.workEmail || employee.personalEmail || session.email}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${status.bg} ${status.color}`}>
                {status.label}
              </span>
              <span className="text-xs text-muted-foreground">{orgName}</span>
            </div>
          </div>
        </div>
        <Row label="Full Name" value={fullName} />
        <Row label="Employee #" value={employee.employeeNumber} />
        <Row label="Work Email" value={employee.workEmail} />
        <Row label="Personal Email" value={employee.personalEmail} />
        {employee.timezone && <Row label="Timezone" value={employee.timezone} />}
        <div className="mt-4 pt-3 border-t">
          <Link href="/profile" className="text-sm text-primary hover:underline">Edit full profile →</Link>
        </div>
      </Card>

      <Card title="Employment Details">
        <Row label="Role / Job Title" value={employee.jobTitle || employee.employmentType} />
        {employee.department && <Row label="Department" value={employee.department} />}
        <Row label="Employment Type" value={employee.employmentType.replace(/_/g, " ")} />
        <Row label="Status" value={
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${status.bg} ${status.color}`}>
            {status.label}
          </span>
        } />
        {employee.startDate && (
          <Row label="Start Date" value={new Date(employee.startDate as any).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} />
        )}
        {employee.hourlyRate != null && (
          <Row label="Pay Rate" value={`${String(employee.hourlyRate)} ${employee.currency}/hr`} />
        )}
        <Row label="Organization" value={orgName} />
      </Card>

      <Card title="Payment Setup">
        {!isPPP && !isCOR && (
          <p className="text-sm text-muted-foreground">Payment method not yet configured for your organization.</p>
        )}

        {isPPP && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium">Direct Pay (Stripe)</p>
              <span className={`text-xs font-medium ${stripeConnected ? (stripeStatusInfo?.color ?? "text-green-700 dark:text-green-300") : "text-amber-600 dark:text-amber-400"}`}>
                {stripeConnected ? (stripeStatusInfo?.label ?? "Connected") : "Not Set Up"}
              </span>
            </div>
            <div className={`rounded-lg border px-3 py-2 text-xs ${stripeConnected ? "bg-muted/40 text-muted-foreground" : "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300"}`}>
              {stripeConnected
                ? "Stripe Connect account active. Payments deposit directly to your linked bank."
                : "Direct pay not yet connected. Complete setup from your dashboard."}
            </div>
          </div>
        )}

        {isCOR && (
          <div className={isPPP ? "mt-4 pt-4 border-t" : ""}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium">International Pay (Wise)</p>
              <span className={`text-xs font-medium ${wiseConnected ? "text-green-700 dark:text-green-300" : "text-amber-600 dark:text-amber-400"}`}>
                {wiseConnected ? "Connected" : "Not Set Up"}
              </span>
            </div>
            <div className={`rounded-lg border px-3 py-2 text-xs ${wiseConnected ? "bg-muted/40 text-muted-foreground" : "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300"}`}>
              {wiseConnected
                ? `${employee.bankName ? `Bank: ${employee.bankName}. ` : ""}Payments transferred internationally via Wise.`
                : "International bank details not yet set up. Complete setup from your dashboard."}
            </div>
          </div>
        )}

        {needsPaymentSetup && (
          <div className="mt-4 pt-3 border-t">
            <Link href="/" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              Complete Payment Setup
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </Link>
          </div>
        )}
      </Card>
    </div>
  );
}
