"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Play, Pause, RotateCcw, Coffee, Brain, Flame, ChevronDown, Volume2, VolumeX } from "lucide-react";

type Mode = "focus" | "shortBreak" | "longBreak";

const DEFAULTS: Record<Mode, number> = { focus: 25, shortBreak: 5, longBreak: 15 };
const MODE_LABELS: Record<Mode, { label: string; color: string; icon: typeof Brain }> = {
  focus: { label: "Focus", color: "text-red-500", icon: Brain },
  shortBreak: { label: "Short Break", color: "text-emerald-500", icon: Coffee },
  longBreak: { label: "Long Break", color: "text-blue-500", icon: Coffee },
};

const RING_COLORS: Record<Mode, string> = {
  focus: "#EF4444", shortBreak: "#10B981", longBreak: "#3B82F6",
};
const RING_BG: Record<Mode, string> = {
  focus: "rgba(239,68,68,0.1)", shortBreak: "rgba(16,185,129,0.1)", longBreak: "rgba(59,130,246,0.1)",
};

const QUOTES = [
  "The secret of getting ahead is getting started.",
  "Focus on being productive instead of busy.",
  "Small steps every day lead to big results.",
  "You don't have to be great to start, but you have to start to be great.",
  "The only way to do great work is to love what you do.",
  "Discipline is choosing between what you want now and what you want most.",
  "Progress, not perfection.",
  "Your future self will thank you.",
];

export function FocusTimerApp() {
  const [mode, setMode] = useState<Mode>("focus");
  const [timeLeft, setTimeLeft] = useState(DEFAULTS.focus * 60);
  const [running, setRunning] = useState(false);
  const [sessions, setSessions] = useState(0);
  const [totalFocus, setTotalFocus] = useState(0);
  const [soundOn, setSoundOn] = useState(true);
  const [quote, setQuote] = useState(QUOTES[0]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const totalTime = DEFAULTS[mode] * 60;

  const playSound = useCallback(() => {
    if (!soundOn) return;
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 800;
      gain.gain.value = 0.1;
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.stop(ctx.currentTime + 0.5);
    } catch {}
  }, [soundOn]);

  const switchMode = useCallback((m: Mode) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setMode(m);
    setTimeLeft(DEFAULTS[m] * 60);
    setRunning(false);
  }, []);

  // Pick a random quote only on the client to avoid hydration mismatch
  useEffect(() => {
    setQuote(QUOTES[Math.floor(Math.random() * QUOTES.length)]);
  }, []);

  useEffect(() => {
    if (!running) { if (timerRef.current) clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          setRunning(false);
          playSound();
          if (mode === "focus") {
            setSessions((s) => s + 1);
            setTotalFocus((f) => f + DEFAULTS.focus);
          }
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [running, mode, playSound]);

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const progress = 1 - timeLeft / totalTime;
  const circumference = 2 * Math.PI * 120;
  const strokeDash = circumference * progress;
  const ModeMeta = MODE_LABELS[mode];

  const streakFire = sessions >= 4;

  return (
    <div className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-md">
        <div className="mb-5 text-center">
          <h2 className="text-lg font-bold text-foreground">Focus Timer</h2>
          <p className="mt-0.5 text-xs text-muted-foreground italic">"{quote}"</p>
        </div>

        {/* Mode tabs */}
        <div className="mb-6 flex justify-center gap-1 rounded-xl border border-border bg-card p-1">
          {(["focus", "shortBreak", "longBreak"] as Mode[]).map((m) => {
            const meta = MODE_LABELS[m];
            const Icon = meta.icon;
            return (
              <button key={m} onClick={() => switchMode(m)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${mode === m ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-accent"}`}>
                <Icon className="h-3.5 w-3.5" /> {meta.label}
              </button>
            );
          })}
        </div>

        {/* Timer ring */}
        <div className="relative mx-auto mb-6 flex items-center justify-center" style={{ width: 260, height: 260 }}>
          <svg width="260" height="260" className="absolute -rotate-90">
            <circle cx="130" cy="130" r="120" fill="none" stroke={RING_BG[mode]} strokeWidth="8" />
            <circle cx="130" cy="130" r="120" fill="none" stroke={RING_COLORS[mode]} strokeWidth="8"
              strokeDasharray={circumference} strokeDashoffset={circumference - strokeDash}
              strokeLinecap="round" className="transition-all duration-500" />
          </svg>
          <div className="text-center z-10">
            <div className={`text-5xl font-bold tabular-nums ${ModeMeta.color}`}>
              {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
            </div>
            <div className="mt-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">{ModeMeta.label}</div>
          </div>
        </div>

        {/* Controls */}
        <div className="mb-6 flex items-center justify-center gap-3">
          <button onClick={() => setRunning(!running)}
            className={`flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all hover:scale-105 ${running ? "bg-amber-500 text-white" : "bg-primary text-primary-foreground"}`}>
            {running ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 ml-0.5" />}
          </button>
          <button onClick={() => { switchMode(mode); }}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-accent transition-colors">
            <RotateCcw className="h-4 w-4" />
          </button>
          <button onClick={() => setSoundOn(!soundOn)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-accent transition-colors">
            {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
        </div>

        {/* Session stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-border bg-card p-3 text-center">
            <div className="flex items-center justify-center gap-1">
              <span className="text-2xl font-bold text-foreground">{sessions}</span>
              {streakFire && <Flame className="h-4 w-4 text-orange-500 animate-pulse" />}
            </div>
            <div className="text-[10px] text-muted-foreground">Sessions</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-3 text-center">
            <div className="text-2xl font-bold text-foreground">{totalFocus}</div>
            <div className="text-[10px] text-muted-foreground">Minutes Focused</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-3 text-center">
            <div className="text-2xl font-bold text-foreground">{sessions >= 4 ? Math.floor(sessions / 4) : 0}</div>
            <div className="text-[10px] text-muted-foreground">Full Cycles</div>
          </div>
        </div>

        {/* Suggestion */}
        {timeLeft === 0 && (
          <div className="mt-4 rounded-xl border border-border bg-gradient-to-br from-card to-muted/30 p-4 text-center">
            <p className="text-sm text-foreground font-medium">
              {mode === "focus" ? (sessions % 4 === 0 && sessions > 0 ? "Great streak! Take a long break." : "Nice work! Time for a short break.") : "Refreshed? Start your next focus session!"}
            </p>
            <button onClick={() => switchMode(mode === "focus" ? (sessions % 4 === 0 && sessions > 0 ? "longBreak" : "shortBreak") : "focus")}
              className="mt-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
              {mode === "focus" ? "Start Break" : "Start Focus"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
