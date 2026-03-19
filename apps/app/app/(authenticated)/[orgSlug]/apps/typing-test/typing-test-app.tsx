"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { RotateCcw, Trophy, Timer, Zap, Target } from "lucide-react";

const SENTENCES = [
  "The quick brown fox jumps over the lazy dog near the riverbank.",
  "Remote work requires discipline, clear communication, and reliable internet.",
  "Please schedule a follow-up meeting with the client for next Tuesday morning.",
  "The virtual assistant completed all assigned tasks ahead of the deadline.",
  "Could you please send me the updated spreadsheet with the quarterly figures?",
  "Our team meeting has been moved to three o'clock in the afternoon today.",
  "The hiring manager reviewed twelve candidate profiles before the interview round.",
  "Make sure to update the project tracker before the end of the business day.",
  "We need to coordinate across three different time zones for this project launch.",
  "The client requested a detailed breakdown of all service charges this month.",
  "Thank you for your prompt response regarding the contract renewal terms.",
  "All new contractors must complete the onboarding checklist within five business days.",
  "The payroll report shows a discrepancy that needs to be resolved before Friday.",
  "Please confirm your availability for the training session scheduled next week.",
  "The recruitment pipeline currently has twenty active candidates in various stages.",
  "Effective communication is the foundation of successful remote team management.",
  "I have attached the revised proposal incorporating all of the feedback received.",
  "The quarterly review meeting will cover performance metrics and growth targets.",
  "We appreciate your dedication to maintaining high quality standards throughout.",
  "A good morning routine can significantly boost your productivity while working remotely.",
];

function pickSentences(count: number) {
  const shuffled = [...SENTENCES].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).join(" ");
}

type TestState = "idle" | "running" | "done";
type Difficulty = "easy" | "medium" | "hard";

const DURATIONS: Record<Difficulty, number> = { easy: 60, medium: 30, hard: 15 };

export function TypingTestApp() {
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [state, setState] = useState<TestState>("idle");
  const [text, setText] = useState("");
  const [typed, setTyped] = useState("");
  const [timeLeft, setTimeLeft] = useState(DURATIONS.medium);
  const [startTime, setStartTime] = useState(0);
  const [wpm, setWpm] = useState(0);
  const [accuracy, setAccuracy] = useState(100);
  const [charsCorrect, setCharsCorrect] = useState(0);
  const [charsTotal, setCharsTotal] = useState(0);
  const [bestWpm, setBestWpm] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const reset = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    const t = pickSentences(6);
    setText(t);
    setTyped("");
    setTimeLeft(DURATIONS[difficulty]);
    setState("idle");
    setWpm(0);
    setAccuracy(100);
    setCharsCorrect(0);
    setCharsTotal(0);
  }, [difficulty]);

  useEffect(() => { reset(); }, [reset]);

  const finish = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setState("done");
    const elapsed = (Date.now() - startTime) / 1000 / 60;
    const words = charsCorrect / 5;
    const finalWpm = Math.round(words / Math.max(elapsed, 0.01));
    const finalAcc = charsTotal > 0 ? Math.round((charsCorrect / charsTotal) * 100) : 100;
    setWpm(finalWpm);
    setAccuracy(finalAcc);
    if (finalWpm > bestWpm) setBestWpm(finalWpm);
  }, [startTime, charsCorrect, charsTotal, bestWpm]);

  useEffect(() => {
    if (state === "running" && timeLeft <= 0) finish();
  }, [timeLeft, state, finish]);

  const handleInput = (val: string) => {
    if (state === "done") return;

    if (state === "idle") {
      setState("running");
      const now = Date.now();
      setStartTime(now);
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - now) / 1000);
        const remain = DURATIONS[difficulty] - elapsed;
        setTimeLeft(remain);
        if (remain <= 0 && timerRef.current) clearInterval(timerRef.current);
      }, 200);
    }

    setTyped(val);
    let correct = 0;
    for (let i = 0; i < val.length; i++) {
      if (val[i] === text[i]) correct++;
    }
    setCharsCorrect(correct);
    setCharsTotal(val.length);

    if (val.length >= text.length) finish();
  };

  const renderText = () => {
    return text.split("").map((ch, i) => {
      let cls = "text-muted-foreground/40";
      if (i < typed.length) {
        cls = typed[i] === ch ? "text-emerald-500 dark:text-emerald-400" : "text-red-500 dark:text-red-400 underline decoration-red-400";
      } else if (i === typed.length) {
        cls = "text-foreground bg-primary/20 rounded-sm";
      }
      return <span key={i} className={cls}>{ch === " " && i < typed.length && typed[i] !== " " ? "\u00B7" : ch}</span>;
    });
  };

  const liveWpm = state === "running" ? Math.round((charsCorrect / 5) / (Math.max(Date.now() - startTime, 1) / 60000)) : 0;
  const liveAcc = charsTotal > 0 ? Math.round((charsCorrect / charsTotal) * 100) : 100;

  return (
    <div className="flex flex-1 flex-col p-6">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Zap className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-lg font-bold text-foreground">Speed Typing Test</h2>
              <p className="text-xs text-muted-foreground">Test your WPM - great for VA skill assessment</p>
            </div>
          </div>
          {bestWpm > 0 && (
            <div className="flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-600 dark:text-amber-400">
              <Trophy className="h-3.5 w-3.5" /> Best: {bestWpm} WPM
            </div>
          )}
        </div>

        {/* Difficulty selector */}
        <div className="mb-4 flex items-center gap-2">
          {(["easy", "medium", "hard"] as Difficulty[]).map((d) => (
            <button key={d} onClick={() => { if (state !== "running") { setDifficulty(d); }}}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${difficulty === d ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground hover:bg-accent"}`}
            >{d.charAt(0).toUpperCase() + d.slice(1)} ({DURATIONS[d]}s)</button>
          ))}
          <button onClick={reset} className="ml-auto flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent">
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </button>
        </div>

        {/* Stats bar */}
        <div className="mb-4 grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-border bg-card p-3 text-center">
            <Timer className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
            <div className={`text-2xl font-bold tabular-nums ${timeLeft <= 5 && state === "running" ? "text-red-500 animate-pulse" : "text-foreground"}`}>{Math.max(timeLeft, 0)}s</div>
            <div className="text-[10px] text-muted-foreground">Time Left</div>
          </div>
          <div className="rounded-lg border border-border bg-card p-3 text-center">
            <Zap className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
            <div className="text-2xl font-bold tabular-nums text-foreground">{state === "done" ? wpm : liveWpm}</div>
            <div className="text-[10px] text-muted-foreground">WPM</div>
          </div>
          <div className="rounded-lg border border-border bg-card p-3 text-center">
            <Target className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
            <div className={`text-2xl font-bold tabular-nums ${(state === "done" ? accuracy : liveAcc) >= 95 ? "text-emerald-500" : (state === "done" ? accuracy : liveAcc) >= 80 ? "text-amber-500" : "text-red-500"}`}>{state === "done" ? accuracy : liveAcc}%</div>
            <div className="text-[10px] text-muted-foreground">Accuracy</div>
          </div>
        </div>

        {/* Text display */}
        <div className="relative mb-3 rounded-xl border border-border bg-card p-5">
          <div className="font-mono text-base leading-8 select-none" style={{ wordBreak: "break-all" }}>
            {renderText()}
          </div>
          {state === "idle" && (
            <div className="absolute inset-0 flex items-center justify-center bg-card/80 backdrop-blur-[2px] rounded-xl">
              <div className="text-center">
                <div className="text-sm font-semibold text-foreground">Click below and start typing</div>
                <div className="mt-1 text-xs text-muted-foreground">The timer begins with your first keystroke</div>
              </div>
            </div>
          )}
          {state === "done" && (
            <div className="absolute inset-0 flex items-center justify-center bg-card/80 backdrop-blur-[2px] rounded-xl">
              <div className="text-center">
                <Trophy className="mx-auto mb-2 h-8 w-8 text-amber-500" />
                <div className="text-xl font-bold text-foreground">{wpm} WPM</div>
                <div className="text-sm text-muted-foreground">{accuracy}% accuracy</div>
                <button onClick={reset} className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Try Again</button>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <textarea
          ref={inputRef}
          value={typed}
          onChange={(e) => handleInput(e.target.value)}
          disabled={state === "done"}
          placeholder={state === "idle" ? "Start typing here..." : ""}
          className="w-full resize-none rounded-xl border border-border bg-card px-5 py-4 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          rows={3}
          autoFocus
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
        />

        {/* Progress bar */}
        {state === "running" && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all duration-200" style={{ width: `${Math.min((typed.length / text.length) * 100, 100)}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}
