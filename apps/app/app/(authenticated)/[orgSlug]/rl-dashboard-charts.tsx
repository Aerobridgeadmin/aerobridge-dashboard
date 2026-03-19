"use client";

import { useState, useEffect, useRef } from "react";

const COLORS: Record<string, string> = {
  active: "#3b82f6",
  "pre hire": "#a855f7",
  "onboarding scheduled": "#f97316",
  "onboarding in progress": "#eab308",
  offboarded: "#22c55e",
};
const FALLBACK_COLORS = ["#3b82f6", "#a855f7", "#f97316", "#22c55e", "#eab308", "#ef4444", "#06b6d4"];

type StatusItem = { name: string; value: number };

function getColor(name: string, index: number) {
  return COLORS[name.toLowerCase()] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

/** Pure SVG donut chart with sweep animation — no Recharts dependency issues */
function DonutChart({ data, size = 200 }: { data: StatusItem[]; size?: number }) {
  const [progress, setProgress] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);
  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);

  const total = data.reduce((s, d) => s + d.value, 0);
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 4;
  const innerR = outerR * 0.62;
  const duration = 1200;

  useEffect(() => {
    startRef.current = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startRef.current;
      const t = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setProgress(eased);
      if (t < 1) rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // Build arc paths
  const arcs: { path: string; color: string; index: number; startAngle: number; endAngle: number }[] = [];
  let cumAngle = -90; // start from top
  data.forEach((item, i) => {
    const sweep = total > 0 ? (item.value / total) * 360 * progress : 0;
    if (sweep > 0.1) {
      const startAngle = cumAngle;
      const endAngle = cumAngle + sweep;
      const startRad = (startAngle * Math.PI) / 180;
      const endRad = (endAngle * Math.PI) / 180;
      const largeArc = sweep > 180 ? 1 : 0;

      const x1o = cx + outerR * Math.cos(startRad);
      const y1o = cy + outerR * Math.sin(startRad);
      const x2o = cx + outerR * Math.cos(endRad);
      const y2o = cy + outerR * Math.sin(endRad);
      const x1i = cx + innerR * Math.cos(endRad);
      const y1i = cy + innerR * Math.sin(endRad);
      const x2i = cx + innerR * Math.cos(startRad);
      const y2i = cy + innerR * Math.sin(startRad);

      const path = [
        `M ${x1o} ${y1o}`,
        `A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2o} ${y2o}`,
        `L ${x1i} ${y1i}`,
        `A ${innerR} ${innerR} 0 ${largeArc} 0 ${x2i} ${y2i}`,
        "Z",
      ].join(" ");

      arcs.push({ path, color: getColor(item.name, i), index: i, startAngle, endAngle });
    }
    cumAngle += total > 0 ? (item.value / total) * 360 : 0;
  });

  const hoveredItem = hovered !== null ? data[hovered] : null;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block">
      {/* Gap rings for padding effect */}
      {arcs.map((arc) => (
        <path
          key={arc.index}
          d={arc.path}
          fill={arc.color}
          opacity={hovered === null || hovered === arc.index ? 1 : 0.3}
          stroke="hsl(var(--card))"
          strokeWidth={2}
          onMouseEnter={() => setHovered(arc.index)}
          onMouseLeave={() => setHovered(null)}
          style={{ transition: "opacity 0.2s", cursor: "pointer" }}
        />
      ))}
      {/* Center text */}
      <text x={cx} y={cy - 8} textAnchor="middle" dominantBaseline="central"
        className="fill-foreground" style={{ fontSize: 26, fontWeight: 700, opacity: progress > 0.8 ? 1 : 0, transition: "opacity 0.4s" }}>
        {hoveredItem ? hoveredItem.value : total}
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" dominantBaseline="central"
        className="fill-muted-foreground" style={{ fontSize: 11, opacity: progress > 0.8 ? 1 : 0, transition: "opacity 0.4s" }}>
        {hoveredItem ? hoveredItem.name : "Total"}
      </text>
    </svg>
  );
}

export function RLDashboardCharts({ statusData }: { statusData: StatusItem[] }) {
  const [animated, setAnimated] = useState(false);
  useEffect(() => { const t = setTimeout(() => setAnimated(true), 200); return () => clearTimeout(t); }, []);

  if (statusData.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-6">
        <h3 className="font-semibold">Contractor Distribution</h3>
        <p className="mt-4 text-center text-sm text-muted-foreground">No employee data yet.</p>
      </div>
    );
  }

  const total = statusData.reduce((sum, s) => sum + s.value, 0);
  const sorted = [...statusData].sort((a, b) => b.value - a.value);

  return (
    <div className="rounded-xl border bg-card p-6">
      <h3 className="font-semibold mb-4">Contractor Distribution by Status</h3>
      <div className="flex flex-col items-center gap-6 lg:flex-row lg:items-center">
        {/* Donut */}
        <div className="shrink-0">
          <DonutChart data={statusData} size={210} />
        </div>

        {/* Breakdown */}
        <div className="flex-1 min-w-0 w-full">
          <div className="space-y-3">
            {sorted.map((item) => {
              const pct = total > 0 ? (item.value / total) * 100 : 0;
              const color = getColor(item.name, statusData.indexOf(item));
              return (
                <div key={item.name}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ background: color }} />
                      <span className="text-sm capitalize truncate">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm font-semibold tabular-nums">{item.value}</span>
                      <span className="text-xs text-muted-foreground tabular-nums w-12 text-right">{pct.toFixed(1)}%</span>
                    </div>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted/50 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-1000 ease-out"
                      style={{ width: animated ? `${pct}%` : "0%", background: color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex items-center justify-between border-t pt-3">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Active Rate</span>
            <span className="text-sm font-bold">
              {total > 0
                ? `${(((statusData.find((s) => s.name.toLowerCase() === "active")?.value ?? 0) / total) * 100).toFixed(0)}%`
                : "—"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
