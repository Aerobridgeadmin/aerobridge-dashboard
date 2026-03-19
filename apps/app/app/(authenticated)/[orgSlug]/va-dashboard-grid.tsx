"use client";



import { useParams } from "next/navigation";

import Link from "next/link";
import { shortDate } from "@/lib/hriq/format";
import { useCallback } from "react";
import { CustomizableDashboard, type WidgetDef } from "../components/customizable-dashboard";
import { WelcomeBanner } from "../components/welcome-banner";
import { ClockIcon, CreditCardIcon, MegaphoneIcon, UserIcon, ClipboardListIcon, CalendarIcon } from "lucide-react";

//  Types 
type TimesheetRow = { id: string; status: string; totalHours: unknown; submittedAt: string | null; period: { name: string } };
type PaymentRow = { id: string; amount: string; currency: string; status: string; paymentType: string; paymentDate: string | null };

export type VADashboardData = {
  firstName: string;
  preferredName: string | null;
  photoUrl: string | null;
  jobTitle: string | null;
  employmentType: string;
  department: string | null;
  employmentStatus: string;
  organizationName: string | null;
  totalHoursAllTime: number;
  totalPaid: number;
  pendingPay: number;
  // Onboarding
  onboardingProgress: number | null;
  onboardingStepsRemaining: number;
  // Timesheet CTA
  openPeriodName: string | null;
  openPeriodRange: string | null;
  currentSubmissionStatus: string | null;
  currentSubmissionHours: number | null;
  // Lists
  recentTimesheets: TimesheetRow[];
  recentPayments: PaymentRow[];
};

//  Widget definitions 
const WIDGETS: WidgetDef[] = [
  { id: "welcome", label: "Welcome Card", description: "Profile photo, name, role", size: "full" },
  { id: "onboarding", label: "Onboarding Progress", description: "Onboarding status banner", size: "full" },
  { id: "timesheet_cta", label: "Current Timesheet", description: "Submit hours / current period status", size: "full" },
  { id: "stats", label: "Stats", description: "Total hours, paid, pending, status", size: "full" },
  { id: "recent_timesheets", label: "Recent Timesheets", description: "Latest timesheet submissions", size: "half" },
  { id: "recent_payments", label: "Recent Payments", description: "Latest payment records", size: "half" },
  { id: "quick_links", label: "Quick Links", description: "Navigation shortcuts", size: "full" },
];

const DEFAULT_ORDER = WIDGETS.map((w) => w.id);

const STATUS_COLORS: Record<string, string> = {
  submitted: "text-blue-600 bg-blue-100 dark:bg-blue-900 dark:text-blue-300",
  approved: "text-green-600 bg-green-100 dark:bg-green-900/50 dark:text-green-300",
  rejected: "text-red-600 bg-red-100 dark:bg-red-900/50 dark:text-red-300",
};

//  Main component 
export function VADashboardGrid({ data }: { data: VADashboardData }) {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const renderWidget = useCallback((id: string) => {
    switch (id) {
      case "welcome": return <WelcomeWidget data={data} />;
      case "onboarding": return data.onboardingProgress !== null ? <OnboardingWidget data={data} /> : null;
      case "timesheet_cta": return <TimesheetCTAWidget data={data} />;
      case "stats": return <StatsWidget data={data} />;
      case "recent_timesheets": return <RecentTimesheetsWidget timesheets={data.recentTimesheets} />;
      case "recent_payments": return <RecentPaymentsWidget payments={data.recentPayments} />;
      case "quick_links": return <QuickLinksWidget />;
      default: return null;
    }
  }, [data]);

  return (
    <>
      <WelcomeBanner userName={data.preferredName ?? data.firstName} role="member" orgName={data.organizationName ?? undefined} />
      <CustomizableDashboard
        storageKey="va_dashboard_widgets"
        widgets={WIDGETS}
        defaultOrder={DEFAULT_ORDER}
        renderWidget={renderWidget}
      />
    </>
  );
}

//  Widgets 

function WelcomeWidget({ data }: { data: VADashboardData }) {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center gap-4">
        {data.photoUrl && !data.photoUrl.endsWith("/logo.png") ? (
          <img src={data.photoUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white dark:bg-white/90 p-1">
            <img src="/logo.png" alt="RL" className="h-full w-full object-contain" />
          </div>
        )}
        <div className="flex-1">
          <h2 className="text-xl font-semibold">Welcome back, {data.preferredName ?? data.firstName}</h2>
          <p className="text-sm text-muted-foreground">
            {data.jobTitle ?? data.employmentType} · {data.organizationName ?? data.department ?? "No department"}
          </p>
        </div>
      </div>
    </div>
  );
}

function OnboardingWidget({ data }: { data: VADashboardData }) {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-blue-900 dark:text-blue-100">Onboarding In Progress</h3>
          <p className="text-sm text-blue-700 dark:text-blue-300">
            {data.onboardingProgress}% complete — {data.onboardingStepsRemaining} steps remaining
          </p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-full border-4 border-blue-300 text-sm font-bold text-blue-700 dark:border-blue-700 dark:text-blue-300">
          {data.onboardingProgress}%
        </div>
      </div>
    </div>
  );
}

function TimesheetCTAWidget({ data }: { data: VADashboardData }) {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const hasSubmission = !!data.currentSubmissionStatus;
  const isApproved = data.currentSubmissionStatus === "approved";

  return (
    <div className={`rounded-xl border p-5 ${
      !hasSubmission && data.openPeriodName
        ? "border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 dark:border-amber-900 dark:from-amber-950/30 dark:to-orange-950/20"
        : isApproved
          ? "border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20"
          : "bg-card"
    }`}>
      <div className="flex items-center justify-between">
        <div>
          {data.openPeriodName ? (
            <>
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Current Period</div>
              <div className="mt-1 text-lg font-semibold">{data.openPeriodName}</div>
              {data.openPeriodRange && <div className="text-sm text-muted-foreground">{data.openPeriodRange}</div>}
              {hasSubmission ? (
                <div className="mt-2 flex items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_COLORS[data.currentSubmissionStatus!] ?? "bg-muted"}`}>
                    {data.currentSubmissionStatus === "submitted" ? "Pending Review" : data.currentSubmissionStatus}
                  </span>
                  <span className="text-sm font-medium tabular-nums">{data.currentSubmissionHours}h logged</span>
                </div>
              ) : (
                <div className="mt-2 text-sm font-medium text-amber-700 dark:text-amber-300">
                  You haven&apos;t submitted your timesheet yet
                </div>
              )}
            </>
          ) : (
            <>
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Timesheets</div>
              <div className="mt-1 text-lg font-semibold">No open pay period</div>
              <div className="text-sm text-muted-foreground">Check back when a new period opens</div>
            </>
          )}
        </div>
        <Link
          href={`/${orgSlug}/timesheets`}
          className={`h-10 rounded-lg px-5 text-sm font-semibold flex items-center gap-2 transition-colors ${
            !hasSubmission && data.openPeriodName
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "border bg-card hover:bg-muted"
          }`}
        >
          <ClockIcon className="h-4 w-4" />
          {!hasSubmission && data.openPeriodName ? "Submit Hours" : "View Timesheets"}
        </Link>
      </div>
    </div>
  );
}

function StatsWidget({ data }: { data: VADashboardData }) {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className="rounded-xl border bg-card p-4 text-center">
        <div className="text-2xl font-bold tabular-nums">{data.totalHoursAllTime}h</div>
        <div className="text-[10px] font-medium text-muted-foreground uppercase">Total Hours</div>
      </div>
      <div className="rounded-xl border bg-card p-4 text-center">
        <div className="text-2xl font-bold tabular-nums text-green-600">${data.totalPaid.toLocaleString("en-US")}</div>
        <div className="text-[10px] font-medium text-muted-foreground uppercase">Total Paid</div>
      </div>
      <div className="rounded-xl border bg-card p-4 text-center">
        <div className="text-2xl font-bold tabular-nums text-amber-600">${data.pendingPay.toLocaleString("en-US")}</div>
        <div className="text-[10px] font-medium text-muted-foreground uppercase">Pending Pay</div>
      </div>
      <div className="rounded-xl border bg-card p-4 text-center">
        <div className="text-2xl font-bold capitalize">{data.employmentStatus.replace(/_/g, " ")}</div>
        <div className="text-[10px] font-medium text-muted-foreground uppercase">Status</div>
      </div>
    </div>
  );
}

function RecentTimesheetsWidget({ timesheets }: { timesheets: TimesheetRow[] }) {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">Recent Timesheets</h3>
        <Link href={`/${orgSlug}/timesheets`} className="text-xs text-primary hover:underline">View all</Link>
      </div>
      <div className="space-y-2">
        {timesheets.slice(0, 4).map((ts) => (
          <div key={ts.id} className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <div className="text-sm font-medium">{ts.period.name}</div>
              <div className="text-xs text-muted-foreground">
                {Number(ts.totalHours)}h · {ts.submittedAt ? shortDate(ts.submittedAt) : "Draft"}
              </div>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${STATUS_COLORS[ts.status] ?? "bg-muted text-muted-foreground"}`}>
              {ts.status === "submitted" ? "pending" : ts.status}
            </span>
          </div>
        ))}
        {timesheets.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No timesheets yet. Submit your first one above!</p>}
      </div>
    </div>
  );
}

function RecentPaymentsWidget({ payments }: { payments: PaymentRow[] }) {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">Recent Payments</h3>
        <Link href={`/${orgSlug}/payments`} className="text-xs text-primary hover:underline">View all</Link>
      </div>
      <div className="space-y-2">
        {payments.map((p) => (
          <div key={p.id} className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <div className="text-sm font-medium">${Number(p.amount).toLocaleString("en-US")} {p.currency}</div>
              <div className="text-xs text-muted-foreground capitalize">
                {p.paymentType} · {p.paymentDate ? shortDate(p.paymentDate) : "Pending"}
              </div>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${
              p.status === "completed" ? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300" : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300"
            }`}>{p.status}</span>
          </div>
        ))}
        {payments.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No payment records yet.</p>}
      </div>
    </div>
  );
}

function QuickLinksWidget() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
      <Link href={`/${orgSlug}/timesheets`} className="rounded-xl border bg-card p-4 text-center transition-colors hover:bg-muted/50">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400"><ClockIcon className="h-5 w-5" /></div>
        <div className="mt-2 text-sm font-medium">Timesheets</div>
      </Link>
      <Link href={`/${orgSlug}/tasks`} className="rounded-xl border bg-card p-4 text-center transition-colors hover:bg-muted/50">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400"><ClipboardListIcon className="h-5 w-5" /></div>
        <div className="mt-2 text-sm font-medium">Tasks</div>
      </Link>
      <Link href={`/${orgSlug}/time-off`} className="rounded-xl border bg-card p-4 text-center transition-colors hover:bg-muted/50">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400"><CalendarIcon className="h-5 w-5" /></div>
        <div className="mt-2 text-sm font-medium">Time Off</div>
      </Link>
      <Link href={`/${orgSlug}/payments`} className="rounded-xl border bg-card p-4 text-center transition-colors hover:bg-muted/50">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400"><CreditCardIcon className="h-5 w-5" /></div>
        <div className="mt-2 text-sm font-medium">Payments</div>
      </Link>
      <Link href="/profile" className="rounded-xl border bg-card p-4 text-center transition-colors hover:bg-muted/50">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-teal-100 text-teal-600 dark:bg-teal-900/40 dark:text-teal-400"><UserIcon className="h-5 w-5" /></div>
        <div className="mt-2 text-sm font-medium">My Profile</div>
      </Link>
    </div>
  );
}
