import { requireOrg, getSessionContext } from "@repo/auth/session";
import { database } from "@repo/database";
import { shortDate } from "@/lib/hriq/format";
import type { RLDashboardData, AuditLogEntry } from "@/lib/hriq/types";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Header } from "../components/header";

// Lazy imports to code-split each dashboard
import { ClientDashboardGrid } from "./client-dashboard-grid";
import { RLDashboardGrid } from "./rl-dashboard-grid";
import { VADashboardGrid } from "./va-dashboard-grid";
import { GlobeHero } from "./globe-hero";
import { DashboardHero } from "../components/dashboard-hero";
import { OffboardingAuditBanner } from "./offboarding-audit-banner";
import { AdminAlerts } from "./admin-alerts";

export const metadata: Metadata = { title: "Dashboard" };

const RL_ORG_ID = process.env.RL_ORGANIZATION_ID ?? "org_rl_001";

type PageProps = { params: Promise<{ orgSlug: string }> };

//  Skeleton shown instantly while data streams in 
function DashboardSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0 animate-in fade-in duration-200">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl border bg-card" />
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="h-64 animate-pulse rounded-xl border bg-card" />
        <div className="h-64 animate-pulse rounded-xl border bg-card" />
      </div>
    </div>
  );
}

//  RL Super Admin Dashboard (streamed) 
async function RLDashboard({ orgId }: { orgId: string }) {
  const rlOrgId = orgId;

  // Consolidated financial stats in a single raw query (replaces 4 separate queries)
  type DashboardStats = { unpaid_amount: string; pending_pay: string; total_paid: string; country_count: string };
  const statsPromise = database.$queryRaw<DashboardStats[]>`
    SELECT
      COALESCE((SELECT SUM(CAST(ts.total_hours AS NUMERIC) * CAST(e.hourly_rate AS NUMERIC)) FROM timesheet_submissions ts JOIN hriq_employees e ON ts.employee_id = e.id WHERE ts.status = 'approved' AND e.organization_id = ${rlOrgId}), 0) as unpaid_amount,
      COALESCE((SELECT SUM(CAST(amount AS NUMERIC)) FROM hriq_payments p JOIN hriq_employees e ON p.employee_id = e.id WHERE p.status = 'pending' AND e.organization_id = ${rlOrgId}), 0) as pending_pay,
      COALESCE((SELECT SUM(CAST(amount AS NUMERIC)) FROM hriq_payments p JOIN hriq_employees e ON p.employee_id = e.id WHERE p.status = 'completed' AND e.organization_id = ${rlOrgId}), 0) as total_paid,
      (SELECT COUNT(DISTINCT country) FROM hriq_employees WHERE organization_id = ${rlOrgId} AND country IS NOT NULL AND country != '')::text as country_count
  `.catch(() => [{ unpaid_amount: "0", pending_pay: "0", total_paid: "0", country_count: "0" }] as DashboardStats[]);

  const [orgCount, employeeCount, activeOnboarding, employeesByStatus, recentOrgs, recentAudit, userCount, pendingTimesheets, financialStats, recentSubmissions, pendingInfoApprovals, contractorLocations] = await Promise.all([
    database.organization.count({ where: { id: { not: rlOrgId } } }),
    database.employee.count({ where: { organizationId: rlOrgId } }),
    database.onboardingSession.count({ where: { status: "in_progress", employee: { organizationId: rlOrgId } } }),
    database.employee.groupBy({ by: ["employmentStatus"], where: { organizationId: rlOrgId }, _count: { id: true } }),
    database.organization.findMany({ where: { id: { not: rlOrgId } }, orderBy: { createdAt: "desc" }, take: 5, include: { _count: { select: { members: true, employees: true } } } }),
    database.auditLog.findMany({ orderBy: { timestamp: "desc" }, take: 8, select: { id: true, action: true, objectType: true, objectId: true, timestamp: true, actorDescription: true, newValue: true } }),
    database.appUser.count(),
    database.timesheetSubmission.count({ where: { status: "submitted", employee: { organizationId: rlOrgId } } }),
    statsPromise,
    database.timesheetSubmission.findMany({ where: { employee: { organizationId: rlOrgId } }, orderBy: { createdAt: "desc" }, take: 5, include: { employee: { select: { legalFirstName: true, legalLastName: true } }, period: { select: { name: true } } } }),
    database.employee.findMany({ where: { organizationId: rlOrgId, infoApprovalStatus: "pending_review", employmentStatus: { not: "active" } }, select: { id: true, legalFirstName: true, legalLastName: true, updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 50 }),
    database.employee.findMany({
      where: { organizationId: rlOrgId, employmentStatus: { in: ["active", "onboarding_scheduled", "onboarding_in_progress"] }, country: { not: "" } },
      select: { country: true, city: true },
      take: 500,
    }),
  ]);

  const stats = financialStats[0] ?? { unpaid_amount: "0", pending_pay: "0", total_paid: "0", country_count: "0" };
  const unpaidAmount = Number(stats.unpaid_amount);
  const pendingPayAmount = Number(stats.pending_pay);
  const totalPaid = Number(stats.total_paid);
  const countryCount = Number(stats.country_count);

  const data = {
    orgCount, employeeCount, activeOnboarding, userCount, pendingTimesheets, unpaidAmount, pendingPayAmount, totalPaid,
    statusData: employeesByStatus.map((s) => ({ name: (s.employmentStatus as string).replace(/_/g, " "), value: s._count.id })),
    recentOrgs: recentOrgs.map((o) => ({ id: o.id, name: o.name, _count: o._count })),
    recentSubmissions: recentSubmissions.map((ts) => ({ id: ts.id, status: ts.status, totalHours: String(ts.totalHours), employee: ts.employee, period: ts.period })),
    recentAudit: recentAudit.map((l): AuditLogEntry => ({ id: l.id, action: l.action, objectType: l.objectType, objectId: l.objectId ?? null, timestamp: l.timestamp.toISOString(), actorDescription: l.actorDescription ?? null, newValue: (l.newValue as Record<string, unknown>) ?? null })),
    pendingInfoApprovals: pendingInfoApprovals.map((e) => ({ id: e.id, legalFirstName: e.legalFirstName, legalLastName: e.legalLastName })),
  };

  return (
    <>
      <GlobeHero contractorCount={employeeCount} countryCount={countryCount || undefined} locations={contractorLocations.map((e: any) => ({ country: e.country || "", city: e.city || "" }))} />
      <div className="flex flex-1 flex-col gap-4 px-4 pb-4 -mt-10 relative z-10">
        <OffboardingAuditBanner />
        <RLDashboardGrid data={data} />
      </div>
    </>
  );
}

//  Client Admin Dashboard (streamed) 
async function AdminDashboard({ orgId, orgRole }: { orgId: string; orgRole: string }) {
  const [org, employeeCount, activeCount, pendingTasks, pendingPayments, recentEmployees, paymentSummary, departmentStats, pendingTimesheets, recentTimesheets] = await Promise.all([
    database.organization.findUnique({ where: { id: orgId }, select: { name: true, logoUrl: true, profile: { select: { website: true } } } }),
    database.employee.count({ where: { organizationId: orgId } }),
    database.employee.count({ where: { organizationId: orgId, employmentStatus: "active" } }),
    database.task.count({ where: { employee: { organizationId: orgId }, status: "pending" } }),
    database.payment.count({ where: { employee: { organizationId: orgId }, status: "pending" } }).catch(() => 0),
    database.employee.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, legalFirstName: true, legalLastName: true, jobTitle: true, employmentStatus: true, createdAt: true } }),
    database.payment.findMany({ where: { employee: { organizationId: orgId } }, select: { status: true, amount: true }, take: 1000 }).catch(() => [] as any[]),
    database.employee.groupBy({ by: ["department"], where: { organizationId: orgId, department: { not: null } }, _count: { id: true } }),
    database.timesheetSubmission.count({ where: { status: "submitted", employee: { organizationId: orgId } } }),
    database.timesheetSubmission.findMany({ where: { employee: { organizationId: orgId } }, orderBy: { createdAt: "desc" }, take: 5, include: { employee: { select: { legalFirstName: true, legalLastName: true } }, period: { select: { name: true } } } }),
  ]);

  const deptData = departmentStats.map((d) => ({ name: (d.department as string) ?? "Unassigned", value: d._count.id }));
  const paymentByStatus = new Map<string, { value: number; count: number }>();
  for (const p of paymentSummary) {
    const ex = paymentByStatus.get(p.status) ?? { value: 0, count: 0 };
    ex.value += Number(p.amount); ex.count += 1;
    paymentByStatus.set(p.status, ex);
  }
  const paymentData = Array.from(paymentByStatus.entries()).map(([n, d]) => ({ name: n, value: d.value, count: d.count }));

  const data = {
    orgRole, orgName: org?.name ?? "Dashboard", orgLogoUrl: org?.logoUrl ?? null, employeeCount, activeCount, pendingTimesheets, pendingTasks, pendingPayments,
    departmentCount: departmentStats.length, deptData, paymentData,
    recentEmployees: recentEmployees.map((e: any) => ({ id: e.id, legalFirstName: e.legalFirstName, legalLastName: e.legalLastName, jobTitle: e.jobTitle, employmentStatus: e.employmentStatus })),
    recentTimesheets: recentTimesheets.map((ts: any) => ({ id: ts.id, status: ts.status, totalHours: ts.totalHours, employee: ts.employee, period: ts.period })),
  };

  return (
    <>
      <DashboardHero title={org?.name ?? "Dashboard"} subtitle={`${employeeCount} contractor${employeeCount !== 1 ? "s" : ""} · ${activeCount} active`} logoUrl={org?.logoUrl} website={org?.profile?.website} />
      <div className="flex flex-1 flex-col gap-4 px-4 pb-4 -mt-8 relative z-10">
        <ClientDashboardGrid data={data} />
      </div>
    </>
  );
}

//  VA/Member Dashboard (streamed) 
async function VADashboard({ userId, orgId }: { userId: string; orgId: string }) {
  const employee = await database.employee.findFirst({
    where: { linkedUserId: userId },
    include: {
      organization: { select: { name: true } },
      payments: { orderBy: { createdAt: "desc" }, take: 5 },
      timesheetSubmissions: { orderBy: { createdAt: "desc" }, take: 6, include: { period: { select: { name: true, startDate: true, endDate: true, status: true } } } },
      onboardingSessions: { where: { status: { in: ["not_started", "in_progress"] } }, include: { steps: true }, take: 1 },
    },
  });

  if (!employee) {
    // Look up the user's email for a helpful message
    const appUser = await database.appUser.findFirst({ where: { supabaseUserId: userId }, select: { email: true } });
    const userEmail = appUser?.email ?? "";
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted text-2xl font-bold text-muted-foreground">?</div>
          <h2 className="text-lg font-semibold">No Employee Profile Found</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Your account{userEmail ? ` (${userEmail})` : ""} is not linked to an employee record yet. This usually means your profile is still being set up.
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            Please contact your administrator or email <a href="mailto:support@remoteleverage.com" className="text-primary underline">support@remoteleverage.com</a> for help.
          </p>
        </div>
      </div>
    );
  }

  const now = new Date();
  const openPeriod = employee.organizationId ? await database.timesheetPeriod.findFirst({ where: { organizationId: employee.organizationId, status: "open", startDate: { lte: now }, endDate: { gte: now } }, orderBy: { startDate: "asc" } }) : null;
  const currentSubmission = openPeriod ? employee.timesheetSubmissions.find((ts: any) => ts.period.name === openPeriod.name) : null;
  const totalPaid = employee.payments.filter((p: any) => p.status === "completed").reduce((s: any, p: any) => s + Number(p.amount), 0);
  const pendingPay = employee.payments.filter((p: any) => ["pending", "processing"].includes(p.status)).reduce((s: any, p: any) => s + Number(p.amount), 0);
  const totalHoursAllTime = employee.timesheetSubmissions.reduce((s: any, ts: any) => s + Number(ts.totalHours), 0);
  const onboarding = employee.onboardingSessions[0] as any;
  const onboardingProgress = onboarding ? Math.round((onboarding.steps.filter((s: any) => s.status === "completed").length / Math.max(onboarding.steps.length, 1)) * 100) : null;

  const data = {
    firstName: employee.legalFirstName, preferredName: employee.preferredName, photoUrl: employee.photoUrl,
    jobTitle: employee.jobTitle, employmentType: employee.employmentType, department: employee.department,
    employmentStatus: employee.employmentStatus, organizationName: employee.organization?.name ?? null,
    totalHoursAllTime, totalPaid, pendingPay, onboardingProgress,
    onboardingStepsRemaining: onboarding ? onboarding.steps.filter((s: any) => s.status !== "completed").length : 0,
    openPeriodName: openPeriod?.name ?? null,
    openPeriodRange: openPeriod ? `${shortDate(openPeriod.startDate)} \u2013 ${shortDate(openPeriod.endDate)}` : null,
    currentSubmissionStatus: currentSubmission?.status ?? null,
    currentSubmissionHours: currentSubmission ? Number(currentSubmission.totalHours) : null,
    recentTimesheets: employee.timesheetSubmissions.map((ts: any) => ({ id: ts.id, status: ts.status, totalHours: ts.totalHours, submittedAt: ts.submittedAt?.toISOString() ?? null, period: { name: ts.period.name } })),
    recentPayments: employee.payments.map((p: any) => ({ id: p.id, amount: p.amount, currency: p.currency, status: p.status, paymentType: p.paymentType, paymentDate: p.paymentDate?.toISOString() ?? null })),
  };

  return (
    <>
      <DashboardHero
        title={`Welcome, ${employee.preferredName || employee.legalFirstName}`}
        subtitle={[employee.jobTitle, employee.organization?.name].filter(Boolean).join(" · ")}
      />
      <div className="flex flex-1 flex-col gap-4 px-4 pb-4 -mt-8 relative z-10">
        <VADashboardGrid data={data} />
      </div>
    </>
  );
}

//  Main Page — Header renders instantly, data streams 
export default async function DashboardPage({ params }: PageProps) {
  const { orgSlug } = await params;
  const ctx = await getSessionContext();
  if (!ctx) redirect("/sign-in");

  let session;
  try {
    session = await requireOrg();
  } catch {
    redirect("/sign-in");
  }

  const isRLOrg = session.orgId === RL_ORG_ID;
  const isSuperAdmin = ctx.orgRole === "super_admin";
  const isAdmin = ["super_admin", "admin", "manager"].includes(ctx.orgRole);

  if (isRLOrg && isSuperAdmin) {
    return (
      <div className="rl-dashboard-root flex flex-1 flex-col bg-[#0a0c10] relative">
        <div className="absolute top-0 left-0 right-0 z-30">
          <Header page="Home" pages={["RL Internal"]} noBreadcrumb />
        </div>
        <Suspense fallback={<DashboardSkeleton />}>
          <RLDashboard orgId={session.orgId} />
        </Suspense>
        <AdminAlerts />
      </div>
    );
  }

  if (isAdmin) {
    return (
      <>
        <Header page="Home" pages={["Client Portal"]} noBreadcrumb />
        <Suspense fallback={<DashboardSkeleton />}>
          <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
            <AdminDashboard orgId={session.orgId} orgRole={ctx.orgRole} />
          </div>
        </Suspense>
      </>
    );
  }

  return (
    <>
      <Header page="Home" pages={["Self Service"]} noBreadcrumb />
      <Suspense fallback={<DashboardSkeleton />}>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <VADashboard userId={session.userId} orgId={session.orgId} />
        </div>
      </Suspense>
    </>
  );
}
