"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { LockKeyholeIcon, Loader2Icon, XIcon, ShieldAlertIcon } from "lucide-react";

type ManagementPasswordDialogProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: (password: string) => Promise<void>;
  title?: string;
  description?: string;
};

/**
 * A dialog that prompts for the management password before executing
 * sensitive financial operations (payouts, pay run approval, etc).
 */
export function ManagementPasswordDialog({
  open,
  onClose,
  onConfirm,
  title = "Management Authorization Required",
  description = "Enter the management password to authorize this financial operation.",
}: ManagementPasswordDialogProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setPassword("");
      setError(null);
      setLoading(false);
      // Auto-focus the input
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const handleSubmit = useCallback(async () => {
    if (!password.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      await onConfirm(password);
      setPassword("");
    } catch (err: any) {
      const msg = err?.message ?? "Invalid management password";
      setError(msg.includes("HRIQ-0851") ? "Invalid management password" : msg);
      setPassword("");
      inputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  }, [password, loading, onConfirm]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-xl border bg-background shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
            <ShieldAlertIcon className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold">{title}</h2>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-50"
            aria-label="Close"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-400">
              <LockKeyholeIcon className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Management Password
            </label>
            <input
              ref={inputRef}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              placeholder="Enter password"
              disabled={loading}
              autoComplete="off"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !password.trim()}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2Icon className="h-4 w-4 animate-spin" />
                Verifying...
              </>
            ) : (
              <>
                <LockKeyholeIcon className="h-4 w-4" />
                Authorize
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Hook to manage the management password flow.
 * Returns a password dialog element and a function to request authorization.
 *
 * Usage:
 *   const { passwordDialog, requestAuthorization } = useManagementAuth();
 *
 *   async function handlePayout() {
 *     const password = await requestAuthorization("Authorize Payout");
 *     if (!password) return; // User cancelled
 *     await executeWisePayout({ ...data, managementPassword: password });
 *   }
 *
 *   return <>{passwordDialog}{...rest}</>
 */
export function useManagementAuth() {
  const [state, setState] = useState<{
    open: boolean;
    title?: string;
    description?: string;
    resolve?: (password: string | null) => void;
  }>({ open: false });

  const requestAuthorization = useCallback(
    (title?: string, description?: string): Promise<string | null> => {
      return new Promise((resolve) => {
        setState({ open: true, title, description, resolve });
      });
    },
    []
  );

  const handleConfirm = useCallback(
    async (password: string) => {
      // Validate server-side first
      const { checkManagementPassword } = await import(
        "@/app/actions/hriq/management-auth"
      );
      const result = await checkManagementPassword(password);
      if (!result.valid) {
        throw new Error("HRIQ-0851: Invalid management password");
      }
      state.resolve?.(password);
      setState({ open: false });
    },
    [state]
  );

  const handleClose = useCallback(() => {
    state.resolve?.(null);
    setState({ open: false });
  }, [state]);

  const passwordDialog = (
    <ManagementPasswordDialog
      open={state.open}
      onClose={handleClose}
      onConfirm={handleConfirm}
      title={state.title}
      description={state.description}
    />
  );

  return { passwordDialog, requestAuthorization };
}
