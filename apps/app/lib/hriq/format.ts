/**
 * Shared formatting utilities for the HRIQ dashboard.
 * Eliminates 100+ inline formatting patterns across pages.
 */

const PACIFIC_TZ = "America/Los_Angeles";

/**
 * Convert a bare datetime string (from DateTimePicker) to a proper UTC Date.
 * The picker outputs "2026-02-25T08:30" with NO timezone — this is always
 * intended as Pacific time. On Vercel (UTC server), new Date() would wrongly
 * treat it as UTC. This function correctly interprets it as Pacific.
 *
 * Returns a Date in UTC that represents the given Pacific wall-clock time.
 */
export function pacificToUtc(bareDatetime: string): Date {
  const match = bareDatetime.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return new Date(bareDatetime); // fallback

  const [, yr, mo, dy, hr, mi] = match;
  const y = +yr!, m = +mo!, d = +dy!, h = +hr!, mn = +mi!;

  // Try PST (UTC-8): wall clock h:mn Pacific = (h+8):mn UTC
  const pstUtc = new Date(Date.UTC(y, m - 1, d, h + 8, mn));
  // Verify: does formatting this UTC date back to Pacific give us the same hour?
  const checkHour = +new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC_TZ, hour: "numeric", hour12: false,
  }).format(pstUtc);

  if (checkHour === h) return pstUtc;

  // Must be PDT (UTC-7)
  return new Date(Date.UTC(y, m - 1, d, h + 7, mn));
}

/**
 * Convert a bare datetime string to a Zoom-compatible ISO string WITHOUT
 * the trailing Z. Zoom's API: if no Z, it uses the `timezone` field.
 * If Z is present, Zoom ignores the timezone and treats as UTC.
 *
 * Returns e.g. "2026-02-25T08:30:00" (pass with timezone: "America/Los_Angeles")
 */
export function pacificBareIso(bareDatetime: string): string {
  const match = bareDatetime.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return bareDatetime;
  return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:00`;
}

/**
 * Convert a UTC Date to a bare Pacific datetime string for DateTimePicker.
 * Inverse of pacificToUtc — formats the UTC date as Pacific wall-clock time
 * in the form "YYYY-MM-DDTHH:MM" (no timezone suffix).
 */
export function utcToPacificBare(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  // Handle midnight: Intl may return "24" for midnight in some locales
  const hr = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hr}:${get("minute")}`;
}

/**
 * Safely parse a datetime string, handling both:
 * - Proper UTC ISO strings ("2026-02-25T16:30:00.000Z")  parsed as-is
 * - Bare datetime strings ("2026-02-25T08:30")  treated as Pacific time
 * 
 * This prevents the common bug where bare strings from DateTimePicker
 * are misinterpreted as UTC on the server.
 */
export function smartParseDatetime(value: string): Date {
  if (!value) return new Date(NaN);
  // If it has Z, +offset, or -offset after the time portion, it's timezone-aware
  if (/Z$|[+-]\d{2}:\d{2}$/.test(value)) {
    return new Date(value);
  }
  // Bare datetime (from DateTimePicker) — treat as Pacific
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
    return pacificToUtc(value);
  }
  // Fallback (date-only or other formats)
  return new Date(value);
}

/** "Jan 5" — uses UTC to avoid timezone date-shift for date-only values */
export function shortDate(value: string | Date): string {
  return new Date(typeof value === "string" ? value : value.getTime()).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** "Jan 5, 2026" — uses UTC to avoid timezone date-shift for date-only values */
export function fullDate(value: string | Date): string {
  return new Date(typeof value === "string" ? value : value.getTime()).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** "Jan 5, 3:00 PM" */
export function dateTime(value: string | Date): string {
  return new Date(typeof value === "string" ? value : value.getTime()).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** "Jan 5, 2026 3:00 PM PT" — Pacific timezone aware */
export function pacificDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = new Date(typeof value === "string" ? value : (value as Date).getTime());
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    timeZone: PACIFIC_TZ,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }) + " PT";
}

/** "Jan 5 – Jan 20" date range (short) */
export function dateRange(start: string | Date, end: string | Date): string {
  return `${shortDate(start)} – ${shortDate(end)}`;
}

/** "Jan 5 – Jan 20, 2026" date range (full end) */
export function dateRangeFull(start: string | Date, end: string | Date): string {
  return `${shortDate(start)} – ${fullDate(end)}`;
}

/** "$1,234.56" — currency formatting */
export function money(amount: number | string, currency = "USD"): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (Number.isNaN(num)) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(num);
}

/** "1,234" — number with commas */
export function formatNumber(n: number | string): string {
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (Number.isNaN(num)) return "0";
  return num.toLocaleString();
}

/** "7h 30m" — hours display in hours and minutes (not decimal) */
export function hours(h: number | string): string {
  const num = typeof h === "string" ? parseFloat(h) : h;
  if (Number.isNaN(num) || num === 0) return "0h";
  const wholeHours = Math.floor(num);
  const minutes = Math.round((num - wholeHours) * 60);
  if (minutes === 60) return `${wholeHours + 1}h`;
  if (minutes === 0) return `${wholeHours}h`;
  if (wholeHours === 0) return `${minutes}m`;
  return `${wholeHours}h ${minutes}m`;
}

/** "7:30" — hours display in h:mm colon format (for timesheet inputs/tables) */
export function hoursColon(h: number | string): string {
  const num = typeof h === "string" ? parseFloat(h) : h;
  if (Number.isNaN(num) || num === 0) return "0:00";
  const wholeHours = Math.floor(num);
  const minutes = Math.round((num - wholeHours) * 60);
  return `${wholeHours}:${String(minutes).padStart(2, "0")}`;
}

/** Role display name */
const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  manager: "Manager",
  bookkeeper: "Bookkeeper",
  va: "VA",
  member: "Member",
};

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

/** Status badge color classes (bg + text for light/dark) */
export function statusColor(status: string): string {
  const s = status.toLowerCase();
  if (["active", "approved", "auto_approved", "completed", "paid", "signed"].includes(s))
    return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
  if (["pending", "submitted", "processing", "pending_review", "in_progress"].includes(s))
    return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
  if (["rejected", "failed", "terminated", "inactive", "cancelled", "overdue"].includes(s))
    return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
  if (["draft", "sent", "on_leave"].includes(s))
    return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
  return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
}

// ─── General Utils ────────────────────────────────────────────────────────────

/** Race a promise against a timeout, returning fallback on timeout. */
export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise.catch(() => fallback),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

/** Truncate a string to maxLen with ellipsis. */
export function truncate(s: string, maxLen: number): string {
  return s.length <= maxLen ? s : s.slice(0, maxLen - 1) + "…";
}
