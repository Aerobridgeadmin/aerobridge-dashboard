import { getExpenseReports, getMyExpenseReports } from "@/app/actions/hriq/expenses";
import { requireOrg, getSessionContext } from "@repo/auth/session";
import { database } from "@repo/database";
import type { Metadata } from "next";
import { Header } from "../../components/header";
import { ExpenseManager } from "./expense-manager";
import { ExpenseSubmission } from "./expense-submission";

export const metadata: Metadata = { title: "Expenses" };

const ExpensesPage = async () => {
  const session = await requireOrg();
  const ctx = await getSessionContext();
  const isAdmin = ["super_admin", "admin", "manager"].includes(ctx?.orgRole ?? "");

  if (isAdmin) {
    const [reports, payments] = await Promise.all([
      getExpenseReports(),
      database.payment.findMany({
        where: { employee: { organizationId: session.orgId } },
        include: { employee: { select: { id: true, legalFirstName: true, legalLastName: true } } },
        orderBy: { createdAt: "desc" },
      })]);
    return (
      <>
        <Header page="Expenses" pages={[ctx?.orgRole === "super_admin" ? "RL Internal" : "Client Portal"]} />
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0"><ExpenseManager reports={reports} payments={payments} /></div>
      </>
    );
  }

  const reports = await getMyExpenseReports();
  return (
    <>
      <Header page="Expenses" pages={["Self Service"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0"><ExpenseSubmission reports={reports} /></div>
    </>
  );
};

export default ExpensesPage;
