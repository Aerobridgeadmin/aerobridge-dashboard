"use client";

import { getMissingTimesheets, sendMissingTimesheetReminders, type MissingTimesheetEntry } from "@/app/actions/hriq/timesheets";
import { useErrorDialog } from "@/app/(authenticated)/components/error-dialog";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

/**
 * Compact "Reminders" button with badge count.
 * Clicking opens a dropdown showing who's missing timesheets + send reminders action.
 */
export function MissingTimesheets({ periodId }: { periodId: string }) {
  const [isPending, startTransition] = useTransition();
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const pathname = usePathname();
  const { showError, showSuccess } = useErrorDialog();
  const [missing, setMissing] = useState<MissingTimesheetEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    startTransition(async () => {
      try {
        const data = await getMissingTimesheets();
        setMissing(data);
        setLoaded(true);
      } catch {
        setLoaded(true);
      }
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleSendReminders = () => {
    startTransition(async () => {
      try {
        const rawResult = await sendMissingTimesheetReminders(periodId);
        if ("error" in rawResult) { showError({ title: "Error", message: (rawResult as any).error ?? "An error occurred" }); return; }
        const result = rawResult as Exclude<typeof rawResult, { error: string }>;
        showSuccess(`Sent ${result.sent ?? 0} reminder${(result.sent ?? 0) > 1 ? "s" : ""}${(result.failed ?? 0) > 0 ? ` (${result.failed} failed)` : ""}.`);
        setOpen(false);
      } catch (err) {
        showError({ title: "Error", message: err instanceof Error ? err.message : "Failed to send reminders" });
      }
    });
  };

  if (!loaded) return null;

  const periodMissing = missing.filter((m) => m.periodId === periodId);
  if (periodMissing.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      {/* Compact button with badge */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="relative h-9 rounded-md border border-amber-300 bg-amber-50 px-3 text-sm font-medium text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300 dark:hover:bg-amber-900/40 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
          </svg>
          Reminders
        </span>
        {/* Badge */}
        <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-600 px-1 text-[10px] font-bold text-white">
          {periodMissing.length}
        </span>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 w-80 rounded-xl border bg-card shadow-lg animate-in fade-in zoom-in-95 duration-150">
          <div className="px-4 py-3 border-b">
            <p className="text-sm font-semibold">
              {periodMissing.length} missing timesheet{periodMissing.length > 1 ? "s" : ""}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">These contractors haven&apos;t started filling out their timesheets</p>
          </div>
          <div className="px-3 py-2 max-h-48 overflow-y-auto space-y-1">
            {periodMissing.map((c) => (
              <Link
                key={c.employeeId}
                href={`/${orgSlug}/employees/${c.employeeId}?from=${encodeURIComponent(pathname)}`}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted transition-colors"
              >
                <span className="h-6 w-6 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center text-[10px] font-bold text-amber-700 dark:text-amber-300">
                  {c.name.charAt(0)}
                </span>
                <span className="font-medium">{c.name}</span>
              </Link>
            ))}
          </div>
          <div className="px-3 py-2.5 border-t">
            <button
              onClick={handleSendReminders}
              disabled={isPending}
              className="w-full h-8 rounded-md bg-amber-600 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50 transition-colors"
            >
              {isPending ? "Sending..." : `Send Reminders to ${periodMissing.length} Contractor${periodMissing.length > 1 ? "s" : ""}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
