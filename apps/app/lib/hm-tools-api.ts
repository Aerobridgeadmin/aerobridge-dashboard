/**
 * HM Tools API client — wraps calls to /api/hm-tools proxy.
 * All edge-function actions go through here.
 */

const BASE = "/api/hm-tools";

// Simple in-memory cache
const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 120_000; // 2 min
const STALE_TTL = 600_000; // 10 min

function cacheKey(action: string, params: Record<string, string>) {
  return `${action}:${JSON.stringify(params)}`;
}

/**
 * GET action with caching.
 */
export async function hmGet<T = unknown>(
  action: string,
  params: Record<string, string> = {},
  opts?: { timeout?: number; skipCache?: boolean }
): Promise<T> {
  const key = cacheKey(action, params);
  const cached = cache.get(key);
  const now = Date.now();

  if (!opts?.skipCache && cached) {
    if (now - cached.ts < CACHE_TTL) return cached.data as T;
    // Return stale while revalidating
    if (now - cached.ts < STALE_TTL) {
      // Fire-and-forget revalidation
      hmGet<T>(action, params, { skipCache: true }).then((d) => {
        cache.set(key, { data: d, ts: Date.now() });
      }).catch(() => {});
      return cached.data as T;
    }
  }

  const sp = new URLSearchParams({ action, ...params });
  const controller = new AbortController();
  const timeout = opts?.timeout ?? 15_000;
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(`${BASE}?${sp.toString()}`, {
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    cache.set(key, { data, ts: Date.now() });
    return data as T;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * POST mutation action — bypasses cache.
 */
export async function hmPost<T = unknown>(
  payload: Record<string, unknown>,
  opts?: { timeout?: number }
): Promise<T> {
  const controller = new AbortController();
  const timeout = opts?.timeout ?? 60_000;
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data as T;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Invalidate cache entries matching an action prefix.
 */
export function invalidateCache(actionPrefix?: string) {
  if (!actionPrefix) {
    cache.clear();
    return;
  }
  for (const [k] of cache) {
    if (k.startsWith(actionPrefix)) cache.delete(k);
  }
}

// ─── Common Types ─────────────────────────────────────────
export type Job = {
  id?: string;
  slug: string;
  name: string;
  company_name?: string;
  job_status?: { label: string };
  candidate_count?: number;
  contact_slug?: string;
  hiring_manager?: string;
  contact_person_name?: string;
};

export type Candidate = {
  id?: string;
  slug: string;
  first_name: string;
  last_name: string;
  email?: string;
  position?: string;
  candidate_stage?: { label?: string };
  created_on?: string;
  resume_url?: string;
  resume?: { filename?: string; file_link?: string };
  contact_number?: string;
};

export type Contact = {
  slug?: string;
  first_name: string;
  last_name: string;
  email?: string;
  company_name?: string;
};

export type AENote = {
  noteId?: string;
  submittedBy?: string;
  date?: string;
  clientComment?: string;
  redFlags?: string;
  hiresCount?: string;
  clientSpend?: string;
  feePercent?: string;
  priorityLevel?: string;
  editHistory?: { editor: string; date: string; fields: string }[];
};

export type SlackMember = {
  id: string;
  name: string;
  real_name?: string;
};

export type NewsletterUpdate = {
  id?: string;
  title: string;
  content: string;
  department: string;
  updateType: string;
  authorName: string;
  authorEmail?: string;
  taggedUsers?: string[];
  createdAt?: string;
};
