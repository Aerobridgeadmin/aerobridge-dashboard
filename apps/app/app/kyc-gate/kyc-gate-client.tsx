"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { StarBackground } from "@/components/star-background";
import { SecurityTrustStrip } from "@/components/security-trust-strip";

declare global {
  interface Window {
    veriffSDK?: {
      createVeriffFrame: (opts: {
        url: string;
        onEvent?: (msg: string) => void;
        onReload?: () => void;
        lang?: string;
      }) => { close: () => void };
    };
  }
}

type Props = {
  orgName: string;
  orgSlug: string;
  adminName: string;
  sessionUrl: string | null;
  kycStatus: string;
  rejectionReason: string | null;
};

export function KycGateClient({
  orgName,
  orgSlug,
  adminName,
  sessionUrl: initialSessionUrl,
  kycStatus: initialStatus,
  rejectionReason,
}: Props) {
  
  const [phase, setPhase] = useState<
    "loading" | "ready" | "verifying" | "submitted" | "approved" | "error"
  >(initialStatus === "submitted" ? "submitted" : initialSessionUrl ? "ready" : "loading");
  const [sessionUrl, setSessionUrl] = useState(initialSessionUrl);
  const [sdkReady, setSdkReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const frameRef = useRef<{ close: () => void } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-create Veriff session if none exists
  useEffect(() => {
    if (sessionUrl || phase !== "loading") return;

    (async () => {
      try {
        const { initiateSelfKyc } = await import(
          "@/app/actions/hriq/client-kyc"
        );
        const result = await initiateSelfKyc();
        if ("error" in result) { setError((result as any).error ?? "KYC initiation failed"); setPhase("error"); return; }

        if ((result as any).status === "approved") {
          setPhase("approved");
          try {
            const { createBrowserClient } = await import("@supabase/ssr");
            const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
            await sb.auth.updateUser({ data: { isFirstLogin: true, kycJustApproved: true } });
          } catch {}
          // Route back through kyc-gate so the server component reads fresh kycStatus
          // and performs a proper Next.js server-side redirect to the dashboard.
          // This avoids hitting the org dashboard directly while the webhook may still be in-flight.
          setTimeout(() => {
            window.location.replace(`/kyc-gate?verified=1&_t=${Date.now()}`);
          }, 1500);
          return;
        }

        if ((result as any).sessionUrl) {
          setSessionUrl(result.sessionUrl);
          setPhase("ready");
        } else {
          setError("Could not create verification session. Please contact your Remote Leverage coordinator.");
          setPhase("error");
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to start verification"
        );
        setPhase("error");
      }
    })();
  }, [sessionUrl, phase]);

  // Timeout: after 90 seconds of polling, show a "taking longer" message with retry
  const [pollTimeout, setPollTimeout] = useState(false);
  useEffect(() => {
    if (phase !== "submitted") return;
    const timer = setTimeout(() => setPollTimeout(true), 90_000);
    return () => clearTimeout(timer);
  }, [phase]);

  // Poll for approval after submission
  useEffect(() => {
    if (phase !== "submitted") return;
    let pollCount = 0;

    const poll = async () => {
      pollCount++;
      try {
        const { checkSelfKycStatus } = await import(
          "@/app/actions/hriq/client-kyc"
        );
        let result = await checkSelfKycStatus();

        // After 10 polls (~30s), try syncing directly from Veriff API as fallback
        if (pollCount % 10 === 0 && result.status !== "approved" && result.status !== "declined") {
          try {
            const { syncVeriffDecision } = await import("@/app/actions/hriq/client-kyc");
            const syncResult = await syncVeriffDecision();
            if (!("error" in syncResult) && (syncResult as any).synced) {
              result = { status: (syncResult as any).status, rejectionReason: null };
            }
          } catch {
            // Sync is best-effort
          }
        }

        if ((result as any).status === "approved") {
          setPhase("approved");
          if (pollRef.current) clearInterval(pollRef.current);
          // Flag so dashboard shows the welcome walkthrough
          try {
            const { createBrowserClient } = await import("@supabase/ssr");
            const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
            await sb.auth.updateUser({ data: { isFirstLogin: true, kycJustApproved: true } });
          } catch {}
          // Use replace + cache-bust to force a clean page load (avoids stale chunk errors after deploys)
          setTimeout(() => {
            window.location.replace(`/kyc-gate?verified=1&_t=${Date.now()}`);
          }, 2000);
        } else if (
          result.status === "declined" ||
          result.status === "resubmission_requested"
        ) {
          if (pollRef.current) clearInterval(pollRef.current);
          setError(
            result.rejectionReason || "Verification was not approved. Please contact your Remote Leverage coordinator."
          );
          setPhase("error");
        }
      } catch {
        // Polling errors are transient, keep trying
      }
    };

    pollRef.current = setInterval(poll, 3000);
    poll();

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [phase]);

  const launchVeriff = useCallback(() => {
    if (!window.veriffSDK || !sessionUrl) return;
    setPhase("verifying");

    try {
      frameRef.current = window.veriffSDK.createVeriffFrame({
        url: sessionUrl,
        onEvent: (msg: string) => {
          switch (msg) {
            case "SUBMITTED":
              setPhase("submitted");
              break;
            case "FINISHED":
              setPhase("submitted"); // start polling
              break;
            case "CANCELED":
              setPhase("ready"); // let them try again
              break;
            case "RELOAD_REQUEST":
              // Camera permission recovery — reload and retry
              window.location.reload();
              break;
          }
        },
      });
    } catch (err) {
      console.error("[KYC Gate] Failed to open Veriff SDK:", err);
      setError("Could not open the verification window. Please try again or use a different browser.");
      setPhase("error");
    }
  }, [sessionUrl]);

  useEffect(() => {
    return () => {
      frameRef.current?.close();
    };
  }, []);

  return (
    <>
      <Script
        src="https://cdn.veriff.me/incontext/js/v2.5.0/veriff.js"
        onLoad={() => setSdkReady(true)}
      />

      <StarBackground />

      <div className="flex min-h-screen flex-col relative z-10">
        {/* Header */}
        <header
          className="w-full"
          style={{
            background: "linear-gradient(135deg, #00B0BB 0%, #00DB65 100%)",
          }}
        >
          <div className="mx-auto flex max-w-2xl items-center gap-3 px-6 py-5">
            <img
              src="/logo.png"
              alt="Remote Leverage"
              className="h-11 w-11 rounded-xl"
            />
            <div>
              <div className="text-[17px] font-bold tracking-wide text-white">
                Remote Leverage
              </div>
              <div className="text-xs font-medium text-white/70">
                Account Activation
              </div>
            </div>
          </div>
        </header>

        {/* Main */}
        <main className="flex flex-1 items-start justify-center px-4 py-10">
          <div className="w-full max-w-xl">
            {/* Loading — creating session */}
            {phase === "loading" && (
              <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 text-center shadow-lg">
                <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-teal-400" />
                <h2 className="text-lg font-semibold text-white">
                  Preparing Verification…
                </h2>
                <p className="mt-2 text-sm text-white/50">
                  Setting up your identity verification session.
                </p>
              </div>
            )}

            {/* Ready / verifying — show context while SDK loads */}
            {(phase === "ready" || phase === "verifying") && (
              <div className="space-y-6">
                <div>
                  <h1 className="text-2xl font-bold text-white">
                    Activate Your Account
                  </h1>
                  <p className="mt-2 text-sm text-white/50">
                    Welcome, {adminName}! Before you can access the{" "}
                    <strong className="text-white/80">{orgName}</strong>{" "}
                    dashboard, we need to verify your identity. This is a quick,
                    secure process that takes about 2 minutes.
                  </p>
                </div>

                {phase === "ready" && (
                  <>
                    <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl p-5 shadow-lg">
                      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/80">
                        What You'll Need
                      </h2>
                      <div className="space-y-3">
                        {[
                          {
                            num: "1",
                            text: "A government-issued photo ID (passport, driver's license, or national ID)",
                          },
                          {
                            num: "2",
                            text: "A device with a camera (phone or laptop with webcam)",
                          },
                          {
                            num: "3",
                            text: "Good lighting for the selfie step",
                          },
                        ].map((item) => (
                          <div key={item.num} className="flex items-start gap-3">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-white/70">{item.num}</span>
                            <span className="text-sm text-white/60">
                              {item.text}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={launchVeriff}
                      disabled={!sdkReady}
                      className="flex w-full items-center justify-center gap-2 rounded-xl px-6 py-4 text-base font-bold text-white shadow-lg transition hover:shadow-xl disabled:opacity-50"
                      style={{
                        background:
                          "linear-gradient(135deg, #00B0BB 0%, #00DB65 100%)",
                      }}
                    >
                      {sdkReady ? (
                        <>
                          Start Identity Verification
                          <svg
                            className="h-5 w-5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M13 7l5 5m0 0l-5 5m5-5H6"
                            />
                          </svg>
                        </>
                      ) : (
                        "Loading…"
                      )}
                    </button>
                  </>
                )}

                {phase === "verifying" && (
                  <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 text-center shadow-lg">
                    <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-teal-400" />
                    <h2 className="text-lg font-semibold text-white">
                      Verification In Progress
                    </h2>
                    <p className="mt-2 text-sm text-white/50">
                      The verification window should be open. If you don't see
                      it, please check for a popup blocker.
                    </p>
                  </div>
                )}

                <SecurityTrustStrip className="mt-4" />

                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3">
                  <p className="text-xs text-emerald-300">
                    <strong>Your privacy is protected.</strong> Identity
                    verification is handled by Veriff. Remote Leverage does not
                    store your ID documents.
                  </p>
                </div>
              </div>
            )}

            {/* Submitted — polling for decision */}
            {phase === "submitted" && (
              <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 text-center shadow-lg">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-yellow-500/15">
                  <svg
                    className="h-8 w-8 animate-pulse text-yellow-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-white">
                  Verifying Your Identity…
                </h2>
                <p className="mt-2 text-sm text-white/50">
                  Your documents have been submitted and are being reviewed. This
                  usually takes less than a minute.
                </p>
                <div className="mt-6 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full animate-pulse rounded-full"
                    style={{
                      width: "60%",
                      background:
                        "linear-gradient(135deg, #00B0BB 0%, #00DB65 100%)",
                    }}
                  />
                </div>
                {pollTimeout && (
                  <div className="mt-6 space-y-3">
                    <p className="text-xs text-white/40">
                      This is taking longer than usual. Your verification may already
                      be approved — try refreshing.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        window.location.replace(`/kyc-gate?verified=1&_t=${Date.now()}`);
                      }}
                      className="inline-flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-semibold text-white shadow transition hover:shadow-lg"
                      style={{
                        background: "linear-gradient(135deg, #00B0BB 0%, #00DB65 100%)",
                      }}
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Refresh Page
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Approved — redirect */}
            {phase === "approved" && (
              <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 text-center shadow-lg">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15">
                  <svg
                    className="h-8 w-8 text-emerald-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-white">
                  You're All Set!
                </h2>
                <p className="mt-2 text-sm text-white/60">
                  Welcome, {adminName}. Taking you to your{" "}
                  <strong className="text-white/80">{orgName}</strong> dashboard now…
                </p>
                <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full animate-pulse"
                    style={{
                      width: "100%",
                      background: "linear-gradient(135deg, #00B0BB 0%, #00DB65 100%)",
                    }}
                  />
                </div>
              </div>
            )}

            {/* Error */}
            {phase === "error" && (
              <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 text-center shadow-lg">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/15">
                  <svg
                    className="h-8 w-8 text-red-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                    />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-white">
                  Verification Issue
                </h2>
                <p className="mt-2 text-sm text-white/50">
                  {error || rejectionReason || "Something went wrong."}
                </p>
                <div className="mt-4 flex justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setSessionUrl(null);
                      setError(null);
                      setPhase("loading");
                    }}
                    className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-white shadow transition hover:shadow-lg"
                    style={{
                      background:
                        "linear-gradient(135deg, #00B0BB 0%, #00DB65 100%)",
                    }}
                  >
                    Try Again
                  </button>
                </div>
                <p className="mt-4 text-xs text-white/40">
                  If the issue persists, please contact your Remote Leverage
                  coordinator for assistance.
                </p>
              </div>
            )}
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t border-white/10 bg-transparent px-6 py-4">
          <div className="mx-auto max-w-2xl text-center text-[11px] text-white/40">
            © {new Date().getFullYear()} Remote Leverage LLC · Identity
            verification powered by{" "}
            <a
              href="https://www.veriff.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Veriff
            </a>
          </div>
        </footer>
      </div>
    </>
  );
}
