import { requireOrg, getSessionContext } from "@repo/auth/session";
import { database } from "@repo/database";
import type { Metadata } from "next";
import { Header } from "../../components/header";
import { ReportsDashboard } from "./reports-dashboard";
import { serialize } from "@/lib/hriq/serialize";

export const metadata: Metadata = { title: "Reports & Analytics" };

const ReportsPage = async () => {
  const session = await requireOrg();
  const ctx = await getSessionContext();
  const isSuperAdmin = ctx?.orgRole === "super_admin";

  // For super_admin: fetch across all orgs. For others: scoped to their org.
  const orgFilter = isSuperAdmin ? {} : { organizationId: session.orgId };
  const empOrgFilter = isSuperAdmin ? {} : { organizationId: session.orgId };

  const [
    organizations,
    employees,
    onboardingSessions,
    payments,
    timesheetSubmissions,
    tasks,
    documents,
    auditLogs,
  ] = await Promise.all([
    // All client orgs (for org filter dropdown)
    isSuperAdmin
      ? database.organization.findMany({
          select: { id: true, name: true, slug: true },
          orderBy: { name: "asc" },
        })
      : [],

    // Employees with key fields
    database.employee.findMany({
      where: empOrgFilter,
      select: {
        id: true,
        organizationId: true,
        legalFirstName: true,
        legalLastName: true,
        employmentStatus: true,
        onboardingStatus: true,
        employmentType: true,
        department: true,
        jobTitle: true,
        country: true,
        currency: true,
        hourlyRate: true,
        startDate: true,
        endDate: true,
        createdAt: true,
        linkedUserId: true,
        organization: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),

    // Onboarding sessions
    database.onboardingSession.findMany({
      where: { employee: empOrgFilter },
      select: {
        id: true,
        status: true,
        overallProgress: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
        employee: {
          select: {
            id: true,
            legalFirstName: true,
            legalLastName: true,
            organizationId: true,
            organization: { select: { name: true } },
          },
        },
        _count: { select: { steps: true } },
      },
      orderBy: { createdAt: "desc" },
    }),

    // Payments
    database.payment.findMany({
      where: { employee: empOrgFilter },
      select: {
        id: true,
        amount: true,
        currency: true,
        status: true,
        paymentDate: true,
        periodStart: true,
        periodEnd: true,
        hoursWorked: true,
        createdAt: true,
        employee: {
          select: {
            id: true,
            legalFirstName: true,
            legalLastName: true,
            organizationId: true,
            department: true,
            organization: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),

    // Timesheet submissions
    database.timesheetSubmission.findMany({
      where: { employee: empOrgFilter },
      select: {
        id: true,
        status: true,
        totalHours: true,
        submittedAt: true,
        approvedAt: true,
        createdAt: true,
        employee: {
          select: {
            id: true,
            legalFirstName: true,
            legalLastName: true,
            organizationId: true,
            department: true,
            organization: { select: { name: true } },
          },
        },
        period: {
          select: { name: true, startDate: true, endDate: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),

    // Tasks
    database.task.findMany({
      where: { employee: empOrgFilter },
      select: {
        id: true,
        status: true,
        dueDate: true,
        completedAt: true,
        createdAt: true,
        employee: {
          select: {
            organizationId: true,
            organization: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),

    // Documents
    database.document.findMany({
      where: { employee: empOrgFilter },
      select: {
        id: true,
        documentType: true,
        status: true,
        createdAt: true,
        employee: {
          select: {
            organizationId: true,
            organization: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),

    // Audit logs (last 500)
    isSuperAdmin
      ? database.auditLog.findMany({
          select: {
            id: true,
            action: true,
            objectType: true,
            timestamp: true,
            actorDescription: true,
            organizationId: true,
          },
          orderBy: { timestamp: "desc" },
          take: 500,
        })
      : database.auditLog.findMany({
          where: { organizationId: session.orgId },
          select: {
            id: true,
            action: true,
            objectType: true,
            timestamp: true,
            actorDescription: true,
            organizationId: true,
          },
          orderBy: { timestamp: "desc" },
          take: 200,
        }),
  ]);

  return (
    <>
      <Header page="Reports" pages={[isSuperAdmin ? "RL Internal" : "Client Portal"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <ReportsDashboard
          isSuperAdmin={isSuperAdmin}
          organizations={serialize(organizations)}
          employees={serialize(employees)}
          onboardingSessions={serialize(onboardingSessions)}
          payments={serialize(payments)}
          timesheetSubmissions={serialize(timesheetSubmissions)}
          tasks={serialize(tasks)}
          documents={serialize(documents)}
          auditLogs={serialize(auditLogs)}
        />
      </div>
    </>
  );
};

export default ReportsPage;
