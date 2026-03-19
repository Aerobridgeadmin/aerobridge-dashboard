/**
 * Shared UI constants for consistent styling across the app.
 *
 * Single source of truth for status badge colors, semantic action colors,
 * and common UI patterns. Import these instead of defining per-file.
 */

// ─── Status Badge Colors ───────────────────────────────────────────────────────
// Used for: payment status, timesheet status, document status, etc.
// Pattern: light bg + dark text for light mode, transparent bg + lighter text for dark mode

export const STATUS_COLORS: Record<string, string> = {
  // Positive / complete
  completed: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
  approved: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
  auto_approved: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
  verified: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
  active: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
  paid: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",

  // Pending / awaiting action
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300",
  submitted: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300",
  pending_review: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300",
  sent: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300",

  // In progress / processing
  processing: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300",
  in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300",
  onboarding_in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300",
  onboarding_scheduled: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300",
  pre_hire: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300",

  // Negative / error
  failed: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300",
  overdue: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300",

  // Neutral / inactive
  draft: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  cancelled: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  void: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  offboarded: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  not_started: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

/** Get status badge classes with fallback */
export function getStatusColor(status: string): string {
  return STATUS_COLORS[status] ?? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
}

// ─── Semantic Action Colors ────────────────────────────────────────────────────
// For buttons: use green for positive, red for destructive, blue for info actions

export const ACTION_COLORS = {
  /** Primary positive action (Approve, Mark Paid, Confirm) */
  positive: "bg-green-600 text-white hover:bg-green-700 disabled:opacity-50",
  /** Positive outline (secondary positive action) */
  positiveOutline: "border border-green-300 dark:border-green-700 text-green-700 dark:text-green-300 hover:bg-green-50 dark:hover:bg-green-950/30 disabled:opacity-50",
  /** Destructive action (Delete, Reject, Remove) */
  destructive: "bg-red-600 text-white hover:bg-red-700 disabled:opacity-50",
  /** Destructive outline */
  destructiveOutline: "border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50",
  /** Info action (Submit, Process) */
  info: "bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50",
  /** Neutral action (Cancel, Skip) */
  neutral: "border hover:bg-accent disabled:opacity-50",
} as const;
