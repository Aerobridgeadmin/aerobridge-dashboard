"use client";

import { useState, useMemo } from "react";

const COLORS = ["bg-emerald-500", "bg-blue-500", "bg-violet-500", "bg-rose-500", "bg-amber-500", "bg-teal-500"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Habit = { id: string; name: string; color: string };

function getWeekDates(): string[] {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d.toISOString().split("T")[0];
  });
}

export function HabitTrackerApp() {
  const [habits, setHabits] = useState<Habit[]>([
    { id: "1", name: "Exercise", color: COLORS[0] },
    { id: "2", name: "Read 30 min", color: COLORS[1] },
    { id: "3", name: "No social media", color: COLORS[2] },
  ]);
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const [newHabit, setNewHabit] = useState("");

  const weekDates = useMemo(getWeekDates, []);
  const today = new Date().toISOString().split("T")[0];

  const toggleComplete = (habitId: string, date: string) => {
    const key = `${habitId}:${date}`;
    setCompleted((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const addHabit = () => {
    if (!newHabit.trim()) return;
    setHabits((prev) => [
      ...prev,
      { id: Date.now().toString(), name: newHabit.trim(), color: COLORS[prev.length % COLORS.length] },
    ]);
    setNewHabit("");
  };

  const removeHabit = (id: string) => setHabits((prev) => prev.filter((h) => h.id !== id));

  const getStreak = (habitId: string): number => {
    let streak = 0;
    const sorted = [...weekDates].reverse();
    for (const date of sorted) {
      if (date > today) continue;
      if (completed[`${habitId}:${date}`]) streak++;
      else break;
    }
    return streak;
  };

  const todayProgress = habits.length > 0
    ? Math.round((habits.filter((h) => completed[`${h.id}:${today}`]).length / habits.length) * 100)
    : 0;

  return (
    <div className="flex flex-1 flex-col p-6 gap-6 max-w-3xl mx-auto w-full">
      {/* Today's summary */}
      <div className="rounded-2xl border bg-card p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm font-semibold">Today&apos;s Progress</div>
            <div className="text-xs text-muted-foreground">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div>
          </div>
          <div className="text-3xl font-bold tabular-nums">{todayProgress}%</div>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${todayProgress}%` }} />
        </div>
      </div>

      {/* Weekly grid */}
      <div className="rounded-2xl border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-muted/30">
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-[180px]">Habit</th>
                {weekDates.map((date, i) => (
                  <th key={date} className={`px-2 py-3 text-center text-xs font-medium ${date === today ? "text-primary font-bold" : "text-muted-foreground"}`}>
                    <div>{DAYS[i]}</div>
                    <div className="text-[10px]">{new Date(date + "T12:00:00").getDate()}</div>
                  </th>
                ))}
                <th className="px-3 py-3 text-center text-xs font-medium text-muted-foreground">Streak</th>
              </tr>
            </thead>
            <tbody>
              {habits.map((habit) => (
                <tr key={habit.id} className="border-t border-border/40 group">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className={`h-2.5 w-2.5 rounded-full ${habit.color}`} />
                      <span className="text-sm font-medium truncate max-w-[140px]">{habit.name}</span>
                      <button
                        onClick={() => removeHabit(habit.id)}
                        className="opacity-0 group-hover:opacity-100 ml-auto text-muted-foreground hover:text-red-500 transition-all"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  </td>
                  {weekDates.map((date) => {
                    const key = `${habit.id}:${date}`;
                    const done = completed[key];
                    const isFuture = date > today;
                    return (
                      <td key={date} className="px-2 py-3 text-center">
                        <button
                          onClick={() => !isFuture && toggleComplete(habit.id, date)}
                          disabled={isFuture}
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-all ${
                            isFuture
                              ? "bg-muted/20 cursor-not-allowed"
                              : done
                                ? `${habit.color} text-white shadow-sm scale-105`
                                : "border border-border hover:bg-muted/50 hover:scale-105"
                          }`}
                        >
                          {done && (
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                      </td>
                    );
                  })}
                  <td className="px-3 py-3 text-center">
                    <span className="inline-flex items-center gap-1 text-sm font-bold tabular-nums">
                      {getStreak(habit.id)}
                      {getStreak(habit.id) >= 3 && <span className="text-xs">d</span>}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Add habit */}
        <div className="border-t p-3 flex gap-2">
          <input
            type="text"
            value={newHabit}
            onChange={(e) => setNewHabit(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addHabit()}
            placeholder="Add a new habit…"
            maxLength={50}
            className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:border-primary focus:outline-none"
          />
          <button
            onClick={addHabit}
            disabled={!newHabit.trim()}
            className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
