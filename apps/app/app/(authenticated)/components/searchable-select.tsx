"use client";

import { useEffect, useRef, useState } from "react";

type Option = { value: string; label: string };

export function SearchableSelect({
  name,
  value,
  defaultValue,
  onValueChange,
  options,
  placeholder = "Search...",
  triggerClassName = "",
  disabled,
}: {
  name?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  options: readonly Option[] | Option[];
  placeholder?: string;
  triggerClassName?: string;
  disabled?: boolean;
}) {
  const [internalValue, setInternalValue] = useState(defaultValue ?? "");
  const isControlled = value !== undefined;
  const currentValue = isControlled ? value : internalValue;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedLabel = Array.from(options).find((o) => o.value === currentValue)?.label ?? "";

  const filtered = query
    ? (options as Option[]).filter((o) =>
        o.label.toLowerCase().includes(query.toLowerCase()) ||
        (o as any).aliases?.some((a: string) => a.toLowerCase().includes(query.toLowerCase()))
      )
    : (options as Option[]);

  useEffect(() => {
    if (open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const selectOption = (opt: Option) => {
    if (!isControlled) setInternalValue(opt.value);
    onValueChange?.(opt.value);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={ref} className={`relative ${disabled ? "pointer-events-none opacity-50" : ""}`}>
      {name && <input type="hidden" name={name} value={currentValue} />}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex items-center justify-between rounded-md border border-input bg-background px-3 text-sm text-left ${triggerClassName} ${
          !currentValue ? "text-muted-foreground" : ""
        }`}
      >
        <span className="truncate">{selectedLabel || placeholder}</span>
        <svg className="ml-2 h-4 w-4 shrink-0 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => { setOpen(false); setQuery(""); }} />
          <div className="fixed z-[61] rounded-md border bg-popover shadow-lg animate-in fade-in slide-in-from-top-1 duration-150" style={{ top: pos.top, left: pos.left, width: pos.width }}>
            <div className="p-1.5">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type to search..."
                className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-sm placeholder:text-muted-foreground outline-none"
                autoComplete="off"
              />
            </div>
            <div className="max-h-52 overflow-y-auto px-1 pb-1">
              {filtered.length === 0 ? (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">No results found</div>
              ) : (
                filtered.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => selectOption(opt)}
                    className={`w-full rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent transition-colors ${
                      opt.value === currentValue ? "bg-accent font-medium" : ""
                    }`}
                  >
                    {opt.label}
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
