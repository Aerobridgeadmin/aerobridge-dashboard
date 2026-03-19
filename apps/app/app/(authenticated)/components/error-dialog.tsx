"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

//  Types 

type ErrorDialogOptions = {
  title?: string;
  message: string;
  detail?: string;
  action?: string; // label for CTA button
  onAction?: () => void;
};

type ErrorDialogContextValue = {
  showError: (opts: ErrorDialogOptions | string) => void;
  showSuccess: (message: string, title?: string) => void;
};

type DialogState = {
  open: boolean;
  variant: "error" | "success";
  title: string;
  message: string;
  detail?: string;
  action?: string;
  onAction?: () => void;
};

//  Message Handling — always show real errors 

function formatErrorMessage(raw: string): string {
  if (!raw || raw.length === 0) return "An unknown error occurred.";
  return raw;
}

/** Detect if an error message indicates a stale deployment (e.g. after a new release) */
function isStaleDeployError(msg: string): boolean {
  return /was not found on the server/i.test(msg) ||
    /Failed to find Server Action/i.test(msg) ||
    /ChunkLoadError/i.test(msg) ||
    /Failed to load chunk/i.test(msg);
}

//  Context 

const ErrorDialogContext = createContext<ErrorDialogContextValue | null>(null);

export function useErrorDialog() {
  const ctx = useContext(ErrorDialogContext);
  if (!ctx) throw new Error("useErrorDialog must be used within ErrorDialogProvider");
  return ctx;
}

//  Provider 

export function ErrorDialogProvider({ children }: { children?: ReactNode }) {
  const [state, setState] = useState<DialogState>({
    open: false,
    variant: "error",
    title: "",
    message: "",
  });

  const showError = useCallback((opts: ErrorDialogOptions | string) => {
    const raw = typeof opts === "string" ? opts : opts.message;
    const cleaned = formatErrorMessage(raw);

    // Auto-detect stale deployment errors and offer a refresh
    if (isStaleDeployError(raw)) {
      setState({
        open: true,
        variant: "error",
        title: "Update Available",
        message: "A new version of HRIQ has been deployed. Please refresh to continue.",
        action: "Refresh Now",
        onAction: () => window.location.reload(),
      });
      return;
    }

    if (typeof opts === "string") {
      setState({ open: true, variant: "error", title: "Error", message: cleaned });
    } else {
      setState({
        open: true,
        variant: "error",
        title: opts.title ?? "Error",
        message: cleaned,
        detail: opts.detail,
        action: opts.action,
        onAction: opts.onAction,
      });
    }
  }, []);

  const showSuccess = useCallback((message: string, title?: string) => {
    setState({
      open: true,
      variant: "success",
      title: title ?? "Success",
      message,
    });
    // Auto-dismiss success messages after 5 seconds
    setTimeout(() => {
      setState((prev) => prev.variant === "success" ? { ...prev, open: false } : prev);
    }, 5000);
  }, []);

  const close = useCallback(() => {
    setState((prev) => ({ ...prev, open: false }));
  }, []);

  return (
    <ErrorDialogContext.Provider value={{ showError, showSuccess }}>
      {children}
      {state.open && (
        <ErrorDialogModal state={state} onClose={close} />
      )}
    </ErrorDialogContext.Provider>
  );
}

//  Modal Component 

function ErrorDialogModal({
  state,
  onClose,
}: {
  state: DialogState;
  onClose: () => void;
}) {
  const isError = state.variant === "error";
  const isSuccess = state.variant === "success";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 animate-in fade-in duration-150"
      onClick={isSuccess ? onClose : undefined}
    >
      <div
        className="w-full max-w-md rounded-xl border bg-card p-6 shadow-xl animate-in fade-in slide-in-from-bottom-4 duration-200 max-h-[80vh] overflow-y-auto relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Auto-dismiss progress bar for success dialogs */}
        {isSuccess && (
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-green-500/20">
            <div
              className="h-full bg-green-500/60"
              style={{ animation: "shrink-bar 5s linear forwards" }}
            />
            <style>{`@keyframes shrink-bar { from { width: 100%; } to { width: 0%; } }`}</style>
          </div>
        )}
        {/* Icon */}
        <div className="flex items-start gap-4">
          <div
            className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${
              isError
                ? "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400"
                : "bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400"
            }`}
          >
            {isError ? (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
            ) : (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold">{state.title}</h3>
              {state.message && (() => {
                const match = state.message.match(/^\[(HRIQ-\d{4})\]/);
                return match ? (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">{match[1]}</span>
                ) : null;
              })()}
            </div>
            <p className="mt-1 text-sm text-muted-foreground break-words">{state.message.replace(/^\[HRIQ-\d{4}\]\s*/, "")}</p>
            {state.detail && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                  Technical details
                </summary>
                <pre className="mt-1 max-h-32 overflow-auto rounded-md bg-muted p-2 text-xs font-mono whitespace-pre-wrap break-all">
                  {state.detail}
                </pre>
              </details>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="mt-5 flex items-center justify-end gap-2">
          {isSuccess && (
            <span className="mr-auto text-xs text-muted-foreground">Closes automatically</span>
          )}
          {state.action && state.onAction && (
            <button
              type="button"
              onClick={() => { state.onAction?.(); onClose(); }}
              className={`h-9 rounded-md px-4 text-sm font-medium ${
                isError
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              }`}
            >
              {state.action}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-md border px-4 text-sm font-medium hover:bg-accent"
          >
            {state.action ? "Cancel" : isSuccess ? "OK" : "Close"}
          </button>
        </div>
      </div>
    </div>
  );
}
