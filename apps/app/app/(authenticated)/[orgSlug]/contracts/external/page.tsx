import { getSessionContext } from "@repo/auth/session";
import { redirect } from "next/navigation";
import { getExternalContracts, getExternalContractStats } from "@/app/actions/hriq/external-operations";
import { getClientOrganizations } from "@/app/actions/hriq/external-finance";
import type { Metadata } from "next";
import { Header } from "../../../components/header";
import { ExternalContractsDashboard } from "./external-contracts-dashboard";

export const metadata: Metadata = { title: "External Contracts" };

const ExternalContractsPage = async () => {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/sign-in");
  if (ctx.orgRole !== "super_admin") redirect("/");

  const [contracts, stats, organizations] = await Promise.all([
    getExternalContracts(),
    getExternalContractStats(),
    getClientOrganizations(),
  ]);

  const serialized = (contracts as any[]).map((c: any) => ({
    ...c,
    sentAt: c.sentAt instanceof Date ? c.sentAt.toISOString() : c.sentAt ?? null,
    viewedAt: c.viewedAt instanceof Date ? c.viewedAt.toISOString() : c.viewedAt ?? null,
    signedAt: c.signedAt instanceof Date ? c.signedAt.toISOString() : c.signedAt ?? null,
    declinedAt: c.declinedAt instanceof Date ? c.declinedAt.toISOString() : c.declinedAt ?? null,
    expiresAt: c.expiresAt instanceof Date ? c.expiresAt.toISOString() : c.expiresAt ?? null,
    createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
    updatedAt: c.updatedAt instanceof Date ? c.updatedAt.toISOString() : c.updatedAt,
  }));

  return (
    <>
      <Header page="External Contracts" pages={["Client Orgs"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <ExternalContractsDashboard contracts={serialized} organizations={organizations} stats={stats} />
      </div>
    </>
  );
};

export default ExternalContractsPage;
