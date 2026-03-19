/**
 * Standard currency options used across all dropdowns.
 * Keep in sync everywhere — add new currencies here.
 */

export const CURRENCY_OPTIONS = [
  { value: "USD", label: "USD — US Dollar" },
  { value: "EUR", label: "EUR — Euro" },
  { value: "GBP", label: "GBP — British Pound" },
  { value: "PHP", label: "PHP — Philippine Peso" },
  { value: "COP", label: "COP — Colombian Peso" },
  { value: "BRL", label: "BRL — Brazilian Real" },
  { value: "CLP", label: "CLP — Chilean Peso" },
  { value: "MXN", label: "MXN — Mexican Peso" },
  { value: "CAD", label: "CAD — Canadian Dollar" },
  { value: "AUD", label: "AUD — Australian Dollar" },
  { value: "INR", label: "INR — Indian Rupee" },
] as const;

/** Simple value-only array for HTML <select> elements. */
export const CURRENCY_VALUES = CURRENCY_OPTIONS.map((c) => c.value);
