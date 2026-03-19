"use client";

import { useState, useCallback } from "react";
import { Shuffle, Copy, Check, Sparkles, Heart, Lightbulb, Laugh, Globe, Coffee, Bookmark, Star, ChevronDown } from "lucide-react";

type Category = "fun" | "work" | "deep" | "wouldYouRather" | "thisOrThat";

const ICEBREAKERS: Record<Category, string[]> = {
  fun: [
    "If you could have dinner with any person, living or dead, who would it be?",
    "What is the most unusual food you have ever tried?",
    "If you could instantly become an expert in something, what would it be?",
    "What is your go-to karaoke song?",
    "If your life had a theme song, what would it be?",
    "What is the best vacation you have ever been on?",
    "If you could live in any TV show universe, which would you pick?",
    "What is a hobby you have always wanted to try but have not yet?",
    "What is the funniest thing that happened to you this week?",
    "If you won the lottery tomorrow, what is the first thing you would do?",
    "What is your most unpopular food opinion?",
    "If you could time travel, would you go to the past or the future?",
    "What was the last thing that made you laugh out loud?",
    "If you could have any superpower for just one day, what would it be?",
    "What is the best gift you have ever received?",
    "If you could switch lives with a coworker for a day, who would you pick?",
    "What is the weirdest talent you have?",
    "What is on your bucket list?",
    "If you had to eat one cuisine for the rest of your life, what would it be?",
    "What is your guilty pleasure TV show?",
  ],
  work: [
    "What is one skill you have learned in the last year that you are proud of?",
    "What is the best piece of career advice you have ever received?",
    "Describe your ideal workday in three words.",
    "What is the most rewarding project you have worked on?",
    "How do you stay productive when working from home?",
    "What tool or app could you not work without?",
    "What does your morning routine look like?",
    "What is one thing you wish more people knew about your role?",
    "If you could add one perk to our workplace, what would it be?",
    "What is a professional goal you are currently working toward?",
    "How do you recharge after a stressful day?",
    "What is the best meeting you have ever been in and why?",
    "If you could mentor your younger self, what would you say?",
    "What is one thing that makes remote work better for you than office work?",
    "Share a productivity hack that actually works for you.",
  ],
  deep: [
    "What is something you changed your mind about recently?",
    "What is a value you never compromise on?",
    "What is the kindest thing someone has done for you?",
    "If you could solve one world problem, what would it be?",
    "What is a lesson life taught you the hard way?",
    "What are you most grateful for right now?",
    "What does success look like to you personally?",
    "Who has had the biggest influence on your life?",
    "What motivates you to get out of bed every morning?",
    "If you could write a message to the entire world, what would it say?",
    "What is something about yourself that surprises people?",
    "What does balance mean to you?",
  ],
  wouldYouRather: [
    "Would you rather have the ability to fly or be invisible?",
    "Would you rather work 4 days a week or work from anywhere?",
    "Would you rather always be 10 minutes early or 10 minutes late?",
    "Would you rather have a personal chef or a personal trainer?",
    "Would you rather live in the mountains or by the beach?",
    "Would you rather never use social media again or never watch TV again?",
    "Would you rather have unlimited travel or unlimited money for food?",
    "Would you rather know every language or play every instrument?",
    "Would you rather have a rewind button or a pause button for life?",
    "Would you rather give up coffee or give up music?",
    "Would you rather have meetings only on Mondays or on Fridays?",
    "Would you rather always know the time or always know the direction?",
  ],
  thisOrThat: [
    "Coffee or Tea?", "Morning person or Night owl?", "Books or Movies?",
    "Cats or Dogs?", "Beach or Mountains?", "Call or Text?",
    "Sweet or Savory?", "Solo travel or Group travel?", "City or Countryside?",
    "Planner or Spontaneous?", "Podcasts or Music?", "Hot weather or Cold weather?",
    "Early bird or Last minute?", "Cooking or Ordering in?", "Window seat or Aisle seat?",
    "Minimalist or Maximalist?", "Zoom on or Zoom off?", "Slack DM or Email?",
    "Standing desk or Sitting desk?", "One big task or Many small tasks?",
  ],
};

const CATEGORY_META: Record<Category, { label: string; icon: typeof Sparkles; color: string }> = {
  fun: { label: "Fun & Casual", icon: Laugh, color: "text-amber-500" },
  work: { label: "Work & Career", icon: Coffee, color: "text-blue-500" },
  deep: { label: "Deep & Meaningful", icon: Heart, color: "text-pink-500" },
  wouldYouRather: { label: "Would You Rather", icon: Lightbulb, color: "text-violet-500" },
  thisOrThat: { label: "This or That", icon: Star, color: "text-emerald-500" },
};

export function IcebreakersApp() {
  const [category, setCategory] = useState<Category>("fun");
  const [question, setQuestion] = useState(ICEBREAKERS.fun[0]);
  const [saved, setSaved] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [showSaved, setShowSaved] = useState(false);

  const randomize = useCallback(() => {
    setSpinning(true);
    let count = 0;
    const pool = ICEBREAKERS[category];
    const iv = setInterval(() => {
      setQuestion(pool[Math.floor(Math.random() * pool.length)]);
      count++;
      if (count > 8) { clearInterval(iv); setSpinning(false); }
    }, 80);
  }, [category]);

  const copyQ = () => {
    navigator.clipboard?.writeText(question);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex flex-1 flex-col p-6">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-5 flex items-center gap-3">
          <Sparkles className="h-5 w-5 text-primary" />
          <div>
            <h2 className="text-lg font-bold text-foreground">Icebreaker Generator</h2>
            <p className="text-xs text-muted-foreground">Conversation starters for team meetings and 1-on-1s</p>
          </div>
        </div>

        {/* Category pills */}
        <div className="mb-5 flex flex-wrap gap-2">
          {(Object.keys(CATEGORY_META) as Category[]).map((cat) => {
            const meta = CATEGORY_META[cat];
            const Icon = meta.icon;
            return (
              <button key={cat} onClick={() => { setCategory(cat); setQuestion(ICEBREAKERS[cat][Math.floor(Math.random() * ICEBREAKERS[cat].length)]); }}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${category === cat ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground hover:bg-accent"}`}>
                <Icon className="h-3.5 w-3.5" /> {meta.label}
              </button>
            );
          })}
        </div>

        {/* Main question card */}
        <div className="relative mb-4 overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card to-muted/30 p-8">
          <div className={`text-center transition-all duration-150 ${spinning ? "scale-95 opacity-50" : "scale-100 opacity-100"}`}>
            <div className={`mb-3 text-xs font-bold uppercase tracking-wider ${CATEGORY_META[category].color}`}>
              {CATEGORY_META[category].label}
            </div>
            <p className="text-xl font-semibold leading-relaxed text-foreground">
              {question}
            </p>
          </div>

          {/* Decorative dots */}
          <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-primary/5" />
          <div className="absolute -bottom-6 -left-6 h-32 w-32 rounded-full bg-primary/5" />
        </div>

        {/* Action buttons */}
        <div className="mb-6 flex items-center justify-center gap-3">
          <button onClick={randomize} disabled={spinning}
            className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 transition-all">
            <Shuffle className={`h-4 w-4 ${spinning ? "animate-spin" : ""}`} /> New Question
          </button>
          <button onClick={copyQ}
            className="flex items-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-accent transition-colors">
            {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy"}
          </button>
          <button onClick={() => { if (!saved.includes(question)) setSaved([question, ...saved]); }}
            className={`flex items-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-medium transition-colors ${saved.includes(question) ? "text-amber-500 border-amber-300 bg-amber-50/50 dark:bg-amber-950/20" : "text-muted-foreground hover:bg-accent"}`}>
            <Bookmark className="h-4 w-4" /> {saved.includes(question) ? "Saved" : "Save"}
          </button>
        </div>

        {/* Saved questions */}
        {saved.length > 0 && (
          <div className="rounded-xl border border-border bg-card">
            <button onClick={() => setShowSaved(!showSaved)} className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-foreground hover:bg-accent rounded-xl">
              <span className="flex items-center gap-2"><Bookmark className="h-4 w-4 text-amber-500" /> Saved ({saved.length})</span>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${showSaved ? "rotate-180" : ""}`} />
            </button>
            {showSaved && (
              <div className="border-t border-border px-4 py-2 space-y-2">
                {saved.map((q, i) => (
                  <div key={i} className="flex items-start justify-between gap-2 rounded-lg bg-muted/30 px-3 py-2 text-xs text-foreground">
                    <span>{q}</span>
                    <button onClick={() => setSaved(saved.filter((_, j) => j !== i))} className="shrink-0 text-muted-foreground hover:text-red-500 mt-0.5">x</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
