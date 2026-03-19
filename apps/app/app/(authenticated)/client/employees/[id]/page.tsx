import { getEmployeeById } from "@/app/actions/hriq/employees";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Header } from "../../../components/header";
import { EmployeeDetail } from "./employee-detail";

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const employee = await getEmployeeById(id);
  if (!employee) return { title: "Contractor Not Found" };
  return {
    title: `${employee.legalFirstName} ${employee.legalLastName}`,
    description: `Contractor details for ${employee.employeeNumber}`,
  };
}

const EmployeeDetailPage = async ({ params }: PageProps) => {
  const { id } = await params;
  const employee = await getEmployeeById(id);

  if (!employee) notFound();

  return (
    <>
      <Header
        page={`${employee.legalFirstName} ${employee.legalLastName}`}
        pages={["RL Internal", "Contractors"]}
      />
      <div className="flex flex-1 flex-col p-4 pt-0">
        <EmployeeDetail employee={employee} />
      </div>
    </>
  );
};

export default EmployeeDetailPage;
