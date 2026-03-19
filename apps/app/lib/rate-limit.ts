/**
 * Shared in-memory rate limiter for API routes.
 * Resets on deploy — acceptable for Vercel serverless.
 *
 * Usage:
 *   import { rateLimit } from "@/lib/rate-limit";
 *   const limiter = rateLimit({ max: 5, windowMs: 60_000 });
 *
 *   export async function POST(request: Request) {
 *     const ip = (await headers()).get("x-forwarded-for") ?? "unknown";
 *     const { limited, remaining } = limiter.check(ip);
 *     if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
 *     // ...
 *   }
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitConfig {
  /** Max requests per window (default 10) */
  max?: number;
  /** Window size in ms (default 60_000 = 1 minute) */
  windowMs?: number;
}

interface RateLimitResult {
  limited: boolean;
  remaining: number;
  resetAt: number;
}

const CLEANUP_INTERVAL = 5 * 60_000;

export function rateLimit(config: RateLimitConfig = {}) {
  const max = config.max ?? 10;
  const windowMs = config.windowMs ?? 60_000;
  const store = new Map<string, RateLimitEntry>();
  let lastCleanup = Date.now();

  function cleanup() {
    const now = Date.now();
    if (now - lastCleanup < CLEANUP_INTERVAL) return;
    lastCleanup = now;
    for (const [k, entry] of store) {
      if (now > entry.resetAt) store.delete(k);
    }
  }

  return {
    check(key: string): RateLimitResult {
      cleanup();
      const now = Date.now();
      const entry = store.get(key);

      if (!entry || now > entry.resetAt) {
        store.set(key, { count: 1, resetAt: now + windowMs });
        return { limited: false, remaining: max - 1, resetAt: now + windowMs };
      }

      entry.count++;
      const limited = entry.count > max;
      return { limited, remaining: Math.max(0, max - entry.count), resetAt: entry.resetAt };
    },
  };
}
