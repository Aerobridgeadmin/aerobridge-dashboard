import { getSessionContext } from "@repo/auth/session";
import { redirect } from "next/navigation";
import { getExternalExpenses, getExternalExpenseStats } from "@/app/actions/hriq/external-operations";
import { getClientOrganizations } from "@/app/actions/hriq/external-finance";
import type { Metadata } from "next";
import { Header } from "../../../components/header";
import { ExternalExpensesDashboard } from "./external-expenses-dashboard";
import { serialize } from "@/lib/hriq/serialize";

export const metadata: Metadata = { title: "External Expenses" };

const ExternalExpensesPage = async () => {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/sign-in");
  if (ctx.orgRole !== "super_admin") redirect("/");

  const [expenses, stats, organizations] = await Promise.all([
    getExternalExpenses(),
    getExternalExpenseStats(),
    getClientOrganizations(),
  ]);

  return (
    <>
      <Header page="External Expenses" pages={["Client Orgs"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <ExternalExpensesDashboard expenses={serialize(expenses)} organizations={organizations} stats={stats} />
      </div>
    </>
  );
};

export default ExternalExpensesPage;
