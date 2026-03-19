import { getSessionContext } from "@repo/auth/session";
import { redirect } from "next/navigation";
import { getExternalDocuments, getExternalDocumentStats } from "@/app/actions/hriq/external-operations";
import { getClientOrganizations } from "@/app/actions/hriq/external-finance";
import type { Metadata } from "next";
import { Header } from "../../../components/header";
import { ExternalDocumentsDashboard } from "./external-documents-dashboard";

export const metadata: Metadata = { title: "External Documents" };

const ExternalDocumentsPage = async () => {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/sign-in");
  if (ctx.orgRole !== "super_admin") redirect("/");

  const [documents, stats, organizations] = await Promise.all([
    getExternalDocuments(),
    getExternalDocumentStats(),
    getClientOrganizations(),
  ]);

  const serialized = (documents as any[]).map((d: any) => ({
    ...d,
    createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : d.createdAt,
    updatedAt: d.updatedAt instanceof Date ? d.updatedAt.toISOString() : d.updatedAt,
    expiryDate: d.expiryDate instanceof Date ? d.expiryDate.toISOString() : d.expiryDate ?? null,
    issuedDate: d.issuedDate instanceof Date ? d.issuedDate.toISOString() : d.issuedDate ?? null,
    verifiedAt: d.verifiedAt instanceof Date ? d.verifiedAt.toISOString() : d.verifiedAt ?? null,
  }));

  return (
    <>
      <Header page="External Documents" pages={["Client Orgs"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <ExternalDocumentsDashboard documents={serialized} organizations={organizations} stats={stats} />
      </div>
    </>
  );
};

export default ExternalDocumentsPage;
