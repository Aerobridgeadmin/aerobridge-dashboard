/**
 * Shared constants for HRIQ server actions.
 * Not a "use server" file — just plain exports.
 */
import { HriqError } from "@/lib/hriq/errors";

/** 
 * Default password for newly provisioned contractor accounts.
 * MUST be set via HRIQ_DEFAULT_PASSWORD env var. Falls back to a random password
 * per-invocation if the env var is missing (each user gets a unique password).
 */
export function getDefaultPassword(): string {
  if (process.env.HRIQ_DEFAULT_PASSWORD) return process.env.HRIQ_DEFAULT_PASSWORD;
  // Generate a random 16-char password if env var is not set
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%";
  return Array.from({ length: 16 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}
/** @deprecated Use getDefaultPassword() instead */
export const DEFAULT_PASSWORD = process.env.HRIQ_DEFAULT_PASSWORD || getDefaultPassword();

/** Remote Leverage organization ID — used for RL-internal vs client org logic */
export const RL_ORG_ID = process.env.RL_ORGANIZATION_ID ?? "org_rl_001";

/** Canonical app URL, respecting env overrides */
export const APP_URL = process.env.HRIQ_PUBLIC_DOMAIN ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://hriq.remoteleverage.com";

/** Normalize a URL to include https:// prefix */
export function normalizeAppUrl(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return `https://${trimmed}`;
}

/** Build a display username: first initial + first last name (e.g. "John Smith"  "JSmith") */
export function buildUsername(firstName: string, lastName: string): string {
  const initial = firstName.trim().charAt(0).toUpperCase();
  const lastNames = lastName.trim().split(/\s+/);
  const primary = lastNames[0] ?? "User";
  return `${initial}${primary.charAt(0).toUpperCase()}${primary.slice(1)}`;
}

/**
 * Build a unique username by checking the database for collisions.
 * Falls back to appending a numeric suffix (e.g. "JSmith2", "JSmith3").
 */
export async function buildUniqueUsername(firstName: string, lastName: string): Promise<string> {
  const { database } = await import("@repo/database");
  const base = buildUsername(firstName, lastName);
  
  // Single query: find all existing usernames matching this base pattern
  const existing = await database.appUser.findMany({
    where: {
      displayName: { startsWith: base },
    },
    select: { displayName: true },
  });
  
  const takenNames = new Set(existing.map((u: { displayName: string | null }) => u.displayName));
  if (!takenNames.has(base)) return base;
  
  for (let i = 2; i <= 99; i++) {
    const candidate = `${base}${i}`;
    if (!takenNames.has(candidate)) return candidate;
  }
  
  return `${base}${Math.floor(Math.random() * 9000) + 1000}`;
}

/** Bi-monthly pay period days */
export const PAY_PERIOD_DAYS = [15, 30] as const;

/** Roles that can access the RL admin dashboard */
export const RL_ADMIN_ROLES = ["super_admin"] as const;

/** Pacific timezone for date formatting */
export const PACIFIC_TIMEZONE = "America/Los_Angeles";

/**
 * Lazy-initialized Supabase admin client (service_role).
 * Throws if env vars are missing — fail fast instead of silent null.
 */
let _supabaseAdmin: ReturnType<typeof import("@supabase/supabase-js").createClient> | null = null;

export function getSupabaseAdmin() {
  if (_supabaseAdmin) return _supabaseAdmin;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createClient } = require("@supabase/supabase-js") as typeof import("@supabase/supabase-js");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new HriqError("HRIQ-1806");
  _supabaseAdmin = createClient(url, key);
  return _supabaseAdmin;
}

/**
 * Generate a signed URL for a private storage file.
 * Uses service_role to create a 1-year signed URL.
 * Bucket is private so public URLs no longer work.
 */
export async function getSignedStorageUrl(
  bucket: string,
  path: string,
  expiresIn = 60 * 60 * 24 * 365, // 1 year default
): Promise<string> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) {
    console.error("[Storage] Failed to create signed URL:", error?.message);
    // Fallback: return path-based URL (won't work publicly, but avoids null)
    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/sign/${bucket}/${path}`;
  }
  return data.signedUrl;
}

// ─── VA Timesheet (manual Google Sheet process for RL internal) ─────────────
export const VA_TIMESHEET_URL = process.env.VA_TIMESHEET_URL ?? "https://docs.google.com/spreadsheets/d/1VA-Timesheet-2026";
export const VA_TIMESHEET_TUTORIAL_URL = process.env.VA_TIMESHEET_TUTORIAL_URL ?? process.env.WELCOME_VIDEO_URL ?? "https://www.loom.com/share/va-timesheet-tutorial";
export const WELCOME_VIDEO_URL = process.env.WELCOME_VIDEO_URL ?? process.env.VA_TIMESHEET_TUTORIAL_URL ?? "";
export const WELCOME_VIDEO_TITLE = process.env.WELCOME_VIDEO_TITLE ?? "Watch the Tutorial Video";

// ─── External API Timeout Utility ─────────────────────────────────────────────

/**
 * Wrap an external API call with a timeout to prevent blocking page renders.
 * Returns undefined (and logs the error) if the call times out.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number = 8000,
  label: string = "External API"
): Promise<T | undefined> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`[HRIQ] ${label} timed out after ${ms}ms`)), ms)
  );
  try {
    return await Promise.race([promise, timeout]);
  } catch (err: any) {
    console.error(`[HRIQ] ${label} timeout/error:`, err.message);
    return undefined;
  }
}

/**
 * Sanitize a monetary/decimal string for Prisma's Decimal field.
 * Strips commas, dollar signs, currency symbols, and whitespace.
 * Returns a clean numeric string or null if invalid.
 *
 * Examples:
 *   "2,500"     → "2500"
 *   "$1,234.56" → "1234.56"
 *   "  45.00  " → "45.00"
 *   "abc"       → null
 *   ""          → null
 */
export function sanitizeDecimal(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Strip $, commas, spaces, and common currency symbols
  const cleaned = raw.replace(/[$€£¥,\s]/g, "").trim();
  if (!cleaned || isNaN(Number(cleaned))) return null;
  return cleaned;
}
