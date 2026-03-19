import { requireOrg } from "@repo/auth/session";
import type { Metadata } from "next";
import { Header } from "../../../components/header";
import { NewEmployeeForm } from "./new-employee-form";

export const metadata: Metadata = { title: "Add Contractor" };

const NewEmployeePage = async () => {
  await requireOrg();

  return (
    <>
      <Header page="Add Contractor" pages={["RL Internal", "Contractors"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <NewEmployeeForm />
      </div>
    </>
  );
};

export default NewEmployeePage;
