"use client";

import { useEffect, useState, useRef } from "react";
import { ShieldAlertIcon, XIcon } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import type { AuditFlagAlert } from "@/app/actions/hriq/admin-alerts";

const DISMISS_KEY = "hriq_audit_banner_dismissed_at";
const COOLDOWN_MS = 8 * 60 * 60 * 1000; // 8 hours

export function OffboardingAuditBanner() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const router = useRouter();
  const [flaggedRuns, setFlaggedRuns] = useState<AuditFlagAlert[]>([]);
  const [visible, setVisible] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    try {
      const last = localStorage.getItem(DISMISS_KEY);
      if (last && Date.now() - Number(last) < COOLDOWN_MS) return;
    } catch {}

    async function check() {
      try {
        const { getAdminAlerts } = await import("@/app/actions/hriq/admin-alerts");
        const data = await getAdminAlerts();
        if (!mountedRef.current) return;
        if (data.auditFlags.length > 0) {
          setFlaggedRuns(data.auditFlags);
          setVisible(true);
        }
      } catch {}
    }
    check();
  }, []);

  const dismiss = () => {
    setVisible(false);
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
  };

  if (!visible || flaggedRuns.length === 0) return null;

  const totalFlags = flaggedRuns.reduce((s, r) => s + r.totalFlags, 0);
  const uniqueEmployees = new Set(flaggedRuns.map((r) => r.employeeEmail)).size;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) dismiss(); }}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-red-300 bg-background shadow-2xl dark:border-red-900/60 animate-in fade-in slide-in-from-bottom-4 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-red-200 bg-red-50 px-5 py-4 rounded-t-xl dark:border-red-900/40 dark:bg-red-950/30">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/50">
            <ShieldAlertIcon className="h-5 w-5 text-red-600 dark:text-red-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-red-800 dark:text-red-300">
              Urgent: Active Accounts on Offboarded Contractors
            </h2>
            <p className="text-xs text-red-700/80 dark:text-red-400/70">
              {totalFlags} active account{totalFlags !== 1 ? "s" : ""} found across {uniqueEmployees} offboarded employee{uniqueEmployees !== 1 ? "s" : ""}
            </p>
          </div>
          <button onClick={dismiss} className="rounded-md p-1.5 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/40" aria-label="Close">
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Employee list */}
        <div className="max-h-60 overflow-y-auto divide-y">
          {flaggedRuns.map((run) => (
            <div key={run.id} className="flex items-center justify-between px-5 py-3">
              <div>
                <p className="text-sm font-medium">{run.employeeName}</p>
                <p className="text-xs text-muted-foreground">{run.employeeEmail}</p>
              </div>
              <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-300">
                {run.totalFlags} flag{run.totalFlags !== 1 ? "s" : ""}
              </span>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t px-5 py-3">
          <p className="text-xs text-muted-foreground">These accounts need immediate access removal.</p>
          <div className="flex gap-2">
            <button onClick={dismiss} className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted transition-colors">
              Dismiss
            </button>
            <button
              onClick={() => { dismiss(); router.push(`/${orgSlug}/reports?tab=offboarding`); }}
              className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 transition-colors"
            >
              Review Now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
