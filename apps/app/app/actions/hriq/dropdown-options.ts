"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@repo/auth/session";
import { database } from "@repo/database";

export type DropdownCategory = "job_title" | "department";

/**
 * Get all custom dropdown options for a category.
 * Returns only the custom (user-added) options — the caller merges with defaults.
 */
export async function getCustomDropdownOptions(category: DropdownCategory) {
  await requireSession();

  return database.customDropdownOption.findMany({
    where: { category },
    orderBy: { label: "asc" },
    select: { value: true, label: true },
  });
}

/**
 * Add a new custom option to a dropdown category.
 * Deduplicates by (category, value). Returns the full updated list.
 */
export async function addCustomDropdownOption(
  category: DropdownCategory,
  label: string,
) {
  try {
    const session = await requireSession();

    const trimmed = label.trim();
    if (!trimmed) throw new Error("Option label cannot be empty");
    if (trimmed.length > 100) throw new Error("Option label too long (max 100 chars)");

    // Use the label as the value (matching existing pattern)
    const value = trimmed;

    await database.customDropdownOption.upsert({
      where: { category_value: { category, value } },
      create: {
        category,
        value,
        label: trimmed,
        createdBy: session.userId,
      },
      update: {}, // No-op if already exists
    });

    revalidatePath("/", "layout");

    // Return updated list
    return database.customDropdownOption.findMany({
      where: { category },
      orderBy: { label: "asc" },
      select: { value: true, label: true },
    });

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[dropdown-options.ts:addCustomDropdownOption]", _msg);
    return { error: _msg };
  }
}

/**
 * Delete a custom dropdown option by category + value.
 * Only super_admins can delete. Returns the updated list.
 */
export async function deleteCustomDropdownOption(
  category: DropdownCategory,
  value: string,
) {
  try {
    const { requireRole } = await import("@repo/auth/session");
    await requireRole("super_admin");

    await database.customDropdownOption.deleteMany({
      where: { category, value },
    });

    revalidatePath("/", "layout");

    return database.customDropdownOption.findMany({
      where: { category },
      orderBy: { label: "asc" },
      select: { value: true, label: true },
    });
  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[dropdown-options.ts:deleteCustomDropdownOption]", _msg);
    return { error: _msg };
  }
}
