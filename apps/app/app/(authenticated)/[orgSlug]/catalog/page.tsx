import { getSessionContext } from "@repo/auth/session";
import { database } from "@repo/database";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Header } from "../../components/header";
import { CatalogClient } from "./catalog-client";
import { serialize } from "@/lib/hriq/serialize";

export const metadata: Metadata = {
  title: "Service Catalog",
  description: "Remote Leverage service offerings",
};

type PageProps = {
  params: Promise<{ orgSlug: string }>;
};

const CatalogPage = async ({ params: paramsPromise }: PageProps) => {
  const session = await getSessionContext();
  if (!session) redirect("/sign-in");
  if (session.orgRole !== "super_admin") redirect("/");

  const { orgSlug } = await paramsPromise;

  const RL_ORG_ID = process.env.RL_ORGANIZATION_ID ?? "org_rl_001";

  // Get all client organizations (excluding RL) with their service agreement status
  const orgs = await database.organization.findMany({
    where: { id: { not: RL_ORG_ID } },
    select: {
      id: true,
      name: true,
      slug: true,
      stripeCustomerId: true,
      profile: {
        select: {
          adminName: true,
          adminEmail: true,
          adminPhone: true,
          adminTitle: true,
          billingEmail: true,
          address: true,
          country: true,
        },
      },
      serviceAgreements: {
        where: { status: "active" },
        select: {
          id: true,
          name: true,
          feeType: true,
          feeAmount: true,
          status: true,
          startDate: true,
          notes: true,
        },
      },
      _count: {
        select: {
          employees: { where: { employmentStatus: { not: "offboarded" } } },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return (
    <>
      <Header page="Service Catalog" pages={["RL Internal"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <CatalogClient orgs={serialize(orgs)} orgSlug={orgSlug} />
      </div>
    </>
  );
};

export default CatalogPage;
