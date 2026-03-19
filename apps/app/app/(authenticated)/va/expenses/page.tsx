import { getMyExpenseReports } from "@/app/actions/hriq/expenses";
import type { Metadata } from "next";
import { Header } from "../../components/header";
import { ExpenseSubmission } from "./expense-submission";

export const metadata: Metadata = { title: "My Expenses" };

const VAExpensesPage = async () => {
  const reports = await getMyExpenseReports();

  return (
    <>
      <Header page="Expenses" pages={["Self Service"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <ExpenseSubmission reports={reports} />
      </div>
    </>
  );
};

export default VAExpensesPage;
