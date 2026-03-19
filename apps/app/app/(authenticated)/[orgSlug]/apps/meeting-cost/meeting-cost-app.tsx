"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export function MeetingCostApp() {
  const [attendees, setAttendees] = useState(5);
  const [avgRate, setAvgRate] = useState(25);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const costPerSecond = (attendees * avgRate) / 3600;
  const currentCost = elapsed * costPerSecond;

  const start = useCallback(() => {
    if (running) return;
    setRunning(true);
    intervalRef.current = setInterval(() => setElapsed((p) => p + 1), 1000);
  }, [running]);

  const pause = () => {
    setRunning(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
  };

  const reset = () => {
    pause();
    setElapsed(0);
  };

  useEffect(() => { return () => { if (intervalRef.current) clearInterval(intervalRef.current); }; }, []);

  const fmt = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${h > 0 ? String(h).padStart(2, "0") + ":" : ""}${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const fmtMoney = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Presets for quick planning
  const presets = [
    { label: "Quick Standup", attendees: 4, minutes: 15 },
    { label: "Team Sync", attendees: 8, minutes: 30 },
    { label: "All-Hands", attendees: 20, minutes: 60 },
    { label: "Sprint Planning", attendees: 6, minutes: 90 },
  ];

  return (
    <div className="flex flex-1 items-start justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        {/* Live cost display */}
        <div className={`rounded-2xl border bg-card p-8 text-center transition-all ${running ? "ring-2 ring-primary/50 shadow-lg" : ""}`}>
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Meeting Cost</div>
          <div className={`text-5xl font-bold tabular-nums tracking-tight transition-colors ${
            currentCost > 100 ? "text-red-500" : currentCost > 50 ? "text-amber-500" : "text-foreground"
          }`}>
            {fmtMoney(currentCost)}
          </div>
          <div className="mt-2 text-sm text-muted-foreground tabular-nums">{fmt(elapsed)}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {fmtMoney(costPerSecond * 60)}/min with {attendees} people
          </div>

          <div className="mt-6 flex gap-2 justify-center">
            {!running ? (
              <button onClick={start} className="h-11 rounded-xl bg-green-600 px-8 text-sm font-semibold text-white hover:bg-green-700 transition-colors">
                {elapsed > 0 ? "Resume" : "Start Meeting"}
              </button>
            ) : (
              <button onClick={pause} className="h-11 rounded-xl bg-amber-600 px-8 text-sm font-semibold text-white hover:bg-amber-700 transition-colors">
                Pause
              </button>
            )}
            {elapsed > 0 && (
              <button onClick={reset} className="h-11 rounded-xl border px-6 text-sm font-medium hover:bg-muted transition-colors">
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Settings */}
        <div className="rounded-2xl border bg-card p-5 space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="font-medium">Attendees</span>
              <span className="tabular-nums font-semibold">{attendees}</span>
            </div>
            <input type="range" min={1} max={50} value={attendees} onChange={(e) => setAttendees(Number(e.target.value))} className="w-full accent-primary" />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="font-medium">Avg Hourly Rate</span>
              <span className="tabular-nums font-semibold">${avgRate}</span>
            </div>
            <input type="range" min={5} max={200} step={5} value={avgRate} onChange={(e) => setAvgRate(Number(e.target.value))} className="w-full accent-primary" />
          </div>
        </div>

        {/* Quick estimates */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Quick Estimates</h3>
          <div className="grid grid-cols-2 gap-2">
            {presets.map((p) => {
              const cost = (p.attendees * avgRate * p.minutes) / 60;
              return (
                <button
                  key={p.label}
                  onClick={() => setAttendees(p.attendees)}
                  className="rounded-xl border bg-card p-3 text-left hover:bg-muted/50 transition-colors"
                >
                  <div className="text-xs font-medium">{p.label}</div>
                  <div className="text-[10px] text-muted-foreground">{p.attendees} people, {p.minutes} min</div>
                  <div className="mt-1 text-sm font-bold text-primary tabular-nums">{fmtMoney(cost)}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
