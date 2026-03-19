import { requireOrg, getSessionContext } from "@repo/auth/session";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Header } from "../../../components/header";
import { NewEmployeeForm } from "./new-employee-form";

export const metadata: Metadata = { title: "Add Contractor" };

const NewEmployeePage = async () => {
  await requireOrg();
  const ctx = await getSessionContext();

  // Only super_admin and admin can create contractors
  if (!["super_admin", "admin"].includes(ctx?.orgRole ?? "")) {
    redirect("/");
  }

  return (
    <>
      <Header page="Add Contractor" pages={[ctx?.orgRole === "super_admin" ? "RL Internal" : "Client Portal", "Contractors"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <NewEmployeeForm />
      </div>
    </>
  );
};

export default NewEmployeePage;
