import { requireOrg } from "@repo/auth/session";
import { getAllSubmissions, getTimesheetPeriods } from "@/app/actions/hriq/timesheets";
import { database } from "@repo/database";
import type { Metadata } from "next";
import { Header } from "../../components/header";
import { TimesheetDashboard } from "../timesheets/timesheet-dashboard";
import { PaymentsDashboard } from "../payments/payments-dashboard";
import { PayrollTabs } from "./payroll-tabs";
import { serialize } from "@/lib/hriq/serialize";

export const metadata: Metadata = { title: "Payroll — Internal" };

const RL_ORG_ID = process.env.RL_ORGANIZATION_ID ?? "org_rl_001";

const ClientPayrollPage = async () => {
  const session = await requireOrg();
  const isRL = session.orgId === RL_ORG_ID;
  const isContractor = session.orgRole === "member";

  // Members/VAs should not access the admin payroll page — redirect to their own payments
  if (isContractor) {
    const org = await database.organization.findUnique({
      where: { id: session.orgId! },
      select: { slug: true },
    });
    const { redirect } = await import("next/navigation");
    redirect(`/${org?.slug ?? ""}/payments`);
  }

  // Admin/super_admin only from here — show all org employees
  const employeeFilter: any = { organizationId: session.orgId };

  const [submissions, periods, org] = await Promise.all([
    getAllSubmissions(),
    getTimesheetPeriods(),
    database.organization.findUnique({ where: { id: session.orgId! }, select: { name: true } }),
  ]);

  // Payment data — wrapped in try/catch because hriq_payments table may not exist yet
  let payments: any[] = [];
  let paymentPeriods: any[] = [];
  let orgConnect: any = null;
  let orgPaymentMethod: string | null = null;
  try {
    const [p, pp, oc, profile] = await Promise.all([
      database.payment.findMany({
        where: { employee: employeeFilter },
        select: {
          id: true,
          status: true,
          amount: true,
          currency: true,
          paymentType: true,
          paymentMethod: true,
          paymentDate: true,
          createdAt: true,
          periodStart: true,
          periodEnd: true,
          employee: { select: { id: true, legalFirstName: true, legalLastName: true, employeeNumber: true, department: true } },
        },
        orderBy: { createdAt: "desc" },
        take: isContractor ? 100 : 500,
      }),
      isContractor
        ? ([] as any[])
        : database.timesheetPeriod.findMany({
            where: { organizationId: session.orgId },
            select: { id: true, name: true, startDate: true, endDate: true },
            orderBy: { startDate: "desc" },
          }),
      !isRL
        ? database.organization.findUnique({
            where: { id: session.orgId },
            select: { stripeConnectAccountId: true, stripeConnectStatus: true },
          })
        : null,
      database.organizationProfile.findUnique({
        where: { organizationId: session.orgId! },
        select: { paymentMethod: true },
      }),
    ]);
    payments = p;
    paymentPeriods = pp;
    orgConnect = oc;
    orgPaymentMethod = (profile as any)?.paymentMethod ?? null;
  } catch (err) {
    console.warn("[Payroll] Payment query failed (table may not exist yet):", err);
  }

  // Client invoices — load for non-RL orgs so PPP clients can see and pay
  let clientInvoices: any[] = [];
  if (!isRL) {
    try {
      clientInvoices = await database.clientInvoice.findMany({
        where: { organizationId: session.orgId },
        include: {
          organization: { select: { id: true, name: true, profile: { select: { paymentMethod: true } } } },
          lineItems: {
            include: {
              employee: { select: { id: true, legalFirstName: true, legalLastName: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
    } catch (err) {
      console.warn("[Payroll] Client invoice query failed:", err);
    }
  }

  const orgLabel = isRL ? "RL Internal" : (org?.name ?? "External");
  const pendingPayments = payments.filter((p: any) => p.status === "pending" || p.status === "processing");
  const unpaidInvoices = clientInvoices.filter((i: any) => i.status === "draft" || i.status === "sent");

  const tabs = [
    { id: "timesheets", label: "Timesheets" },
    { id: "payments", label: "Payments", badge: pendingPayments.length + unpaidInvoices.length },
  ];

  return (
    <>
      <Header page="Payroll" pages={[orgLabel]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <PayrollTabs tabs={tabs} defaultTab="timesheets" contents={[
            <TimesheetDashboard
              key="timesheets"
              submissions={submissions}
              periods={periods}
            />,
            <PaymentsDashboard
              key="payments"
              payments={serialize(payments)}
              periods={serialize(paymentPeriods)}
              clientInvoices={serialize(clientInvoices)}
              isRL={isRL}
              orgId={session.orgId}
              orgConnect={orgConnect ? { accountId: orgConnect.stripeConnectAccountId, status: orgConnect.stripeConnectStatus } : undefined}
              readOnly={isContractor}
              paymentMethod={orgPaymentMethod}
            />,
          ]} />
      </div>
    </>
  );
};

export default ClientPayrollPage;
