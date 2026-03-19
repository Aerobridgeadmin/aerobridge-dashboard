"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export type AppId = "world-clock" | "focus-timer" | "typing-test" | "icebreakers" | "notepad" | "calculator" | "password-generator" | "habit-tracker" | "meeting-cost" | "team-games";

export type WidgetState = {
  appId: AppId;
  x: number;
  y: number;
  w: number;
  h: number;
  minimized: boolean;
  maximized: boolean;
  zIndex: number;
  prevGeo?: { x: number; y: number; w: number; h: number };
};

interface AppsContextValue {
  widgets: WidgetState[];
  topZ: number;
  openWidget: (appId: AppId) => void;
  closeWidget: (appId: AppId) => void;
  toggleMinimize: (appId: AppId) => void;
  toggleMaximize: (appId: AppId) => void;
  bringToFront: (appId: AppId) => void;
  updatePosition: (appId: AppId, x: number, y: number) => void;
  updateSize: (appId: AppId, w: number, h: number) => void;
  showPicker: boolean;
  setShowPicker: (v: boolean) => void;
}

const AppsContext = createContext<AppsContextValue | null>(null);

export function useApps() {
  const ctx = useContext(AppsContext);
  if (!ctx) throw new Error("useApps must be inside AppsProvider");
  return ctx;
}

const DEFAULT_W = 420;
const DEFAULT_H = 500;

function initialPosition(index: number): { x: number; y: number } {
  const baseX = typeof window !== "undefined" ? Math.max(40, window.innerWidth - DEFAULT_W - 40) : 400;
  const baseY = 60;
  return { x: baseX - index * 30, y: baseY + index * 30 };
}

export function AppsProvider({ children }: { children: ReactNode }) {
  const [widgets, setWidgets] = useState<WidgetState[]>([]);
  const [topZ, setTopZ] = useState(100);
  const [showPicker, setShowPicker] = useState(false);

  const openWidget = useCallback((appId: AppId) => {
    setWidgets((prev) => {
      if (prev.some((w) => w.appId === appId)) {
        return prev.map((w) =>
          w.appId === appId ? { ...w, minimized: false, zIndex: topZ + 1 } : w
        );
      }
      const pos = initialPosition(prev.length);
      return [...prev, { appId, ...pos, w: DEFAULT_W, h: DEFAULT_H, minimized: false, maximized: false, zIndex: topZ + 1 }];
    });
    setTopZ((z) => z + 1);
    setShowPicker(false);
  }, [topZ]);

  const closeWidget = useCallback((appId: AppId) => {
    setWidgets((prev) => prev.filter((w) => w.appId !== appId));
  }, []);

  const toggleMinimize = useCallback((appId: AppId) => {
    setWidgets((prev) =>
      prev.map((w) => (w.appId === appId ? { ...w, minimized: !w.minimized } : w))
    );
  }, []);

  const toggleMaximize = useCallback((appId: AppId) => {
    setWidgets((prev) =>
      prev.map((w) => {
        if (w.appId !== appId) return w;
        if (w.maximized) {
          const g = w.prevGeo ?? { x: 40, y: 40, w: DEFAULT_W, h: DEFAULT_H };
          return { ...w, x: g.x, y: g.y, w: g.w, h: g.h, maximized: false, prevGeo: undefined };
        }
        const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
        const vh = typeof window !== "undefined" ? window.innerHeight : 800;
        return {
          ...w,
          prevGeo: { x: w.x, y: w.y, w: w.w, h: w.h },
          x: 8, y: 8, w: vw - 16, h: vh - 16,
          maximized: true,
        };
      })
    );
  }, []);

  const bringToFront = useCallback((appId: AppId) => {
    setTopZ((z) => {
      setWidgets((prev) =>
        prev.map((w) => (w.appId === appId ? { ...w, zIndex: z + 1 } : w))
      );
      return z + 1;
    });
  }, []);

  const updatePosition = useCallback((appId: AppId, x: number, y: number) => {
    setWidgets((prev) =>
      prev.map((w) => (w.appId === appId ? { ...w, x, y, maximized: false } : w))
    );
  }, []);

  const updateSize = useCallback((appId: AppId, w: number, h: number) => {
    setWidgets((prev) =>
      prev.map((ws) => (ws.appId === appId ? { ...ws, w: Math.max(320, w), h: Math.max(280, h), maximized: false } : ws))
    );
  }, []);

  return (
    <AppsContext.Provider
      value={{ widgets, topZ, openWidget, closeWidget, toggleMinimize, toggleMaximize, bringToFront, updatePosition, updateSize, showPicker, setShowPicker }}
    >
      {children}
    </AppsContext.Provider>
  );
}
