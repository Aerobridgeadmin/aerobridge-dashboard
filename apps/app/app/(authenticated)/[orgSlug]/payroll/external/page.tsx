import { requireRole } from "@repo/auth/session";
import { getExternalSubmissions, getExternalPeriods, getClientOrganizations, getExternalPayments, getExternalPaymentStats } from "@/app/actions/hriq/external-finance";
import { database } from "@repo/database";
import type { Metadata } from "next";
import { Header } from "../../../components/header";
import { ExternalPayrollDashboard } from "./external-payroll-dashboard";
import { ExternalPaymentsDashboard } from "../../payments/external/external-payments-dashboard";
import { PayrollTabs } from "../payroll-tabs";
import { serialize } from "@/lib/hriq/serialize";

export const metadata: Metadata = { title: "Payroll — External" };

const ExternalPayrollPage = async () => {
  await requireRole("super_admin");

  const [submissions, periods, organizations] = await Promise.all([
    getExternalSubmissions(),
    getExternalPeriods(),
    getClientOrganizations(),
  ]);

  // Payment data — wrapped in try/catch because tables may not exist yet
  let payments: any[] = [];
  let stats: any = {};
  let clientInvoices: any[] = [];
  try {
    const [p, s, ci] = await Promise.all([
      getExternalPayments(),
      getExternalPaymentStats(),
      database.clientInvoice.findMany({
        include: {
          organization: {
            select: {
              id: true,
              name: true,
              profile: { select: { paymentMethod: true } },
            },
          },
          lineItems: {
            include: {
              employee: { select: { id: true, legalFirstName: true, legalLastName: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
    ]);
    payments = p as any[];
    stats = s;
    clientInvoices = ci;
  } catch (err) {
    console.warn("[Payroll External] Payment query failed (table may not exist yet):", err);
  }

  const pendingSubmissions = (submissions as any[]).filter((s: any) => s.status === "submitted");
  const pendingPayments = payments.filter((p: any) => p.status === "pending" || p.status === "processing");

  const tabs = [
    { id: "timesheets", label: "Timesheets", badge: pendingSubmissions.length },
    { id: "payments", label: "Payments", badge: pendingPayments.length },
  ];

  return (
    <>
      <Header page="Payroll" pages={["RL External"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <PayrollTabs tabs={tabs} defaultTab="timesheets" contents={[
            <ExternalPayrollDashboard
              key="timesheets"
              submissions={submissions as any}
              periods={periods as any}
              organizations={organizations}
            />,
            <ExternalPaymentsDashboard
              key="payments"
              payments={serialize(payments)}
              organizations={organizations}
              stats={stats}
              clientInvoices={serialize(clientInvoices)}
            />,
          ]} />
      </div>
    </>
  );
};

export default ExternalPayrollPage;
