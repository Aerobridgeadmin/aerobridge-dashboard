"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { useRouter, useParams } from "next/navigation";
import { FileWarningIcon, ShieldAlertIcon, XIcon, CheckIcon, EyeIcon, CheckCircleIcon } from "lucide-react";
import type { PendingDocAlert, AuditFlagAlert } from "@/app/actions/hriq/admin-alerts";

const DISMISS_KEY_DOCS = "hriq_docs_alert_dismissed_at";
const DISMISS_KEY_AUDIT = "hriq_audit_dismissed_run_at";
const DISMISS_KEY_AUDIT_TS = "hriq_audit_dismissed_ts";
const COOLDOWN_MS = 8 * 60 * 60 * 1000; // 8 hours (docs only)
const AUDIT_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours — show once per day

// ─── Types ────────────────────────────────────────────────────────────────────

type PopupPhase = "hidden" | "docs" | "docs_done" | "audit";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isDismissed(key: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    const ts = localStorage.getItem(key);
    if (!ts) return false;
    return Date.now() - Number(ts) < COOLDOWN_MS;
  } catch {
    return false;
  }
}

/** Check if the audit popup was dismissed for THIS run or a newer one,
 *  OR if it was dismissed within the last 24 hours (whichever is true). */
function isAuditDismissedForRun(latestRunAt: string | null): boolean {
  if (typeof window === "undefined" || !latestRunAt) return true;
  try {
    // 1. 24-hour cooldown — regardless of new runs, only show once per day
    const cooldownTs = localStorage.getItem(DISMISS_KEY_AUDIT_TS);
    if (cooldownTs && Date.now() - Number(cooldownTs) < AUDIT_COOLDOWN_MS) {
      return true;
    }
    // 2. Run-based — if no cooldown active, check if this exact run was already seen
    const dismissedAt = localStorage.getItem(DISMISS_KEY_AUDIT);
    if (!dismissedAt) return false;
    return dismissedAt >= latestRunAt;
  } catch {
    return false;
  }
}

function markDismissed(key: string) {
  try {
    localStorage.setItem(key, String(Date.now()));
  } catch {}
}

/** Store the audit run timestamp AND a 24h cooldown so popup won't
 *  reappear until the cooldown expires AND a newer run exists. */
function markAuditDismissed(latestRunAt: string | null) {
  try {
    if (latestRunAt) {
      localStorage.setItem(DISMISS_KEY_AUDIT, latestRunAt);
    }
    localStorage.setItem(DISMISS_KEY_AUDIT_TS, String(Date.now()));
  } catch {}
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtDocType(t: string) {
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AdminAlerts() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const router = useRouter();

  const [phase, setPhase] = useState<PopupPhase>("hidden");
  const [pendingDocs, setPendingDocs] = useState<PendingDocAlert[]>([]);
  const [auditFlags, setAuditFlags] = useState<AuditFlagAlert[]>([]);
  const [approvedCount, setApprovedCount] = useState(0);
  const [isPending, startTransition] = useTransition();

  // Refs to prevent double-fetch and track mount state
  const fetchedRef = useRef(false);
  const mountedRef = useRef(true);
  // Store audit flags in a ref so the docs_done → audit transition works
  // even if React batches state updates
  const auditFlagsRef = useRef<AuditFlagAlert[]>([]);
  // Store the latest audit run timestamp for run-based dismissal
  const latestAuditRunAtRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    // Guard: only fetch once, even with strict mode double-mount
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    // Delay 1.5s so the page finishes streaming/painting before popup appears
    const timer = setTimeout(() => {
      if (mountedRef.current) {
        doFetch();
      }
    }, 1500);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function doFetch() {
    try {
      const { getAdminAlerts } = await import("@/app/actions/hriq/admin-alerts");
      const data = await getAdminAlerts();
      if (!mountedRef.current) return;

      const hasDocs = !isDismissed(DISMISS_KEY_DOCS) && data.pendingDocs.length > 0;
      // Audit: only show if there are flags AND the latest run is newer than what was dismissed
      const hasAudit = data.auditFlags.length > 0 && !isAuditDismissedForRun(data.latestAuditRunAt);

      if (hasDocs) setPendingDocs(data.pendingDocs);
      if (hasAudit) {
        setAuditFlags(data.auditFlags);
        auditFlagsRef.current = data.auditFlags;
      }
      latestAuditRunAtRef.current = data.latestAuditRunAt;

      if (hasDocs) {
        setPhase("docs");
      } else if (hasAudit) {
        setPhase("audit");
      }
    } catch {}
  }

  // ─── Doc Actions ───

  const handleApproveDoc = (docId: string) => {
    startTransition(async () => {
      try {
        const { verifyExternalDocument } = await import("@/app/actions/hriq/external-operations");
        const result = await verifyExternalDocument(docId);
        if (result && !("error" in result)) {
          setApprovedCount((c) => c + 1);
          setPendingDocs((prev) => {
            const next = prev.filter((d) => d.id !== docId);
            if (next.length === 0) {
              // All gone — show success, then transition
              setPhase("docs_done");
              setTimeout(() => {
                if (!mountedRef.current) return;
                markDismissed(DISMISS_KEY_DOCS);
                setPhase(auditFlagsRef.current.length > 0 ? "audit" : "hidden");
              }, 2000);
            }
            return next;
          });
        }
      } catch {}
    });
  };

  const handleApproveAll = () => {
    const ids = pendingDocs.map((d) => d.id);
    startTransition(async () => {
      try {
        const { batchVerifyExternalDocuments } = await import("@/app/actions/hriq/external-operations");
        const result = await batchVerifyExternalDocuments(ids);
        if (result && !("error" in result)) {
          setApprovedCount(ids.length);
          setPendingDocs([]);
          setPhase("docs_done");
          setTimeout(() => {
            if (!mountedRef.current) return;
            markDismissed(DISMISS_KEY_DOCS);
            setPhase(auditFlagsRef.current.length > 0 ? "audit" : "hidden");
          }, 2000);
        }
      } catch {}
    });
  };

  const dismissDocs = () => {
    markDismissed(DISMISS_KEY_DOCS);
    setPhase(auditFlagsRef.current.length > 0 ? "audit" : "hidden");
  };

  const dismissAudit = () => {
    markAuditDismissed(latestAuditRunAtRef.current);
    setPhase("hidden");
  };

  // ─── Render ───

  if (phase === "hidden") return null;

  // ─── Documents Popup ───

  if (phase === "docs" && pendingDocs.length > 0) {
    return (
      <Overlay onClose={dismissDocs}>
        {/* Header */}
        <div className="flex items-center gap-3 border-b px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
            <FileWarningIcon className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold">Documents Awaiting Approval</h2>
            <p className="text-xs text-muted-foreground">
              {pendingDocs.length} document{pendingDocs.length !== 1 ? "s" : ""} pending review
              {approvedCount > 0 && (
                <span className="text-emerald-600 dark:text-emerald-400"> ({approvedCount} approved)</span>
              )}
            </p>
          </div>
          <button onClick={dismissDocs} className="rounded-md p-1.5 hover:bg-muted" aria-label="Close">
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Document list */}
        <div className="max-h-72 overflow-y-auto divide-y">
          {pendingDocs.map((doc) => (
            <div key={doc.id} className="flex items-center gap-3 px-5 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{doc.documentName}</p>
                <p className="text-xs text-muted-foreground">
                  {doc.employeeName} &middot; {fmtDocType(doc.documentType)} &middot; {fmtDate(doc.createdAt)}
                </p>
              </div>
              <button
                onClick={() => handleApproveDoc(doc.id)}
                disabled={isPending}
                className="flex-shrink-0 inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                <CheckIcon className="h-3 w-3" />
                Approve
              </button>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t px-5 py-3">
          <button
            onClick={() => { dismissDocs(); router.push(`/${orgSlug}/documents/external`); }}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <EyeIcon className="h-3 w-3" />
            View All Documents
          </button>
          <div className="flex gap-2">
            <button onClick={dismissDocs} className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted transition-colors">
              Dismiss
            </button>
            {pendingDocs.length > 1 && (
              <button
                onClick={handleApproveAll}
                disabled={isPending}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {isPending ? "Approving..." : `Approve All (${pendingDocs.length})`}
              </button>
            )}
          </div>
        </div>
      </Overlay>
    );
  }

  // ─── Documents Done (success flash) ───

  if (phase === "docs_done") {
    return (
      <Overlay onClose={() => setPhase(auditFlagsRef.current.length > 0 ? "audit" : "hidden")}>
        <div className="flex flex-col items-center gap-3 px-6 py-10">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
            <CheckCircleIcon className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="text-base font-semibold">All Documents Approved</p>
          <p className="text-sm text-muted-foreground">
            {approvedCount} document{approvedCount !== 1 ? "s" : ""} verified
          </p>
        </div>
      </Overlay>
    );
  }

  // ─── Offboarding Audit Popup ───

  if (phase === "audit" && auditFlags.length > 0) {
    const totalFlags = auditFlags.reduce((s, r) => s + r.totalFlags, 0);
    const uniqueEmps = new Set(auditFlags.map((r) => r.employeeEmail)).size;

    return (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
        onClick={(e) => { if (e.target === e.currentTarget) dismissAudit(); }}
      >
        <div
          className="w-full max-w-lg rounded-xl border border-red-300 bg-background shadow-2xl dark:border-red-900/60 animate-in fade-in slide-in-from-bottom-4 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-3 border-b border-red-200 bg-red-50 px-5 py-4 rounded-t-xl dark:border-red-900/40 dark:bg-red-950/30">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/50">
              <ShieldAlertIcon className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-red-800 dark:text-red-300">
                Urgent: Active Accounts on Offboarded Contractors
              </h2>
              <p className="text-xs text-red-700/80 dark:text-red-400/70">
                {totalFlags} active account{totalFlags !== 1 ? "s" : ""} found across {uniqueEmps} offboarded employee{uniqueEmps !== 1 ? "s" : ""}
              </p>
            </div>
            <button onClick={dismissAudit} className="rounded-md p-1.5 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/40" aria-label="Close">
              <XIcon className="h-4 w-4" />
            </button>
          </div>

          <div className="max-h-60 overflow-y-auto divide-y">
            {auditFlags.map((run) => (
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

          <div className="flex items-center justify-between border-t px-5 py-3">
            <p className="text-xs text-muted-foreground">These accounts need immediate access removal.</p>
            <div className="flex gap-2">
              <button onClick={dismissAudit} className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted transition-colors">
                Dismiss
              </button>
              <button
                onClick={() => { dismissAudit(); router.push(`/${orgSlug}/reports?tab=offboarding`); }}
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

  return null;
}

// ─── Shared Overlay ──────────────────────────────────────────────────────────

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-lg rounded-xl border bg-background shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
