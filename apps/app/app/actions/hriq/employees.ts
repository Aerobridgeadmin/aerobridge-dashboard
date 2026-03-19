"use server";

import { requireOrg, requireSession } from "@repo/auth/session";
import { database } from "@repo/database";
import { revalidatePath } from "next/cache";
import { generateEmployeeNumber, generateSelfServiceToken, sanitizeEmployeeUpdate, checkEmailConflicts, getContractorEmail } from "@/lib/hriq/utils";
import { sanitizeDecimal } from "./constants";
import { HriqError } from "@/lib/hriq/errors";

export async function getEmployeeById(id: string) {
  const session = await requireSession();

  // Only super_admin, admin, and manager can view contractor details
  if (!["super_admin", "admin", "manager"].includes(session.orgRole ?? "")) {
    throw new Error("You do not have permission to view contractor details");
  }

  // Super admins can view any contractor across all orgs
  // Non-super-admins must have an active org
  if (session.orgRole !== "super_admin" && !session.orgId) {
    throw new Error("No organization selected");
  }
  const where = session.orgRole === "super_admin"
    ? { id }
    : { id, organizationId: session.orgId! };

  return database.employee.findFirst({
    where,
    include: {
      organization: { select: { id: true, name: true } },
      manager: { select: { id: true, legalFirstName: true, legalLastName: true } },
      tasks: { orderBy: { createdAt: "desc" }, take: 50 },
      documents: { orderBy: { createdAt: "desc" } },
      payments: { orderBy: { createdAt: "desc" }, take: 50 },
      managerNotes: { orderBy: { createdAt: "desc" }, take: 25 },
      timesheetSubmissions: {
        orderBy: { createdAt: "desc" },
        take: 25,
        include: { period: { select: { name: true, startDate: true, endDate: true } } },
      },
    },
  });
}

export async function createEmployee(data: {
  legalFirstName: string;
  legalLastName: string;
  secondLastName?: string;
  employmentType: string;
  preferredName?: string;
  personalEmail?: string;
  workEmail?: string;
  phoneNumber?: string;
  mobileNumber?: string;
  department?: string;
  jobTitle?: string;
  managerId?: string;
  location?: string;
  timezone?: string;
  compensationType?: string;
  hourlyRate?: string;
  monthlySalary?: string;
  currency?: string;
  preferredPaymentMethod?: string;
  startDate?: string;
  dateOfBirth?: string;
  country?: string;
  dailyHoursTarget?: string;
}) {
  const session = await requireOrg();

  if (!["super_admin", "admin"].includes(session.orgRole ?? "")) {
    return { error: "[HRIQ-0105] Only admins can create contractors" } as any;
  }

  // Check for duplicate email across ALL orgs + dashboard users (cross-system safeguard)
  const emailToCheck = (data.personalEmail ?? data.workEmail)?.trim().toLowerCase();
  if (emailToCheck) {
    const conflict = await checkEmailConflicts(emailToCheck, {
      allowSameOrg: session.orgId,
      context: "creating a new contractor",
    });
    if (conflict.hasConflict) {
      return { error: `[HRIQ-0203] ${conflict.message}` } as any;
    }

    // Also check within same org for same-org duplicates
    const existing = await database.employee.findFirst({
      where: {
        organizationId: session.orgId,
        employmentStatus: { not: "offboarded" },
        OR: [
          { personalEmail: { equals: emailToCheck, mode: "insensitive" } },
          { workEmail: { equals: emailToCheck, mode: "insensitive" } },
        ],
      },
      select: { id: true, legalFirstName: true, legalLastName: true },
    });
    if (existing) {
      return { error: `[HRIQ-0203] Email "${emailToCheck}" is already used by ${existing.legalFirstName} ${existing.legalLastName} in this organization. Use a different email or update the existing record first.` } as any;
    }
  }

  const employeeNumber = await generateEmployeeNumber(session.orgId!);

  // Default photo to org logo if none provided
  let defaultPhotoUrl: string | undefined;
  try {
    const orgData = await database.organization.findUnique({
      where: { id: session.orgId! },
      select: { logoUrl: true },
    });
    if (orgData?.logoUrl) defaultPhotoUrl = orgData.logoUrl;
  } catch (err) { console.warn("[employees:createEmployee] Suppressed error:", err); }

  try {
    const employee = await database.employee.create({
      data: {
        organizationId: session.orgId,
        employeeNumber,
        selfServiceToken: generateSelfServiceToken(),
        legalFirstName: data.legalFirstName.trim(),
        legalLastName: data.legalLastName.trim(),
        secondLastName: data.secondLastName?.trim() || undefined,
        preferredName: data.preferredName?.trim() || undefined,
        employmentType: data.employmentType,
        personalEmail: data.personalEmail || undefined,
        workEmail: data.workEmail || undefined,
        phoneNumber: data.phoneNumber || undefined,
        mobileNumber: data.mobileNumber || undefined,
        department: data.department || undefined,
        jobTitle: data.jobTitle || undefined,
        managerId: data.managerId || undefined,
        location: data.location || data.country || undefined,
        timezone: data.timezone || undefined,
        hourlyRate: sanitizeDecimal(data.hourlyRate) || undefined,
        monthlySalary: sanitizeDecimal(data.monthlySalary) || undefined,
        compensationType: data.compensationType === "monthly" ? "monthly" : "hourly",
        currency: data.currency ?? "USD",
        preferredPaymentMethod: (data.preferredPaymentMethod === "cadana" || data.preferredPaymentMethod === "wise") ? data.preferredPaymentMethod : undefined,
        startDate: data.startDate ? new Date(data.startDate as any) : undefined,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth as any) : undefined,
        country: data.country || data.location || undefined,
        dailyHoursTarget: data.dailyHoursTarget || "7.25",
        photoUrl: defaultPhotoUrl,
        createdByUserId: session.userId,
      },
    });

    // Audit log
    try {
      await database.auditLog.create({
        data: {
          organizationId: session.orgId,
          actorType: "user",
          actorUserId: session.userId,
          action: "employee.created",
          objectType: "employee",
          objectId: employee.id,
          newValue: { employeeNumber, name: `${data.legalFirstName} ${data.legalLastName}` },
        },
      });
    } catch (auditErr) {
      console.error("[HRIQ] Audit log write failed (non-blocking):", auditErr);
    }

    // ─── Payment method post-creation setup ────────────────────────────────
    if (data.preferredPaymentMethod === "cadana") {
      // Set cadana gate so contractor is prompted to set up Cadana on login
      try {
        await database.employee.update({
          where: { id: employee.id },
          data: { cadanaGateRequired: true },
        });
      } catch (gateErr) {
        console.warn("[employees:createEmployee] Failed to set Cadana gate:", gateErr);
      }

      // Create Cadana Person + User (triggers Cadana welcome email with login credentials)
      const email = getContractorEmail(data as any);
      if (email) {
        try {
          const cadana = await import("@repo/integrations/cadana");
          let person;
          try {
            person = await cadana.onboardToCadana({
              firstName: data.legalFirstName.trim(),
              lastName: data.legalLastName.trim(),
              email,
              country: data.country || "US",
              hourlyRate: data.hourlyRate ? Number(data.hourlyRate) : undefined,
              currency: data.currency ?? "USD",
            });
          } catch (createErr: any) {
            if (createErr?.message?.includes("already exists") || createErr?.message?.includes("400")) {
              person = await cadana.findCadanaPersonByEmail(email);
            } else {
              throw createErr;
            }
          }
          if (person) {
            await database.employee.update({
              where: { id: employee.id },
              data: { cadanaPersonId: person.id, cadanaPersonStatus: person.status ?? "Active", cadanaSyncedAt: new Date() },
            });
            // Create User account so contractor gets real login credentials
            try {
              const existingUser = await cadana.findCadanaUserByEmail(email);
              if (!existingUser) {
                await cadana.createCadanaUser(person.id);
                console.log(`[employees:createEmployee] Cadana user created for person ${person.id}`);
              }
            } catch (userErr) {
              console.warn("[employees:createEmployee] Failed to create Cadana user (non-critical):", userErr);
            }
          }
        } catch (cadanaErr) {
          console.error("[employees:createEmployee] Cadana onboarding failed (non-critical):", cadanaErr);
        }
      }
    }
    // Wise: no gate needed — admin verifies bank details via the Verify button on details page.
    // preferredPaymentMethod is already stored on the record.

    revalidatePath("/[orgSlug]/employees", "page");
    revalidatePath("/[orgSlug]", "page");

    return employee;
  } catch (err: unknown) {
    // Return error as data — Next.js strips thrown error messages in production builds
    const hriqErr = err instanceof HriqError ? (err as HriqError) : null;
    const stdErr = err instanceof Error ? (err as Error) : null;
    const message = hriqErr
      ? `[${hriqErr.code}] ${hriqErr.message}`
      : stdErr?.message.includes("Unique constraint")
        ? (stdErr.message.includes("work_email") ? "[HRIQ-0203] A contractor with this work email already exists." : "[HRIQ-0204] A contractor with this identifier already exists.")
        : stdErr ? stdErr.message : "Unknown error creating contractor";
    return { error: message } as any;
  }
}

export async function updateEmployee(
  id: string,
  data: Record<string, unknown>
) {
  try {
    const session = await requireOrg();

    // Only super_admin, admin, and client roles can update contractors
    if (!["super_admin", "admin"].includes(session.orgRole ?? "")) {
      return { error: "[HRIQ-0105] You do not have permission to edit contractor records" } as any;
    }

    // Super admins can update any contractor; others scoped to their org
    const existing = await database.employee.findFirst({
      where: session.orgRole === "super_admin" ? { id } : { id, organizationId: session.orgId },
      select: {
        id: true, isLocked: true, personalEmail: true, workEmail: true,
        legalFirstName: true, legalLastName: true, employeeNumber: true,
        hourlyRate: true, currency: true, startDate: true, endDate: true,
        dateOfBirth: true, department: true, jobTitle: true, location: true,
        timezone: true, employmentType: true, employmentStatus: true,
        phoneNumber: true, mobileNumber: true, preferredName: true,
        preferredPaymentMethod: true, wiseGateRequired: true, wiseRecipientId: true,
        organizationId: true, selfServiceToken: true,
      },
    });

    if (!existing) throw new HriqError("HRIQ-0201");
    if (existing.isLocked) throw new HriqError("HRIQ-0202");

    // Check for duplicate email if email is being changed
    const newPersonalEmail = (data.personalEmail as string)?.trim().toLowerCase();
    const newWorkEmail = (data.workEmail as string)?.trim().toLowerCase();
    const emailChanging = (newPersonalEmail && newPersonalEmail !== existing.personalEmail?.toLowerCase())
      || (newWorkEmail && newWorkEmail !== existing.workEmail?.toLowerCase());

    if (emailChanging) {
      const emailToCheck = newPersonalEmail || newWorkEmail;
      if (emailToCheck) {
        const dup = await database.employee.findFirst({
          where: {
            id: { not: id },
            linkedUserId: { not: null },
            OR: [
              { personalEmail: { equals: emailToCheck, mode: "insensitive" } },
              { workEmail: { equals: emailToCheck, mode: "insensitive" } },
            ],
          },
          select: { id: true, legalFirstName: true, legalLastName: true },
        });
        if (dup) {
          throw new HriqError("HRIQ-0203", `Email "${emailToCheck}" is already linked to another contractor: ${dup.legalFirstName} ${dup.legalLastName}. Use a different email.`);
        }
      }
    }

    // Whitelist allowed fields to prevent mass-assignment of sensitive fields
    const safeData = sanitizeEmployeeUpdate(data);

    // Sync location ↔ country: they should always match
    if ("location" in safeData && !("country" in safeData)) {
      safeData.country = safeData.location;
    } else if ("country" in safeData && !("location" in safeData)) {
      safeData.location = safeData.country;
    }

    // Convert date strings to Date objects for DateTime fields
    const DATE_FIELDS = ["dateOfBirth", "startDate", "endDate"];
    for (const field of DATE_FIELDS) {
      if (field in safeData) {
        const val = safeData[field];
        if (val && typeof val === "string" && val.trim()) {
          safeData[field] = new Date(val);
        } else {
          safeData[field] = null;
        }
      }
    }

    // Ensure hourlyRate is a valid string for Decimal column
    if ("hourlyRate" in safeData) {
      safeData.hourlyRate = sanitizeDecimal(String(safeData.hourlyRate ?? ""));
    }

    // Ensure monthlySalary is a valid string for Decimal column
    if ("monthlySalary" in safeData) {
      safeData.monthlySalary = sanitizeDecimal(String(safeData.monthlySalary ?? ""));
    }

    // Validate compensationType
    if ("compensationType" in safeData) {
      if (safeData.compensationType !== "hourly" && safeData.compensationType !== "monthly") {
        safeData.compensationType = "hourly";
      }
    }

    // Validate preferredPaymentMethod
    if ("preferredPaymentMethod" in safeData) {
      const pm = String(safeData.preferredPaymentMethod ?? "").trim().toLowerCase();
      if (pm === "cadana" || pm === "wise") {
        safeData.preferredPaymentMethod = pm;
      } else {
        safeData.preferredPaymentMethod = null;
      }
    }

    try {
      const employee = await database.employee.update({
        where: { id },
        data: safeData as any,
      });

      // Sync approved_emails when work/personal email changes
      if (emailChanging) {
        try {
          const oldEmails = [existing.personalEmail, existing.workEmail].filter(Boolean) as string[];
          const newEmails = [
            (safeData as any).personalEmail ?? existing.personalEmail,
            (safeData as any).workEmail ?? existing.workEmail,
          ].filter(Boolean) as string[];

          // Remove old emails no longer in use (batch delete)
          const removedEmails = oldEmails.filter(
            (e) => !newEmails.some((n) => n.toLowerCase() === e.toLowerCase())
          );
          if (removedEmails.length > 0) {
            await database.approvedEmail.deleteMany({
              where: {
                email: { in: removedEmails.map((e) => e.toLowerCase()), mode: "insensitive" },
                organizationId: session.orgId,
              },
            });
          }
          // Add new emails that aren't already approved (batch upsert)
          for (const newEmail of newEmails) {
            await database.approvedEmail.upsert({
              where: { email_organizationId: { email: newEmail.toLowerCase(), organizationId: session.orgId } },
              create: { email: newEmail.toLowerCase(), organizationId: session.orgId },
              update: {},
            });
          }
        } catch (e) {
          console.warn("[updateEmployee] Failed to sync approved_emails:", e);
        }
      }

      try {
        await database.auditLog.create({
          data: {
            organizationId: session.orgId,
            actorType: "user",
            actorUserId: session.userId,
            action: "employee.updated",
            objectType: "employee",
            objectId: id,
            oldValue: Object.fromEntries(
              Object.keys(safeData).map((key) => [key, (existing as Record<string, unknown>)[key]])
            ) as Record<string, any>,
            newValue: safeData as Record<string, any>,
          },
        });
      } catch (auditErr) {
        console.error("[HRIQ] Audit log write failed (non-blocking):", auditErr);
      }

      revalidatePath(`/[orgSlug]/employees/${id}`, "page");
      revalidatePath("/[orgSlug]/employees", "page");

      return employee;
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("Unique constraint")) {
        if (err.message.includes("work_email")) {
          throw new HriqError("HRIQ-0203");
        }
        throw new HriqError("HRIQ-0204");
      }
      throw err;
    }

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[employees.ts:updateEmployee]", _msg);
    return { error: _msg };
  }
}

export async function changeEmployeeStatus(
  id: string,
  newStatus: string,
  reason?: string
) {
  try {
    const session = await requireOrg();

    const ALLOWED_STATUSES = [
      "pre_hire", "onboarding_scheduled", "onboarding_in_progress",
      "active", "leave", "offboarding_in_progress", "offboarded",
    ];
    if (!ALLOWED_STATUSES.includes(newStatus)) {
      throw new HriqError("HRIQ-0205", `Invalid status: ${newStatus}. Allowed: ${ALLOWED_STATUSES.join(", ")}`);
    }

    const existing = await database.employee.findFirst({
      where: session.orgRole === "super_admin" ? { id } : { id, organizationId: session.orgId },
      select: { id: true, employmentStatus: true, timeDoctorEmail: true, recruitCrmSlug: true },
    });

    if (!existing) throw new HriqError("HRIQ-0201");

    const oldStatus = existing.employmentStatus;

    // Derive onboardingStatus from new employmentStatus to keep them in sync
    let derivedOnboardingStatus: string | undefined;
    if (newStatus === "active") {
      derivedOnboardingStatus = "completed";
    } else if (newStatus === "pre_hire") {
      derivedOnboardingStatus = "not_started";
    } else if (newStatus === "onboarding_in_progress" || newStatus === "onboarding_scheduled") {
      derivedOnboardingStatus = "in_progress";
    } else if (newStatus === "offboarding_in_progress" || newStatus === "offboarded") {
      derivedOnboardingStatus = "completed"; // preserve completed onboarding for offboarded employees
    }

    // When transitioning TO offboarding, initialize the offboarding step tracker
    let offboardingStepsJson: string | undefined;
    if (newStatus === "offboarding_in_progress" && oldStatus !== "offboarding_in_progress") {
      const { buildDefaultOffboardingSteps } = await import("./offboarding");
      offboardingStepsJson = JSON.stringify(await buildDefaultOffboardingSteps(existing.timeDoctorEmail, existing.recruitCrmSlug));
    }

    // When reverting to pre_hire, cancel any active onboarding sessions so the
    // employee can go through the onboarding flow again
    if (newStatus === "pre_hire") {
      // First, clean up associated Google Calendar events and Zoom meetings
      const activeSessions = await database.onboardingSession.findMany({
        where: { employeeId: id, status: { notIn: ["completed", "cancelled"] } },
        select: {
          id: true,
          googleCalendarEventId: true,
          zoomMeetingId: true,
          batchSession: {
            select: { id: true, calendarOrganizerEmail: true, zoomMeetingId: true },
          },
        },
      });

      // Delete calendar events (deduplicate)
      const calEventIds = new Set(
        activeSessions.map((s: any) => s.googleCalendarEventId).filter(Boolean)
      );
      if (calEventIds.size > 0) {
        try {
          const { GoogleCalendarService, isGoogleCalendarConfigured } = await import("@repo/integrations/google-calendar");
          if (isGoogleCalendarConfigured()) {
            for (const eventId of calEventIds) {
              const calOrg = activeSessions.find((s: any) => s.googleCalendarEventId === eventId)
                ?.batchSession?.calendarOrganizerEmail;
              try {
                await GoogleCalendarService.deleteEvent(eventId, calOrg || undefined);
              } catch {
                console.warn(`[ChangeStatus] Failed to delete calendar event ${eventId}`);
              }
            }
          }
        } catch (e) {
          console.error("[ChangeStatus] Calendar cleanup failed (non-blocking):", e);
        }
      }

      // Cancel the sessions
      await database.onboardingSession.updateMany({
        where: { employeeId: id, status: { notIn: ["completed", "cancelled"] } },
        data: { status: "cancelled", googleCalendarEventId: null },
      });
    }

    const employee = await database.employee.update({
      where: { id },
      data: {
        employmentStatus: newStatus,
        ...(derivedOnboardingStatus ? { onboardingStatus: derivedOnboardingStatus } : {}),
        ...(offboardingStepsJson ? { offboardingStatus: offboardingStepsJson } : {}),
        // Set endDate to today when starting offboarding (if not already set)
        ...(newStatus === "offboarding_in_progress" ? { endDate: new Date() } : {}),
        // Also set endDate when directly offboarding (skipping the offboarding pipeline)
        ...(newStatus === "offboarded" && oldStatus !== "offboarding_in_progress" ? { endDate: new Date(), offboardingStatus: "completed" } : {}),
        // Clear offboarding data when reverting to pre_hire
        ...(newStatus === "pre_hire" ? { offboardingStatus: "not_started", endDate: null } : {}),
      },
    });

    try {
      await database.auditLog.create({
        data: {
          organizationId: session.orgId,
          actorType: "user",
          actorUserId: session.userId,
          action: "employee.status_changed",
          objectType: "employee",
          objectId: id,
          oldValue: { status: oldStatus },
          newValue: { status: newStatus },
          reason,
        },
      });
    } catch (auditErr) {
      console.error("[HRIQ] Audit log write failed (non-blocking):", auditErr);
    }

    revalidatePath(`/[orgSlug]/employees/${id}`, "page");
    revalidatePath("/[orgSlug]/employees", "page");
    revalidatePath("/[orgSlug]", "page");
    if (newStatus === "offboarding_in_progress" || newStatus === "offboarded" || newStatus === "pre_hire") {
      revalidatePath("/[orgSlug]/hiring", "page");
    }

    return employee;

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[employees.ts:changeEmployeeStatus]", _msg);
    return { error: _msg };
  }
}

//  Hard Delete (Super Admin Only) 

/**
 * Permanently delete employees from the database.
 * Bypasses offboarding — cascades to all related records
 * (timesheets, onboarding sessions, pay run items, documents, etc.)
 * Super admin only.
 */
export async function hardDeleteEmployees(employeeIds: string[]) {
  try {
    const session = await requireOrg();
    if (session.orgRole !== "super_admin") {
      return { error: "Only super admins can permanently delete employees" };
    }

    if (!employeeIds.length) return { error: "No employees specified" };
    if (employeeIds.length > 50) return { error: "Cannot delete more than 50 at once" };

    // Super admin can delete any employee; others are scoped to their org
    const whereClause = session.orgRole === "super_admin"
      ? { id: { in: employeeIds } }
      : { id: { in: employeeIds }, organizationId: session.orgId };

    const employees = await database.employee.findMany({
      where: whereClause,
      select: { id: true, legalFirstName: true, legalLastName: true, personalEmail: true, workEmail: true, employeeNumber: true },
    });

    if (employees.length === 0) {
      return { error: "No matching employees found" };
    }

    // Collect linked user IDs BEFORE deleting (cascade will remove org members)
    const linkedUserIds = await database.organizationMember.findMany({
      where: {
        organizationId: { in: [...new Set(employees.map((e: any) => e.organizationId).filter(Boolean))] },
        userId: { not: session.userId },
      },
      select: { userId: true, organizationId: true },
    });

    // Delete found employees (cascade handles all related records)
    const result = await database.employee.deleteMany({
      where: { id: { in: employees.map((e) => e.id) } },
    });

    // Clean up auth accounts for deleted employees who have no other org memberships
    try {
      const { getSupabaseAdmin } = await import("./constants");
      const supabaseAdmin = getSupabaseAdmin();

      // Get linked user IDs from the deleted employees' email addresses
      const emailsToCheck = employees
        .flatMap((e) => [e.personalEmail, e.workEmail].filter((v): v is string => Boolean(v)));

      // Query auth.users directly — listUsers() only returns ~50 users and breaks at scale
      const authUsers = emailsToCheck.length > 0
        ? await database.$queryRawUnsafe<{ id: string; email: string }[]>(
            `SELECT id, LOWER(email) as email FROM auth.users WHERE LOWER(email) = ANY($1)`,
            emailsToCheck.map((e: string) => e.toLowerCase())
          )
        : [];
      const authUserByEmail = new Map(
        authUsers.map((u: { id: string; email: string }) => [u.email, u])
      );

      for (const email of emailsToCheck) {
        try {
          const authUser = authUserByEmail.get(email.toLowerCase());
          if (!authUser) continue;

          // Check if they still have any org membership
          const remainingMemberships = await database.organizationMember.count({
            where: { userId: authUser.id },
          });
          if (remainingMemberships === 0) {
            await database.appUser.deleteMany({ where: { supabaseUserId: authUser.id } }).catch(() => {});
            await supabaseAdmin.auth.admin.deleteUser(authUser.id);
          }
        } catch (e: unknown) {
          console.warn("[hardDeleteEmployees] Failed to clean auth user:", e);
        }
      }
    } catch (e: unknown) {
      console.warn("[hardDeleteEmployees] Auth cleanup failed:", e);
    }

    // Clean up pending_hires that referenced these employees
    try {
      const deletedIds = employees.map((e) => e.id);
      await database.$executeRaw`
        UPDATE pending_hires
        SET status = 'pending', "createdEmployeeId" = NULL
        WHERE "createdEmployeeId" = ANY(${deletedIds}::text[])
      `;
    } catch (e: unknown) {
      // Fallback: table might not exist or have different schema
      console.warn("[hardDeleteEmployees] Failed to clean up pending_hires:", e);
    }

    // Audit log
    try {
      await database.auditLog.create({
        data: {
          organizationId: session.orgId,
          actorType: "user",
          actorUserId: session.userId,
          action: "employee.hard_delete",
          objectType: "employee",
          objectId: employeeIds.join(","),
          oldValue: {
            deleted: employees.map((e) => ({
              id: e.id,
              name: `${e.legalFirstName} ${e.legalLastName ?? ""}`.trim(),
              email: getContractorEmail(e),
              number: e.employeeNumber,
            })),
          },
        },
      });
    } catch (auditErr) {
      console.error("[HRIQ] Audit log write failed (non-blocking):", auditErr);
    }

    revalidatePath("/[orgSlug]/employees", "page");
    revalidatePath("/[orgSlug]/hiring", "page");
    revalidatePath("/[orgSlug]", "page");

    return { deleted: result.count };
  } catch (err: any) {
    console.error("[hardDeleteEmployees] Error:", err);
    return { error: err.message || "Failed to delete employees" };
  }
}

// ── Bulk Provision Accounts ────────────────────────────────────────────────
// Creates Supabase auth accounts + sends welcome emails for active contractors
// who don't yet have a linked HRIQ login.

export async function bulkProvisionAccounts(employeeIds: string[]): Promise<{
  provisioned: { id: string; name: string; email: string }[];
  skipped: { id: string; name: string; reason: string }[];
  failed: { id: string; name: string; error: string }[];
}> {
  const session = await requireOrg();
  if (!["super_admin", "admin"].includes(session.orgRole ?? "")) {
    throw new HriqError("HRIQ-0105", "Only admins can provision contractor accounts");
  }

  const { getSupabaseAdmin, DEFAULT_PASSWORD } = await import("./constants");
  const supabaseAdmin = getSupabaseAdmin();

  const employees = await database.employee.findMany({
    where: {
      id: { in: employeeIds },
      employmentStatus: { in: ["active", "onboarding_in_progress", "pre_hire"] },
      ...(session.orgRole !== "super_admin" ? { organizationId: session.orgId } : {}),
    },
    select: {
      id: true,
      legalFirstName: true,
      legalLastName: true,
      workEmail: true,
      personalEmail: true,
      linkedUserId: true,
      organizationId: true,
      jobTitle: true,
      department: true,
    },
  });

  const provisioned: { id: string; name: string; email: string }[] = [];
  const skipped: { id: string; name: string; reason: string }[] = [];
  const failed: { id: string; name: string; error: string }[] = [];

  for (const emp of employees) {
    const name = `${emp.legalFirstName} ${emp.legalLastName}`;
    const email = getContractorEmail(emp)?.trim().toLowerCase();

    if (!email) {
      skipped.push({ id: emp.id, name, reason: "No email address on file" });
      continue;
    }

    if (emp.linkedUserId) {
      skipped.push({ id: emp.id, name, reason: "Already has an account" });
      continue;
    }

    if (!emp.organizationId) {
      skipped.push({ id: emp.id, name, reason: "No organization assigned" });
      continue;
    }

    try {
      // Check if Supabase auth account already exists
      const existingAppUser = await database.appUser.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
        select: { supabaseUserId: true },
      });

      let userId: string;
      if (existingAppUser) {
        userId = existingAppUser.supabaseUserId;
      } else {
        const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
          email,
          password: DEFAULT_PASSWORD,
          email_confirm: true,
          user_metadata: {
            name,
            activeOrganizationId: emp.organizationId,
            role: "contractor",
            isFirstLogin: true,
          },
        });
        if (createErr) throw new Error(createErr.message);
        if (!newUser?.user?.id) throw new Error("User created but no ID returned");
        userId = newUser.user.id;
      }

      // Upsert AppUser
      await database.appUser.upsert({
        where: { email },
        create: { supabaseUserId: userId, email, displayName: name },
        update: { displayName: name },
      });

      // Add org membership
      const alreadyMember = await database.organizationMember.findFirst({
        where: { userId, organizationId: emp.organizationId },
      });
      if (!alreadyMember) {
        await database.organizationMember.create({
          data: { userId, organizationId: emp.organizationId, role: "contractor" },
        });
      }

      // Add to approved_emails so they auto-link on login
      await database.approvedEmail.upsert({
        where: { email_organizationId: { email, organizationId: emp.organizationId } },
        create: { email, role: "contractor", organizationId: emp.organizationId, addedByUserId: session.userId },
        update: { role: "contractor" },
      });

      // Link employee record
      await database.employee.update({
        where: { id: emp.id },
        data: { linkedUserId: userId },
      });

      // Send onboarding welcome email
      try {
        const { sendOnboardingEmail } = await import("./send-email");
        await sendOnboardingEmail(email, emp.legalFirstName, {
          employeeId: emp.id,
          paymentSetupType: "none",
        });
      } catch (emailErr) {
        console.warn(`[BulkProvision] Welcome email failed for ${email}:`, emailErr);
        // Non-blocking — account created even if email fails
      }

      try {
        await database.auditLog.create({
          data: {
            organizationId: session.orgId,
            actorType: "user",
            actorUserId: session.userId,
            action: "employee.bulk_provisioned",
            objectType: "employee",
            objectId: emp.id,
            newValue: { email, userId, name },
          },
        });
      } catch (auditErr) {
        console.error("[HRIQ] Audit log write failed (non-blocking):", auditErr);
      }

      provisioned.push({ id: emp.id, name, email });
    } catch (err) {
      console.error(`[BulkProvision] Failed for ${name} (${email}):`, err);
      failed.push({ id: emp.id, name, error: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  revalidatePath("/[orgSlug]/employees", "page");
  return { provisioned, skipped, failed };
}

/**
 * Preview what will be deleted when employee(s) are removed.
 * Returns counts for confirmation dialog — no mutations.
 */
export async function previewDeleteEmployees(employeeIds: string[]) {
  try {
    const session = await requireOrg();
    if (session.orgRole !== "super_admin") return { error: "Only super admins can delete employees" };
    if (!employeeIds.length) return { error: "No employees specified" };

    const employees = await database.employee.findMany({
      where: { id: { in: employeeIds } },
      select: {
        id: true,
        legalFirstName: true,
        legalLastName: true,
        personalEmail: true,
        workEmail: true,
        linkedUserId: true,
        stripeAccountId: true,
        wiseRecipientId: true,
        organization: { select: { name: true } },
      },
    });

    if (employees.length === 0) return { error: "No matching employees found" };

    const ids = employees.map((e: any) => e.id);

    const [payments, timesheets, documents, onboardingSessions] = await Promise.all([
      database.payment.count({ where: { employeeId: { in: ids } } }),
      database.timesheetSubmission.count({ where: { employeeId: { in: ids } } }),
      database.document.count({ where: { employeeId: { in: ids } } }),
      database.onboardingSession.count({ where: { employeeId: { in: ids } } }),
    ]);

    // Check which have linked accounts that will be deleted
    let authAccountsDeleted = 0;
    for (const emp of employees) {
      if (!emp.linkedUserId) continue;
      const otherMemberships = await database.organizationMember.count({
        where: { userId: emp.linkedUserId },
      });
      // Only one membership = this one, will be deleted
      if (otherMemberships <= 1) authAccountsDeleted++;
    }

    const hasStripe = employees.filter((e: any) => e.stripeAccountId).length;
    const hasWise = employees.filter((e: any) => e.wiseRecipientId && e.wiseRecipientId !== -1).length;

    return {
      employees: employees.map((e: any) => ({
        name: `${e.legalFirstName} ${e.legalLastName ?? ""}`.trim(),
        email: getContractorEmail(e) ?? "no email",
        org: e.organization?.name ?? "Unassigned",
      })),
      payments,
      timesheets,
      documents,
      onboardingSessions,
      authAccountsDeleted,
      hasStripe,
      hasWise,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to preview";
    return { error: msg };
  }
}
