"use client";

import { useEffect, useRef, useState } from "react";

export function StripeCompleteClient({
  initialStatus,
  name,
}: {
  initialStatus: string;
  name: string;
}) {
  const [status, setStatus] = useState(initialStatus);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [checking, setChecking] = useState(false);

  const isSuccess = status === "verified" || status === "restricted";
  const isError = status === "error";
  const isPending = !isSuccess && !isError;

  // Poll every 5s if still pending
  useEffect(() => {
    if (!isPending) return;
    const poll = async () => {
      try {
        // Try refreshing org status first, then contractor
        const res = await fetch("/api/stripe-connect/check-status", { method: "POST" });
        if (res.ok) {
          const data = await res.json();
          if (data.status === "verified" || data.status === "restricted") {
            setStatus(data.status);
            if (pollRef.current) clearInterval(pollRef.current);
          }
        }
      } catch {}
    };
    pollRef.current = setInterval(poll, 5000);
    // Run immediately once
    poll();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [isPending]);

  const handleCheckNow = async () => {
    setChecking(true);
    try {
      const res = await fetch("/api/stripe-connect/check-status", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setStatus(data.status);
      }
    } catch {} finally {
      setChecking(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">RL</span>
            </div>
            <span className="text-xl font-semibold text-white tracking-tight">Remote Leverage</span>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-800 bg-gray-900/80 backdrop-blur-sm p-8 shadow-2xl">
          {isSuccess ? (
            <>
              <div className="flex justify-center mb-6">
                <div className="h-16 w-16 rounded-full bg-green-500/10 border-2 border-green-500/30 flex items-center justify-center">
                  <svg className="h-8 w-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
              <h1 className="text-2xl font-bold text-white text-center mb-2">
                Payment Setup Complete
              </h1>
              <p className="text-gray-400 text-center text-sm leading-relaxed">
                {name ? `Thanks ${name}! Your` : "Your"} Stripe account is active. You can now view payment history and manage payouts from your Stripe Express dashboard.
              </p>
              <div className="mt-6 rounded-xl bg-green-500/5 border border-green-500/20 p-4">
                <div className="flex items-start gap-3">
                  <svg className="h-5 w-5 text-green-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  <div>
                    <div className="text-sm font-medium text-green-300">Account Verified</div>
                    <div className="text-xs text-green-400/70 mt-0.5">Your identity and bank details have been confirmed</div>
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-500 text-center mt-6">
                You can close this window and log in to HRIQ. Your Stripe Express dashboard is accessible from your HRIQ settings.
              </p>
            </>
          ) : isError ? (
            <>
              <div className="flex justify-center mb-6">
                <div className="h-16 w-16 rounded-full bg-red-500/10 border-2 border-red-500/30 flex items-center justify-center">
                  <svg className="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
              </div>
              <h1 className="text-2xl font-bold text-white text-center mb-2">
                Something Went Wrong
              </h1>
              <p className="text-gray-400 text-center text-sm leading-relaxed">
                We couldn&apos;t verify your payment setup. Please contact your Remote Leverage coordinator and they can resend the setup invite.
              </p>
            </>
          ) : (
            <>
              <div className="flex justify-center mb-6">
                <div className="h-16 w-16 rounded-full bg-amber-500/10 border-2 border-amber-500/30 flex items-center justify-center animate-pulse">
                  <svg className="h-8 w-8 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              <h1 className="text-2xl font-bold text-white text-center mb-2">
                Verifying Your Account
              </h1>
              <p className="text-gray-400 text-center text-sm leading-relaxed">
                {name ? `Thanks ${name}! Your` : "Your"} payment account is being verified by Stripe. This usually takes less than a minute. This page will update automatically.
              </p>
              <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div className="h-full animate-pulse rounded-full" style={{ width: "60%", background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)" }} />
              </div>
              <div className="mt-5 flex justify-center">
                <button
                  type="button"
                  onClick={handleCheckNow}
                  disabled={checking}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-4 py-2 text-sm font-medium text-white/80 hover:bg-white/5 disabled:opacity-50"
                >
                  {checking ? "Checking..." : "Check Now"}
                </button>
              </div>
              <p className="text-xs text-gray-600 text-center mt-4">
                Auto-checking every 5 seconds
              </p>
            </>
          )}
        </div>

        <div className="flex items-center justify-center gap-1.5 mt-5">
          <span className="text-[10px] text-gray-600">Payments powered by</span>
          <span className="text-[10px] text-[#6772e5] font-bold">stripe</span>
        </div>
      </div>
    </div>
  );
}
