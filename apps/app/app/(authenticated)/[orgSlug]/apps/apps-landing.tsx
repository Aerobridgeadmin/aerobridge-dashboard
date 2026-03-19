"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  GlobeIcon,
  KeyboardIcon,
  Sparkles,
  TimerIcon,
  StickyNoteIcon,
  CalculatorIcon,
  ShieldCheckIcon,
  CheckSquareIcon,
  DollarSignIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type AppCard = {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  color: string;
  category: "productivity" | "team" | "utility";
};

const APPS: AppCard[] = [
  // Productivity
  { id: "notepad", name: "Notepad", description: "Multi-tab scratchpad with word count and .txt export", icon: StickyNoteIcon, color: "from-amber-500 to-amber-700", category: "productivity" },
  { id: "focus-timer", name: "Focus Timer", description: "Pomodoro timer with session tracking and break reminders", icon: TimerIcon, color: "from-rose-500 to-rose-700", category: "productivity" },
  { id: "habit-tracker", name: "Habit Tracker", description: "Weekly habit grid with streaks and daily progress", icon: CheckSquareIcon, color: "from-violet-500 to-violet-700", category: "productivity" },
  // Team
  { id: "world-clock", name: "World Clock", description: "See team timezones at a glance with working hours", icon: GlobeIcon, color: "from-teal-500 to-teal-700", category: "team" },
  { id: "icebreakers", name: "Icebreaker Generator", description: "Random conversation starters for meetings and 1-on-1s", icon: Sparkles, color: "from-fuchsia-500 to-fuchsia-700", category: "team" },
  { id: "meeting-cost", name: "Meeting Cost", description: "Real-time counter showing how much a meeting costs", icon: DollarSignIcon, color: "from-orange-500 to-orange-700", category: "team" },
  { id: "typing-test", name: "Typing Test", description: "Test WPM with work-themed sentences — VA assessment", icon: KeyboardIcon, color: "from-sky-500 to-sky-700", category: "team" },
  // Utility
  { id: "calculator", name: "Calculator", description: "Full calculator with keyboard shortcuts and history", icon: CalculatorIcon, color: "from-slate-500 to-slate-700", category: "utility" },
  { id: "password-generator", name: "Password Generator", description: "Cryptographic passwords with strength meter", icon: ShieldCheckIcon, color: "from-emerald-500 to-emerald-700", category: "utility" },
];

const CATEGORIES = [
  { key: "productivity", label: "Productivity", icon: TimerIcon },
  { key: "team", label: "Team & Collaboration", icon: GlobeIcon },
  { key: "utility", label: "Utilities", icon: CalculatorIcon },
] as const;

export function AppsLanding() {
  const params = useParams();
  const orgSlug = params.orgSlug as string;

  return (
    <div className="flex flex-1 flex-col p-6 max-w-5xl mx-auto w-full">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Apps</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Team tools and utilities — all built into HRIQ
        </p>
      </div>

      {CATEGORIES.map((cat) => {
        const apps = APPS.filter((a) => a.category === cat.key);
        if (apps.length === 0) return null;
        return (
          <div key={cat.key} className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <cat.icon className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{cat.label}</h2>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {apps.map((app) => (
                <Link
                  key={app.id}
                  href={`/${orgSlug}/apps/${app.id}`}
                  className="group flex items-start gap-3.5 rounded-xl border bg-card p-4 transition-all hover:shadow-md hover:border-primary/30"
                >
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${app.color} text-white shadow-sm`}>
                    <app.icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-sm group-hover:text-primary transition-colors">{app.name}</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{app.description}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
