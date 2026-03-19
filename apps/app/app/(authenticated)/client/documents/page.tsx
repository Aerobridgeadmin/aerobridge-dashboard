import { requireOrg } from "@repo/auth/session";
import { database } from "@repo/database";
import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "../../components/header";
import { DocumentActions } from "./document-actions";

export const metadata: Metadata = { title: "Documents" };

const DocumentsPage = async () => {
  const session = await requireOrg();

  const [documents, contractors] = await Promise.all([
    database.document.findMany({
      where: { employee: { organizationId: session.orgId } },
      include: {
        employee: { select: { id: true, legalFirstName: true, legalLastName: true, employeeNumber: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    database.employee.findMany({
      where: { organizationId: session.orgId, employmentStatus: { not: "offboarded" } },
      select: { id: true, legalFirstName: true, legalLastName: true, employeeNumber: true },
      orderBy: { legalFirstName: "asc" },
    }),
  ]);

  const statusColors: Record<string, string> = {
    verified: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    rejected: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  };

  return (
    <>
      <Header page="Documents" pages={["RL Internal"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <DocumentActions contractors={contractors} />
        <div className="rounded-xl border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b text-left text-sm text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Document</th>
                  <th className="px-4 py-3 font-medium">Contractor</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="px-4 py-3">
                      <span className="font-medium">{doc.documentName}</span>
                      {doc.fileUrl && (
                        <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="ml-2 text-xs text-blue-600 hover:underline dark:text-blue-400">View</a>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <Link href={`/client/employees/${doc.employee.id}`} className="hover:underline">
                        {doc.employee.legalFirstName} {doc.employee.legalLastName}
                      </Link>
                    </td>
                    <td className="px-4 py-3"><span className="rounded bg-muted px-1.5 py-0.5 text-xs capitalize">{doc.documentType.replace(/_/g, " ")}</span></td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs capitalize ${statusColors[doc.status] ?? ""}`}>{doc.status}</span></td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{new Date(doc.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
                {documents.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No documents yet. Add one above.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
};

export default DocumentsPage;
