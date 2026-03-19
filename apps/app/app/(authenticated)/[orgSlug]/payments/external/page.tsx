import { getSessionContext } from "@repo/auth/session";
import { getExternalPayments, getExternalPaymentStats, getClientOrganizations } from "@/app/actions/hriq/external-finance";
import { database } from "@repo/database";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Header } from "../../../components/header";
import { ExternalPaymentsDashboard } from "./external-payments-dashboard";
import { serialize } from "@/lib/hriq/serialize";

export const metadata: Metadata = { title: "External Payments" };

const ExternalPaymentsPage = async () => {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/sign-in");
  if (ctx.orgRole !== "super_admin") redirect("/");

  const [payments, stats, organizations, clientInvoices] = await Promise.all([
    getExternalPayments(),
    getExternalPaymentStats(),
    getClientOrganizations(),
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

  return (
    <>
      <Header page="External Payments" pages={["RL External"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <ExternalPaymentsDashboard
          payments={serialize(payments)}
          organizations={organizations}
          stats={stats}
          clientInvoices={serialize(clientInvoices)}
        />
      </div>
    </>
  );
};

export default ExternalPaymentsPage;
