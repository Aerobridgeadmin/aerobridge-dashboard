"use client";

import { useEffect, useState } from "react";

// Next.js strips Server Component error messages in production.
// These are the known stripped messages we can detect and replace.
const STRIPPED_MESSAGES = [
  "An error occurred in the Server Components render.",
  "The specific message is omitted in production builds",
  "minified react error",
];

function isStrippedInProduction(message: string): boolean {
  return STRIPPED_MESSAGES.some((m) => message?.toLowerCase().includes(m.toLowerCase()));
}

/**
 * Shared error boundary UI — shows REAL HRIQ error details.
 *
 * In production, Next.js strips Server Component error messages for security.
 * When that happens, this component:
 *  1. Shows the error digest (copy it to look up in logs)
 *  2. Tells you exactly which page/module threw
 *  3. Links to audit logs where the full error is stored server-side
 *
 * For Server Action errors, HRIQ codes surface normally — full detail shown.
 */
export function PageErrorBoundary({
  error,
  reset,
  pageName,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  pageName?: string;
}) {
  const [retried, setRetried] = useState(false);

  useEffect(() => {
    console.error(`[HRIQ ${pageName ?? "Page"} Error]`, {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });

    // Auto-reload on stale server action errors (happens after deployments)
    if (error.message?.includes("Failed to find Server Action")) {
      window.location.reload();
      return;
    }

    // Auto-retry once on first render (handles transient fetch failures)
    try {
      const key = `hriq_err_retry_${pageName ?? "page"}`;
      const last = sessionStorage.getItem(key);
      const now = Date.now();
      if (!last || now - Number(last) > 15_000) {
        sessionStorage.setItem(key, String(now));
        if (!retried) {
          setRetried(true);
          reset();
        }
      }
    } catch {
      if (!retried) { setRetried(true); reset(); }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isStripped = isStrippedInProduction(error.message ?? "");

  // Try to parse HRIQ error code from message (works for Server Action errors)
  const hriqMatch = error.message?.match(/\[(HRIQ-\d{4})\]/);
  const hriqCode = hriqMatch?.[1];
  const cleanMessage = hriqCode
    ? error.message?.replace(/^\[HRIQ-\d{4}\]\s*/, "") ?? "Unknown error"
    : isStripped
    ? null
    : (error.message || null);

  const module = pageName ?? "Page";

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <div className="rounded-xl border bg-card p-6 max-w-lg w-full shadow-sm">

        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold">
                {module} Error
              </h2>
              {hriqCode && (
                <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-red-700 dark:bg-red-900/50 dark:text-red-300">
                  {hriqCode}
                </span>
              )}
              {error.digest && (
                <span
                  className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground cursor-pointer hover:bg-muted/80 select-all"
                  title="Click to copy digest — use this to look up the full error in server logs"
                  onClick={() => navigator.clipboard?.writeText(error.digest!).catch(() => {})}
                >
                  {error.digest}
                </span>
              )}
            </div>

            {/* Production-stripped message */}
            {isStripped ? (
              <div className="mt-2 space-y-1.5">
                <p className="text-sm text-muted-foreground">
                  A server error occurred in <strong className="text-foreground">{module}</strong>. The full message is hidden in production for security.
                </p>
                {error.digest && (
                  <p className="text-xs text-muted-foreground">
                    Copy the digest above and search the{" "}
                    <a
                      href={`/rl/audit-log?search=${error.digest}`}
                      className="underline hover:text-foreground"
                    >
                      audit log
                    </a>{" "}
                    or check Vercel logs for the full stack trace.
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">{cleanMessage}</p>
            )}
          </div>
        </div>

        {/* Technical details — always show stack/digest */}
        {(error.stack || error.digest) && (
          <details className="mt-4">
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
              Technical details
            </summary>
            <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-muted p-3 text-xs font-mono whitespace-pre-wrap break-words">
              {[
                hriqCode && `Code: ${hriqCode}`,
                error.digest && `Digest: ${error.digest}`,
                error.stack ? `\nStack:\n${error.stack}` : `Message: ${error.message}`,
              ].filter(Boolean).join("\n")}
            </pre>
          </details>
        )}

        {/* Actions */}
        <div className="mt-4 flex gap-3">
          <button
            onClick={() => window.location.reload()}
            className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Reload Page
          </button>
          <button
            onClick={reset}
            className="h-9 rounded-md border px-4 text-sm font-medium hover:bg-accent"
          >
            Try Again
          </button>
        </div>
      </div>
    </div>
  );
}
