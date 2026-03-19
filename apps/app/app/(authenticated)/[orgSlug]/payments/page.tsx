import { requireOrg } from "@repo/auth/session";
import { database } from "@repo/database";
import type { Metadata } from "next";
import { Header } from "../../components/header";
import { PaymentsDashboard } from "./payments-dashboard";
import { AchCollectionsWidget } from "./ach-collections-widget";
import { serialize } from "@/lib/hriq/serialize";
import { listAchCollections } from "@/app/actions/hriq/ach-collections";

export const metadata: Metadata = { title: "Payments" };

const PaymentsPage = async () => {
  const session = await requireOrg();
  const isRL = session.orgId === (process.env.RL_ORGANIZATION_ID ?? "org_rl_001");
  const isContractor = session.orgRole === "member";

  // For contractors, scope payments to their own employee record only
  let employeeFilter: any = { organizationId: session.orgId };
  if (isContractor) {
    const linkedEmployee = await database.employee.findFirst({
      where: { linkedUserId: session.userId },
      select: { id: true },
    });
    if (linkedEmployee) {
      employeeFilter = { id: linkedEmployee.id };
    } else {
      // No linked employee — show empty
      employeeFilter = { id: "___none___" };
    }
  }

  const [payments, periods, clientInvoices, orgConnect, achRows, orgProfile] = await Promise.all([
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
        payoutProvider: true,
        wiseFee: true,
        wiseSourceAmount: true,
        wiseTargetAmount: true,
        wiseTargetCurrency: true,
        wiseTransferStatus: true,
        employee: { select: { id: true, legalFirstName: true, legalLastName: true, employeeNumber: true } },
      },
      orderBy: { createdAt: "desc" },
      take: isContractor ? 100 : 500,
    }),
    // Contractors don't need period data (admin feature)
    isContractor
      ? ([] as any[])
      : database.timesheetPeriod.findMany({
          where: { organizationId: session.orgId },
          select: { id: true, name: true, startDate: true, endDate: true },
          orderBy: { startDate: "desc" },
        }),
    // Client invoices are managed from External Payments, not internal
    [] as any[],
    !isRL
      ? database.organization.findUnique({
          where: { id: session.orgId },
          select: { stripeConnectAccountId: true, stripeConnectStatus: true },
        })
      : null,
    // ACH collections — only relevant for RL admins
    isRL && !isContractor ? listAchCollections({ upcoming: true }) : Promise.resolve([]),
    database.organizationProfile.findUnique({
      where: { organizationId: session.orgId! },
      select: { paymentMethod: true },
    }),
  ]);

  const orgPaymentMethod = (orgProfile as any)?.paymentMethod ?? null;

  return (
    <>
      <Header page={isContractor ? "My Payments" : "Payments"} pages={isContractor ? [] : [isRL ? "RL Internal" : "RL External"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        {isRL && !isContractor && achRows.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-medium text-muted-foreground">ACH Collections — COR clients</h2>
            <AchCollectionsWidget initialRows={achRows} />
          </div>
        )}
        <PaymentsDashboard
          payments={serialize(payments)}
          periods={serialize(periods)}
          clientInvoices={clientInvoices as any}
          isRL={isRL}
          orgId={session.orgId}
          orgConnect={orgConnect ? { accountId: orgConnect.stripeConnectAccountId, status: orgConnect.stripeConnectStatus } : undefined}
          readOnly={isContractor}
          paymentMethod={orgPaymentMethod}
        />
      </div>
    </>
  );
};

export default PaymentsPage;
