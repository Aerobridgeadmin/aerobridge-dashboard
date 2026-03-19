"use client";

import { useState, useTransition, useEffect } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";

export type ImpactLine = {
  label: string;
  count: number;
  severity?: "normal" | "warn" | "critical";
};

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  title: string;
  /** Short description of what is being deleted */
  description: string;
  /** The items that will be affected */
  impactLines?: ImpactLine[];
  /** Names/emails of the entities being deleted */
  entityNames?: string[];
  /** Loading state for when the preview is being fetched */
  loading?: boolean;
  /** Error from preview fetch */
  error?: string | null;
  /** Label for the confirm button */
  confirmLabel?: string;
  /** Require typing to confirm (the text the user must type) */
  confirmText?: string;
};

export function DestructiveConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  impactLines,
  entityNames,
  loading = false,
  error = null,
  confirmLabel = "Delete Permanently",
  confirmText,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (!open) setTyped("");
  }, [open]);

  if (!open) return null;

  const needsTyping = confirmText && confirmText.length > 0;
  const canConfirm = !loading && !error && (!needsTyping || typed === confirmText);

  const nonZero = (impactLines ?? []).filter((l) => l.count > 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in duration-150"
      onClick={() => !isPending && onClose()}
    >
      <div
        className="w-full max-w-lg rounded-xl border bg-card p-6 shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold">{title}</h3>
              <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isPending}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Calculating impact...
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Entity names */}
        {entityNames && entityNames.length > 0 && !loading && (
          <div className="mt-4 max-h-24 overflow-y-auto rounded-lg border bg-muted/50 p-3">
            {entityNames.slice(0, 10).map((name, i) => (
              <div key={i} className="text-sm py-0.5">{name}</div>
            ))}
            {entityNames.length > 10 && (
              <div className="text-xs text-muted-foreground pt-1">...and {entityNames.length - 10} more</div>
            )}
          </div>
        )}

        {/* Impact lines */}
        {nonZero.length > 0 && !loading && (
          <div className="mt-4 space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
              The following will be permanently deleted:
            </p>
            {nonZero.map((line, i) => (
              <div
                key={i}
                className={`flex items-center justify-between rounded-md px-3 py-2 text-sm ${
                  line.severity === "critical"
                    ? "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 font-medium"
                    : line.severity === "warn"
                      ? "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300"
                      : "bg-muted/50 text-foreground"
                }`}
              >
                <span>{line.label}</span>
                <span className="font-mono tabular-nums">{line.count}</span>
              </div>
            ))}
          </div>
        )}

        {/* Type to confirm */}
        {needsTyping && !loading && !error && (
          <div className="mt-4">
            <p className="text-sm text-muted-foreground">
              Type <span className="font-mono font-semibold text-foreground">{confirmText}</span> to confirm:
            </p>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={confirmText}
              className="mt-2 h-9 w-full rounded-md border border-input bg-background px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-500"
              autoFocus
            />
          </div>
        )}

        {/* Actions */}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="h-9 rounded-md border px-4 text-sm hover:bg-accent disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canConfirm || isPending}
            onClick={() =>
              startTransition(async () => {
                await onConfirm();
              })
            }
            className="h-9 rounded-md bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
          >
            {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {isPending ? "Deleting..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
