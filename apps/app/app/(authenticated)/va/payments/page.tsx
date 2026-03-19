import { requireSession } from "@repo/auth/session";
import { database } from "@repo/database";
import type { Metadata } from "next";
import { Header } from "../../components/header";

export const metadata: Metadata = { title: "My Payments" };

const VAPaymentsPage = async () => {
  const session = await requireSession();

  const employee = await database.employee.findFirst({
    where: { linkedUserId: session.userId },
  });

  const payments = employee
    ? await database.payment.findMany({
        where: { employeeId: employee.id },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const statusColors: Record<string, string> = {
    completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    processing: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  };

  const totalEarnings = payments
    .filter((p) => p.status === "completed")
    .reduce((sum, p) => sum + Number(p.amount), 0);

  return (
    <>
      <Header page="My Payments" pages={["Self Service"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        {employee && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border bg-card p-6">
              <div className="text-sm font-medium text-muted-foreground">Total Earnings</div>
              <div className="text-3xl font-bold">{employee.currency} {totalEarnings.toFixed(2)}</div>
            </div>
            <div className="rounded-xl border bg-card p-6">
              <div className="text-sm font-medium text-muted-foreground">Payment Records</div>
              <div className="text-3xl font-bold">{payments.length}</div>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {payments.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-xl border bg-card p-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium capitalize">{p.paymentType}</span>
                  <span className="text-lg font-semibold">{p.amount} {p.currency}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${statusColors[p.status] ?? ""}`}>{p.status}</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {p.periodStart && p.periodEnd && (
                    <span>Period: {new Date(p.periodStart).toLocaleDateString()} - {new Date(p.periodEnd).toLocaleDateString()} &middot; </span>
                  )}
                  {p.hoursWorked && <span>{p.hoursWorked}h &middot; </span>}
                  <span>{p.paymentDate ? new Date(p.paymentDate).toLocaleDateString() : new Date(p.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
              {p.paymentMethod && <span className="rounded bg-muted px-2 py-0.5 text-xs capitalize">{p.paymentMethod.replace(/_/g, " ")}</span>}
            </div>
          ))}
          {payments.length === 0 && (
            <div className="py-12 text-center text-muted-foreground">
              {employee ? "No payment records yet." : "No employee profile linked to your account."}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default VAPaymentsPage;
