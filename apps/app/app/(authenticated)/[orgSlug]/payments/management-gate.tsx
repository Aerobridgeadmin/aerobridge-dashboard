"use client";

import { useState, useEffect } from "react";
import { createManagementSession } from "@/app/actions/hriq/management-auth";

const STORAGE_KEY = "hriq_mgmt_session";

/**
 * Management password gate — shown once when entering the Payments area.
 * After verification, caches a session token for 24h so subsequent actions
 * don't need to re-ask.
 *
 * readOnly users (contractors) bypass the gate entirely.
 */
export function ManagementGate({
  children,
  readOnly = false,
  isRL = false,
}: {
  children: (managementToken: string) => React.ReactNode;
  readOnly?: boolean;
  isRL?: boolean;
}) {
  const [authorized, setAuthorized] = useState(false);
  const [token, setToken] = useState("");
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // readOnly users and non-RL orgs skip the gate
  useEffect(() => {
    if (readOnly || !isRL) {
      setAuthorized(true);
      setChecking(false);
      return;
    }

    // Check for existing cached session
    try {
      const cached = sessionStorage.getItem(STORAGE_KEY);
      if (cached) {
        const { token: t, expiresAt } = JSON.parse(cached);
        if (t && expiresAt > Date.now()) {
          setToken(t);
          setAuthorized(true);
          setChecking(false);
          return;
        }
        sessionStorage.removeItem(STORAGE_KEY);
      }
    } catch {}
    setChecking(false);
  }, [readOnly, isRL]);

  const handleSubmit = async () => {
    if (!password.trim()) {
      setError("Password required");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const session = await createManagementSession(password);
      try {
        sessionStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ token: session.token, expiresAt: session.expiresAt })
        );
      } catch {}
      setToken(session.token);
      setAuthorized(true);
    } catch (err: any) {
      const msg = err?.message ?? "";
      setError(
        msg.includes("0851")
          ? "Invalid management password"
          : msg.includes("0850")
            ? "Management password not configured — contact admin"
            : msg || "Verification failed"
      );
      setPassword("");
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-sm rounded-xl border bg-card p-8 shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40">
              <svg
                className="h-5 w-5 text-amber-600 dark:text-amber-400"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold">Payments Area</h2>
              <p className="text-xs text-muted-foreground">
                Enter the management password to access payments
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) =>
                e.key === "Enter" && password.trim() && handleSubmit()
              }
              placeholder="Management password"
              autoFocus
              autoComplete="off"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-amber-500/30 placeholder:text-muted-foreground/50"
            />
            {error && (
              <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
            )}
            <button
              onClick={handleSubmit}
              disabled={loading || !password.trim()}
              className="h-10 w-full rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? "Verifying…" : "Unlock Payments"}
            </button>
          </div>

          <p className="mt-4 text-center text-[10px] text-muted-foreground">
            Session lasts 24 hours. All payment actions will use this
            authorization.
          </p>
        </div>
      </div>
    );
  }

  return <>{children(token)}</>;
}
