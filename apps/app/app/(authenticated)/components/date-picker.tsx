"use client";

import { useEffect, useRef, useState } from "react";

/*  Helpers  */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function startDay(year: number, month: number) {
  // 0=Monday … 6=Sunday
  const d = new Date(year, month, 1 as any).getDay();
  return d === 0 ? 6 : d - 1;
}
function pad(n: number) { return String(n).padStart(2, "0"); }

/** Smart popup positioning: uses fixed position to escape overflow clipping */
function useDropdownPosition(ref: React.RefObject<HTMLDivElement | null>, open: boolean, popupHeight = 340) {
  const [pos, setPos] = useState<{ top: number; left: number; above: boolean }>({ top: 0, left: 0, above: false });
  useEffect(() => {
    if (!open || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const above = spaceBelow < popupHeight && rect.top > popupHeight;
    setPos({
      top: above ? rect.top - popupHeight - 4 : rect.bottom + 4,
      left: rect.left,
      above,
    });
  }, [open, ref, popupHeight]);
  return pos;
}

function formatDisplay(iso: string) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${MONTHS[parseInt(m, 10) - 1]} ${parseInt(d, 10)}, ${y}`;
}

/** Custom styled dropdown for month/year inside the calendar header */
function MonthYearDropdown({ type, value, onChange, items }: {
  type: "month" | "year";
  value: number;
  onChange: (v: number) => void;
  items: { value: number; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Scroll the selected item into view when opened
  useEffect(() => {
    if (open && listRef.current) {
      const active = listRef.current.querySelector("[data-active=true]");
      if (active) active.scrollIntoView({ block: "center" });
    }
  }, [open]);

  const selected = items.find((i) => i.value === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-7 items-center gap-0.5 rounded px-1.5 text-sm font-semibold hover:bg-accent transition-colors"
      >
        {selected?.label ?? value}
        <svg className="h-3 w-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div
          ref={listRef}
          className={`absolute z-[70] ${type === "month" ? "w-24" : "w-20"} max-h-48 overflow-y-auto rounded-lg border bg-popover shadow-lg py-1 animate-in fade-in zoom-in-95 duration-100`}
          style={{ top: "100%", left: "50%", transform: "translateX(-50%)" }}
        >
          {items.map((item) => (
            <button
              key={item.value}
              type="button"
              data-active={item.value === value}
              onClick={() => { onChange(item.value); setOpen(false); }}
              className={`w-full px-3 py-1.5 text-left text-xs transition-colors ${
                item.value === value
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "hover:bg-accent"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function formatTimeDisplay(iso: string) {
  if (!iso) return "";
  const [date, time] = iso.split("T");
  if (!date || !time) return formatDisplay(iso);
  const [hh, mm] = time.split(":");
  const h = parseInt(hh ?? "0", 10);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${formatDisplay(date)} at ${h12}:${mm} ${ampm}`;
}

/* 
   DatePicker — a clean calendar dropdown
    */
export function DatePicker({
  name,
  value,
  defaultValue,
  onChange,
  required,
  min,
  minYear,
  maxYear,
  placeholder = "Select date…",
  className = "",
}: {
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (iso: string) => void;
  required?: boolean;
  min?: string;
  /** Earliest year shown in the year dropdown (default: current year - 14) */
  minYear?: number;
  /** Latest year shown in the year dropdown (default: current year + 5) */
  maxYear?: number;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(value ?? defaultValue ?? "");
  const ref = useRef<HTMLDivElement>(null);
  const pos = useDropdownPosition(ref, open, 340);

  const today = new Date();
  const [viewYear, setViewYear] = useState(selected ? parseInt(selected.split("-")[0]!) : today.getFullYear());
  const [viewMonth, setViewMonth] = useState(selected ? parseInt(selected.split("-")[1]!) - 1 : today.getMonth());

  // Sync controlled value
  useEffect(() => {
    if (value !== undefined) setSelected(value);
  }, [value]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const navigate = (delta: number) => {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setViewMonth(m);
    setViewYear(y);
  };

  const selectDate = (day: number) => {
    const iso = `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`;
    setSelected(iso);
    onChange?.(iso);
    setOpen(false);
  };

  const clear = () => {
    setSelected("");
    onChange?.("");
    setOpen(false);
  };

  const selectToday = () => {
    const t = new Date();
    const iso = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
    setSelected(iso);
    onChange?.(iso);
    setViewYear(t.getFullYear());
    setViewMonth(t.getMonth());
    setOpen(false);
  };

  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  const dim = daysInMonth(viewYear, viewMonth);
  const start = startDay(viewYear, viewMonth);

  const minDate = min ? new Date(min + "T00:00:00") : null;

  return (
    <div ref={ref} className={`relative ${className}`}>
      <input type="hidden" name={name} value={selected} />
      <button
        type="button"
        onClick={() => {
          if (!open && selected) {
            setViewYear(parseInt(selected.split("-")[0]!));
            setViewMonth(parseInt(selected.split("-")[1]!) - 1);
          }
          setOpen(!open);
        }}
        className={`flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm transition-colors hover:bg-accent/50 ${
          selected ? "text-foreground" : "text-muted-foreground"
        }`}
      >
        <span>{selected ? formatDisplay(selected) : placeholder}</span>
        <svg className="h-4 w-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
          <div
            className="fixed z-[61] w-[280px] rounded-lg border bg-popover p-3 shadow-lg animate-in fade-in duration-150"
            style={{ top: pos.top, left: pos.left }}
          >
          {/* Header */}
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={() => navigate(-1)} className="flex h-7 w-7 items-center justify-center rounded hover:bg-accent text-sm">‹</button>
            <div className="flex items-center gap-1">
              <MonthYearDropdown
                type="month"
                value={viewMonth}
                onChange={setViewMonth}
                items={MONTHS.map((m, i) => ({ value: i, label: m }))}
              />
              <MonthYearDropdown
                type="year"
                value={viewYear}
                onChange={setViewYear}
                items={(() => {
                  const lo = minYear ?? 1930;
                  const hi = maxYear ?? today.getFullYear() + 5;
                  return Array.from({ length: hi - lo + 1 }, (_, i) => {
                    const y = hi - i;
                    return { value: y, label: String(y) };
                  });
                })()}
              />
            </div>
            <button type="button" onClick={() => navigate(1)} className="flex h-7 w-7 items-center justify-center rounded hover:bg-accent text-sm">›</button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 gap-0 text-center">
            {DAYS.map((d) => (
              <div key={d} className="py-1 text-[11px] font-medium text-muted-foreground">{d}</div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7 gap-0 text-center">
            {Array.from({ length: start }).map((_, i) => (
              <div key={`e${i}`} />
            ))}
            {Array.from({ length: dim }).map((_, i) => {
              const day = i + 1;
              const iso = `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`;
              const isSelected = iso === selected;
              const isToday = iso === todayStr;
              const isDisabled = minDate ? new Date(iso + "T00:00:00") < minDate : false;

              return (
                <button
                  key={day}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => selectDate(day)}
                  className={`flex h-8 w-8 mx-auto items-center justify-center rounded-full text-xs transition-colors
                    ${isSelected ? "bg-primary text-primary-foreground font-bold" : ""}
                    ${isToday && !isSelected ? "border border-primary text-primary font-medium" : ""}
                    ${!isSelected && !isToday ? "hover:bg-accent" : ""}
                    ${isDisabled ? "text-muted-foreground/30 cursor-not-allowed" : "cursor-pointer"}
                  `}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="mt-2 flex items-center justify-between border-t pt-2">
            <button type="button" onClick={clear} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>
            <button type="button" onClick={selectToday} className="text-xs font-medium text-primary hover:underline">Today</button>
          </div>
        </div>
        </>
      )}

      {required && !selected && (
        <input type="text" required tabIndex={-1} className="sr-only" value="" readOnly />
      )}
    </div>
  );
}

/* 
   DateTimePicker — calendar + easy time selection
    */
export function DateTimePicker({
  name,
  value,
  defaultValue,
  onChange,
  required,
  min,
  placeholder = "Select date & time…",
  className = "",
}: {
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (iso: string) => void;
  required?: boolean;
  min?: string;
  placeholder?: string;
  className?: string;
}) {
  const parseDateTime = (v: string) => {
    if (!v) return { date: "", hour: "09", minute: "00" };
    const [d, t] = v.split("T");
    const [hh, mm] = (t ?? "09:00").split(":");
    return { date: d ?? "", hour: hh ?? "09", minute: mm ?? "00" };
  };

  const initial = parseDateTime(value ?? defaultValue ?? "");
  const [dateVal, setDateVal] = useState(initial.date);
  const [hour, setHour] = useState(initial.hour);
  const [minute, setMinute] = useState(initial.minute);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pos = useDropdownPosition(ref, open, 480);

  const combined = dateVal ? `${dateVal}T${hour}:${minute}` : "";

  useEffect(() => {
    if (value !== undefined) {
      const p = parseDateTime(value);
      setDateVal(p.date);
      setHour(p.hour);
      setMinute(p.minute);
    }
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const today = new Date();
  const [viewYear, setViewYear] = useState(dateVal ? parseInt(dateVal.split("-")[0]!) : today.getFullYear());
  const [viewMonth, setViewMonth] = useState(dateVal ? parseInt(dateVal.split("-")[1]!) - 1 : today.getMonth());

  const navigate = (delta: number) => {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setViewMonth(m);
    setViewYear(y);
  };

  const selectDate = (day: number) => {
    const iso = `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`;
    setDateVal(iso);
    const full = `${iso}T${hour}:${minute}`;
    onChange?.(full);
  };

  const updateTime = (h: string, m: string) => {
    setHour(h);
    setMinute(m);
    if (dateVal) onChange?.(`${dateVal}T${h}:${m}`);
  };

  const confirm = () => {
    if (dateVal) onChange?.(`${dateVal}T${hour}:${minute}`);
    setOpen(false);
  };

  const clear = () => {
    setDateVal("");
    setHour("09");
    setMinute("00");
    onChange?.("");
    setOpen(false);
  };

  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  const dim = daysInMonth(viewYear, viewMonth);
  const start = startDay(viewYear, viewMonth);
  const minDate = min ? new Date(min.slice(0, 10 as any) + "T00:00:00") : null;

  const h12 = parseInt(hour, 10);
  const ampm = h12 >= 12 ? "PM" : "AM";
  const displayH = h12 === 0 ? 12 : h12 > 12 ? h12 - 12 : h12;

  return (
    <div ref={ref} className={`relative ${className}`}>
      <input type="hidden" name={name} value={combined} />
      <button
        type="button"
        onClick={() => {
          if (!open && dateVal) {
            setViewYear(parseInt(dateVal.split("-")[0]!));
            setViewMonth(parseInt(dateVal.split("-")[1]!) - 1);
          }
          setOpen(!open);
        }}
        className={`flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm transition-colors hover:bg-accent/50 ${
          combined ? "text-foreground" : "text-muted-foreground"
        }`}
      >
        <span>{combined ? formatTimeDisplay(combined) : placeholder}</span>
        <svg className="h-4 w-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      </button>

      {open && (
        <>
        <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
        <div
          className="fixed z-[61] w-[320px] rounded-lg border bg-popover p-3 shadow-lg animate-in fade-in duration-150"
          style={{ top: pos.top, left: pos.left }}
        >
          {/* Calendar header */}
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={() => navigate(-1)} className="flex h-7 w-7 items-center justify-center rounded hover:bg-accent text-sm">‹</button>
            <span className="text-sm font-semibold">{MONTHS[viewMonth]} {viewYear}</span>
            <button type="button" onClick={() => navigate(1)} className="flex h-7 w-7 items-center justify-center rounded hover:bg-accent text-sm">›</button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 gap-0 text-center">
            {DAYS.map((d) => (
              <div key={d} className="py-1 text-[11px] font-medium text-muted-foreground">{d}</div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7 gap-0 text-center">
            {Array.from({ length: start }).map((_, i) => (
              <div key={`e${i}`} />
            ))}
            {Array.from({ length: dim }).map((_, i) => {
              const day = i + 1;
              const iso = `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`;
              const isSelected = iso === dateVal;
              const isToday = iso === todayStr;
              const isDisabled = minDate ? new Date(iso + "T00:00:00") < minDate : false;

              return (
                <button
                  key={day}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => selectDate(day)}
                  className={`flex h-8 w-8 mx-auto items-center justify-center rounded-full text-xs transition-colors
                    ${isSelected ? "bg-primary text-primary-foreground font-bold" : ""}
                    ${isToday && !isSelected ? "border border-primary text-primary font-medium" : ""}
                    ${!isSelected && !isToday ? "hover:bg-accent" : ""}
                    ${isDisabled ? "text-muted-foreground/30 cursor-not-allowed" : "cursor-pointer"}
                  `}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Time selection */}
          <div className="mt-3 border-t pt-3">
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-muted-foreground">Time</span>
              <div className="flex items-center gap-2">
                {/* Hour buttons */}
                <div className="grid grid-cols-6 gap-1 flex-1">
                  {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((h) => {
                    const isActive = displayH === h;
                    return (
                      <button
                        key={h}
                        type="button"
                        onClick={() => {
                          let h24 = h;
                          if (ampm === "PM" && h !== 12) h24 += 12;
                          if (ampm === "AM" && h === 12) h24 = 0;
                          updateTime(pad(h24), minute);
                        }}
                        className={`rounded px-1 py-1.5 text-[11px] font-medium transition-colors ${
                          isActive ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                        }`}
                      >
                        {h}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Minutes */}
                <div className="flex gap-1 flex-1">
                  {["00", "15", "30", "45"].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => updateTime(hour, m)}
                      className={`flex-1 rounded px-1 py-1.5 text-[11px] font-medium transition-colors ${
                        minute === m ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                      }`}
                    >
                      :{m}
                    </button>
                  ))}
                </div>
                {/* AM/PM toggle */}
                <div className="flex gap-1">
                  {(["AM", "PM"] as const).map((ap) => (
                    <button
                      key={ap}
                      type="button"
                      onClick={() => {
                        let h = parseInt(hour, 10);
                        if (ap === "PM" && h < 12) h += 12;
                        if (ap === "AM" && h >= 12) h -= 12;
                        updateTime(pad(h), minute);
                      }}
                      className={`rounded px-2.5 py-1.5 text-[11px] font-bold transition-colors ${
                        ampm === ap ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                      }`}
                    >
                      {ap}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-2 flex items-center justify-between border-t pt-2">
            <button type="button" onClick={clear} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>
            <button
              type="button"
              onClick={confirm}
              disabled={!dateVal}
              className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Confirm
            </button>
          </div>
        </div>
        </>
      )}

      {required && !combined && (
        <input type="text" required tabIndex={-1} className="sr-only" value="" readOnly />
      )}
    </div>
  );
}

/* 
   TimePicker — easy 12-hour time selector (no native input)
    */
export function TimePicker({
  name,
  value,
  onChange,
  placeholder = "Start time",
  className = "",
}: {
  name?: string;
  value?: string;               // HH:MM (24h) e.g. "09:00"
  onChange?: (val: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pos = useDropdownPosition(ref, open, 220);

  // Parse HH:MM  { h12, minute, ampm }
  const parsed = (() => {
    if (!value) return null;
    const [hh, mm] = value.split(":");
    const h = parseInt(hh ?? "0", 10);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return { h12, minute: mm ?? "00", ampm };
  })();

  const displayText = parsed
    ? `${parsed.h12}:${parsed.minute} ${parsed.ampm}`
    : "";

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const selectTime = (h24: number, m: string) => {
    const val = `${pad(h24)}:${m}`;
    onChange?.(val);
    setOpen(false);
  };

  // Preset quick times
  const quickTimes = [
    { label: "6 AM",  h24: 6 },
    { label: "7 AM",  h24: 7 },
    { label: "8 AM",  h24: 8 },
    { label: "9 AM",  h24: 9 },
    { label: "10 AM", h24: 10 },
    { label: "11 AM", h24: 11 },
    { label: "12 PM", h24: 12 },
    { label: "1 PM",  h24: 13 },
    { label: "2 PM",  h24: 14 },
    { label: "3 PM",  h24: 15 },
    { label: "4 PM",  h24: 16 },
    { label: "5 PM",  h24: 17 },
    { label: "6 PM",  h24: 18 },
    { label: "8 PM",  h24: 20 },
    { label: "10 PM", h24: 22 },
  ];

  return (
    <div ref={ref} className={`relative ${className}`}>
      <input type="hidden" name={name} value={value ?? ""} />
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-2 text-sm transition-colors hover:bg-accent/50 ${
          value ? "text-foreground" : "text-muted-foreground"
        }`}
      >
        <span className="truncate">{displayText || placeholder}</span>
        <svg className="h-3.5 w-3.5 shrink-0 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
        </svg>
      </button>

      {open && (
        <>
        <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
        <div
          className="fixed z-[61] w-[200px] rounded-lg border bg-popover p-2 shadow-lg animate-in fade-in duration-150"
          style={{ top: pos.top, left: pos.left }}
        >
          <div className="grid grid-cols-3 gap-1">
            {quickTimes.map((t) => (
              <button
                key={t.label}
                type="button"
                onClick={() => selectTime(t.h24, "00")}
                className={`rounded px-1.5 py-1.5 text-[11px] font-medium transition-colors ${
                  value === `${pad(t.h24)}:00` ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {/* Half-hour options */}
          {value && parsed && (
            <div className="mt-1 border-t pt-1 flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground">Min:</span>
              {["00", "15", "30", "45"].map((m) => {
                const h24 = parsed.ampm === "PM" && parsed.h12 !== 12
                  ? parsed.h12 + 12
                  : parsed.ampm === "AM" && parsed.h12 === 12 ? 0 : parsed.h12;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => selectTime(h24, m)}
                    className={`flex-1 rounded px-1 py-1 text-[10px] font-medium ${
                      parsed.minute === m ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                    }`}
                  >
                    :{m}
                  </button>
                );
              })}
            </div>
          )}
          {value && (
            <button
              type="button"
              onClick={() => { onChange?.(""); setOpen(false); }}
              className="mt-1 w-full text-center text-[10px] text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          )}
        </div>
        </>
      )}
    </div>
  );
}
