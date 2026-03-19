"use client";

import { CustomSelect } from "@/app/(authenticated)/components/custom-select";

import { useRouter, usePathname } from "next/navigation";
import { useState, useTransition } from "react";

type AuditEntry = {
  id: string;
  timestamp: string;
  action: string;
  objectType: string;
  objectId: string;
  objectName: string | null;
  actorUserId: string | null;
  actorName: string | null;
  actorDescription: string | null;
  actorType: string;
  reason: string | null;
  organizationId: string | null;
  organizationName: string | null;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
};

type Props = {
  auditLogs: AuditEntry[];
  totalCount: number;
  page: number;
  totalPages: number;
  actionFilter: string;
  typeFilter: string;
  distinctActions: string[];
  distinctTypes: string[];
  integrationStatus: { arcjet: boolean; sentry: boolean; posthog: boolean };
};

function getActionColor(action: string) {
  if (action.includes("delete") || action.includes("removed") || action.includes("rejected") || action.includes("scrub"))
    return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300";
  if (action.includes("create") || action.includes("approved") || action.includes("added") || action.includes("hired") || action.includes("completed") || action.includes("launched"))
    return "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300";
  if (action.includes("update") || action.includes("edit") || action.includes("changed") || action.includes("reset") || action.includes("reschedule"))
    return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
  if (action.includes("login") || action.includes("auth") || action.includes("password") || action.includes("kyc") || action.includes("veriff"))
    return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300";
  if (action.includes("payment") || action.includes("paid") || action.includes("invoice") || action.includes("payout") || action.includes("wise") || action.includes("stripe"))
    return "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300";
  if (action.includes("email") || action.includes("sent"))
    return "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300";
  return "bg-muted text-muted-foreground";
}

function formatAction(action: string) {
  const parts = action.split(".");
  const last = parts[parts.length - 1] ?? action;
  return last.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatCategory(action: string) {
  const parts = action.split(".");
  if (parts.length > 1) return parts[0].replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return "";
}

function formatTimestamp(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  }).format(new Date(iso));
}

/** Build a human-readable summary line for an audit entry */
function buildSummary(entry: AuditEntry): string {
  const actor = entry.actorName || entry.actorDescription || "System";
  const target = entry.objectName || entry.objectType;
  const action = entry.action;

  // Specific patterns
  if (action === "auth.login_sync") return `${actor} logged in`;
  if (action === "organization.created") return `${actor} created org ${entry.objectName || entry.objectId.slice(0, 8)}`;
  if (action === "organization.deleted") return `${actor} deleted org ${entry.objectName || entry.objectId.slice(0, 8)}`;
  if (action === "employee.created") return `${actor} added contractor ${target}`;
  if (action === "employee.updated") return `${actor} updated ${target}`;
  if (action === "employee.status_changed") return `${actor} changed status of ${target}`;
  if (action === "employee.role_changed") return `${actor} changed role of ${target}`;
  if (action === "employee.hard_delete") return `${actor} permanently deleted ${target}`;
  if (action === "employee.pii_scrubbed") return `${actor} scrubbed PII for ${target}`;
  if (action === "employee.offboarding_started") return `${actor} started offboarding for ${target}`;
  if (action === "employee.offboarding_completed") return `${actor} completed offboarding for ${target}`;
  if (action.includes("offboarding_email")) return `${actor} sent offboarding email for ${target}`;
  if (action.includes("offboarding_slack")) return `${actor} ${action.includes("removed") ? "removed" : "flagged"} Slack for ${target}`;
  if (action.includes("offboarding_td")) return `${actor} removed Time Doctor for ${target}`;
  if (action.includes("offboarding_it")) return `${actor} sent IT ticket for ${target}`;
  if (action === "hiring.onboarding_launched") return `${actor} launched onboarding for ${target}`;
  if (action === "hiring.pre_hire_created") return `${actor} created pre-hire ${target}`;
  if (action === "hiring.pre_hire_deleted") return `${actor} deleted pre-hire ${target}`;
  if (action === "hiring.client_onboarding_started") return `${actor} started client onboarding for ${target}`;
  if (action === "hiring.contractor_activated") return `${actor} activated ${target}`;
  if (action === "hiring.moved_to_onboarding") return `${actor} moved ${target} to onboarding`;
  if (action === "hiring.onboarding_removed") return `${actor} removed ${target} from onboarding`;
  if (action === "hiring.zoom_assigned") return `${actor} assigned Zoom for ${target}`;
  if (action === "hiring.zoom_batch_deleted") return `${actor} deleted Zoom batch`;
  if (action === "hiring.start_date_rescheduled") return `${actor} rescheduled start date for ${target}`;
  if (action === "hiring.attendee_moved") return `${actor} moved attendee for ${target}`;
  if (action === "hiring.payment_setup_pending_login") return `${target} - payment setup pending first login`;
  if (action === "invitation.created") return `${actor} created invitation for ${entry.organizationName || "org"}`;
  if (action === "kyc.initiated" || action === "kyc.self_initiated") return `${actor} initiated KYC for ${entry.organizationName || target}`;
  if (action === "kyc.approved" || action === "kyc.approved_synced") return `KYC approved for ${entry.organizationName || target}`;
  if (action === "contractor.veriff_sent") return `Veriff verification sent for ${target}`;
  if (action === "contractor.veriff.approved") return `Veriff approved for ${target}`;
  if (action === "contractor.wise_setup_completed") return `Wise setup completed for ${target}`;
  if (action === "onboarding.forms_sent") return `${actor} sent onboarding forms to ${target}`;
  if (action === "document.deleted") return `${actor} deleted document for ${target}`;
  if (action === "pending_hire.approved") return `${actor} approved pending hire ${target}`;
  if (action === "user.role_changed") return `${actor} changed user role for ${target}`;
  if (action === "timesheet_period.deleted") return `${actor} deleted timesheet period`;
  if (action === "wise_payout_completed") return `Wise payout completed for ${target}`;
  if (action.includes("debug.email")) return `Email debug: ${target}`;
  if (action.includes("debug.stripe")) return `Stripe debug: ${target}`;
  if (action === "server.error") return `Server error on ${target}`;
  if (action.includes("contractor_info_link")) return `${actor} sent contractor info link to ${target}`;
  if (action.includes("data_prefill")) return `${actor} updated onboarding data prefill for ${target}`;
  if (action.includes("batch_event")) return `${actor} rescheduled batch event for ${target}`;

  // Fallback
  return `${actor} performed ${formatAction(action)} on ${target}`;
}

/** Render changed fields from oldValue/newValue */
function ChangedFields({ oldValue, newValue }: { oldValue: Record<string, unknown> | null; newValue: Record<string, unknown> | null }) {
  if (!oldValue && !newValue) return null;
  const combined = { ...(oldValue || {}), ...(newValue || {}) };
  const keys = Object.keys(combined).filter((k) =>
    !["id", "updatedAt", "createdAt", "updated_at", "created_at"].includes(k)
  );
  if (keys.length === 0) return null;

  const changes: { field: string; from: string; to: string }[] = [];
  for (const key of keys) {
    const o = oldValue?.[key];
    const n = newValue?.[key];
    if (o !== undefined && n !== undefined && JSON.stringify(o) !== JSON.stringify(n)) {
      changes.push({ field: key, from: String(o ?? ""), to: String(n ?? "") });
    } else if (o === undefined && n !== undefined) {
      changes.push({ field: key, from: "", to: String(n ?? "") });
    }
  }

  // If no diffable changes, show newValue fields as-is
  if (changes.length === 0 && newValue) {
    const entries = Object.entries(newValue).filter(([k]) =>
      !["id", "updatedAt", "createdAt", "updated_at", "created_at"].includes(k)
    );
    if (entries.length === 0) return null;
    return (
      <div className="mt-2 space-y-1">
        {entries.slice(0, 10).map(([k, v]) => (
          <div key={k} className="flex gap-2 text-xs">
            <span className="text-muted-foreground w-32 shrink-0">{k.replace(/_/g, " ")}</span>
            <span className="text-foreground break-all">{typeof v === "object" ? JSON.stringify(v) : String(v ?? "")}</span>
          </div>
        ))}
        {entries.length > 10 && <div className="text-xs text-muted-foreground">+{entries.length - 10} more fields</div>}
      </div>
    );
  }

  if (changes.length === 0) return null;

  return (
    <div className="mt-2 space-y-1">
      {changes.slice(0, 10).map((c) => (
        <div key={c.field} className="flex gap-2 text-xs">
          <span className="text-muted-foreground w-32 shrink-0">{c.field.replace(/_/g, " ")}</span>
          {c.from ? (
            <>
              <span className="line-through text-red-500/70 break-all">{c.from}</span>
              <span className="text-muted-foreground">&rarr;</span>
              <span className="text-green-600 dark:text-green-400 break-all">{c.to}</span>
            </>
          ) : (
            <span className="text-green-600 dark:text-green-400 break-all">{c.to}</span>
          )}
        </div>
      ))}
      {changes.length > 10 && <div className="text-xs text-muted-foreground">+{changes.length - 10} more changes</div>}
    </div>
  );
}

export function AuditLogClient({
  auditLogs, totalCount, page, totalPages,
  actionFilter, typeFilter,
  distinctActions, distinctTypes,
  integrationStatus,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const [localAction, setLocalAction] = useState(actionFilter);
  const [localType, setLocalType] = useState(typeFilter);
  const [expanded, setExpanded] = useState<string | null>(null);

  const applyFilters = (overrides?: { action?: string; type?: string; page?: number }) => {
    const params = new URLSearchParams();
    const a = overrides?.action ?? localAction;
    const t = overrides?.type ?? localType;
    const p = overrides?.page ?? 1;
    if (a) params.set("action", a);
    if (t) params.set("type", t);
    if (p > 1) params.set("page", String(p));
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  };

  const clearFilters = () => {
    setLocalAction("");
    setLocalType("");
    startTransition(() => router.push(pathname));
  };

  const hasFilters = actionFilter || typeFilter;

  return (
    <div className="max-w-5xl space-y-4">
      {/* Security Config */}
      <div className="rounded-xl border bg-card p-5">
        <h3 className="font-semibold text-sm">Security Configuration</h3>
        <div className="mt-3 flex flex-wrap gap-4">
          {[
            { label: "Rate Limiting (Arcjet)", active: integrationStatus.arcjet },
            { label: "Error Tracking (Sentry)", active: integrationStatus.sentry },
            { label: "Analytics (PostHog)", active: integrationStatus.posthog },
          ].map(({ label, active }) => (
            <div key={label} className="flex items-center gap-2 text-sm">
              <span className={`h-2 w-2 rounded-full ${active ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-600"}`} />
              <span className="text-muted-foreground">{label}</span>
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${active ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"}`}>
                {active ? "On" : "Off"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Audit Log */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 className="font-semibold">Audit Log</h3>
              <p className="text-xs text-muted-foreground mt-0.5" suppressHydrationWarning>{totalCount.toLocaleString()} total events</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <CustomSelect
                value={localAction}
                onValueChange={(v) => { setLocalAction(v); applyFilters({ action: v }); }}
                triggerClassName="h-8 min-w-[140px] text-xs"
                placeholder="All actions"
                options={[
                  { value: "", label: "All actions" },
                  ...distinctActions.map((a) => ({ value: a, label: a })),
                ]}
              />
              <CustomSelect
                value={localType}
                onValueChange={(v) => { setLocalType(v); applyFilters({ type: v }); }}
                triggerClassName="h-8 min-w-[120px] text-xs"
                placeholder="All types"
                options={[
                  { value: "", label: "All types" },
                  ...distinctTypes.map((t) => ({ value: t, label: t })),
                ]}
              />
              {hasFilters && (
                <button onClick={clearFilters} className="h-8 rounded-md border px-3 text-xs font-medium hover:bg-accent text-muted-foreground">
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>

        {auditLogs.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-muted-foreground">No audit events found.</div>
        ) : (
          <div className="divide-y">
            {auditLogs.map((entry) => {
              const summary = buildSummary(entry);
              const category = formatCategory(entry.action);
              const actorLabel = entry.actorName || entry.actorDescription || (entry.actorType === "system" ? "System" : null);

              return (
                <div key={entry.id} className="hover:bg-muted/30 transition-colors">
                  <button
                    type="button"
                    onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                    className="w-full text-left px-4 py-3"
                  >
                    <div className="flex items-start gap-3">
                      {/* Action badge */}
                      <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap ${getActionColor(entry.action)}`}>
                        {formatAction(entry.action)}
                      </span>
                      {/* Summary */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm leading-snug">{summary}</p>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                          {category && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{category}</span>}
                          {entry.organizationName && (
                            <span>{entry.organizationName}</span>
                          )}
                          {entry.reason && (
                            <span className="italic truncate max-w-[200px]">{entry.reason}</span>
                          )}
                        </div>
                      </div>
                      {/* Right side: actor + time */}
                      <div className="shrink-0 text-right">
                        <span className="text-[11px] text-muted-foreground whitespace-nowrap" suppressHydrationWarning>
                          {formatTimestamp(entry.timestamp)}
                        </span>
                        {actorLabel && (
                          <div className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[140px]">
                            by {actorLabel}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>

                  {/* Expanded detail */}
                  {expanded === entry.id && (
                    <div className="px-4 pb-3 pl-12">
                      <div className="rounded-lg bg-muted/50 p-3 space-y-1.5 text-xs">
                        <div className="flex gap-2"><span className="text-muted-foreground w-32 shrink-0">Action</span><span className="font-mono">{entry.action}</span></div>
                        <div className="flex gap-2"><span className="text-muted-foreground w-32 shrink-0">Target</span><span>{entry.objectName || entry.objectType}</span><span className="font-mono text-muted-foreground ml-1">({entry.objectId.slice(0, 16)})</span></div>
                        {actorLabel && <div className="flex gap-2"><span className="text-muted-foreground w-32 shrink-0">Performed by</span><span>{actorLabel}</span>{entry.actorUserId && <span className="font-mono text-muted-foreground ml-1">({entry.actorUserId.slice(0, 8)})</span>}</div>}
                        {entry.organizationName && <div className="flex gap-2"><span className="text-muted-foreground w-32 shrink-0">Organization</span><span>{entry.organizationName}</span></div>}
                        {entry.reason && <div className="flex gap-2"><span className="text-muted-foreground w-32 shrink-0">Reason</span><span>{entry.reason}</span></div>}
                        <div className="flex gap-2"><span className="text-muted-foreground w-32 shrink-0">Time</span><span suppressHydrationWarning>{new Date(entry.timestamp).toLocaleString("en-US", { dateStyle: "full", timeStyle: "long" })}</span></div>
                        <ChangedFields oldValue={entry.oldValue} newValue={entry.newValue} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-5 py-3 border-t flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              Page {page} of {totalPages} ({totalCount.toLocaleString()} events)
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => applyFilters({ page: page - 1 })}
                className="h-7 rounded-md border px-3 text-xs font-medium hover:bg-accent disabled:opacity-40"
              >
                Previous
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => applyFilters({ page: page + 1 })}
                className="h-7 rounded-md border px-3 text-xs font-medium hover:bg-accent disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
