import { requireOrg } from "@repo/auth/session";
import { database } from "@repo/database";
import type { Metadata } from "next";
import { Header } from "../../components/header";
import { CommissionDashboard } from "./commission-dashboard";
import { serialize } from "@/lib/hriq/serialize";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Commissions" };

const CommissionsPage = async () => {
  const session = await requireOrg();

  // Only super_admin and manager can access commissions
  if (!["super_admin", "manager"].includes(session.orgRole)) {
    redirect("/");
  }

  const canManage = ["super_admin", "manager"].includes(session.orgRole);

  const [commissions, employees, stats] = await Promise.all([
    database.commission.findMany({
      include: {
        employee: {
          select: {
            id: true,
            legalFirstName: true,
            legalLastName: true,
            preferredName: true,
            department: true,
            photoUrl: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    database.employee.findMany({
      where: {
        organizationId: process.env.RL_ORGANIZATION_ID ?? "org_rl_001",
        employmentStatus: { in: ["active", "onboarding_in_progress"] },
      },
      select: {
        id: true,
        legalFirstName: true,
        legalLastName: true,
        preferredName: true,
        department: true,
      },
      orderBy: { legalFirstName: "asc" },
    }),
    Promise.all([
      database.commission.aggregate({ where: { status: "pending" }, _sum: { commissionAmount: true }, _count: true }),
      database.commission.aggregate({ where: { status: "approved" }, _sum: { commissionAmount: true }, _count: true }),
      database.commission.aggregate({ where: { status: "paid" }, _sum: { commissionAmount: true }, _count: true }),
    ]),
  ]);

  const summaryStats = {
    pending: { count: stats[0]._count, total: Number(stats[0]._sum.commissionAmount ?? 0) },
    approved: { count: stats[1]._count, total: Number(stats[1]._sum.commissionAmount ?? 0) },
    paid: { count: stats[2]._count, total: Number(stats[2]._sum.commissionAmount ?? 0) },
  };

  return (
    <>
      <Header page="Commissions" pages={["Hiring Manager"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <CommissionDashboard
          commissions={serialize(commissions)}
          employees={serialize(employees)}
          stats={summaryStats}
          canManage={canManage}
          role={session.orgRole}
        />
      </div>
    </>
  );
};

export default CommissionsPage;
