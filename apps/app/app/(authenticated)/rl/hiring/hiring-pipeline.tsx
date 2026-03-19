"use client";

import {
  createPreHireEmployee,
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
} from "@/app/actions/hriq/onboarding";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
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
  onboardingSessions: Array<{ id: string; employee: { id: string; legalFirstName: string; legalLastName: string; personalEmail: string | null } }>;
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
  steps: OnboardingStep[];
};

type PipelineEntry = {
  id: string;
  legalFirstName: string;
  legalLastName: string;
  personalEmail: string | null;
  hourlyRate?: string | null;
  currency?: string | null;
  startDate?: Date | null;
  jobTitle: string | null;
  employmentType: string;
  employmentStatus: string;
  createdAt: Date;
  updatedAt: Date;
  organization: { name: string } | null;
  onboardingSessions: OnboardingSession[];
};

function getDisplayStepName(step: OnboardingStep): string {
  const raw = step.stepName.trim();
  if (step.stepType === "zoom_invite") return "Zoom Invite (Add to Batch)";
  if (step.stepType === "zoom_attendance") return "Zoom Orientation Attendance";
  if (step.stepType === "document") return "Government ID Upload";
  if (step.stepType === "jotform") return "Onboarding Forms";
  if (step.stepType === "custom") {
    const lower = raw.toLowerCase();
    if (lower.includes("onboarding data")) return "Onboarding Data Confirmed";
    if (lower.includes("manager")) return "Manager Introduction";
    if (lower.includes("access") || lower.includes("provision")) return "Tool Access Provisioning";
  }
  return raw;
}

function formatPacificDateTime(value: string | Date | null | undefined): string {
  if (!value) return "No date";
  const date = new Date(value);
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
  const anySentOrCompleted = jotformSteps.some((step) => step.status === "sent" || step.status === "completed");
  const allSkipped = jotformSteps.every((step) => step.status === "skipped");

  const merged: OnboardingStep = {
    ...first,
    stepName: "Onboarding Forms",
    status: allCompleted ? "completed" : allSkipped ? "skipped" : anySentOrCompleted ? "sent" : "pending",
    isRequired: jotformSteps.some((step) => step.isRequired),
  };

  const result = steps.filter((step) => step.stepType !== "jotform");
  const insertionIndex = steps.findIndex((step) => step.stepType === "jotform");
  result.splice(Math.max(insertionIndex, 0), 0, merged);
  return result;
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pre_hire: { label: "Pre-Hire", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300" },
  onboarding_scheduled: { label: "Scheduled", cls: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300" },
  onboarding_in_progress: { label: "Onboarding", cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300" },
  active: { label: "Active", cls: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300" },
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
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topTab, setTopTab] = useState<"pipeline" | "zoom" | "forms">("pipeline");
  const [filter, setFilter] = useState<string>("pre_hire");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [wizardEmployees, setWizardEmployees] = useState<
    {
      id: string;
      legalFirstName: string;
      legalLastName: string;
      personalEmail: string | null;
      organizationName: string | null;
      hourlyRate?: string | null;
      currency?: string | null;
      startDate?: string | null;
    }[] | null
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
        currency: e.currency ?? "USD",
        startDate: e.startDate ? new Date(e.startDate).toISOString().slice(0, 10) : null,
      }))
    );
  };

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await createPreHireEmployee({
          organizationId: fd.get("organizationId") as string,
          legalFirstName: fd.get("legalFirstName") as string,
          legalLastName: fd.get("legalLastName") as string,
          personalEmail: fd.get("personalEmail") as string,
          employmentType: fd.get("employmentType") as string,
          jobTitle: fd.get("jobTitle") as string,
          department: fd.get("department") as string,
          location: fd.get("location") as string,
          hourlyRate: fd.get("hourlyRate") as string,
          currency: (fd.get("currency") as string) || "USD",
          startDate: fd.get("startDate") as string,
        });
        setShowAdd(false);
        setError(null);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create");
      }
    });
  };

  const [showCreateZoomTop, setShowCreateZoomTop] = useState(false);
  const [selectedPreviewFormId, setSelectedPreviewFormId] = useState<string | null>(null);
  const [topZoomMsg, setTopZoomMsg] = useState<Record<string, string>>({});
  const [deletingBatchId, setDeletingBatchId] = useState<string | null>(null);
  const [topZoomHost, setTopZoomHost] = useState(zoomHosts[0] ?? "");

  const zoomBatches = batchSessions.filter((s) => s.zoomJoinUrl);
  const pendingChecklistEmployeeIds = entries
    .filter((entry) => {
      const session = entry.onboardingSessions[0];
      return (
        (entry.employmentStatus === "onboarding_scheduled" || entry.employmentStatus === "onboarding_in_progress") &&
        !!session?.jotformsSent &&
        !session?.jotformsCompleted
      );
    })
    .map((entry) => entry.id);
  const pendingChecklistKey = pendingChecklistEmployeeIds.join("|");
  const selectedPreviewForm =
    jotformForms.find((f) => f.id === selectedPreviewFormId) ?? jotformForms[0] ?? null;
  const selectedPreviewFormUrl = selectedPreviewForm?.url ?? null;

  useEffect(() => {
    if (!pendingChecklistEmployeeIds.length) return;
    let cancelled = false;
    const syncAll = async () => {
      let shouldRefresh = false;
      for (const employeeId of pendingChecklistEmployeeIds) {
        try {
          const result = await syncOnboardingChecklist(employeeId);
          if (result.ok && result.completed) shouldRefresh = true;
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
          ["zoom", `Zoom Sessions (${zoomBatches.length})`],
          ["forms", `Forms (${jotformForms.length})`],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTopTab(key)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              topTab === key ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ═══ PIPELINE TAB ═══ */}
      {topTab === "pipeline" && (<>
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
        <button type="button" onClick={() => setShowAdd(true)} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          + Add Hire
        </button>
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
      {error && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
      )}

      {/* Pipeline table */}
      <div className="rounded-xl border bg-card divide-y">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 text-xs font-medium text-muted-foreground">
          <div className="w-7">
            {preHireFiltered.length > 0 && (
              <input type="checkbox" checked={allPreHireSelected} onChange={toggleSelectAll} className="h-3.5 w-3.5 rounded border-gray-300" />
            )}
          </div>
          <div className="flex-1">Name</div>
          <div className="hidden md:block w-32">Organization</div>
          <div className="hidden md:block w-28">Role</div>
          <div className="w-24">Status</div>
          <div className="hidden lg:block w-32">Progress</div>
          <div className="w-36 text-right">Actions</div>
        </div>

        {filtered.map((entry) => {
          const session = entry.onboardingSessions[0];
          const badge = STATUS_BADGE[entry.employmentStatus] ?? STATUS_BADGE.pre_hire;
          const isPreHire = entry.employmentStatus === "pre_hire";
          const isOnboarding = entry.employmentStatus === "onboarding_in_progress" || entry.employmentStatus === "onboarding_scheduled";
          const isExpanded = expandedId === entry.id && isOnboarding && session;

          return (
            <div key={entry.id}>
              {/* Row */}
              <div className={`flex items-center gap-3 px-4 py-3 transition-colors ${isOnboarding ? "cursor-pointer hover:bg-muted/30" : "hover:bg-muted/20"}`}
                onClick={isOnboarding && session ? () => setExpandedId(expandedId === entry.id ? null : entry.id) : undefined}
              >
                <div className="w-7">
                  {isPreHire ? (
                    <input type="checkbox" checked={selectedIds.has(entry.id)} onChange={(e) => { e.stopPropagation(); toggleSelect(entry.id); }} className="h-3.5 w-3.5 rounded border-gray-300" />
                  ) : isOnboarding ? (
                    <span className="text-xs text-muted-foreground">{isExpanded ? "\u25B2" : "\u25BC"}</span>
                  ) : null}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{entry.legalFirstName} {entry.legalLastName}</div>
                  {entry.personalEmail && <div className="text-xs text-muted-foreground truncate">{entry.personalEmail}</div>}
                </div>
                <div className="hidden md:block w-32 text-sm text-muted-foreground truncate">{entry.organization?.name ?? "\u2014"}</div>
                <div className="hidden md:block w-28 text-sm truncate">{entry.jobTitle ?? entry.employmentType}</div>
                <div className="w-24">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>{badge.label}</span>
                </div>
                <div className="hidden lg:block w-32">
                  {session ? (
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full bg-gray-200 dark:bg-gray-700">
                        <div className="h-1.5 rounded-full bg-green-500 transition-all" style={{ width: `${session.overallProgress}%` }} />
                      </div>
                      <span className="text-xs tabular-nums text-muted-foreground w-8">{session.overallProgress}%</span>
                    </div>
                  ) : <span className="text-xs text-muted-foreground">{"\u2014"}</span>}
                </div>
                <div className="w-36 flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                  {isPreHire && (
                    <button type="button" onClick={() => openWizard([entry])} className="h-7 rounded-md bg-blue-600 px-2.5 text-xs font-medium text-white hover:bg-blue-700">
                      Start Onboarding
                    </button>
                  )}
                  {isOnboarding && (
                    <button
                      type="button"
                      onClick={() =>
                        startTransition(async () => {
                          const confirmed = window.confirm(
                            `Remove ${entry.legalFirstName} ${entry.legalLastName} from onboarding? They will be moved back to Pre-Hire.`
                          );
                          if (!confirmed) return;
                          try {
                            await removeEmployeeFromOnboarding(entry.id);
                            setError(null);
                            if (expandedId === entry.id) setExpandedId(null);
                            router.refresh();
                          } catch (err) {
                            setError(
                              err instanceof Error
                                ? err.message
                                : "Failed to remove person from onboarding"
                            );
                          }
                        })
                      }
                      disabled={isPending}
                      className="h-7 rounded-md border border-red-300 px-2.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  )}
                  <Link href={`/client/employees/${entry.id}`} className="h-7 rounded-md border px-2.5 text-xs font-medium leading-7 hover:bg-accent">
                    View
                  </Link>
                </div>
              </div>

              {/* Inline onboarding steps */}
              {isExpanded && session && (
                <div className="border-t bg-muted/10 px-4 py-3 space-y-2">
                  {getRenderableSteps(session.steps).map((step, idx) => (
                    <InlineStep
                      key={step.id}
                      step={step}
                      number={idx + 1}
                      employeeId={entry.id}
                      session={session}
                      senders={senders}
                      jotformForms={jotformForms}
                      zoomSessions={zoomSessions}
                      zoomHosts={zoomHosts}
                      organizationName={entry.organization?.name ?? null}
                      zoomHostByOrg={zoomHostByOrg}
                      isPending={isPending}
                      onAction={(fn) => startTransition(async () => { await fn(); router.refresh(); })}
                    />
                  ))}
                  <Link href={`/client/employees/${entry.id}`} className="inline-block mt-1 text-xs text-primary hover:underline">
                    View full profile
                  </Link>
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

      </>)}

      {/* ═══ ZOOM SESSIONS TAB ═══ */}
      {topTab === "zoom" && (
        <div className="space-y-4">
          <div className="flex items-center justify-end">
            <button type="button" onClick={() => setShowCreateZoomTop(true)} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              + New Zoom Session
            </button>
          </div>
          {zoomBatches.length > 0 ? zoomBatches.map((s) => (
            <div key={s.id} className="rounded-xl border bg-card p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h3 className="font-semibold">{s.title}</h3>
                  <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
                    {s.zoomMeetingDate && (
                      <span>{formatPacificDateTime(s.zoomMeetingDate)}</span>
                    )}
                    <span>{s.zoomDuration} min</span>
                    <span>{s.onboardingSessions.length} attendee{s.onboardingSessions.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="mt-3 flex gap-3">
                    {s.zoomJoinUrl && (
                      <a href={s.zoomJoinUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center rounded-md bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700">Join Link</a>
                    )}
                    {s.zoomStartUrl && (
                      <a href={s.zoomStartUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium hover:bg-accent">Host Link</a>
                    )}
                    <button
                      type="button"
                      disabled={isPending || deletingBatchId === s.id}
                      onClick={() =>
                        startTransition(async () => {
                          setDeletingBatchId(s.id);
                          setTopZoomMsg((prev) => {
                            const next = { ...prev };
                            delete next[s.id];
                            return next;
                          });
                          try {
                            await deleteBatchZoomMeeting(s.id);
                            setTopZoomMsg((prev) => ({
                              ...prev,
                              [s.id]: "Zoom meeting deleted",
                            }));
                            router.refresh();
                          } catch (e) {
                            setTopZoomMsg((prev) => ({
                              ...prev,
                              [s.id]: `Error: ${e instanceof Error ? e.message : "Failed to delete meeting"}`,
                            }));
                          } finally {
                            setDeletingBatchId((current) => (current === s.id ? null : current));
                          }
                        })
                      }
                      className="inline-flex h-8 items-center rounded-md border border-red-300 px-3 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      {deletingBatchId === s.id ? "Deleting..." : "Delete Meeting"}
                    </button>
                  </div>
                  {topZoomMsg[s.id] && (
                    <div className={`mt-2 rounded px-2 py-1 text-xs ${topZoomMsg[s.id]?.startsWith("Error") ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                      {topZoomMsg[s.id]}
                    </div>
                  )}
                </div>
              </div>
              {s.onboardingSessions.length > 0 && (
                <div className="mt-4 border-t pt-3">
                  <div className="flex flex-wrap gap-2">
                    {s.onboardingSessions.map((os) => (
                      <Link key={os.id} href={`/client/employees/${os.employee.id}`} className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs hover:bg-accent">
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[9px] font-bold text-primary">
                          {os.employee.legalFirstName[0]}{os.employee.legalLastName[0]}
                        </div>
                        {os.employee.legalFirstName} {os.employee.legalLastName}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )) : (
            <div className="py-12 text-center text-sm text-muted-foreground">No Zoom sessions yet. Create one to schedule orientations.</div>
          )}
          {showCreateZoomTop && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={(e) => { if (e.target === e.currentTarget) setShowCreateZoomTop(false); }}>
              <div className="w-full max-w-lg rounded-xl border bg-card p-6 shadow-lg">
                <h2 className="text-lg font-semibold">New Zoom Session</h2>
                <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(async () => { await createBatchSession({ title: fd.get("title") as string, description: fd.get("description") as string, zoomMeetingDate: fd.get("zoomMeetingDate") as string, zoomDuration: Number(fd.get("zoomDuration")) || 60, zoomHost: topZoomHost || undefined }); setShowCreateZoomTop(false); router.refresh(); }); }} className="mt-4 space-y-4">
                  <div>
                    <label className="text-sm font-medium">Title *</label>
                    <input name="title" required className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Description</label>
                    <textarea name="description" rows={2} className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium">Meeting Date & Time (PT) *</label>
                      <input name="zoomMeetingDate" type="datetime-local" required className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Duration (min)</label>
                      <input name="zoomDuration" type="number" defaultValue={60} className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" />
                    </div>
                  </div>
                  {zoomHosts.length > 0 && (
                    <div>
                      <label className="text-sm font-medium">Zoom Host Account</label>
                      <select
                        value={topZoomHost}
                        onChange={(e) => setTopZoomHost(e.target.value)}
                        className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        {zoomHosts.map((host) => (
                          <option key={host} value={host}>
                            {host}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setShowCreateZoomTop(false)} className="h-9 rounded-md border px-4 text-sm hover:bg-accent">Cancel</button>
                    <button type="submit" disabled={isPending} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                      {isPending ? "Creating..." : "Create Session"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ FORMS TAB ═══ */}
      {topTab === "forms" && (
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
              <div className={`rounded px-2 py-1 text-xs ${jotformStatus.connected ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"}`}>
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
                    Open "{selectedPreviewForm.title}" in new tab
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add hire modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={(e) => { if (e.target === e.currentTarget) setShowAdd(false); }}>
          <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg">
            <h2 className="text-lg font-semibold">Add New Hire</h2>
            {error && <div className="mt-2 rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</div>}
            <form onSubmit={handleCreate} className="mt-4 space-y-3">
              <div>
                <label className="text-sm font-medium">Organization</label>
                <select name="organizationId" required className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">Select...</option>
                  {organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-sm font-medium">First Name</label><input name="legalFirstName" required className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" /></div>
                <div><label className="text-sm font-medium">Last Name</label><input name="legalLastName" required className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" /></div>
              </div>
              <div><label className="text-sm font-medium">Email</label><input name="personalEmail" type="email" required className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Type</label>
                  <select name="employmentType" required className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="contractor">Contractor</option>
                    <option value="full_time">Full Time</option>
                    <option value="part_time">Part Time</option>
                  </select>
                </div>
                <div><label className="text-sm font-medium">Job Title</label><input name="jobTitle" className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-sm font-medium">Department</label><input name="department" className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" /></div>
                <div><label className="text-sm font-medium">Location</label><input name="location" className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="text-sm font-medium">Rate</label><input name="hourlyRate" type="number" step="0.01" className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" /></div>
                <div>
                  <label className="text-sm font-medium">Currency</label>
                  <select name="currency" defaultValue="USD" className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="USD">USD</option><option value="PHP">PHP</option><option value="EUR">EUR</option>
                  </select>
                </div>
                <div><label className="text-sm font-medium">Start</label><input name="startDate" type="date" className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" /></div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAdd(false)} className="h-9 rounded-md border px-4 text-sm hover:bg-accent">Cancel</button>
                <button type="submit" disabled={isPending} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                  {isPending ? "Adding..." : "Add to Pipeline"}
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
          onClose={() => { setWizardEmployees(null); setSelectedIds(new Set()); }}
        />
      )}
    </div>
  );
}

/* ── Inline step row for expanded onboarding ── */

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
}) {
  const router = useRouter();
  const [showActions, setShowActions] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [selectedForms, setSelectedForms] = useState<Set<string>>(new Set());
  const [showCreateZoom, setShowCreateZoom] = useState(false);
  const [newZoomDate, setNewZoomDate] = useState("");
  const [newZoomDuration, setNewZoomDuration] = useState(60);
  const preferredHostFromOrg =
    (organizationName ? zoomHostByOrg[organizationName.trim().toLowerCase()] : undefined) ?? "";
  const hostOptions = Array.from(new Set([...zoomHosts, preferredHostFromOrg].filter(Boolean)));
  const [newZoomHost, setNewZoomHost] = useState(preferredHostFromOrg || zoomHosts[0] || "");

  useEffect(() => {
    if (step.stepType !== "jotform" || !session.jotformsSent || session.jotformsCompleted) return;
    const interval = setInterval(async () => {
      try {
        const result = await syncOnboardingChecklist(employeeId);
        if (result.ok && result.completed) {
          setMsg(result.message);
          router.refresh();
        }
      } catch {
        // Silent background sync; manual button still available for explicit checks.
      }
    }, 60_000);
    return () => clearInterval(interval);
  }, [employeeId, router, session.jotformsCompleted, session.jotformsSent, step.stepType]);

  const isDone = step.status === "completed";
  const isSkipped = step.status === "skipped";
  const isSent = step.status === "sent";
  const hasIntegration = step.stepType === "zoom_invite" || step.stepType === "jotform";

  return (
    <div className={`rounded-lg border px-3 py-2 ${isDone ? "border-green-200 bg-green-50/50 dark:border-green-800/50 dark:bg-green-950/20" : isSkipped ? "border-muted opacity-60" : isSent ? "border-blue-200 bg-blue-50/30 dark:border-blue-800/50 dark:bg-blue-950/20" : "border-border"}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
            isDone ? "bg-green-500 text-white" : isSkipped ? "bg-gray-400 text-white" : isSent ? "bg-blue-500 text-white" : "bg-muted text-muted-foreground"
          }`}>
            {isDone ? "\u2713" : isSkipped ? "\u2014" : isSent ? "\u2709" : number}
          </div>
          <span className={`text-sm ${isDone ? "line-through text-muted-foreground" : "font-medium"}`}>{getDisplayStepName(step)}</span>
          {step.isRequired && !isDone && !isSkipped && (
            <span className="rounded bg-red-100 px-1 py-0.5 text-[10px] text-red-600 dark:bg-red-900/50 dark:text-red-300">Required</span>
          )}
          {isSent && <span className="rounded bg-blue-100 px-1 py-0.5 text-[10px] text-blue-600 dark:bg-blue-900/50 dark:text-blue-300">Sent</span>}
        </div>
        {!isDone && !isSkipped && (
          <div className="flex items-center gap-1">
            {hasIntegration && (
              <button type="button" onClick={() => setShowActions(!showActions)} className="h-6 rounded border px-2 text-[11px] hover:bg-accent">
                {showActions ? "Hide" : "Actions"}
              </button>
            )}
            {step.stepType !== "zoom_invite" && step.stepType !== "jotform" && (
              <button type="button" onClick={() => onAction(async () => { await updateOnboardingStep(step.id, { status: "completed" }); })} disabled={isPending} className="h-6 rounded bg-green-600 px-2 text-[11px] text-white hover:bg-green-700 disabled:opacity-50">Done</button>
            )}
            <button type="button" onClick={() => onAction(async () => { await updateOnboardingStep(step.id, { status: "skipped" }); })} disabled={isPending} className="h-6 rounded border px-2 text-[11px] hover:bg-accent disabled:opacity-50">Skip</button>
          </div>
        )}
      </div>

      {msg && (
        <div className={`mt-1.5 rounded px-2 py-1 text-xs ${msg.startsWith("Error") ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"}`}>
          {msg}
        </div>
      )}

      {/* Zoom invite action -- pick from existing sessions or resend */}
      {showActions && step.stepType === "zoom_invite" && !isDone && (
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
                      zoomDate: session.zoomMeetingDate ? new Date(session.zoomMeetingDate).toISOString() : "",
                      senderEmail: senders[0],
                    });
                    setMsg("Zoom invite resent");
                    setShowActions(false);
                  } catch (e) { setMsg(`Error: ${e instanceof Error ? e.message : "Failed"}`); }
                  finally { setActionPending(false); }
                }}
                className="h-7 rounded bg-blue-600 px-3 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {actionPending ? "Sending..." : "Resend Invite"}
              </button>
            </div>
          )}
          {zoomSessions.filter((z) => z.zoomJoinUrl).length > 0 ? (
            <>
              <p className="text-xs text-muted-foreground">{session.zoomMeetingLink ? "Or add to a different batch (auto-sends invite):" : "Add to batch (auto-sends invite):"}</p>
              <div className="space-y-1 max-h-36 overflow-y-auto">
                {zoomSessions.filter((z) => z.zoomJoinUrl).map((z) => (
                  <button
                    key={z.id}
                    type="button"
                    disabled={actionPending}
                    onClick={async () => {
                      setActionPending(true);
                      try {
                        await assignToZoomSession(employeeId, z.id);
                        setMsg("Assigned & invite sent");
                        setShowActions(false);
                        onAction(async () => {});
                      } catch (e) { setMsg(`Error: ${e instanceof Error ? e.message : "Failed"}`); }
                      finally { setActionPending(false); }
                    }}
                    className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left hover:bg-accent transition-colors disabled:opacity-50"
                  >
                    <div>
                      <div className="text-xs font-medium">{z.title}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {z.zoomMeetingDate ? formatPacificDateTime(z.zoomMeetingDate) : "No date"}{" "}
                        &middot; {z.zoomDuration}m &middot; {z._count.onboardingSessions} attendee{z._count.onboardingSessions !== 1 ? "s" : ""}
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
                  <input type="datetime-local" value={newZoomDate} onChange={(e) => setNewZoomDate(e.target.value)} className="mt-0.5 flex h-8 w-full rounded-md border border-input bg-background px-2 text-xs" />
                </div>
                <div className="w-20">
                  <label className="text-[11px] font-medium text-muted-foreground">Duration</label>
                  <select value={newZoomDuration} onChange={(e) => setNewZoomDuration(Number(e.target.value))} className="mt-0.5 flex h-8 w-full rounded-md border border-input bg-background px-1 text-xs">
                    <option value={30}>30m</option><option value={45}>45m</option><option value={60}>60m</option><option value={90}>90m</option>
                  </select>
                </div>
              </div>
              {zoomHosts.length > 0 && (
                <div>
                    <label className="text-[11px] font-medium text-muted-foreground">Host Account</label>
                  <select
                    value={newZoomHost}
                    onChange={(e) => setNewZoomHost(e.target.value)}
                    className="mt-0.5 flex h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                  >
                    {hostOptions.map((host) => (
                      <option key={host} value={host}>
                        {host}
                      </option>
                    ))}
                  </select>
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
                        title: `Zoom Onboarding — ${new Date(newZoomDate).toLocaleDateString()}`,
                        zoomMeetingDate: newZoomDate,
                        zoomDuration: newZoomDuration,
                        zoomHost: newZoomHost || undefined,
                      });
                      await assignToZoomSession(employeeId, batch.id);
                      setMsg("Added to new batch & invite sent");
                      setShowCreateZoom(false);
                      setShowActions(false);
                      onAction(async () => {});
                    } catch (e) { setMsg(`Error: ${e instanceof Error ? e.message : "Failed"}`); }
                    finally { setActionPending(false); }
                  }}
                  className="h-7 rounded bg-blue-600 px-3 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {actionPending ? "Creating..." : "Create Batch & Add"}
                </button>
                <button type="button" onClick={() => setShowCreateZoom(false)} className="h-7 rounded border px-3 text-xs hover:bg-accent">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* JotForm action */}
      {showActions && step.stepType === "jotform" && !isDone && (
        <div className="mt-2 space-y-2">
          {session.jotformsSent && (
            <div className="rounded border bg-muted/20 px-2 py-1 text-[11px] text-muted-foreground">
              Live checklist: sent forms are checked against JotForm submissions. Use <strong>Check Signed Status</strong> to refresh now.
            </div>
          )}
          {jotformForms.length > 0 ? (
            <>
              <div className="flex flex-wrap gap-1">
                {jotformForms.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setSelectedForms((prev) => { const n = new Set(prev); n.has(f.id) ? n.delete(f.id) : n.add(f.id); return n; })}
                    className={`h-7 rounded border px-2 text-xs transition-colors ${selectedForms.has(f.id) ? "border-primary bg-primary/10 font-medium" : "hover:bg-accent"}`}
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
                    setMsg(`${r.sent} form(s) sent`);
                    setShowActions(false);
                  } catch (e) { setMsg(`Error: ${e instanceof Error ? e.message : "Failed"}`); }
                  finally { setActionPending(false); }
                }}
                className="h-7 rounded bg-orange-600 px-3 text-xs text-white hover:bg-orange-700 disabled:opacity-50"
              >
                {actionPending ? "Sending..." : `Send ${selectedForms.size} Form${selectedForms.size !== 1 ? "s" : ""}`}
              </button>
              {session.jotformsSent && (
                <button
                  type="button"
                  disabled={actionPending}
                  onClick={async () => {
                    setActionPending(true);
                    try {
                      const result = await syncOnboardingChecklist(employeeId);
                      if (!result.ok) {
                        setMsg(`Error: ${result.error}`);
                      } else {
                        setMsg(result.message);
                        onAction(async () => {});
                      }
                    } catch (e) {
                      setMsg(`Error: ${e instanceof Error ? e.message : "Failed"}`);
                    } finally {
                      setActionPending(false);
                    }
                  }}
                  className="h-7 rounded border px-3 text-xs hover:bg-accent disabled:opacity-50"
                >
                  {actionPending ? "Checking..." : "Check Signed Status"}
                </button>
              )}
            </>
          ) : (
            <span className="text-xs text-muted-foreground">No JotForm forms configured</span>
          )}
        </div>
      )}
    </div>
  );
}
