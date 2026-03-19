import { getExpenseReports } from "@/app/actions/hriq/expenses";
import { requireOrg } from "@repo/auth/session";
import type { Metadata } from "next";
import { Header } from "../../components/header";
import { ExpenseManager } from "./expense-manager";

export const metadata: Metadata = { title: "Expense Management" };

const ExpensesPage = async () => {
  await requireOrg();
  const reports = await getExpenseReports();

  return (
    <>
      <Header page="Expenses" pages={["Client Portal"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <ExpenseManager reports={reports} />
      </div>
    </>
  );
};

export default ExpensesPage;
