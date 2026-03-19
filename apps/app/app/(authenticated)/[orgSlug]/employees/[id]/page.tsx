import { getEmployeeById } from "@/app/actions/hriq/employees";
import { getSessionContext, requireOrg } from "@repo/auth/session";
import { database } from "@repo/database";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Header } from "../../../components/header";
import { EmployeeDetail } from "./employee-detail";
import { serialize } from "@/lib/hriq/serialize";

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  try {
    const { id } = await params;
    const employee = await getEmployeeById(id);
    if (!employee) return { title: "Contractor Not Found" };
    return {
      title: `${employee.legalFirstName} ${employee.legalLastName}`,
      description: `Contractor details for ${employee.employeeNumber}`,
    };
  } catch {
    return { title: "Contractor" };
  }
}

const EmployeeDetailPage = async ({ params }: PageProps) => {
  const { id } = await params;
  const [employee, session, ctx] = await Promise.all([
    getEmployeeById(id),
    requireOrg(),
    getSessionContext(),
  ]);

  if (!employee) notFound();

  // Get ordered list of employee IDs for prev/next navigation
  const allEmployees = await database.employee.findMany({
    where: { organizationId: session.orgId },
    select: { id: true },
    orderBy: { legalLastName: "asc" },
  });
  const idx = allEmployees.findIndex((e) => e.id === id);
  const prevId = idx > 0 ? allEmployees[idx - 1]!.id : null;
  const nextId = idx < allEmployees.length - 1 ? allEmployees[idx + 1]!.id : null;

  return (
    <>
      <Header
        page={`${employee.legalFirstName} ${employee.legalLastName}`}
        pages={[ctx?.orgRole === "super_admin" ? "RL Internal" : "Client Portal", "Contractors"]}
      />
      <div className="flex flex-1 flex-col p-4 pt-0">
        <EmployeeDetail employee={serialize(employee)} isSuperAdmin={ctx?.orgRole === "super_admin"} prevEmployeeId={prevId} nextEmployeeId={nextId} />
      </div>
    </>
  );
};

export default EmployeeDetailPage;
