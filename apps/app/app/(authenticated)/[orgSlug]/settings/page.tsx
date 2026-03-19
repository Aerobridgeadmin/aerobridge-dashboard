import { requireOrg, getSessionContext } from "@repo/auth/session";
import { database } from "@repo/database";
import type { Metadata } from "next";
import { Header } from "../../components/header";
import { SettingsDashboard } from "./settings-dashboard";
import { ClientAdminSettingsView } from "./client-admin-settings";
import { ContractorSettingsView } from "./contractor-settings";

export const metadata: Metadata = { title: "Settings" };

const RL_ORG_ID = process.env.RL_ORGANIZATION_ID ?? "org_rl_001";

const SettingsPage = async () => {
  const session = await requireOrg();
  const ctx = await getSessionContext();
  const isSuperAdmin = ctx?.orgRole === "super_admin";
  const isRLOrg = session.orgId === RL_ORG_ID;

  // Super admin viewing RL org  Platform Settings Dashboard
  if (isSuperAdmin && isRLOrg) {
    const [orgCount, userCount, employeeCount, activeUsers, memberCount, pendingInvites, activeEmployees, timesheetPeriodCount, pendingTimesheets] = await Promise.all([
      database.organization.count(),
      database.appUser.count(),
      database.employee.count(),
      database.appUser.count({ where: { isActive: true } }),
      database.organizationMember.count(),
      database.organizationInvitation.count({ where: { acceptedAt: null, expiresAt: { gt: new Date() } } }),
      database.employee.count({ where: { employmentStatus: "active" } }),
      database.timesheetPeriod.count(),
      database.timesheetSubmission.count({ where: { status: "submitted" } }),
    ]);

    const [unlinkedEmployees, ...healthCounts] = await Promise.all([
      database.employee.findMany({
        where: { linkedUserId: null, employmentStatus: { in: ["active", "pre_hire"] } },
        select: { id: true, legalFirstName: true, legalLastName: true, personalEmail: true, workEmail: true, jobTitle: true },
        orderBy: { legalFirstName: "asc" },
      }),
      // --- Payroll & Payment (0-8) ---
      database.employee.count({ where: { organizationId: RL_ORG_ID, employmentStatus: "active", paymentPlatform: null } }),
      database.employee.count({ where: { organizationId: RL_ORG_ID, employmentStatus: "active", hourlyRate: null, monthlySalary: null } }),
      database.employee.count({ where: { organizationId: RL_ORG_ID, employmentStatus: "active", compensationType: "hourly", hourlyRate: null } }),
      database.employee.count({ where: { organizationId: RL_ORG_ID, employmentStatus: "active", preferredPaymentMethod: "cadana", cadanaPersonId: null } }),
      database.employee.count({ where: { organizationId: RL_ORG_ID, employmentStatus: "active", preferredPaymentMethod: "wise", wiseRecipientId: null } }),
      database.employee.count({ where: { organizationId: RL_ORG_ID, employmentStatus: "active", wiseGateRequired: true } }),
      database.employee.count({ where: { organizationId: RL_ORG_ID, employmentStatus: "active", bankName: null, bankAccountNumber: null, wiseRecipientId: null, stripeAccountId: null, cadanaPersonId: null } }),
      database.commission.count({ where: { status: "pending" } }),
      database.timesheetSubmission.count({ where: { status: "submitted" } }),
      // --- Profile Completeness (9-18) ---
      database.employee.count({ where: { organizationId: RL_ORG_ID, employmentStatus: "active", personalEmail: null, workEmail: null } }),
      database.employee.count({ where: { organizationId: RL_ORG_ID, employmentStatus: "active", OR: [{ country: null }, { country: "" }] } }),
      database.employee.count({ where: { organizationId: RL_ORG_ID, employmentStatus: "active", phoneNumber: null, mobileNumber: null } }),
      database.employee.count({ where: { organizationId: RL_ORG_ID, employmentStatus: "active", OR: [{ timezone: null }, { timezone: "" }] } }),
      database.employee.count({ where: { organizationId: RL_ORG_ID, employmentStatus: "active", OR: [{ emergencyContactName: null }, { emergencyContactName: "" }] } }),
      database.employee.count({ where: { organizationId: RL_ORG_ID, employmentStatus: "active", dateOfBirth: null } }),
      database.employee.count({ where: { organizationId: RL_ORG_ID, employmentStatus: "active", streetAddress: null, city: null } }),
      database.employee.count({ where: { organizationId: RL_ORG_ID, employmentStatus: "active", startDate: null } }),
      database.employee.count({ where: { organizationId: RL_ORG_ID, employmentStatus: "active", workEmail: null } }),
      database.employee.count({ where: { organizationId: RL_ORG_ID, infoApprovalStatus: "pending_review" } }),
      // --- Data Integrity (19-23) ---
      database.employee.count({ where: { employmentStatus: "active", endDate: { not: null, lt: new Date() } } }),
      database.employee.count({ where: { employmentStatus: "offboarded", endDate: null } }),
      database.employee.count({ where: { employmentStatus: "offboarded", offboardingStatus: "not_started" } }),
      database.employee.count({ where: { isLocked: true } }),
      database.employee.count({ where: { employmentStatus: "active", stripeAccountId: { not: null }, stripeAccountStatus: { notIn: ["verified", "restricted"] } } }),
      // --- Onboarding & Verification (24-27) ---
      database.document.count({ where: { status: "pending" } }),
      database.document.count({ where: { isExpired: true, NOT: { status: "archived" } } }),
      database.employee.count({ where: { employmentStatus: "active", veriffStatus: "created", veriffSessionId: { not: null } } }),
      database.appUser.count({ where: { loginCount: 0 } }),
      // --- Offboarding & Security (28-30) ---
      database.$queryRaw<[{cnt: bigint}]>`SELECT count(*)::int as cnt FROM hriq_offboarding_audit_runs WHERE total_flags > 0 AND created_at > ${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)}`.then(r => Number(r[0]?.cnt ?? 0)).catch(() => 0),
      database.appUser.count({ where: { isActive: false } }),
      database.timesheetSubmission.count({ where: { status: "draft", period: { status: "closed" } } }),
    ]);

    const [
      missingPaymentPlatform, missingRate, hourlyNoRate, cadanaNoPersonId,
      wiseNoRecipient, wiseGateBlocked, noBankOrProvider, pendingCommissions, submittedTimesheets,
      missingBothEmails, missingCountry, missingPhone, missingTimezone,
      missingEmergencyContact, missingDob, missingAddress, missingStartDate, missingWorkEmail, pendingInfoApprovals,
      activeWithPastEndDate, offboardedNoEndDate, offboardedNotStarted, lockedEmployees, stripeIncomplete,
      pendingDocuments, expiredDocuments, veriffPending, usersNeverLoggedIn,
      recentAuditFlags, inactiveAppUsers, staleDrafts,
    ] = healthCounts;

    const healthIssues = [
      // --- Payroll & Payment ---
      { key: "no-payment-platform", label: "No payment platform configured", count: missingPaymentPlatform, severity: "critical" as const, category: "payroll" as const, link: "employees" },
      { key: "no-rate", label: "No compensation rate set", count: missingRate, severity: "critical" as const, category: "payroll" as const, link: "employees" },
      { key: "hourly-no-rate", label: "Hourly contractors without hourly rate", count: hourlyNoRate, severity: "critical" as const, category: "payroll" as const, link: "employees" },
      { key: "cadana-no-person", label: "Cadana preferred but no Cadana person ID", count: cadanaNoPersonId, severity: "critical" as const, category: "payroll" as const, link: "employees" },
      { key: "wise-no-recipient", label: "Wise preferred but no Wise recipient", count: wiseNoRecipient, severity: "critical" as const, category: "payroll" as const, link: "employees" },
      { key: "wise-gate-blocked", label: "Wise gate required (manual approval needed)", count: wiseGateBlocked, severity: "warning" as const, category: "payroll" as const, link: "employees" },
      { key: "no-bank-or-provider", label: "No bank details or payment provider at all", count: noBankOrProvider, severity: "warning" as const, category: "payroll" as const, link: "employees" },
      { key: "pending-commissions", label: "Pending commissions awaiting approval", count: pendingCommissions, severity: "info" as const, category: "payroll" as const, link: "commissions" },
      { key: "submitted-timesheets", label: "Timesheets awaiting approval", count: submittedTimesheets, severity: "info" as const, category: "payroll" as const, link: "timesheets" },
      { key: "stale-drafts", label: "Draft timesheets in closed periods", count: staleDrafts, severity: "warning" as const, category: "payroll" as const, link: "timesheets" },
      // --- Profile Completeness ---
      { key: "no-email", label: "No email address (personal or work)", count: missingBothEmails, severity: "critical" as const, category: "profile" as const, link: "employees" },
      { key: "no-work-email", label: "No work email", count: missingWorkEmail, severity: "warning" as const, category: "profile" as const, link: "employees" },
      { key: "no-country", label: "No country set", count: missingCountry, severity: "warning" as const, category: "profile" as const, link: "employees" },
      { key: "no-phone", label: "No phone number", count: missingPhone, severity: "warning" as const, category: "profile" as const, link: "employees" },
      { key: "no-timezone", label: "No timezone set", count: missingTimezone, severity: "warning" as const, category: "profile" as const, link: "employees" },
      { key: "no-emergency-contact", label: "No emergency contact", count: missingEmergencyContact, severity: "warning" as const, category: "profile" as const, link: "employees" },
      { key: "no-dob", label: "No date of birth", count: missingDob, severity: "info" as const, category: "profile" as const, link: "employees" },
      { key: "no-address", label: "No address on file", count: missingAddress, severity: "info" as const, category: "profile" as const, link: "employees" },
      { key: "no-start-date", label: "No start date recorded", count: missingStartDate, severity: "info" as const, category: "profile" as const, link: "employees" },
      { key: "pending-info-approvals", label: "Contractor info changes pending review", count: pendingInfoApprovals, severity: "warning" as const, category: "profile" as const, link: "employees" },
      // --- Data Integrity ---
      { key: "active-past-end-date", label: "Active but end date is in the past", count: activeWithPastEndDate, severity: "critical" as const, category: "integrity" as const, link: "employees" },
      { key: "offboarded-no-end-date", label: "Offboarded with no end date", count: offboardedNoEndDate, severity: "warning" as const, category: "integrity" as const, link: "employees" },
      { key: "offboarded-not-started", label: "Offboarded but offboarding never started", count: offboardedNotStarted, severity: "warning" as const, category: "integrity" as const, link: "employees" },
      { key: "locked-employees", label: "Locked employee records", count: lockedEmployees, severity: "info" as const, category: "integrity" as const, link: "employees" },
      { key: "stripe-incomplete", label: "Stripe account setup incomplete", count: stripeIncomplete, severity: "warning" as const, category: "integrity" as const, link: "employees" },
      // --- Onboarding & Documents ---
      { key: "pending-documents", label: "Documents awaiting review", count: pendingDocuments, severity: "info" as const, category: "onboarding" as const, link: "documents" },
      { key: "expired-documents", label: "Expired documents (not archived)", count: expiredDocuments, severity: "warning" as const, category: "onboarding" as const, link: "documents" },
      { key: "veriff-pending", label: "Veriff ID verification pending", count: veriffPending, severity: "warning" as const, category: "onboarding" as const, link: "employees" },
      { key: "users-never-logged-in", label: "Users who never logged in", count: usersNeverLoggedIn, severity: "info" as const, category: "onboarding" as const, link: "settings/users" },
      // --- Security & Offboarding ---
      { key: "audit-flags-7d", label: "Offboarding audit flags (last 7 days)", count: recentAuditFlags, severity: "critical" as const, category: "security" as const, link: "reports" },
      { key: "inactive-app-users", label: "Deactivated app users", count: inactiveAppUsers, severity: "info" as const, category: "security" as const, link: "settings/users" },
    ];

    return (
      <>
        <Header page="Settings" pages={["RL Internal"]} />
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <SettingsDashboard
            session={{ email: session.email, userId: session.userId, role: session.orgRole, name: session.name }}
            stats={{ orgCount, userCount, employeeCount, activeUsers, memberCount, pendingInvites, activeEmployees, timesheetPeriodCount, pendingTimesheets }}
            rlOrgId={RL_ORG_ID}
            unlinkedEmployees={unlinkedEmployees}
            healthIssues={healthIssues}
          />
        </div>
      </>
    );
  }

  // Client Admin view
  if (ctx?.orgRole === "admin") {
    const [org, profile] = await Promise.all([
      database.organization.findUnique({
        where: { id: session.orgId },
        select: { name: true, createdAt: true, _count: { select: { employees: true } } },
      }),
      database.organizationProfile.findUnique({
        where: { organizationId: session.orgId },
        select: {
          planType: true, paymentMethod: true, vaSeats: true,
          kycStatus: true, kycVerifiedAt: true,
          billingEmail: true, billingMethod: true, paymentTerms: true,
          adminName: true, adminEmail: true, adminPhone: true, adminTitle: true,
          country: true, address: true, website: true, industry: true,
        },
      }),
    ]);

    return (
      <>
        <Header page="Settings" pages={["Client Portal"]} />
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <ClientAdminSettingsView
            orgName={org?.name ?? ""}
            orgCreatedAt={org?.createdAt ? new Date(org.createdAt as any).toISOString() : new Date().toISOString()}
            profile={profile as any}
            employeeCount={org?._count.employees ?? 0}
            session={{ email: session.email, userId: session.userId, name: session.name }}
          />
        </div>
      </>
    );
  }

  // Contractor / team lead / member view
  if (["member", "manager"].includes(ctx?.orgRole ?? "")) {
    const [org, orgProfile, employee] = await Promise.all([
      database.organization.findUnique({
        where: { id: session.orgId },
        select: { name: true },
      }),
      database.organizationProfile.findUnique({
        where: { organizationId: session.orgId },
        select: { paymentMethod: true },
      }),
      database.employee.findFirst({
        where: { linkedUserId: session.userId, organizationId: session.orgId },
        select: {
          legalFirstName: true, legalLastName: true, preferredName: true,
          personalEmail: true, workEmail: true,
          jobTitle: true, department: true, employmentType: true, employmentStatus: true,
          hourlyRate: true, currency: true, timezone: true, startDate: true, employeeNumber: true,
          stripeAccountId: true, stripeAccountStatus: true,
          wiseRecipientId: true, bankName: true, paymentPlatform: true,
        },
      }),
    ]);

    return (
      <>
        <Header page="Settings" pages={["My Workspace"]} />
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <ContractorSettingsView
            orgName={org?.name ?? ""}
            orgPaymentMethod={orgProfile?.paymentMethod ?? null}
            employee={employee as any}
            session={{ email: session.email, name: session.name }}
          />
        </div>
      </>
    );
  }

  // Fallback for other roles
  const org = await database.organization.findUnique({
    where: { id: session.orgId },
    select: { name: true, slug: true, createdAt: true, _count: { select: { members: true, employees: true } } },
  });

  return (
    <>
      <Header page="Settings" pages={[isSuperAdmin ? "RL Internal" : "Client Portal"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="space-y-6 w-full">
          <div className="rounded-xl border bg-card p-6">
            <h2 className="text-lg font-semibold">Organization</h2>
            <div className="mt-4 space-y-3">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Name</span><span className="font-medium">{org?.name}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Members</span><span>{org?._count.members}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Contractors</span><span>{org?._count.employees}</span></div>
            </div>
          </div>
          <div className="rounded-xl border bg-card p-6">
            <h2 className="text-lg font-semibold">Your Account</h2>
            <div className="mt-4 space-y-3">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Email</span><span>{session.email}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Role</span><span className="capitalize">{session.orgRole.replace(/_/g, " ")}</span></div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default SettingsPage;
