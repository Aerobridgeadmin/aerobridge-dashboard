"use client";

import { lazy, Suspense, useRef, useCallback, useEffect, useState } from "react";
import { useApps, type AppId, type WidgetState } from "./apps-context";
import {
  GlobeIcon,
  KeyboardIcon,
  Sparkles,
  TimerIcon,
  XIcon,
  MinusIcon,
  GripHorizontal,
  Maximize2Icon,
  Minimize2Icon,
  StickyNoteIcon,
  CalculatorIcon,
  ShieldCheckIcon,
  CheckSquareIcon,
  DollarSignIcon,
  Gamepad2Icon,
  type LucideIcon,
} from "lucide-react";

const WorldClockApp = lazy(() =>
  import("../../[orgSlug]/apps/world-clock/world-clock-app").then((m) => ({ default: m.WorldClockApp }))
);
const FocusTimerApp = lazy(() =>
  import("../../[orgSlug]/apps/focus-timer/focus-timer-app").then((m) => ({ default: m.FocusTimerApp }))
);
const TypingTestApp = lazy(() =>
  import("../../[orgSlug]/apps/typing-test/typing-test-app").then((m) => ({ default: m.TypingTestApp }))
);
const IcebreakersApp = lazy(() =>
  import("../../[orgSlug]/apps/icebreakers/icebreakers-app").then((m) => ({ default: m.IcebreakersApp }))
);
const NotepadApp = lazy(() =>
  import("../../[orgSlug]/apps/notepad/notepad-app").then((m) => ({ default: m.NotepadApp }))
);
const CalculatorApp = lazy(() =>
  import("../../[orgSlug]/apps/calculator/calculator-app").then((m) => ({ default: m.CalculatorApp }))
);
const PasswordGeneratorApp = lazy(() =>
  import("../../[orgSlug]/apps/password-generator/password-generator-app").then((m) => ({ default: m.PasswordGeneratorApp }))
);
const HabitTrackerApp = lazy(() =>
  import("../../[orgSlug]/apps/habit-tracker/habit-tracker-app").then((m) => ({ default: m.HabitTrackerApp }))
);
const MeetingCostApp = lazy(() =>
  import("../../[orgSlug]/apps/meeting-cost/meeting-cost-app").then((m) => ({ default: m.MeetingCostApp }))
);
const TeamGamesApp = lazy(() =>
  import("../../[orgSlug]/apps/team-games/team-games-app").then((m) => ({ default: m.TeamGamesApp }))
);

const APP_COMPONENTS: Record<AppId, React.LazyExoticComponent<React.ComponentType>> = {
  "world-clock": WorldClockApp,
  "focus-timer": FocusTimerApp,
  "typing-test": TypingTestApp,
  icebreakers: IcebreakersApp,
  notepad: NotepadApp,
  calculator: CalculatorApp,
  "password-generator": PasswordGeneratorApp,
  "habit-tracker": HabitTrackerApp,
  "meeting-cost": MeetingCostApp,
  "team-games": TeamGamesApp,
};

type AppMeta = { id: AppId; name: string; shortName: string; icon: LucideIcon; gradient: string };

const APPS: AppMeta[] = [
  { id: "world-clock", name: "World Clock", shortName: "Clock", icon: GlobeIcon, gradient: "from-teal-500 to-cyan-600" },
  { id: "focus-timer", name: "Focus Timer", shortName: "Timer", icon: TimerIcon, gradient: "from-rose-500 to-pink-600" },
  { id: "typing-test", name: "Typing Test", shortName: "Typing", icon: KeyboardIcon, gradient: "from-sky-500 to-blue-600" },
  { id: "icebreakers", name: "Icebreakers", shortName: "Ice", icon: Sparkles, gradient: "from-fuchsia-500 to-purple-600" },
  { id: "notepad", name: "Notepad", shortName: "Notes", icon: StickyNoteIcon, gradient: "from-amber-500 to-orange-600" },
  { id: "calculator", name: "Calculator", shortName: "Calc", icon: CalculatorIcon, gradient: "from-slate-500 to-gray-700" },
  { id: "password-generator", name: "Password Gen", shortName: "Pass", icon: ShieldCheckIcon, gradient: "from-emerald-500 to-green-700" },
  { id: "habit-tracker", name: "Habit Tracker", shortName: "Habits", icon: CheckSquareIcon, gradient: "from-violet-500 to-purple-700" },
  { id: "meeting-cost", name: "Meeting Cost", shortName: "Cost", icon: DollarSignIcon, gradient: "from-orange-500 to-red-600" },
  { id: "team-games", name: "Team Games", shortName: "Games", icon: Gamepad2Icon, gradient: "from-emerald-500 to-teal-600" },
];

const META_MAP = new Map(APPS.map((a) => [a.id, a]));

function AppSpinner() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

function Widget({ widget }: { widget: WidgetState }) {
  const { closeWidget, toggleMinimize, toggleMaximize, bringToFront, updatePosition, updateSize } = useApps();
  const meta = META_MAP.get(widget.appId)!;
  const Component = APP_COMPONENTS[widget.appId];
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; origW: number; origH: number } | null>(null);

  // ── Drag (title bar) ──
  const onDragDown = useCallback(
    (e: React.PointerEvent) => {
      if (widget.maximized) return;
      e.preventDefault();
      bringToFront(widget.appId);
      dragRef.current = { startX: e.clientX, startY: e.clientY, origX: widget.x, origY: widget.y };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [widget.appId, widget.x, widget.y, widget.maximized, bringToFront]
  );

  const onDragMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current) return;
      updatePosition(
        widget.appId,
        dragRef.current.origX + (e.clientX - dragRef.current.startX),
        dragRef.current.origY + (e.clientY - dragRef.current.startY)
      );
    },
    [widget.appId, updatePosition]
  );

  const onDragUp = useCallback(() => { dragRef.current = null; }, []);

  // ── Resize (corner handle) ──
  const onResizeDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      bringToFront(widget.appId);
      resizeRef.current = { startX: e.clientX, startY: e.clientY, origW: widget.w, origH: widget.h };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [widget.appId, widget.w, widget.h, bringToFront]
  );

  const onResizeMove = useCallback(
    (e: React.PointerEvent) => {
      if (!resizeRef.current) return;
      const newW = resizeRef.current.origW + (e.clientX - resizeRef.current.startX);
      const newH = resizeRef.current.origH + (e.clientY - resizeRef.current.startY);
      updateSize(widget.appId, newW, newH);
    },
    [widget.appId, updateSize]
  );

  const onResizeUp = useCallback(() => { resizeRef.current = null; }, []);

  // Double-click title bar to maximize
  const onTitleDoubleClick = useCallback(() => {
    toggleMaximize(widget.appId);
  }, [widget.appId, toggleMaximize]);

  if (widget.minimized) return null;

  return (
    <div
      className="fixed shadow-2xl rounded-xl border border-border/60 bg-card overflow-hidden flex flex-col"
      style={{
        left: widget.x,
        top: widget.y,
        width: widget.w,
        height: widget.h,
        zIndex: widget.zIndex,
        boxShadow: "0 20px 60px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.05)",
        transition: widget.maximized ? "all 0.2s ease-out" : undefined,
      }}
      onPointerDown={() => bringToFront(widget.appId)}
    >
      {/* Title bar */}
      <div
        className={`flex h-9 shrink-0 items-center gap-2 px-2 bg-gradient-to-r ${meta.gradient} select-none ${widget.maximized ? "cursor-default" : "cursor-grab active:cursor-grabbing"}`}
        onPointerDown={onDragDown}
        onPointerMove={onDragMove}
        onPointerUp={onDragUp}
        onDoubleClick={onTitleDoubleClick}
      >
        <GripHorizontal className="h-3.5 w-3.5 text-white/50" />
        <meta.icon className="h-3.5 w-3.5 text-white" />
        <span className="flex-1 text-xs font-semibold text-white truncate">{meta.name}</span>
        <button
          onClick={(e) => { e.stopPropagation(); toggleMinimize(widget.appId); }}
          className="flex h-5 w-5 items-center justify-center rounded text-white/70 hover:bg-white/20 hover:text-white"
        >
          <MinusIcon className="h-3 w-3" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); toggleMaximize(widget.appId); }}
          className="flex h-5 w-5 items-center justify-center rounded text-white/70 hover:bg-white/20 hover:text-white"
          title={widget.maximized ? "Restore" : "Maximize"}
        >
          {widget.maximized ? <Minimize2Icon className="h-3 w-3" /> : <Maximize2Icon className="h-3 w-3" />}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); closeWidget(widget.appId); }}
          className="flex h-5 w-5 items-center justify-center rounded text-white/70 hover:bg-white/20 hover:text-white"
        >
          <XIcon className="h-3 w-3" />
        </button>
      </div>

      {/* App content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <Suspense fallback={<AppSpinner />}>
          <Component />
        </Suspense>
      </div>

      {/* Resize handle (bottom-right corner) */}
      {!widget.maximized && (
        <div
          className="absolute bottom-0 right-0 h-5 w-5 cursor-nwse-resize z-10"
          style={{ touchAction: "none" }}
          onPointerDown={onResizeDown}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeUp}
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4 text-muted-foreground/40 absolute bottom-0.5 right-0.5">
            <path d="M14 14L8 14L14 8Z" fill="currentColor" />
            <path d="M14 14L11 14L14 11Z" fill="currentColor" opacity="0.5" />
          </svg>
        </div>
      )}
    </div>
  );
}

function AppPicker() {
  const { openWidget, setShowPicker, widgets } = useApps();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setShowPicker(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [setShowPicker]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowPicker(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [setShowPicker]);

  const openIds = new Set(widgets.map((w) => w.appId));

  return (
    <div className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/30 backdrop-blur-[2px]">
      <div ref={ref} className="w-full max-w-sm rounded-xl border bg-card p-5 shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-200">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-bold">Open App Widget</h3>
          <button onClick={() => setShowPicker(false)} className="rounded p-1 text-muted-foreground hover:bg-accent">
            <XIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {APPS.map((app) => {
            const isOpen = openIds.has(app.id);
            return (
              <button
                key={app.id}
                onClick={() => openWidget(app.id)}
                className={`group flex items-center gap-2.5 rounded-lg border p-3 text-left transition-all hover:shadow-md hover:border-primary/30 ${isOpen ? "border-primary/40 bg-primary/5" : "bg-card"}`}
              >
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gradient-to-br ${app.gradient} text-white shadow-sm`}>
                  <app.icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold group-hover:text-primary transition-colors truncate">{app.name}</div>
                  {isOpen && <div className="text-[10px] text-muted-foreground">Already open</div>}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Taskbar() {
  const { widgets, openWidget } = useApps();
  const minimized = widgets.filter((w) => w.minimized);
  if (minimized.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9980] flex items-center gap-1.5 rounded-full border bg-card/95 backdrop-blur-md px-2 py-1.5 shadow-lg">
      {minimized.map((w) => {
        const meta = META_MAP.get(w.appId)!;
        return (
          <button
            key={w.appId}
            onClick={() => openWidget(w.appId)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all hover:bg-accent bg-gradient-to-r ${meta.gradient} text-white shadow-sm`}
            title={`Restore ${meta.name}`}
          >
            <meta.icon className="h-3 w-3" />
            {meta.shortName}
          </button>
        );
      })}
    </div>
  );
}

export function AppsShell() {
  const { widgets, showPicker } = useApps();

  return (
    <>
      {widgets.map((w) => (
        <Widget key={w.appId} widget={w} />
      ))}
      <Taskbar />
      {showPicker && <AppPicker />}
    </>
  );
}
