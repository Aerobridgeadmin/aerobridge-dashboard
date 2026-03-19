import { requireOrg } from "@repo/auth/session";
import { database } from "@repo/database";
import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "../../components/header";

export const metadata: Metadata = { title: "Organization Chart" };

const OrgChartPage = async () => {
  const session = await requireOrg();

  const employees = await database.employee.findMany({
    where: { organizationId: session.orgId, employmentStatus: { not: "offboarded" } },
    select: {
      id: true,
      legalFirstName: true,
      legalLastName: true,
      jobTitle: true,
      department: true,
      managerId: true,
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

  const topLevel = employees.filter((e) => !e.managerId);
  const byManager = new Map<string, typeof employees>();
  for (const emp of employees) {
    if (emp.managerId) {
      if (!byManager.has(emp.managerId)) byManager.set(emp.managerId, []);
      byManager.get(emp.managerId)!.push(emp);
    }
  }

  return (
    <>
      <Header page="Org Chart" pages={["Client Portal"]} />
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
                {members.map((emp) => (
                  <Link key={emp.id} href={`/client/employees/${emp.id}`} className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-muted/50">
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

        {/* Hierarchy View */}
        {topLevel.length > 0 && (
          <div className="rounded-xl border bg-card p-6">
            <h3 className="font-semibold">Reporting Structure</h3>
            <div className="mt-4 space-y-4">
              {topLevel.map((manager) => (
                <div key={manager.id} className="rounded-lg border p-4">
                  <Link href={`/client/employees/${manager.id}`} className="font-medium hover:underline">
                    {manager.legalFirstName} {manager.legalLastName}
                  </Link>
                  <span className="ml-2 text-sm text-muted-foreground">{manager.jobTitle}</span>
                  {byManager.has(manager.id) && (
                    <div className="ml-6 mt-2 space-y-1 border-l-2 border-muted pl-4">
                      {byManager.get(manager.id)!.map((report) => (
                        <div key={report.id} className="flex items-center gap-2">
                          <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                          <Link href={`/client/employees/${report.id}`} className="text-sm hover:underline">
                            {report.legalFirstName} {report.legalLastName}
                          </Link>
                          <span className="text-xs text-muted-foreground">{report.jobTitle}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default OrgChartPage;
