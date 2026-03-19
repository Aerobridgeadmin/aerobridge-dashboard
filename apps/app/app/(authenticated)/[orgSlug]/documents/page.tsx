import { requireOrg, getSessionContext } from "@repo/auth/session";
import { database } from "@repo/database";
import type { Metadata } from "next";
import { Header } from "../../components/header";
import { DocumentActions } from "./document-actions";
import { DocumentsTable } from "./documents-table";
import { MyDocuments } from "./my-documents";

export const metadata: Metadata = { title: "Documents" };

const DocumentsPage = async () => {
  const session = await requireOrg();
  const ctx = await getSessionContext();
  const isAdmin = ["super_admin", "admin", "manager"].includes(ctx?.orgRole ?? "");

  if (isAdmin) {
    const [documents, contractors] = await Promise.all([
      database.document.findMany({
        where: { employee: { organizationId: session.orgId } },
        include: { employee: { select: { id: true, legalFirstName: true, legalLastName: true, employeeNumber: true } } },
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
      database.employee.findMany({
        where: { organizationId: session.orgId, employmentStatus: { not: "offboarded" } },
        select: { id: true, legalFirstName: true, legalLastName: true, employeeNumber: true },
        orderBy: { legalFirstName: "asc" },
      })]);

    const serialized = documents.map((d: any) => ({
      ...d,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
      expiryDate: d.expiryDate?.toISOString() ?? null,
      issuedDate: d.issuedDate?.toISOString() ?? null,
      verifiedAt: d.verifiedAt?.toISOString() ?? null,
    }));
    return (
      <>
        <Header page="Documents" pages={[ctx?.orgRole === "super_admin" ? "RL Internal" : "Client Portal"]} />
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <DocumentActions contractors={contractors} />
          <DocumentsTable documents={serialized} />
        </div>
      </>
    );
  }

  // VA view
  const employee = await database.employee.findFirst({ where: { linkedUserId: session.userId, ...(session.orgId ? { organizationId: session.orgId } : {}) }, select: { id: true } });
  const documents = employee ? await database.document.findMany({ where: { employeeId: employee.id }, orderBy: { createdAt: "desc" } }) : [];
  return (
    <>
      <Header page="My Documents" pages={["Self Service"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0"><MyDocuments documents={documents} hasProfile={!!employee} /></div>
    </>
  );
};

export default DocumentsPage;
