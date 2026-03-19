"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { useMemo, useState } from "react";

type CustomSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

const EMPTY_SENTINEL = "__cs_empty__";

export function CustomSelect({
  name,
  value,
  defaultValue,
  onValueChange,
  options,
  placeholder = "Select...",
  triggerClassName = "",
  disabled,
  required,
}: {
  name?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  options: CustomSelectOption[];
  placeholder?: string;
  triggerClassName?: string;
  disabled?: boolean;
  required?: boolean;
}) {
  const [internalValue, setInternalValue] = useState(defaultValue ?? "");
  const isControlled = value !== undefined;
  const currentValue = isControlled ? (value ?? "") : internalValue;

  // Remap any option with value="" to the sentinel so Radix never receives
  // an empty-string value on <SelectItem> (which it forbids).
  const safeOptions = useMemo(
    () =>
      options.map((opt) =>
        opt.value === "" ? { ...opt, value: EMPTY_SENTINEL } : opt,
      ),
    [options],
  );

  // Check if value exists in options
  const matchesOption = useMemo(
    () => !!currentValue && safeOptions.some((opt) => opt.value === currentValue),
    [currentValue, safeOptions],
  );

  // For controlled mode: always pass a string to `value` (never undefined)
  // to prevent Radix from switching between controlled/uncontrolled.
  // Use a hidden sentinel option when no real option matches.
  const selectValue = matchesOption ? currentValue : EMPTY_SENTINEL;

  return (
    <>
      {name ? <input type="hidden" name={name} value={currentValue} required={required} /> : null}
      {isControlled ? (
        <Select
          value={selectValue}
          onValueChange={(next) => {
            onValueChange?.(next === EMPTY_SENTINEL ? "" : next);
          }}
          disabled={disabled}
        >
          <SelectTrigger className={triggerClassName}>
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {/* Hidden sentinel so Radix always has a match when nothing is selected */}
            {!safeOptions.some((o) => o.value === EMPTY_SENTINEL) && (
              <SelectItem value={EMPTY_SENTINEL} className="hidden">{placeholder}</SelectItem>
            )}
            {safeOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} disabled={opt.disabled}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Select
          defaultValue={matchesOption ? currentValue : undefined}
          onValueChange={(next) => {
            const real = next === EMPTY_SENTINEL ? "" : next;
            setInternalValue(real);
            onValueChange?.(real);
          }}
          disabled={disabled}
        >
          <SelectTrigger className={triggerClassName}>
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {safeOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} disabled={opt.disabled}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </>
  );
}
