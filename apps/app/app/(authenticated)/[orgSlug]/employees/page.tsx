import { getSessionContext } from "@repo/auth/session";
import { database } from "@repo/database";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Header } from "../../components/header";
import { EmployeeList } from "./employee-list";
import { serialize } from "@/lib/hriq/serialize";

export const metadata: Metadata = {
  title: "Contractors",
  description: "Manage contractors across your organizations",
};

type PageProps = {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{
    status?: string;
    department?: string;
    search?: string;
    org?: string;
  }>;
};

async function getContractors(orgId: string | null, isSuperAdmin: boolean, userId: string, filters: { status?: string; department?: string; search?: string }) {
  // Find the super_admin's home org
  const homeOrgId = isSuperAdmin
    ? (await database.organizationMember.findFirst({
        where: { userId, role: "super_admin" },
        select: { organizationId: true },
      }))?.organizationId ?? null
    : null;

  // Super admin viewing their OWN (RL) org: show all RL contractors + unassigned
  const isViewingHomeOrg = isSuperAdmin && orgId === homeOrgId;

  if (isViewingHomeOrg) {
    return database.employee.findMany({
      where: {
        AND: [
          {
            OR: [
              ...(homeOrgId ? [{ organizationId: homeOrgId }] : []),
              { organizationId: null },
            ],
          },
          ...(filters.status && filters.status !== "all" ? [{ employmentStatus: filters.status }] : !filters.status ? [{ employmentStatus: { not: "offboarded" as const } }] : []),
          ...(filters.department ? [filters.department.toLowerCase() === "unassigned" ? { department: null } : { department: filters.department }] : []),
          ...(filters.search ? filters.search.trim().split(/\s+/).filter(Boolean).map((term) => ({
            OR: [
              { legalFirstName: { contains: term, mode: "insensitive" as const } },
              { legalLastName: { contains: term, mode: "insensitive" as const } },
              { workEmail: { contains: term, mode: "insensitive" as const } },
              { employeeNumber: { contains: term, mode: "insensitive" as const } },
              { personalEmail: { contains: term, mode: "insensitive" as const } },
              { jobTitle: { contains: term, mode: "insensitive" as const } },
            ],
          })) : []),
        ],
      },
      include: { organization: { select: { id: true, name: true } } },
      orderBy: [{ department: "asc" }, { createdAt: "asc" }],
      take: 200,
    });
  }

  // Viewing a client org (or non-super-admin): show only that org's contractors
  return database.employee.findMany({
    where: {
      organizationId: orgId ?? undefined,
      ...(filters.status && filters.status !== "all" ? { employmentStatus: filters.status } : !filters.status ? { employmentStatus: { not: "offboarded" } } : {}),
      ...(filters.department ? (filters.department.toLowerCase() === "unassigned" ? { department: null } : { department: filters.department }) : {}),
      ...(filters.search ? {
        AND: filters.search.trim().split(/\s+/).filter(Boolean).map((term) => ({
          OR: [
            { legalFirstName: { contains: term, mode: "insensitive" as const } },
            { legalLastName: { contains: term, mode: "insensitive" as const } },
            { workEmail: { contains: term, mode: "insensitive" as const } },
            { employeeNumber: { contains: term, mode: "insensitive" as const } },
            { personalEmail: { contains: term, mode: "insensitive" as const } },
            { jobTitle: { contains: term, mode: "insensitive" as const } },
          ],
        })),
      } : {}),
    },
    include: { organization: { select: { id: true, name: true } } },
    orderBy: [{ department: "asc" }, { createdAt: "asc" }],
    take: 200,
  });
}

const EmployeesPage = async ({ params: paramsPromise, searchParams }: PageProps) => {
  const session = await getSessionContext();
  if (!session) redirect("/sign-in");

  // Only super_admin, admin, and manager can view contractor list
  if (!["super_admin", "admin", "manager"].includes(session.orgRole ?? "")) {
    redirect("/");
  }

  const { orgSlug } = await paramsPromise;
  const params = await searchParams;
  const isSuperAdmin = session.orgRole === "super_admin";

  // Resolve the CURRENT org from the URL slug (not session.orgId which may be stale)
  const currentOrg = await database.organization.findFirst({
    where: { slug: orgSlug },
    select: { id: true },
  });
  const currentOrgId = currentOrg?.id ?? session.orgId;

  // Determine if super admin is viewing their home RL org vs a client org
  const homeOrgId = isSuperAdmin
    ? (await database.organizationMember.findFirst({
        where: { userId: session.userId, role: "super_admin" },
        select: { organizationId: true },
      }))?.organizationId ?? null
    : null;
  const isViewingHomeOrg = isSuperAdmin && currentOrgId === homeOrgId;

  const employees = await getContractors(currentOrgId, isSuperAdmin, session.userId, params);

  // Get org list for super_admin filter dropdown — disabled for RL Internal; view org-specific contractors from org detail
  const orgOptions: { id: string; name: string }[] = [];

  // No client-side org filter needed
  const filteredEmployees = employees;

  // Scope department stats to same set of contractors
  const deptOrgId = isViewingHomeOrg ? homeOrgId : currentOrgId;

  const deptEmployees = await database.employee.findMany({
    where: {
      employmentStatus: { not: "offboarded" },
      ...(isViewingHomeOrg && deptOrgId
        ? { OR: [{ organizationId: deptOrgId }, { organizationId: null }] }
        : deptOrgId ? { organizationId: deptOrgId } : {}),
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

  return (
    <>
      <Header page="Contractors" pages={[isViewingHomeOrg ? "RL Internal" : "Client Portal"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <EmployeeList
          employees={serialize(filteredEmployees)}
          departments={departments}
          filters={params}
          isSuperAdmin={isViewingHomeOrg}
          orgOptions={orgOptions}
        />
      </div>
    </>
  );
};

export default EmployeesPage;
