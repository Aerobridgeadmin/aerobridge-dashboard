"use client";

import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@repo/design-system/components/ui/select";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { DropdownCategory } from "@/app/actions/hriq/dropdown-options";

type Option = { value: string; label: string };

const OTHER_SENTINEL = "__other__";

/**
 * A CustomSelect that includes an "Other…"option at the bottom.
 * When "Other"is selected, an inline text input appears.
 * On submit, the new value is saved to the DB and becomes a permanent dropdown option.
 *
 * Props are identical to CustomSelect, plus:
 * - `category`: which dropdown category ("job_title"| "department") for DB persistence
 * - `baseOptions`: the static/default options (from role-department-options.ts)
 */
export function CustomSelectWithOther({
 name,
 value,
 defaultValue,
 onValueChange,
 baseOptions,
 category,
 placeholder = "Select...",
 triggerClassName = "",
 disabled,
 required,
}: {
 name?: string;
 value?: string;
 defaultValue?: string;
 onValueChange?: (value: string) => void;
 baseOptions: readonly Option[] | Option[];
 category: DropdownCategory;
 placeholder?: string;
 triggerClassName?: string;
 disabled?: boolean;
 required?: boolean;
}) {
 const [customOptions, setCustomOptions] = useState<Option[]>([]);
 const [loaded, setLoaded] = useState(false);
 const [showInput, setShowInput] = useState(false);
 const [newLabel, setNewLabel] = useState("");
 const [isPending, startTransition] = useTransition();
 const inputRef = useRef<HTMLInputElement>(null);

 const [internalValue, setInternalValue] = useState(defaultValue ?? "");
 const isControlled = value !== undefined;
 const currentValue = isControlled ? value : internalValue;

 // Load custom options on mount
 useEffect(() => {
 let cancelled = false;
 (async () => {
 try {
 const { getCustomDropdownOptions } = await import("@/app/actions/hriq/dropdown-options");
 const opts = await getCustomDropdownOptions(category);
 if (!cancelled) {
 setCustomOptions(opts);
 setLoaded(true);
 }
 } catch {
 if (!cancelled) setLoaded(true);
 }
 })();
 return () => { cancelled = true; };
 }, [category]);

 // Merge base + custom, deduplicate
 const allOptions = useMemo(() => {
 const baseVals = new Set(baseOptions.map((o) => o.value));
 const merged: Option[] = [...baseOptions];
 for (const opt of customOptions) {
 if (!baseVals.has(opt.value)) {
 merged.push(opt);
 }
 }
 return merged;
 }, [baseOptions, customOptions]);

 // If current value isn't in options (e.g. was custom-added before load), add it
 const displayOptions = useMemo(() => {
 const opts = [...allOptions];
 if (currentValue && !opts.some((o) => o.value === currentValue)) {
 opts.push({ value: currentValue, label: currentValue });
 }
 return opts;
 }, [allOptions, currentValue]);

 const CSWO_EMPTY = "__cswo_empty__";

 const matchesOption = useMemo(() => {
   if (!currentValue) return false;
   return displayOptions.some((o) => o.value === currentValue);
 }, [currentValue, displayOptions]);

 const selectValue = isControlled
   ? (matchesOption ? currentValue : CSWO_EMPTY)
   : undefined;

 const handleSelect = (next: string) => {
   if (next === CSWO_EMPTY) return;
 if (next === OTHER_SENTINEL) {
 setShowInput(true);
 setTimeout(() => inputRef.current?.focus(), 50);
 return;
 }
 setShowInput(false);
 if (!isControlled) setInternalValue(next);
 onValueChange?.(next);
 };

 const handleAddCustom = () => {
 const trimmed = newLabel.trim();
 if (!trimmed) return;

 startTransition(async () => {
 try {
 const { addCustomDropdownOption } = await import("@/app/actions/hriq/dropdown-options");
 const updated = await addCustomDropdownOption(category, trimmed);
 if ("error" in updated) { console.error("[CustomSelectWithOther] Failed:", (updated as any).error); return; }
 setCustomOptions(updated as { value: string; label: string }[]);
 setShowInput(false);
 setNewLabel("");
 // Set the value to the new option
 if (!isControlled) setInternalValue(trimmed);
 onValueChange?.(trimmed);
 } catch (err) {
 console.error("[CustomSelectWithOther] Failed to add option:", err);
 }
 });
 };

 const handleKeyDown = (e: React.KeyboardEvent) => {
 if (e.key === "Enter") {
 e.preventDefault();
 handleAddCustom();
 }
 if (e.key === "Escape") {
 setShowInput(false);
 setNewLabel("");
 }
 };

 return (
 <div className="relative">
 {name ? <input type="hidden"name={name} value={currentValue ?? ""} required={required} /> : null}

 {!showInput ? (
 <Select
 value={isControlled ? selectValue : undefined}
 defaultValue={!isControlled ? (matchesOption ? currentValue : undefined) : undefined}
 onValueChange={handleSelect}
 disabled={disabled}
 >
 <SelectTrigger className={triggerClassName}>
 <SelectValue placeholder={placeholder} />
 </SelectTrigger>
 <SelectContent>
 {isControlled && <SelectItem value={CSWO_EMPTY} className="hidden">{placeholder}</SelectItem>}
 {displayOptions.map((opt) => (
 <SelectItem key={opt.value} value={opt.value}>
 {opt.label}
 </SelectItem>
 ))}
 {/* Divider + Other */}
 <div className="my-1 border-t border-border"/>
 <SelectItem value={OTHER_SENTINEL} className="text-primary font-medium">
 + Other…
 </SelectItem>
 </SelectContent>
 </Select>
 ) : (
 <div className="flex items-center gap-1.5">
 <input
 ref={inputRef}
 type="text"
 value={newLabel}
 onChange={(e) => setNewLabel(e.target.value)}
 onKeyDown={handleKeyDown}
 placeholder="Type new option…"
 maxLength={100}
 className={`flex-1 rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary ${triggerClassName.includes("h-8") ? "h-8": triggerClassName.includes("h-11") ? "h-11 sm:h-9": "h-9"}`}
 disabled={isPending}
 autoFocus
 />
 <button
 type="button"
 onClick={handleAddCustom}
 disabled={isPending || !newLabel.trim()}
 className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
 >
 {isPending ? "…": "Add"}
 </button>
 <button
 type="button"
 onClick={() => { setShowInput(false); setNewLabel(""); }}
 className="h-8 rounded-md border px-2 text-xs hover:bg-muted"
 >
 
 </button>
 </div>
 )}
 </div>
 );
}
