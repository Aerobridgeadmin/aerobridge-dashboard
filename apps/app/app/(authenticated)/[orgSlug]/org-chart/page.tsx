import { requireOrg } from "@repo/auth/session";
import { database } from "@repo/database";
import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "../../components/header";

export const metadata: Metadata = { title: "Organization Chart" };

const OrgChartPage = async ({ params: paramsPromise }: { params: Promise<{ orgSlug: string }> }) => {
  const { orgSlug } = await paramsPromise;
  const session = await requireOrg();

  const employees = await database.employee.findMany({
    take: 500,
    where: { organizationId: session.orgId, employmentStatus: { not: "offboarded" } },
    select: {
      id: true,
      legalFirstName: true,
      legalLastName: true,
      jobTitle: true,
      department: true,
      employmentStatus: true,
    },
    orderBy: { legalFirstName: "asc" },
  });

  const departments = new Map<string, typeof employees>();
  for (const emp of employees) {
    const dept = emp.department ?? "Unassigned";
    if (!departments.has(dept)) departments.set(dept, []);
    departments.get(dept)!.push(emp);
  }

  return (
    <>
      <Header page="Org Chart" pages={[session.orgRole === "super_admin" ? "RL Internal" : "Client Portal"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Organization Chart ({employees.length} people)</h2>
        </div>

        {/* Department View */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from(departments.entries()).map(([dept, members]) => (
            <div key={dept} className="rounded-xl border bg-card p-6">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{dept}</h3>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{members.length}</span>
              </div>
              <div className="mt-4 space-y-2">
                {members.map((emp: any) => (
                  <Link key={emp.id} href={`/${orgSlug}/employees/${emp.id}`} className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-muted/50">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      {emp.legalFirstName.charAt(0)}{emp.legalLastName.charAt(0)}
                    </div>
                    <div>
                      <div className="text-sm font-medium">{emp.legalFirstName} {emp.legalLastName}</div>
                      <div className="text-xs text-muted-foreground">{emp.jobTitle ?? "No title"}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

export default OrgChartPage;
