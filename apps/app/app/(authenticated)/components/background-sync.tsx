"use client";

import { useEffect, useRef } from "react";
import { useToast } from "./toast-provider";

const CANDIDATE_POLL_INTERVAL = 60 * 1000; // 1 minute

/**
 * BackgroundSync — invisible component that polls for new candidates from RecruitCRM.
 * Time Doctor sync is manual only (via "Fill from Time Doctor" button on timesheets).
 */
export function BackgroundSync({ role }: { role: string }) {
  const { addToast } = useToast();
  const lastPollRef = useRef<string>(new Date().toISOString());

  //  Poll for new candidates 
  useEffect(() => {
    if (!["super_admin", "admin"].includes(role)) return;

    let interval: ReturnType<typeof setInterval> | null = null;

    const pollNewCandidates = async () => {
      // Skip polling when tab is not visible
      if (document.hidden) return;

      try {
        const { checkNewPendingHires } = await import("@/app/actions/hriq/background-sync");
        const result = await checkNewPendingHires(lastPollRef.current);

        if (result.newCount > 0) {
          lastPollRef.current = new Date().toISOString();

          for (const candidate of result.candidates) {
            addToast({
              title: "New Candidate Detected",
              message: `${candidate.firstName} ${candidate.lastName}${candidate.position ? ` — ${candidate.position}` : ""} was flagged as hired in RecruitCRM.`,
              variant: "update",
              icon: "U",
              durationMs: 8000,
            });
          }
        }
      } catch (err) {
        console.error("[BackgroundSync] Candidate poll failed:", err);
      }
    };

    const startPolling = () => {
      if (!interval) {
        interval = setInterval(pollNewCandidates, CANDIDATE_POLL_INTERVAL);
      }
    };

    const stopPolling = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    const handleVisibility = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        pollNewCandidates(); // Catch up immediately
        startPolling();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    startPolling();
    const initialTimeout = setTimeout(pollNewCandidates, 5000);

    return () => {
      stopPolling();
      clearTimeout(initialTimeout);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [role, addToast]);

  return null;
}
