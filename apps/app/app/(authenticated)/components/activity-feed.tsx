"use client";

/**
 * Shared Activity Feed component — renders audit log entries with
 * human-readable labels, category icons, color-coded badges,
 * detail extraction from newValue, and relative timestamps.
 *
 * Used on the RL Dashboard widget and the Org Detail activity tab.
 */

export type AuditEntry = {
 id: string;
 action: string;
 objectType: string;
 timestamp: Date | string;
 actorDescription?: string | null;
 objectId?: string | null;
 newValue?: Record<string, unknown> | null;
};

/* ─── Action Metadata ────────────────────────────────────────────────────── */

type ActionMeta = {
 label: string;
 icon: string;
 color: string; // tailwind bg class for the icon badge
 detail?: (entry: AuditEntry) => string | null;
};

function employeeName(entry: AuditEntry): string | null {
 const nv = entry.newValue;
 if (!nv) return null;
 const first = nv.legalFirstName ?? nv.firstName ?? "";
 const last = nv.legalLastName ?? nv.lastName ?? "";
 if (first || last) return `${first} ${last}`.trim();
 const name = nv.name ?? nv.employeeName;
 return typeof name === "string"? name : null;
}

function emailDetail(entry: AuditEntry): string | null {
 const nv = entry.newValue;
 if (!nv) return null;
 return (nv.to ?? nv.email ?? nv.recipientEmail) as string | null;
}

const ACTION_MAP: Record<string, ActionMeta> = {
 // ── Auth ──
 "auth.login_sync": {
 label: "Login sync completed",
 icon: "Sy",
 color: "bg-slate-100 dark:bg-slate-800",
 detail: (e) => {
 const nv = e.newValue;
 if (!nv) return null;
 const jf = nv.jotformStepsCompleted as number | undefined;
 const os = nv.onboardingSessionsTouched as number | undefined;
 if (jf && os) return `${jf} forms synced across ${os} sessions`;
 if (jf) return `${jf} JotForm steps completed`;
 return null;
 },
 },

 // ── Hiring ──
 "hiring.pre_hire_created": { label: "Pre-hire added", icon: "+", color: "bg-blue-100 dark:bg-blue-900", detail: employeeName },
 "hiring.pre_hire_deleted": { label: "Pre-hire removed", icon: "-", color: "bg-red-100 dark:bg-red-900", detail: employeeName },
 "hiring.onboarding_launched": { label: "Onboarding launched", icon: "Go", color: "bg-green-100 dark:bg-green-900", detail: employeeName },
 "hiring.onboarding_removed": { label: "Onboarding cancelled", icon: "x", color: "bg-red-100 dark:bg-red-900", detail: employeeName },
 "hiring.contractor_activated": { label: "Contractor activated", icon: "Ok", color: "bg-green-100 dark:bg-green-900", detail: employeeName },
 "hiring.client_onboarding_started": { label: "Contractor onboarding started", icon: "Go", color: "bg-indigo-100 dark:bg-indigo-900", detail: employeeName },
 "hiring.zoom_assigned": { label: "Zoom meeting assigned", icon: "Zm", color: "bg-blue-100 dark:bg-blue-900"},
 "hiring.zoom_batch_deleted": { label: "Zoom batch cancelled", icon: "x", color: "bg-red-100 dark:bg-red-900"},
 "hiring.attendee_moved": { label: "Attendee moved", icon: "↔", color: "bg-yellow-100 dark:bg-yellow-900"},
 "hiring.start_date_rescheduled": { label: "Start date rescheduled", icon: "Dt", color: "bg-yellow-100 dark:bg-yellow-900", detail: employeeName },
 "hiring.onboarding_data_prefill_updated": { label: "Onboarding data updated", icon: "Ed", color: "bg-slate-100 dark:bg-slate-800"},

 // ── Employee ──
 "employee.created": { label: "Contractor created", icon: "+", color: "bg-green-100 dark:bg-green-900", detail: employeeName },
 "employee.updated": { label: "Contractor updated", icon: "Ed", color: "bg-blue-100 dark:bg-blue-900", detail: employeeName },
 "employee.status_changed": {
 label: "Status changed",
 icon: "St",
 color: "bg-yellow-100 dark:bg-yellow-900",
 detail: (e) => {
 const nv = e.newValue;
 if (!nv) return null;
 const from = nv.from ?? nv.oldStatus;
 const to = nv.to ?? nv.newStatus ?? nv.status;
 if (from && to) return `${fmt(from as string)} → ${fmt(to as string)}`;
 if (to) return fmt(to as string);
 return null;
 },
 },
 "employee.hard_delete": { label: "Contractor deleted", icon: "Ct", color: "bg-red-100 dark:bg-red-900", detail: employeeName },
 "employee.bulk_renumber": { label: "Employee numbers updated", icon: "#", color: "bg-slate-100 dark:bg-slate-800"},
 "employee.contractor_info_link_sent": { label: "Info link sent", icon: "Sn", color: "bg-blue-100 dark:bg-blue-900", detail: emailDetail },
 "employee.offboarding_started": { label: "Offboarding started", icon: "Of", color: "bg-orange-100 dark:bg-orange-900", detail: employeeName },
 "employee.offboarding_completed": { label: "Offboarding completed", icon: "Of", color: "bg-green-100 dark:bg-green-900", detail: employeeName },
 "employee.offboarding_td_removed": { label: "Time Doctor access removed", icon: "TD", color: "bg-orange-100 dark:bg-orange-900"},
 "employee.offboarding_slack_removed": { label: "Slack access removed", icon: "Sl", color: "bg-orange-100 dark:bg-orange-900"},
 "employee.offboarding_it_ticket_sent": { label: "IT ticket created", icon: "IT", color: "bg-orange-100 dark:bg-orange-900"},
 "employee.offboarding_recruitcrm_updated": { label: "RecruitCRM updated", icon: "RC", color: "bg-orange-100 dark:bg-orange-900"},

 // ── Onboarding ──
 "onboarding.started": { label: "Onboarding session started", icon: "Go", color: "bg-green-100 dark:bg-green-900"},
 "onboarding.added_to_batch": { label: "Added to batch session", icon: "Bk", color: "bg-blue-100 dark:bg-blue-900"},
 "onboarding.forms_sent": { label: "Onboarding forms sent", icon: "Sn", color: "bg-blue-100 dark:bg-blue-900"},

 // ── KYC ──
 "kyc.self_initiated": { label: "KYC verification started", icon: "Id", color: "bg-indigo-100 dark:bg-indigo-900"},
 "kyc.initiated": { label: "KYC verification sent", icon: "Sn", color: "bg-indigo-100 dark:bg-indigo-900"},
 "kyc.approved_synced": { label: "KYC approved", icon: "Ok", color: "bg-green-100 dark:bg-green-900"},
 "kyc.manual_approval": { label: "KYC manually approved", icon: "Ok", color: "bg-green-100 dark:bg-green-900"},
 "kyc.email_resent": { label: "KYC email resent", icon: "Sn", color: "bg-blue-100 dark:bg-blue-900"},
 "kyc.reset": { label: "KYC reset", icon: "Id", color: "bg-yellow-100 dark:bg-yellow-900"},

 // ── Organization ──
 "organization.created": { label: "Organization created", icon: "Og", color: "bg-green-100 dark:bg-green-900"},
 "organization.deleted": { label: "Organization deleted", icon: "Og", color: "bg-red-100 dark:bg-red-900"},

 // ── Documents ──
 "document.deleted": { label: "Document deleted", icon: "Dc", color: "bg-red-100 dark:bg-red-900"},
 "contract.signing_requested": { label: "Contract signing requested", icon: "Ct", color: "bg-blue-100 dark:bg-blue-900"},

 // ── Invitations ──
 "invitation.created": { label: "Invitation sent", icon: "Sn", color: "bg-blue-100 dark:bg-blue-900", detail: emailDetail },

 // ── Payments ──
 "payment_completed": { label: "Payment processed", icon: "$", color: "bg-green-100 dark:bg-green-900"},

 // ── Timesheets ──
 "timesheet_period.deleted": { label: "Timesheet period deleted", icon: "Ts", color: "bg-red-100 dark:bg-red-900"},

 // ── Users ──
 "user.role_changed": {
 label: "User role changed",
 icon: "Rl",
 color: "bg-purple-100 dark:bg-purple-900",
 detail: (e) => {
 const nv = e.newValue;
 if (!nv) return null;
 const from = nv.oldRole ?? nv.from;
 const to = nv.newRole ?? nv.to;
 if (from && to) return `${fmt(from as string)} → ${fmt(to as string)}`;
 return null;
 },
 },

 // ── Pending hire ──
 "pending_hire.approved": { label: "Pending hire approved", icon: "Ok", color: "bg-green-100 dark:bg-green-900"},

 // ── Time Doctor ──
 "timedoctor.bulk_rename": { label: "Time Doctor names synced", icon: "TD", color: "bg-slate-100 dark:bg-slate-800"},

 // ── Debug (collapsed) ──
 "debug.email_sent": { label: "Email delivered", icon: "Em", color: "bg-green-100 dark:bg-green-900", detail: emailDetail },
 "debug.email_failed": { label: "Email delivery failed", icon: "Em", color: "bg-red-100 dark:bg-red-900", detail: emailDetail },
 "debug.email_skipped": { label: "Email skipped", icon: "Em", color: "bg-slate-100 dark:bg-slate-800", detail: emailDetail },
 "debug.stripe_success": { label: "Stripe link created", icon: "St", color: "bg-green-100 dark:bg-green-900"},
 "debug.stripe_error": { label: "Stripe error", icon: "St", color: "bg-red-100 dark:bg-red-900"},
 "debug.stripe_threw": { label: "Stripe exception", icon: "St", color: "bg-red-100 dark:bg-red-900"},
};

/** Prettify a snake_case / dot-separated string */
function fmt(s: string): string {
 return s.replace(/[._]/g, "").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getMeta(action: string): ActionMeta {
 if (ACTION_MAP[action]) return ACTION_MAP[action];
 // Fallback: derive from the action string
 const category = action.split(".")[0] ?? "system";
 return {
 label: fmt(action),
 icon: category === "hiring"? "": category === "employee"? "": category === "kyc"? "": "",
 color: "bg-slate-100 dark:bg-slate-800",
 };
}

/* ─── Category Header ────────────────────────────────────────────────────── */

const CATEGORY_LABELS: Record<string, string> = {
 auth: "Authentication",
 hiring: "Hiring & Onboarding",
 employee: "Contractors",
 onboarding: "Onboarding",
 kyc: "Identity Verification",
 organization: "Organizations",
 document: "Documents",
 contract: "Contracts",
 invitation: "Invitations",
 payment: "Payments",
 timesheet: "Timesheets",
 user: "Users",
 debug: "System",
 timedoctor: "Time Doctor",
 pending_hire: "Hiring",
};

function categoryOf(action: string): string {
 const cat = action.split(".")[0] ?? "";
 // Handle actions without dots like "payment_completed"
 if (!action.includes(".")) return action.split("_")[0] ?? "system";
 return cat;
}

/* ─── Relative Timestamps ────────────────────────────────────────────────── */

function relativeTime(ts: Date | string): string {
 const d = new Date(ts as any);
 const now = new Date();
 const diffMs = now.getTime() - d.getTime();
 const diffMin = Math.floor(diffMs / 60000);
 const diffHr = Math.floor(diffMs / 3600000);
 const diffDay = Math.floor(diffMs / 86400000);

 if (diffMin < 1) return "Just now";
 if (diffMin < 60) return `${diffMin}m ago`;
 if (diffHr < 24) return `${diffHr}h ago`;
 if (diffDay === 1) return "Yesterday";
 if (diffDay < 7) return `${diffDay}d ago`;
 return d.toLocaleDateString("en-US", { month: "short", day: "numeric"});
}

function dateGroupLabel(ts: Date | string): string {
 const d = new Date(ts as any);
 const now = new Date();
 const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
 const entryDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
 const diffDays = Math.floor((today.getTime() - entryDate.getTime()) / 86400000);

 if (diffDays === 0) return "Today";
 if (diffDays === 1) return "Yesterday";
 if (diffDays < 7) return d.toLocaleDateString("en-US", { weekday: "long"});
 return d.toLocaleDateString("en-US", { month: "long", day: "numeric"});
}

/* ─── Components ─────────────────────────────────────────────────────────── */

function ActivityItem({ entry }: { entry: AuditEntry; key?: React.Key }) {
 const meta = getMeta(entry.action);
 const detail = meta.detail?.(entry);
 const cat = categoryOf(entry.action);
 const catLabel = CATEGORY_LABELS[cat] ?? fmt(cat);

 return (
 <div className="group flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/50">
 {/* Icon badge */}
 <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm ${meta.color}`}>
 {meta.icon}
 </div>

 {/* Content */}
 <div className="min-w-0 flex-1">
 <div className="flex items-baseline gap-2">
 <span className="text-sm font-medium leading-tight">{meta.label}</span>
 <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
 {catLabel}
 </span>
 </div>
 {detail && (
 <p className="mt-0.5 truncate text-xs text-muted-foreground">{detail}</p>
 )}
 {entry.actorDescription && !detail && (
 <p className="mt-0.5 truncate text-xs text-muted-foreground">by {entry.actorDescription}</p>
 )}
 </div>

 {/* Timestamp */}
 <span
 className="mt-0.5 shrink-0 text-[11px] text-muted-foreground/70"
 title={new Date(entry.timestamp as any).toLocaleString("en-US")}
 suppressHydrationWarning
 >
 {relativeTime(entry.timestamp)}
 </span>
 </div>
 );
}

/* ─── Feed Variants ──────────────────────────────────────────────────────── */

/**
 * Compact feed for dashboard widgets — no date grouping, tight spacing.
 */
export function ActivityFeedCompact({ entries }: { entries: AuditEntry[] }) {
 if (entries.length === 0) {
 return (
 <div className="flex flex-col items-center justify-center py-8 text-center">
 <div className="text-2xl opacity-40"></div>
 <p className="mt-2 text-xs text-muted-foreground">No recent activity</p>
 </div>
 );
 }

 return (
 <div className="-mx-1 divide-y divide-border/50">
 {entries.map((entry) => (
 <ActivityItem key={entry.id} entry={entry} />
 ))}
 </div>
 );
}

/**
 * Full activity feed with date grouping — for the org detail activity tab.
 */
export function ActivityFeedFull({ entries }: { entries: AuditEntry[] }) {
 if (entries.length === 0) {
 return (
 <div className="flex flex-col items-center justify-center py-12 text-center">
 <div className="text-3xl opacity-30"></div>
 <p className="mt-3 text-sm text-muted-foreground">No activity recorded yet</p>
 </div>
 );
 }

 // Group entries by date
 const groups: { label: string; entries: AuditEntry[] }[] = [];
 let currentLabel = "";
 for (const entry of entries) {
 const label = dateGroupLabel(entry.timestamp);
 if (label !== currentLabel) {
 currentLabel = label;
 groups.push({ label, entries: [] });
 }
 groups[groups.length - 1].entries.push(entry);
 }

 return (
 <div className="space-y-4">
 {groups.map((group) => (
 <div key={group.label}>
 <div className="sticky top-0 z-10 flex items-center gap-2 bg-card px-1 py-1.5">
 <div className="h-px flex-1 bg-border"/>
 <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60" suppressHydrationWarning>
 {group.label}
 </span>
 <div className="h-px flex-1 bg-border"/>
 </div>
 <div className="-mx-1 divide-y divide-border/40">
 {group.entries.map((entry) => (
 <ActivityItem key={entry.id} entry={entry} />
 ))}
 </div>
 </div>
 ))}
 </div>
 );
}
