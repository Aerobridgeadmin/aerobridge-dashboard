"use client";

import { useState, useEffect } from "react";
import { Globe, Sun, Moon, Sunset, Plus, X, Search } from "lucide-react";

const RL_ZONES = [
  { city: "New York", tz: "America/New_York", flag: "US", label: "HQ" },
  { city: "Los Angeles", tz: "America/Los_Angeles", flag: "US", label: "" },
  { city: "Mexico City", tz: "America/Mexico_City", flag: "MX", label: "" },
  { city: "Bogota", tz: "America/Bogota", flag: "CO", label: "" },
  { city: "Buenos Aires", tz: "America/Argentina/Buenos_Aires", flag: "AR", label: "" },
  { city: "Santiago", tz: "America/Santiago", flag: "CL", label: "" },
  { city: "Sao Paulo", tz: "America/Sao_Paulo", flag: "BR", label: "" },
  { city: "London", tz: "Europe/London", flag: "GB", label: "" },
  { city: "Cairo", tz: "Africa/Cairo", flag: "EG", label: "" },
  { city: "Dubai", tz: "Asia/Dubai", flag: "AE", label: "" },
  { city: "Manila", tz: "Asia/Manila", flag: "PH", label: "" },
  { city: "Tokyo", tz: "Asia/Tokyo", flag: "JP", label: "" },
];

const ALL_ZONES = [
  { city: "Anchorage", tz: "America/Anchorage" }, { city: "Vancouver", tz: "America/Vancouver" },
  { city: "Denver", tz: "America/Denver" }, { city: "Chicago", tz: "America/Chicago" },
  { city: "Toronto", tz: "America/Toronto" }, { city: "Lima", tz: "America/Lima" },
  { city: "Caracas", tz: "America/Caracas" }, { city: "Lisbon", tz: "Europe/Lisbon" },
  { city: "Paris", tz: "Europe/Paris" }, { city: "Berlin", tz: "Europe/Berlin" },
  { city: "Istanbul", tz: "Europe/Istanbul" }, { city: "Moscow", tz: "Europe/Moscow" },
  { city: "Mumbai", tz: "Asia/Kolkata" }, { city: "Bangkok", tz: "Asia/Bangkok" },
  { city: "Singapore", tz: "Asia/Singapore" }, { city: "Shanghai", tz: "Asia/Shanghai" },
  { city: "Seoul", tz: "Asia/Seoul" }, { city: "Sydney", tz: "Australia/Sydney" },
  { city: "Auckland", tz: "Pacific/Auckland" }, { city: "Honolulu", tz: "Pacific/Honolulu" },
  { city: "Nairobi", tz: "Africa/Nairobi" }, { city: "Lagos", tz: "Africa/Lagos" },
];

function getTimeInfo(tz: string) {
  const now = new Date();
  const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { ...o, timeZone: tz }).format(now);
  const hour = parseInt(fmt({ hour: "numeric", hour12: false }));
  const time = fmt({ hour: "numeric", minute: "2-digit", hour12: true });
  const date = fmt({ weekday: "short", month: "short", day: "numeric" });
  const offset = fmt({ timeZoneName: "shortOffset" }).split(" ").pop() || "";
  const period = hour >= 6 && hour < 12 ? "morning" : hour >= 12 && hour < 18 ? "afternoon" : hour >= 18 && hour < 21 ? "evening" : "night";
  return { hour, time, date, offset, period };
}

const PERIOD_COLORS: Record<string, { bg: string; icon: typeof Sun; ring: string }> = {
  morning: { bg: "from-amber-400/20 to-yellow-400/10", icon: Sun, ring: "ring-amber-400/40" },
  afternoon: { bg: "from-orange-400/20 to-red-400/10", icon: Sun, ring: "ring-orange-400/40" },
  evening: { bg: "from-purple-400/20 to-pink-400/10", icon: Sunset, ring: "ring-purple-400/40" },
  night: { bg: "from-blue-900/30 to-indigo-900/20", icon: Moon, ring: "ring-blue-400/40" },
};

function ClockCard({ city, tz, flag, label }: { city: string; tz: string; flag?: string; label?: string }) {
  const info = getTimeInfo(tz);
  const style = PERIOD_COLORS[info.period];
  const Icon = style.icon;
  const isWorkHours = info.hour >= 9 && info.hour < 17;

  return (
    <div className={`group relative rounded-lg border border-border bg-gradient-to-br ${style.bg} p-2.5 transition-all hover:shadow-md`}>
      <div className="flex items-center justify-between gap-1">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs">{flag}</span>
            <span className="text-xs font-semibold text-foreground truncate">{city}</span>
            {label && <span className="rounded-full bg-primary/20 px-1.5 py-px text-[8px] font-bold text-primary shrink-0">{label}</span>}
          </div>
          <div className="text-[9px] text-muted-foreground truncate">{info.date} {info.offset}</div>
        </div>
        <Icon className="h-3 w-3 text-muted-foreground shrink-0" />
      </div>
      <div className="mt-1 flex items-baseline justify-between">
        <span className="text-lg font-bold tabular-nums text-foreground leading-tight">{info.time}</span>
        <span className="flex items-center gap-1 shrink-0">
          <span className={`h-1.5 w-1.5 rounded-full ${isWorkHours ? "bg-green-500" : "bg-muted-foreground/30"}`} />
          <span className="text-[8px] text-muted-foreground">{isWorkHours ? "Work" : info.period.charAt(0).toUpperCase() + info.period.slice(1)}</span>
        </span>
      </div>
    </div>
  );
}

export function WorldClockApp() {
  const [zones, setZones] = useState(RL_ZONES);
  const [tick, setTick] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const i = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(i);
  }, []);

  const existing = new Set(zones.map((z) => z.tz));
  const filtered = ALL_ZONES.filter((z) => !existing.has(z.tz) && z.city.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex flex-1 flex-col p-3">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-foreground">World Clock</h2>
          <p className="text-[10px] text-muted-foreground">Green = working hours (9am-5pm)</p>
        </div>
        <button onClick={() => setAddOpen(!addOpen)} className="flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-accent">
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>

      {addOpen && (
        <div className="mb-3 rounded-lg border border-border bg-card p-3">
          <div className="mb-2 flex items-center gap-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search cities..." className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none" autoFocus />
            <button onClick={() => { setAddOpen(false); setSearch(""); }} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
          </div>
          <div className="flex flex-wrap gap-1">
            {filtered.slice(0, 8).map((z) => (
              <button key={z.tz} onClick={() => { setZones([...zones, { ...z, flag: "", label: "" }]); }} className="rounded-full border border-border px-2 py-0.5 text-[10px] hover:bg-accent">{z.city}</button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {mounted
          ? zones.map((z) => <ClockCard key={z.tz} {...z} />)
          : zones.map((z) => (
              <div key={z.tz} className="rounded-lg border border-border bg-card p-2.5 animate-pulse">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs">{z.flag}</span>
                  <span className="text-xs font-semibold text-foreground">{z.city}</span>
                </div>
                <div className="mt-1 h-5 w-16 rounded bg-muted" />
              </div>
            ))}
      </div>
    </div>
  );
}
