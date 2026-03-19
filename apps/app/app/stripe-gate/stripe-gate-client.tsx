"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { StarBackground } from "@/components/star-background";
import { SecurityTrustStrip } from "@/components/security-trust-strip";

type Props = {
  orgId: string;
  orgName: string;
  orgSlug: string;
  adminName: string;
  hasAccount: boolean;
  status: string;
};

export function StripeGateClient({
  orgId,
  orgName,
  orgSlug,
  adminName,
  hasAccount: initialHasAccount,
  status: initialStatus,
}: Props) {
  const [phase, setPhase] = useState<
    "ready" | "opening" | "waiting" | "complete" | "error"
  >(initialHasAccount && initialStatus !== "none" ? "waiting" : "ready");
  const [error, setError] = useState<string | null>(null);
  const [onboardingUrl, setOnboardingUrl] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [pollTimeout, setPollTimeout] = useState(false);

  const startSetup = useCallback(async () => {
    setPhase("opening");
    setError(null);

    // Open the window synchronously on the click event to avoid popup blockers.
    // We set the URL after the async call completes.
    const popup = window.open("about:blank", "_blank");

    try {
      const { initOrgConnectAccount } = await import("@/app/actions/hriq/stripe");
      const result = await initOrgConnectAccount(orgId);
      if ("error" in result) {
        popup?.close();
        setError(result.error);
        setPhase("error");
        return;
      }
      setOnboardingUrl(result.onboardingUrl);
      if (popup && !popup.closed) {
        popup.location.href = result.onboardingUrl;
      } else {
        // Popup was blocked or closed — fall back to direct navigation
        window.open(result.onboardingUrl, "_blank");
      }
      setPhase("waiting");
    } catch (err) {
      popup?.close();
      setError(err instanceof Error ? err.message : "Failed to start Stripe setup");
      setPhase("error");
    }
  }, [orgId]);

  // Auto-start if account already exists but incomplete
  const didAutoStart = useRef(false);
  useEffect(() => {
    if (didAutoStart.current) return;
    if (phase === "waiting" && initialHasAccount && !onboardingUrl) {
      didAutoStart.current = true;
      (async () => {
        try {
          const { initOrgConnectAccount } = await import("@/app/actions/hriq/stripe");
          const result = await initOrgConnectAccount(orgId);
          if (!("error" in result)) {
            setOnboardingUrl(result.onboardingUrl);
          }
        } catch {}
      })();
    }
  }, [phase, initialHasAccount, onboardingUrl, orgId]);

  // Timeout for polling
  useEffect(() => {
    if (phase !== "waiting") return;
    const timer = setTimeout(() => setPollTimeout(true), 120_000);
    return () => clearTimeout(timer);
  }, [phase]);

  // Poll for account activation
  useEffect(() => {
    if (phase !== "waiting") return;

    const poll = async () => {
      try {
        const { refreshOrgConnectStatus } = await import("@/app/actions/hriq/stripe");
        const result = await refreshOrgConnectStatus(orgId);
        if (!("error" in result)) {
          const activeStatuses = ["verified", "restricted"];
          if (activeStatuses.includes(result.status)) {
            setPhase("complete");
            if (pollRef.current) clearInterval(pollRef.current);
            setTimeout(() => (window.location.href = "/" + orgSlug), 2000);
          }
        }
      } catch {}
    };

    pollRef.current = setInterval(poll, 4000);
    poll();

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [phase, orgId, orgSlug]);

  return (
    <>
      <StarBackground />

      <div className="flex min-h-screen flex-col relative z-10">
        {/* Header */}
        <header
          className="w-full"
          style={{ background: "linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)" }}
        >
          <div className="mx-auto flex max-w-2xl items-center gap-3 px-6 py-5">
            <img src="/logo.png" alt="Remote Leverage" className="h-11 w-11 rounded-xl" />
            <div>
              <div className="text-[17px] font-bold tracking-wide text-white">
                Remote Leverage
              </div>
              <div className="text-xs font-medium text-white/70">
                Payment Setup
              </div>
            </div>
          </div>
        </header>

        {/* Main */}
        <main className="flex flex-1 items-start justify-center px-4 py-10">
          <div className="w-full max-w-xl">
            {/* Ready — show setup prompt */}
            {phase === "ready" && (
              <div className="space-y-6">
                <div>
                  <h1 className="text-2xl font-bold text-white">
                    Set Up Your Payment Account
                  </h1>
                  <p className="mt-2 text-sm text-white/50">
                    Welcome, {adminName}! Before you can access the{" "}
                    <strong className="text-white/80">{orgName}</strong>{" "}
                    dashboard, we need to set up your Stripe account. This lets you
                    view contractor payment transfers and manage your payout details.
                  </p>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl p-5 shadow-lg">
                  <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/80">
                    What You'll Need
                  </h2>
                  <div className="space-y-3">
                    {[
                      { num: "1", text: "Your business or personal banking details" },
                      { num: "2", text: "A government-issued photo ID for identity verification" },
                      { num: "3", text: "Basic business information (address, tax ID if applicable)" },
                    ].map((item) => (
                      <div key={item.num} className="flex items-start gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-white/70">
                          {item.num}
                        </span>
                        <span className="text-sm text-white/60">{item.text}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={startSetup}
                  className="flex w-full items-center justify-center gap-2 rounded-xl px-6 py-4 text-base font-bold text-white shadow-lg transition hover:shadow-xl"
                  style={{ background: "linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)" }}
                >
                  Set Up Stripe Account
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </button>

                <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 shadow-lg">
                  <div className="flex items-start gap-3">
                    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-violet-400 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" />
                    </svg>
                    <div>
                      <div className="text-sm font-medium text-white/80">Powered by Stripe</div>
                      <p className="mt-0.5 text-xs text-white/40">
                        Your financial information is securely handled by Stripe. Remote Leverage does not store your banking details.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl p-5 shadow-lg">
                  <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/80">
                    How Payments Work
                  </h2>
                  <div className="space-y-3">
                    {[
                      { num: "1", title: "Contractors log hours", desc: "Your team submits weekly timesheets through the platform." },
                      { num: "2", title: "You review and approve", desc: "Review each timesheet in your dashboard and approve or request changes." },
                      { num: "3", title: "Payments are processed", desc: "Approved timesheets automatically trigger secure payments to your contractors via Stripe." },
                      { num: "4", title: "Track everything", desc: "View payment history, invoices, and receipts in your payments dashboard." },
                    ].map((item) => (
                      <div key={item.num} className="flex items-start gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-xs font-bold text-violet-300">
                          {item.num}
                        </span>
                        <div>
                          <span className="text-sm font-medium text-white/70">{item.title}</span>
                          <p className="text-xs text-white/40 mt-0.5">{item.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <SecurityTrustStrip className="mt-4" />
              </div>
            )}

            {/* Opening — creating account */}
            {phase === "opening" && (
              <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 text-center shadow-lg">
                <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-violet-400" />
                <h2 className="text-lg font-semibold text-white">
                  Creating Your Stripe Account…
                </h2>
                <p className="mt-2 text-sm text-white/50">
                  Setting up your payment account. A new tab will open shortly.
                </p>
              </div>
            )}

            {/* Waiting — Stripe onboarding in progress */}
            {phase === "waiting" && (
              <div className="space-y-6">
                <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 text-center shadow-lg">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-violet-500/15">
                    <svg
                      className="h-8 w-8 animate-pulse text-violet-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-semibold text-white">
                    Complete Your Stripe Setup
                  </h2>
                  <p className="mt-2 text-sm text-white/50">
                    A Stripe setup window has been opened in a new tab. Please complete the onboarding there, then return here.
                  </p>
                  <div className="mt-6 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full animate-pulse rounded-full"
                      style={{ width: "50%", background: "linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)" }}
                    />
                  </div>

                  {/* Re-open link */}
                  <div className="mt-6 flex justify-center gap-3">
                    {onboardingUrl && (
                      <button
                        type="button"
                        onClick={() => window.open(onboardingUrl, "_blank")}
                        className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-4 py-2 text-sm font-medium text-white/80 hover:bg-white/5"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        Reopen Stripe Setup
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setPhase("ready");
                        setOnboardingUrl(null);
                      }}
                      className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-4 py-2 text-sm font-medium text-white/80 hover:bg-white/5"
                    >
                      Start Over
                    </button>
                  </div>

                  {pollTimeout && (
                    <div className="mt-6 space-y-3">
                      <p className="text-xs text-white/40">
                        Taking longer than expected. If you've completed the Stripe setup, try refreshing.
                      </p>
                      <button
                        type="button"
                        onClick={() => window.location.reload()}
                        className="inline-flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-semibold text-white shadow transition hover:shadow-lg"
                        style={{ background: "linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)" }}
                      >
                        Refresh Page
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Complete — redirect */}
            {phase === "complete" && (
              <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 text-center shadow-lg">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15">
                  <svg className="h-8 w-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-white">
                  Payment Account Ready!
                </h2>
                <p className="mt-2 text-sm text-white/60">
                  Your Stripe account is active. Taking you to your{" "}
                  <strong className="text-white/80">{orgName}</strong> dashboard now…
                </p>
                <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full animate-pulse"
                    style={{ width: "100%", background: "linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)" }}
                  />
                </div>
              </div>
            )}

            {/* Error */}
            {phase === "error" && (
              <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 text-center shadow-lg">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/15">
                  <svg className="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-white">
                  Setup Issue
                </h2>
                <p className="mt-2 text-sm text-white/50">
                  {error || "Something went wrong setting up your Stripe account."}
                </p>
                <div className="mt-4 flex justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setPhase("ready");
                    }}
                    className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-white shadow transition hover:shadow-lg"
                    style={{ background: "linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)" }}
                  >
                    Try Again
                  </button>
                </div>
                <p className="mt-4 text-xs text-white/40">
                  If the issue persists, please contact your Remote Leverage coordinator for assistance.
                </p>
              </div>
            )}
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t border-white/10 bg-transparent px-6 py-4">
          <div className="mx-auto max-w-2xl text-center text-[11px] text-white/40">
            © {new Date().getFullYear()} Remote Leverage LLC · Payments powered by{" "}
            <a href="https://stripe.com" target="_blank" rel="noopener noreferrer" className="underline">
              Stripe
            </a>
          </div>
        </footer>
      </div>
    </>
  );
}
