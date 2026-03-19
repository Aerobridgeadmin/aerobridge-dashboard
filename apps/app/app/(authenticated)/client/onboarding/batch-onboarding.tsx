"use client";

import {
  createBatchSession,
  addEmployeesToBatch,
  updateBatchSession,
  sendOnboardingForms,
} from "@/app/actions/hriq/onboarding";
import type { BatchSession, OnboardingSession, Employee } from "@repo/database";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type BatchSessionWithEmployees = BatchSession & {
  onboardingSessions: (OnboardingSession & {
    employee: {
      id: string;
      legalFirstName: string;
      legalLastName: string;
      employeeNumber: string;
      personalEmail: string | null;
      workEmail: string | null;
    };
  })[];
};

type OnboardingEmployee = {
  id: string;
  legalFirstName: string;
  legalLastName: string;
  personalEmail: string | null;
  workEmail: string | null;
  onboardingSession: {
    id: string;
    jotformsSent: boolean;
    jotformsSentAt: Date | null;
    jotformsSentData: string | null;
  } | null;
};

type JotForm = { id: string; title: string; url: string };

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  in_progress: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  cancelled: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

export function BatchOnboarding({
  batchSessions,
  availableEmployees,
  onboardingEmployees,
  jotformForms,
  senders,
}: {
  batchSessions: BatchSessionWithEmployees[];
  availableEmployees: Employee[];
  onboardingEmployees: OnboardingEmployee[];
  jotformForms: JotForm[];
  senders: string[];
}) {
  const [tab, setTab] = useState<"overview" | "zoom" | "forms">("overview");
  const [showCreate, setShowCreate] = useState(false);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      await createBatchSession({
        title: formData.get("title") as string,
        description: formData.get("description") as string,
        zoomMeetingDate: formData.get("zoomMeetingDate") as string,
        zoomDuration: Number(formData.get("zoomDuration")) || 60,
      });
      setShowCreate(false);
      router.refresh();
    });
  };

  const handleAddEmployees = (batchId: string, employeeIds: string[]) => {
    startTransition(async () => {
      await addEmployeesToBatch(batchId, employeeIds);
      setAddingTo(null);
      router.refresh();
    });
  };

  const handleCancel = (batchId: string) => {
    startTransition(async () => {
      await updateBatchSession(batchId, { status: "cancelled" });
      router.refresh();
    });
  };

  const tabs = [
    { key: "overview" as const, label: `Overview (${batchSessions.length})` },
    { key: "zoom" as const, label: `Zoom Sessions (${batchSessions.filter((s) => s.zoomJoinUrl).length})` },
    { key: "forms" as const, label: `Forms (${onboardingEmployees.length})` },
  ];

  const zoomSessions = batchSessions.filter((s) => s.zoomJoinUrl && s.status !== "cancelled");

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 rounded-lg border p-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === t.key ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {(tab === "overview" || tab === "zoom") && (
          <button type="button" onClick={() => setShowCreate(true)} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            + New Session
          </button>
        )}
      </div>

      {/* ── Tab 1: Overview ── */}
      {tab === "overview" && (
        <div className="space-y-4">
          {batchSessions.map((session) => (
            <div key={session.id} className="rounded-xl border bg-card p-6">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold">{session.title}</h3>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_COLORS[session.status] ?? ""}`}>
                      {session.status.replace(/_/g, " ")}
                    </span>
                  </div>
                  {session.description && <p className="mt-1 text-sm text-muted-foreground">{session.description}</p>}
                  {session.zoomMeetingDate && (
                    <p className="mt-2 text-sm">Zoom: {new Date(session.zoomMeetingDate).toLocaleString()} ({session.zoomDuration} min)</p>
                  )}
                  {session.zoomJoinUrl && (
                    <a href={session.zoomJoinUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-sm text-blue-600 hover:underline dark:text-blue-400">
                      Join Zoom Meeting
                    </a>
                  )}
                </div>
                <div className="flex gap-2">
                  {session.status === "scheduled" && (
                    <>
                      <button type="button" onClick={() => setAddingTo(session.id)} className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent">Add Contractors</button>
                      <button type="button" onClick={() => handleCancel(session.id)} disabled={isPending} className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400">Cancel</button>
                    </>
                  )}
                </div>
              </div>
              {session.onboardingSessions.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-muted-foreground">Contractors ({session.onboardingSessions.length})</h4>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {session.onboardingSessions.map((os) => (
                      <Link key={os.id} href={`/client/employees/${os.employee.id}`} className="inline-flex items-center rounded-full border px-3 py-1 text-sm hover:bg-accent">
                        {os.employee.legalFirstName} {os.employee.legalLastName}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
          {batchSessions.length === 0 && (
            <div className="py-12 text-center text-muted-foreground">No batch sessions yet. Create one to get started.</div>
          )}
        </div>
      )}

      {/* ── Tab 2: Zoom Sessions ── */}
      {tab === "zoom" && (
        <div className="space-y-4">
          {zoomSessions.length > 0 ? zoomSessions.map((session) => (
            <div key={session.id} className="rounded-xl border bg-card p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h3 className="font-semibold">{session.title}</h3>
                  <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
                    {session.zoomMeetingDate && (
                      <span>{new Date(session.zoomMeetingDate).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                    )}
                    <span>{session.zoomDuration} min</span>
                    <span>{session.onboardingSessions.length} attendee{session.onboardingSessions.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="mt-3 flex gap-3">
                    {session.zoomJoinUrl && (
                      <a href={session.zoomJoinUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center rounded-md bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700">
                        Join Link
                      </a>
                    )}
                    {session.zoomStartUrl && (
                      <a href={session.zoomStartUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium hover:bg-accent">
                        Host Link
                      </a>
                    )}
                    {session.status === "scheduled" && (
                      <button type="button" onClick={() => setAddingTo(session.id)} className="h-8 rounded-md border px-3 text-xs hover:bg-accent">
                        Add Contractors
                      </button>
                    )}
                  </div>
                </div>
              </div>
              {session.onboardingSessions.length > 0 && (
                <div className="mt-4 border-t pt-3">
                  <div className="flex flex-wrap gap-2">
                    {session.onboardingSessions.map((os) => (
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
            <div className="py-12 text-center text-muted-foreground">No Zoom sessions yet. Create a session with a Zoom date to get started.</div>
          )}
        </div>
      )}

      {/* ── Tab 3: Forms ── */}
      {tab === "forms" && (
        <div className="space-y-3">
          {onboardingEmployees.length > 0 ? (
            <div className="rounded-xl border bg-card divide-y">
              {onboardingEmployees.map((emp) => (
                <FormRow
                  key={emp.id}
                  employee={emp}
                  jotformForms={jotformForms}
                  senders={senders}
                  isPending={isPending}
                  onRefresh={() => router.refresh()}
                />
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-muted-foreground">No employees currently in onboarding.</div>
          )}
        </div>
      )}

      {/* Create Dialog */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}>
          <div className="w-full max-w-lg rounded-xl border bg-background p-6 shadow-lg">
            <h2 className="text-lg font-semibold">New Zoom Session</h2>
            <form onSubmit={handleCreate} className="mt-4 space-y-4">
              <div>
                <label className="text-sm font-medium">Title *</label>
                <input name="title" required className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium">Description</label>
                <textarea name="description" rows={2} className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Meeting Date & Time *</label>
                  <input name="zoomMeetingDate" type="datetime-local" required className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-sm font-medium">Duration (min)</label>
                  <input name="zoomDuration" type="number" defaultValue={60} className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowCreate(false)} className="h-10 rounded-md border px-4 text-sm hover:bg-accent">Cancel</button>
                <button type="submit" disabled={isPending} className="h-10 rounded-md bg-primary px-4 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                  {isPending ? "Creating..." : "Create Session"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Employees Dialog */}
      {addingTo && (
        <AddEmployeesDialog
          batchId={addingTo}
          employees={availableEmployees}
          onClose={() => setAddingTo(null)}
          onAdd={handleAddEmployees}
          isPending={isPending}
        />
      )}
    </div>
  );
}

/* ── Form row per employee ── */

function FormRow({
  employee,
  jotformForms,
  senders,
  isPending,
  onRefresh,
}: {
  employee: OnboardingEmployee;
  jotformForms: JotForm[];
  senders: string[];
  isPending: boolean;
  onRefresh: () => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [selectedForms, setSelectedForms] = useState<Set<string>>(new Set());

  const hasSent = employee.onboardingSession?.jotformsSent;

  let sentFormNames: string[] = [];
  if (employee.onboardingSession?.jotformsSentData) {
    try {
      const parsed = JSON.parse(employee.onboardingSession.jotformsSentData) as { name: string }[];
      sentFormNames = parsed.map((f) => f.name);
    } catch { /* ignore */ }
  }

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
            {employee.legalFirstName[0]}{employee.legalLastName[0]}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{employee.legalFirstName} {employee.legalLastName}</div>
            <div className="text-xs text-muted-foreground truncate">{employee.personalEmail ?? employee.workEmail}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasSent && (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/40 dark:text-green-300">
              Forms Sent
            </span>
          )}
          <button
            type="button"
            onClick={() => setShowPicker(!showPicker)}
            className={`h-8 rounded-md px-3 text-xs font-medium ${
              showPicker ? "border bg-accent" : hasSent ? "border hover:bg-accent" : "bg-orange-600 text-white hover:bg-orange-700"
            }`}
          >
            {showPicker ? "Hide" : hasSent ? "Send More" : "Send Forms"}
          </button>
        </div>
      </div>

      {hasSent && sentFormNames.length > 0 && !showPicker && (
        <div className="mt-1.5 ml-11 flex flex-wrap gap-1">
          {sentFormNames.map((name) => (
            <span key={name} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{name}</span>
          ))}
        </div>
      )}

      {msg && (
        <div className={`mt-2 ml-11 rounded px-2 py-1 text-xs ${msg.startsWith("Error") ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
          {msg}
        </div>
      )}

      {showPicker && (
        <div className="mt-3 ml-11 space-y-2">
          {jotformForms.length > 0 ? (
            <>
              <div className="flex flex-wrap gap-1.5">
                {jotformForms.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setSelectedForms((prev) => { const n = new Set(prev); n.has(f.id) ? n.delete(f.id) : n.add(f.id); return n; })}
                    className={`h-7 rounded border px-2.5 text-xs transition-colors ${selectedForms.has(f.id) ? "border-primary bg-primary/10 font-medium" : "hover:bg-accent"}`}
                  >
                    {f.title}
                  </button>
                ))}
              </div>
              <button
                type="button"
                disabled={sending || selectedForms.size === 0}
                onClick={async () => {
                  setSending(true);
                  setMsg(null);
                  try {
                    const r = await sendOnboardingForms({ employeeId: employee.id, formIds: Array.from(selectedForms), senderEmail: senders[0] });
                    setMsg(`${r.sent} form(s) sent`);
                    setShowPicker(false);
                    setSelectedForms(new Set());
                    onRefresh();
                  } catch (e) { setMsg(`Error: ${e instanceof Error ? e.message : "Failed"}`); }
                  finally { setSending(false); }
                }}
                className="h-7 rounded bg-orange-600 px-3 text-xs text-white hover:bg-orange-700 disabled:opacity-50"
              >
                {sending ? "Sending..." : `Send ${selectedForms.size} Form${selectedForms.size !== 1 ? "s" : ""}`}
              </button>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">No JotForm forms configured.</span>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Add Employees Dialog ── */

function AddEmployeesDialog({
  batchId,
  employees,
  onClose,
  onAdd,
  isPending,
}: {
  batchId: string;
  employees: Employee[];
  onClose: () => void;
  onAdd: (batchId: string, employeeIds: string[]) => void;
  isPending: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggle = (id: string) => { setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg rounded-xl border bg-background p-6 shadow-lg">
        <h2 className="text-lg font-semibold">Add Contractors to Session</h2>
        <div className="mt-4 max-h-64 space-y-2 overflow-y-auto">
          {employees.map((emp) => (
            <label key={emp.id} className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 hover:bg-accent">
              <input type="checkbox" checked={selected.has(emp.id)} onChange={() => toggle(emp.id)} className="h-4 w-4" />
              <div>
                <div className="text-sm font-medium">{emp.legalFirstName} {emp.legalLastName}</div>
                <div className="text-xs text-muted-foreground">{emp.employeeNumber} &middot; {emp.personalEmail ?? emp.workEmail ?? "No email"}</div>
              </div>
            </label>
          ))}
          {employees.length === 0 && <div className="py-4 text-center text-muted-foreground">No pre-hire employees available.</div>}
        </div>
        <div className="mt-4 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="h-10 rounded-md border px-4 text-sm hover:bg-accent">Cancel</button>
          <button type="button" onClick={() => onAdd(batchId, Array.from(selected))} disabled={isPending || selected.size === 0} className="h-10 rounded-md bg-primary px-4 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {isPending ? "Adding..." : `Add ${selected.size} Contractor${selected.size !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
