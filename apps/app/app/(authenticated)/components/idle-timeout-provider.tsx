"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@repo/auth/client";
import { useRouter } from "next/navigation";

/**
 * IDLE_TIMEOUT_MS    — inactivity before the warning overlay appears.
 * WARNING_COUNTDOWN_S — seconds shown on the countdown before auto sign-out.
 *
 * Two mechanisms enforce the timeout:
 *  1. setTimeout — fires after IDLE_TIMEOUT_MS of no activity
 *  2. setInterval heartbeat — checks every 30s in case the setTimeout was
 *     throttled by Chrome's background-tab timer suspension
 */
const IDLE_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours
const WARNING_COUNTDOWN_S = 60;               // 60-second visible countdown
const THROTTLE_MS = 30_000;                   // min gap between activity resets
const HEARTBEAT_MS = 30_000;                  // backup check interval

const ACTIVITY_EVENTS: (keyof DocumentEventMap)[] = [
  "mousemove",
  "mousedown",
  "keydown",
  "touchstart",
  "scroll",
  "pointerdown",
];

// Singleton client — prevents a new Supabase instance on every render,
// which was causing signOut / countdown effects to re-run unnecessarily.
let _supabaseClient: ReturnType<typeof createClient> | null = null;
function getSupabaseClient() {
  if (!_supabaseClient) _supabaseClient = createClient();
  return _supabaseClient;
}

export function IdleTimeoutProvider() {
  const router = useRouter();
  // Use singleton to avoid re-creating on every render
  const supabase = getSupabaseClient();

  const idleTimerRef    = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const heartbeatRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const warningShownRef = useRef(false); // ref mirror of showWarning for use in event handlers

  const [showWarning, setShowWarning] = useState(false);
  const [countdown, setCountdown] = useState(WARNING_COUNTDOWN_S);

  // ── sign-out ─────────────────────────────────────────────────────────────
  const signOut = useCallback(async () => {
    if (idleTimerRef.current)  { clearTimeout(idleTimerRef.current);   idleTimerRef.current  = null; }
    if (heartbeatRef.current)  { clearInterval(heartbeatRef.current);  heartbeatRef.current  = null; }
    warningShownRef.current = false;
    setShowWarning(false);
    await supabase.auth.signOut();
    router.push("/sign-in");
    router.refresh();
  }, [supabase, router]);

  // ── show warning overlay ──────────────────────────────────────────────────
  const triggerWarning = useCallback(() => {
    if (warningShownRef.current) return; // already showing
    warningShownRef.current = true;
    setShowWarning(true);
    setCountdown(WARNING_COUNTDOWN_S);
  }, []);

  // ── reset idle timer (called on activity) ────────────────────────────────
  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) { clearTimeout(idleTimerRef.current); idleTimerRef.current = null; }
    idleTimerRef.current = setTimeout(triggerWarning, IDLE_TIMEOUT_MS);
  }, [triggerWarning]);

  // ── countdown runs in isolated effect ────────────────────────────────────
  useEffect(() => {
    if (!showWarning) return;

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          signOut();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [showWarning, signOut]);

  // ── activity handler (throttled) ─────────────────────────────────────────
  const handleActivity = useCallback(() => {
    if (warningShownRef.current) return; // don't reset while warning is visible
    const now = Date.now();
    if (now - lastActivityRef.current < THROTTLE_MS) return;
    lastActivityRef.current = now;
    resetIdleTimer();
  }, [resetIdleTimer]);

  // ── "Stay signed in" ─────────────────────────────────────────────────────
  const handleStaySignedIn = useCallback(() => {
    warningShownRef.current = false;
    setShowWarning(false);
    setCountdown(WARNING_COUNTDOWN_S);
    lastActivityRef.current = Date.now();
    resetIdleTimer();
  }, [resetIdleTimer]);

  // ── cross-tab sync (sign-out in another tab) ──────────────────────────────
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        if (idleTimerRef.current)  { clearTimeout(idleTimerRef.current);  idleTimerRef.current  = null; }
        if (heartbeatRef.current)  { clearInterval(heartbeatRef.current); heartbeatRef.current  = null; }
        warningShownRef.current = false;
        setShowWarning(false);
        router.push("/sign-in");
        router.refresh();
      }
    });
    return () => { subscription.unsubscribe(); };
  }, [supabase, router]);

  // ── attach activity listeners + start idle timer once on mount ───────────
  useEffect(() => {
    lastActivityRef.current = Date.now();
    resetIdleTimer();

    for (const event of ACTIVITY_EVENTS) {
      document.addEventListener(event, handleActivity, { passive: true });
    }

    // Heartbeat: backup for setTimeout throttling in background tabs.
    // Every HEARTBEAT_MS, check if the user has been idle long enough.
    heartbeatRef.current = setInterval(() => {
      if (warningShownRef.current) return;
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= IDLE_TIMEOUT_MS) {
        triggerWarning();
      }
    }, HEARTBEAT_MS);

    return () => {
      for (const event of ACTIVITY_EVENTS) {
        document.removeEventListener(event, handleActivity);
      }
      if (idleTimerRef.current)  { clearTimeout(idleTimerRef.current);   idleTimerRef.current  = null; }
      if (heartbeatRef.current)  { clearInterval(heartbeatRef.current);  heartbeatRef.current  = null; }
    };
    // Intentionally stable deps — only run once on mount. handleActivity and
    // resetIdleTimer are stable refs; adding them would cause re-mount loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── page visibility: catch wakeup after laptop sleep / tab switch ────────
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (warningShownRef.current) return;

      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= IDLE_TIMEOUT_MS + WARNING_COUNTDOWN_S * 1000) {
        // Overdue — sign out immediately without showing the warning
        signOut();
      } else if (elapsed >= IDLE_TIMEOUT_MS) {
        triggerWarning();
      } else {
        // Still within timeout — just re-arm the timer with remaining time
        if (idleTimerRef.current) { clearTimeout(idleTimerRef.current); idleTimerRef.current = null; }
        idleTimerRef.current = setTimeout(triggerWarning, IDLE_TIMEOUT_MS - elapsed);
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [signOut, triggerWarning]);

  if (!showWarning) return null;

  // ── Visible Countdown Overlay ─────────────────────────────────────────────
  const progress = countdown / WARNING_COUNTDOWN_S;
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const strokeOffset = circumference * (1 - progress);
  const isUrgent = countdown <= 10;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm" style={{ animation: "fadeIn 300ms ease-out" }}>
      <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>
      <div className="flex flex-col items-center gap-6 rounded-2xl border bg-card p-8 shadow-2xl max-w-sm w-full mx-4">
        {/* Circular countdown */}
        <div className="relative flex items-center justify-center">
          <svg width="128" height="128" style={{ transform: "rotate(-90deg)" }}>
            <circle cx="64" cy="64" r={radius} fill="none" stroke="currentColor" strokeWidth="6" className="text-muted/20" />
            <circle
              cx="64" cy="64" r={radius} fill="none" strokeWidth="6" strokeLinecap="round"
              strokeDasharray={circumference} strokeDashoffset={strokeOffset}
              className={isUrgent ? "text-red-500" : "text-amber-500"}
              stroke="currentColor"
              style={{ transition: "stroke-dashoffset 1s linear" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-4xl font-bold tabular-nums ${isUrgent ? "text-red-500" : "text-foreground"}`}>
              {countdown}
            </span>
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">seconds</span>
          </div>
        </div>

        <div className="text-center space-y-1">
          <h2 className="text-lg font-semibold">Session Expiring</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            You&apos;ve been inactive for a while. You&apos;ll be automatically signed out when the timer reaches zero.
          </p>
        </div>

        <div className="flex w-full gap-3">
          <button
            onClick={() => signOut()}
            className="flex-1 h-10 rounded-lg border text-sm font-medium hover:bg-accent transition-colors"
          >
            Sign out
          </button>
          <button
            onClick={handleStaySignedIn}
            className="flex-1 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Stay signed in
          </button>
        </div>
      </div>
    </div>
  );
}
