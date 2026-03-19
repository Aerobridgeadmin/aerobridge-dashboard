"use client";
import { shortDate } from "@/lib/hriq/format";
import { useErrorDialog } from "@/app/(authenticated)/components/error-dialog";
import { submitTimesheet, getTimeDoctorEntriesForPeriod, requestTimesheetAdjustment } from "@/app/actions/hriq/timesheets";
import { useRouter } from "next/navigation";
// Save draft via API route (not a server action) so it doesn't re-run the layout/payment-gate check
async function saveDraft(data: { periodId: string; dailyEntries: Array<{ date: string; timeIn?: string; hours: number; minutes?: number; note?: string; tdHours?: number }>; notes?: string; bonuses?: Array<{ description: string; amount: number }> }) {
  await fetch("/api/timesheets/draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

// Parse hours from user input — supports decimal (8.5) and colon format (8:30)
function parseHoursInput(value: string): number {
  const v = value.trim();
  if (!v) return 0;
  // "8:30" or "8h30" or "8H30"
  const colonMatch = v.match(/^(\d{1,2})[h:H](\d{1,2})$/);
  if (colonMatch) {
    const h = parseInt(colonMatch[1], 10);
    const m = parseInt(colonMatch[2], 10);
    return h + m / 60;
  }
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

type TimesheetPeriod = { id: string; name: string; startDate: Date; endDate: Date; status: string };
type TimesheetSubmission = { id: string; status: string; totalHours: any; mondayHours: any; tuesdayHours: any; wednesdayHours: any; thursdayHours: any; fridayHours: any; saturdayHours: any; sundayHours: any; mondayStart: string | null; tuesdayStart: string | null; wednesdayStart: string | null; thursdayStart: string | null; fridayStart: string | null; saturdayStart: string | null; sundayStart: string | null; notes: string | null; submittedAt: Date | null; approvedAt: Date | null; rejectionReason: string | null; dailyEntries?: any; adjustmentStatus?: string | null; adjustmentNote?: string | null };

import { useState, useMemo, useCallback, useEffect, useRef } from "react";

function to12h(time: string): string {
  if (!time || !time.includes(":")) return "";
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return "";
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function parseTimeInput(raw: string): string {
  const s = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return "";
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am?|pm?)?$/);
  if (!m) return "";
  let h = Number.parseInt(m[1], 10);
  const min = m[2] ? Number.parseInt(m[2], 10) : 0;
  const ampm = m[3];
  if (h > 23 || min > 59) return "";
  if (ampm) {
    if (h > 12) return "";
    if (ampm.startsWith("p") && h !== 12) h += 12;
    if (ampm.startsWith("a") && h === 12) h = 0;
  }
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function TimeInput({ value, onChange, onCommit, disabled }: { value: string; onChange: (val: string) => void; onCommit?: (val: string) => void; disabled?: boolean }) {
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const displayVal = focused ? text : (value ? to12h(value) : "");
  return (
    <input
      type="text"
      disabled={disabled}
      value={displayVal}
      placeholder="9am"
      onChange={(e) => setText(e.target.value)}
      onFocus={() => { setFocused(true); setText(value ? to12h(value) : ""); }}
      onBlur={() => {
        setFocused(false);
        const parsed = parseTimeInput(text);
        const committed = parsed || (text.trim() ? value : "");
        if (parsed) onChange(parsed);
        else if (!text.trim()) onChange("");
        setText("");
        onCommit?.(committed);
      }}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
      className="h-8 w-full rounded border border-input bg-background px-1.5 text-center text-xs tabular-nums placeholder:text-muted-foreground/40 focus:ring-1 focus:ring-primary focus:border-primary focus:outline-none"
    />
  );
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  submitted: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300",
  approved: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300",
  auto_approved: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type TimesheetWithPeriod = TimesheetSubmission & { period: TimesheetPeriod };
type BonusEntry = { description: string; amount: number };

function fmt(h: number): string {
  if (h === 0) return "0:00";
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${hrs}:${String(mins).padStart(2, "0")}`;
}

function getPeriodDates(startDate: Date, endDate: Date) {
  const dates: { date: string; dayName: string; dayShort: string; isWeekend: boolean; display: string }[] = [];
  const start = new Date(startDate as any);
  const end = new Date(endDate as any);
  const current = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const endTime = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());

  while (current.getTime() <= endTime) {
    const dow = current.getUTCDay();
    dates.push({
      date: current.toISOString().split("T")[0],
      dayName: DAY_NAMES[dow],
      dayShort: DAY_SHORT[dow],
      isWeekend: dow === 0 || dow === 6,
      display: `${current.getUTCMonth() + 1}/${current.getUTCDate()}/${current.getUTCFullYear()}`,
    });
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

export function TimesheetForm({
  timesheets,
  openPeriods: serverOpenPeriods,
  hourlyRate,
  currency,
  timeDoctorEmail,
}: {
  timesheets: TimesheetWithPeriod[];
  openPeriods: TimesheetPeriod[];
  dailyTarget?: number;
  hourlyRate?: number;
  currency?: string;
  timeDoctorEmail?: string;
}) {
  const [submitting, setSubmitting] = useState(false);
  const { showError, showSuccess } = useErrorDialog();
  const router = useRouter();

  const [selectedPeriod, setSelectedPeriod] = useState("");
  const [notes, setNotes] = useState("");
  // Original Time Doctor hours per day — used to detect manual edits that require notes
  const [tdBaseline, setTdBaseline] = useState<Record<string, number>>({});
  // Refs so save callbacks always read latest values without stale closures
  const selectedPeriodRef = useRef(selectedPeriod);
  const notesRef = useRef(notes);
  const bonusesRef = useRef<Array<{ description: string; amount: number }>>([]);
  const entriesRef = useRef<Record<string, { timeIn: string; hours: number; note: string }>>({});
  const tdBaselineRef = useRef<Record<string, number>>({});
  useEffect(() => { selectedPeriodRef.current = selectedPeriod; }, [selectedPeriod]);
  useEffect(() => { notesRef.current = notes; }, [notes]);
  useEffect(() => { tdBaselineRef.current = tdBaseline; }, [tdBaseline]);

  // Helper: attach tdHours from baseline to daily entries for draft/submit
  const attachTdHours = useCallback((dailyEntries: Array<{ date: string; timeIn?: string; hours: number; note?: string; minutes?: number }>) => {
    const bl = tdBaselineRef.current;
    return dailyEntries.map((e) => bl[e.date] != null ? { ...e, tdHours: bl[e.date] } : e);
  }, []);

  // Save current draft state (reads from refs — safe to call from any callback)
  const saveCurrentDraft = useCallback(() => {
    const periodId = selectedPeriodRef.current;
    if (!periodId) return;
    const dailyEntries = attachTdHours(
      Object.entries(entriesRef.current)
        .filter(([, e]) => e.hours > 0 || e.timeIn || e.note)
        .map(([d, e]) => ({ date: d, timeIn: e.timeIn || undefined, hours: e.hours, note: e.note || undefined }))
    );
    setSaveStatus("saving");
    saveDraft({ periodId, dailyEntries, notes: notesRef.current || undefined, bonuses: bonusesRef.current.filter((b) => b.description && b.amount > 0) })
      .then(() => { setSaveStatus("saved"); setTimeout(() => setSaveStatus("idle"), 2000); })
      .catch(() => setSaveStatus("error"));
  }, [attachTdHours]);

  const triggerSave = useCallback((nextEntries: Record<string, { timeIn: string; hours: number; note: string }>) => {
    const periodId = selectedPeriodRef.current;
    if (!periodId) return;
    const dailyEntries = attachTdHours(
      Object.entries(nextEntries)
        .filter(([, e]) => e.hours > 0 || e.timeIn || e.note)
        .map(([d, e]) => ({ date: d, timeIn: e.timeIn || undefined, hours: e.hours, note: e.note || undefined }))
    );
    if (dailyEntries.length === 0) return; // nothing to save yet
    setSaveStatus("saving");
    saveDraft({ periodId, dailyEntries, notes: notesRef.current || undefined, bonuses: bonusesRef.current.filter((b) => b.description && b.amount > 0) })
      .then(() => { setSaveStatus("saved"); setTimeout(() => setSaveStatus("idle"), 2000); })
      .catch(() => setSaveStatus("error"));
  }, [attachTdHours]);

  // Auto-select best open period on mount
  useEffect(() => {
    if (selectedPeriod || serverOpenPeriods.length === 0) return;
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }); // YYYY-MM-DD in PST

    // 1. Try to find the period we're currently IN (today between start and end)
    const current = serverOpenPeriods.find((p) => {
      const start = new Date(p.startDate as any).toISOString().split("T")[0];
      const end = new Date(p.endDate as any).toISOString().split("T")[0];
      return today >= start && today <= end;
    });
    if (current) { setSelectedPeriod(current.id); return; }

    // 2. Pick the period whose end date is closest to today (past or future)
    //    This ensures we default to the current payout cycle, not a far-future one
    const sorted = [...serverOpenPeriods].sort((a, b) => {
      const aEnd = Math.abs(Date.now() - new Date(a.endDate as any).getTime());
      const bEnd = Math.abs(Date.now() - new Date(b.endDate as any).getTime());
      return aEnd - bEnd;
    });
    setSelectedPeriod(sorted[0]?.id ?? "");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [bonuses, setBonuses] = useState<BonusEntry[]>([]);
  const bonusTotal = bonuses.reduce((s, b) => s + (b.amount || 0), 0);

  const selectedPeriodObj = serverOpenPeriods.find((p) => p.id === selectedPeriod);

  // ─── Submission window logic ─────────────────────────────────────────────
  // Contractors can ONLY submit on the period end date (10th or 25th) before 11:59 PM PST.
  // After midnight PST, the window closes.
  const submissionWindow = useMemo(() => {
    if (!selectedPeriodObj) return { canSubmit: false, reason: "No period selected" };
    // "today" uses PST so the cutoff matches 11:59 PM PST, not UTC midnight
    // Period dates use toISOString() because they are calendar dates stored at midnight UTC
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
    const endDate = new Date(selectedPeriodObj.endDate as any).toISOString().split("T")[0];
    const startDate = new Date(selectedPeriodObj.startDate as any).toISOString().split("T")[0];
    if (today < startDate) return { canSubmit: false, reason: "Period hasn't started yet" };
    if (today < endDate) return { canSubmit: false, reason: `Opens on ${endDate.replace(/-/g, "/")} (last day of period)` };
    if (today === endDate) return { canSubmit: true, reason: "Submit before 11:59 PM PST tonight" };
    // today > endDate
    return { canSubmit: false, reason: "Submission deadline has passed" };
  }, [selectedPeriodObj]);

  const periodEnded = submissionWindow.canSubmit;

  // ─── Editing lock: disable inputs if timesheet is already submitted/approved ──
  const existingSubmission = timesheets.find((t) => t.period.id === selectedPeriod);
  const isLocked = existingSubmission
    ? ["submitted", "approved", "auto_approved"].includes(existingSubmission.status)
    : false;
  const hasPendingAdjustment = existingSubmission?.adjustmentStatus === "requested";

  const [adjustmentNote, setAdjustmentNote] = useState("");
  const [requestingAdjustment, setRequestingAdjustment] = useState(false);

  const handleRequestAdjustment = async () => {
    if (!existingSubmission || !adjustmentNote.trim()) return;
    setRequestingAdjustment(true);
    try {
      const result = await requestTimesheetAdjustment(existingSubmission.id, adjustmentNote);
      if ("error" in result) throw new Error(result.error);
      showSuccess("Adjustment request sent to admin for approval");
      setAdjustmentNote("");
      router.refresh();
    } catch (err: any) {
      showError(err.message || "Failed to request adjustment");
    } finally {
      setRequestingAdjustment(false);
    }
  };

  const periodDates = useMemo(
    () => selectedPeriodObj ? getPeriodDates(selectedPeriodObj.startDate, selectedPeriodObj.endDate) : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedPeriodObj?.id]
  );

  // entries: timeIn (optional) + payable hours + day note
  const [entries, setEntries] = useState<Record<string, { timeIn: string; hours: number; note: string }>>({});
  // Sync refs for bonuses and entries (declared above, ref'd for stable save callbacks)
  useEffect(() => { bonusesRef.current = bonuses; }, [bonuses]);
  useEffect(() => { entriesRef.current = entries; }, [entries]);
  // raw string values for hours inputs so free typing isn't interrupted
  const [rawHours, setRawHours] = useState<Record<string, string>>({});
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [tdLoading, setTdLoading] = useState(false);

  const handleFillFromTD = async () => {
    if (!selectedPeriod || tdLoading) return;
    setTdLoading(true);
    try {
      const result = await getTimeDoctorEntriesForPeriod(selectedPeriod);
      if ("error" in result) {
        showError(result.error);
        return;
      }

      // Build the TD entries eagerly (outside setState) so we can save them directly
      // Use minutes from TD (rounded from seconds) as the source of truth for h:mm display.
      // Derive decimal hours from minutes so we don't lose minute-level precision.
      const tdEntries: Record<string, { timeIn: string; hours: number; minutes: number; note: string }> = {};
      const tdRaw: Record<string, string> = {};
      for (const e of result.entries) {
        if (e.minutes <= 0 && e.hours <= 0) continue;
        // Derive hours from minutes for accurate minute-boundary storage
        const totalMinutes = e.minutes ?? Math.floor(e.hours * 60);
        const hours = Math.round((totalMinutes / 60) * 1e6) / 1e6; // clean decimal, no repeating
        const wholeH = Math.floor(totalMinutes / 60);
        const mins = totalMinutes % 60;
        tdEntries[e.date] = { timeIn: e.timeIn ?? "", hours, minutes: totalMinutes, note: "" };
        tdRaw[e.date] = `${wholeH}:${String(mins).padStart(2, "0")}`;
      }

      const importedCount = Object.keys(tdEntries).length;
      if (importedCount === 0) {
        showError("No Time Doctor entries found for this period.");
        return;
      }

      // Store the TD baseline so we can detect manual edits later
      const baseline: Record<string, number> = {};
      for (const [date, entry] of Object.entries(tdEntries)) {
        baseline[date] = entry.hours;
      }
      setTdBaseline(baseline);
      tdBaselineRef.current = baseline;

      // Merge into state — preserve existing notes
      setEntries((prev) => {
        const next = { ...prev };
        for (const [date, entry] of Object.entries(tdEntries)) {
          next[date] = { timeIn: entry.timeIn, hours: entry.hours, note: prev[date]?.note ?? "" };
        }
        return next;
      });
      setRawHours((prev) => ({ ...prev, ...tdRaw }));

      showSuccess(`Imported ${importedCount} day${importedCount === 1 ? "" : "s"} from Time Doctor.`);

      // Save draft directly — don't rely on triggerSave which needs React state
      // Include minutes so the server can compute totalHours from integer arithmetic
      // Include tdHours so the baseline persists across page reloads
      const dailyEntries = Object.entries(tdEntries)
        .filter(([, e]) => e.hours > 0 || e.timeIn)
        .map(([d, e]) => ({ date: d, timeIn: e.timeIn || undefined, hours: e.hours, minutes: e.minutes, note: e.note || undefined, tdHours: e.hours }));
      setSaveStatus("saving");
      saveDraft({ periodId: selectedPeriod, dailyEntries, notes: notesRef.current || undefined, bonuses: bonusesRef.current.filter((b) => b.description && b.amount > 0) })
        .then(() => { setSaveStatus("saved"); setTimeout(() => setSaveStatus("idle"), 2000); })
        .catch(() => setSaveStatus("error"));
    } finally {
      setTdLoading(false);
    }
  };

  // Prefill from existing submission when period changes (draft/rejected for editing, submitted/approved for read-only display)
  const [didPrefill, setDidPrefill] = useState<string | null>(null);
  useEffect(() => {
    if (!selectedPeriod || periodDates.length === 0) return;
    const prefill = timesheets.find(
      (t) => t.period.id === selectedPeriod && ["draft", "rejected", "submitted", "approved", "auto_approved"].includes(t.status)
    );
    if (!prefill || prefill.id === didPrefill) return;

    const init: Record<string, { timeIn: string; hours: number; note: string }> = {};
    const initRaw: Record<string, string> = {};
    const initBaseline: Record<string, number> = {};
    if (Array.isArray(prefill.dailyEntries) && prefill.dailyEntries.length > 0) {
      for (const e of prefill.dailyEntries as any[]) {
        if (e.hours > 0 || e.timeIn || e.note) {
          init[e.date] = { timeIn: e.timeIn || "", hours: e.hours || 0, note: e.note || "" };
          if (e.hours > 0) initRaw[e.date] = fmt(e.hours);
        }
        // Restore TD baseline if it was stored
        if (e.tdHours != null) initBaseline[e.date] = Number(e.tdHours);
      }
    }
    setEntries(init);
    setRawHours(initRaw);
    setTdBaseline(initBaseline);
    tdBaselineRef.current = initBaseline;
    setNotes(prefill.notes || "");
    // Restore bonuses saved in draft
    const prefillBonuses = Array.isArray((prefill as any).bonuses) ? (prefill as any).bonuses as BonusEntry[] : [];
    setBonuses(prefillBonuses.length > 0 ? prefillBonuses : []);
    setDidPrefill(prefill.id);
  }, [selectedPeriod, periodDates.length, timesheets, didPrefill]);

  const handlePeriodChange = useCallback((id: string) => {
    setSelectedPeriod(id);
    setEntries({});
    setRawHours({});
    setBonuses([]);
    setTdBaseline({});
    tdBaselineRef.current = {};
    setDidPrefill(null);
  }, []);

  const updateTimeIn = useCallback((date: string, val: string) => {
    setEntries((prev) => ({ ...prev, [date]: { ...prev[date] ?? { hours: 0, note: "" }, timeIn: val } }));
  }, []);

  const commitTimeIn = useCallback((date: string, val: string) => {
    setEntries((prev) => {
      const next = { ...prev, [date]: { ...prev[date] ?? { hours: 0, note: "" }, timeIn: val } };
      triggerSave(next);
      return next;
    });
  }, [triggerSave]);

  const updateNote = useCallback((date: string, val: string) => {
    setEntries((prev) => ({ ...prev, [date]: { ...prev[date] ?? { timeIn: "", hours: 0 }, note: val } }));
  }, []);

  const commitNote = useCallback((date: string, val: string) => {
    setEntries((prev) => {
      const next = { ...prev, [date]: { ...prev[date] ?? { timeIn: "", hours: 0 }, note: val } };
      triggerSave(next);
      return next;
    });
  }, [triggerSave]);

  const updateHours = useCallback((date: string, value: string) => {
    setRawHours((prev) => ({ ...prev, [date]: value }));
  }, []);

  const commitHours = useCallback((date: string, value: string) => {
    const n = parseHoursInput(value);
    const clamped = Math.min(n, 24);
    const rounded = Math.round(clamped * 60) / 60;
    setEntries((prev) => {
      const next = { ...prev, [date]: { ...prev[date] ?? { timeIn: "", note: "" }, hours: rounded } };
      triggerSave(next);
      return next;
    });
    setRawHours((prev) => ({ ...prev, [date]: rounded > 0 ? fmt(rounded) : "" }));
  }, [triggerSave]);

  const total = useMemo(
    () => periodDates.reduce((sum, d) => sum + (entries[d.date]?.hours || 0), 0),
    [entries, periodDates]
  );

  // Count days where hours were changed from TD but no note was provided
  const tdEditsMissingNotes = useMemo(() => {
    if (Object.keys(tdBaseline).length === 0) return 0;
    return periodDates.filter((d) => {
      const bl = tdBaseline[d.date];
      if (bl == null) return false;
      const entry = entries[d.date];
      const currentHours = entry?.hours ?? 0;
      return Math.round(currentHours * 60) !== Math.round(bl * 60) && !(entry?.note?.trim());
    }).length;
  }, [entries, periodDates, tdBaseline]);

  const estimatedPay = hourlyRate ? total * hourlyRate + bonusTotal : null;

  // Periods with rejected submissions must be shown so the contractor can resubmit
  const rejectedPeriodIds = new Set(
    timesheets.filter((t) => t.status === "rejected").map((t) => t.period.id)
  );

  // Only show the period that contains today (or nearest open period), plus any rejected ones
  const displayPeriods = (() => {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }); // YYYY-MM-DD in PST
    const inRange = serverOpenPeriods.filter((p) => {
      if (p.status !== "open" && p.status !== "active") return false;
      const start = new Date(p.startDate as any).toISOString().split("T")[0];
      const end = new Date(p.endDate as any).toISOString().split("T")[0];
      return today >= start && today <= end;
    });
    const base = inRange.length > 0
      ? inRange
      : serverOpenPeriods.filter((p) => p.status === "open" || p.status === "active").slice(0, 1);
    // Also include any open periods that have rejected submissions (for resubmission)
    const rejectedPeriods = serverOpenPeriods.filter(
      (p) => rejectedPeriodIds.has(p.id) && !base.some((b) => b.id === p.id)
    );
    return [...base, ...rejectedPeriods];
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPeriod || total === 0) return;

    // Validate: if hours were changed from Time Doctor, the day note is required
    const hasTdData = Object.keys(tdBaseline).length > 0;
    if (hasTdData) {
      const missingNotes: string[] = [];
      for (const d of periodDates) {
        const entry = entries[d.date];
        const bl = tdBaseline[d.date];
        if (bl == null) continue; // no TD data for this day
        const currentHours = entry?.hours ?? 0;
        // Compare rounded to nearest minute to avoid float precision issues
        if (Math.round(currentHours * 60) !== Math.round(bl * 60) && !(entry?.note?.trim())) {
          missingNotes.push(`${d.display} (${d.dayShort})`);
        }
      }
      if (missingNotes.length > 0) {
        showError({
          title: "Notes required for edited days",
          message: `You changed hours from what Time Doctor recorded on: ${missingNotes.join(", ")}. Please add a note for each edited day explaining the change.`,
        });
        return;
      }
    }

    setSubmitting(true);
    try {
      const dailyEntries = attachTdHours(
        periodDates
          .map((d) => ({ date: d.date, timeIn: entries[d.date]?.timeIn || undefined, hours: entries[d.date]?.hours || 0, note: entries[d.date]?.note || undefined }))
          .filter((e) => e.hours > 0 || e.timeIn || e.note)
      );

      const result = await submitTimesheet({
        periodId: selectedPeriod,
        dailyEntries,
        notes: notes || undefined,
        bonuses: bonuses.filter((b) => b.description && b.amount > 0),
      });
      if (result && "error" in result) throw new Error(result.error);
      showSuccess("Timesheet submitted!");
      setEntries({});
      setRawHours({});
      setBonuses([]);
      setNotes("");
      setTdBaseline({});
      tdBaselineRef.current = {};
      setDidPrefill(null);
      router.refresh();
    } catch (err: any) {
      showError(err.message || "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  };

  const addBonus = () => setBonuses([...bonuses, { description: "", amount: 0 }]);
  const removeBonus = (idx: number) => {
    const updated = bonuses.filter((_, i) => i !== idx);
    setBonuses(updated);
    // Sync ref immediately so saveCurrentDraft reads the latest value
    bonusesRef.current = updated;
    // Defer save slightly so React state is settled
    setTimeout(() => saveCurrentDraft(), 0);
  };
  const updateBonus = (idx: number, field: "description" | "amount", value: any) => {
    const updated = [...bonuses];
    updated[idx] = { ...updated[idx], [field]: value };
    setBonuses(updated);
  };

  return (
    <div className="space-y-6 pb-32">
      <form onSubmit={handleSubmit} onKeyDown={(e) => { if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "BUTTON") e.preventDefault(); }}>
        <div className="rounded-xl border bg-card overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b flex flex-col sm:flex-row sm:items-center gap-3 bg-muted/20">
            <div className="flex-1 min-w-0 space-y-0.5">
              <label className="text-xs font-medium text-muted-foreground">Pay Period</label>
              {selectedPeriodObj ? (
                <p className="text-sm font-medium">
                  {`${selectedPeriodObj.name} (${shortDate(selectedPeriodObj.startDate)} – ${shortDate(selectedPeriodObj.endDate)})`}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">No open periods.</p>
              )}
            </div>
            <div className="flex items-center gap-2 self-start sm:self-auto">
              {saveStatus === "saving" && (
                <span className="text-[10px] text-muted-foreground animate-pulse">Saving...</span>
              )}
              {saveStatus === "saved" && (
                <span className="text-[10px] text-green-600 dark:text-green-400 flex items-center gap-1">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  Timesheet saved
                </span>
              )}
              {saveStatus === "error" && (
                <span className="text-[10px] text-red-500">Save failed</span>
              )}
              <button
                type="button"
                onClick={() => { setEntries({}); setRawHours({}); setTdBaseline({}); tdBaselineRef.current = {}; }}
                className="h-7 rounded-md border px-2.5 text-[10px] font-medium text-muted-foreground hover:bg-accent transition-colors"
              >
                Clear
              </button>
              {selectedPeriod && (
                <button
                  type="button"
                  onClick={handleFillFromTD}
                  disabled={tdLoading}
                  className="h-7 rounded-md border border-blue-300 bg-blue-50 px-2.5 text-[10px] font-medium text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-950/70 disabled:opacity-50 transition-colors"
                >
                  {tdLoading ? "Fetching..." : "Fill from Time Doctor"}
                </button>
              )}
            </div>
          </div>

          {/* Date Table */}
          {periodDates.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-muted/30">
                    <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground w-28">Date</th>
                    <th className="px-2 py-2 text-left text-[10px] font-medium text-muted-foreground w-14">Day</th>
                    <th className="px-2 py-2 text-center text-[10px] font-medium text-muted-foreground w-24">In</th>
                    <th className="px-2 py-2 text-center text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/20 w-24">
                      Payable Time (hrs)
                    </th>
                    <th className="px-2 py-2 text-left text-[10px] font-medium text-muted-foreground">Day Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {periodDates.map((d) => {
                    const entry = entries[d.date] ?? { timeIn: "", hours: 0 };
                    const bl = tdBaseline[d.date];
                    const isModifiedFromTD = bl != null && Math.round((entry.hours ?? 0) * 60) !== Math.round(bl * 60);
                    const needsNote = isModifiedFromTD && !(entry.note?.trim());
                    return (
                      <tr key={d.date} className={`border-t border-border/40 ${d.isWeekend ? "bg-muted/10" : ""} ${isModifiedFromTD ? "bg-amber-50/40 dark:bg-amber-950/10" : ""}`}>
                        <td className="px-3 py-1.5 text-[11px] tabular-nums text-muted-foreground">{d.display}</td>
                        <td className="px-2 py-1.5">
                          <span className={`text-[11px] font-medium ${d.isWeekend ? "text-muted-foreground/50" : ""}`}>
                            {d.dayShort}
                          </span>
                          {d.isWeekend && <span className="ml-0.5 text-[8px] text-muted-foreground/40">WE</span>}
                        </td>
                        <td className="px-2 py-1">
                          <TimeInput value={entry.timeIn} onChange={(v) => updateTimeIn(d.date, v)} onCommit={(v) => commitTimeIn(d.date, v)} disabled={isLocked} />
                        </td>
                        <td className="px-2 py-1 bg-emerald-50/20 dark:bg-emerald-950/10">
                          <input
                            type="text"
                            inputMode="decimal"
                            disabled={isLocked}
                            value={rawHours[d.date] ?? (entry.hours > 0 ? fmt(entry.hours) : "")}
                            onChange={(e) => updateHours(d.date, e.target.value)}
                            onBlur={(e) => commitHours(d.date, e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitHours(d.date, (e.target as HTMLInputElement).value); (e.target as HTMLInputElement).blur(); } }}
                            placeholder="0:00 or 8:30"
                            className="h-8 w-full rounded border border-input bg-background px-2 text-center text-sm font-semibold tabular-nums placeholder:text-muted-foreground/30 focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 focus:outline-none"
                          />
                          {isModifiedFromTD && bl != null && (
                            <div className="mt-0.5 text-center text-[9px] text-amber-600 dark:text-amber-400" title="Original Time Doctor value">
                              TD: {fmt(bl)}
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-1 min-w-[200px]">
                          <input
                            type="text"
                            disabled={isLocked}
                            value={entry.note ?? ""}
                            onChange={(e) => updateNote(d.date, e.target.value)}
                            onBlur={(e) => commitNote(d.date, e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
                            placeholder={needsNote ? "Required — explain the change…" : "Optional note for this day…"}
                            maxLength={500}
                            className={`h-8 w-full rounded border px-2 text-xs text-foreground focus:ring-1 focus:outline-none ${
                              needsNote
                                ? "border-amber-400 bg-amber-50 dark:bg-amber-950/20 placeholder:text-amber-500/70 focus:ring-amber-500 focus:border-amber-500"
                                : "border-input bg-background placeholder:text-muted-foreground/30 focus:ring-primary focus:border-primary"
                            }`}
                          />
                          {needsNote && (
                            <div className="mt-0.5 text-[9px] text-amber-600 dark:text-amber-400">
                              Note required — hours changed from Time Doctor
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 bg-muted/20">
                    <td colSpan={4} className="px-3 py-2 text-right font-bold text-xs uppercase tracking-wide text-muted-foreground">
                      Total
                    </td>
                    <td className="px-2 py-2 text-center font-bold text-base tabular-nums text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20">
                      {fmt(total)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Bottom section */}
          <div className="px-4 py-4 border-t space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
              {/* Bonuses */}
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-medium text-muted-foreground">Bonuses / Commissions</span>
                  <button type="button" onClick={addBonus} className="h-6 rounded border px-2 text-[10px] font-medium hover:bg-accent">
                    + Add
                  </button>
                </div>
                {bonuses.length > 0 ? (
                  <div className="space-y-2">
                    {bonuses.map((bonus, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          value={bonus.description}
                          onChange={(e) => updateBonus(idx, "description", e.target.value)}
                          onBlur={saveCurrentDraft}
                          placeholder="Description"
                          className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                        />
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">$</span>
                          <input
                            type="number" min="0" step="0.01"
                            value={bonus.amount || ""}
                            onChange={(e) => updateBonus(idx, "amount", Number(e.target.value) || 0)}
                            onBlur={saveCurrentDraft}
                            placeholder="0.00"
                            className="h-9 w-24 rounded-md border border-input bg-background px-2 text-right text-sm tabular-nums"
                          />
                        </div>
                        <button type="button" onClick={() => removeBonus(idx)}
                          className="h-9 w-9 shrink-0 rounded-md border text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors text-xs">
                          ×
                        </button>
                      </div>
                    ))}
                    {bonusTotal > 0 && (
                      <div className="text-right text-sm font-medium text-orange-600 pr-12">
                        Bonus Total: ${bonusTotal.toFixed(2)}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Add any commissions, reimbursements, or bonuses for this period.</p>
                )}
              </div>

              {/* Pay Summary */}
              <div className="w-full sm:w-64 shrink-0">
                <table className="w-full border-collapse text-sm">
                  <tbody>
                    <tr>
                      <td className="border border-border px-3 py-2.5 font-semibold text-right">Payable Time</td>
                      <td className="border border-border bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2.5 text-right font-bold tabular-nums w-28">
                        {fmt(total)}
                      </td>
                    </tr>
                    {hourlyRate != null && hourlyRate > 0 && (
                      <>
                        <tr>
                          <td className="border border-border px-3 py-2.5 font-semibold text-right">Rate Per Hour</td>
                          <td className="border border-border bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2.5 text-right font-bold tabular-nums">
                            ${hourlyRate.toFixed(2)}
                          </td>
                        </tr>
                        <tr>
                          <td className="border border-border px-3 py-2.5 font-semibold text-right">Base Pay</td>
                          <td className="border border-border bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2.5 text-right font-bold tabular-nums">
                            ${(total * hourlyRate).toFixed(2)}
                          </td>
                        </tr>
                      </>
                    )}
                    {bonusTotal > 0 && (
                      <tr>
                        <td className="border border-border px-3 py-2.5 font-semibold text-right">Bonuses</td>
                        <td className="border border-border bg-orange-50 dark:bg-orange-950/30 px-3 py-2.5 text-right font-bold tabular-nums text-orange-600">
                          ${bonusTotal.toFixed(2)}
                        </td>
                      </tr>
                    )}
                    {estimatedPay !== null && (
                      <tr>
                        <td className="border border-border px-3 py-2.5 font-bold text-right">Total Pay</td>
                        <td className="border border-border bg-emerald-100 dark:bg-emerald-950/50 px-3 py-2.5 text-right font-bold tabular-nums text-emerald-700 dark:text-emerald-300 text-base">
                          ${estimatedPay.toFixed(2)}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Notes (optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={() => {
                  const periodId = selectedPeriodRef.current;
                  if (!periodId) return;
                  const dailyEntries = Object.entries(entries)
                    .filter(([, e]) => (e as { hours: number; timeIn: string }).hours > 0 || (e as { hours: number; timeIn: string }).timeIn)
                    .map(([d, e]) => { const entry = e as { hours: number; timeIn: string }; return { date: d, timeIn: entry.timeIn || undefined, hours: entry.hours }; });
                  if (dailyEntries.length === 0 && !notes) return;
                  setSaveStatus("saving");
                  saveDraft({ periodId, dailyEntries, notes: notes || undefined, bonuses: bonusesRef.current.filter((b) => b.description && b.amount > 0) })
                    .then(() => { setSaveStatus("saved"); setTimeout(() => setSaveStatus("idle"), 2000); })
                    .catch(() => setSaveStatus("error"));
                }}
                rows={2}
                placeholder="Any notes — projects worked on, PTO, etc."
                className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>

            {/* ─── Locked: Adjustment Request ──────────────────────────── */}
            {isLocked && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4 space-y-3">
                <div className="text-xs font-medium text-amber-800 dark:text-amber-300">
                  This timesheet has been {existingSubmission?.status === "submitted" ? "submitted" : "approved"}. Hours and times are locked.
                </div>
                {/* Show submitted notes so they're visible after returning */}
                {existingSubmission?.notes && (
                  <div className="text-xs text-muted-foreground bg-background/50 rounded-md px-3 py-2">
                    <span className="font-medium">Notes:</span> {existingSubmission.notes}
                  </div>
                )}
                {hasPendingAdjustment ? (
                  <div className="text-xs text-amber-700 dark:text-amber-400">
                    Adjustment request pending admin approval: <span className="italic">{existingSubmission?.adjustmentNote}</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">Need to make changes? Request an adjustment:</label>
                    <textarea
                      value={adjustmentNote}
                      onChange={(e) => setAdjustmentNote(e.target.value)}
                      placeholder="Explain what needs to change and why…"
                      rows={2}
                      maxLength={1000}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={handleRequestAdjustment}
                      disabled={requestingAdjustment || adjustmentNote.trim().length < 5}
                      className="h-8 rounded-md bg-amber-600 px-4 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                    >
                      {requestingAdjustment ? "Sending…" : "Request Adjustment"}
                    </button>
                  </div>
                )}
              </div>
            )}

            {tdEditsMissingNotes > 0 && !isLocked && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-4 py-3 flex items-start gap-2">
                <svg className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                <div className="text-xs text-amber-800 dark:text-amber-300">
                  <span className="font-semibold">{tdEditsMissingNotes} day{tdEditsMissingNotes > 1 ? "s" : ""} edited from Time Doctor without a note.</span> Please add a note for each day where you changed the hours to explain the reason.
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !selectedPeriod || total === 0 || !periodEnded || isLocked || tdEditsMissingNotes > 0}
              className="hidden sm:block w-full h-11 rounded-lg bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {isLocked ? "Locked — request adjustment above" : submitting ? "Submitting..." : !selectedPeriod ? "No open period" : !periodEnded ? submissionWindow.reason : tdEditsMissingNotes > 0 ? `Add notes to ${tdEditsMissingNotes} edited day${tdEditsMissingNotes > 1 ? "s" : ""} first` : `Submit ${fmt(total)} hrs for Approval`}
            </button>
          </div>
        </div>

        {/* Mobile sticky submit */}
        <div className={`fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur p-3 sm:hidden transition-transform ${total > 0 ? "translate-y-0" : "translate-y-full"}`}>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="text-xs text-muted-foreground">Total</div>
              <div className="text-lg font-bold tabular-nums">
                {fmt(total)}
                {estimatedPay !== null && <span className="text-green-600 ml-2 text-sm">${estimatedPay.toFixed(0)}</span>}
              </div>
              {tdEditsMissingNotes > 0 && <div className="text-[10px] text-amber-600">{tdEditsMissingNotes} day{tdEditsMissingNotes > 1 ? "s" : ""} need notes</div>}
            </div>
            <button
              type="submit"
              disabled={submitting || !selectedPeriod || total === 0 || !periodEnded || isLocked || tdEditsMissingNotes > 0}
              className="h-12 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isLocked ? "Locked" : submitting ? "Submitting..." : !periodEnded ? submissionWindow.reason : "Submit"}
            </button>
          </div>
        </div>
      </form>

      {/* History */}
      <div>
        <h2 className="text-lg font-bold mb-3">My Timesheet History</h2>
        <div className="space-y-3">
          {timesheets.map((ts) => {
            const tsTotal = Number(ts.totalHours);
            const tsBonuses = Array.isArray((ts as any).bonuses) ? (ts as any).bonuses as BonusEntry[] : [];
            const tsBonusTotal = Number((ts as any).bonusTotal ?? 0);
            const daily = Array.isArray((ts as any).dailyEntries) ? (ts as any).dailyEntries as { date: string; hours: number }[] : null;

            return (
              <div key={ts.id} className="rounded-xl border bg-card overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{ts.period.name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${STATUS_COLORS[ts.status] ?? ""}`}>
                        {ts.status.replace(/_/g, " ")}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {shortDate(ts.period.startDate)} – {shortDate(ts.period.endDate)}
                      {ts.submittedAt && ` · Submitted ${shortDate(ts.submittedAt)}`}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold tabular-nums">{fmt(tsTotal)}</div>
                    {tsBonusTotal > 0 && (
                      <div className="text-xs font-medium text-orange-500 tabular-nums">+${tsBonusTotal.toFixed(2)}</div>
                    )}
                  </div>
                </div>
                <div className="px-4 py-3 overflow-x-auto">
                  {daily && daily.length > 0 ? (
                    <table className="w-full border-collapse text-xs">
                      <thead>
                        <tr>
                          <th className="border border-border bg-muted/30 px-2 py-1.5 text-left font-medium text-muted-foreground">Date</th>
                          <th className="border border-border bg-muted/30 px-2 py-1.5 text-left font-medium text-muted-foreground">Day</th>
                          <th className="border border-border bg-muted/30 px-2 py-1.5 text-center font-medium text-muted-foreground">In</th>
                          <th className="border border-border bg-emerald-50/60 dark:bg-emerald-950/20 px-2 py-1.5 text-center font-semibold text-emerald-700 dark:text-emerald-300">
                            Payable Time
                          </th>
                          <th className="border border-border bg-muted/30 px-2 py-1.5 text-left font-medium text-muted-foreground">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {daily.filter((e: any) => e.hours > 0).map((e: any) => {
                          const dt = new Date(e.date + "T12:00:00Z");
                          const dow = dt.getUTCDay();
                          const isWe = dow === 0 || dow === 6;
                          return (
                            <tr key={e.date} className={isWe ? "bg-muted/10" : ""}>
                              <td className="border border-border px-2 py-1.5 tabular-nums text-muted-foreground">
                                {dt.getUTCMonth() + 1}/{dt.getUTCDate()}
                              </td>
                              <td className="border border-border px-2 py-1.5">
                                {DAY_SHORT[dow]}
                                {isWe && <span className="ml-1 text-[9px] text-muted-foreground">(WE)</span>}
                              </td>
                              <td className="border border-border px-2 py-1.5 text-center text-muted-foreground tabular-nums">
                                {e.timeIn ? to12h(e.timeIn) : "—"}
                              </td>
                              <td className="border border-border px-2 py-1.5 text-center font-bold tabular-nums">
                                {fmt(e.hours)}
                              </td>
                              <td className="border border-border px-2 py-1.5 text-muted-foreground">
                                {e.note || <span className="text-muted-foreground/30">—</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={4} className="border border-border bg-emerald-50/50 dark:bg-emerald-950/20 px-2 py-1.5 text-right font-bold">
                            Total
                          </td>
                          <td className="border border-border bg-emerald-50/50 dark:bg-emerald-950/20 px-2 py-1.5 text-center font-bold tabular-nums">
                            {fmt(tsTotal)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  ) : (
                    <table className="w-full border-collapse text-xs">
                      <thead>
                        <tr>
                          {DAY_SHORT.map((d) => (
                            <th key={d} className="border border-border bg-muted/30 px-2 py-1.5 text-center font-medium text-muted-foreground">{d}</th>
                          ))}
                          <th className="border border-border bg-emerald-50 dark:bg-emerald-950/30 px-2 py-1.5 text-center font-semibold text-emerald-700 dark:text-emerald-300">
                            Total
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          {[Number(ts.mondayHours), Number(ts.tuesdayHours), Number(ts.wednesdayHours), Number(ts.thursdayHours), Number(ts.fridayHours), Number(ts.saturdayHours), Number(ts.sundayHours)].map((h, idx) => (
                            <td key={idx} className={`border border-border px-2 py-2 text-center font-bold tabular-nums ${h > 0 ? "" : "text-muted-foreground/40"}`}>
                              {h > 0 ? fmt(h) : "—"}
                            </td>
                          ))}
                          <td className="border border-border bg-emerald-50/50 dark:bg-emerald-950/20 px-2 py-2 text-center font-bold tabular-nums">
                            {fmt(tsTotal)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  )}
                </div>
                {tsBonuses.length > 0 && (
                  <div className="px-4 pb-3 flex flex-wrap gap-1.5">
                    {tsBonuses.map((b, i) => (
                      <span key={i} className="inline-flex items-center gap-1 rounded-md bg-orange-50 px-2 py-0.5 text-xs text-orange-700 dark:bg-orange-950 dark:text-orange-300">
                        {b.description} <span className="font-medium">${b.amount}</span>
                      </span>
                    ))}
                  </div>
                )}
                {ts.status === "rejected" && (
                  <div className="mx-4 mb-3 space-y-2">
                    {ts.rejectionReason && (
                      <div className="rounded bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
                        Rejection reason: {ts.rejectionReason}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => handlePeriodChange(ts.period.id)}
                      className="h-7 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                    >
                      Edit & Resubmit
                    </button>
                  </div>
                )}
                {ts.status !== "rejected" && ts.rejectionReason && (
                  <div className="mx-4 mb-3 rounded bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
                    Rejection: {ts.rejectionReason}
                  </div>
                )}
              </div>
            );
          })}
          {timesheets.length === 0 && (
            <div className="rounded-xl border bg-card py-10 text-center text-muted-foreground">
              No timesheets submitted yet. Fill in the form above to get started!
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
