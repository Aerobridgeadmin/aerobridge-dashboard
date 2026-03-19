"use client";

import { useState, useTransition } from "react";
import { useErrorDialog } from "@/app/(authenticated)/components/error-dialog";
import { listAchCollections, retryAchCollection, type AchCollectionRow } from "@/app/actions/hriq/ach-collections";
import { useRouter } from "next/navigation";

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  SCHEDULED:         { label: "Scheduled",          className: "bg-amber-50 text-amber-700 border border-amber-200" },
  PROCESSING:        { label: "Processing",          className: "bg-blue-50 text-blue-700 border border-blue-200" },
  COLLECTED:         { label: "Collected",           className: "bg-green-50 text-green-700 border border-green-200" },
  FAILED:            { label: "Failed — retrying",   className: "bg-red-50 text-red-600 border border-red-200" },
  PERMANENTLY_FAILED:{ label: "Permanently failed",  className: "bg-red-100 text-red-800 border border-red-300 font-medium" },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtAmount(amount: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(amount));
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_LABELS[status] ?? { label: status, className: "bg-gray-100 text-gray-600" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

export function AchCollectionsWidget({
  initialRows,
}: {
  initialRows: AchCollectionRow[];
}) {
  const [rows, setRows] = useState<AchCollectionRow[]>(initialRows);
  const [isPending, startTransition] = useTransition();
  const { showError } = useErrorDialog();
  const router = useRouter();

  async function handleRetry(id: string, orgName: string) {
    startTransition(async () => {
      const res = await retryAchCollection(id);
      if (!res.success) {
        showError(`Failed to retry ACH for ${orgName}: ${res.error}`);
        return;
      }
      // Refresh
      const fresh = await listAchCollections({ upcoming: true });
      setRows(fresh);
    });
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border py-6 text-center text-sm text-muted-foreground">
        No ACH collections scheduled in the next 30 days.
      </div>
    );
  }

  const totalPending = rows
    .filter((r) => ["SCHEDULED", "PROCESSING", "FAILED"].includes(r.status))
    .reduce((s, r) => s + Number(r.amount), 0);

  const totalCollected = rows
    .filter((r) => r.status === "COLLECTED")
    .reduce((s, r) => s + Number(r.amount), 0);

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div className="flex gap-3">
        <div className="flex-1 rounded-lg bg-muted/40 px-4 py-3">
          <p className="text-xs text-muted-foreground">Pending collection</p>
          <p className="text-lg font-medium">{fmtAmount(String(totalPending))}</p>
        </div>
        <div className="flex-1 rounded-lg bg-green-50 px-4 py-3">
          <p className="text-xs text-muted-foreground">Collected this view</p>
          <p className="text-lg font-medium text-green-700">{fmtAmount(String(totalCollected))}</p>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
              <th className="px-3 py-2.5 text-left font-normal">Client</th>
              <th className="px-3 py-2.5 text-left font-normal">Period</th>
              <th className="px-3 py-2.5 text-right font-normal">Amount</th>
              <th className="px-3 py-2.5 text-left font-normal">Collect date</th>
              <th className="px-3 py-2.5 text-left font-normal">Payout date</th>
              <th className="px-3 py-2.5 text-left font-normal">Status</th>
              <th className="px-3 py-2.5 text-left font-normal">Retries</th>
              <th className="px-3 py-2.5 text-left font-normal"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-border/60 last:border-0 hover:bg-muted/20"
              >
                <td className="px-3 py-2.5 font-medium">{row.orgName}</td>
                <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{row.payPeriod}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmtAmount(row.amount)}</td>
                <td className="px-3 py-2.5">{fmtDate(row.scheduledDate)}</td>
                <td className="px-3 py-2.5">{fmtDate(row.payoutDate)}</td>
                <td className="px-3 py-2.5">
                  <StatusBadge status={row.status} />
                  {row.failureReason && (
                    <p className="mt-0.5 text-xs text-red-500 truncate max-w-[180px]" title={row.failureReason}>
                      {row.failureReason}
                    </p>
                  )}
                </td>
                <td className="px-3 py-2.5 text-center text-xs text-muted-foreground">
                  {row.retryCount > 0 ? `${row.retryCount}/3` : "—"}
                </td>
                <td className="px-3 py-2.5">
                  {(row.status === "FAILED" || row.status === "PERMANENTLY_FAILED") && (
                    <button
                      onClick={() => handleRetry(row.id, row.orgName)}
                      disabled={isPending}
                      className="rounded border border-border px-2 py-1 text-xs hover:bg-muted/50 disabled:opacity-50"
                    >
                      Retry
                    </button>
                  )}
                  {row.status === "COLLECTED" && row.collectedAt && (
                    <span className="text-xs text-muted-foreground">
                      {fmtDate(row.collectedAt)}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
