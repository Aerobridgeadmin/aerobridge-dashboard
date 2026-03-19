"use client";

import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import { useState, useTransition, useCallback, useEffect, type ReactNode } from "react";
import { DateTimePicker } from "@/app/(authenticated)/components/date-picker";
import { CustomSelect } from "@/app/(authenticated)/components/custom-select";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Attendee = {
  id: string;
  googleCalendarEventId: string | null;
  employee: {
    id: string;
    legalFirstName: string;
    legalLastName: string;
    personalEmail: string | null;
  };
};

type Batch = {
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
  onboardingSessions: Attendee[];
};

type Props = {
  batches: Batch[];
  orgSlug: string;
  isPending: boolean;
  deletingBatchId: string | null;
  formatDate: (d: Date) => string;
  onDeleteBatch: (id: string) => void;
  msgs: Record<string, string>;
  setMsgs: React.Dispatch<React.SetStateAction<Record<string, string>>>;
};

/* ------------------------------------------------------------------ */
/*  Draggable attendee pill                                            */
/* ------------------------------------------------------------------ */

function DraggableAttendee({
  attendee,
  orgSlug,
  isDragOverlay,
}: {
  attendee: Attendee;
  orgSlug: string;
  isDragOverlay?: boolean;
  key?: React.Key;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: attendee.id, data: { attendee } });

  const style = isDragOverlay
    ? undefined
    : {
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.3 : 1,
        transition: isDragging ? "opacity 150ms ease" : "transform 200ms ease, opacity 150ms ease",
      };

  return (
    <div
      ref={isDragOverlay ? undefined : setNodeRef}
      style={style}
      className={`group inline-flex items-center gap-1.5 rounded-full border bg-background pl-1.5 pr-3 py-1 text-xs transition-shadow ${
        isDragOverlay
          ? "shadow-lg ring-2 ring-primary/30 scale-105"
          : isDragging
            ? "cursor-grabbing"
            : "hover:shadow-sm"
      }`}
    >
      <button
        type="button"
        className={`flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground/60 transition-colors ${
          isDragOverlay ? "cursor-grabbing" : "cursor-grab hover:text-muted-foreground hover:bg-muted active:cursor-grabbing"
        }`}
        {...(isDragOverlay ? {} : { ...listeners, ...attributes })}
        tabIndex={-1}
      >
        <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
          <circle cx="2.5" cy="2" r="1.3" />
          <circle cx="7.5" cy="2" r="1.3" />
          <circle cx="2.5" cy="7" r="1.3" />
          <circle cx="7.5" cy="7" r="1.3" />
          <circle cx="2.5" cy="12" r="1.3" />
          <circle cx="7.5" cy="12" r="1.3" />
        </svg>
      </button>

      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[9px] font-bold text-primary">
        {attendee.employee.legalFirstName[0]}
        {attendee.employee.legalLastName[0]}
      </div>

      {isDragOverlay ? (
        <span className="font-medium">
          {attendee.employee.legalFirstName} {attendee.employee.legalLastName}
        </span>
      ) : (
        <Link
          href={`/${orgSlug}/employees/${attendee.employee.id}`}
          className="hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {attendee.employee.legalFirstName} {attendee.employee.legalLastName}
        </Link>
      )}

      {attendee.googleCalendarEventId && (
        <svg className="h-3 w-3 text-green-600 dark:text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 13l4 4L19 7" />
        </svg>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Details panel                                                      */
/* ------------------------------------------------------------------ */

function DetailsPanel({ batch }: { batch: Batch }) {
  const [open, setOpen] = useState(false);

  const hasDetails = batch.zoomMeetingId || batch.zoomJoinUrl || batch.zoomStartUrl || batch.calendarOrganizerEmail || batch.googleCalendarEventId;
  if (!hasDetails) return null;

  return (
    <div className="shrink-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
        Details
        <svg className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="mt-3 rounded-lg border bg-muted/30 p-3 text-xs space-y-2 animate-in fade-in slide-in-from-top-1 duration-150">
          {batch.calendarOrganizerEmail && (
            <div className="flex items-start gap-2">
              <span className="text-muted-foreground w-20 shrink-0">Calendar</span>
              <span className="break-all">{batch.calendarOrganizerEmail}</span>
            </div>
          )}
          {batch.googleCalendarEventId && (
            <div className="flex items-start gap-2">
              <span className="text-muted-foreground w-20 shrink-0">Event ID</span>
              <span className="font-mono text-[10px] break-all text-muted-foreground">{batch.googleCalendarEventId}</span>
            </div>
          )}
          {batch.zoomMeetingId && (
            <div className="flex items-start gap-2">
              <span className="text-muted-foreground w-20 shrink-0">Zoom ID</span>
              <span className="font-mono">{batch.zoomMeetingId}</span>
            </div>
          )}
          {batch.zoomJoinUrl && (
            <div className="flex items-start gap-2">
              <span className="text-muted-foreground w-20 shrink-0">Join URL</span>
              <a href={batch.zoomJoinUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline truncate max-w-[300px]">
                {batch.zoomJoinUrl.length > 50 ? batch.zoomJoinUrl.slice(0, 50) + "..." : batch.zoomJoinUrl}
              </a>
            </div>
          )}
          {batch.zoomStartUrl && (
            <div className="flex items-start gap-2">
              <span className="text-muted-foreground w-20 shrink-0">Host URL</span>
              <a href={batch.zoomStartUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline truncate max-w-[300px]">
                {batch.zoomStartUrl.length > 50 ? batch.zoomStartUrl.slice(0, 50) + "..." : batch.zoomStartUrl}
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Droppable batch card                                               */
/* ------------------------------------------------------------------ */

function DroppableBatchCard({ batch, children, isActive }: { batch: Batch; children?: ReactNode; isActive: boolean; key?: React.Key }) {
  const { setNodeRef, isOver } = useDroppable({ id: `batch-${batch.id}`, data: { batchId: batch.id } });

  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl border-2 bg-card p-5 transition-all duration-200 ${
        isOver ? "border-primary bg-primary/5 shadow-md ring-1 ring-primary/20"
          : isActive ? "border-dashed border-muted-foreground/30"
          : "border-transparent border-card"
      }`}
      style={{ borderWidth: "2px" }}
    >
      {children}
      {isOver && (
        <div className="mt-3 flex items-center justify-center rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 py-2 text-xs font-medium text-primary transition-all">
          <svg className="mr-1.5 h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Drop to move here
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

export function ZoomSessionsDnd({ batches: initialBatches, orgSlug, isPending, deletingBatchId, formatDate, onDeleteBatch, msgs, setMsgs }: Props) {
  const [activeAttendee, setActiveAttendee] = useState<Attendee | null>(null);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  // Optimistic local state so UI updates instantly without waiting for server
  const [localBatches, setLocalBatches] = useState<Batch[]>(initialBatches);
  // Reschedule state
  const [reschedulingBatch, setReschedulingBatch] = useState<Batch | null>(null);
  const [rescheduleLoading, setRescheduleLoading] = useState(false);

  // Sync from server when props change (after revalidation)
  useEffect(() => { setLocalBatches(initialBatches); }, [initialBatches]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const attendee = event.active.data.current?.attendee as Attendee | undefined;
    if (attendee) {
      setActiveAttendee(attendee);
      const source = localBatches.find((b) => b.onboardingSessions.some((os) => os.id === attendee.id));
      setActiveBatchId(source?.id ?? null);
    }
  }, [localBatches]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveAttendee(null);
    setActiveBatchId(null);
    if (!over) return;

    const sessionId = active.id as string;
    const targetBatchId = (over.data.current?.batchId as string) ?? null;
    if (!targetBatchId) return;

    const sourceBatch = localBatches.find((b) => b.onboardingSessions.some((os) => os.id === sessionId));
    if (!sourceBatch || sourceBatch.id === targetBatchId) return;

    const attendee = sourceBatch.onboardingSessions.find((os) => os.id === sessionId);
    const targetBatch = localBatches.find((b) => b.id === targetBatchId);
    if (!attendee || !targetBatch) return;

    // Optimistic UI update — move attendee instantly without waiting for server
    setLocalBatches((prev) => prev.map((b) => {
      if (b.id === sourceBatch.id) {
        return { ...b, onboardingSessions: b.onboardingSessions.filter((os) => os.id !== sessionId) };
      }
      if (b.id === targetBatchId) {
        return { ...b, onboardingSessions: [...b.onboardingSessions, attendee] };
      }
      return b;
    }));

    startTransition(async () => {
      try {
        const { moveAttendeeToEvent } = await import("@/app/actions/hriq/hiring");
        await moveAttendeeToEvent(sessionId, targetBatchId);
        setMsgs((prev) => ({ ...prev, [sourceBatch.id]: `Moved ${attendee.employee.legalFirstName} to ${targetBatch.title}` }));
      } catch (err) {
        // Revert optimistic update on error
        setLocalBatches(initialBatches);
        setMsgs((prev) => ({ ...prev, [sourceBatch.id]: `Error: ${err instanceof Error ? err.message : "Move failed"}` }));
      }
    });
  }, [localBatches, initialBatches, setMsgs]);

  const handleDragCancel = useCallback(() => { setActiveAttendee(null); setActiveBatchId(null); }, []);

  if (localBatches.length === 0) {
    return <div className="py-12 text-center text-sm text-muted-foreground">No events yet. Create one to schedule orientations.</div>;
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}>
      {localBatches.length > 1 && activeAttendee && (
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground animate-in fade-in slide-in-from-top-1 duration-150">
          <svg className="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
          </svg>
          Drop on another event to move <strong className="mx-0.5">{activeAttendee.employee.legalFirstName}</strong>
        </div>
      )}

      <div className="space-y-4">
        {localBatches.map((s) => (
          <DroppableBatchCard key={s.id} batch={s} isActive={!!activeAttendee && activeBatchId !== s.id}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold">{s.title}</h3>
                <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
                  {s.zoomMeetingDate && <span>{formatDate(s.zoomMeetingDate)}</span>}
                  <span>{s.zoomDuration} min</span>
                  <span>{s.onboardingSessions.length} attendee{s.onboardingSessions.length !== 1 ? "s" : ""}</span>
                </div>
              </div>
              <DetailsPanel batch={s} />
            </div>

            <div className="mt-3 flex gap-2">
              {s.zoomJoinUrl && (
                <a href={s.zoomJoinUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center rounded-md bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700">
                  Join
                </a>
              )}
              {s.zoomStartUrl && (
                <a href={s.zoomStartUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium hover:bg-accent">
                  Host
                </a>
              )}
              <button
                type="button"
                disabled={isPending || deletingBatchId === s.id}
                onClick={() => onDeleteBatch(s.id)}
                className="inline-flex h-8 items-center rounded-md border border-red-300 px-3 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950 disabled:opacity-50"
              >
                {deletingBatchId === s.id ? "Deleting..." : "Delete Event"}
              </button>
              <button
                type="button"
                disabled={isPending || rescheduleLoading}
                onClick={() => setReschedulingBatch(s)}
                className="inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium hover:bg-accent disabled:opacity-50"
              >
                Reschedule
              </button>
            </div>

            {msgs[s.id] && (
              <div className={`mt-2 rounded px-2 py-1 text-xs ${msgs[s.id]?.startsWith("Error") ? "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300" : "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300"}`}>
                {msgs[s.id]}
              </div>
            )}

            {s.onboardingSessions.length > 0 && (
              <div className="mt-4 border-t pt-3">
                <div className="flex flex-wrap gap-2">
                  {s.onboardingSessions.map((os) => (
                    <DraggableAttendee key={os.id} attendee={os} orgSlug={orgSlug} />
                  ))}
                </div>
              </div>
            )}
          </DroppableBatchCard>
        ))}
      </div>

      <DragOverlay dropAnimation={{ duration: 200, easing: "ease" }}>
        {activeAttendee ? <DraggableAttendee attendee={activeAttendee} orgSlug={orgSlug} isDragOverlay /> : null}
      </DragOverlay>

      {/* Reschedule Event Dialog */}
      {reschedulingBatch && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold">Reschedule Event</h2>
            <p className="text-sm text-muted-foreground mt-1">{reschedulingBatch.title}</p>
            {reschedulingBatch.zoomMeetingDate && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Current: {formatDate(reschedulingBatch.zoomMeetingDate)}
              </p>
            )}

            {/* Attendee confirmation */}
            {reschedulingBatch.onboardingSessions.length > 0 && (
              <div className="mt-3 rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-3 py-2">
                <p className="text-xs font-medium text-blue-700 dark:text-blue-300">
                  {reschedulingBatch.onboardingSessions.length} attendee{reschedulingBatch.onboardingSessions.length !== 1 ? "s" : ""} will be moved:
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {reschedulingBatch.onboardingSessions.map((os) => (
                    <span key={os.id} className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-900/50 px-2 py-0.5 text-[11px] font-medium text-blue-800 dark:text-blue-200">
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-200 dark:bg-blue-800 text-[8px] font-bold">
                        {os.employee.legalFirstName[0]}{os.employee.legalLastName[0]}
                      </span>
                      {os.employee.legalFirstName} {os.employee.legalLastName}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const newDate = fd.get("newZoomDate") as string;
              const newDuration = Number(fd.get("newDuration")) || reschedulingBatch.zoomDuration;
              if (!newDate) return;

              setRescheduleLoading(true);
              startTransition(async () => {
                try {
                  const { rescheduleBatchEvent } = await import("@/app/actions/hriq/hiring");
                  const result = await rescheduleBatchEvent(reschedulingBatch.id, newDate, newDuration);
                  setMsgs((prev) => ({ ...prev, [reschedulingBatch.id]: result.message || "Event rescheduled" }));
                  setReschedulingBatch(null);
                } catch (err) {
                  setMsgs((prev) => ({ ...prev, [reschedulingBatch.id]: `Error: ${err instanceof Error ? err.message : "Reschedule failed"}` }));
                } finally {
                  setRescheduleLoading(false);
                }
              });
            }} className="mt-4 space-y-4">
              <div>
                <label className="text-sm font-medium">New Date & Time</label>
                <DateTimePicker
                  name="newZoomDate"
                  required
                  min={new Date().toISOString().slice(0, 16)}
                  className="mt-1"
                />
                <p className="text-[10px] text-muted-foreground mt-1">Pacific Time</p>
              </div>
              <div>
                <label className="text-sm font-medium">Duration</label>
                <CustomSelect
                  name="newDuration"
                  defaultValue={String(reschedulingBatch.zoomDuration)}
                  triggerClassName="mt-1 h-10 w-full"
                  options={[
                    { value: "30", label: "30 min" },
                    { value: "45", label: "45 min" },
                    { value: "60", label: "60 min" },
                    { value: "90", label: "90 min" },
                  ]}
                />
              </div>

              <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2">
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  The Zoom meeting will be rescheduled, calendar invites updated, and all {reschedulingBatch.onboardingSessions.length} attendee{reschedulingBatch.onboardingSessions.length !== 1 ? "s" : ""} will receive updated notifications.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setReschedulingBatch(null)} disabled={rescheduleLoading} className="h-9 rounded-md border px-4 text-sm hover:bg-accent disabled:opacity-50">
                  Cancel
                </button>
                <button type="submit" disabled={rescheduleLoading} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                  {rescheduleLoading ? "Rescheduling..." : "Confirm Reschedule"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DndContext>
  );
}
