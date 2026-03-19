import { randomBytes } from "crypto";
import { database } from "@repo/database";

/**
 * Generate a cryptographically secure self-service token for contractor info forms.
 * Returns a 64-character hex string (256 bits of entropy).
 */
export function generateSelfServiceToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Ensure an employee has a self-service token, generating one if missing.
 * Returns the token.
 */
export async function ensureSelfServiceToken(employeeId: string): Promise<string> {
  const emp = await database.employee.findUnique({
    where: { id: employeeId },
    select: { selfServiceToken: true },
  });

  if (emp?.selfServiceToken) return emp.selfServiceToken;

  const token = generateSelfServiceToken();
  await database.employee.update({
    where: { id: employeeId },
    data: { selfServiceToken: token },
  });
  return token;
}

/**
 * Generate a sequential employee number.
 * Format: 001, 002, 003, ... (zero-padded to at least 3 digits)
 * Uses a targeted query to find the current highest number.
 */
export async function generateEmployeeNumber(organizationId: string): Promise<string> {
  // Generate a random 5-digit employee number, unique within the organization.
  // Using random instead of sequential prevents leaking contractor count info.
  const result = await database.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(42)`;

    // Get all existing numbers in this org
    const rows = await tx.$queryRaw<Array<{ employee_number: string }>>`
      SELECT employee_number FROM hriq_employees
      WHERE organization_id = ${organizationId}
        AND employee_number IS NOT NULL
    `;
    const existing = new Set(rows.map((r: any) => r.employee_number));

    // Generate a unique 5-digit number (10000–99999)
    let candidate: string;
    let attempts = 0;
    do {
      candidate = String(10000 + Math.floor(Math.random() * 90000));
      attempts++;
      if (attempts > 200) {
        // Fallback: use 6-digit
        candidate = String(100000 + Math.floor(Math.random() * 900000));
      }
    } while (existing.has(candidate));

    return candidate;
  });

  return result;
}

/**
 * Recompute onboarding session progress from its steps.
 * Marks employee as active when all required steps are completed.
 */
export async function recomputeSessionProgress(sessionId: string) {
  const steps = await database.onboardingStep.findMany({
    where: { sessionId },
    select: { isRequired: true, status: true, stepType: true },
  });
  const requiredSteps = steps.filter((s: any) => s.isRequired && s.stepType !== "payment_setup");
  const completed = requiredSteps.filter((s: any) => s.status === "completed" || s.status === "skipped").length;
  const total = requiredSteps.length;
  const overallProgress = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;

  // Mark session as completed when all steps are done,
  // but do NOT auto-promote employee to "active" — that requires explicit admin approval.
  // IMPORTANT: Do NOT auto-set status to "completed" here — that hides the session
  // from the hiring pipeline query, preventing the Activate button from appearing.
  // The session will be explicitly completed when activateContractor() is called.
  await database.onboardingSession.update({
    where: { id: sessionId },
    data: {
      overallProgress,
      // Only advance from not_started → in_progress; never auto-complete
      ...(overallProgress > 0 ? { status: "in_progress" } : {}),
    },
  });
}

/**
 * Parse period date range from a label string like "January 26 - February 10, 2026".
 * Falls back to current date if parsing fails.
 */
export function parsePeriodDates(label: string): { start: Date; end: Date } {
  const match = label.match(/(\w+ \d{1,2})\s*[-–]\s*(\w+ \d{1,2}),?\s*(\d{4})/);
  if (match) {
    const end = new Date(`${match[2]}, ${match[3]}`);
    let start = new Date(`${match[1]}, ${match[3]}`);
    // If start is after end, the period spans a year boundary (e.g., Dec–Jan)
    // so the start date belongs to the previous year
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      if (start > end) {
        start = new Date(`${match[1]}, ${Number(match[3]) - 1}`);
      }
      return { start, end };
    }
  }
  return { start: new Date(), end: new Date() };
}

/**
 * Compute aggregated weekly hours from daily timesheet rows.
 * NOTE: These are biweekly totals per weekday (not single-day hours),
 * since a pay period typically spans multiple weeks.
 */
export function computeWeeklyHours(rows: Array<{ date: string; payableHours: number }>) {
  const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
  const weekly: Record<string, number> = {
    monday: 0, tuesday: 0, wednesday: 0, thursday: 0,
    friday: 0, saturday: 0, sunday: 0,
  };
  for (const row of rows) {
    if (row.payableHours <= 0) continue;
    try {
      // Use UTC noon to avoid timezone date-shift (matches submitTimesheet behavior)
      const dateStr = row.date.includes("T") ? row.date : `${row.date}T12:00:00Z`;
      const d = new Date(dateStr);
      if (!Number.isNaN(d.getTime())) {
        weekly[DAY_NAMES[d.getUTCDay()]!] += row.payableHours;
      }
    } catch {
      // Skip rows with unparseable dates
    }
  }
  return weekly;
}

/**
 * Normalize an email address: trim and lowercase.
 * Use on all email writes for consistent matching.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Get the best email address for sending to a contractor.
 *
 * If a work email exists, use it — all internal communications should go
 * to the work inbox. Falls back to personal email only if no work email is set.
 *
 * This is the single source of truth — all contractor-facing email sends
 * should use this instead of inline `personalEmail ?? workEmail`.
 */
export function getContractorEmail(emp: {
  personalEmail?: string | null;
  workEmail?: string | null;
}): string | null {
  const work = emp.workEmail?.trim() || null;
  const personal = emp.personalEmail?.trim() || null;
  return work || personal || null;
}

/**
 * Whitelist of fields that can be updated via updateEmployee.
 * Prevents mass-assignment of sensitive fields like isLocked, hriqRole, etc.
 */
export const EMPLOYEE_UPDATABLE_FIELDS = [
  "legalFirstName",
  "legalLastName",
  "secondName",
  "secondLastName",
  "preferredName",
  "photoUrl",
  "personalEmail",
  "workEmail",
  "phoneNumber",
  "employmentType",
  "department",
  "jobTitle",
  "managerId",
  "location",
  "timezone",
  "paymentPlatform",
  "paymentAccountInfo",
  "compensationType",
  "hourlyRate",
  "monthlySalary",
  "currency",
  "preferredPaymentMethod",
  "paymentMethodVerified",
  "dateOfBirth",
  "streetAddress",
  "city",
  "stateProvince",
  "postalCode",
  "country",
  "mobileNumber",
  "homePhone",
  "bankName",
  "bankAccountNumber",
  "bankAccountName",
  "bankSwiftCode",
  "bankRoutingNumber",
  "bankAddress",
  "debitCardNumber",
  "emergencyContactName",
  "emergencyContactPhone",
  "emergencyContactRelation",
  "dailyHoursTarget",
  "timeDoctorEmail",
  "startDate",
  "endDate",
  "linkedUserId",
  "recruitCrmId",
  "recruitCrmSlug",
  "cadanaPersonId",
  "cadanaGateRequired",
  "bankExtraData",
] as const;

/**
 * Filter an object to only include whitelisted employee update fields.
 */
export function sanitizeEmployeeUpdate(data: Record<string, unknown>): Record<string, unknown> {
  const allowed = new Set<string>(EMPLOYEE_UPDATABLE_FIELDS);
  const safe = Object.fromEntries(
    Object.entries(data).filter(([key]) => allowed.has(key))
  );
  // Trim string fields that commonly have trailing whitespace from copy-paste
  for (const field of ["legalFirstName", "legalLastName", "secondName", "secondLastName", "preferredName", "personalEmail", "workEmail"]) {
    if (field in safe && typeof safe[field] === "string") {
      safe[field] = (safe[field] as string).trim();
    }
  }
  return safe;
}

//  JotForm URL Helpers 

/**
 * Convert any JotForm URL variant to a public form URL (no login required).
 */
export function buildPublicJotFormUrl(url: string, formIdFallback: string): string {
  const trimmed = url.trim();
  if (trimmed.includes("/sign/") && trimmed.includes("/fill/")) return trimmed;
  if (trimmed.includes("/sign/")) {
    const match = trimmed.match(/(\d{12,})/);
    return `https://form.jotform.com/${match?.[1] ?? formIdFallback}`;
  }
  if (trimmed.includes("form.jotform.com/")) return trimmed;
  const match = trimmed.match(/(\d{12,})/);
  return `https://form.jotform.com/${match?.[1] ?? formIdFallback}`;
}

/**
 * Check if a URL is already a public sign-fill URL (not requiring JotForm login).
 */
export function isPublicSignFillUrl(url: string): boolean {
  const trimmed = url.trim();
  return !trimmed.includes("/sign/") || trimmed.includes("/fill/");
}

/**
 * Merge prefill params into a URL, preserving existing params.
 */
export function mergePrefillParams(url: string, params: URLSearchParams): string {
  if (params.toString().length === 0) return url;
  try {
    const merged = new URL(url);
    params.forEach((value, key) => {
      merged.searchParams.set(key, value);
    });
    return merged.toString();
  } catch {
    const join = url.includes("?") ? "&" : "?";
    return `${url}${join}${params.toString()}`;
  }
}

// ─────────────────────────────────────────────────────────────────────
// Cross-System Email Conflict Detection
// Prevents using an email that already exists in another context,
// which could corrupt permissions, reset passwords, or create
// confusing multi-org membership conflicts.
// ─────────────────────────────────────────────────────────────────────

export type EmailConflictResult = {
  hasConflict: boolean;
  message: string | null;
  details: {
    isAppUser: boolean;
    appUserDisplayName?: string;
    orgMemberships: Array<{ orgName: string; role: string }>;
    employeeRecords: Array<{ orgName: string; name: string; status: string }>;
  };
};

/**
 * Comprehensive cross-system email conflict check.
 *
 * Searches across:
 *  1. AppUser (Supabase auth accounts)
 *  2. OrganizationMember (existing org memberships)
 *  3. Employee records (across ALL orgs, not just current)
 *
 * @param email           The email to check
 * @param options.allowSameOrg  If set, skip conflicts within this org ID
 * @param options.allowUserId   If set, skip conflicts for this specific user
 * @param options.context       Description for error messages
 */
export async function checkEmailConflicts(
  email: string,
  options?: {
    allowSameOrg?: string;
    allowUserId?: string;
    context?: string;
  }
): Promise<EmailConflictResult> {
  const normalized = normalizeEmail(email);
  const noConflict: EmailConflictResult = {
    hasConflict: false,
    message: null,
    details: { isAppUser: false, orgMemberships: [], employeeRecords: [] },
  };

  if (!normalized) return noConflict;

  // 1. Check AppUser (login accounts)
  const appUser = await database.appUser.findFirst({
    where: { email: { equals: normalized, mode: "insensitive" } },
    select: { supabaseUserId: true, displayName: true, email: true },
  });

  // If this is the same user we're allowing, no conflict
  if (appUser && options?.allowUserId && appUser.supabaseUserId === options.allowUserId) {
    return noConflict;
  }

  // 2. Check OrganizationMember memberships
  let orgMemberships: Array<{ orgName: string; role: string }> = [];
  if (appUser) {
    const memberships = await database.organizationMember.findMany({
      where: { userId: appUser.supabaseUserId },
      include: { organization: { select: { id: true, name: true } } },
    });
    orgMemberships = memberships
      .filter((m) => !options?.allowSameOrg || m.organizationId !== options.allowSameOrg)
      .map((m) => ({ orgName: m.organization.name, role: m.role }));
  }

  // 3. Check Employee records across ALL organizations
  const employeeRecords = await database.employee.findMany({
    where: {
      employmentStatus: { not: "offboarded" },
      OR: [
        { personalEmail: { equals: normalized, mode: "insensitive" } },
        { workEmail: { equals: normalized, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      legalFirstName: true,
      legalLastName: true,
      employmentStatus: true,
      organizationId: true,
      organization: { select: { id: true, name: true } },
    },
  });

  const filteredEmployees = employeeRecords
    .filter((e) => !options?.allowSameOrg || e.organizationId !== options.allowSameOrg)
    .map((e) => ({
      orgName: e.organization?.name ?? "Unknown",
      name: `${e.legalFirstName} ${e.legalLastName}`.trim(),
      status: e.employmentStatus,
    }));

  // Build conflict message
  const parts: string[] = [];
  const ctx = options?.context ?? "this action";

  if (appUser && orgMemberships.length > 0) {
    const orgList = orgMemberships.map((m) => `${m.orgName} (${m.role})`).join(", ");
    parts.push(
      `"${normalized}" is already a dashboard user${appUser.displayName ? ` (${appUser.displayName})` : ""} with access to: ${orgList}. Using this email for ${ctx} could corrupt their permissions.`
    );
  } else if (appUser) {
    parts.push(
      `"${normalized}" is already registered as a dashboard user${appUser.displayName ? ` (${appUser.displayName})` : ""}. Using this email for ${ctx} could affect their account.`
    );
  }

  if (filteredEmployees.length > 0) {
    const empList = filteredEmployees.map((e) => `${e.name} in ${e.orgName} (${e.status})`).join(", ");
    parts.push(
      `This email is already used by contractor(s): ${empList}. Reusing it may cause data conflicts.`
    );
  }

  if (parts.length === 0) return noConflict;

  return {
    hasConflict: true,
    message: parts.join(" "),
    details: {
      isAppUser: !!appUser,
      appUserDisplayName: appUser?.displayName ?? undefined,
      orgMemberships,
      employeeRecords: filteredEmployees,
    },
  };
}
