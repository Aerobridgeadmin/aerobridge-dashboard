"use client";
import { useErrorDialog } from "@/app/(authenticated)/components/error-dialog";
import { shortDate } from "@/lib/hriq/format";
import { ZoomSessionsDnd } from "./zoom-sessions-dnd";

import {
 createPreHireEmployee,
 deletePreHireEmployee,
 assignToZoomSession,
 deleteBatchZoomMeeting,
 removeEmployeeFromOnboarding,
 syncOnboardingChecklist,
} from "@/app/actions/hriq/hiring";
import {
 updateOnboardingStep,
 sendOnboardingForms,
 sendZoomInvite,
 createBatchSession,
 completeAllJotformSteps,
} from "@/app/actions/hriq/onboarding";
import {
 initiateOffboarding,
 offboardSendNotificationEmail,
 offboardRemoveFromTimeDoctor,
 offboardRemoveFromSlack,
 offboardUpdateRecruitCRM,
 offboardSendITTicket,
 offboardDisableDashboard,
 offboardDownloadTDReport,
 getTDMemberReport,
 completeOffboarding,
 runAutoOffboarding,
} from "@/app/actions/hriq/offboarding";
import type { OffboardingEntry, OffboardingStepState } from "@/app/actions/hriq/offboarding";
import { CustomSelect } from "@/app/(authenticated)/components/custom-select";
import { CustomSelectWithOther } from "@/app/(authenticated)/components/custom-select-with-other";
import { JOB_TITLE_OPTIONS, DEPARTMENT_OPTIONS } from "@/lib/hriq/role-department-options";
import { COUNTRY_OPTIONS } from "@/lib/hriq/country-options";
import { SearchableSelect } from "@/app/(authenticated)/components/searchable-select";
import { DatePicker, DateTimePicker } from "@/app/(authenticated)/components/date-picker";
import { utcToPacificBare } from "@/lib/hriq/format";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { OnboardingWizard } from "./onboarding-wizard";

type Org = { id: string; name: string };
type JotForm = { id: string; title: string; url: string; embeddable?: boolean };
type ZoomSession = {
 id: string;
 title: string;
 zoomJoinUrl: string | null;
 zoomMeetingDate: Date | null;
 zoomDuration: number;
 _count: { onboardingSessions: number };
};
type BatchSessionFull = {
 id: string;
 title: string;
 description: string | null;
 status: string;
 zoomMeetingId: string | null;
 zoomJoinUrl: string | null;
 zoomStartUrl: string | null;
 zoomMeetingDate: Date | null;
 zoomDuration: number;
 calendarOrganizerEmail: string | null;
 googleCalendarEventId: string | null;
 onboardingSessions: Array<{ id: string; googleCalendarEventId: string | null; employee: { id: string; legalFirstName: string; legalLastName: string; personalEmail: string | null } }>;
};
type OnboardingEmployee = {
 id: string;
 legalFirstName: string;
 legalLastName: string;
 personalEmail: string | null;
 workEmail: string | null;
 onboardingSession: { id: string; jotformsSent: boolean; jotformsSentAt: Date | null; jotformsSentData: string | null } | null;
};

type OnboardingStep = {
 id: string;
 stepType: string;
 stepName: string;
 status: string;
 sortOrder: number;
 isRequired: boolean;
 completedAt: Date | null;
 formUrl: string | null;
 formSubmissionId: string | null;
};

type OnboardingSession = {
 id: string;
 status: string;
 overallProgress: number;
 jotformsSent: boolean;
 jotformsSentData: string | null;
 jotformsCompleted: boolean;
 jotformsCompletedAt: Date | null;
 zoomMeetingLink: string | null;
 zoomMeetingDate: Date | null;
 zoomInviteSent: boolean;
 zoomRsvpStatus: string;
 startedByName: string | null;
 startedAt: Date | null;
 googleCalendarEventId: string | null;
 batchSessionId: string | null;
 batchSession: {
 id: string;
 title: string;
 zoomMeetingDate: Date | null;
 zoomDuration: number;
 calendarOrganizerEmail: string | null;
 onboardingSessions: {
 id: string;
 employee: { id: string; legalFirstName: string; legalLastName: string };
 }[];
 } | null;
 steps: OnboardingStep[];
};

type PipelineEntry = {
 id: string;
 legalFirstName: string;
 legalLastName: string;
 personalEmail: string | null;
 hourlyRate?: unknown;
 currency?: string | null;
 startDate?: Date | null;
 jobTitle: string | null;
 department: string | null;
 compensationType: string | null;
 monthlySalary?: unknown;
 employmentType: string;
 employmentStatus: string;
 createdAt: Date;
 updatedAt: Date;
 bankName: string | null;
 infoApprovalStatus: string | null;
 organizationId: string | null;
 organization: { name: string } | null;
 onboardingSessions: OnboardingSession[];
};

function getDisplayStepName(step: OnboardingStep): string {
 const raw = step.stepName.trim();
 if (step.stepType === "zoom_invite") return "Zoom Invite (Add to Batch)";
 if (step.stepType === "zoom_attendance") return "Zoom Orientation Attendance";
 if (step.stepType === "document") return raw || "Document Upload";
 if (step.stepType === "email_form") return raw || "Contractor Info Form";
 if (step.stepType === "jotform") return "Onboarding Forms";
 if (step.stepType === "payment_setup") {
   if (raw.toLowerCase().includes("wise")) return "Payment Setup (Wise)";
   return "Payment Setup (Stripe Connect)";
 }
 if (step.stepType === "custom") {
 const lower = raw.toLowerCase();
 if (lower.includes("tech") || lower.includes("access") || lower.includes("provision")) return "Tech & Access Setup";
 if (lower.includes("manager")) return "Manager Introduction";
 }
 return raw;
}

function formatPacificDateTime(value: string | Date | null | undefined): string {
 if (!value) return "No date";
 const date = new Date(value as any);
 if (Number.isNaN(date.getTime())) return "No date";
 return new Intl.DateTimeFormat("en-US", {
 timeZone: "America/Los_Angeles",
 weekday: "short",
 month: "short",
 day: "numeric",
 hour: "numeric",
 minute: "2-digit",
 timeZoneName: "short",
 }).format(date);
}

function getRenderableSteps(steps: OnboardingStep[]): OnboardingStep[] {
 const jotformSteps = steps.filter((step) => step.stepType === "jotform");
 if (jotformSteps.length <= 1) return steps;

 const first = jotformSteps[0];
 const allCompleted = jotformSteps.every((step) => step.status === "completed");
 const anySentOrCompleted = jotformSteps.some((step) => step.status === "sent"|| step.status === "completed");
 const allSkipped = jotformSteps.every((step) => step.status === "skipped");

 const merged: OnboardingStep = {
 ...first,
 stepName: "Onboarding Forms",
 status: allCompleted ? "completed": allSkipped ? "skipped": anySentOrCompleted ? "sent": "pending",
 isRequired: jotformSteps.some((step) => step.isRequired),
 };

 const result = steps.filter((step) => step.stepType !== "jotform");
 const insertionIndex = steps.findIndex((step) => step.stepType === "jotform");
 result.splice(Math.max(insertionIndex, 0), 0, merged);
 return result;
}

function getWarningMessage(err: unknown, fallback: string): string {
 const raw = err instanceof Error ? err.message : typeof err === "string"&& err.length > 0 ? err : fallback;
 const msg = String(raw || fallback).trim();
 if (!msg) return `Warning: ${fallback}`;
 if (
 msg.includes("Server Components render") ||
 msg.includes("digest") ||
 msg.toLowerCase().includes("failed to fetch") ||
 msg.toLowerCase().includes("internal server error")
 ) {
 return "Warning: Something failed in the background. Please retry. If this keeps happening, refresh and try again.";
 }
 return `Warning: ${msg}`;
}

function ZoomHostSearch({ hosts, value, onChange, className }: { hosts: string[]; value: string; onChange: (v: string) => void; className?: string }) {
 const [query, setQuery] = useState(value);
 const [open, setOpen] = useState(false);
 const filtered = query ? hosts.filter((h) => h.toLowerCase().includes(query.toLowerCase())) : hosts;
 const ref = useRef<HTMLDivElement>(null);
 useEffect(() => {
 const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
 document.addEventListener("mousedown", handler);
 return () => document.removeEventListener("mousedown", handler);
 }, []);
 return (
 <div ref={ref} className={`relative ${className ?? ""}`}>
 <input
 type="text"
 value={query}
 placeholder="Search host..."
 onChange={(e) => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
 onFocus={() => setOpen(true)}
 className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground"
 />
 {open && filtered.length > 0 && (
 <div className="absolute z-50 mt-1 max-h-44 w-full overflow-y-auto rounded-md border bg-popover shadow-md animate-in fade-in slide-in-from-top-1 duration-150">
 {filtered.map((h) => (
 <button key={h} type="button"onClick={() => { setQuery(h); onChange(h); setOpen(false); }}
 className={`w-full px-3 py-1.5 text-left text-xs hover:bg-accent ${h === value ? "bg-accent font-medium": ""}`}
 >{h}</button>
 ))}
 </div>
 )}
 </div>
 );
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
 pre_hire: { label: "Pre-Hire", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"},
 onboarding_scheduled: { label: "Scheduled", cls: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300"},
 onboarding_in_progress: { label: "Onboarding", cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300"},
 active: { label: "Active", cls: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300"},
};

export function HiringPipeline({
 entries,
 organizations,
 jotformForms,
 jotformStatus,
 senders,
 zoomSessions,
 batchSessions,
 zoomHosts,
 zoomHostByOrg,
 onboardingEmployees,
 offboardingEntries,
 orgPaymentMethods,
 orgSeatData,
 fixedOrgId,
 pendingHiresCount,
}: {
 entries: PipelineEntry[];
 organizations: Org[];
 jotformForms: JotForm[];
 jotformStatus: { configured: boolean; connected: boolean; message: string };
 senders: string[];
 zoomSessions: ZoomSession[];
 batchSessions: BatchSessionFull[];
 zoomHosts: string[];
 zoomHostByOrg: Record<string, string>;
 onboardingEmployees: OnboardingEmployee[];
 offboardingEntries: OffboardingEntry[];
 orgPaymentMethods?: Record<string, string>;
 orgSeatData?: Record<string, { vaSeats: number; taken: number }>;
 fixedOrgId?: string; // When set, hide org selector and use this ID for new hires (internal pipeline)
 pendingHiresCount?: number;
}) {
 const router = useRouter();
 const { orgSlug } = useParams<{ orgSlug: string }>();
 const [isPending, startTransition] = useTransition();
 const [showAdd, setShowAdd] = useState(false);
 const [selectedNewHireOrg, setSelectedNewHireOrg] = useState<string>("");
 const { showError, showSuccess } = useErrorDialog();
 const [notice, setNotice] = useState<string | null>(null);
 const [topTab, setTopTab] = useState<"pipeline"| "zoom"| "forms"| "offboarding">("pipeline");
 const [filter, setFilter] = useState<string>("pre_hire");
 const [expandedId, setExpandedId] = useState<string | null>(null);
 const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
 const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
 const [completedMessages, setCompletedMessages] = useState<Map<string, string>>(new Map());
 const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

 /** Delayed refresh — lets the user see the success state before the card disappears */
 const scheduleRefresh = (delayMs = 2000) => {
 if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
 // Server action revalidatePath handles refresh
 };

 /** Mark an entry as just-completed (show success banner, delay refresh) */
 const markCompleted = (id: string, message?: string) => {
 // Only replace the row with "Done"banner for actual activation via Activate Contractor button
 const isActivation = message?.toLowerCase().includes("activated");
 if (isActivation) {
 setCompletedIds((prev) => new Set(prev).add(id));
 if (message) setCompletedMessages((prev) => new Map(prev).set(id, message));
 }
 if (message) setNotice(message);
 scheduleRefresh();
 };
 const [pendingRemoveFromOnboarding, setPendingRemoveFromOnboarding] = useState<{
 id: string;
 name: string;
 } | null>(null);
 const [pendingDeletePreHire, setPendingDeletePreHire] = useState<{
 id: string;
 name: string;
 } | null>(null);
 const [editingEntry, setEditingEntry] = useState<PipelineEntry | null>(null);
 const [rescheduleConfirm, setRescheduleConfirm] = useState<{
 entry: PipelineEntry;
 changes: string[];
 newStart: string;
 newZoom: string;
 newJob: string;
 newRate: string;
 newCurrency: string;
 newDuration: number;
 hasZoom: boolean;
 batchMembers: { id: string; name: string }[];
 splitFromBatch: boolean;
 transferCalendarTo: string;
 } | null>(null);
 const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
 const entryIds = useRef(new Set(entries.map((e) => e.id)));
 useEffect(() => {
 const currentIds = new Set(entries.map((e) => e.id));
 entryIds.current = currentIds;
 setSelectedIds((prev) => {
 const filtered = new Set([...prev].filter((id) => currentIds.has(id)));
 return filtered.size === prev.size ? prev : filtered;
 });
 }, [entries]);

 // Auto-dismiss notice after 5s
 useEffect(() => {
 if (!notice) return;
 const t = setTimeout(() => setNotice(null), 5000);
 return () => clearTimeout(t);
 }, [notice]);

 const [wizardEmployees, setWizardEmployees] = useState<
 {
 id: string;
 legalFirstName: string;
 legalLastName: string;
 personalEmail: string | null;
 organizationName: string | null;
 hourlyRate?: string | null;
 monthlySalary?: string | null;
 compensationType?: string | null;
 currency?: string | null;
 startDate?: string | null;
 jobTitle?: string | null;
 department?: string | null;
 }[] | null
 >(null);
 const [wizardOrgPaymentMethod, setWizardOrgPaymentMethod] = useState<string | null>(null);
 const [wizardSeatInfo, setWizardSeatInfo] = useState<{ vaSeats: number; taken: number } | null>(null);

 const filtered = (() => {
 const base =
 filter === "onboarding"
 ? entries.filter((e) => e.employmentStatus === "onboarding_scheduled"|| e.employmentStatus === "onboarding_in_progress")
 : entries.filter((e) => e.employmentStatus === "pre_hire");

 if (filter === "onboarding") {
 // Sort by progress descending — candidates closest to finishing appear first
 return [...base].sort((a, b) => {
 const pa = a.onboardingSessions?.[0]?.overallProgress ?? 0;
 const pb = b.onboardingSessions?.[0]?.overallProgress ?? 0;
 return pb - pa;
 });
 }
 return base;
 })();

 const preHireFiltered = filtered.filter((e) => e.employmentStatus === "pre_hire");
 const counts = {
 pre_hire: entries.filter((e) => e.employmentStatus === "pre_hire").length,
 onboarding: entries.filter((e) => e.employmentStatus === "onboarding_scheduled"|| e.employmentStatus === "onboarding_in_progress").length,
 };

 const allPreHireSelected = preHireFiltered.length > 0 && preHireFiltered.every((e) => selectedIds.has(e.id));

 const toggleSelect = (id: string) => {
 setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
 };
 const toggleSelectAll = () => {
 if (allPreHireSelected) {
 setSelectedIds((prev) => { const n = new Set(prev); for (const e of preHireFiltered) n.delete(e.id); return n; });
 } else {
 setSelectedIds((prev) => { const n = new Set(prev); for (const e of preHireFiltered) n.add(e.id); return n; });
 }
 };

 const openWizard = (emps: PipelineEntry[]) => {
 const firstOrgId = emps[0]?.organizationId;
 const seats = firstOrgId && orgSeatData ? orgSeatData[firstOrgId] : null;
 setWizardEmployees(
 emps.map((e) => ({
 id: e.id,
 legalFirstName: e.legalFirstName,
 legalLastName: e.legalLastName,
 personalEmail: e.personalEmail,
 organizationName: e.organization?.name ?? null,
 hourlyRate: e.hourlyRate ? String(e.hourlyRate) : null,
 monthlySalary: e.monthlySalary ? String(e.monthlySalary) : null,
 compensationType: (e as any).compensationType ?? null,
 currency: e.currency ?? "USD",
 startDate: e.startDate ? new Date(e.startDate as any).toISOString().slice(0, 10) : null,
 jobTitle: e.jobTitle ?? null,
 department: e.department ?? null,
 }))
 );
 setWizardOrgPaymentMethod(firstOrgId && orgPaymentMethods ? (orgPaymentMethods[firstOrgId] ?? null) : null);
 setWizardSeatInfo(seats);
 };

 const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
 e.preventDefault();
 const fd = new FormData(e.currentTarget);
 startTransition(async () => {
 try {
 const result = await createPreHireEmployee({
 organizationId: fixedOrgId ?? (fd.get("organizationId") as string),
 legalFirstName: fd.get("legalFirstName") as string,
 legalLastName: fd.get("legalLastName") as string,
 personalEmail: fd.get("personalEmail") as string,
 employmentType: fd.get("employmentType") as string,
 jobTitle: fd.get("jobTitle") as string,
 department: fd.get("department") as string,
 country: fd.get("country") as string,
 hourlyRate: fd.get("hourlyRate") as string,
 currency: (fd.get("currency") as string) || "USD",
 startDate: fd.get("startDate") as string,
 });
 if (!result.success) {
 showError({ title: "Error", message: `Warning: ${(result as any).error}` });
 return;
 }
 setShowAdd(false);
 setNotice("Approved: New pre-hire added to the pipeline.");
 } catch (err) {
 showError({ title: "Error", message: getWarningMessage(err, "Unable to add hire.") });
 }
 });
 };

 const [showCreateZoomTop, setShowCreateZoomTop] = useState(false);
 const [selectedPreviewFormId, setSelectedPreviewFormId] = useState<string | null>(null);
 const [topZoomMsg, setTopZoomMsg] = useState<Record<string, string>>({});
 const [deletingBatchId, setDeletingBatchId] = useState<string | null>(null);
 const [confirmDeleteZoomBatchId, setConfirmDeleteZoomBatchId] = useState<string | null>(null);
 const [topZoomHost, setTopZoomHost] = useState("");

 const zoomBatches = batchSessions.filter((s) => s.zoomJoinUrl);
 const pendingChecklistEmployeeIds = entries
 .filter((entry) => {
 const session = entry.onboardingSessions[0];
 return (
 (entry.employmentStatus === "onboarding_scheduled"|| entry.employmentStatus === "onboarding_in_progress") &&
 !!session?.jotformsSent &&
 !session?.jotformsCompleted
 );
 })
 .map((entry) => entry.id);
 const pendingChecklistKey = pendingChecklistEmployeeIds.join("|");
 const pendingChecklistRef = useRef(pendingChecklistEmployeeIds);
 pendingChecklistRef.current = pendingChecklistEmployeeIds;

 const selectedPreviewForm =
 jotformForms.find((f) => f.id === selectedPreviewFormId) ?? jotformForms[0] ?? null;
 const selectedPreviewFormUrl = selectedPreviewForm?.url ?? null;

 useEffect(() => {
 if (!pendingChecklistRef.current.length) return;
 let cancelled = false;
 const syncAll = async () => {
 const ids = pendingChecklistRef.current;
 if (ids.length === 0) return;
 let shouldRefresh = false;
 for (const employeeId of ids) {
 try {
 const result = await syncOnboardingChecklist(employeeId);
 if (!("error" in result) && (result as any).ok && (result as any).completedCount > 0) shouldRefresh = true;
 } catch {
 // Ignore background sync errors; manual sync is still available in actions.
 }
 }
 if (!cancelled && shouldRefresh) router.refresh();
 };
 void syncAll();
 const interval = setInterval(() => {
 void syncAll();
 }, 120_000);
 return () => {
 cancelled = true;
 clearInterval(interval);
 };
 }, [pendingChecklistKey, router]);

 return (
 <div className="space-y-4">
 {/* Top-level tabs */}
 <div className="flex gap-1 rounded-lg border p-1">
 {([
 ["pipeline", `Pipeline (${entries.length})`],
 ["offboarding", `Offboarding (${offboardingEntries.length})`],
 ["zoom", `Calendar Events (${zoomBatches.length})`],
 ["forms", `Forms (${jotformForms.length})`],
 ] as const).map(([key, label]) => (
 <button
 key={key}
 type="button"
 onClick={() => setTopTab(key)}
 className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
 topTab === key ? "bg-primary text-primary-foreground shadow-sm": "text-muted-foreground hover:text-foreground hover:bg-muted"
 }`}
 >
 {label}
 </button>
 ))}
 </div>

 {/* PIPELINE TAB */}
 {topTab === "pipeline"&& (<>
 {/* Filter tabs + add button */}
 <div className="flex items-center justify-between">
 <div className="flex gap-1 rounded-lg border p-1">
 {([
 ["pre_hire", `Pre-Hire (${counts.pre_hire})`],
 ["onboarding", `Onboarding (${counts.onboarding})`],
 ] as const).map(([key, label]) => (
 <button
 key={key}
 type="button"
 onClick={() => setFilter(key)}
 className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
 filter === key ? "bg-primary text-primary-foreground shadow-sm": "text-muted-foreground hover:text-foreground hover:bg-muted"
 }`}
 >
 {label}
 </button>
 ))}
 </div>
 <button type="button"onClick={() => setShowAdd(true)} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
 + Add Hire
 </button>
 {pendingHiresCount ? (
 <Link href={`/${orgSlug}/pending-hires`} className="inline-flex h-9 items-center gap-2 rounded-md border border-orange-300 bg-orange-50 text-orange-800 hover:bg-orange-100 dark:border-orange-700 dark:bg-orange-950 dark:text-orange-200 px-4 text-sm font-medium">
   <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{pendingHiresCount}</span>
   Pending Hires
 </Link>
 ) : (
 <Link href={`/${orgSlug}/pending-hires`} className="inline-flex h-9 items-center gap-2 rounded-md border px-4 text-sm font-medium hover:bg-accent">
   Pending Hires
   <span className="text-xs text-muted-foreground">({pendingHiresCount})</span>
 </Link>
 )}
 </div>

 {/* Batch action bar */}
 {selectedIds.size > 0 && (
 <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5">
 <span className="text-sm font-medium">{selectedIds.size} selected</span>
 <div className="flex gap-2">
 <button type="button"onClick={() => setSelectedIds(new Set())} className="h-8 rounded-md border px-3 text-xs hover:bg-accent">Clear</button>
 <button
 type="button"
 onClick={() => openWizard(entries.filter((e) => selectedIds.has(e.id) && e.employmentStatus === "pre_hire"))}
 className="h-8 rounded-md bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700"
 >
 Start Batch Onboarding ({selectedIds.size})
 </button>
 </div>
 </div>
 )}
 {notice && (
 <div className="flex items-center justify-between rounded-md bg-green-100 px-3 py-2 text-sm text-green-700 dark:bg-green-900/30 dark:text-green-300 animate-in fade-in slide-in-from-top-1">
 <span>{notice}</span>
 <button type="button"onClick={() => setNotice(null)} className="ml-2 text-green-500 hover:text-green-800 dark:hover:text-green-100">&times;</button>
 </div>
 )}

 {/* Pipeline table */}
 <div className="rounded-xl border bg-card divide-y">
 {/* Header */}
 <div className="flex items-center gap-3 px-4 py-3 text-xs font-medium text-muted-foreground">
 <div className="w-7">
 {preHireFiltered.length > 0 && (
 <input type="checkbox"checked={allPreHireSelected} onChange={toggleSelectAll} className="h-3.5 w-3.5 rounded border-gray-300"/>
 )}
 </div>
 <div className="flex-1">Name</div>
 <div className="hidden md:block w-32">Organization</div>
 <div className="hidden md:block w-28">Role</div>
 <div className="w-24">Status</div>
 <div className="hidden lg:block w-48">Progress</div>
 <div className="w-64 text-right">Actions</div>
 </div>

 {filtered.map((entry) => {
 const session = entry.onboardingSessions[0];
 const badge = STATUS_BADGE[entry.employmentStatus] ?? STATUS_BADGE.pre_hire;
 const isPreHire = entry.employmentStatus === "pre_hire";
 const isOnboarding = entry.employmentStatus === "onboarding_in_progress"|| entry.employmentStatus === "onboarding_scheduled";
 const canExpand = isOnboarding && session;
 const isExpanded = expandedId === entry.id && canExpand;
 const justCompleted = completedIds.has(entry.id);
 const isRemoving = removingIds.has(entry.id);

 if (isRemoving) {
 return (
 <div key={entry.id} className="flex items-center gap-3 border-b px-4 py-3 opacity-40 transition-opacity duration-500">
 <div className="w-7"><div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent"/></div>
 <div className="flex-1">
 <span className="text-sm text-muted-foreground">{entry.legalFirstName} {entry.legalLastName} — removing…</span>
 </div>
 </div>
 );
 }

 if (justCompleted) {
 const completedMsg = completedMessages.get(entry.id);
 const isActivated = completedMsg?.toLowerCase().includes("activated");
 return (
 <div key={entry.id} className="flex items-center gap-3 border-b px-4 py-3 bg-green-50 dark:bg-green-950/30 transition-all duration-500">
 <div className="w-7">
 <svg className="h-5 w-5 text-green-600"fill="none"viewBox="0 0 24 24"stroke="currentColor"><path strokeLinecap="round"strokeLinejoin="round"strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
 </div>
 <div className="flex-1">
 <span className="font-medium text-green-800 dark:text-green-200">
 {entry.legalFirstName} {entry.legalLastName}
 </span>
 <span className="ml-2 text-xs text-green-600 dark:text-green-400">{isActivated ? "Done — moved to active contractors": completedMsg ?? "Step updated"}</span>
 </div>
 <Link href={`/${orgSlug}/employees/${entry.id}`} className="text-xs text-green-700 hover:underline dark:text-green-300">
 View profile 
 </Link>
 </div>
 );
 }

 return (
 <div key={entry.id}>
 {/* Row */}
 <div className={`flex items-center gap-3 px-4 py-3 transition-colors ${canExpand ? "cursor-pointer hover:bg-muted/30": "hover:bg-muted/20"}`}
 onClick={canExpand ? () => setExpandedId(expandedId === entry.id ? null : entry.id) : undefined}
 >
 <div className="w-7">
 {isPreHire ? (
 <input type="checkbox"checked={selectedIds.has(entry.id)} onChange={(e) => { e.stopPropagation(); toggleSelect(entry.id); }} className="h-3.5 w-3.5 rounded border-gray-300"/>
 ) : canExpand ? (
 <span className="text-xs text-muted-foreground">{isExpanded ? "": ""}</span>
 ) : null}
 </div>
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2">
 <span className="font-medium text-sm">{entry.legalFirstName} {entry.legalLastName}</span>
 </div>
 {entry.personalEmail && <div className="text-xs text-muted-foreground truncate">{entry.personalEmail}</div>}
 </div>
 <div className="hidden md:block w-32 text-sm text-muted-foreground truncate">{entry.organization?.name ?? "—"}</div>
 <div className="hidden md:block w-28 text-sm truncate">{entry.jobTitle ?? entry.employmentType}</div>
 <div className="w-24">
 <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>{badge.label}</span>
 </div>
 <div className="hidden lg:block w-48"onClick={(e) => e.stopPropagation()}>
 {session && !isPreHire ? (
 <div className="space-y-1">
 <div className="flex items-center gap-2">
 <div className="h-1.5 flex-1 rounded-full bg-gray-200 dark:bg-gray-700">
 <div className={`h-1.5 rounded-full transition-all ${entry.infoApprovalStatus === "pending_review"? "bg-amber-500": "bg-green-500"}`} style={{ width: `${session.overallProgress}%` }} />
 </div>
 <span className="text-xs tabular-nums text-muted-foreground w-8">{session.overallProgress}%</span>
 </div>
 {entry.infoApprovalStatus === "pending_review"&& (
 <span className="text-[10px] text-amber-600 dark:text-amber-400 animate-pulse">Pending review — expand to approve</span>
 )}
 {entry.infoApprovalStatus === "approved"&& (
 <span className="text-[10px] text-green-600 dark:text-green-400">Info approved</span>
 )}
 {entry.infoApprovalStatus === "rejected"&& (
 <span className="text-[10px] text-red-600 dark:text-red-400"> Rejected — awaiting resubmission</span>
 )}
 </div>
 ) : <span className="text-xs text-muted-foreground">{"—"}</span>}
 </div>
 <div className="w-64 flex items-center justify-end gap-2"onClick={(e) => e.stopPropagation()}>
 {isPreHire && (
 <button
 type="button"
 onClick={() => openWizard([entry])}
 className="h-7 shrink-0 whitespace-nowrap rounded-md bg-blue-600 px-2.5 text-xs font-medium text-white hover:bg-blue-700"
 >
 Start Onboarding
 </button>
 )}
 {isPreHire && (
 <button
 type="button"
 onClick={() => setPendingDeletePreHire({ id: entry.id, name: `${entry.legalFirstName} ${entry.legalLastName}` })}
 disabled={isPending}
 className="h-7 shrink-0 rounded-md border border-red-300 px-2.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950 disabled:opacity-50"
 >
 Delete
 </button>
 )}
 {isOnboarding && (
 <button
 type="button"
 onClick={() =>
 setPendingRemoveFromOnboarding({
 id: entry.id,
 name: `${entry.legalFirstName} ${entry.legalLastName}`,
 })
 }
 disabled={isPending}
 className="h-7 rounded-md border border-red-300 px-2.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950 disabled:opacity-50"
 >
 Remove
 </button>
 )}
 <Link
 href={`/${orgSlug}/employees/${entry.id}`}
 className="h-7 shrink-0 whitespace-nowrap rounded-md border px-2.5 text-xs font-medium leading-7 hover:bg-accent"
 >
 View
 </Link>
 </div>
 </div>

 {/* Inline onboarding steps */}
 {isExpanded && session && (
 <div className="border-t bg-muted/10 px-4 py-3 space-y-2">
 {/* Initiated by */}
 {session.startedByName && (
 <div className="text-[11px] text-muted-foreground">
 Started by <span className="font-medium text-foreground">{session.startedByName}</span>
 {session.startedAt && <> · {new Date(session.startedAt as any).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC"})}</>}
 </div>
 )}
 {/* RSVP Status — auto-synced from Google Calendar */}
 <div className="flex flex-wrap gap-2 pb-2">
 {session.zoomInviteSent && (
 <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${
 session.zoomRsvpStatus === "accepted"? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300":
 session.zoomRsvpStatus === "declined"? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300":
 "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
 }`}>
 {session.zoomRsvpStatus === "accepted"? "Accepted":
 session.zoomRsvpStatus === "declined"? "Declined":
 "RSVP Pending"}
 </span>
 )}
 {!session.zoomInviteSent && (
 <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
 Invite Not Sent
 </span>
 )}
 </div>
 {getRenderableSteps(session.steps).map((step, idx) => {
              const stepProps = {
                step, number: idx + 1, employeeId: entry.id, session, senders,
                jotformForms, zoomSessions, zoomHosts,
                organizationName: entry.organization?.name ?? null,
                zoomHostByOrg, isPending,
                onAction: (fn: () => Promise<void>) => startTransition(async () => { await fn(); scheduleRefresh(); }),
                onCompleted: markCompleted,
                infoApprovalStatus: entry.infoApprovalStatus ?? undefined,
              };
              return <InlineStep key={step.id} {...stepProps} />;
            })}
 {/* Activate button — only when all required steps are completed */}
 {session.overallProgress >= 100 && entry.employmentStatus !== "active"&& (
 <div className="mt-2 flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 p-2 dark:border-green-700 dark:bg-green-950/40">
 <span className="flex-1 text-xs text-green-800 dark:text-green-300">All steps completed. Ready to activate.</span>
 <button
 type="button"
 disabled={isPending}
 onClick={(e) => {
 e.stopPropagation();
 startTransition(async () => {
 const { activateContractor } = await import("@/app/actions/hriq/onboarding");
 const result = await activateContractor(entry.id);
 if (result?.error) {
   showError({ title: "Activation Failed", message: (result as any).error });
   return;
 }
 markCompleted(entry.id, `${entry.legalFirstName} ${entry.legalLastName} activated.`);
 });
 }}
 className="h-7 rounded-md bg-green-600 px-3 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
 >
 {isPending ? "Activating…": "Activate Contractor"}
 </button>
 </div>
 )}
 <div className="mt-2 flex items-center gap-2">
 <button
 type="button"
 onClick={(e) => { e.stopPropagation(); setEditingEntry(entry); }}
 className="h-7 rounded-md border border-blue-300 bg-blue-50 px-3 text-xs font-medium text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-900/40"
 >
 Reschedule
 </button>
 <button
 type="button"
 disabled={isPending}
 onClick={(e) => {
 e.stopPropagation();
 startTransition(async () => {
 try {
 const { resendOnboardingEmail } = await import("@/app/actions/hriq/onboarding");
 const result = await resendOnboardingEmail(entry.id);
 if ("error" in result) { setNotice((result as any).error ?? "Failed"); }
 else if ((result as any).ok) {
 setNotice((result as any).message);
 } else {
 setNotice((result as any).error ?? "Failed");
 }
 } catch (err) {
 setNotice("Failed to resend email.");
 }
 });
 }}
 className="h-7 rounded-md border px-3 text-xs font-medium hover:bg-accent disabled:opacity-50"
 >
 {isPending ? "Sending…": "Resend Onboarding Email"}
 </button>
 <Link href={`/${orgSlug}/employees/${entry.id}`} className="text-xs text-primary hover:underline">
 View full profile
 </Link>
 </div>
 </div>
 )}
 </div>
 );
 })}

 {filtered.length === 0 && (
 <div className="py-12 text-center text-sm text-muted-foreground">
 {filter === "pre_hire"? "No pre-hire candidates right now.": "No entries in this stage."}
 </div>
 )}
 </div>

 </>)}

 {/* ZOOM SESSIONS TAB */}
 {topTab === "zoom"&& (
 <div className="space-y-4">
 {zoomBatches.length === 0 ? (
 <div className="flex items-center justify-between rounded-xl border bg-card px-5 py-4">
 <span className="text-sm text-muted-foreground">No events yet. Create one to schedule orientations.</span>
 <button type="button"onClick={() => setShowCreateZoomTop(true)} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
 + New Event
 </button>
 </div>
 ) : (
 <>
 <ZoomSessionsDnd
 batches={zoomBatches}
 orgSlug={orgSlug}
 isPending={isPending}
 deletingBatchId={deletingBatchId}
 formatDate={formatPacificDateTime}
 onDeleteBatch={(id) => setConfirmDeleteZoomBatchId(id)}
 msgs={topZoomMsg}
 setMsgs={setTopZoomMsg}
 />
 <button type="button"onClick={() => setShowCreateZoomTop(true)} className="h-9 rounded-md border px-4 text-sm font-medium hover:bg-accent">
 + New Event
 </button>
 </>
 )}
 {showCreateZoomTop && (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in duration-150">
 <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border bg-card p-6 shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-200">
 <h2 className="text-lg font-semibold">New Event</h2>
 <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(async () => { try { await createBatchSession({ title: fd.get("title") as string, description: fd.get("description") as string, zoomMeetingDate: fd.get("zoomMeetingDate") as string, zoomDuration: Number(fd.get("zoomDuration")) || 60, zoomHost: topZoomHost || undefined }); setShowCreateZoomTop(false); } catch (err) { showError({ title: "Zoom Error", message: getWarningMessage(err, "Failed to create Zoom session.") }); } }); }} className="mt-4 space-y-4">
 <div>
 <label className="text-sm font-medium">Title *</label>
 <input name="title"required className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"/>
 </div>
 <div>
 <label className="text-sm font-medium">Description</label>
 <textarea name="description"rows={2} className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"/>
 </div>
 <div className="grid grid-cols-2 gap-4">
 <div className="relative">
 <label className="text-sm font-medium">Meeting Date & Time (PT) *</label>
 <DateTimePicker name="zoomMeetingDate"required min={new Date().toISOString().slice(0, 16)} className="mt-1"/>
 </div>
 <div>
 <label className="text-sm font-medium">Duration (min)</label>
 <input name="zoomDuration"type="number"defaultValue={60} className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"/>
 </div>
 </div>
 {zoomHosts.length > 0 && (
 <div>
 <label className="text-sm font-medium">Zoom Host Account</label>
 <ZoomHostSearch
 hosts={zoomHosts}
 value={topZoomHost}
 onChange={setTopZoomHost}
 className="mt-1"
 />
 {topZoomHost && topZoomHost !== "me"&& (
 <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
 Meeting will be created under <strong>{topZoomHost}</strong> — they will receive an email notification with the host start link.
 </p>
 )}
 </div>
 )}
 <div className="flex justify-end gap-2">
 <button type="button"onClick={() => setShowCreateZoomTop(false)} className="h-9 rounded-md border px-4 text-sm hover:bg-accent">Cancel</button>
 <button type="submit"disabled={isPending} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
 {isPending ? "Creating...": "Create Event"}
 </button>
 </div>
 </form>
 </div>
 </div>
 )}
 </div>
 )}

 {/* FORMS TAB */}
 {topTab === "forms"&& (
 <div className="space-y-3">
 <div className="rounded-xl border bg-card p-4">
 <div className="mb-2 flex items-center justify-between">
 <h3 className="text-sm font-semibold">Available Forms</h3>
 <span className="text-xs text-muted-foreground">{jotformForms.length}</span>
 </div>
 {jotformForms.length > 0 ? (
 <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
 {jotformForms.map((f) => (
 <button
 key={f.id}
 type="button"
 onClick={() => setSelectedPreviewFormId(f.id)}
 className={`rounded border px-3 py-2 text-left text-xs transition-colors ${
 selectedPreviewForm?.id === f.id
 ? "border-primary bg-primary/10 text-foreground"
 : "bg-muted/30 hover:bg-accent"
 }`}
 >
 {f.title}
 </button>
 ))}
 </div>
 ) : (
 <div className={`rounded px-2 py-1 text-xs ${jotformStatus.connected ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300": "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300"}`}>
 {jotformStatus.connected
 ? "Connected to JotForm but no forms found."
 : `JotForm issue: ${jotformStatus.message}`}
 </div>
 )}
 </div>

 {selectedPreviewForm && (
 <div className="rounded-xl border bg-card p-3">
 <div className="mb-2 flex items-center justify-between gap-3">
 <h4 className="truncate text-sm font-semibold">{selectedPreviewForm.title}</h4>
 <a
 href={selectedPreviewFormUrl ?? selectedPreviewForm.url}
 target="_blank"
 rel="noopener noreferrer"
 className="rounded-md border px-2.5 py-1 text-xs hover:bg-accent"
 >
 Open Form
 </a>
 </div>
 <div className="rounded-lg border bg-muted/20 p-4">
 <div className="text-sm font-medium">Form preview opens in a new tab.</div>
 <div className="mt-1 text-xs text-muted-foreground">
 We intentionally avoid in-app iframes for JotForm documents to prevent cross-origin Sign errors and blank previews.
 </div>
 <div className="mt-3">
 <a
 href={selectedPreviewFormUrl ?? selectedPreviewForm.url}
 target="_blank"
 rel="noopener noreferrer"
 className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
 >
 Open "{selectedPreviewForm.title}"in new tab
 </a>
 </div>
 </div>
 </div>
 )}

 {/* Signature Sheets — signed/completed forms from onboarding */}
 {(() => {
 const signedForms = entries.flatMap((e) => {
 const session = e.onboardingSessions?.[0];
 if (!session?.steps) return [];
 return session.steps
 .filter((s) => s.stepType === "jotform"&& (s.status === "completed"|| s.status === "signed") && s.formUrl)
 .map((s) => ({
 employeeName: `${e.legalFirstName} ${e.legalLastName}`,
 employeeId: e.id,
 stepName: s.stepName,
 formUrl: s.formUrl!,
 formSubmissionId: s.formSubmissionId ?? null,
 completedAt: s.completedAt,
 }));
 });
 const sentForms = entries.flatMap((e) => {
 const session = e.onboardingSessions?.[0];
 if (!session?.steps) return [];
 return session.steps
 .filter((s) => s.stepType === "jotform"&& s.status === "sent"&& s.formUrl)
 .map((s) => ({
 employeeName: `${e.legalFirstName} ${e.legalLastName}`,
 employeeId: e.id,
 stepName: s.stepName,
 formUrl: s.formUrl!,
 }));
 });
 return (
 <div className="rounded-xl border bg-card p-4">
 <div className="mb-3 flex items-center justify-between">
 <h3 className="text-sm font-semibold">Signature Sheets</h3>
 <div className="flex items-center gap-2">
 <button
  className="rounded border px-2 py-0.5 text-[11px] font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/30"
  onClick={async () => {
    try {
      const { syncJotFormSignatureStatus } = await import("@/app/actions/hriq/onboarding");
      const result = await syncJotFormSignatureStatus();
      if ("error" in result) { showError({ title: "Sync Failed", message: (result as any).error ?? "Sync failed" }); return; }
      if ((result as any).ok) {
        showSuccess((result as any).message);
      } else {
        showError({ title: "Sync Failed", message: (result as any).message ?? "Sync failed" });
      }
    } catch (err) {
      showError({ title: "Error", message: err instanceof Error ? err.message : "Failed to sync" });
    }
  }}
 >
  Check JotForm Status
 </button>
 <span className="text-xs text-muted-foreground">{signedForms.length} signed · {sentForms.length} pending</span>
 </div>
 </div>
 {signedForms.length > 0 ? (
 <div className="space-y-1.5">
 {signedForms.map((sf, i) => (
 <div key={`signed-${i}`} className="flex items-center justify-between gap-2 rounded border bg-green-50 px-3 py-2 dark:bg-green-950/30">
 <div className="min-w-0 flex-1">
 <div className="flex items-center gap-1.5">
 <span className="truncate text-xs font-medium">{sf.employeeName}</span>
 </div>
 <div className="truncate text-[11px] text-muted-foreground">{sf.stepName}</div>
 </div>
 <div className="flex items-center gap-2">
 {sf.completedAt && (
 <span className="text-[11px] text-muted-foreground">{shortDate(sf.completedAt as any)}</span>
 )}
 <a href={sf.formSubmissionId ? `/api/documents/view?submissionId=${sf.formSubmissionId}&employeeId=${sf.employeeId}` : sf.formUrl} target="_blank" rel="noopener noreferrer" className="rounded border px-2 py-0.5 text-[11px] hover:bg-accent">View PDF</a>
 </div>
 </div>
 ))}
 </div>
 ) : (
 <div className="text-xs text-muted-foreground">No signed forms yet.</div>
 )}
 {sentForms.length > 0 && (
 <div className="mt-3">
 <div className="mb-1.5 text-xs font-medium text-muted-foreground">Awaiting Signature</div>
 <div className="space-y-1.5">
 {sentForms.map((sf, i) => (
 <div key={`sent-${i}`} className="flex items-center justify-between gap-2 rounded border bg-yellow-50 px-3 py-2 dark:bg-yellow-950/20">
 <div className="min-w-0 flex-1">
 <div className="flex items-center gap-1.5">
 <span className="truncate text-xs font-medium">{sf.employeeName}</span>
 </div>
 <div className="truncate text-[11px] text-muted-foreground">{sf.stepName}</div>
 </div>
 <a href={sf.formUrl} target="_blank"rel="noopener noreferrer"className="rounded border px-2 py-0.5 text-[11px] hover:bg-accent">Open</a>
 </div>
 ))}
 </div>
 </div>
 )}
 </div>
 );
 })()}
 </div>
 )}

 {/* OFFBOARDING TAB */}
 {topTab === "offboarding"&& (
 <OffboardingPipeline entries={offboardingEntries} senders={senders} orgSlug={orgSlug} />
 )}

 {/* Add hire modal */}
 {showAdd && (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in duration-150">
 <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-200">
 <h2 className="text-lg font-semibold">Add New Hire</h2>
 <form onSubmit={handleCreate} className="mt-4 space-y-3">
 {!fixedOrgId && (
 <div>
 <label className="text-sm font-medium">Organization</label>
 <CustomSelect
 name="organizationId"
 required
 placeholder="Select..."
 triggerClassName="mt-1 h-9 w-full"
 options={organizations.map((org) => ({ value: org.id, label: org.name }))}
 onValueChange={(val) => setSelectedNewHireOrg(val)}
 />
 {selectedNewHireOrg && orgSeatData?.[selectedNewHireOrg] && (() => {
   const s = orgSeatData[selectedNewHireOrg]!;
   const full = s.taken >= s.vaSeats;
   return (
     <div className={`mt-1.5 flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium ${full ? "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300" : "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-300"}`}>
       <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/></svg>
       {s.taken}/{s.vaSeats} VA seats taken{full ? " — at capacity" : ""}
     </div>
   );
 })()}
 </div>
 )}
 <div className="grid grid-cols-2 gap-3">
 <div><label className="text-sm font-medium">First Name</label><input name="legalFirstName"required className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"/></div>
 <div><label className="text-sm font-medium">Last Name</label><input name="legalLastName"required className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"/></div>
 </div>
 <div><label className="text-sm font-medium">Email</label><input name="personalEmail"type="email"required className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"/></div>
 <div className="grid grid-cols-2 gap-3">
 <div>
 <label className="text-sm font-medium">Type</label>
 <CustomSelect
 name="employmentType"
 required
 defaultValue="full_time"
 triggerClassName="mt-1 h-9 w-full"
 options={[
 { value: "full_time", label: "Full Time"},
 { value: "part_time", label: "Part Time"},
 ]}
 />
 </div>
 <div><label className="text-sm font-medium">Job Title</label><CustomSelectWithOther name="jobTitle"placeholder="Select role..."triggerClassName="mt-1 h-9 w-full"baseOptions={[...JOB_TITLE_OPTIONS]} category="job_title"/></div>
 </div>
 <div className="grid grid-cols-2 gap-3">
 <div><label className="text-sm font-medium">Department</label><CustomSelectWithOther name="department"placeholder="Select department..."triggerClassName="mt-1 h-9 w-full"baseOptions={[...DEPARTMENT_OPTIONS]} category="department"/></div>
 <div><label className="text-sm font-medium">Country</label><SearchableSelect name="country"placeholder="Select country..."triggerClassName="mt-1 h-9 w-full"options={[...COUNTRY_OPTIONS]} /></div>
 </div>
 <div className="grid grid-cols-3 gap-3">
 <div><label className="text-sm font-medium">Rate</label><input name="hourlyRate"type="number"step="0.01"className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"/></div>
 <div>
 <label className="text-sm font-medium">Currency</label>
 <CustomSelect
 name="currency"
 defaultValue="USD"
 triggerClassName="mt-1 h-9 w-full"
 options={[
 { value: "USD", label: "USD"},
 { value: "PHP", label: "PHP"},
 { value: "EUR", label: "EUR"},
 ]}
 />
 </div>
 <div><label className="text-sm font-medium">Start <span className="text-red-500">*</span></label><DatePicker name="startDate"required className="mt-1"/></div>
 </div>
 <div className="flex justify-end gap-2 pt-2">
 <button type="button"onClick={() => setShowAdd(false)} className="h-9 rounded-md border px-4 text-sm hover:bg-accent">Cancel</button>
 <button type="submit"disabled={isPending} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
 {isPending ? "Adding...": "Add to Pipeline"}
 </button>
 </div>
 </form>
 </div>
 </div>
 )}

 {/* Onboarding Wizard */}
 {wizardEmployees && (
 <OnboardingWizard
 employees={wizardEmployees}
 jotformForms={jotformForms}
 jotformStatus={jotformStatus}
 senders={senders}
 zoomSessions={zoomSessions}
 zoomHosts={zoomHosts}
 zoomHostByOrg={zoomHostByOrg}
 orgPaymentMethod={wizardOrgPaymentMethod}
        seatInfo={wizardSeatInfo}
 onSuccess={(message) => {
 setNotice(message);
 }}
 onClose={() => { setWizardEmployees(null); setSelectedIds(new Set()); }}
 />
 )}

 {/* Reschedule Dialog */}
 {editingEntry && (() => {
 const session = editingEntry.onboardingSessions[0];
 const hasExistingZoom = !!(session?.zoomMeetingDate);
 return (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in duration-150">
 <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border bg-card p-6 shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-200"onClick={(e) => e.stopPropagation()}>
 <h2 className="text-lg font-semibold">Reschedule</h2>
 <p className="text-xs text-muted-foreground mt-0.5">{editingEntry.legalFirstName} {editingEntry.legalLastName}{editingEntry.organization ? ` · ${editingEntry.organization.name}` : ""}</p>
 {session?.batchSession && session.batchSession.onboardingSessions.length > 1 && (
 <div className="mt-2 rounded-md bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 px-3 py-1.5">
 <p className="text-xs text-violet-700 dark:text-violet-300">
 Batch interview with: {session.batchSession.onboardingSessions.filter((bs: any) => bs.employee.id !== editingEntry.id).map((bs: any) => `${bs.employee.legalFirstName} ${bs.employee.legalLastName}`).join(", ")}
 </p>
 </div>
 )}
 <form onSubmit={(e) => {
 e.preventDefault();
 const fd = new FormData(e.currentTarget);
 const newStart = fd.get("startDate") as string;
 const newZoom = fd.get("zoomDate") as string;
 const newJob = fd.get("jobTitle") as string;
 const newRate = fd.get("hourlyRate") as string;
 const newCurrency = fd.get("currency") as string;
 const newDuration = Number(fd.get("zoomDuration")) || 60;
 const transferCalendarTo = (fd.get("transferCalendarTo") as string || "").trim();
 if (!newStart) return;

 // Build confirmation summary
 const changes: string[] = [];
 const oldStart = editingEntry.startDate ? new Date(editingEntry.startDate as any).toISOString().slice(0, 10) : "";
 if (newStart !== oldStart) changes.push(`Start date ${new Date(newStart + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric"})}`);
 if (newZoom) changes.push(`Zoom meeting ${new Date(newZoom as any).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit"})} (${newDuration}m)`);
 if (newJob && newJob !== (editingEntry.jobTitle ?? "")) changes.push(`Job title ${newJob}`);
 if (newRate && newRate !== String(editingEntry.hourlyRate ?? "")) changes.push(`Pay rate ${newCurrency} ${newRate}/hr`);
 const currentOrganizer = session?.batchSession?.calendarOrganizerEmail ?? "";
 if (transferCalendarTo && transferCalendarTo !== currentOrganizer) changes.push(`Calendar host → ${transferCalendarTo}`);

 if (changes.length === 0) { setEditingEntry(null); return; }

 setRescheduleConfirm({
 entry: editingEntry,
 changes,
 newStart,
 newZoom,
 newJob,
 newRate,
 newCurrency,
 newDuration,
 hasZoom: !!newZoom,
 batchMembers: (() => {
 const batch = session?.batchSession;
 if (!batch || !batch.onboardingSessions) return [];
 return batch.onboardingSessions
 .filter((bs: any) => bs.employee.id !== editingEntry.id)
 .map((bs: any) => ({ id: bs.employee.id, name: `${bs.employee.legalFirstName} ${bs.employee.legalLastName}` }));
 })(),
 splitFromBatch: true, // default to split (safe option)
 transferCalendarTo,
 });
 }} className="mt-4 space-y-4">
 <div className="grid grid-cols-2 gap-4">
 <div>
 <label className="text-sm font-medium">Start Date</label>
 <DatePicker name="startDate"value={editingEntry.startDate ? new Date(editingEntry.startDate as any).toISOString().slice(0, 10) : ""} className="mt-1"/>
 </div>
 <div>
 <label className="text-sm font-medium">Zoom Meeting Date</label>
 <DateTimePicker name="zoomDate"value={hasExistingZoom && session?.zoomMeetingDate ? utcToPacificBare(session.zoomMeetingDate) : ""} className="mt-1"/>
 <p className="text-[10px] text-muted-foreground mt-1">Reschedules or creates the Zoom meeting &amp; calendar invite</p>
 </div>
 </div>
 <div className="grid grid-cols-4 gap-4">
 <div>
 <label className="text-sm font-medium">Duration (min)</label>
 <CustomSelect
 name="zoomDuration"
 defaultValue={String(session?.batchSession?.zoomDuration ?? 60)}
 triggerClassName="mt-1 h-9 w-full"
 options={[
 { value: "30", label: "30m"},
 { value: "45", label: "45m"},
 { value: "60", label: "60m"},
 { value: "90", label: "90m"},
 ]}
 />
 </div>
 <div>
 <label className="text-sm font-medium">Job Title</label>
 <CustomSelectWithOther name="jobTitle"defaultValue={editingEntry.jobTitle ?? ""} placeholder="Select role..."triggerClassName="mt-1 h-9 w-full"baseOptions={[...JOB_TITLE_OPTIONS]} category="job_title"/>
 </div>
 <div>
 <label className="text-sm font-medium">Pay Rate</label>
 <input name="hourlyRate"defaultValue={editingEntry.hourlyRate != null ? String(editingEntry.hourlyRate) : ""} className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"/>
 </div>
 <div>
 <label className="text-sm font-medium">Currency</label>
 <CustomSelect
 name="currency"
 defaultValue={editingEntry.currency ?? "USD"}
 triggerClassName="mt-1 h-9 w-full"
 options={[
 { value: "USD", label: "USD"}, { value: "EUR", label: "EUR"}, { value: "GBP", label: "GBP"},
 { value: "PHP", label: "PHP"}, { value: "COP", label: "COP"}, { value: "BRL", label: "BRL"},
 { value: "CLP", label: "CLP"}, { value: "MXN", label: "MXN"}, { value: "CAD", label: "CAD"},
 { value: "AUD", label: "AUD"}, { value: "INR", label: "INR"},
 ]}
 />
 </div>
 </div>
 {/* Calendar Host — show when employee has a calendar event */}
 {session?.googleCalendarEventId && (
 <div>
 <label className="text-sm font-medium">Calendar Host</label>
 <input name="transferCalendarTo"placeholder={session?.batchSession?.calendarOrganizerEmail ? `Current: ${session.batchSession.calendarOrganizerEmail}` : "Enter email to change host"} defaultValue=""className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground"/>
 <p className="text-xs text-muted-foreground mt-1">Leave blank to keep current host. Enter a Google Workspace email to transfer.</p>
 </div>
 )}
 <div className="flex justify-end gap-2">
 <button type="button"onClick={() => setEditingEntry(null)} className="h-9 rounded-md border px-4 text-sm hover:bg-accent">Cancel</button>
 <button type="submit"disabled={isPending} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
 {isPending ? "Saving...": "Confirm Reschedule"}
 </button>
 </div>
 </form>
 </div>
 </div>
 );
 })()}

 {/* Reschedule Confirmation Modal */}
 {rescheduleConfirm && (
 <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
 <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-200"onClick={(e) => e.stopPropagation()}>
 <h2 className="text-lg font-semibold">Confirm Reschedule</h2>
 <p className="text-sm text-muted-foreground mt-1">
 {rescheduleConfirm.entry.legalFirstName} {rescheduleConfirm.entry.legalLastName}
 {rescheduleConfirm.entry.organization ? ` · ${rescheduleConfirm.entry.organization.name}` : ""}
 </p>
 <div className="mt-4 space-y-2">
 {rescheduleConfirm.changes.map((c, i) => (
 <div key={i} className="flex items-center gap-2 text-sm">
 <svg className="h-4 w-4 text-blue-500 shrink-0"fill="none"viewBox="0 0 24 24"stroke="currentColor"strokeWidth={2}><path strokeLinecap="round"strokeLinejoin="round"d="M9 5l7 7-7 7"/></svg>
 <span>{c}</span>
 </div>
 ))}
 </div>
 {rescheduleConfirm.hasZoom && (
 <div className="mt-3 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2">
 <p className="text-xs text-amber-700 dark:text-amber-300">The Zoom meeting will be rescheduled and calendar invites updated.</p>
 </div>
 )}
 {/* Batch warning */}
 {rescheduleConfirm.batchMembers.length > 0 && rescheduleConfirm.hasZoom && (
 <div className="mt-3 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-3 py-2 space-y-2">
 <p className="text-xs font-medium text-red-700 dark:text-red-400">
 Batch Interview — also includes: {rescheduleConfirm.batchMembers.map(m => m.name).join(", ")}
 </p>
 <div className="flex gap-2">
 <button
 type="button"
 onClick={() => setRescheduleConfirm({ ...rescheduleConfirm, splitFromBatch: true })}
 className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
 rescheduleConfirm.splitFromBatch
 ? "bg-primary text-primary-foreground border-primary"
 : "hover:bg-accent"
 }`}
 >
 Split — only move {rescheduleConfirm.entry.legalFirstName}
 </button>
 <button
 type="button"
 onClick={() => setRescheduleConfirm({ ...rescheduleConfirm, splitFromBatch: false })}
 className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
 !rescheduleConfirm.splitFromBatch
 ? "bg-primary text-primary-foreground border-primary"
 : "hover:bg-accent"
 }`}
 >
 Move entire batch
 </button>
 </div>
 {rescheduleConfirm.splitFromBatch && (
 <p className="text-[10px] text-muted-foreground">
 {rescheduleConfirm.entry.legalFirstName} will be removed from the batch and get their own Zoom meeting. {rescheduleConfirm.batchMembers.map(m => m.name).join(", ")} stay unchanged.
 </p>
 )}
 {!rescheduleConfirm.splitFromBatch && (
 <p className="text-[10px] text-muted-foreground">
 This will move the Zoom meeting for everyone: {rescheduleConfirm.batchMembers.map(m => m.name).join(", ")} included.
 </p>
 )}
 </div>
 )}
 <div className="mt-5 flex justify-end gap-2">
 <button type="button"onClick={() => setRescheduleConfirm(null)} className="h-9 rounded-md border px-4 text-sm hover:bg-accent">
 Cancel
 </button>
 <button
 type="button"
 disabled={isPending}
 onClick={() => {
 const rc = rescheduleConfirm;
 startTransition(async () => {
 try {
 const { rescheduleStartDate } = await import("@/app/actions/hriq/hiring");
 const result = await rescheduleStartDate(rc.entry.id, rc.newStart, rc.newZoom || undefined, rc.splitFromBatch, rc.transferCalendarTo || undefined, rc.newDuration);

 if ((rc.newJob && rc.newJob !== (rc.entry.jobTitle ?? "")) || (rc.newRate && rc.newRate !== String(rc.entry.hourlyRate ?? "")) || (rc.newCurrency !== (rc.entry.currency ?? "USD"))) {
 const { updateEmployee } = await import("@/app/actions/hriq/employees");
 await updateEmployee(rc.entry.id, {
 jobTitle: rc.newJob || undefined,
 hourlyRate: rc.newRate || undefined,
 currency: rc.newCurrency || undefined,
 });
 }

 setRescheduleConfirm(null);
 setEditingEntry(null);
 const msg = result?.message || rc.changes.join(", ");
 setNotice(`Rescheduled ${rc.entry.legalFirstName} ${rc.entry.legalLastName}: ${msg}`);
 } catch (err) {
 showError({ title: "Reschedule Error", message: err instanceof Error ? err.message : "Failed to reschedule."});
 }
 });
 }}
 className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
 >
 {isPending ? "Saving...": "Confirm Reschedule"}
 </button>
 </div>
 </div>
 </div>
 )}

 {/* Zoom Delete Confirmation Modal */}
 {confirmDeleteZoomBatchId && (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in duration-150">
 <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-200"onClick={(e) => e.stopPropagation()}>
 <h3 className="text-base font-semibold">Delete Event</h3>
 <p className="mt-2 text-sm text-muted-foreground">
 Delete this event, its Zoom meeting, and cancel calendar invites for all attendees? This cannot be undone.
 </p>
 <div className="mt-4 flex justify-end gap-2">
 <button type="button"onClick={() => setConfirmDeleteZoomBatchId(null)} disabled={isPending} className="h-9 rounded-md border px-4 text-sm hover:bg-accent disabled:opacity-50">Cancel</button>
 <button
 type="button"
 onClick={() => {
 const batchId = confirmDeleteZoomBatchId;
 setConfirmDeleteZoomBatchId(null);
 startTransition(async () => {
 setDeletingBatchId(batchId);
 setTopZoomMsg((prev) => {
 const next = { ...prev };
 delete next[batchId];
 return next;
 });
 try {
 const result = await deleteBatchZoomMeeting(batchId);
 if ("error" in result) { showError({ title: "Error", message: (result as any).error ?? "Failed" }); return; }
 const apiNote = (result as any).zoomApiResult === "failed"
 ? "(Note: Zoom API unavailable — meeting may still exist on Zoom but has been removed from HRIQ)"
 : (result as any).zoomApiResult === "skipped"
 ? "(Zoom API not configured — removed from HRIQ only)"
 : "";
 setTopZoomMsg((prev) => ({
 ...prev,
 [batchId]: `Zoom meeting deleted — cancellation emails sent${apiNote}`,
 }));
 } catch (e) {
 const errMsg = e instanceof Error ? e.message : "Failed to delete event";
 setTopZoomMsg((prev) => ({
 ...prev,
 [batchId]: `Error: ${errMsg}`,
 }));
 showError({ title: "Zoom Deletion Failed", message: errMsg });
 } finally {
 setDeletingBatchId((current) => (current === batchId ? null : current));
 }
 });
 }}
 disabled={isPending}
 className="h-9 rounded-md bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
 >
 {isPending ? "Deleting...": "Delete Meeting"}
 </button>
 </div>
 </div>
 </div>
 )}

 {pendingRemoveFromOnboarding && (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in duration-150">
 <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-200"onClick={(e) => e.stopPropagation()}>
 <h3 className="text-base font-semibold">Remove From Onboarding</h3>
 <p className="mt-2 text-sm text-muted-foreground">
 Remove {pendingRemoveFromOnboarding.name} from onboarding? They will be moved back to Pre-Hire.
 </p>
 <div className="mt-4 flex justify-end gap-2">
 <button type="button"onClick={() => setPendingRemoveFromOnboarding(null)} disabled={isPending} className="h-9 rounded-md border px-4 text-sm hover:bg-accent disabled:opacity-50">Cancel</button>
 <button
 type="button"
 onClick={() =>
 startTransition(async () => {
 const target = pendingRemoveFromOnboarding;
 setPendingRemoveFromOnboarding(null);
 if (!target) return;
 setRemovingIds((prev) => new Set(prev).add(target.id));
 try {
 await removeEmployeeFromOnboarding(target.id);
 setNotice(`Approved: ${target.name} moved back to Pre-Hire.`);
 if (expandedId === target.id) setExpandedId(null);
 } catch (err) {
 showError({ title: "Error", message: getWarningMessage(err, "Unable to remove person from onboarding.") });
            } finally {
              setRemovingIds((prev) => { const n = new Set(prev); n.delete(target.id); return n; });
            }
 })
 }
 disabled={isPending}
 className="h-9 rounded-md bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
 >
 {isPending ? "Removing...": "Remove"}
 </button>
 </div>
 </div>
 </div>
 )}

 {pendingDeletePreHire && (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in duration-150">
 <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-200"onClick={(e) => e.stopPropagation()}>
 <h3 className="text-base font-semibold">Delete Pre-Hire</h3>
 <p className="mt-2 text-sm text-muted-foreground">
 Permanently delete <span className="font-medium text-foreground">{pendingDeletePreHire.name}</span> from the pipeline? This cannot be undone.
 </p>
 <div className="mt-4 flex justify-end gap-2">
 <button type="button"onClick={() => setPendingDeletePreHire(null)} disabled={isPending} className="h-9 rounded-md border px-4 text-sm hover:bg-accent disabled:opacity-50">Cancel</button>
 <button
 type="button"
 onClick={() =>
 startTransition(async () => {
 const target = pendingDeletePreHire;
 setPendingDeletePreHire(null);
 if (!target) return;
            setRemovingIds((prev) => new Set(prev).add(target.id));
            try {
              const result = await deletePreHireEmployee(target.id);
              if (!result.success) {
                showError({ title: "Error", message: `Warning: ${(result as any).error}` });
              } else {
                setNotice(`Deleted: ${target.name} removed from pipeline.`);
                setSelectedIds((prev) => { const n = new Set(prev); n.delete(target.id); return n; });
              }
            } finally {
              setRemovingIds((prev) => { const n = new Set(prev); n.delete(target.id); return n; });
            }
            })
          }
 disabled={isPending}
 className="h-9 rounded-md bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
 >
 {isPending ? "Deleting...": "Delete"}
 </button>
 </div>
 </div>
 </div>
 )}
 </div>
 );
}

/* Inline step row for expanded onboarding */

function ProgressApprovalActions({ employeeId, onCompleted }: { employeeId: string; onCompleted: (id: string, msg?: string) => void }) {
 const [pending, startTransition] = useTransition();
 const [done, setDone] = useState<"approved"| "rejected"| null>(null);

 if (done === "approved") {
 return <span className="text-[10px] font-medium text-green-600 dark:text-green-400">Approved</span>;
 }
 if (done === "rejected") {
 return <span className="text-[10px] font-medium text-red-600 dark:text-red-400">Rejected</span>;
 }

 return (
 <div className="flex items-center gap-1">
 <span className="text-[10px] text-amber-600 dark:text-amber-400 animate-pulse mr-0.5">Review</span>
 <button
 type="button"
 disabled={pending}
 onClick={() => {
 startTransition(async () => {
 try {
 const { approveContractorInfo } = await import("@/app/actions/hriq/contractor-info");
 await approveContractorInfo(employeeId);
 setDone("approved");
 } catch (err) { console.error("[hiring] approve contractor info:", err); }
 });
 }}
 className="h-5 rounded bg-green-600 px-1.5 text-[10px] font-medium text-white hover:bg-green-700 disabled:opacity-50"
 >
 {pending ? "…": "Approve"}
 </button>
 <button
 type="button"
 disabled={pending}
 onClick={() => {
 const reason = prompt("Rejection reason (optional):");
 startTransition(async () => {
 try {
 const { rejectContractorInfo } = await import("@/app/actions/hriq/contractor-info");
 await rejectContractorInfo(employeeId, reason || undefined);
 setDone("rejected");
 onCompleted(employeeId, "Contractor info rejected.");
 } catch (err) { console.error("[hiring] reject contractor info:", err); }
 });
 }}
 className="h-5 rounded bg-red-500 px-1.5 text-[10px] font-medium text-white hover:bg-red-600 disabled:opacity-50"
 >
 Reject
 </button>
 </div>
 );
}

// 
// OFFBOARDING PIPELINE COMPONENT
// 

const OFFBOARDING_STEP_ICONS: Record<string, string> = {
 credential_security: "0",
 time_doctor_removal: "1",
 slack_removal: "2",
 recruitcrm_status: "3",
 it_ticket: "4",
 offboarding_notification: "5",
 disable_dashboard: "6",
 final_review: "7",
};

// Steps that run automatically — no Run/Skip buttons shown
const AUTO_STEPS = new Set(["credential_security", "recruitcrm_status"]);

// Canonical step labels — overrides stale labels stored in JSON from old offboardings
const STEP_LABEL_OVERRIDES: Record<string, string> = {
  disable_dashboard: "Disable Dashboard Access (48hr grace period)",
  offboarding_notification: "Send Offboarding Email (1hr delay)",
  slack_removal: "MANUAL: Remove from Slack Admin Panel",
};

// Steps that MUST be done manually outside the platform
const MANUAL_STEPS: Record<string, string> = {
  slack_removal: "Go to Slack Admin > Manage Members > Deactivate this user. Slack API cannot auto-remove on free/pro plans.",
  it_ticket: "Verify the IT ticket was received and access removal is confirmed by IT.",
};

const OFFBOARDING_STEP_STATUS_COLORS: Record<string, string> = {
 pending: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
 in_progress: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
 completed: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
 skipped: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
 failed: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
};

function OffboardingPipeline({
 entries,
 senders,
 orgSlug,
}: {
 entries: OffboardingEntry[];
 senders: string[];
 orgSlug: string;
}) {
 const router = useRouter();
 const [isPending, startTransition] = useTransition();
 const { showError } = useErrorDialog();
 const [notice, setNotice] = useState<string | null>(null);
 const [expandedId, setExpandedId] = useState<string | null>(null);
 const [actionLoadingMap, setActionLoadingMap] = useState<Record<string, string>>({});
 const [itNotes, setItNotes] = useState<Record<string, string>>({});
 const [tdReport, setTdReport] = useState<{ missingFromTD: any[]; extraInTD: any[] } | null>(null);
 const [tdReportLoading, setTdReportLoading] = useState(false);

 const fetchTDReport = () => {
   setTdReportLoading(true);
   startTransition(async () => {
     try {
       const result = await getTDMemberReport();
       setTdReport(result);
     } catch (err) {
       console.error("[hiring] TD report:", err);
     } finally {
       setTdReportLoading(false);
     }
   });
 };

 useEffect(() => {
 if (!notice) return;
 const t = setTimeout(() => setNotice(null), 5000);
 return () => clearTimeout(t);
 }, [notice]);

 const setActionLoading = (id: string, step: string) => setActionLoadingMap((prev) => ({ ...prev, [id]: step }));
 const clearActionLoading = (id: string) => setActionLoadingMap((prev) => { const n = { ...prev }; delete n[id]; return n; });

 // Optimistic local state for offboarding entries — updated immediately on step completion
 const [localEntries, setLocalEntries] = useState(entries);
 useEffect(() => { setLocalEntries(entries); }, [entries]);

 const optimisticallyCompleteStep = (employeeId: string, stepKey: string) => {
 setLocalEntries((prev) =>
 prev.map((e) => {
 if (e.id !== employeeId) return e;
 return {
 ...e,
 offboardingSteps: e.offboardingSteps.map((s) =>
 s.key === stepKey ? { ...s, status: "completed"as const, completedAt: new Date().toISOString(), error: null } : s
 ),
 };
 })
 );
 };

 const optimisticallyFailStep = (employeeId: string, stepKey: string, error: string) => {
 setLocalEntries((prev) =>
 prev.map((e) => {
 if (e.id !== employeeId) return e;
 return {
 ...e,
 offboardingSteps: e.offboardingSteps.map((s) =>
 s.key === stepKey ? { ...s, status: "failed"as const, error } : s
 ),
 };
 })
 );
 };

 const handleStepAction = async (employeeId: string, stepKey: string) => {
 setActionLoading(employeeId, stepKey);
 try {
 let result: { success: boolean; message: string };
 switch (stepKey) {
 case "offboarding_notification":
  result = await offboardSendNotificationEmail(employeeId);
  break;
 case "time_doctor_removal":
 result = await offboardRemoveFromTimeDoctor(employeeId);
 break;
 case "td_report_download":
 result = await offboardDownloadTDReport(employeeId);
 break;
 case "slack_removal":
 result = await offboardRemoveFromSlack(employeeId);
 break;
 case "it_ticket":
 result = await offboardSendITTicket(employeeId, {
 additionalNotes: itNotes[employeeId] || undefined,
 });
 break;
 case "recruitcrm_status":
 result = await offboardUpdateRecruitCRM(employeeId);
 break;
 case "disable_dashboard":
 result = await offboardDisableDashboard(employeeId);
 break;
 case "final_review":
 result = await completeOffboarding(employeeId);
 break;
 default:
 result = { success: false, message: "Unknown step"};
 }
 if (result.success) {
 setNotice(result.message);
 optimisticallyCompleteStep(employeeId, stepKey);
 } else {
 showError({ title: "Offboarding Step Failed", message: result.message });
 optimisticallyFailStep(employeeId, stepKey, result.message);
 }
 // Delayed background refresh to sync server data without disrupting UI
 } catch (err) {
 showError({ title: "Error", message: err instanceof Error ? err.message : "Unknown error"});
 } finally {
 clearActionLoading(employeeId);
 }
 };

 const handleAutoOffboard = async (employeeId: string) => {
 setActionLoading(employeeId, "auto");
 try {
 const result = await runAutoOffboarding(employeeId, {
 additionalNotes: itNotes[employeeId] || undefined,
 });
 if (result.success) {
 setNotice(result.message);
 // Mark all non-final steps as completed optimistically
 setLocalEntries((prev) =>
 prev.map((e) => {
 if (e.id !== employeeId) return e;
 return {
 ...e,
 offboardingSteps: e.offboardingSteps.map((s) =>
 s.key !== "final_review"? { ...s, status: "completed"as const, completedAt: new Date().toISOString(), error: null } : s
 ),
 };
 })
 );
 } else {
 showError({ title: "Offboarding Incomplete", message: result.message });
 }
 // Delayed background refresh
 } catch (err) {
 showError({ title: "Error", message: err instanceof Error ? err.message : "Unknown error"});
 } finally {
 clearActionLoading(employeeId);
 }
 };

 if (localEntries.length === 0) {
 return (
 <div className="rounded-xl border bg-card p-8 text-center">
 <div className="text-3xl mb-2"></div>
 <h3 className="text-sm font-semibold text-muted-foreground">No Active Offboardings</h3>
 <p className="text-xs text-muted-foreground mt-1">
 When you start offboarding a contractor from their employee profile, they'll appear here with a step-by-step progress tracker.
 </p>
 </div>
 );
 }

 return (
 <div className="space-y-3">
 {notice && (
 <div className="flex items-center justify-between rounded-md bg-green-100 px-3 py-2 text-sm text-green-700 dark:bg-green-900/30 dark:text-green-300 animate-in fade-in slide-in-from-top-1">
 <span>{notice}</span>
 <button type="button"onClick={() => setNotice(null)} className="ml-2 text-green-500 hover:text-green-800 dark:hover:text-green-100">&times;</button>
 </div>
 )}

      {/* TD Member Mismatch Report */}
      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Time Doctor Member Report</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Compare active employees vs TD to spot sync drift.</p>
          </div>
          <button type="button" onClick={fetchTDReport} disabled={tdReportLoading}
            className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50">
            {tdReportLoading ? "Checking..." : "Run TD Report"}
          </button>
        </div>
        {tdReport && (
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs font-semibold mb-2 text-amber-600 dark:text-amber-400">Missing from TD ({tdReport.missingFromTD.length})</p>
              {tdReport.missingFromTD.length === 0
                ? <p className="text-xs text-muted-foreground">All active employees are in Time Doctor.</p>
                : tdReport.missingFromTD.map((e: any) => (
                  <div key={e.id} className="flex items-center gap-2 text-xs py-0.5">
                    <span className="font-medium">{e.name}</span>
                    <span className="text-muted-foreground truncate">{e.email}</span>
                  </div>
                ))}
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs font-semibold mb-2 text-red-600 dark:text-red-400">In TD but not active ({tdReport.extraInTD.length})</p>
              {tdReport.extraInTD.length === 0
                ? <p className="text-xs text-muted-foreground">No ghost users in Time Doctor.</p>
                : tdReport.extraInTD.map((u: any) => (
                  <div key={u.tdId} className="flex items-center gap-2 text-xs py-0.5">
                    <span className="font-medium">{u.name}</span>
                    <span className="text-muted-foreground truncate">{u.email}</span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

 <div className="rounded-xl border bg-card divide-y">
 {/* Header */}
 <div className="flex items-center gap-3 px-4 py-3 text-xs font-medium text-muted-foreground">
 <div className="w-7"/>
 <div className="flex-1">Name</div>
 <div className="hidden md:block w-32">Organization</div>
 <div className="hidden md:block w-28">Role</div>
 <div className="w-24">Progress</div>
 <div className="w-52 text-right">Actions</div>
 </div>

 {localEntries.map((entry) => {
 const steps = entry.offboardingSteps;
 const completedCount = steps.filter((s) => s.status === "completed"|| s.status === "skipped").length;
 const progress = steps.length > 0 ? Math.round((completedCount / steps.length) * 100) : 0;
 const isExpanded = expandedId === entry.id;
 const isLoading = !!actionLoadingMap[entry.id];
 const allStepsComplete = steps.length > 0 && steps.filter((s) => s.key !== "final_review").every((s) => s.status === "completed"|| s.status === "skipped");

 return (
 <div key={entry.id}>
 {/* Row */}
 <div
 className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
 onClick={() => setExpandedId(isExpanded ? null : entry.id)}
 >
 <div className="w-7">
 <span className="text-xs text-muted-foreground">{isExpanded ? "": ""}</span>
 </div>
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2">
 <span className="font-medium text-sm">{entry.legalFirstName} {entry.legalLastName}</span>
 <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300">
 Offboarding
 </span>
 </div>
 {entry.personalEmail && <div className="text-xs text-muted-foreground truncate">{entry.personalEmail}</div>}
 </div>
 <div className="hidden md:block w-32 text-sm text-muted-foreground truncate">{entry.organization?.name ?? "—"}</div>
 <div className="hidden md:block w-28 text-sm truncate">{entry.jobTitle ?? entry.employmentType}</div>
 <div className="w-24"onClick={(e) => e.stopPropagation()}>
 <div className="space-y-1">
 <div className="flex items-center gap-2">
 <div className="h-1.5 flex-1 rounded-full bg-gray-200 dark:bg-gray-700">
 <div
 className="h-1.5 rounded-full bg-red-500 transition-all"
 style={{ width: `${progress}%` }}
 />
 </div>
 <span className="text-xs tabular-nums text-muted-foreground w-8">{progress}%</span>
 </div>
 <span className="text-[10px] text-muted-foreground">{completedCount}/{steps.length} steps</span>
 </div>
 </div>
 <div className="w-52 flex items-center justify-end gap-2"onClick={(e) => e.stopPropagation()}>
 {!allStepsComplete && (
 <button
 type="button"
 disabled={isLoading}
 onClick={() => handleAutoOffboard(entry.id)}
 className="h-7 shrink-0 whitespace-nowrap rounded-md bg-red-600 px-2.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
 >
 {actionLoadingMap[entry.id] === "auto"? "Processing...": "Run All Steps"}
 </button>
 )}
 {allStepsComplete && (
 <button
 type="button"
 disabled={isLoading}
 onClick={() => handleStepAction(entry.id, "final_review")}
 className="h-7 shrink-0 whitespace-nowrap rounded-md bg-green-600 px-2.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
 >
 {actionLoadingMap[entry.id] === "final_review"? "Completing...": "Complete Offboarding"}
 </button>
 )}
 <Link
 href={`/${orgSlug}/employees/${entry.id}`}
 className="h-7 shrink-0 whitespace-nowrap rounded-md border px-2.5 text-xs font-medium leading-7 hover:bg-accent"
 >
 View
 </Link>
 </div>
 </div>

 {/* Expanded offboarding steps */}
 {isExpanded && (
 <div className="border-t bg-muted/10 px-4 py-3 space-y-2">
 {entry.endDate && (
 <div className="text-[11px] text-muted-foreground mb-2">
 Last working day: <span className="font-medium text-foreground">{new Date(entry.endDate as any).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric"})}</span>
 </div>
 )}

 {steps.map((step, idx) => {
 const isDone = step.status === "completed"|| step.status === "skipped";
 const isFailed = step.status === "failed";
 const isStepLoading = actionLoadingMap[entry.id] === step.key;
 const icon = OFFBOARDING_STEP_ICONS[step.key] ?? "";
 const statusColors = OFFBOARDING_STEP_STATUS_COLORS[step.status] ?? OFFBOARDING_STEP_STATUS_COLORS.pending;
 const isAuto = AUTO_STEPS.has(step.key);
 const isManual = step.key in MANUAL_STEPS;

 return (
 <div key={step.key} className={`rounded-lg border p-3 ${isDone ? "border-green-200 bg-green-50/50 dark:border-green-800/30 dark:bg-green-950/20": isFailed ? "border-red-200 bg-red-50/50 dark:border-red-800/30 dark:bg-red-950/20": isManual && !isDone ? "border-amber-300 bg-amber-50/50 dark:border-amber-700/50 dark:bg-amber-950/20": isAuto && !isDone ? "border-blue-200 bg-blue-50/30 dark:border-blue-800/30 dark:bg-blue-950/10" : "border-border"}`}>
 <div className="flex items-center gap-3">
 <div className={`flex h-7 w-7 items-center justify-center rounded-full text-sm ${isManual && !isDone ? "bg-amber-100 dark:bg-amber-900/40" : "bg-muted"}`}>
 {isDone ? (
 <svg className="h-4 w-4 text-green-600"fill="none"viewBox="0 0 24 24"stroke="currentColor"><path strokeLinecap="round"strokeLinejoin="round"strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
 ) : isFailed ? (
 <svg className="h-4 w-4 text-red-600"fill="none"viewBox="0 0 24 24"stroke="currentColor"><path strokeLinecap="round"strokeLinejoin="round"strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
 ) : isManual ? (
 <svg className="h-4 w-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
 ) : isAuto ? (
 <svg className="h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
 ) : (
 <span>{icon}</span>
 )}
 </div>
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 flex-wrap">
 <span className="text-sm font-medium">{STEP_LABEL_OVERRIDES[step.key] ?? step.label}</span>
 {isManual && !isDone && (
 <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-amber-200 text-amber-900 dark:bg-amber-800 dark:text-amber-100">
 MANUAL
 </span>
 )}
 {isAuto && (
 <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
 Auto
 </span>
 )}
 <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColors}`}>
 {step.status === "completed"? "Done": step.status === "skipped"? "Skipped": step.status === "in_progress"? "In Progress": step.status === "failed"? "Failed": isAuto ? "Running..." : "Pending"}
 </span>
 </div>
 {isManual && !isDone && (
 <div className="text-[10px] text-amber-700 dark:text-amber-400 mt-0.5 font-medium">{MANUAL_STEPS[step.key]}</div>
 )}
 {isAuto && !isDone && !isFailed && (
 <div className="text-[10px] text-blue-600 dark:text-blue-400 mt-0.5">Triggered automatically on offboarding start</div>
 )}
 {step.completedAt && (
 <div className="text-[10px] text-muted-foreground">
 {new Date(step.completedAt as any).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit"})}
 </div>
 )}
 {isFailed && step.error && (
 <div className="text-[10px] text-red-600 dark:text-red-400 mt-0.5">{step.error}</div>
 )}
 </div>
 {!isDone && !isAuto && step.key !== "final_review"&& (
 <div className="flex gap-1.5 shrink-0">
 <button
 type="button"
 disabled={isStepLoading || isLoading}
 onClick={() => handleStepAction(entry.id, step.key)}
 className={`h-7 rounded-md px-3 text-xs font-medium disabled:opacity-50 ${isManual ? "bg-amber-500 text-white hover:bg-amber-600" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}
 >
 {isStepLoading ? "Processing...": isFailed ? "Retry": isManual ? "DONE - Mark Complete": "Run"}
 </button>
 <button
 type="button"
 disabled={isStepLoading || isLoading}
 onClick={() => {
 optimisticallyCompleteStep(entry.id, step.key);
 setNotice(`Skipped: ${step.label}`);
 // Persist skip to server
 (async () => {
 try {
 const { skipOffboardingStep } = await import("@/app/actions/hriq/offboarding");
 await skipOffboardingStep(entry.id, step.key);
 } catch {}
 })();
 }}
 className="h-7 rounded-md border px-2 text-xs hover:bg-accent disabled:opacity-50"
 >
 Skip
 </button>
 </div>
 )}
 </div>

 {/* IT Ticket additional notes input */}
 {step.key === "it_ticket"&& !isDone && (
 <div className="mt-2">
 <textarea
 placeholder="Additional notes for IT team (optional)..."
 value={itNotes[entry.id] ?? ""}
 onChange={(e) => setItNotes((prev) => ({ ...prev, [entry.id]: e.target.value }))}
 className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs placeholder:text-muted-foreground resize-none"
 rows={2}
 />
 </div>
 )}
 </div>
 );
 })}

 {steps.length === 0 && (
 <div className="text-xs text-muted-foreground py-2">
 No offboarding steps configured. The offboarding may have been initiated through a status change.
 </div>
 )}
 </div>
 )}
 </div>
 );
 })}
 </div>
 </div>
 );
}

function InlineStep({
 step,
 number,
 employeeId,
 session,
 senders,
 jotformForms,
 zoomSessions,
 zoomHosts,
 organizationName,
 zoomHostByOrg,
 isPending,
 onAction,
 onCompleted,
 infoApprovalStatus,
}: {
 step: OnboardingStep;
 number: number;
 employeeId: string;
 session: OnboardingSession;
 senders: string[];
 jotformForms: JotForm[];
 zoomSessions: ZoomSession[];
 zoomHosts: string[];
 organizationName: string | null;
 zoomHostByOrg: Record<string, string>;
 isPending: boolean;
 onAction: (fn: () => Promise<void>) => void;
 onCompleted: (id: string, msg?: string) => void;
 infoApprovalStatus?: string | null;
  key?: React.Key;
}) {
 const router = useRouter();
 const { showError } = useErrorDialog();
 const [showActions, setShowActions] = useState(false);
 const [actionPending, setActionPending] = useState(false);
 const [localIsPending, startLocalTransition] = useTransition();
 const [msg, setMsg] = useState<string | null>(null);
 const [selectedForms, setSelectedForms] = useState<Set<string>>(new Set());
 const [showCreateZoom, setShowCreateZoom] = useState(false);
 const [newZoomDate, setNewZoomDate] = useState("");
 const [newZoomDuration, setNewZoomDuration] = useState(60);
 const preferredHostFromOrg =
 (organizationName ? zoomHostByOrg[organizationName.trim().toLowerCase()] : undefined) ?? "";
 const hostOptions = Array.from(new Set([...zoomHosts, preferredHostFromOrg].filter(Boolean)));
 const [newZoomHost, setNewZoomHost] = useState("");
 const setWarning = (err: unknown, fallback: string) => {
 const msg = getWarningMessage(err, fallback);
 setMsg(msg);
 showError({ title: "Error", message: msg });
 };

 // Local action handler — refreshes after action completes
 const handleLocalAction = (fn: () => Promise<void>) => {
 startLocalTransition(async () => {
 try {
 await fn();
 } catch (err) {
 const msg = getWarningMessage(err, "Action failed.");
 setMsg(msg);
 showError({ title: "Error", message: msg });
 }
 });
 };

 /** Approve/reject handler that shows success state before delayed refresh */
 const handleApproveAction = (fn: () => Promise<void>, successMsg: string) => {
 startLocalTransition(async () => {
 try {
 await fn();
 onCompleted(employeeId, successMsg);
 } catch (err) {
 const msg = getWarningMessage(err, "Action failed.");
 setMsg(msg);
 showError({ title: "Error", message: msg });
 }
 });
 };

 const stepPending = localIsPending || actionPending;

 // Auto-sync jotform status on mount + every 60s
 const [syncing, setSyncing] = useState(false);
 useEffect(() => {
 if (step.stepType !== "jotform"|| !session.jotformsSent || session.jotformsCompleted) return;
 let cancelled = false;
 const doSync = async () => {
 if (cancelled) return;
 setSyncing(true);
 try {
 const result = await syncOnboardingChecklist(employeeId);
 if (!cancelled && !("error" in result) && (result as any).ok) {
 if ((result as any).completed) {
 setMsg("All forms signed!");
 }
 }
 } catch {
 // Silent
 } finally {
 if (!cancelled) setSyncing(false);
 }
 };
 // Sync immediately on mount
 doSync();
 const interval = setInterval(doSync, 60_000);
 return () => { cancelled = true; clearInterval(interval); };
 }, [employeeId, router, session.jotformsCompleted, session.jotformsSent, step.stepType]);

 // Get individual jotform steps for inline display
 const jotformSteps = step.stepType === "jotform"? session.steps.filter((s) => s.stepType === "jotform") : [];

 const isDone = step.status === "completed";
 const isSkipped = step.status === "skipped";
 const isSent = step.status === "sent";
 const hasIntegration = step.stepType === "zoom_invite"|| step.stepType === "jotform"|| step.stepType === "payment_setup";

 return (
 <div className={`rounded-lg border px-3 py-2 ${isDone ? "border-green-200 bg-green-50/50 dark:border-green-800/50 dark:bg-green-950/20": isSkipped ? "border-muted opacity-60": isSent ? "border-blue-200 bg-blue-50/30 dark:border-blue-800/50 dark:bg-blue-950/20": "border-border"}`}>
 <div className="flex items-center justify-between gap-2">
 <div className="flex items-center gap-2">
 <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
 isDone ? "bg-green-500 text-white": isSkipped ? "bg-gray-400 text-white": isSent ? "bg-blue-500 text-white": "bg-muted text-muted-foreground"
 }`}>
 {isDone ? "Done": isSkipped ? "—": isSent ? "Sent": number}
 </div>
 <span className={`text-sm ${isDone ? "line-through text-muted-foreground": "font-medium"}`}>{getDisplayStepName(step)}</span>
 {step.isRequired && !isDone && !isSkipped && (
 <span className="rounded bg-red-100 px-1 py-0.5 text-[10px] text-red-600 dark:bg-red-900/50 dark:text-red-300">Required</span>
 )}
 {isSent && <span className="rounded bg-blue-100 px-1 py-0.5 text-[10px] text-blue-600 dark:bg-blue-900/50 dark:text-blue-300">Sent</span>}
 </div>
 {!isDone && !isSkipped && (
 <div className="flex items-center gap-1">
 {hasIntegration && (
 <button type="button"onClick={() => setShowActions(!showActions)} aria-expanded={showActions} aria-label={`${showActions ? "Hide": "Show"} actions for ${getDisplayStepName(step)}`} className="h-6 rounded border px-2 text-[11px] hover:bg-accent">
 {step.stepType === "jotform"
 ? (showActions ? "Hide": "Send Forms")
 : step.stepType === "payment_setup"
 ? (showActions ? "Hide": "Setup Payment")
 : (showActions ? "Hide": "Actions")}
 </button>
 )}
 {step.stepType !== "zoom_invite"&& (() => {
 // Contractor Info Form — show approve/reject when submitted
 if (step.stepType === "email_form") {
 if (infoApprovalStatus === "pending_review") {
 return (
 <>
 <button type="button"onClick={() => handleApproveAction(async () => { const { approveContractorInfo } = await import("@/app/actions/hriq/contractor-info"); await approveContractorInfo(employeeId); }, "Contractor approved & provisioned.")} disabled={stepPending} className="h-6 rounded bg-green-600 px-2 text-[11px] text-white hover:bg-green-700 disabled:opacity-50 animate-pulse">Approve & Provision</button>
 <button type="button"onClick={() => { const reason = prompt("Rejection reason (optional):"); handleApproveAction(async () => { const { rejectContractorInfo } = await import("@/app/actions/hriq/contractor-info"); await rejectContractorInfo(employeeId, reason || undefined); }, "Contractor info rejected."); }} disabled={stepPending} className="h-6 rounded bg-red-500 px-2 text-[11px] text-white hover:bg-red-600 disabled:opacity-50">Reject</button>
 </>
 );
 }
 if (infoApprovalStatus === "approved") {
 return <span className="text-[10px] text-green-600 dark:text-green-400">Approved & provisioned</span>;
 }
 if (infoApprovalStatus === "rejected") {
 return <span className="text-[10px] text-red-600 dark:text-red-400">Rejected — awaiting resubmission</span>;
 }
 return (
 <span className="text-[10px] text-amber-600 dark:text-amber-400">Waiting for contractor…</span>
 );
 }
 // For jotform steps, complete ALL jotform steps at once
 if (step.stepType === "jotform") {
 return (
 <button type="button"onClick={() => handleLocalAction(async () => { await completeAllJotformSteps(session.id); })} disabled={stepPending} className="h-6 rounded bg-green-600 px-2 text-[11px] text-white hover:bg-green-700 disabled:opacity-50">{stepPending ? "...": "Done"}</button>
 );
 }
 return (
 <button type="button"onClick={() => {
 startLocalTransition(async () => {
 try {
 const result = await updateOnboardingStep(step.id, { status: "completed"});
 if ("error" in result) { setMsg(`Warning: ${result.error}`); showError({ title: "Error", message: result.error }); return; }
 if (result.onboardingComplete) {
 setMsg("All steps done! Click Activate Contractor to finish.");
 }
 } catch (err) { const m = getWarningMessage(err, "Action failed."); setMsg(m); showError({ title: "Error", message: m }); }
 });
 }} disabled={stepPending} className="h-6 rounded bg-green-600 px-2 text-[11px] text-white hover:bg-green-700 disabled:opacity-50">{stepPending ? "...": "Done"}</button>
 );
 })()}
 <button type="button"onClick={() => handleLocalAction(async () => { const r = await updateOnboardingStep(step.id, { status: "skipped"}); if ("error" in r) throw new Error(r.error); })} disabled={stepPending} className="h-6 rounded border px-2 text-[11px] hover:bg-accent disabled:opacity-50">Skip</button>
 </div>
 )}
 </div>

 {msg && (
 <div className={`mt-1.5 rounded px-2 py-1 text-xs ${msg.startsWith("Warning:") ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300": "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"}`}>
 {msg}
 </div>
 )}

 {/* Zoom invite action -- pick from existing sessions or resend */}
 {showActions && step.stepType === "zoom_invite"&& !isDone && (
 <div className="mt-2 space-y-2">
 {session.zoomMeetingLink && (
 <div className="flex items-center gap-2">
 <span className="text-xs text-muted-foreground">Already assigned:</span>
 <button
 type="button"
 disabled={actionPending}
 onClick={async () => {
 setActionPending(true);
 try {
 await sendZoomInvite({
 employeeId,
 zoomLink: session.zoomMeetingLink!,
 zoomDate: session.zoomMeetingDate ? new Date(session.zoomMeetingDate as any).toISOString() : "",
 senderEmail: senders[0],
 });
 setMsg("Zoom invite resent");
 setShowActions(false);
 } catch (e) {
 setWarning(e, "Unable to resend Zoom invite.");
 }
 finally { setActionPending(false); }
 }}
 className="h-7 rounded bg-blue-600 px-3 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
 >
 {actionPending ? "Sending...": "Resend Invite"}
 </button>
 </div>
 )}
 {zoomSessions.length > 0 ? (
 <>
 <p className="text-xs text-muted-foreground">{session.zoomMeetingLink ? "Or add to a different batch (auto-sends invite):": "Add to batch (auto-sends invite):"}</p>
 <div className="space-y-1 max-h-36 overflow-y-auto">
 {zoomSessions.map((z) => (
 <button
 key={z.id}
 type="button"
 disabled={actionPending}
 onClick={async () => {
 setActionPending(true);
 try {
 await assignToZoomSession(employeeId, z.id);
 setMsg("Approved: Assigned to batch and Zoom invite sent.");
 setShowActions(false);
 } catch (e) {
 setWarning(e, "Unable to assign contractor to this Zoom batch.");
 }
 finally { setActionPending(false); }
 }}
 className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left hover:bg-accent transition-colors disabled:opacity-50"
 >
 <div>
 <div className="text-xs font-medium">{z.title}</div>
 <div className="text-[11px] text-muted-foreground">
 {z.zoomMeetingDate ? formatPacificDateTime(z.zoomMeetingDate) : "No date"}{" "}
 &middot; {z.zoomDuration}m &middot; {z._count.onboardingSessions} attendee{z._count.onboardingSessions !== 1 ? "s": ""}
 </div>
 </div>
 <span className="text-[11px] text-primary font-medium">Add to Batch</span>
 </button>
 ))}
 </div>
 </>
 ) : null}
 {/* Inline create Zoom meeting */}
 {!showCreateZoom ? (
 <button
 type="button"
 onClick={() => setShowCreateZoom(true)}
 className="h-7 rounded border border-dashed px-3 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
 >
 + Create New Batch Meeting
 </button>
 ) : (
 <div className="rounded-lg border p-3 space-y-2">
 <div className="flex gap-2">
 <div className="flex-1">
 <label className="text-[11px] font-medium text-muted-foreground">Date & Time (PT)</label>
 <DateTimePicker value={newZoomDate} onChange={(v) => setNewZoomDate(v)} min={new Date().toISOString().slice(0, 16)} className="mt-0.5"/>
 </div>
 <div className="w-20">
 <label className="text-[11px] font-medium text-muted-foreground">Duration</label>
 <CustomSelect
 value={String(newZoomDuration)}
 onValueChange={(value) => setNewZoomDuration(Number(value))}
 triggerClassName="mt-0.5 h-8 w-full text-xs"
 options={[
 { value: "30", label: "30m"},
 { value: "45", label: "45m"},
 { value: "60", label: "60m"},
 { value: "90", label: "90m"},
 ]}
 />
 </div>
 </div>
 {zoomHosts.length > 0 && (
 <div>
 <label className="text-[11px] font-medium text-muted-foreground">Host Account</label>
 <ZoomHostSearch
 hosts={hostOptions}
 value={newZoomHost}
 onChange={setNewZoomHost}
 className="mt-0.5"
 />
 {newZoomHost && newZoomHost !== "me"&& (
 <p className="mt-1 text-[10px] text-blue-600 dark:text-blue-400">
 Meeting will be created under {newZoomHost} &mdash; they will be emailed with host link.
 </p>
 )}
 </div>
 )}
 <div className="flex gap-2">
 <button
 type="button"
 disabled={actionPending || !newZoomDate}
 onClick={async () => {
 setActionPending(true);
 try {
 const batch = await createBatchSession({
 title: `Zoom Onboarding — ${shortDate(newZoomDate as any)}`,
 zoomMeetingDate: newZoomDate,
 zoomDuration: newZoomDuration,
 zoomHost: newZoomHost || undefined,
 });
 await assignToZoomSession(employeeId, batch.id);
 setMsg("Approved: New Zoom batch created and invite sent.");
 setShowCreateZoom(false);
 setShowActions(false);
 } catch (e) {
 setWarning(e, "Unable to create batch or send Zoom invite.");
 }
 finally { setActionPending(false); }
 }}
 className="h-7 rounded bg-blue-600 px-3 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
 >
 {actionPending ? "Creating...": "Create Batch & Add"}
 </button>
 <button type="button"onClick={() => setShowCreateZoom(false)} className="h-7 rounded border px-3 text-xs hover:bg-accent">Cancel</button>
 </div>
 </div>
 )}
 </div>
 )}

 {/* JotForm inline status — always visible when forms are sent */}
 {step.stepType === "jotform"&& session.jotformsSent && !isDone && jotformSteps.length > 0 && (
 <div className="mt-2 space-y-1.5">
 {jotformSteps.map((jf) => {
 const isSigned = jf.status === "completed"|| jf.status === "signed";
 return (
 <div
 key={jf.id}
 className={`flex items-center justify-between rounded border px-2.5 py-1.5 text-xs ${
 isSigned
 ? "border-green-200 bg-green-50/70 dark:border-green-800/50 dark:bg-green-950/30"
 : "border-amber-200 bg-amber-50/50 dark:border-amber-800/50 dark:bg-amber-950/20"
 }`}
 >
 <div className="flex items-center gap-2 min-w-0">
 <span className={`shrink-0 text-[10px] font-bold ${isSigned ? "text-green-600 dark:text-green-400": "text-amber-600 dark:text-amber-400"}`}>
 {isSigned ? "Done": "..."}
 </span>
 <span className="truncate font-medium">{jf.stepName}</span>
 </div>
 <div className="flex items-center gap-2 shrink-0">
 {isSigned && jf.completedAt && (
 <span className="text-[10px] text-muted-foreground">{shortDate(jf.completedAt as any)}</span>
 )}
 {isSigned && jf.formUrl && (
 <a href={jf.formSubmissionId ? `/api/documents/view?submissionId=${jf.formSubmissionId}` : jf.formUrl} target="_blank" rel="noopener noreferrer" className="rounded border px-1.5 py-0.5 text-[10px] hover:bg-accent">View PDF</a>
 )}
 {!isSigned && (
 <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">Awaiting signature</span>
 )}
 </div>
 </div>
 );
 })}
 <div className="flex items-center justify-between pt-1">
 <span className="text-[10px] text-muted-foreground">
 {jotformSteps.filter((s) => s.status === "completed"|| s.status === "signed").length}/{jotformSteps.length} signed
 {syncing && "· syncing…"}
 </span>
 <button
 type="button"
 disabled={actionPending || syncing}
 onClick={async () => {
 setActionPending(true);
 try {
 const result = await syncOnboardingChecklist(employeeId);
 if ("error" in result || !(result as any).ok) {
 const m = getWarningMessage((result as any).error, "Unable to check signed status.");
 setMsg(m);
 showError({ title: "Error", message: m });
 } else {
 setMsg((result as any).message);
 }
 } catch (e) {
 setWarning(e, "Unable to check signed status.");
 } finally {
 setActionPending(false);
 }
 }}
 className="h-6 rounded border px-2 text-[10px] hover:bg-accent disabled:opacity-50"
 >
 {actionPending ? "Checking…": "Refresh Status"}
 </button>
 </div>
 </div>
 )}

            {/* Payment Setup — completes automatically when contractor logs in */}
            {showActions && step.stepType === "payment_setup" && !isDone && (
              <div className="mt-2 space-y-2">
                <div className="rounded-lg border border-violet-200 dark:border-violet-800 bg-violet-50/50 dark:bg-violet-950/20 p-3">
                  <p className="text-xs text-muted-foreground">
                    This step completes automatically when the contractor logs in to their dashboard for the first time. No action needed here.
                  </p>
                </div>
              </div>
            )}

 {/* JotForm send forms action — only shown via Actions toggle */}
 {showActions && step.stepType === "jotform"&& !isDone && (
 <div className="mt-2 space-y-2">
 {jotformForms.length > 0 ? (
 <>
 <div className="flex flex-wrap gap-1">
 {jotformForms.map((f) => (
 <button
 key={f.id}
 type="button"
 onClick={() => setSelectedForms((prev) => { const n = new Set(prev); n.has(f.id) ? n.delete(f.id) : n.add(f.id); return n; })}
 className={`h-7 rounded border px-2 text-xs transition-colors ${selectedForms.has(f.id) ? "border-primary bg-primary/10 font-medium": "hover:bg-accent"}`}
 >
 {f.title}
 </button>
 ))}
 </div>
 <button
 type="button"
 disabled={actionPending || selectedForms.size === 0}
 onClick={async () => {
 setActionPending(true);
 try {
 const r = await sendOnboardingForms({ employeeId, formIds: Array.from(selectedForms), senderEmail: senders[0] });
 setMsg(
 `Approved: ${r.sent} form${r.sent === 1 ? "": "s"} sent successfully.`
 );
 setShowActions(false);
 } catch (e) {
 setWarning(e, "Unable to send selected forms.");
 }
 finally { setActionPending(false); }
 }}
 className="h-7 rounded bg-orange-600 px-3 text-xs text-white hover:bg-orange-700 disabled:opacity-50"
 >
 {actionPending ? "Sending...": `Send ${selectedForms.size} Form${selectedForms.size !== 1 ? "s": ""}`}
 </button>
 </>
 ) : (
 <span className="text-xs text-muted-foreground">No JotForm forms configured</span>
 )}
 </div>
 )}
 </div>
 );
}
