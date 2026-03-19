"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// ─── Types ──────────────────────────────────────────────────────────────────────

type GameId = "word-scramble" | "memory-match" | "task-rush" | "inbox-zero" | "globe-hopper" | "va-trivia" | null;

// ─── Constants ──────────────────────────────────────────────────────────────────

const RL_WORDS = [
  "ONBOARDING", "CONTRACTOR", "TIMESHEET", "PAYROLL", "REMOTE",
  "LEVERAGE", "PIPELINE", "OFFBOARD", "INVOICE", "DASHBOARD",
  "APPROVAL", "DOCUMENT", "CALENDAR", "SCHEDULE", "HIRING",
  "MANAGER", "VIRTUAL", "GLOBAL", "TEAM", "TALENT",
  "PAYMENT", "EXPENSE", "BENEFIT", "WORKFLOW", "CONNECT",
  "RECRUIT", "PROFILE", "MEETING", "SLACK", "DEPLOY",
];

const MEMORY_EMOJIS = [
  "👤", "📋", "💰", "🌍", "⏰", "📄", "🔑", "📊",
  "🚀", "💼", "📅", "✅", "🏢", "💳", "📝", "🎯",
];

const TASK_ITEMS = [
  "Review timesheet", "Approve PTO", "Send invoice", "Update profile",
  "Sign contract", "Upload document", "Schedule meeting", "Run payroll",
  "Onboard hire", "Create report", "Set up Slack", "Configure SSO",
  "Update pipeline", "Send reminder", "Verify identity", "Process payout",
  "Review expenses", "Assign manager", "Set hourly rate", "Complete KYC",
];

// ─── Helpers ────────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function scrambleWord(word: string): string {
  let scrambled = word;
  let attempts = 0;
  while (scrambled === word && attempts < 20) {
    scrambled = shuffle(word.split("")).join("");
    attempts++;
  }
  return scrambled;
}

// ─── Game Card ──────────────────────────────────────────────────────────────────

function GameCard({
  title,
  description,
  emoji,
  color,
  onClick,
}: {
  title: string;
  description: string;
  emoji: string;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-6 text-left transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:border-${color}-500/40 active:scale-[0.98]`}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-current opacity-[0.03] group-hover:opacity-[0.06] transition-opacity" />
      <div className="relative">
        <div className="text-4xl mb-3">{emoji}</div>
        <h3 className="text-lg font-semibold text-foreground mb-1">{title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
        <div className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary opacity-80 group-hover:opacity-100 transition-opacity">
          Play now
          <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
        </div>
      </div>
    </button>
  );
}

// ─── Word Scramble Game ─────────────────────────────────────────────────────────

function WordScrambleGame({ onBack }: { onBack: () => void }) {
  const [score, setScore] = useState(0);
  const [round, setRound] = useState(0);
  const [timeLeft, setTimeLeft] = useState(60);
  const [currentWord, setCurrentWord] = useState("");
  const [scrambled, setScrambled] = useState("");
  const [guess, setGuess] = useState("");
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [usedWords, setUsedWords] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  const nextWord = useCallback(() => {
    const available = RL_WORDS.filter((w) => !usedWords.has(w));
    if (available.length === 0) {
      setGameOver(true);
      return;
    }
    const word = available[Math.floor(Math.random() * available.length)];
    setCurrentWord(word);
    setScrambled(scrambleWord(word));
    setGuess("");
    setFeedback(null);
    setUsedWords((prev) => new Set([...prev, word]));
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [usedWords]);

  useEffect(() => {
    nextWord();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (gameOver) return;
    const timer = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          setGameOver(true);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [gameOver]);

  const handleSubmit = () => {
    if (guess.toUpperCase() === currentWord) {
      setFeedback("correct");
      setScore((s) => s + currentWord.length * 10);
      setRound((r) => r + 1);
      setTimeout(nextWord, 600);
    } else {
      setFeedback("wrong");
      setTimeout(() => setFeedback(null), 800);
    }
  };

  if (gameOver) {
    return (
      <GameOverScreen
        title="Word Scramble"
        emoji="🔤"
        score={score}
        detail={`${round} words unscrambled`}
        onBack={onBack}
        onReplay={() => {
          setScore(0); setRound(0); setTimeLeft(60);
          setGameOver(false); setUsedWords(new Set());
          nextWord();
        }}
      />
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <GameHeader title="Word Scramble" emoji="🔤" onBack={onBack} />
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Score</span>
          <span className="text-2xl font-bold tabular-nums text-foreground">{score}</span>
        </div>
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium tabular-nums ${timeLeft <= 10 ? "bg-red-500/10 text-red-500 animate-pulse" : "bg-muted text-muted-foreground"}`}>
          ⏱ {timeLeft}s
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-8 text-center mb-4">
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Unscramble this RL term</p>
        <p className="text-3xl font-mono font-bold tracking-[0.3em] text-primary mb-6">
          {scrambled}
        </p>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={guess}
            onChange={(e) => setGuess(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder="Type your answer..."
            className={`flex-1 px-4 py-3 rounded-xl border bg-background text-center text-lg font-semibold uppercase tracking-wider transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 ${
              feedback === "correct" ? "border-green-500 bg-green-500/5" :
              feedback === "wrong" ? "border-red-500 bg-red-500/5 animate-shake" :
              "border-border"
            }`}
            autoComplete="off"
            spellCheck="false"
          />
          <button
            type="button"
            onClick={handleSubmit}
            className="px-6 py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:opacity-90 transition-opacity"
          >
            →
          </button>
        </div>
        {feedback === "correct" && (
          <p className="mt-3 text-green-500 font-medium animate-in fade-in">✓ Correct! +{currentWord.length * 10} pts</p>
        )}
      </div>
      <p className="text-center text-xs text-muted-foreground">Round {round + 1} • Type the word and press Enter</p>
    </div>
  );
}

// ─── Memory Match Game ──────────────────────────────────────────────────────────

type MemoryCard = { id: number; emoji: string; matched: boolean };

function MemoryMatchGame({ onBack }: { onBack: () => void }) {
  const [cards, setCards] = useState<MemoryCard[]>([]);
  const [flipped, setFlipped] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [matches, setMatches] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const pairCount = 8;

  useEffect(() => {
    const emojis = shuffle(MEMORY_EMOJIS).slice(0, pairCount);
    const deck = shuffle([...emojis, ...emojis].map((emoji, i) => ({
      id: i,
      emoji,
      matched: false,
    })));
    setCards(deck);
    setStartTime(Date.now());
  }, []);

  useEffect(() => {
    if (gameOver || startTime === 0) return;
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 200);
    return () => clearInterval(timer);
  }, [gameOver, startTime]);

  const handleFlip = (id: number) => {
    if (flipped.length >= 2) return;
    const card = cards.find((c) => c.id === id);
    if (!card || card.matched || flipped.includes(id)) return;

    const newFlipped = [...flipped, id];
    setFlipped(newFlipped);

    if (newFlipped.length === 2) {
      setMoves((m) => m + 1);
      const [a, b] = newFlipped.map((fid) => cards.find((c) => c.id === fid)!);
      if (a.emoji === b.emoji) {
        setTimeout(() => {
          setCards((prev) => prev.map((c) => (c.emoji === a.emoji ? { ...c, matched: true } : c)));
          setFlipped([]);
          const newMatches = matches + 1;
          setMatches(newMatches);
          if (newMatches === pairCount) setGameOver(true);
        }, 400);
      } else {
        setTimeout(() => setFlipped([]), 800);
      }
    }
  };

  if (gameOver) {
    const stars = moves <= pairCount + 2 ? 3 : moves <= pairCount + 6 ? 2 : 1;
    return (
      <GameOverScreen
        title="Memory Match"
        emoji="🧠"
        score={Math.max(1000 - moves * 20 - elapsed * 5, 100)}
        detail={`${moves} moves in ${elapsed}s — ${"⭐".repeat(stars)}`}
        onBack={onBack}
        onReplay={() => {
          const emojis = shuffle(MEMORY_EMOJIS).slice(0, pairCount);
          const deck = shuffle([...emojis, ...emojis].map((emoji, i) => ({
            id: i, emoji, matched: false,
          })));
          setCards(deck);
          setFlipped([]); setMoves(0); setMatches(0);
          setGameOver(false); setStartTime(Date.now());
        }}
      />
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <GameHeader title="Memory Match" emoji="🧠" onBack={onBack} />
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="text-sm"><span className="text-muted-foreground">Moves </span><span className="font-bold text-foreground">{moves}</span></div>
          <div className="text-sm"><span className="text-muted-foreground">Pairs </span><span className="font-bold text-foreground">{matches}/{pairCount}</span></div>
        </div>
        <div className="px-3 py-1.5 rounded-full bg-muted text-muted-foreground text-sm tabular-nums font-medium">
          ⏱ {elapsed}s
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2.5">
        {cards.map((card) => {
          const isFlipped = flipped.includes(card.id) || card.matched;
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => handleFlip(card.id)}
              disabled={card.matched}
              className={`aspect-square rounded-xl text-2xl sm:text-3xl font-medium flex items-center justify-center transition-all duration-300 ${
                card.matched
                  ? "bg-green-500/10 border-green-500/30 border scale-95 opacity-70"
                  : isFlipped
                  ? "bg-primary/10 border-primary/40 border scale-105"
                  : "bg-card border border-border hover:border-primary/30 hover:bg-accent/50 cursor-pointer active:scale-95"
              }`}
              style={{ perspective: "600px" }}
            >
              {isFlipped ? card.emoji : (
                <span className="text-muted-foreground/30 text-lg">RL</span>
              )}
            </button>
          );
        })}
      </div>
      <p className="text-center text-xs text-muted-foreground mt-4">Match all pairs with the fewest moves</p>
    </div>
  );
}

// ─── Task Rush Game ─────────────────────────────────────────────────────────────

function TaskRushGame({ onBack }: { onBack: () => void }) {
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [tasks, setTasks] = useState<Array<{ id: number; text: string; x: number; y: number; speed: number }>>([]);
  const [gameOver, setGameOver] = useState(false);
  const [started, setStarted] = useState(false);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const nextId = useRef(0);
  const areaRef = useRef<HTMLDivElement>(null);

  const spawnTask = useCallback(() => {
    const text = TASK_ITEMS[Math.floor(Math.random() * TASK_ITEMS.length)];
    const x = 5 + Math.random() * 70;
    const y = 5 + Math.random() * 75;
    const speed = 2000 + Math.random() * 3000;
    setTasks((prev) => [...prev.slice(-12), { id: nextId.current++, text, x, y, speed }]);
  }, []);

  useEffect(() => {
    if (!started || gameOver) return;
    const spawner = setInterval(spawnTask, 800);
    return () => clearInterval(spawner);
  }, [started, gameOver, spawnTask]);

  useEffect(() => {
    if (!started || gameOver) return;
    const timer = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) { setGameOver(true); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [started, gameOver]);

  // Remove expired tasks
  useEffect(() => {
    if (!started || gameOver) return;
    const cleanup = setInterval(() => {
      setTasks((prev) => {
        const now = Date.now();
        const filtered = prev.filter((t) => {
          // Tasks expire after their speed duration
          return true; // Let them persist until clicked or game ends
        });
        return filtered.length > 15 ? filtered.slice(-12) : filtered;
      });
    }, 500);
    return () => clearInterval(cleanup);
  }, [started, gameOver]);

  const handleClick = (taskId: number) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    const newStreak = streak + 1;
    setStreak(newStreak);
    if (newStreak > bestStreak) setBestStreak(newStreak);
    const multiplier = Math.min(1 + Math.floor(newStreak / 5) * 0.5, 3);
    const points = Math.round(10 * multiplier);
    setScore((s) => s + points);
  };

  if (!started) {
    return (
      <div className="max-w-lg mx-auto">
        <GameHeader title="Task Rush" emoji="⚡" onBack={onBack} />
        <div className="bg-card border border-border rounded-2xl p-10 text-center">
          <p className="text-6xl mb-4">⚡</p>
          <h3 className="text-xl font-bold text-foreground mb-2">Task Rush</h3>
          <p className="text-muted-foreground mb-6 text-sm leading-relaxed">
            Click the tasks as fast as you can!<br />
            Build streaks for bonus multipliers.<br />
            30 seconds on the clock.
          </p>
          <button
            type="button"
            onClick={() => setStarted(true)}
            className="px-8 py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:opacity-90 transition-opacity text-lg"
          >
            Start!
          </button>
        </div>
      </div>
    );
  }

  if (gameOver) {
    return (
      <GameOverScreen
        title="Task Rush"
        emoji="⚡"
        score={score}
        detail={`Best streak: ${bestStreak} tasks`}
        onBack={onBack}
        onReplay={() => {
          setScore(0); setTimeLeft(30); setTasks([]); setStreak(0);
          setBestStreak(0); setGameOver(false); setStarted(true);
        }}
      />
    );
  }

  const multiplier = Math.min(1 + Math.floor(streak / 5) * 0.5, 3);

  return (
    <div className="max-w-2xl mx-auto">
      <GameHeader title="Task Rush" emoji="⚡" onBack={onBack} />
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <span className="text-2xl font-bold tabular-nums text-foreground">{score}</span>
          {streak >= 3 && (
            <span className="px-2.5 py-1 rounded-full bg-orange-500/10 text-orange-500 text-xs font-bold animate-in fade-in">
              🔥 {streak} streak ({multiplier}x)
            </span>
          )}
        </div>
        <div className={`px-3 py-1.5 rounded-full text-sm font-medium tabular-nums ${timeLeft <= 10 ? "bg-red-500/10 text-red-500 animate-pulse" : "bg-muted text-muted-foreground"}`}>
          ⏱ {timeLeft}s
        </div>
      </div>

      <div
        ref={areaRef}
        className="relative bg-card border border-border rounded-2xl overflow-hidden select-none"
        style={{ height: "420px" }}
        onClick={() => setStreak(0)} // Miss = reset streak
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(var(--primary),.03),transparent_70%)]" />
        {tasks.map((task) => (
          <button
            key={task.id}
            type="button"
            onClick={(e) => { e.stopPropagation(); handleClick(task.id); }}
            className="absolute px-3 py-2 rounded-lg bg-primary/10 border border-primary/20 text-xs sm:text-sm font-medium text-foreground hover:bg-primary/20 hover:border-primary/40 active:scale-90 transition-all cursor-pointer animate-in fade-in zoom-in-95 duration-200"
            style={{ left: `${task.x}%`, top: `${task.y}%`, maxWidth: "60%" }}
          >
            {task.text}
          </button>
        ))}
        {tasks.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/50 text-sm">
            Tasks incoming...
          </div>
        )}
      </div>
      <p className="text-center text-xs text-muted-foreground mt-3">Click tasks to complete them • Missing resets your streak</p>
    </div>
  );
}

// ─── Inbox Zero Game (Catch falling tasks, dodge spam) ──────────────────────

const INBOX_TASKS: Array<{ emoji: string; label: string; points: number; good: boolean }> = [
  { emoji: "📧", label: "Email", points: 10, good: true },
  { emoji: "📊", label: "Report", points: 15, good: true },
  { emoji: "📞", label: "Client Call", points: 20, good: true },
  { emoji: "📋", label: "Schedule", points: 10, good: true },
  { emoji: "💰", label: "Invoice", points: 25, good: true },
  { emoji: "🔍", label: "Lead", points: 15, good: true },
  { emoji: "🚫", label: "Spam", points: -20, good: false },
  { emoji: "🗑️", label: "Junk", points: -15, good: false },
];

type FallingTask = { emoji: string; label: string; points: number; good: boolean; x: number; y: number; id: number; speed: number };

function InboxZeroGame({ onBack }: { onBack: () => void }) {
  const [paddle, setPaddle] = useState(50);
  const [tasks, setTasks] = useState<FallingTask[]>([]);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [gameOver, setGameOver] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [combo, setCombo] = useState(0);
  const [floatingTexts, setFloatingTexts] = useState<Array<{ id: number; x: number; text: string; good: boolean }>>([]);
  const frameRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ paddle: 50, tasks: [] as FallingTask[], score: 0, lives: 3, gameOver: false, combo: 0, lastSpawn: 0, speed: 1 });

  const startGame = () => {
    setScore(0); setLives(3); setTasks([]); setGameOver(false);
    setGameStarted(true); setCombo(0); setFloatingTexts([]);
    stateRef.current = { paddle: 50, tasks: [], score: 0, lives: 3, gameOver: false, combo: 0, lastSpawn: 0, speed: 1 };
  };

  useEffect(() => {
    if (!gameStarted || gameOver) return;

    const handleMove = (clientX: number) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * 100;
      const clamped = Math.max(8, Math.min(92, x));
      setPaddle(clamped);
      stateRef.current.paddle = clamped;
    };

    const onMouse = (e: MouseEvent) => handleMove(e.clientX);
    const onTouch = (e: TouchEvent) => { e.preventDefault(); handleMove(e.touches[0].clientX); };

    const el = containerRef.current;
    if (el) {
      el.addEventListener("mousemove", onMouse);
      el.addEventListener("touchmove", onTouch, { passive: false });
    }

    let frame = 0;
    const loop = () => {
      const s = stateRef.current;
      if (s.gameOver) return;
      frame++;
      s.speed = 1 + s.score / 200;

      if (frame - s.lastSpawn > Math.max(25, 55 - s.score / 10)) {
        const type = INBOX_TASKS[Math.floor(Math.random() * INBOX_TASKS.length)];
        s.tasks.push({ ...type, x: 10 + Math.random() * 80, y: -5, id: Math.random(), speed: (0.3 + Math.random() * 0.3) * s.speed });
        s.lastSpawn = frame;
      }

      const alive: FallingTask[] = [];
      for (const t of s.tasks) {
        t.y += t.speed;
        if (t.y > 85 && t.y < 96 && Math.abs(t.x - s.paddle) < 12) {
          const pts = t.points * (t.good ? 1 + Math.floor(s.combo / 3) : 1);
          s.score = Math.max(0, s.score + pts);
          if (t.good) { s.combo++; } else { s.combo = 0; s.lives--; }
          setFloatingTexts(prev => [...prev.slice(-6), { id: t.id, x: t.x, text: pts > 0 ? `+${pts}` : `${pts}`, good: t.good }]);
        } else if (t.y > 105) {
          if (t.good) { s.lives--; s.combo = 0; }
        } else {
          alive.push(t);
        }
      }
      s.tasks = alive;

      if (s.lives <= 0) { s.gameOver = true; setGameOver(true); }

      setTasks([...s.tasks]);
      setScore(s.score);
      setLives(s.lives);
      setCombo(s.combo);

      frameRef.current = requestAnimationFrame(loop);
    };

    frameRef.current = requestAnimationFrame(loop);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      if (el) { el.removeEventListener("mousemove", onMouse); el.removeEventListener("touchmove", onTouch); }
    };
  }, [gameStarted, gameOver]);

  if (gameOver) {
    return (
      <GameOverScreen title="Inbox Zero" emoji="📥" score={score}
        detail={`Best combo: ${combo}x`} onBack={onBack} onReplay={startGame} />
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <GameHeader title="Inbox Zero" emoji="📥" onBack={onBack} />
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold tabular-nums text-foreground">{score}</span>
          {combo >= 3 && (
            <span className="px-2.5 py-1 rounded-full bg-orange-500/10 text-orange-500 text-xs font-bold">
              🔥 x{1 + Math.floor(combo / 3)}
            </span>
          )}
        </div>
        <div className="text-sm font-medium text-red-500 tabular-nums">
          {"❤️".repeat(Math.max(0, lives))}{"🖤".repeat(Math.max(0, 3 - lives))}
        </div>
      </div>

      <div ref={containerRef} className="relative bg-card border border-border rounded-2xl overflow-hidden select-none" style={{ height: "420px", cursor: gameStarted ? "none" : "pointer" }}>
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-primary/5" />

        {!gameStarted && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
            <p className="text-6xl mb-4">📥</p>
            <h3 className="text-xl font-bold text-foreground mb-2">Inbox Zero</h3>
            <p className="text-muted-foreground mb-6 text-sm text-center px-6">
              Move your paddle to catch tasks!<br />Dodge spam 🚫 and junk 🗑️
            </p>
            <button type="button" onClick={startGame}
              className="px-8 py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:opacity-90 transition-opacity text-lg">
              Start!
            </button>
          </div>
        )}

        {tasks.map(t => (
          <div key={t.id} className="absolute transition-none" style={{ left: `${t.x}%`, top: `${t.y}%`, transform: "translate(-50%, -50%)", fontSize: "24px" }}>
            {t.emoji}
          </div>
        ))}

        {floatingTexts.map(ft => (
          <div key={ft.id} className="absolute pointer-events-none animate-in fade-in slide-in-from-bottom-2 duration-500"
            style={{ left: `${ft.x}%`, top: "78%", transform: "translateX(-50%)" }}>
            <span className={`text-xs font-bold font-mono ${ft.good ? "text-green-500" : "text-red-500"}`}>{ft.text}</span>
          </div>
        ))}

        {gameStarted && (
          <div className="absolute rounded-full bg-gradient-to-r from-primary to-blue-500 shadow-lg shadow-primary/20"
            style={{ bottom: "4%", left: `${paddle}%`, transform: "translateX(-50%)", width: "60px", height: "14px", transition: "left 0.016s linear" }} />
        )}
      </div>
      <p className="text-center text-xs text-muted-foreground mt-3">Move your mouse (or finger) to catch tasks</p>
    </div>
  );
}

// ─── Globe Hopper Game (Flappy Bird meets Time Zones) ───────────────────────

const COUNTRIES = ["🇵🇭", "🇲🇽", "🇨🇴", "🇦🇷", "🇧🇷", "🇵🇪"];
const VA_NAMES_LIST = ["Sofia", "Carlos", "Maria", "Diego", "Isabella", "Mateo", "Valentina", "Santiago", "Camila", "Andres"];

type Pipe = { x: number; gapTop: number; gapBottom: number; scored: boolean; id: number; country: string; vaName: string };

function GlobeHopperGame({ onBack }: { onBack: () => void }) {
  const [gameState, setGameState] = useState<"idle" | "playing" | "dead">("idle");
  const [vaY, setVaY] = useState(50);
  const [pipes, setPipes] = useState<Pipe[]>([]);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const stateRef = useRef({ y: 50, vy: 0, pipes: [] as Pipe[], score: 0, frame: 0, gameState: "idle" as string });
  const frameRef = useRef<number>(0);

  const jump = useCallback(() => {
    if (stateRef.current.gameState === "dead") return;
    if (stateRef.current.gameState === "idle") {
      stateRef.current = { y: 50, vy: 0, pipes: [], score: 0, frame: 0, gameState: "playing" };
      setGameState("playing"); setScore(0); setPipes([]);
    }
    stateRef.current.vy = -2.8;
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp") { e.preventDefault(); jump(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [jump]);

  useEffect(() => {
    const loop = () => {
      const s = stateRef.current;
      if (s.gameState === "playing") {
        s.frame++;
        s.vy += 0.12;
        s.y += s.vy;

        if (s.frame % 90 === 0) {
          const gapCenter = 25 + Math.random() * 50;
          const gapSize = Math.max(22, 30 - s.score);
          s.pipes.push({
            x: 105, gapTop: gapCenter - gapSize / 2, gapBottom: gapCenter + gapSize / 2,
            scored: false, id: Math.random(),
            country: COUNTRIES[Math.floor(Math.random() * COUNTRIES.length)],
            vaName: VA_NAMES_LIST[Math.floor(Math.random() * VA_NAMES_LIST.length)],
          });
        }

        const speed = 0.6 + s.score * 0.02;
        for (const p of s.pipes) {
          p.x -= speed;
          if (!p.scored && p.x < 18) { p.scored = true; s.score++; }
        }
        s.pipes = s.pipes.filter(p => p.x > -15);

        const vaTop = s.y - 3, vaBottom = s.y + 3;
        let died = s.y < -2 || s.y > 102;
        for (const p of s.pipes) {
          if (p.x > 12 && p.x < 24 && (vaTop < p.gapTop || vaBottom > p.gapBottom)) { died = true; break; }
        }
        if (died) {
          s.gameState = "dead"; setGameState("dead");
          setHighScore(hs => Math.max(hs, s.score));
        }

        setVaY(s.y); setScore(s.score); setPipes([...s.pipes]);
      }
      frameRef.current = requestAnimationFrame(loop);
    };
    frameRef.current = requestAnimationFrame(loop);
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
  }, []);

  const restart = () => {
    stateRef.current = { y: 50, vy: 0, pipes: [], score: 0, frame: 0, gameState: "idle" };
    setGameState("idle"); setVaY(50); setPipes([]); setScore(0);
  };

  return (
    <div className="max-w-lg mx-auto">
      <GameHeader title="Globe Hopper" emoji="🌎" onBack={onBack} />
      <div className="flex items-center justify-between mb-3">
        <span className="text-2xl font-bold tabular-nums text-foreground">{score}</span>
        <span className="text-sm text-muted-foreground tabular-nums">👑 Best: {highScore}</span>
      </div>

      <div onClick={jump} onTouchStart={(e) => { e.preventDefault(); jump(); }}
        className="relative bg-gradient-to-b from-slate-900 via-sky-950 to-slate-800 border border-border rounded-2xl overflow-hidden select-none cursor-pointer"
        style={{ height: "420px" }}>

        {/* Stars */}
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} className="absolute bg-white rounded-full" style={{
            left: `${(i * 37 + 13) % 100}%`, top: `${(i * 23 + 7) % 55}%`,
            width: 2, height: 2, opacity: 0.2 + (i % 3) * 0.15,
          }} />
        ))}

        {/* Pipes */}
        {pipes.map(p => (
          <div key={p.id}>
            <div className="absolute bg-gradient-to-b from-purple-500/80 to-purple-500/50 rounded-b-lg shadow-lg shadow-purple-500/20"
              style={{ left: `${p.x - 4}%`, top: 0, width: "8%", height: `${p.gapTop}%` }} />
            <div className="absolute bg-gradient-to-b from-purple-500/50 to-purple-500/80 rounded-t-lg shadow-lg shadow-purple-500/20"
              style={{ left: `${p.x - 4}%`, top: `${p.gapBottom}%`, width: "8%", bottom: 0 }} />
            <div className="absolute text-center" style={{ left: `${p.x - 2}%`, top: `${(p.gapTop + p.gapBottom) / 2 - 3}%` }}>
              <span className="text-lg">{p.country}</span>
              <div className="text-[8px] text-slate-400 font-mono">{p.vaName}</div>
            </div>
          </div>
        ))}

        {/* VA Character */}
        <div className="absolute text-3xl transition-transform duration-100" style={{
          left: "16%", top: `${vaY}%`,
          transform: `translateY(-50%) rotate(${Math.min(45, Math.max(-30, stateRef.current.vy * 8))}deg)`,
          filter: gameState === "dead" ? "grayscale(1)" : "none",
        }}>💼</div>

        {/* Idle overlay */}
        {gameState === "idle" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-5xl mb-4">🌎</p>
            <h3 className="text-xl font-bold text-white mb-2">Globe Hopper</h3>
            <p className="text-slate-400 text-sm mb-6 text-center px-6">
              Tap or press Space to fly between time zones!
            </p>
            <div className="px-6 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white text-sm font-medium">
              Tap to Start
            </div>
          </div>
        )}

        {/* Dead overlay */}
        {gameState === "dead" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/80">
            <p className="text-5xl mb-4">😵</p>
            <h3 className="text-xl font-bold text-red-400 mb-1">Time Zone Crash!</h3>
            <p className="text-slate-400 text-sm mb-1">Score: {score} zones</p>
            {score === highScore && score > 0 && <p className="text-yellow-400 text-xs mb-4">🏆 New High Score!</p>}
            <button type="button" onClick={(e) => { e.stopPropagation(); restart(); }}
              className="px-6 py-2.5 bg-primary text-primary-foreground rounded-xl font-semibold hover:opacity-90 transition-opacity mt-2">
              Try Again
            </button>
          </div>
        )}
      </div>
      <p className="text-center text-xs text-muted-foreground mt-3">Tap / click / spacebar to fly • Avoid the purple barriers</p>
    </div>
  );
}

// ─── VA Trivia Game ──────────────────────────────────────────────────────────

const TRIVIA_QUESTIONS: Array<{ q: string; answers: string[]; correct: number }> = [
  { q: "What does 'VA' stand for in Remote Leverage's context?", answers: ["Very Awesome", "Virtual Assistant", "Vice Admin", "Value Added"], correct: 1 },
  { q: "Which regions does RL primarily hire from?", answers: ["Europe & Africa", "Asia & Latin America", "North America", "Middle East"], correct: 1 },
  { q: "How much can businesses save by hiring through RL?", answers: ["Up to 30%", "Up to 50%", "Up to 70%", "Up to 90%"], correct: 2 },
  { q: "What does 'Inbox Zero' mean in productivity?", answers: ["Delete all emails", "Empty inbox at end of day", "Never check email", "Zero spam"], correct: 1 },
  { q: "What is the standard onboarding tool used by RL?", answers: ["Slack", "Zoom", "Microsoft Teams", "Google Meet"], correct: 1 },
  { q: "In HRIQ, what does KYC stand for?", answers: ["Keep Your Credentials", "Know Your Customer", "Key Yearly Check", "Knowledge Yield Chart"], correct: 1 },
  { q: "What currency does RL primarily pay VAs in?", answers: ["EUR", "BTC", "USD", "GBP"], correct: 2 },
  { q: "Which time tracking tool does RL use?", answers: ["Toggl", "Clockify", "Time Doctor", "Harvest"], correct: 2 },
  { q: "What is the typical daily hours target for an RL VA?", answers: ["4 hours", "6 hours", "7.25 hours", "8 hours"], correct: 2 },
  { q: "What type of fee does RL charge?", answers: ["Monthly retainer", "% of salary", "One-time flat fee", "Subscription"], correct: 2 },
  { q: "What does 'offboarding' refer to?", answers: ["Taking a vacation", "Employee exit process", "Changing departments", "Remote login"], correct: 1 },
  { q: "Which messaging platform is RL's main team tool?", answers: ["Discord", "WhatsApp", "Slack", "Telegram"], correct: 2 },
];

function VATriviaGame({ onBack }: { onBack: () => void }) {
  const [questions, setQuestions] = useState<typeof TRIVIA_QUESTIONS>([]);
  const [current, setCurrent] = useState(0);
  const [score, setScore] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [streak, setStreak] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [timeLeft, setTimeLeft] = useState(15);

  const initGame = useCallback(() => {
    setQuestions(shuffle(TRIVIA_QUESTIONS).slice(0, 10));
    setCurrent(0); setScore(0); setSelected(null); setStreak(0);
    setGameOver(false); setTimeLeft(15);
  }, []);

  useEffect(() => { initGame(); }, [initGame]);

  useEffect(() => {
    if (gameOver || selected !== null || questions.length === 0) return;
    const timer = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          setStreak(0);
          if (current + 1 >= questions.length) { setGameOver(true); }
          else { setCurrent(c => c + 1); setSelected(null); return 15; }
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [gameOver, selected, current, questions.length]);

  const handleAnswer = (idx: number) => {
    if (selected !== null) return;
    setSelected(idx);
    const correct = idx === questions[current].correct;
    if (correct) {
      const bonus = timeLeft;
      const streakBonus = streak * 5;
      setScore(s => s + 10 + bonus + streakBonus);
      setStreak(s => s + 1);
    } else {
      setStreak(0);
    }
    setTimeout(() => {
      if (current + 1 >= questions.length) { setGameOver(true); }
      else { setCurrent(c => c + 1); setSelected(null); setTimeLeft(15); }
    }, 1200);
  };

  if (gameOver) {
    const pct = Math.round((score / (questions.length * 35)) * 100);
    return (
      <GameOverScreen title="VA Trivia" emoji="🧠" score={score}
        detail={`${pct}% knowledge rating`} onBack={onBack} onReplay={initGame} />
    );
  }

  if (questions.length === 0) return null;
  const q = questions[current];

  return (
    <div className="max-w-lg mx-auto">
      <GameHeader title="VA Trivia" emoji="🧠" onBack={onBack} />
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold tabular-nums text-foreground">{score}</span>
          {streak >= 2 && <span className="px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-500 text-xs font-bold">🔥 {streak}</span>}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{current + 1}/{questions.length}</span>
          <span className={`px-3 py-1 rounded-full text-sm font-medium tabular-nums ${timeLeft <= 5 ? "bg-red-500/10 text-red-500 animate-pulse" : "bg-muted text-muted-foreground"}`}>
            ⏱ {timeLeft}s
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-muted mb-6 overflow-hidden">
        <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${((current + 1) / questions.length) * 100}%` }} />
      </div>

      <div className="bg-card border border-border rounded-2xl p-6 mb-4">
        <p className="text-lg font-semibold text-foreground leading-relaxed mb-6">{q.q}</p>
        <div className="space-y-3">
          {q.answers.map((answer, idx) => {
            let cls = "bg-background border-border hover:border-primary/40 hover:bg-accent/30 cursor-pointer";
            if (selected !== null) {
              if (idx === q.correct) cls = "bg-green-500/10 border-green-500/50 text-green-600";
              else if (idx === selected) cls = "bg-red-500/10 border-red-500/50 text-red-500";
              else cls = "opacity-50 border-border bg-background";
            }
            return (
              <button key={idx} type="button" onClick={() => handleAnswer(idx)}
                disabled={selected !== null}
                className={`w-full text-left px-4 py-3.5 rounded-xl border text-sm font-medium transition-all ${cls}`}>
                <span className="text-muted-foreground mr-3">{String.fromCharCode(65 + idx)}.</span>
                {answer}
              </button>
            );
          })}
        </div>
      </div>
      <p className="text-center text-xs text-muted-foreground">Answer fast for bonus points • Streaks multiply your score</p>
    </div>
  );
}

// ─── Shared Components ──────────────────────────────────────────────────────────

function GameHeader({ title, emoji, onBack }: { title: string; emoji: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <button
        type="button"
        onClick={onBack}
        className="p-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
      </button>
      <span className="text-2xl">{emoji}</span>
      <h2 className="text-xl font-bold text-foreground">{title}</h2>
    </div>
  );
}

function GameOverScreen({
  title, emoji, score, detail, onBack, onReplay,
}: {
  title: string; emoji: string; score: number; detail: string;
  onBack: () => void; onReplay: () => void;
}) {
  return (
    <div className="max-w-md mx-auto">
      <GameHeader title={title} emoji={emoji} onBack={onBack} />
      <div className="bg-card border border-border rounded-2xl p-10 text-center">
        <div className="text-6xl mb-2">🎉</div>
        <h3 className="text-2xl font-bold text-foreground mb-1">Game Over!</h3>
        <div className="my-6">
          <p className="text-5xl font-black tabular-nums text-primary mb-1">{score.toLocaleString()}</p>
          <p className="text-sm text-muted-foreground">points</p>
        </div>
        <p className="text-sm text-muted-foreground mb-8">{detail}</p>
        <div className="flex gap-3 justify-center">
          <button
            type="button"
            onClick={onBack}
            className="px-5 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-accent transition-colors"
          >
            All Games
          </button>
          <button
            type="button"
            onClick={onReplay}
            className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            Play Again
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Games Hub (Main Export) ────────────────────────────────────────────────────

export function GamesHub() {
  const [activeGame, setActiveGame] = useState<GameId>(null);

  if (activeGame === "word-scramble") return <WordScrambleGame onBack={() => setActiveGame(null)} />;
  if (activeGame === "memory-match") return <MemoryMatchGame onBack={() => setActiveGame(null)} />;
  if (activeGame === "task-rush") return <TaskRushGame onBack={() => setActiveGame(null)} />;
  if (activeGame === "inbox-zero") return <InboxZeroGame onBack={() => setActiveGame(null)} />;
  if (activeGame === "globe-hopper") return <GlobeHopperGame onBack={() => setActiveGame(null)} />;
  if (activeGame === "va-trivia") return <VATriviaGame onBack={() => setActiveGame(null)} />;

  return (
    <div className="max-w-3xl mx-auto animate-in fade-in duration-300">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-foreground mb-2">Team Games</h1>
        <p className="text-muted-foreground text-sm">Take a break and challenge your team! All games are Remote Leverage themed.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <GameCard
          title="Word Scramble"
          description="Unscramble HR & remote work terms before time runs out. How many can you get in 60 seconds?"
          emoji="🔤"
          color="blue"
          onClick={() => setActiveGame("word-scramble")}
        />
        <GameCard
          title="Memory Match"
          description="Match pairs of RL-themed cards. Test your memory with the fewest moves possible."
          emoji="🧠"
          color="purple"
          onClick={() => setActiveGame("memory-match")}
        />
        <GameCard
          title="Task Rush"
          description="Click incoming tasks as fast as you can! Build streaks for multiplier bonuses."
          emoji="⚡"
          color="orange"
          onClick={() => setActiveGame("task-rush")}
        />
        <GameCard
          title="Inbox Zero"
          description="Catch falling tasks with your paddle — dodge spam and junk to keep your inbox clean!"
          emoji="📥"
          color="green"
          onClick={() => setActiveGame("inbox-zero")}
        />
        <GameCard
          title="Globe Hopper"
          description="Fly through time zone barriers in this flappy-bird style game. How far can you go?"
          emoji="🌎"
          color="blue"
          onClick={() => setActiveGame("globe-hopper")}
        />
        <GameCard
          title="VA Trivia"
          description="Test your knowledge of remote work, RL culture, and VA operations. Answer fast for bonuses!"
          emoji="🧠"
          color="pink"
          onClick={() => setActiveGame("va-trivia")}
        />
      </div>

      <div className="mt-8 p-4 rounded-xl bg-muted/50 border border-border/50 text-center">
        <p className="text-xs text-muted-foreground">
          🏆 Challenge your teammates! Share your high scores in Slack.
        </p>
      </div>
    </div>
  );
}
