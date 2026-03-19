import { getSessionContext } from "@repo/auth/session";
import { database } from "@repo/database";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Header } from "../../components/header";
import { EmployeeList } from "./employee-list";

export const metadata: Metadata = {
  title: "Contractors",
  description: "Manage contractors across your organizations",
};

type PageProps = {
  searchParams: Promise<{
    status?: string;
    department?: string;
    search?: string;
  }>;
};

async function getContractors(orgId: string | null, isSuperAdmin: boolean, userId: string, filters: { status?: string; department?: string; search?: string }) {
  if (isSuperAdmin) {
    // Find the super_admin's home org — only show their own contractors
    const ownMembership = await database.organizationMember.findFirst({
      where: { userId, role: "super_admin" },
      select: { organizationId: true },
    });
    const homeOrgId = ownMembership?.organizationId ?? null;

    return database.employee.findMany({
      where: {
        // Show RL's own contractors + unassigned ones
        OR: [
          ...(homeOrgId ? [{ organizationId: homeOrgId }] : []),
          { organizationId: null },
        ],
        ...(filters.status && filters.status !== "all" ? { employmentStatus: filters.status } : !filters.status ? { employmentStatus: { not: "offboarded" } } : {}),
        ...(filters.department ? { department: filters.department } : {}),
        ...(filters.search ? {
          OR: [
            { legalFirstName: { contains: filters.search, mode: "insensitive" as const } },
            { legalLastName: { contains: filters.search, mode: "insensitive" as const } },
            { workEmail: { contains: filters.search, mode: "insensitive" as const } },
            { employeeNumber: { contains: filters.search, mode: "insensitive" as const } },
          ],
        } : {}),
      },
      include: { organization: { select: { id: true, name: true } } },
      orderBy: [{ employmentStatus: "asc" }, { createdAt: "desc" }],
      take: 200,
    });
  }

  return database.employee.findMany({
    where: {
      organizationId: orgId ?? undefined,
      ...(filters.status && filters.status !== "all" ? { employmentStatus: filters.status } : !filters.status ? { employmentStatus: { not: "offboarded" } } : {}),
      ...(filters.department ? { department: filters.department } : {}),
      ...(filters.search ? {
        OR: [
          { legalFirstName: { contains: filters.search, mode: "insensitive" as const } },
          { legalLastName: { contains: filters.search, mode: "insensitive" as const } },
          { workEmail: { contains: filters.search, mode: "insensitive" as const } },
          { employeeNumber: { contains: filters.search, mode: "insensitive" as const } },
        ],
      } : {}),
    },
    orderBy: [{ employmentStatus: "asc" }, { createdAt: "desc" }],
    take: 200,
  });
}

const EmployeesPage = async ({ searchParams }: PageProps) => {
  const session = await getSessionContext();
  if (!session) redirect("/sign-in");

  const params = await searchParams;
  const isSuperAdmin = session.orgRole === "super_admin";

  const employees = await getContractors(session.orgId, isSuperAdmin, session.userId, params);

  // Scope department stats to same set of contractors
  const ownMembershipForDept = isSuperAdmin
    ? await database.organizationMember.findFirst({ where: { userId: session.userId, role: "super_admin" }, select: { organizationId: true } })
    : null;
  const deptOrgId = isSuperAdmin ? ownMembershipForDept?.organizationId : session.orgId;

  const deptEmployees = await database.employee.findMany({
    where: {
      employmentStatus: { not: "offboarded" },
      ...(deptOrgId ? { OR: [{ organizationId: deptOrgId }, { organizationId: null }] } : {}),
    },
    select: { department: true },
  });

  const deptCounts: Record<string, number> = {};
  for (const emp of deptEmployees) {
    const dept = emp.department ?? "Unassigned";
    deptCounts[dept] = (deptCounts[dept] ?? 0) + 1;
  }
  const departments = Object.entries(deptCounts)
    .map(([department, count]) => ({ department, count }))
    .sort((a, b) => b.count - a.count);

  // Get pending hires count for super_admin
  let pendingHiresCount = 0;
  if (isSuperAdmin) {
    try {
      const result = await database.$queryRawUnsafe<[{ count: bigint }]>(
        "SELECT COUNT(*) as count FROM pending_hires WHERE status = 'pending'"
      );
      pendingHiresCount = Number(result[0]?.count ?? 0);
    } catch {}
  }

  return (
    <>
      <Header page="Contractors" pages={[isSuperAdmin ? "RL Internal" : "Client Portal"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <EmployeeList
          employees={employees}
          departments={departments}
          filters={params}
          isSuperAdmin={isSuperAdmin}
          pendingHiresCount={pendingHiresCount}
        />
      </div>
    </>
  );
};

export default EmployeesPage;
