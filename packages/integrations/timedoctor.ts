/**
 * Time Doctor API v2 Integration
 * https://api2.timedoctor.com / https://timedoctor.redoc.ly
 *
 * Authenticates via email/password  JWT token (valid 6 months).
 * Pulls worklogs (activity sessions) and aggregates them into daily hours
 * for auto-filling HRIQ timesheets.
 */

const TD_BASE = "https://api2.timedoctor.com/api/1.0";

//  Types 

export interface TDLoginResponse {
  data: { token: string; expiresAt: string; createdAt: string };
}

export interface TDUser {
  id: string;
  name: string;
  email: string;
  active: boolean;
  role?: string;
  employeeId?: string;
  timezone?: string; // IANA timezone string from TD user profile e.g. "America/Santiago"
}

export interface TDWorklog {
  start: string; // ISO 8601
  time: number; // seconds
  mode: string; // "computer" | "mobile" | "manual"
  userId: string;
  taskId?: string;
  projectId?: string;
  deviceId?: string;
}

export interface TDDailyAggregated {
  date: string; // "YYYY-MM-DD"
  totalSeconds: number;
  totalMinutes: number; // rounded to nearest minute
  totalHours: number; // decimal hours derived from rounded minutes (e.g. 7h25m → 7.4166...)
  firstStart: string | null; // earliest worklog start time (HH:MM)
  lastEnd: string | null; // latest end time (HH:MM)
  sessions: number;
}

export interface TDUserDailySummary {
  tdUserId: string;
  tdEmail: string;
  tdName: string;
  days: TDDailyAggregated[];
  totalHours: number;
}

//  Auth 

export async function tdLogin(
  email?: string,
  password?: string
): Promise<{ token: string; expiresAt: string }> {
  const e = email || process.env.TIMEDOCTOR_EMAIL;
  const p = password || process.env.TIMEDOCTOR_PASSWORD;
  if (!e || !p) throw new Error("Time Doctor credentials not configured");

  const res = await fetch(`${TD_BASE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: e, password: p }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`TD login failed (${res.status}): ${body}`);
  }

  const json = (await res.json()) as TDLoginResponse;
  return { token: json.data.token, expiresAt: json.data.expiresAt };
}

/** Get a valid token — uses cached env var or logs in fresh */
export async function getTDToken(): Promise<string> {
  const cached = process.env.TIMEDOCTOR_TOKEN;
  if (cached) {
    // Validate the cached token with a lightweight call
    try {
      const res = await fetch(`${TD_BASE}/authorization`, {
        headers: { Authorization: `JWT ${cached}` },
      });
      if (res.ok) return cached;
      console.warn(`[TD] Cached token invalid (${res.status}), re-authenticating...`);
    } catch {
      console.warn("[TD] Cached token check failed, re-authenticating...");
    }
  }
  const { token } = await tdLogin();
  return token;
}

//  Company & Users 

export async function getTDCompanyId(token: string): Promise<string> {
  const cached = process.env.TIMEDOCTOR_COMPANY_ID;
  if (cached) return cached;

  const res = await fetch(`${TD_BASE}/authorization`, {
    headers: { Authorization: `JWT ${token}` },
  });
  if (!res.ok) throw new Error(`TD authorization failed: ${res.status}`);

  const json = await res.json();
  const companies = json.data?.companies;
  if (!companies || companies.length === 0) throw new Error("No TD companies found");
  return companies[0].id;
}

export async function getTDUsers(
  token: string,
  companyId: string
): Promise<TDUser[]> {
  const allUsers: TDUser[] = [];
  let page = 0;
  const limit = 200;

  while (true) {
    const res = await fetch(
      `${TD_BASE}/users?company=${companyId}&limit=${limit}&page=${page}`,
      { headers: { Authorization: `JWT ${token}` } }
    );
    if (!res.ok) throw new Error(`TD users fetch failed: ${res.status}`);

    const json = await res.json();
    const users = json.data as TDUser[];
    if (!users || users.length === 0) break;
    allUsers.push(...users);
    if (users.length < limit) break;
    page++;
  }

  return allUsers;
}

//  Worklogs 

/**
 * Fetch raw worklogs for a date range.
 * IMPORTANT: TD API returns empty results without a `user` param.
 * Must fetch per-user. Supports batching to stay under rate limits.
 */
export async function getTDWorklogs(
  token: string,
  companyId: string,
  from: string, // ISO date
  to: string, // ISO date
  userIds: string[]
): Promise<TDWorklog[]> {
  if (userIds.length === 0) return [];

  const allWorklogs: TDWorklog[] = [];
  const BATCH_SIZE = 10; // parallel requests per batch

  for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
    const batch = userIds.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (userId) => {
        const params = new URLSearchParams({
          company: companyId,
          from,
          to,
          user: userId,
          limit: "1000",
        });

        try {
          const res = await fetch(
            `${TD_BASE}/activity/worklog?${params.toString()}`,
            { headers: { Authorization: `JWT ${token}` } }
          );
          if (!res.ok) return [];
          const json = await res.json();
          const data = json.data;
          if (!data || !Array.isArray(data)) return [];
          return data.flat() as TDWorklog[];
        } catch {
          return [];
        }
      })
    );
    for (const r of results) allWorklogs.push(...r);
  }

  return allWorklogs;
}

//  Aggregation 

/**
 * Aggregate raw worklogs into daily summaries per user.
 * Splits sessions at local midnight boundaries to match Time Doctor dashboard.
 * Returns hours rounded to 2 decimal places, with first-in and last-out times.
 *
 * @param userTimezones  Map of TD userId → IANA timezone string pulled from the
 *                       user's TD profile.  Falls back to UTC if not provided.
 */
export function aggregateWorklogsByDay(
  worklogs: TDWorklog[],
  userTimezones: Map<string, string> | string = new Map()
): Map<string, TDDailyAggregated[]> {
  // Legacy: if a plain string is passed, apply it to all users
  const rawGetTz = typeof userTimezones === "string"
    ? (_userId: string) => userTimezones || "UTC"
    : (userId: string) => userTimezones.get(userId) || "UTC";

  // Cache validated timezones — invalid IANA strings (e.g. "Costa Rica") fall back to UTC
  const tzCache = new Map<string, string>();
  const getTz = (userId: string): string => {
    const raw = rawGetTz(userId);
    if (tzCache.has(raw)) return tzCache.get(raw)!;
    try {
      Intl.DateTimeFormat("en-US", { timeZone: raw });
      tzCache.set(raw, raw);
      return raw;
    } catch {
      console.warn(`[TD] Invalid timezone "${raw}" for user ${userId}, falling back to UTC`);
      tzCache.set(raw, "UTC");
      return "UTC";
    }
  };

  // For each worklog, split at midnight boundaries and accumulate per userId → date
  // Track firstRealStart separately from midnight-split boundaries — a midnight-split
  // continuation sets segStart to 00:00 local, which is NOT the user's actual clock-in time.
  const byUser = new Map<string, Map<string, { seconds: number; firstIn: Date; firstRealStart: Date | null; lastOut: Date; sessions: number }>>();

  for (const wl of worklogs) {
    if (!wl.start || !wl.time || wl.time <= 0) continue;

    const userId = wl.userId;
    const tz = getTz(userId);
    if (!byUser.has(userId)) byUser.set(userId, new Map());
    const userDays = byUser.get(userId)!;

    const startMs = new Date(wl.start).getTime();
    const endMs = startMs + wl.time * 1000;

    // Split this worklog at each local midnight boundary
    let segStart = startMs;
    let isFirstSegment = true;
    while (segStart < endMs) {
      const segDate = getLocalDate(new Date(segStart), tz);
      const nextMidnightMs = getNextLocalMidnight(segStart, tz);
      const segEnd = Math.min(endMs, nextMidnightMs);
      const segSeconds = Math.round((segEnd - segStart) / 1000);

      if (segSeconds > 0) {
        if (!userDays.has(segDate)) {
          userDays.set(segDate, { seconds: 0, firstIn: new Date(segStart), firstRealStart: null, lastOut: new Date(segEnd), sessions: 0 });
        }
        const day = userDays.get(segDate)!;
        day.seconds += segSeconds;
        if (segStart < day.firstIn.getTime()) day.firstIn = new Date(segStart);
        if (segEnd > day.lastOut.getTime()) day.lastOut = new Date(segEnd);

        // Only use actual worklog start times for firstRealStart (not midnight-split boundaries)
        if (isFirstSegment) {
          if (!day.firstRealStart || startMs < day.firstRealStart.getTime()) {
            day.firstRealStart = new Date(startMs);
          }
        }

        day.sessions++;
      }

      segStart = nextMidnightMs;
      isFirstSegment = false;
    }
  }

  const result = new Map<string, TDDailyAggregated[]>();

  for (const [userId, dayMap] of byUser) {
    const days: TDDailyAggregated[] = [];
    const tz = getTz(userId);

    for (const [date, data] of dayMap) {
      const totalMinutes = Math.floor(data.seconds / 60); // floor to match TD dashboard display
      // Prefer the first real worklog start (not a midnight-split boundary).
      // Fall back to firstIn only if a day has no real starts (all hours from overnight carryover).
      const startTime = data.firstRealStart ?? data.firstIn;
      days.push({
        date,
        totalSeconds: data.seconds,
        totalMinutes,
        totalHours: Math.round((totalMinutes / 60) * 1e6) / 1e6, // 6dp avoids repeating decimals while preserving minute precision
        firstStart: formatTimeLocal(startTime, tz),
        lastEnd: formatTimeLocal(data.lastOut, tz),
        sessions: data.sessions,
      });
    }

    days.sort((a, b) => a.date.localeCompare(b.date));
    result.set(userId, days);
  }

  return result;
}

/** Get local date string "YYYY-MM-DD" for a Date in the given timezone */
function getLocalDate(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const day = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${day}`;
}

/** Get the UTC timestamp of the next local midnight after the given UTC ms.
 *  DST-safe: verifies the result and adjusts ±1h if a DST transition shifted it. */
function getNextLocalMidnight(utcMs: number, tz: string): number {
  const d = new Date(utcMs);
  const localDate = getLocalDate(d, tz);

  // Get current local time components
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const h = Number.parseInt(parts.find((p) => p.type === "hour")!.value);
  const m = Number.parseInt(parts.find((p) => p.type === "minute")!.value);
  const s = Number.parseInt(parts.find((p) => p.type === "second")!.value);

  // Estimate: assume 86400s day (works 363 days/year)
  const localSecondsIntoDay = h * 3600 + m * 60 + s;
  const secondsUntilMidnight = 86400 - localSecondsIntoDay;
  let estimate = utcMs + secondsUntilMidnight * 1000;

  // DST check: verify the estimated time lands on the next date
  const estDate = getLocalDate(new Date(estimate), tz);
  if (estDate <= localDate) {
    // DST spring-forward shortened the day — push forward 1h
    estimate += 3600_000;
  } else {
    // Check if we overshot (DST fall-back) — try 1h earlier
    const earlier = getLocalDate(new Date(estimate - 3600_000), tz);
    if (earlier > localDate) {
      estimate -= 3600_000;
    }
  }

  return estimate;
}

/** Format time as "HH:MM" in the given timezone */
function formatTimeLocal(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const h = parts.find((p) => p.type === "hour")!.value;
  const m = parts.find((p) => p.type === "minute")!.value;
  return `${h}:${m}`;
}

//  High-level: Sync for a period 

export interface SyncResult {
  matched: number; // employees matched TD  HRIQ
  unmatched: string[]; // TD users with no HRIQ match
  entries: {
    employeeId: string;
    tdUserId: string;
    dailyEntries: {
      date: string;
      hours: number;
      minutes: number; // total minutes (rounded from seconds) — source of truth
      seconds: number; // raw seconds from TD
      timeIn: string | null;
      timeOut: string | null;
      tdSessions: number;
    }[];
    totalHours: number;
  }[];
}

/**
 * Full sync pipeline:
 * 1. Login to Time Doctor
 * 2. Fetch all TD users
 * 3. Match TD users  HRIQ employees via timeDoctorEmail
 * 4. Fetch worklogs for the period date range
 * 5. Aggregate into daily hours per matched employee
 */
export async function syncTimeDoctorForPeriod(
  periodStart: string, // ISO date
  periodEnd: string, // ISO date
  hriqEmployees: { id: string; timeDoctorEmail: string | null }[],
  timezone?: string
): Promise<SyncResult> {
  const token = await getTDToken();
  const companyId = await getTDCompanyId(token);
  const tdUsers = await getTDUsers(token, companyId);

  // Build email → TD user map (lowercase)
  const tdByEmail = new Map<string, TDUser>();
  for (const u of tdUsers) {
    if (u.email) tdByEmail.set(u.email.toLowerCase(), u);
  }

  // Match HRIQ employees to TD users
  const matches: { employeeId: string; tdUser: TDUser }[] = [];
  const matchedTdIds: string[] = [];

  for (const emp of hriqEmployees) {
    const tdEmail = emp.timeDoctorEmail?.toLowerCase();
    if (!tdEmail) continue;
    const tdUser = tdByEmail.get(tdEmail);
    if (tdUser) {
      matches.push({ employeeId: emp.id, tdUser });
      matchedTdIds.push(tdUser.id);
    }
  }

  if (matchedTdIds.length === 0) {
    return {
      matched: 0,
      unmatched: tdUsers.filter((u) => u.active).map((u) => u.email),
      entries: [],
    };
  }

  // Fetch worklogs per matched user — TD requires user param per request
  // Extend fetch window by ±1 day to account for timezone offset
  const fromDate = new Date(periodStart);
  fromDate.setUTCDate(fromDate.getUTCDate() - 1);
  const toDate = new Date(periodEnd);
  toDate.setUTCDate(toDate.getUTCDate() + 2);
  const worklogs = await getTDWorklogs(
    token,
    companyId,
    fromDate.toISOString(),
    toDate.toISOString(),
    matchedTdIds
  );

  // Build per-user timezone map from TD user profiles — this is the timezone
  // each user has set in their Time Doctor account, which is the correct one
  // to use for splitting worklogs at midnight boundaries.
  // Fall back to the caller-supplied `timezone` override (e.g. employee's HRIQ timezone).
  const userTimezones = new Map<string, string>();
  for (const { tdUser } of matches) {
    const tz = tdUser.timezone ?? timezone;
    if (tz) userTimezones.set(tdUser.id, tz);
  }

  // Aggregate using each user's own TD timezone
  const aggregated = aggregateWorklogsByDay(worklogs, userTimezones);

  // Build results — only include days within the actual period range
  const entries: SyncResult["entries"] = [];
  for (const { employeeId, tdUser } of matches) {
    const days = (aggregated.get(tdUser.id) || []).filter(
      (d) => d.date >= periodStart && d.date <= periodEnd
    );
    // Compute total from minutes sum (integer arithmetic) to avoid floating-point drift
    const totalMinutes = days.reduce((s, d) => s + d.totalMinutes, 0);
    const totalHours = Math.round((totalMinutes / 60) * 1e6) / 1e6;
    entries.push({
      employeeId,
      tdUserId: tdUser.id,
      dailyEntries: days.map((d) => ({
        date: d.date,
        hours: d.totalHours,
        minutes: d.totalMinutes,
        seconds: d.totalSeconds,
        timeIn: d.firstStart,
        timeOut: d.lastEnd,
        tdSessions: d.sessions,
      })),
      totalHours,
    });
  }

  // Find unmatched active TD users
  const matchedEmails = new Set(
    matches.map((m) => m.tdUser.email.toLowerCase())
  );
  const unmatched = tdUsers
    .filter((u) => u.active && !matchedEmails.has(u.email.toLowerCase()))
    .map((u) => `${u.name} <${u.email}>`);

  return {
    matched: matches.length,
    unmatched,
    entries,
  };
}

//  Deactivate / Remove User from Time Doctor 

export interface TDDeactivateResult {
  success: boolean;
  email: string;
  action: "archived" | "deleted" | "not_found" | "already_inactive";
  error?: string;
}

/**
 * Remove a user from the Time Doctor company.
 * First tries to archive (soft-remove) the user via PUT /users/{id}.
 * Falls back to DELETE /users/{id}?company={companyId}&permanently=false.
 * If the user is already inactive, returns success with "already_inactive".
 */
export async function deactivateTDUser(
  email: string,
): Promise<TDDeactivateResult> {
  try {
    const token = await getTDToken();
    const companyId = await getTDCompanyId(token);
    const tdUsers = await getTDUsers(token, companyId);

    const tdUser = tdUsers.find(
      (u) => u.email.toLowerCase() === email.toLowerCase()
    );

    if (!tdUser) {
      console.log(`[TD] User ${email} not found in Time Doctor`);
      return { success: true, email, action: "not_found" };
    }

    if (!tdUser.active) {
      console.log(`[TD] User ${email} is already inactive in Time Doctor`);
      return { success: true, email, action: "already_inactive" };
    }

    // Try DELETE to remove user from company (archive, not permanent delete)
    const res = await fetch(
      `${TD_BASE}/users/${tdUser.id}?company=${companyId}&permanently=false`,
      {
        method: "DELETE",
        headers: {
          Authorization: `JWT ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (res.ok) {
      console.log(`[TD] User ${email} (id: ${tdUser.id}) archived successfully`);
      return { success: true, email, action: "archived" };
    }

    // If DELETE fails, try PUT to set user as inactive
    const putRes = await fetch(
      `${TD_BASE}/users/${tdUser.id}?company=${companyId}`,
      {
        method: "PUT",
        headers: {
          Authorization: `JWT ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ active: false }),
      }
    );

    if (putRes.ok) {
      console.log(`[TD] User ${email} (id: ${tdUser.id}) deactivated via PUT`);
      return { success: true, email, action: "archived" };
    }

    const errBody = await putRes.text();
    console.error(`[TD] Failed to deactivate ${email}: DELETE=${res.status}, PUT=${putRes.status}: ${errBody}`);
    return { success: false, email, action: "archived", error: `TD API error: ${putRes.status}` };
  } catch (err: any) {
    console.error(`[TD] Failed to deactivate ${email}:`, err.message);
    return { success: false, email, action: "archived", error: err.message };
  }
}

//  Invite User to Time Doctor 

export interface TDInviteResult {
  success: boolean;
  tdUserId?: string;
  email: string;
  error?: string;
  inviteToken?: string;
  inviteUrl?: string;
}

/**
 * Invite a user to the Time Doctor company.
 * Sends them an email invitation to join and set up their account.
 * Uses POST /invitations?company={companyId} with singular email field.
 */
export async function inviteTDUser(
  email: string,
  name: string,
  opts?: {
    role?: string; // "normal" (default), "admin", "manager"
    timezone?: string;
  }
): Promise<TDInviteResult> {
  try {
    const token = await getTDToken();
    const companyId = await getTDCompanyId(token);

    // Check if user already exists in TD
    const existingUsers = await getTDUsers(token, companyId);
    const existing = existingUsers.find(
      (u) => u.email.toLowerCase() === email.toLowerCase()
    );
    if (existing) {
      console.log(`[TD] User ${email} already exists in Time Doctor (id: ${existing.id}, active: ${existing.active})`);
      // Update their name if we have a better one
      if (name.trim() && existing.name !== name.trim()) {
        await updateTDUserName(token, companyId, existing.id, name.trim());
      }
      // Always trigger password reset — gives the user a working setup link
      // (TD invitation "Join Your Team" links are broken/404)
      try {
        const resetRes = await fetch(
          `${TD_BASE}/profile/restore-password?email=${encodeURIComponent(email.toLowerCase())}`,
          { method: "GET" }
        );
        console.log(`[TD] Password reset for ${email}: status=${resetRes.status}`);
      } catch (resetErr) {
        console.warn(`[TD] Password reset trigger failed for ${email}:`, resetErr);
      }
      return { success: true, tdUserId: existing.id, email, error: "User already exists in Time Doctor" };
    }

    // POST invitation — singular "email" field, not "emails" array
    const res = await fetch(
      `${TD_BASE}/invitations?company=${companyId}`,
      {
        method: "POST",
        headers: {
          Authorization: `JWT ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.toLowerCase(),
          name: name.trim(),
          role: opts?.role ?? "normal",
        }),
      }
    );

    if (!res.ok) {
      const body = await res.text();
      // 409 "hireExists" means user is already in the company — treat as success
      if (res.status === 409) {
        console.log(`[TD] User ${email} already exists in Time Doctor (409 hireExists)`);
        // Still update the name on the existing user
        const existingAfter = existingUsers.find(
          (u) => u.email.toLowerCase() === email.toLowerCase()
        );
        if (existingAfter) {
          await updateTDUserName(token, companyId, existingAfter.id, name.trim());
        }
        // Trigger password reset for users who haven't set up yet
        try {
          await fetch(`${TD_BASE}/profile/restore-password?email=${encodeURIComponent(email.toLowerCase())}`, { method: "GET" });
          console.log(`[TD] Password reset email triggered for ${email} (409 hireExists)`);
        } catch {}
        return { success: true, email, error: "User already exists in Time Doctor" };
      }
      console.error(`[TD] Invitation failed for ${email} (${res.status}):`, body);
      return { success: false, email, error: `TD API error: ${res.status} - ${body.slice(0, 200)}` };
    }

    const json = await res.json();
    const newUserId = json.data?.userId ?? json.data?.id;
    // Log full response to diagnose broken invitation email links
    const inviteToken = json.data?.inviteToken ?? json.data?.token ?? json.data?.invitationToken ?? null;
    const inviteUrl = json.data?.inviteUrl ?? json.data?.url ?? json.data?.registrationUrl ?? null;
    console.log(`[TD] User ${email} invited successfully${newUserId ? ` (userId: ${newUserId})` : ""}${inviteToken ? ` (token: ${inviteToken})` : ""}${inviteUrl ? ` (url: ${inviteUrl})` : ""}`);
    console.log(`[TD] Full invite response keys: ${JSON.stringify(Object.keys(json.data ?? json))}`);

    // Set the user's full name via PUT (invitation may not propagate name reliably)
    if (newUserId && name.trim()) {
      await updateTDUserName(token, companyId, newUserId, name.trim());
    }

    // Trigger a password reset email as a fallback — TD's invitation email "Join Your Team"
    // link is broken (404), but the password reset link works. Since the user was just created
    // via the invitation, they can set their password via the reset link instead.
    try {
      const resetRes = await fetch(
        `${TD_BASE}/profile/restore-password?email=${encodeURIComponent(email.toLowerCase())}`,
        { method: "GET" }
      );
      if (resetRes.ok) {
        console.log(`[TD] Password reset email triggered for ${email} (fallback for broken invite link)`);
      } else {
        console.warn(`[TD] Password reset failed for ${email} (${resetRes.status}) — user will need to use Forgot Password manually`);
      }
    } catch (resetErr) {
      console.warn(`[TD] Password reset trigger failed for ${email}:`, resetErr);
    }

    return { success: true, tdUserId: newUserId, email, inviteToken: inviteToken ?? undefined, inviteUrl: inviteUrl ?? undefined };
  } catch (err: any) {
    console.error(`[TD] Failed to invite ${email}:`, err.message);
    return { success: false, email, error: err.message };
  }
}

//  Get Pending Invitations ─────────────────────────────────────────

/**
 * Retrieve pending invitations for the company.
 * Used to diagnose broken invitation email links and extract invite tokens.
 * GET /invitations?company={companyId}
 */
export async function getPendingInvitations(): Promise<{
  invitations: Array<Record<string, unknown>>;
  error?: string;
}> {
  try {
    const token = await getTDToken();
    const companyId = await getTDCompanyId(token);

    const res = await fetch(
      `${TD_BASE}/invitations?company=${companyId}`,
      { headers: { Authorization: `JWT ${token}` } }
    );

    if (!res.ok) {
      const body = await res.text();
      return { invitations: [], error: `TD API error (${res.status}): ${body.slice(0, 200)}` };
    }

    const json = await res.json();
    const invitations = json.data ?? [];
    console.log(`[TD] Got ${invitations.length} pending invitations. Sample keys: ${invitations.length > 0 ? JSON.stringify(Object.keys(invitations[0])) : "none"}`);
    return { invitations };
  } catch (err: any) {
    return { invitations: [], error: err.message };
  }
}

//  Update User Name ────────────────────────────────────────────────

/**
 * Update a Time Doctor user's display name via PUT /users/{id}.
 * Called automatically during inviteTDUser and available for bulk fixes.
 */
export async function updateTDUserName(
  token: string,
  companyId: string,
  userId: string,
  fullName: string,
): Promise<boolean> {
  try {
    const res = await fetch(
      `${TD_BASE}/users/${userId}?company=${companyId}`,
      {
        method: "PUT",
        headers: {
          Authorization: `JWT ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: fullName }),
      }
    );

    if (res.ok) {
      console.log(`[TD] Updated user ${userId} name to "${fullName}"`);
      return true;
    }

    const body = await res.text();
    console.error(`[TD] Failed to update name for ${userId} (${res.status}): ${body}`);
    return false;
  } catch (err: any) {
    console.error(`[TD] Failed to update name for ${userId}:`, err.message);
    return false;
  }
}

/**
 * Bulk rename all TD users to match their HRIQ employee first + last name.
 * Matches via timeDoctorEmail on the employee record.
 * Returns a summary of updates, skips, and failures.
 */
export async function bulkRenameTDUsers(
  hriqEmployees: {
    id: string;
    legalFirstName: string;
    legalLastName: string;
    timeDoctorEmail: string | null;
  }[]
): Promise<{
  updated: number;
  skipped: number;
  failed: number;
  details: { email: string; oldName: string; newName: string; status: "updated" | "skipped" | "failed" }[];
}> {
  const token = await getTDToken();
  const companyId = await getTDCompanyId(token);
  const tdUsers = await getTDUsers(token, companyId);

  const tdByEmail = new Map<string, TDUser>();
  for (const u of tdUsers) {
    if (u.email) tdByEmail.set(u.email.toLowerCase(), u);
  }

  const details: { email: string; oldName: string; newName: string; status: "updated" | "skipped" | "failed" }[] = [];
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const emp of hriqEmployees) {
    if (!emp.timeDoctorEmail) continue;
    const tdUser = tdByEmail.get(emp.timeDoctorEmail.toLowerCase());
    if (!tdUser) continue;

    const newName = [emp.legalFirstName, emp.legalLastName].filter(Boolean).join(" ").trim();
    if (!newName) continue;

    // Skip if name already matches
    if (tdUser.name === newName) {
      details.push({ email: tdUser.email, oldName: tdUser.name, newName, status: "skipped" });
      skipped++;
      continue;
    }

    const ok = await updateTDUserName(token, companyId, tdUser.id, newName);
    if (ok) {
      details.push({ email: tdUser.email, oldName: tdUser.name, newName, status: "updated" });
      updated++;
    } else {
      details.push({ email: tdUser.email, oldName: tdUser.name, newName, status: "failed" });
      failed++;
    }
  }

  return { updated, skipped, failed, details };
}

//  Configure User Settings ────────────────────────────────────────

export interface TDUserSettingsResult {
  success: boolean;
  email: string;
  settings: Record<string, unknown>;
  error?: string;
}

/**
 * Configure Time Doctor user settings after invitation.
 * Sets timeout, disables edit time, and removes delete screencasts permission.
 *
 * Settings applied via PUT /users/{id}?company={companyId}:
 * - inactiveTimeout: minutes before auto-timeout (default 15, min 3)
 * - canEditTime: "on" | "off" | "approval" — controls manual time editing
 * - canDeleteScreencasts: whether user can delete their own screencasts
 */
export async function configureTDUserSettings(
  email: string,
  settings?: {
    inactiveTimeout?: number;  // minutes (3–360)
    canEditTime?: "on" | "off" | "approval";
    canDeleteScreencasts?: boolean;
    screenshotInterval?: number; // minutes between screenshots (e.g. 3)
  },
): Promise<TDUserSettingsResult> {
  const defaults = {
    inactiveTimeout: 3,           // 3 minute timeout
    canEditTime: "off" as const,  // disable edit time
    canDeleteScreencasts: false,  // no deleting screencasts
    screenshotInterval: 3,        // screenshot every 3 minutes
  };
  const merged = { ...defaults, ...settings };

  try {
    const token = await getTDToken();
    const companyId = await getTDCompanyId(token);
    const tdUsers = await getTDUsers(token, companyId);

    const tdUser = tdUsers.find(
      (u) => u.email.toLowerCase() === email.toLowerCase()
    );

    if (!tdUser) {
      console.warn(`[TD] User ${email} not found — cannot configure settings`);
      return { success: false, email, settings: merged, error: "User not found in Time Doctor" };
    }

    const body: Record<string, unknown> = {
      inactiveTimeout: merged.inactiveTimeout,
      canEditTime: merged.canEditTime,
      canDeleteScreencasts: merged.canDeleteScreencasts,
      screenshotsFrequency: merged.screenshotInterval, // TD API field name
    };

    const res = await fetch(
      `${TD_BASE}/users/${tdUser.id}?company=${companyId}`,
      {
        method: "PUT",
        headers: {
          Authorization: `JWT ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    if (res.ok) {
      console.log(`[TD] Configured settings for ${email}: timeout=${merged.inactiveTimeout}min, editTime=${merged.canEditTime}, deleteScreencasts=${merged.canDeleteScreencasts}`);
      return { success: true, email, settings: merged };
    }

    const errBody = await res.text();
    console.error(`[TD] Failed to configure settings for ${email} (${res.status}): ${errBody}`);
    return { success: false, email, settings: merged, error: `TD API error: ${res.status}` };
  } catch (err: any) {
    console.error(`[TD] Failed to configure settings for ${email}:`, err.message);
    return { success: false, email, settings: merged, error: err.message };
  }
}
