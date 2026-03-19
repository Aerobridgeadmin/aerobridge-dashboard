import { getMyContracts } from "@/app/actions/hriq/contractor-self-service";
import { shortDate, fullDate } from "@/lib/hriq/format";
import type { Metadata } from "next";
import { Header } from "../../components/header";

export const metadata: Metadata = {
  title: "My Contracts",
  description: "View your signed contracts and agreements",
};

const STATUS_COLORS: Record<string, string> = {
  signed: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  viewed: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  declined: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  expired: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

const CATEGORY_ICONS: Record<string, string> = {
  general: "CT",
  nda: "ND",
  employment: "EM",
  service: "SV",
  confidentiality: "CF",
};

export default async function VAContractsPage() {
  const contracts = await getMyContracts();

  return (
    <>
      <Header page="My Contracts" pages={["Self Service"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0 max-w-3xl">
        <div>
          <h2 className="text-lg font-bold">My Contracts & Agreements</h2>
          <p className="text-xs text-muted-foreground">
            {contracts.length} contract{contracts.length !== 1 ? "s" : ""} on file
          </p>
        </div>

        <div className="space-y-3">
          {contracts.map((c: any) => {
            const isSigned = c.status === "signed";
            const isPending = c.status === "pending" || c.status === "viewed";
            const icon = CATEGORY_ICONS[c.template.category] ?? "CT";

            return (
              <div key={c.id} className="rounded-xl border bg-card overflow-hidden">
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl shrink-0 mt-0.5">{icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm truncate">{c.template.name}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${STATUS_COLORS[c.status] ?? "bg-muted"}`}>
                          {c.status}
                        </span>
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] capitalize">
                          {c.template.category}
                        </span>
                      </div>

                      {c.template.description && (
                        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{c.template.description}</p>
                      )}

                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                        {c.sentAt && (
                          <span>Sent {fullDate(c.sentAt)}</span>
                        )}
                        {c.signedAt && (
                          <span className="text-green-600 dark:text-green-400 font-medium">
                            Signed {fullDate(c.signedAt)}
                          </span>
                        )}
                        {c.expiresAt && !isSigned && (
                          <span className="text-amber-600">
                            Expires {shortDate(c.expiresAt)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex shrink-0 gap-2">
                      {isSigned && c.signedDocumentUrl && (
                        <a
                          href={c.signedDocumentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-md border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
                        >
                          Download
                        </a>
                      )}
                      {isPending && c.docusealSubmitterSlug && (
                        <a
                          href={`https://docuseal.co/s/${c.docusealSubmitterSlug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                        >
                          Sign Now
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                {/* Signed confirmation bar */}
                {isSigned && (
                  <div className="border-t bg-green-50 px-4 py-2 dark:bg-green-950/30">
                    <div className="flex items-center gap-2 text-xs text-green-700 dark:text-green-300">
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>Signed and executed</span>
                      {c.signerName && <span>by {c.signerName}</span>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {contracts.length === 0 && (
            <div className="rounded-xl border bg-card py-12 text-center">
              
              <div className="text-muted-foreground text-sm">No contracts on file yet.</div>
              <div className="text-xs text-muted-foreground mt-1">Contracts will appear here when sent by your administrator.</div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
