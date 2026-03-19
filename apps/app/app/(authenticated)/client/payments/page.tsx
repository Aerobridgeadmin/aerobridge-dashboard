import { requireOrg } from "@repo/auth/session";
import { database } from "@repo/database";
import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "../../components/header";
import { RecordPayment } from "./record-payment";
import { PaymentFilters } from "./payment-filters";

export const metadata: Metadata = { title: "Payments" };

type PageProps = { searchParams: Promise<{ status?: string; q?: string }> };

const PaymentsPage = async ({ searchParams }: PageProps) => {
  const session = await requireOrg();
  const params = await searchParams;

  const payments = await database.payment.findMany({
    where: {
      employee: {
        organizationId: session.orgId,
        ...(params.q ? {
          OR: [
            { legalFirstName: { contains: params.q, mode: "insensitive" as const } },
            { legalLastName: { contains: params.q, mode: "insensitive" as const } },
          ],
        } : {}),
      },
      ...(params.status ? { status: params.status } : {}),
    },
    include: {
      employee: { select: { id: true, legalFirstName: true, legalLastName: true, employeeNumber: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const totalPending = payments.filter((p) => p.status === "pending").reduce((sum, p) => sum + Number(p.amount), 0);
  const totalCompleted = payments.filter((p) => p.status === "completed").reduce((sum, p) => sum + Number(p.amount), 0);
  const totalProcessing = payments.filter((p) => p.status === "processing").reduce((sum, p) => sum + Number(p.amount), 0);

  const employees = await database.employee.findMany({
    where: { organizationId: session.orgId, employmentStatus: { not: "offboarded" } },
    select: { id: true, legalFirstName: true, legalLastName: true, employeeNumber: true },
    orderBy: { legalFirstName: "asc" },
  });

  const statusColors: Record<string, string> = {
    completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    processing: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  };

  return (
    <>
      <Header page="Payments" pages={["RL Internal"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Payments ({payments.length})</h2>
          <RecordPayment employees={employees} />
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-xl border bg-card p-5 text-center">
            <div className="text-2xl font-bold">{payments.length}</div>
            <div className="text-xs text-muted-foreground">Total</div>
          </div>
          <div className="rounded-xl border bg-card p-5 text-center">
            <div className="text-2xl font-bold text-yellow-600">${totalPending.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Pending</div>
          </div>
          <div className="rounded-xl border bg-card p-5 text-center">
            <div className="text-2xl font-bold text-blue-600">${totalProcessing.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Processing</div>
          </div>
          <div className="rounded-xl border bg-card p-5 text-center">
            <div className="text-2xl font-bold text-green-600">${totalCompleted.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Completed</div>
          </div>
        </div>

        <PaymentFilters currentStatus={params.status} currentSearch={params.q} />

        <div className="rounded-xl border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b text-left text-sm text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Contractor</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Method</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="px-4 py-3 text-sm">
                      <Link href={`/client/employees/${p.employee.id}`} className="font-medium hover:underline">
                        {p.employee.legalFirstName} {p.employee.legalLastName}
                      </Link>
                    </td>
                    <td className="px-4 py-3"><span className="rounded bg-muted px-1.5 py-0.5 text-xs capitalize">{p.paymentType}</span></td>
                    <td className="px-4 py-3 text-sm font-medium">${Number(p.amount).toLocaleString()} {p.currency}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground capitalize">{p.paymentMethod?.replace(/_/g, " ") ?? "—"}</td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs capitalize ${statusColors[p.status] ?? ""}`}>{p.status}</span></td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{p.paymentDate ? new Date(p.paymentDate).toLocaleDateString() : new Date(p.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
                {payments.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No payments found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
};

export default PaymentsPage;
