import { requireRole } from "@repo/auth/session";
import { database } from "@repo/database";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Header } from "../../../components/header";
import { OrgDetail } from "./org-detail";

export const metadata: Metadata = { title: "Organization Details" };

type Props = { params: Promise<{ id: string }> };

const OrgDetailPage = async ({ params }: Props) => {
  await requireRole("super_admin");
  const { id } = await params;

  const org = await database.organization.findUnique({
    where: { id },
    include: {
      _count: { select: { members: true, employees: true, announcements: true, batchSessions: true } },
    },
  });

  if (!org) notFound();

  const [members, employees, invitations, recentAudit, payments, tasks, documents] = await Promise.all([
    database.organizationMember.findMany({
      where: { organizationId: id },
      orderBy: { createdAt: "desc" },
    }),
    database.employee.findMany({
      where: { organizationId: id },
      select: {
        id: true, legalFirstName: true, legalLastName: true, employeeNumber: true,
        jobTitle: true, department: true, employmentStatus: true, employmentType: true,
        hourlyRate: true, currency: true, createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    database.organizationInvitation.findMany({
      where: { organizationId: id, acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    }),
    database.auditLog.findMany({
      where: { organizationId: id },
      orderBy: { timestamp: "desc" },
      take: 15,
    }),
    database.payment.findMany({
      where: { employee: { organizationId: id } },
      include: { employee: { select: { legalFirstName: true, legalLastName: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    database.task.findMany({
      where: { employee: { organizationId: id } },
      include: { employee: { select: { legalFirstName: true, legalLastName: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    database.document.findMany({
      where: { employee: { organizationId: id } },
      include: { employee: { select: { legalFirstName: true, legalLastName: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  const employeesByStatus = new Map<string, number>();
  const employeesByDept = new Map<string, number>();
  for (const emp of employees) {
    employeesByStatus.set(emp.employmentStatus, (employeesByStatus.get(emp.employmentStatus) ?? 0) + 1);
    const dept = emp.department ?? "Unassigned";
    employeesByDept.set(dept, (employeesByDept.get(dept) ?? 0) + 1);
  }

  return (
    <>
      <Header page={org.name} pages={["RL Admin", "Organizations"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <OrgDetail
          org={org}
          members={members}
          employees={employees}
          invitations={invitations}
          recentAudit={recentAudit}
          payments={payments}
          tasks={tasks}
          documents={documents}
          employeesByStatus={Object.fromEntries(employeesByStatus)}
          employeesByDept={Object.fromEntries(employeesByDept)}
        />
      </div>
    </>
  );
};

export default OrgDetailPage;
