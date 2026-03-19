import { requireSession } from "@repo/auth/session";
import { database } from "@repo/database";
import type { Metadata } from "next";
import { Header } from "../../components/header";

export const metadata: Metadata = { title: "My Documents" };

const VADocumentsPage = async () => {
  const session = await requireSession();

  const employee = await database.employee.findFirst({
    where: { linkedUserId: session.userId },
  });

  const documents = employee
    ? await database.document.findMany({
        where: { employeeId: employee.id },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const statusColors: Record<string, string> = {
    verified: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    rejected: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  };

  return (
    <>
      <Header page="My Documents" pages={["Self Service"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="space-y-3">
          {documents.map((doc) => (
            <div key={doc.id} className="flex items-center justify-between rounded-xl border bg-card p-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{doc.documentName}</span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs capitalize">{doc.documentType.replace(/_/g, " ")}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${statusColors[doc.status] ?? ""}`}>{doc.status}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Uploaded {new Date(doc.createdAt).toLocaleDateString()}
                </p>
              </div>
              {doc.fileUrl && (
                <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent">
                  View
                </a>
              )}
            </div>
          ))}
          {documents.length === 0 && (
            <div className="py-12 text-center text-muted-foreground">
              {employee ? "No documents uploaded yet." : "No employee profile linked to your account."}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default VADocumentsPage;
