"use client";
import { useErrorDialog } from "@/app/(authenticated)/components/error-dialog";

import {
  createPreHireEmployee,
  deletePreHireEmployee,
  removeEmployeeFromOnboarding,
} from "@/app/actions/hriq/hiring";
import { updateOnboardingStep } from "@/app/actions/hriq/onboarding";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ClientOnboardingWizard } from "./client-onboarding-wizard";
import { DatePicker } from "@/app/(authenticated)/components/date-picker";
import { CustomSelect } from "@/app/(authenticated)/components/custom-select";
import { CustomSelectWithOther } from "@/app/(authenticated)/components/custom-select-with-other";
import { JOB_TITLE_OPTIONS, DEPARTMENT_OPTIONS } from "@/lib/hriq/role-department-options";
import { COUNTRY_OPTIONS } from "@/lib/hriq/country-options";
import { SearchableSelect } from "@/app/(authenticated)/components/searchable-select";

type OnboardingStep = {
  id: string;
  stepType: string;
  stepName: string;
  status: string;
  sortOrder: number;
  isRequired: boolean;
  completedAt: Date | null;
  formUrl: string | null;
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
  batchSession: {
    calendarOrganizerEmail: string | null;
  } | null;
  steps: OnboardingStep[];
};

type PipelineEntry = {
  id: string;
  legalFirstName: string;
  legalLastName: string;
  personalEmail: string | null;
  hourlyRate?: unknown;
  monthlySalary?: unknown;
  compensationType?: string | null;
  currency?: string | null;
  startDate?: Date | null;
  jobTitle: string | null;
  employmentType: string;
  employmentStatus: string;
  createdAt: Date;
  updatedAt: Date;
  bankName: string | null;
  infoApprovalStatus: string | null;
  organization: { name: string } | null;
  onboardingSessions: OnboardingSession[];
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pre_hire: { label: "Pre-Hire", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300" },
  onboarding_scheduled: { label: "Scheduled", cls: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300" },
  onboarding_in_progress: { label: "Onboarding", cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300" },
  active: { label: "Active", cls: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300" },
};

function getWarningMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return fallback;
}

export function ClientHiringPipeline({
  entries,
  orgId,
  orgName,
  senders,
  paymentMethod,
  vaSeats,
  seatsTaken,
  onSuccess,
}: {
  entries: PipelineEntry[];
  orgId: string;
  orgName: string;
  senders: string[];
  paymentMethod?: string | null;
  vaSeats?: number | null;
  seatsTaken?: number;
  onSuccess?: () => void;
}) {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [showAdd, setShowAdd] = useState(false);
  const { showError } = useErrorDialog();
  const [notice, setNotice] = useState<string | null>(null);
  // Use local state for tab — URL-based router.replace triggers a server re-render
  // which can switch from ClientHiringPipeline to HiringPipeline for RL super_admins
  const [filter, setFilter] = useState<string>(searchParams.get("tab") === "onboarding" ? "onboarding" : "pre_hire");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [completedMessages, setCompletedMessages] = useState<Map<string, string>>(new Map());
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingRemove, setPendingRemove] = useState<{ id: string; name: string } | null>(null);
  // Optimistic step status overrides: stepId -> status
  const [stepStatusOverrides, setStepStatusOverrides] = useState<Map<string, string>>(new Map());
  // Optimistic info approval status overrides: employeeId -> status
  const [infoApprovalOverrides, setInfoApprovalOverrides] = useState<Map<string, string>>(new Map());
  const [pendingDeletePreHire, setPendingDeletePreHire] = useState<{ id: string; name: string } | null>(null);
  const [editingEntry, setEditingEntry] = useState<PipelineEntry | null>(null);
  const [rescheduleConfirm, setRescheduleConfirm] = useState<{
    entry: PipelineEntry;
    changes: string[];
    newStart: string;
    newJob: string;
    newRate: string;
    newCurrency: string;
    transferCalendarTo: string;
  } | null>(null);

  const scheduleRefresh = (delayMs = 2000) => {
    if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    // Server action revalidatePath handles refresh
  };

  const markCompleted = (id: string, message?: string) => {
    const isActivation = message?.toLowerCase().includes("activated");
    if (isActivation) {
      setCompletedIds((prev) => new Set(prev).add(id));
      if (message) setCompletedMessages((prev) => new Map(prev).set(id, message));
    }
    if (message) setNotice(message);
    scheduleRefresh();
  };

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  const [wizardEmployees, setWizardEmployees] = useState<
    { id: string; legalFirstName: string; legalLastName: string; personalEmail: string | null; organizationName: string | null; hourlyRate?: string | null; monthlySalary?: string | null; compensationType?: string | null; currency?: string | null; startDate?: string | null; jobTitle?: string | null }[] | null
  >(null);

  const filtered =
    filter === "onboarding"
      ? entries.filter((e) => e.employmentStatus === "onboarding_scheduled" || e.employmentStatus === "onboarding_in_progress")
      : entries.filter((e) => e.employmentStatus === "pre_hire");

  const preHireFiltered = filtered.filter((e) => e.employmentStatus === "pre_hire");
  const counts = {
    pre_hire: entries.filter((e) => e.employmentStatus === "pre_hire").length,
    onboarding: entries.filter((e) => e.employmentStatus === "onboarding_scheduled" || e.employmentStatus === "onboarding_in_progress").length,
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
    setWizardEmployees(
      emps.map((e) => ({
        id: e.id,
        legalFirstName: e.legalFirstName,
        legalLastName: e.legalLastName,
        personalEmail: e.personalEmail,
        organizationName: e.organization?.name ?? null,
        hourlyRate: e.hourlyRate ? String(e.hourlyRate) : null,
        monthlySalary: e.monthlySalary ? String(e.monthlySalary) : null,
        compensationType: e.compensationType ?? null,
        currency: e.currency ?? "USD",
        startDate: e.startDate ? new Date(e.startDate as any).toISOString().slice(0, 10) : null,
        jobTitle: e.jobTitle ?? null,
      }))
    );
  };

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        const result = await createPreHireEmployee({
          organizationId: orgId,
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
        setNotice("New pre-hire added to the pipeline."); onSuccess?.();
      } catch (err) {
        showError({ title: "Error", message: getWarningMessage(err, "Unable to add hire.") });
      }
    });
  };

  // Get visible steps (merge jotform-type steps, keep document_sign separate)
  const getVisibleSteps = (steps: OnboardingStep[]): OnboardingStep[] => {
    return steps.filter((s) => s.stepType !== "zoom_invite" && s.stepType !== "zoom_attendance");
  };

  return (
    <div className="space-y-4">
      {/* Branding */}
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-bold">Hiring Pipeline</h2>
        <span className="text-xs text-muted-foreground">·</span>
        <span className="text-xs text-muted-foreground">{orgName}</span>
        <span className="text-xs text-muted-foreground/50">· Managed by Remote Leverage</span>
      </div>

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
                filter === key ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {vaSeats != null && (
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border ${
              (seatsTaken ?? 0) >= vaSeats
                ? "bg-red-50 border-red-200 text-red-700 dark:bg-red-950/30 dark:border-red-800 dark:text-red-300"
                : (seatsTaken ?? 0) >= vaSeats - 1
                ? "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300"
                : "bg-green-50 border-green-200 text-green-700 dark:bg-green-950/30 dark:border-green-800 dark:text-green-300"
            }`}>
              <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/>
              </svg>
              {seatsTaken ?? 0}/{vaSeats} VA seats
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              if (vaSeats != null && (seatsTaken ?? 0) >= vaSeats) {
                alert(`All ${vaSeats} VA seats are taken. Contact Remote Leverage to purchase additional seats.`);
                return;
              }
              setShowAdd(true);
            }}
            className={`h-9 rounded-md px-4 text-sm font-medium text-primary-foreground ${
              vaSeats != null && (seatsTaken ?? 0) >= vaSeats
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-primary hover:bg-primary/90"
            }`}
          >
            + Add Hire
          </button>
        </div>
      </div>

      {/* Batch action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => setSelectedIds(new Set())} className="h-8 rounded-md border px-3 text-xs hover:bg-accent">Clear</button>
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
          <button type="button" onClick={() => setNotice(null)} className="ml-2 text-green-500 hover:text-green-800 dark:hover:text-green-100">&times;</button>
        </div>
      )}

      {/* Pipeline table */}
      <div className="rounded-xl border bg-card divide-y">
        <div className="flex items-center gap-3 px-4 py-3 text-xs font-medium text-muted-foreground">
          <div className="w-7">
            {preHireFiltered.length > 0 && filter === "pre_hire" && (
              <input type="checkbox" checked={allPreHireSelected} onChange={toggleSelectAll} className="h-3.5 w-3.5 rounded border-gray-300" />
            )}
          </div>
          <div className="flex-1">Name</div>
          <div className="hidden md:block w-28">Role</div>
          <div className="w-24">Status</div>
          <div className="hidden lg:block w-48">Progress</div>
          <div className="w-64 text-right">Actions</div>
        </div>

        {filtered.map((entry) => {
          const session = entry.onboardingSessions[0];
          const badge = STATUS_BADGE[entry.employmentStatus] ?? STATUS_BADGE.pre_hire;
          const isPreHire = entry.employmentStatus === "pre_hire";
          const isOnboarding = entry.employmentStatus === "onboarding_in_progress" || entry.employmentStatus === "onboarding_scheduled";
          const canExpand = isOnboarding && session;
          const isExpanded = expandedId === entry.id && canExpand;
          const justCompleted = completedIds.has(entry.id);

          if (justCompleted) {
            const completedMsg = completedMessages.get(entry.id);
            return (
              <div key={entry.id} className="flex items-center gap-3 border-b px-4 py-3 bg-green-50 dark:bg-green-950/30 transition-all duration-500">
                <div className="w-7">
                  <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                </div>
                <div className="flex-1">
                  <span className="font-medium text-green-800 dark:text-green-200">{entry.legalFirstName} {entry.legalLastName}</span>
                  <span className="ml-2 text-xs text-green-600 dark:text-green-400">{completedMsg ?? "Step updated"}</span>
                </div>
              </div>
            );
          }

          return (
            <div key={entry.id}>
              <div
                className={`flex items-center gap-3 px-4 py-3 transition-colors ${canExpand ? "cursor-pointer hover:bg-muted/30" : "hover:bg-muted/20"}`}
                onClick={canExpand ? () => setExpandedId(expandedId === entry.id ? null : entry.id) : undefined}
              >
                <div className="w-7">
                  {isPreHire ? (
                    <input type="checkbox" checked={selectedIds.has(entry.id)} onChange={(e) => { e.stopPropagation(); toggleSelect(entry.id); }} className="h-3.5 w-3.5 rounded border-gray-300" />
                  ) : canExpand ? (
                    <span className="text-xs text-muted-foreground">{isExpanded ? "" : ""}</span>
                  ) : null}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-sm">{entry.legalFirstName} {entry.legalLastName}</span>
                  {entry.personalEmail && <div className="text-xs text-muted-foreground truncate">{entry.personalEmail}</div>}
                </div>
                <div className="hidden md:block w-28 text-sm truncate">{entry.jobTitle ?? entry.employmentType}</div>
                <div className="w-24">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>{badge.label}</span>
                </div>
                <div className="hidden lg:block w-48" onClick={(e) => e.stopPropagation()}>
                  {session && !isPreHire ? (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 rounded-full bg-gray-200 dark:bg-gray-700">
                          <div className={`h-1.5 rounded-full transition-all ${entry.infoApprovalStatus === "pending_review" ? "bg-amber-500" : "bg-green-500"}`} style={{ width: `${session.overallProgress}%` }} />
                        </div>
                        <span className="text-xs tabular-nums text-muted-foreground w-8">{session.overallProgress}%</span>
                      </div>
                      {entry.infoApprovalStatus === "pending_review" && (
                        <span className="text-[10px] text-amber-600 dark:text-amber-400 animate-pulse">Pending review</span>
                      )}
                    </div>
                  ) : <span className="text-xs text-muted-foreground">—</span>}
                </div>
                <div className="w-64 flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                  {isPreHire && (
                    <button type="button" onClick={() => openWizard([entry])} className="h-7 shrink-0 whitespace-nowrap rounded-md bg-blue-600 px-2.5 text-xs font-medium text-white hover:bg-blue-700">
                      Start Onboarding
                    </button>
                  )}
                  {isPreHire && (
                    <button type="button" onClick={() => setPendingDeletePreHire({ id: entry.id, name: `${entry.legalFirstName} ${entry.legalLastName}` })} disabled={isPending} className="h-7 shrink-0 rounded-md border border-red-300 px-2.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950 disabled:opacity-50">
                      Delete
                    </button>
                  )}
                  {isOnboarding && (
                    <button type="button" onClick={() => setPendingRemove({ id: entry.id, name: `${entry.legalFirstName} ${entry.legalLastName}` })} disabled={isPending} className="h-7 rounded-md border border-red-300 px-2.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950 disabled:opacity-50">
                      Remove
                    </button>
                  )}
                  <Link href={`/${orgSlug}/employees/${entry.id}`} className="h-7 shrink-0 whitespace-nowrap rounded-md border px-2.5 text-xs font-medium leading-7 hover:bg-accent">
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
                      {session.startedAt && <> · {new Date(session.startedAt as any).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</>}
                    </div>
                  )}
                  {/* Status badges */}
                  <div className="flex flex-wrap gap-2 pb-2">
                    {(() => {
                      const docSteps = session.steps.filter((s) => s.stepType === "document_sign");
                      const completedDocs = docSteps.filter((s) => s.status === "completed").length;
                      const jotformSteps = session.steps.filter((s) => s.stepType === "jotform");
                      const completedForms = jotformSteps.filter((s) => s.status === "completed").length;
                      const paymentStep = session.steps.find((s) => s.stepType === "payment_setup");
                      return (
                        <>
                          {docSteps.length > 0 && (
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              completedDocs === docSteps.length ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                            }`}>
                              Documents {completedDocs}/{docSteps.length}
                            </span>
                          )}
                          {jotformSteps.length > 0 && (
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              completedForms === jotformSteps.length ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                            }`}>
                              Forms {completedForms}/{jotformSteps.length}
                            </span>
                          )}
                          {paymentStep && paymentStep.status !== "skipped" && (
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              paymentStep.status === "completed" ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                                : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                            }`}>
                              Payment {paymentStep.status === "completed" ? "Complete" : "On Login"}
                            </span>
                          )}
                        </>
                      );
                    })()}
                    {entry.infoApprovalStatus === "approved" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/40 dark:text-green-300">Info Approved</span>
                    )}
                  </div>

                  {/* Steps */}
                  {getVisibleSteps(session.steps).map((step, idx) => {
                    const effectiveStatus = stepStatusOverrides.get(step.id) ?? step.status;
                    return (
                    <div key={step.id} className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2">
                      <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                        effectiveStatus === "completed" ? "bg-green-500 text-white" : effectiveStatus === "sent" ? "bg-blue-500 text-white" : "bg-muted text-muted-foreground"
                      }`}>
                        {effectiveStatus === "completed" ? (
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        ) : idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm">{step.stepName}</span>
                        {step.completedAt && (
                          <span className="ml-2 text-[10px] text-muted-foreground">
                            {new Date(step.completedAt as any).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </span>
                        )}
                      </div>
                      {step.status !== "completed" && step.status !== "skipped" && step.stepType === "payment_setup" && (
                        <span className="text-[11px] text-violet-500 dark:text-violet-400 font-medium">
                          Setup on first login
                        </span>
                      )}
                      {(stepStatusOverrides.get(step.id) ?? step.status) !== "completed" && (stepStatusOverrides.get(step.id) ?? step.status) !== "skipped" && step.stepType === "email_form" && (() => {
                        const effectiveApprovalStatus = infoApprovalOverrides.get(entry.id) ?? entry.infoApprovalStatus;
                        if (effectiveApprovalStatus === "pending_review") {
                          return (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() => {
                                  startTransition(async () => {
                                    try {
                                      const { approveContractorInfo } = await import("@/app/actions/hriq/contractor-info");
                                      await approveContractorInfo(entry.id);
                                      // Optimistically update — hide button immediately
                                      setInfoApprovalOverrides((prev) => new Map(prev).set(entry.id, "approved"));
                                      setStepStatusOverrides((prev) => new Map(prev).set(step.id, "completed"));
                                      setNotice(`${entry.legalFirstName}'s info approved & provisioned.`);
                                      onSuccess?.();
                                    } catch (err) {
                                      showError({ title: "Error", message: getWarningMessage(err, "Failed to approve.") });
                                    }
                                  });
                                }}
                                className="h-7 rounded-md bg-green-600 px-2.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50 animate-pulse"
                              >
                                Approve & Provision
                              </button>
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() => {
                                  const reason = prompt("Rejection reason (optional):");
                                  startTransition(async () => {
                                    try {
                                      const { rejectContractorInfo } = await import("@/app/actions/hriq/contractor-info");
                                      await rejectContractorInfo(entry.id, reason || undefined);
                                      setInfoApprovalOverrides((prev) => new Map(prev).set(entry.id, "rejected"));
                                      setNotice(`${entry.legalFirstName}'s info rejected.`);
                                    } catch (err) {
                                      showError({ title: "Error", message: getWarningMessage(err, "Failed to reject.") });
                                    }
                                  });
                                }}
                                className="h-7 rounded-md bg-red-500 px-2.5 text-xs font-medium text-white hover:bg-red-600 disabled:opacity-50"
                              >
                                Reject
                              </button>
                            </div>
                          );
                        }
                        if (effectiveApprovalStatus === "approved") {
                          return <span className="text-[10px] text-green-600 dark:text-green-400">Approved & provisioned</span>;
                        }
                        if (effectiveApprovalStatus === "rejected") {
                          return <span className="text-[10px] text-red-500 dark:text-red-400">Rejected — awaiting resubmission</span>;
                        }
                        return <span className="text-[10px] text-amber-600 dark:text-amber-400">Waiting for contractor…</span>;
                      })()}
                      {(stepStatusOverrides.get(step.id) ?? step.status) !== "completed" && (stepStatusOverrides.get(step.id) ?? step.status) !== "skipped" && step.stepType !== "payment_setup" && step.stepType !== "email_form" && (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => {
                            startTransition(async () => {
                              try {
                                const result = await updateOnboardingStep(step.id, { status: "completed" });
                                if ("error" in result) { showError({ title: "Error", message: result.error }); return; }
                                // Optimistically hide button immediately
                                setStepStatusOverrides((prev) => new Map(prev).set(step.id, "completed"));
                                setNotice(`"${step.stepName}" marked complete.`);
                                onSuccess?.();
                              } catch (err) {
                                showError({ title: "Error", message: getWarningMessage(err, "Failed to update step.") });
                              }
                            });
                          }}
                          className="h-7 rounded-md bg-green-600 px-2.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                        >
                          Complete
                        </button>
                      )}
                    </div>
                  );})}

                  {/* Activate button */}
                  {session.overallProgress >= 100 && entry.employmentStatus !== "active" && (
                    <div className="mt-2 flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 p-2 dark:border-green-700 dark:bg-green-950/40">
                      <span className="flex-1 text-xs text-green-800 dark:text-green-300">All steps completed. Ready to activate.</span>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => {
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
                        {isPending ? "Activating…" : "Activate Contractor"}
                      </button>
                    </div>
                  )}

                  <div className="mt-2 flex items-center gap-2">
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
            {filter === "pre_hire" ? "No pre-hire candidates right now." : "No entries in this stage."}
          </div>
        )}
      </div>

      {/* Add hire dialog */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in duration-150">
          <div className="w-full max-w-lg rounded-xl border bg-card p-6 shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-200">
            <h2 className="text-lg font-semibold">Add New Hire</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{orgName}</p>
            <form onSubmit={handleCreate} className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">First Name *</label>
                  <input name="legalFirstName" required className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" />
                </div>
                <div>
                  <label className="text-sm font-medium">Last Name *</label>
                  <input name="legalLastName" required className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Email *</label>
                <input name="personalEmail" type="email" required className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Job Title</label>
                  <CustomSelectWithOther name="jobTitle" placeholder="Select role..." triggerClassName="mt-1 h-9 w-full" baseOptions={[...JOB_TITLE_OPTIONS]} category="job_title" />
                </div>
                <div>
                  <label className="text-sm font-medium">Type *</label>
                  <CustomSelect
                    name="employmentType"
                    required
                    defaultValue="contractor"
                    triggerClassName="mt-1 h-9 w-full"
                    options={[
                      { value: "contractor", label: "Contractor" },
                      { value: "full_time", label: "Full Time" },
                      { value: "part_time", label: "Part Time" },
                    ]}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium">Hourly Rate</label>
                  <input name="hourlyRate" placeholder="15.00" className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" />
                </div>
                <div>
                  <label className="text-sm font-medium">Currency</label>
                  <CustomSelect
                    name="currency"
                    defaultValue="USD"
                    triggerClassName="mt-1 h-9 w-full"
                    options={[
                      { value: "USD", label: "USD" }, { value: "EUR", label: "EUR" }, { value: "GBP", label: "GBP" },
                      { value: "PHP", label: "PHP" }, { value: "COP", label: "COP" }, { value: "BRL", label: "BRL" },
                      { value: "CLP", label: "CLP" }, { value: "MXN", label: "MXN" }, { value: "CAD", label: "CAD" },
                      { value: "AUD", label: "AUD" }, { value: "INR", label: "INR" },
                    ]}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Start Date</label>
                  <DatePicker name="startDate" className="mt-1" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Department</label>
                  <CustomSelectWithOther name="department" placeholder="Select department..." triggerClassName="mt-1 h-9 w-full" baseOptions={[...DEPARTMENT_OPTIONS]} category="department" />
                </div>
                <div>
                  <label className="text-sm font-medium">Country</label>
                  <SearchableSelect name="country" placeholder="Select country..." triggerClassName="mt-1 h-9 w-full" options={[...COUNTRY_OPTIONS]} />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowAdd(false)} className="h-9 rounded-md border px-4 text-sm hover:bg-accent">Cancel</button>
                <button type="submit" disabled={isPending} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                  {isPending ? "Adding..." : "Add to Pipeline"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Remove confirmation dialog */}
      {pendingRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in duration-150">
          <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-200">
            <h3 className="text-base font-semibold">Remove from Onboarding?</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              This will move <strong>{pendingRemove.name}</strong> back to Pre-Hire status and cancel their onboarding session.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setPendingRemove(null)} className="h-9 rounded-md border px-4 text-sm hover:bg-accent">Cancel</button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  startTransition(async () => {
                    try {
                      await removeEmployeeFromOnboarding(pendingRemove.id);
                      setPendingRemove(null);
                      setNotice(`${pendingRemove.name} removed from onboarding.`); onSuccess?.();
                    } catch (err) {
                      showError({ title: "Error", message: getWarningMessage(err, "Failed to remove.") });
                    }
                  });
                }}
                className="h-9 rounded-md bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {isPending ? "Removing..." : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete pre-hire confirmation dialog */}
      {pendingDeletePreHire && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in duration-150">
          <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-200">
            <h3 className="text-base font-semibold">Delete Pre-Hire</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Permanently delete <span className="font-medium text-foreground">{pendingDeletePreHire.name}</span> from the pipeline? This cannot be undone.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setPendingDeletePreHire(null)} className="h-9 rounded-md border px-4 text-sm hover:bg-accent">Cancel</button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  startTransition(async () => {
                    const target = pendingDeletePreHire;
                    setPendingDeletePreHire(null);
                    if (!target) return;
                    const result = await deletePreHireEmployee(target.id);
                    if (!result.success) {
                      showError({ title: "Error", message: `Warning: ${(result as any).error}` });
                      return;
                    }
                    setNotice(`Deleted: ${target.name} removed from pipeline.`); onSuccess?.();
                    setSelectedIds((prev) => { const n = new Set(prev); n.delete(target.id); return n; });
                  });
                }}
                className="h-9 rounded-md bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {isPending ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Onboarding wizard */}
      {wizardEmployees && (
        <ClientOnboardingWizard
          employees={wizardEmployees}
          orgName={orgName}
          senders={senders}
          paymentMethod={paymentMethod}
          onSuccess={(msg) => { setNotice(msg); setSelectedIds(new Set()); router.refresh(); onSuccess?.(); }}
          onClose={() => setWizardEmployees(null)}
        />
      )}
    </div>
  );
}
