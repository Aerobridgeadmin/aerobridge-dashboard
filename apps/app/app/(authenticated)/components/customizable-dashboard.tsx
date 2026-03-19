"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* ── Types ─────────────────────────────────────────────────────────────── */
export type WidgetSize = "full" | "half" | "third";

export type WidgetDef = {
  id: string;
  label: string;
  description: string;
  size: WidgetSize;
};

export type WidgetConfig = {
  order: string[];
  hidden: string[];
  sizes: Record<string, WidgetSize>;
};

type Props = {
  storageKey: string;
  widgets: WidgetDef[];
  defaultOrder: string[];
  renderWidget: (id: string) => React.ReactNode;
};

/* ── Size helpers ──────────────────────────────────────────────────────── */
const SIZE_COLS: Record<WidgetSize, number> = { full: 12, half: 6, third: 4 };
const SIZE_CYCLE: WidgetSize[] = ["third", "half", "full"];
const SIZE_LABELS: Record<WidgetSize, string> = { third: "S", half: "M", full: "L" };

function colClass(size: WidgetSize): string {
  switch (size) {
    case "full": return "col-span-12";
    case "half": return "col-span-12 md:col-span-6";
    case "third": return "col-span-12 sm:col-span-6 md:col-span-4";
  }
}

/* ── Persistence ───────────────────────────────────────────────────────── */
function loadConfig(storageKey: string, widgets: WidgetDef[], defaultOrder: string[]): WidgetConfig {
  if (typeof window === "undefined") return { order: defaultOrder, hidden: [], sizes: {} };
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      const knownIds = new Set(widgets.map((w) => w.id));
      const order = (parsed.order ?? defaultOrder).filter((id: string) => knownIds.has(id));
      for (const w of widgets) { if (!order.includes(w.id)) order.push(w.id); }
      return {
        order,
        hidden: (parsed.hidden ?? []).filter((id: string) => knownIds.has(id)),
        sizes: parsed.sizes ?? {},
      };
    }
  } catch {}
  return { order: defaultOrder, hidden: [], sizes: {} };
}

function saveConfig(storageKey: string, config: WidgetConfig) {
  try { localStorage.setItem(storageKey, JSON.stringify(config)); } catch {}
}

/* ── Main Component ────────────────────────────────────────────────────── */
export function CustomizableDashboard({ storageKey, widgets, defaultOrder, renderWidget }: Props) {
  const [config, setConfig] = useState<WidgetConfig>({ order: defaultOrder, hidden: [], sizes: {} });
  const [editing, setEditing] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setConfig(loadConfig(storageKey, widgets, defaultOrder));
    setMounted(true);
  }, [storageKey, widgets, defaultOrder]);

  const updateConfig = useCallback((fn: (prev: WidgetConfig) => WidgetConfig) => {
    setConfig((prev) => { const next = fn(prev); saveConfig(storageKey, next); return next; });
  }, [storageKey]);

  const getSize = useCallback((id: string): WidgetSize => {
    return config.sizes[id] ?? widgets.find((w) => w.id === id)?.size ?? "full";
  }, [config.sizes, widgets]);

  const visibleIds = useMemo(() => {
    const h = new Set(config.hidden);
    return config.order.filter((id) => !h.has(id));
  }, [config]);

  const hiddenIds = useMemo(() => {
    const h = new Set(config.hidden);
    return config.order.filter((id) => h.has(id));
  }, [config]);

  /* ── Actions ────────────────────────────────────────── */
  const moveWidget = useCallback((fromId: string, toId: string) => {
    if (fromId === toId) return;
    updateConfig((prev) => {
      const order = [...prev.order];
      const fi = order.indexOf(fromId), ti = order.indexOf(toId);
      if (fi === -1 || ti === -1) return prev;
      order.splice(fi, 1);
      order.splice(ti, 0, fromId);
      return { ...prev, order };
    });
  }, [updateConfig]);

  const cycleSize = useCallback((id: string) => {
    updateConfig((prev) => {
      const cur = prev.sizes[id] ?? widgets.find((w) => w.id === id)?.size ?? "full";
      const idx = SIZE_CYCLE.indexOf(cur);
      const next = SIZE_CYCLE[(idx + 1) % SIZE_CYCLE.length];
      return { ...prev, sizes: { ...prev.sizes, [id]: next } };
    });
  }, [updateConfig, widgets]);

  const toggleHide = useCallback((id: string) => {
    updateConfig((prev) => {
      const h = new Set(prev.hidden);
      if (h.has(id)) h.delete(id); else h.add(id);
      return { ...prev, hidden: Array.from(h) };
    });
  }, [updateConfig]);

  /* ── Drag handlers ──────────────────────────────────── */
  const onDragStart = (e: React.DragEvent, id: string) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
    const el = e.currentTarget as HTMLElement;
    e.dataTransfer.setDragImage(el, el.offsetWidth / 2, 30);
  };

  const onDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (id !== dragId) setOverId(id);
  };

  const onDrop = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (dragId && id !== dragId) moveWidget(dragId, id);
    setDragId(null); setOverId(null);
  };

  const onDragEnd = () => { setDragId(null); setOverId(null); };

  /* ── Touch handlers ─────────────────────────────────── */
  const touchClone = useRef<HTMLElement | null>(null);
  const onTouchStart = (e: React.TouchEvent, id: string) => {
    setDragId(id);
    const el = e.currentTarget as HTMLElement;
    const t = e.touches[0];
    const c = el.cloneNode(true) as HTMLElement;
    c.style.cssText = `position:fixed;z-index:9999;width:${el.offsetWidth}px;pointer-events:none;opacity:0.85;transform:rotate(1deg) scale(1.02);box-shadow:0 20px 60px rgba(0,0,0,0.5);border-radius:12px;left:${el.getBoundingClientRect().left}px;top:${t.clientY - 30}px;transition:none;`;
    document.body.appendChild(c);
    touchClone.current = c;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragId || !gridRef.current) return;
    const t = e.touches[0];
    if (touchClone.current) touchClone.current.style.top = `${t.clientY - 30}px`;
    const els = gridRef.current.querySelectorAll("[data-wid]");
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (t.clientY >= r.top && t.clientY <= r.bottom && t.clientX >= r.left && t.clientX <= r.right) {
        const id = el.getAttribute("data-wid");
        if (id && id !== dragId) setOverId(id);
        return;
      }
    }
  };

  const onTouchEnd = () => {
    if (dragId && overId && dragId !== overId) moveWidget(dragId, overId);
    if (touchClone.current) { touchClone.current.remove(); touchClone.current = null; }
    setDragId(null); setOverId(null);
  };

  /* ── Render ─────────────────────────────────────────── */
  if (!mounted) {
    return (
      <div className="grid grid-cols-12 gap-4">
        {defaultOrder.map((id) => {
          const def = widgets.find((w) => w.id === id);
          return <div key={id} className={colClass(def?.size ?? "full")}>{renderWidget(id)}</div>;
        })}
      </div>
    );
  }

  return (
    <div className="relative">
      {editing && <div className="fixed inset-0 bg-black/30 z-30 transition-opacity duration-300" />}

      <div className={`relative ${editing ? "z-40" : ""}`}>
        {/* Toolbar */}
        <div className={`flex items-center mb-4 transition-all duration-200 ${editing ? "justify-between" : "justify-end"}`}>
          {editing && (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm font-medium text-white">Edit Layout</span>
              <span className="text-[11px] text-white/50">Drag to move · Click size to resize</span>
              <button
                type="button"
                onClick={() => updateConfig(() => ({ order: defaultOrder, hidden: [], sizes: {} }))}
                className="text-xs text-white/50 hover:text-white underline underline-offset-2 transition"
              >
                Reset
              </button>
            </div>
          )}
          <button
            type="button"
            data-tour="customize"
            onClick={() => setEditing(!editing)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all shrink-0 ${
              editing
                ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/25"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            {editing ? (
              <>
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12" /></svg>
                Done
              </>
            ) : (
              <>
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>
                Customize
              </>
            )}
          </button>
        </div>

        {/* Grid */}
        <div
          ref={gridRef}
          className={`grid grid-cols-12 gap-4 transition-all duration-200 ${
            editing ? "rounded-2xl border-2 border-dashed border-white/10 p-3 bg-white/[0.02]" : ""
          }`}
        >
          {visibleIds.map((id) => {
            const def = widgets.find((w) => w.id === id);
            if (!def) return null;
            const size = getSize(id) as WidgetSize;
            const isDragging = dragId === id;
            const isOver = overId === id && dragId !== null && dragId !== id;

            return (
              <div
                key={id}
                data-wid={id}
                draggable={editing}
                onDragStart={(e) => editing && onDragStart(e, id)}
                onDragOver={(e) => editing && onDragOver(e, id)}
                onDrop={(e) => editing && onDrop(e, id)}
                onDragEnd={onDragEnd}
                onTouchStart={(e) => editing && onTouchStart(e, id)}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
                className={`${colClass(size)} transition-all duration-200 ${editing ? "cursor-grab active:cursor-grabbing" : ""} ${
                  isDragging ? "opacity-20 scale-[0.97]" : ""
                } ${isOver ? "scale-[1.01]" : ""}`}
              >
                <div className={`relative h-full rounded-xl transition-all duration-200 ${
                  editing ? "ring-1 ring-white/15 hover:ring-white/30" : ""
                } ${isOver ? "ring-2 ring-primary shadow-lg shadow-primary/20" : ""}`}>

                  {/* Widget content */}
                  <div className={`h-full ${editing ? "pointer-events-none select-none" : ""}`}>
                    {renderWidget(id)}
                  </div>

                  {/* Edit overlay */}
                  {editing && (
                    <div className="absolute inset-0 z-10 rounded-xl">
                      {/* Top bar */}
                      <div className="absolute top-0 left-0 right-0 flex items-center justify-between rounded-t-xl bg-gradient-to-b from-black/80 via-black/50 to-transparent px-3 py-2.5">
                        {/* Grip + label */}
                        <div className="flex items-center gap-2 min-w-0">
                          <svg className="h-4 w-4 text-white/40 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                            <circle cx="9" cy="5" r="1.5" /><circle cx="15" cy="5" r="1.5" />
                            <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
                            <circle cx="9" cy="19" r="1.5" /><circle cx="15" cy="19" r="1.5" />
                          </svg>
                          <span className="text-xs font-medium text-white/80 truncate">{def.label}</span>
                        </div>

                        {/* Controls */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {/* Resize button */}
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); cycleSize(id); }}
                            className="pointer-events-auto flex items-center gap-1 rounded-md bg-white/10 backdrop-blur-sm px-2 py-1 text-[10px] font-bold text-white/70 hover:bg-white/20 hover:text-white transition uppercase tracking-wider"
                            title={`Size: ${size} — click to cycle`}
                          >
                            {SIZE_LABELS[size]}
                            <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M7 17L17 7M17 7H7M17 7V17" /></svg>
                          </button>
                          {/* Hide button */}
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); toggleHide(id); }}
                            className="pointer-events-auto flex items-center justify-center rounded-md bg-white/10 backdrop-blur-sm p-1 text-white/60 hover:bg-red-500/30 hover:text-red-300 transition"
                            title="Hide widget"
                          >
                            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Empty state */}
          {visibleIds.length === 0 && (
            <div className="col-span-12 rounded-xl border bg-card py-16 text-center">
              <p className="text-sm font-medium">No widgets visible</p>
              <p className="text-xs text-muted-foreground mt-1">Click Customize to add widgets</p>
            </div>
          )}
        </div>

        {/* Hidden widgets tray */}
        {editing && hiddenIds.length > 0 && (
          <div className="mt-4 rounded-xl border border-dashed border-white/15 bg-white/[0.03] p-4">
            <p className="text-xs font-medium text-white/40 mb-3 uppercase tracking-wider">Hidden</p>
            <div className="flex flex-wrap gap-2">
              {hiddenIds.map((id) => {
                const def = widgets.find((w) => w.id === id);
                if (!def) return null;
                const size = getSize(id) as WidgetSize;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggleHide(id)}
                    className="group flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/60 hover:bg-white/10 hover:text-white hover:border-white/20 transition"
                  >
                    <svg className="h-3.5 w-3.5 text-white/30 group-hover:text-primary transition" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></svg>
                    {def.label}
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/40 font-bold uppercase">{SIZE_LABELS[size]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
