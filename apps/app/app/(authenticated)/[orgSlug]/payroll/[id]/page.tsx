import { requireOrg } from "@repo/auth/session";
import { database } from "@repo/database";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { Header } from "../../../components/header";
import { ClientPayRunReview } from "./client-pay-run-review";

export const metadata: Metadata = { title: "Review Pay Run" };

const RL_ORG_ID = process.env.RL_ORGANIZATION_ID ?? "org_rl_001";

type Props = { params: Promise<{ id: string; orgSlug: string }> };

const ClientPayRunDetailPage = async ({ params }: Props) => {
  const session = await requireOrg();
  const isRL = session.orgId === RL_ORG_ID;
  const { id, orgSlug } = await params;

  const payRun = await database.payRun.findUnique({
    where: { id },
    include: {
      organization: { select: { id: true, name: true } },
      items: {
        include: {
          employee: {
            select: {
              id: true,
              employeeNumber: true,
              legalFirstName: true,
              legalLastName: true,
            },
          },
        },
        orderBy: { employee: { legalFirstName: "asc" } },
      },
    },
  });

  if (!payRun) notFound();
  if (payRun.organizationId !== session.orgId) redirect(`/${orgSlug}/payroll`);

  return (
    <>
      <Header page={payRun.name} pages={[isRL ? "RL Internal" : "RL External", "Payroll"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <ClientPayRunReview
          isRL={isRL}
          payRun={{
            id: payRun.id,
            name: payRun.name,
            orgName: payRun.organization.name,
            periodStart: payRun.periodStart.toISOString(),
            periodEnd: payRun.periodEnd.toISOString(),
            status: payRun.status,
            totalAmount: Number(payRun.totalAmount),
            rlFeeTotal: Number(payRun.rlFeeTotal ?? 0),
            grandTotal: Number(payRun.grandTotal),
            currency: payRun.currency,
            notes: payRun.notes,
            approvedByName: payRun.approvedByName,
            approvedAt: payRun.approvedAt?.toISOString() ?? null,
            paidAt: payRun.paidAt?.toISOString() ?? null,
            paymentLink: payRun.paymentLink,
          }}
          items={payRun.items.map((item: any) => ({
            id: item.id,
            employeeName: `${item.employee.legalFirstName} ${item.employee.legalLastName}`,
            employeeNumber: item.employee.employeeNumber,
            description: item.description,
            hoursWorked: item.hoursWorked ? Number(item.hoursWorked) : null,
            hourlyRate: item.hourlyRate ? Number(item.hourlyRate) : null,
            grossAmount: Number(item.grossAmount),
            deductions: Number(item.deductions),
            netAmount: Number(item.netAmount),
          }))}
        />
      </div>
    </>
  );
};

export default ClientPayRunDetailPage;
