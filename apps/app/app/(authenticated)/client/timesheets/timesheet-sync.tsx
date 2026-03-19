"use client";

import { syncContractorTimesheet, syncAllTimesheets } from "@/app/actions/hriq/sync-timesheets";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type ContractorWithSheet = {
  id: string;
  legalFirstName: string;
  legalLastName: string;
  googleSheetId: string | null;
};

export function TimesheetSync({ contractorsWithSheets }: { contractorsWithSheets: ContractorWithSheet[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [results, setResults] = useState<Array<{ name: string; action: string; totalHours?: number; error?: string }>>([]);
  const [showSetup, setShowSetup] = useState(false);

  const handleSyncAll = () => {
    startTransition(async () => {
      const res = await syncAllTimesheets();
      setResults(res);
      router.refresh();
    });
  };

  const handleSyncOne = (employeeId: string, sheetId: string) => {
    startTransition(async () => {
      try {
        const res = await syncContractorTimesheet(employeeId, sheetId);
        setResults([{ name: res.employeeName, action: res.action, totalHours: res.totalHours }]);
        router.refresh();
      } catch (err) {
        setResults([{ name: "Error", action: "error", error: err instanceof Error ? err.message : "Failed" }]);
      }
    });
  };

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Google Sheets Sync</h3>
          <p className="text-xs text-muted-foreground">{contractorsWithSheets.length} contractors with linked timesheets</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowSetup(!showSetup)} className="h-9 rounded-md border px-3 text-sm hover:bg-accent">
            {showSetup ? "Hide" : "Setup"}
          </button>
          {contractorsWithSheets.length > 0 && (
            <button onClick={handleSyncAll} disabled={isPending} className="h-9 whitespace-nowrap rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {isPending ? "Syncing..." : "Sync All Timesheets"}
            </button>
          )}
        </div>
      </div>

      {showSetup && (
        <div className="mt-4 rounded-lg bg-muted/50 p-4">
          <h4 className="text-sm font-medium">How to set up:</h4>
          <ol className="mt-2 space-y-1 text-sm text-muted-foreground">
            <li>1. Each contractor has their own Google Sheet timesheet</li>
            <li>2. They share the sheet with <strong>calendar-scheduler@sso-implementation-481223.iam.gserviceaccount.com</strong></li>
            <li>3. Copy the Sheet ID from the URL (the long string between /d/ and /edit)</li>
            <li>4. Go to the contractor&apos;s profile → Edit Details → paste the Sheet ID in the &quot;Timezone&quot; field (temporary)</li>
            <li>5. Or set it via the &quot;TimeDoctorEmail&quot; field in the database</li>
          </ol>
          {contractorsWithSheets.length > 0 && (
            <div className="mt-3">
              <h4 className="text-sm font-medium">Linked contractors:</h4>
              <div className="mt-2 space-y-1">
                {contractorsWithSheets.map((c) => (
                  <div key={c.id} className="flex items-center justify-between rounded-md border p-2">
                    <span className="text-sm">{c.legalFirstName} {c.legalLastName}</span>
                    <button onClick={() => handleSyncOne(c.id, c.googleSheetId!)} disabled={isPending} className="h-7 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-50">
                      Sync
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {results.length > 0 && (
        <div className="mt-4 space-y-1">
          {results.map((r, i) => (
            <div key={i} className={`rounded-md p-2 text-sm ${r.action === "error" ? "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200" : "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200"}`}>
              <strong>{r.name}</strong>: {r.action === "error" ? r.error : `${r.action} — ${r.totalHours}h total`}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
