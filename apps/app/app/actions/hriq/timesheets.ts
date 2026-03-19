"use server";
import { getContractorEmail } from "@/lib/hriq/utils";

import { requireOrg, requireSession, requireRole } from "@repo/auth/session";
import { database } from "@repo/database";
import { Prisma } from "@repo/database";
import { revalidatePath } from "next/cache";
import { HriqError } from "@/lib/hriq/errors";
import { RL_ORG_ID, withTimeout } from "./constants";
import { serialize } from "@/lib/hriq/serialize";

//  Period Sync Helper 

/**
 * When RL creates/updates a period, replicate it to all client orgs.
 * Uses upsert-like logic: finds matching period by date range, or creates new.
 */
async function syncPeriodToClientOrgs(period: {
  name: string;
  startDate: Date;
  endDate: Date;
  status: string;
}) {
  const clientOrgs = await database.organization.findMany({
    where: { id: { not: RL_ORG_ID } },
    select: { id: true },
  });

  for (const org of clientOrgs) {
    const existing = await database.timesheetPeriod.findFirst({
      where: {
        organizationId: org.id,
        startDate: period.startDate,
        endDate: period.endDate,
      },
    });

    if (existing) {
      // Sync status and name
      if (existing.status !== period.status || existing.name !== period.name) {
        await database.timesheetPeriod.update({
          where: { id: existing.id },
          data: { status: period.status, name: period.name },
        });
      }
    } else {
      await database.timesheetPeriod.create({
        data: {
          organizationId: org.id,
          name: period.name,
          startDate: period.startDate,
          endDate: period.endDate,
          status: period.status,
        },
      });
    }
  }
}

/**
 * Delete matching periods from all client orgs (by date range).
 * Only deletes periods with no submissions.
 */
async function deletePeriodFromClientOrgs(startDate: Date, endDate: Date) {
  const clientOrgs = await database.organization.findMany({
    where: { id: { not: RL_ORG_ID } },
    select: { id: true },
  });

  for (const org of clientOrgs) {
    const match = await database.timesheetPeriod.findFirst({
      where: {
        organizationId: org.id,
        startDate,
        endDate,
      },
      include: { _count: { select: { submissions: true } } },
    });

    if (match && match._count.submissions === 0) {
      await database.timesheetPeriod.delete({ where: { id: match.id } });
    }
    // If it has submissions, leave it — don't destroy client data
  }
}

//  Timesheet Periods 

export async function getTimesheetPeriods() {
  const session = await requireOrg();

  return database.timesheetPeriod.findMany({
    where: { organizationId: session.orgId },
    include: { _count: { select: { submissions: true } } },
    orderBy: { startDate: "desc" },
  });
}

export async function createTimesheetPeriod(data: {
  name: string;
  startDate: string;
  endDate: string;
}) {
  try {
  const session = await requireOrg();
  // Only admins and super_admins can create periods
  if (!["super_admin", "admin"].includes(session.orgRole)) {
    throw new HriqError("HRIQ-0105", "Only admins can create timesheet periods");
  }

  const startDate = new Date(data.startDate as any);
  const endDate = new Date(data.endDate as any);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new HriqError("HRIQ-1006");
  }
  if (endDate < startDate) {
    throw new HriqError("HRIQ-1304");
  }

  // Prevent overlapping periods within the same org
  const overlap = await database.timesheetPeriod.findFirst({
    where: {
      organizationId: session.orgId,
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
    select: { name: true },
  });
  if (overlap) {
    throw new HriqError("HRIQ-1007", `Overlaps with existing period: ${overlap.name}`);
  }

  const period = await database.timesheetPeriod.create({
    data: {
      organizationId: session.orgId,
      name: data.name,
      startDate,
      endDate,
    },
  });

  // External orgs have their own staggered pay schedule (21st-5th, 6th-20th)
  // and must NOT receive RL's internal periods (26th-10th, 11th-25th).
  // Period sync is intentionally disabled.

  revalidatePath("/[orgSlug]/timesheets", "page");
  revalidatePath("/[orgSlug]/payroll", "page");
  revalidatePath("/[orgSlug]/payroll/external", "page");

  return period;

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[timesheets.ts:createTimesheetPeriod]", _msg);
    return { error: _msg };
  }
}

export async function lockTimesheetPeriod(periodId: string) {
  try {
    const session = await requireOrg();
    if (!["super_admin", "admin"].includes(session.orgRole)) {
      throw new HriqError("HRIQ-0105", "Only admins can lock timesheet periods");
    }
    const period = await database.timesheetPeriod.findFirst({
      where: { id: periodId, organizationId: session.orgId },
      select: { id: true, name: true, startDate: true, endDate: true },
    });
    if (!period) throw new HriqError("HRIQ-0901");

    // Auto-submit all drafts before locking so no work is lost
    const autoApproveAt = new Date();
    let daysAdded = 0;
    while (daysAdded < 2) {
      autoApproveAt.setDate(autoApproveAt.getDate() + 1);
      const day = autoApproveAt.getDay();
      if (day !== 0 && day !== 6) daysAdded++;
    }
    const draftsSubmitted = await database.timesheetSubmission.updateMany({
      where: { periodId, status: "draft" },
      data: { status: "submitted", submittedAt: new Date(), autoApproveAt },
    });

    const locked = await database.timesheetPeriod.update({
      where: { id: periodId },
      data: { status: "locked" },
    });

    revalidatePath("/[orgSlug]/timesheets", "page");
    revalidatePath("/[orgSlug]/payroll", "page");
    revalidatePath("/[orgSlug]/payroll/external", "page");

    return { ...locked, draftsSubmitted: draftsSubmitted.count };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[timesheets.ts:lockTimesheetPeriod]", _msg);
    return { error: _msg };
  }
}

export async function unlockTimesheetPeriod(periodId: string) {
  try {
    const session = await requireOrg();
    if (!["super_admin", "admin"].includes(session.orgRole)) {
      throw new HriqError("HRIQ-0105", "Only admins can unlock timesheet periods");
    }
    const period = await database.timesheetPeriod.findFirst({
      where: { id: periodId, organizationId: session.orgId },
      select: { id: true, name: true, startDate: true, endDate: true, status: true },
    });
    if (!period) throw new HriqError("HRIQ-0901");
    if (period.status !== "locked") throw new HriqError("HRIQ-1003", "Period is not locked");

    const unlocked = await database.timesheetPeriod.update({
      where: { id: periodId },
      data: { status: "open" },
    });

    revalidatePath("/[orgSlug]/timesheets", "page");
    revalidatePath("/[orgSlug]/payroll", "page");
    revalidatePath("/[orgSlug]/payroll/external", "page");

    return unlocked;

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[timesheets.ts:unlockTimesheetPeriod]", _msg);
    return { error: _msg };
  }
}

/** Revert an approved timesheet back to submitted so it can be re-reviewed */
export async function unapproveTimesheet(submissionId: string) {
  try {
    const session = await requireOrg();
    if (!["super_admin", "admin"].includes(session.orgRole)) {
      throw new HriqError("HRIQ-0105", "Only admins can un-approve timesheets");
    }

    const submission = await database.timesheetSubmission.findFirst({
      where: { id: submissionId, employee: { organizationId: session.orgId } },
      select: {
        id: true,
        status: true,
        employeeId: true,
        employee: { select: { legalFirstName: true, legalLastName: true } },
        period: { select: { startDate: true, endDate: true } },
      },
    });
    if (!submission) throw new HriqError("HRIQ-0602", "Submission not found");
    if (!["approved", "auto_approved"].includes(submission.status)) {
      throw new HriqError("HRIQ-1003", `Cannot un-approve a timesheet with status: ${submission.status}`);
    }

    // Block unapproval if this timesheet is already inside a pay run (paid or pending)
    const existingPayRunItem = await database.payRunItem.findFirst({
      where: { timesheetSubmissionId: submissionId },
      select: {
        id: true,
        paymentId: true,
        payRun: { select: { id: true, name: true, status: true } },
      },
    });
    if (existingPayRunItem) {
      const runStatus = existingPayRunItem.payRun.status;
      if (existingPayRunItem.paymentId || runStatus === "completed") {
        throw new HriqError(
          "HRIQ-1008",
          `Cannot un-approve: this timesheet has already been paid (pay run "${existingPayRunItem.payRun.name}"). Reverse the payment first.`
        );
      }
      throw new HriqError(
        "HRIQ-1008",
        `Cannot un-approve: this timesheet is already included in pay run "${existingPayRunItem.payRun.name}" (status: ${runStatus}). Remove it from the pay run first.`
      );
    }

    // Check the direct Payment record (non-pay-run flow)
    // Block unapproval if any non-voided payment exists — completed means paid, pending means queued
    const directPayment = await database.payment.findFirst({
      where: {
        employeeId: submission.employeeId,
        periodStart: submission.period.startDate,
        periodEnd: submission.period.endDate,
        status: { notIn: ["voided"] },
      },
      select: { id: true, status: true },
    });
    if (directPayment) {
      const msg = directPayment.status === "completed"
        ? "Cannot un-approve: this timesheet has already been paid. Reverse the payment first."
        : "Cannot un-approve: a payment is already queued for this timesheet. Cancel it first.";
      throw new HriqError("HRIQ-1008", msg);
    }

    // Atomically revert timesheet status
    const claimed = await database.timesheetSubmission.updateMany({
      where: { id: submissionId, status: { in: ["approved", "auto_approved"] }, employee: { organizationId: session.orgId } },
      data: { status: "submitted", approvedAt: null, approvedByUserId: null, approvedByName: null },
    });
    if (claimed.count === 0) throw new HriqError("HRIQ-1003", "Submission was already modified");

    revalidatePath("/[orgSlug]/timesheets", "page");
    revalidatePath("/[orgSlug]/payroll", "page");

    return { unapproved: true, name: `${submission.employee.legalFirstName} ${submission.employee.legalLastName}` };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[timesheets.ts:unapproveTimesheet]", _msg);
    return { error: _msg };
  }
}

/** Force-submit a single draft timesheet on behalf of a contractor (admin only) */
export async function forceSubmitDraft(submissionId: string) {
  try {
    const session = await requireOrg();
    if (!["super_admin", "admin"].includes(session.orgRole)) {
      throw new HriqError("HRIQ-0105", "Only admins can force-submit timesheets");
    }

    const submission = await database.timesheetSubmission.findFirst({
      where: { id: submissionId, employee: { organizationId: session.orgId } },
      select: { id: true, status: true, employee: { select: { legalFirstName: true, legalLastName: true } } },
    });
    if (!submission) throw new HriqError("HRIQ-0602", "Submission not found");
    if (submission.status !== "draft") throw new HriqError("HRIQ-1003", `Cannot force-submit a timesheet with status: ${submission.status}`);

    const autoApproveAt = new Date();
    let daysAdded = 0;
    while (daysAdded < 2) {
      autoApproveAt.setDate(autoApproveAt.getDate() + 1);
      const day = autoApproveAt.getDay();
      if (day !== 0 && day !== 6) daysAdded++;
    }

    const claimed = await database.timesheetSubmission.updateMany({
      where: { id: submissionId, status: "draft", employee: { organizationId: session.orgId } },
      data: { status: "submitted", submittedAt: new Date(), autoApproveAt },
    });
    if (claimed.count === 0) throw new HriqError("HRIQ-1003", "Submission was already modified");

    revalidatePath("/[orgSlug]/timesheets", "page");
    revalidatePath("/[orgSlug]/payroll", "page");

    return { submitted: true, name: `${submission.employee.legalFirstName} ${submission.employee.legalLastName}` };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[timesheets.ts:forceSubmitDraft]", _msg);
    return { error: _msg };
  }
}

export async function deleteTimesheetPeriod(periodId: string) {
  try {
    const session = await requireOrg();
    if (!["super_admin", "admin"].includes(session.orgRole)) {
      throw new HriqError("HRIQ-0105", "Only admins can delete timesheet periods");
    }

    const period = await database.timesheetPeriod.findFirst({
      where: { id: periodId, organizationId: session.orgId },
      include: { submissions: { select: { id: true, employeeId: true } } },
    });
    if (!period) throw new HriqError("HRIQ-0901");

    // Delete submissions, orphan payments, then the period — in a transaction
    await database.$transaction(async (tx: any) => {
      // Get employee IDs from this period's submissions to scope payment cleanup
      const employeeIds = [...new Set(period.submissions.map(s => s.employeeId))];

      if (period.submissions.length > 0) {
        await tx.timesheetSubmission.deleteMany({
          where: { periodId },
        });
      }
      // Clean up only payments that belong to employees from THIS period's submissions
      // (prevents accidental deletion of payments from overlapping periods)
      // Only delete pending/processing payments — completed payments must be preserved
      if (employeeIds.length > 0) {
        await tx.payment.deleteMany({
          where: {
            employeeId: { in: employeeIds },
            periodStart: period.startDate,
            periodEnd: period.endDate,
            status: { in: ["pending", "processing"] },
          },
        });
      }
      await tx.timesheetPeriod.delete({ where: { id: periodId } });

      // Audit log inside transaction — ensures record of deletion is atomic
      try {
        await tx.auditLog.create({
          data: {
            organizationId: session.orgId,
            actorType: "user",
            actorUserId: session.userId,
            action: "timesheet_period.deleted",
            objectType: "timesheet_period",
            objectId: periodId,
            oldValue: {
              name: period.name,
              startDate: period.startDate.toISOString(),
              endDate: period.endDate.toISOString(),
              submissionCount: period.submissions.length,
            },
          },
        });
      } catch (auditErr) {
        console.error("[HRIQ] Audit log write failed (non-blocking):", auditErr);
      }
    });

    // When RL deletes a period, cascade the deletion to empty client org copies
    if (session.orgId === RL_ORG_ID) {
      deletePeriodFromClientOrgs(period.startDate, period.endDate).catch((err) =>
        console.error("[Timesheets] deletePeriodFromClientOrgs failed:", err)
      );
    }

    revalidatePath("/[orgSlug]/timesheets", "page");
    revalidatePath("/[orgSlug]/payroll", "page");
    revalidatePath("/[orgSlug]/payroll/external", "page");

    return { deleted: true, name: period.name };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[timesheets.ts:deleteTimesheetPeriod]", _msg);
    return { error: _msg };
  }
}

//  Timesheet Submissions (VA) 

export async function getMyTimesheets() {
  const session = await requireSession();

  // Resolve the active org to scope timesheets correctly
  const orgId = session.orgId;

  const employee = await database.employee.findFirst({
    where: {
      linkedUserId: session.userId,
      ...(orgId ? { organizationId: orgId } : {}),
    },
    select: { id: true },
  });
  if (!employee) return [];

  return database.timesheetSubmission.findMany({
    where: { employeeId: employee.id },
    include: { period: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function submitTimesheet(data: {
  periodId: string;
  dailyEntries: Array<{ date: string; timeIn?: string; timeOut?: string; hours: number; note?: string; tdHours?: number }>;
  notes?: string;
  bonuses?: Array<{ description: string; amount: number }>;
}) {
  try {
  const session = await requireSession();

  // Scope employee lookup to active org to prevent cross-org mismatch
  const employee = await database.employee.findFirst({
    where: {
      linkedUserId: session.userId,
      ...(session.orgId ? { organizationId: session.orgId } : {}),
    },
    select: { id: true, organizationId: true },
  });
  if (!employee) throw new HriqError("HRIQ-2501", "No linked employee record in this organization");
  if (!employee.organizationId) throw new HriqError("HRIQ-0901", "Employee has no organization assigned");

  // Validate period exists AND belongs to the employee's org (prevent cross-org submissions)
  const period = await database.timesheetPeriod.findFirst({
    where: { id: data.periodId, organizationId: employee.organizationId },
    select: { status: true, startDate: true, endDate: true },
  });
  if (!period) throw new HriqError("HRIQ-0901", "Pay period not found");
  if (period.status === "locked") throw new HriqError("HRIQ-1003", "This pay period is locked and no longer accepts submissions");
  if (period.status === "closed") throw new HriqError("HRIQ-1003", "This pay period is closed and no longer accepts submissions");

  // Submission window: deadline is 11:59 PM PST on the period end date
  // "today" uses PST so the cutoff matches 11:59 PM PST, not UTC midnight
  // endDate uses toISOString() because it's a calendar date stored at midnight UTC (not a moment in time)
  const todayPST = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }); // YYYY-MM-DD
  const endDate = period.endDate.toISOString().split("T")[0]; // raw calendar date, e.g. "2026-03-10"
  if (todayPST > endDate) {
    throw new HriqError("HRIQ-1003", "Submission deadline has passed. Timesheets must be submitted by 11:59 PM PST on the last day of the pay period.");
  }

  // Prevent overwriting already-approved timesheets (rejected = allowed to resubmit)
  const existingSub = await database.timesheetSubmission.findUnique({
    where: { employeeId_periodId: { employeeId: employee.id, periodId: data.periodId } },
    select: { status: true },
  });
  if (existingSub && ["approved", "auto_approved"].includes(existingSub.status)) {
    throw new HriqError("HRIQ-1003", "This timesheet has already been approved and cannot be modified");
  }

  // Validate daily entries — preserve minutes from TD sync for accurate totals
  const cleanEntries = (data.dailyEntries ?? []).map((e) => {
    const hours = Number(e.hours);
    if (!Number.isFinite(hours) || hours < 0 || hours > 24) {
      throw new HriqError("HRIQ-1005");
    }
    const minutes = (e as any).minutes != null ? Number((e as any).minutes) : undefined;
    const tdHours = (e as any).tdHours != null ? Number((e as any).tdHours) : undefined;
    return {
      date: e.date,
      timeIn: e.timeIn || null,
      timeOut: e.timeOut || null,
      hours: minutes != null ? Math.round((minutes / 60) * 1e6) / 1e6 : hours, // clean decimal from minutes
      ...(minutes != null ? { minutes } : {}),
      ...(tdHours != null ? { tdHours } : {}),
      note: e.note ? String(e.note).slice(0, 500).trim() || null : null,
    };
  });

  // Validate: entries with tdHours that differ from submitted hours must have a note
  const modifiedWithoutNote = cleanEntries.filter((e: any) =>
    e.tdHours != null && Math.round(e.hours * 60) !== Math.round(e.tdHours * 60) && !e.note
  );
  if (modifiedWithoutNote.length > 0) {
    throw new HriqError("HRIQ-1005", `${modifiedWithoutNote.length} day(s) have hours changed from Time Doctor without an explanation note. Please add notes for edited days.`);
  }

  // Compute totalHours from minutes sum when available (integer arithmetic avoids float drift)
  const hasMinutes = cleanEntries.some((e: any) => e.minutes != null);
  const totalHours = hasMinutes
    ? Math.round((cleanEntries.reduce((sum, e: any) => sum + (e.minutes ?? Math.round(e.hours * 60)), 0) / 60) * 1e6) / 1e6
    : cleanEntries.reduce((sum, e) => sum + e.hours, 0);

  // Compute legacy day-of-week totals for backward compat
  const dayOfWeekNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
  const dayTotals: Record<string, number> = { monday: 0, tuesday: 0, wednesday: 0, thursday: 0, friday: 0, saturday: 0, sunday: 0 };
  const dayStarts: Record<string, string | null> = { monday: null, tuesday: null, wednesday: null, thursday: null, friday: null, saturday: null, sunday: null };

  for (const entry of cleanEntries) {
    if (entry.hours <= 0) continue;
    const d = new Date(entry.date + "T12:00:00Z"); // noon UTC to avoid timezone issues
    const dayName = dayOfWeekNames[d.getUTCDay()];
    dayTotals[dayName] += entry.hours;
    if (!dayStarts[dayName] && entry.timeIn) dayStarts[dayName] = entry.timeIn;
  }

  // Validate and sanitize bonuses
  const cleanBonuses = (data.bonuses ?? [])
    .filter((b: any) => b && typeof b.description === "string" && b.description.trim().length > 0 && Number.isFinite(b.amount) && b.amount > 0)
    .map((b: any) => ({ description: b.description.trim().slice(0, 200), amount: Math.round(b.amount * 100) / 100 }));
  const bonusTotal = cleanBonuses.reduce((sum: number, b: any) => sum + b.amount, 0);

  // Auto-approve date: 2 business days from now
  const autoApproveAt = new Date();
  let daysAdded = 0;
  while (daysAdded < 2) {
    autoApproveAt.setDate(autoApproveAt.getDate() + 1);
    const day = autoApproveAt.getDay();
    if (day !== 0 && day !== 6) daysAdded++; // Skip weekends
  }

  const result = await database.timesheetSubmission.upsert({
    where: {
      employeeId_periodId: {
        employeeId: employee.id,
        periodId: data.periodId,
      },
    },
    create: {
      employeeId: employee.id,
      periodId: data.periodId,
      dailyEntries: cleanEntries,
      mondayHours: new Prisma.Decimal(dayTotals.monday),
      tuesdayHours: new Prisma.Decimal(dayTotals.tuesday),
      wednesdayHours: new Prisma.Decimal(dayTotals.wednesday),
      thursdayHours: new Prisma.Decimal(dayTotals.thursday),
      fridayHours: new Prisma.Decimal(dayTotals.friday),
      saturdayHours: new Prisma.Decimal(dayTotals.saturday),
      sundayHours: new Prisma.Decimal(dayTotals.sunday),
      totalHours: new Prisma.Decimal(totalHours),
      mondayStart: dayStarts.monday,
      tuesdayStart: dayStarts.tuesday,
      wednesdayStart: dayStarts.wednesday,
      thursdayStart: dayStarts.thursday,
      fridayStart: dayStarts.friday,
      saturdayStart: dayStarts.saturday,
      sundayStart: dayStarts.sunday,
      bonuses: cleanBonuses.length > 0 ? cleanBonuses : Prisma.JsonNull,
      bonusTotal: new Prisma.Decimal(bonusTotal),
      notes: data.notes,
      status: "submitted",
      submittedAt: new Date(),
      autoApproveAt,
    },
    update: {
      dailyEntries: cleanEntries,
      mondayHours: new Prisma.Decimal(dayTotals.monday),
      tuesdayHours: new Prisma.Decimal(dayTotals.tuesday),
      wednesdayHours: new Prisma.Decimal(dayTotals.wednesday),
      thursdayHours: new Prisma.Decimal(dayTotals.thursday),
      fridayHours: new Prisma.Decimal(dayTotals.friday),
      saturdayHours: new Prisma.Decimal(dayTotals.saturday),
      sundayHours: new Prisma.Decimal(dayTotals.sunday),
      totalHours: new Prisma.Decimal(totalHours),
      mondayStart: dayStarts.monday,
      tuesdayStart: dayStarts.tuesday,
      wednesdayStart: dayStarts.wednesday,
      thursdayStart: dayStarts.thursday,
      fridayStart: dayStarts.friday,
      saturdayStart: dayStarts.saturday,
      sundayStart: dayStarts.sunday,
      bonuses: cleanBonuses.length > 0 ? cleanBonuses : Prisma.JsonNull,
      bonusTotal: new Prisma.Decimal(bonusTotal),
      notes: data.notes,
      status: "submitted",
      submittedAt: new Date(),
      autoApproveAt,
    },
  });

  revalidatePath("/[orgSlug]/timesheets", "page");

  return result;

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[timesheets.ts:submitTimesheet]", _msg);
    return { error: _msg };
  }
}

export async function getAllSubmissions() {
  const session = await requireOrg();

  return database.timesheetSubmission.findMany({
    where: {
      employee: { organizationId: session.orgId },
    },
    include: {
      employee: { select: { id: true, legalFirstName: true, legalLastName: true, employeeNumber: true, hourlyRate: true, currency: true, photoUrl: true, department: true, preferredPaymentMethod: true } },
      period: true,
    },
    orderBy: [{ period: { startDate: "desc" } }, { submittedAt: "asc" }],
  });
}

//  Auto-generate payment on approval 

async function createPaymentForApprovedSubmission(
  submission: {
    employeeId: string;
    totalHours: any;
    bonusTotal: any;
    employee: { hourlyRate: any; currency: string; legalFirstName: string; legalLastName: string };
    period: { name: string; startDate: Date; endDate: Date };
  },
  session: { userId: string; orgId: string; name?: string | null },
) {
  const hours = Number(submission.totalHours);
  const rate = submission.employee.hourlyRate ? Number(submission.employee.hourlyRate) : 0;
  const bonusAmt = Number(submission.bonusTotal ?? 0);
  const amount = Math.round((hours * rate + bonusAmt) * 100) / 100;

  // Always create the payment record so it appears in the queue
  // Admin can edit the amount later if hourly rate wasn't set

  // Use a transaction with a unique check to prevent duplicate payments from concurrent approvals
  try {
    await database.$transaction(async (tx: any) => {
      const existing = await tx.payment.findFirst({
        where: {
          employeeId: submission.employeeId,
          periodStart: submission.period.startDate,
          periodEnd: submission.period.endDate,
          status: { not: "voided" },
        },
        select: { id: true },
      });
      if (existing) return; // already generated (pending or completed — don't double-pay

      await tx.payment.create({
        data: {
          employeeId: submission.employeeId,
          paymentType: "salary",
          amount: String(amount),
          currency: submission.employee.currency ?? "USD",
          periodStart: submission.period.startDate,
          periodEnd: submission.period.endDate,
          hoursWorked: String(hours),
          hourlyRate: String(rate),
          description: rate > 0
            ? `${submission.period.name} — ${hours}h @ $${rate}/hr${bonusAmt > 0 ? ` + $${bonusAmt} bonus` : ""}`
            : `${submission.period.name} — ${hours}h (no rate set)`,
          status: "pending",
          processedByUserId: session.userId,
          processedByName: session.name ?? undefined,
        },
      });
    });
  } catch (err) {
    // If a duplicate key error occurs, another concurrent approval already created the payment
    if (err instanceof Error && err.message.includes("Unique constraint")) return;
    throw err;
  }
}

export async function approveTimesheet(submissionId: string) {
  try {
    const session = await requireOrg();
    if (!["super_admin", "admin"].includes(session.orgRole)) {
      throw new HriqError("HRIQ-0105", "Only admins can approve timesheets");
    }

    const submission = await database.timesheetSubmission.findFirst({
      where: { id: submissionId, employee: { organizationId: session.orgId } },
      select: { id: true, status: true },
    });
    if (!submission) throw new HriqError("HRIQ-0602");
    if (submission.status !== "submitted") throw new HriqError("HRIQ-1003", `Cannot approve timesheet with status: ${submission.status}`);

    // Atomic status transition to prevent double-approval
    const claimed = await database.timesheetSubmission.updateMany({
      where: { id: submissionId, status: "submitted", employee: { organizationId: session.orgId } },
      data: { status: "approved", approvedAt: new Date(), approvedByUserId: session.userId, approvedByName: session.name ?? undefined },
    });
    if (claimed.count === 0) throw new HriqError("HRIQ-1003", "Timesheet was already approved or modified");

    const updated = await database.timesheetSubmission.findUnique({
      where: { id: submissionId },
      include: { period: true, employee: { select: { linkedUserId: true, legalFirstName: true, legalLastName: true, preferredName: true, personalEmail: true, workEmail: true, hourlyRate: true, currency: true, organizationId: true } } },
    });
    if (!updated) throw new HriqError("HRIQ-0602");

    // Non-blocking notification
    const basePay = updated.employee.hourlyRate ? Number(updated.totalHours) * Number(updated.employee.hourlyRate) : undefined;
    const bonusAmt = Number(updated.bonusTotal ?? 0);
    const totalPay = basePay !== undefined ? basePay + bonusAmt : bonusAmt > 0 ? bonusAmt : undefined;
    notifyContractorTimesheetStatus(updated.employee, updated.period.name, "approved", Number(updated.totalHours), totalPay, updated.employee.currency, undefined, bonusAmt > 0 ? bonusAmt : undefined).catch(() => {});

    // Auto-generate payment record
    try {
      await createPaymentForApprovedSubmission(updated, session);
    } catch (err) {
      console.error("[Payroll] Auto-payment failed for submission", submissionId, err);
    }

    // Indirect pay: auto-generate client invoice and email the client
    const empOrgId = updated.employee.organizationId;
    if (empOrgId && empOrgId !== RL_ORG_ID) {
      try {
        await checkAndTriggerIndirectPayInvoice(empOrgId, updated.periodId);
      } catch (err) {
        console.error("[Indirect Pay] Auto-invoice trigger failed for org", empOrgId, err);
      }
    }

    revalidatePath("/[orgSlug]/timesheets", "page");
    revalidatePath("/[orgSlug]/payroll", "page");
    revalidatePath("/[orgSlug]/payments", "page");

    return updated;

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[timesheets.ts:approveTimesheet]", _msg);
    return { error: _msg };
  }
}

export async function batchApproveTimesheets(submissionIds: string[]) {
  try {
    const session = await requireOrg();
    if (!["super_admin", "admin"].includes(session.orgRole)) {
      throw new HriqError("HRIQ-0105", "Only admins can approve timesheets");
    }
    if (submissionIds.length === 0) throw new HriqError("HRIQ-9903", "No submissions to approve");

    const valid = await database.timesheetSubmission.findMany({
      where: {
        id: { in: submissionIds },
        status: "submitted",
        employee: { organizationId: session.orgId },
      },
      select: { id: true },
    });

    const validIds = valid.map((v: { id: string }) => v.id);
    if (validIds.length === 0) throw new HriqError("HRIQ-9903", "No valid submissions to approve");

    await database.timesheetSubmission.updateMany({
      where: { id: { in: validIds }, status: "submitted" },
      data: {
        status: "approved",
        approvedAt: new Date(),
        approvedByUserId: session.userId,
        approvedByName: session.name ?? undefined,
      },
    });

    // Notify each contractor (non-blocking) + auto-generate payments (awaited)
    const approvedSubs = await database.timesheetSubmission.findMany({
      where: { id: { in: validIds } },
      include: { period: true, employee: { select: { legalFirstName: true, legalLastName: true, preferredName: true, personalEmail: true, workEmail: true, hourlyRate: true, currency: true, organizationId: true } } },
    });

    // Fire-and-forget notifications, await payment creation
    const paymentPromises: Promise<void>[] = [];
    for (const sub of approvedSubs) {
      const basePay = sub.employee.hourlyRate ? Number(sub.totalHours) * Number(sub.employee.hourlyRate) : undefined;
      const bonusAmt = Number(sub.bonusTotal ?? 0);
      const totalPay = basePay !== undefined ? basePay + bonusAmt : bonusAmt > 0 ? bonusAmt : undefined;
      notifyContractorTimesheetStatus(sub.employee, sub.period.name, "approved", Number(sub.totalHours), totalPay, sub.employee.currency, undefined, bonusAmt > 0 ? bonusAmt : undefined).catch(() => {});
      paymentPromises.push(createPaymentForApprovedSubmission(sub, session));
    }
    const paymentResults = await Promise.allSettled(paymentPromises);
    const paymentFailures = paymentResults.filter((r) => r.status === "rejected");
    if (paymentFailures.length > 0) {
      console.error(`[Payroll] ${paymentFailures.length}/${paymentResults.length} payment creations failed in batch approve:`,
        paymentFailures.map((r) => { const rej = r as { status: string; reason?: { message?: string } }; return rej.reason?.message ?? String(rej.reason); }));
    }

    // Indirect pay: deduplicate by orgId+periodId and trigger one invoice per org
    const indirectOrgs = new Map<string, string>(); // orgId → periodId
    for (const sub of approvedSubs) {
      const orgId = sub.employee.organizationId;
      if (orgId && orgId !== RL_ORG_ID) {
        indirectOrgs.set(`${orgId}:${sub.periodId}`, orgId);
        // Store periodId keyed by orgId+periodId
      }
    }
    // Build unique (orgId, periodId) pairs
    const indirectPairs: { orgId: string; periodId: string }[] = [];
    for (const sub of approvedSubs) {
      const orgId = sub.employee.organizationId;
      if (!orgId || orgId === RL_ORG_ID) continue;
      const key = `${orgId}:${sub.periodId}`;
      if (!indirectOrgs.has(key)) continue;
      indirectPairs.push({ orgId, periodId: sub.periodId });
      indirectOrgs.delete(key); // deduplicate
    }
    for (const { orgId, periodId } of indirectPairs) {
      try {
        await checkAndTriggerIndirectPayInvoice(orgId, periodId);
      } catch (err) {
        console.error("[Indirect Pay] Batch auto-invoice trigger failed for org", orgId, err);
      }
    }

    revalidatePath("/[orgSlug]/timesheets", "page");
    revalidatePath("/[orgSlug]/payroll", "page");
    revalidatePath("/[orgSlug]/payments", "page");

    return { approved: validIds.length, paymentFailures: paymentFailures.length };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[timesheets.ts:batchApproveTimesheets]", _msg);
    return { error: _msg };
  }
}

export async function rejectTimesheet(submissionId: string, reason: string) {
  try {
    const session = await requireOrg();
    if (!["super_admin", "admin"].includes(session.orgRole)) {
      throw new HriqError("HRIQ-0105", "Only admins can reject timesheets");
    }

    const submission = await database.timesheetSubmission.findFirst({
      where: { id: submissionId, employee: { organizationId: session.orgId } },
      select: { id: true, status: true },
    });
    if (!submission) throw new HriqError("HRIQ-0602");
    if (submission.status !== "submitted") throw new HriqError("HRIQ-1004", `Cannot reject timesheet with status: ${submission.status}`);

    // Atomic status transition to prevent rejecting an already-approved timesheet
    const claimed = await database.timesheetSubmission.updateMany({
      where: { id: submissionId, status: "submitted", employee: { organizationId: session.orgId } },
      data: { status: "rejected", rejectedAt: new Date(), rejectionReason: reason },
    });
    if (claimed.count === 0) throw new HriqError("HRIQ-1004", "Timesheet was already approved, rejected, or modified");

    const rejected = await database.timesheetSubmission.findUnique({
      where: { id: submissionId },
      include: { period: true, employee: { select: { legalFirstName: true, preferredName: true, personalEmail: true, workEmail: true, hourlyRate: true, currency: true } } },
    });
    if (!rejected) throw new HriqError("HRIQ-0602");

    notifyContractorTimesheetStatus(rejected.employee, rejected.period.name, "rejected", Number(rejected.totalHours), undefined, undefined, reason).catch(() => {});

    revalidatePath("/[orgSlug]/timesheets", "page");

    return rejected;

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[timesheets.ts:rejectTimesheet]", _msg);
    return { error: _msg };
  }
}

/**
 * Unreject a timesheet — moves it back to "submitted" so it can be reviewed again.
 * Only works on timesheets with status "rejected".
 */
export async function unrejectTimesheet(submissionId: string) {
  try {
    const session = await requireOrg();
    if (!["super_admin", "admin"].includes(session.orgRole)) {
      throw new HriqError("HRIQ-0105", "Only admins can unreject timesheets");
    }

    const submission = await database.timesheetSubmission.findFirst({
      where: { id: submissionId, employee: { organizationId: session.orgId } },
      select: { id: true, status: true },
    });
    if (!submission) throw new HriqError("HRIQ-0602");
    if (submission.status !== "rejected") throw new HriqError("HRIQ-1004", `Cannot unreject timesheet with status: ${submission.status}`);

    const claimed = await database.timesheetSubmission.updateMany({
      where: { id: submissionId, status: "rejected", employee: { organizationId: session.orgId } },
      data: { status: "submitted", rejectedAt: null, rejectionReason: null },
    });
    if (claimed.count === 0) throw new HriqError("HRIQ-1004", "Timesheet status changed before unreject could complete");

    revalidatePath("/[orgSlug]/timesheets", "page");

    return { ok: true };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[timesheets.ts:unrejectTimesheet]", _msg);
    return { error: _msg };
  }
}

/**
 * Admin action: move a submitted timesheet back to draft so the contractor can re-edit.
 * Only works on "submitted" status timesheets.
 */
export async function unsubmitTimesheet(submissionId: string) {
  try {
    const session = await requireOrg();
    if (!["super_admin", "admin"].includes(session.orgRole)) {
      throw new HriqError("HRIQ-0105", "Only admins can unsubmit timesheets");
    }

    const submission = await database.timesheetSubmission.findFirst({
      where: { id: submissionId, employee: { organizationId: session.orgId } },
      select: { id: true, status: true },
    });
    if (!submission) throw new HriqError("HRIQ-0602");
    if (submission.status !== "submitted") throw new HriqError("HRIQ-1004", `Cannot unsubmit timesheet with status: ${submission.status}`);

    const claimed = await database.timesheetSubmission.updateMany({
      where: { id: submissionId, status: "submitted", employee: { organizationId: session.orgId } },
      data: { status: "draft", submittedAt: null, adjustmentStatus: null, adjustmentNote: null },
    });
    if (claimed.count === 0) throw new HriqError("HRIQ-1004", "Timesheet status changed before unsubmit could complete");

    revalidatePath("/[orgSlug]/timesheets", "page");

    return { ok: true };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[timesheets.ts:unsubmitTimesheet]", _msg);
    return { error: _msg };
  }
}

//  Contractor Notifications 

async function notifyContractorTimesheetStatus(
  employee: { legalFirstName: string; preferredName: string | null; personalEmail: string | null; workEmail: string | null },
  periodName: string,
  status: "approved" | "rejected",
  totalHours: number,
  estimatedPay?: number,
  currency?: string,
  reason?: string,
  bonusAmount?: number,
) {
  const email = (getContractorEmail(employee))?.trim();
  if (!email) return;

  const name = employee.preferredName ?? employee.legalFirstName;
  const isApproved = status === "approved";
  const subject = isApproved
    ? `Timesheet Approved — ${periodName}`
    : `Timesheet Rejected — ${periodName}`;

  try {
    const { sendViaGmail } = await import("@/app/actions/hriq/send-email");
    const templates = await import("@/app/actions/hriq/email-templates");
    const { buildEmail } = await import("./email-template-engine");
    const html = isApproved
      ? templates.timesheetApprovedEmail(name, periodName, totalHours, estimatedPay, currency ?? undefined)
      : templates.timesheetRejectedEmail(name, periodName, totalHours, reason);
    const slug = isApproved ? "timesheet_approved" : "timesheet_rejected";
    const vars: Record<string, string> = {
      name, period: periodName, hours: String(totalHours),
      ...(isApproved
        ? { pay: estimatedPay ? `$${estimatedPay.toFixed(2)} ${currency ?? "USD"}` : "" }
        : { reason: reason ?? "" }),
      dashboard_url: "",
    };
    const rendered = await buildEmail(slug, vars, html, subject);
    try {
      await sendViaGmail(email, rendered.subject, rendered.html);
    } catch (emailErr) {
      console.error("[HRIQ] Email send failed (non-blocking):", emailErr);
    }
  } catch (err) {
    console.error("[HRIQ-1703] Timesheets — email notification failed:", err);
  }
}

//  Missing Timesheets Detection 

export type MissingTimesheetEntry = {
  employeeId: string;
  employeeNumber: string;
  name: string;
  email: string | null;
  periodId: string;
  periodName: string;
};

/**
 * Find active contractors who haven't submitted timesheets for open periods.
 */
export async function getMissingTimesheets(): Promise<MissingTimesheetEntry[]> {
  const session = await requireOrg();

  const [openPeriods, activeContractors] = await Promise.all([
    database.timesheetPeriod.findMany({
      where: { organizationId: session.orgId, status: "open" },
      include: {
        submissions: { select: { employeeId: true } },
      },
      orderBy: { startDate: "desc" },
    }),
    database.employee.findMany({
      where: {
        organizationId: session.orgId,
        employmentStatus: "active",
        linkedUserId: { not: null },
      },
      select: {
        id: true,
        employeeNumber: true,
        legalFirstName: true,
        legalLastName: true,
        personalEmail: true,
        linkedUserId: true,
      },
    }),
  ]);

  if (openPeriods.length === 0) return [];
  if (activeContractors.length === 0) return [];

  // Only include contractors who have actually logged in at least once
  const loggedInUsers = await database.appUser.findMany({
    where: {
      supabaseUserId: { in: activeContractors.map((c) => c.linkedUserId!).filter(Boolean) },
      loginCount: { gt: 0 },
    },
    select: { supabaseUserId: true },
  });
  const loggedInSet = new Set(loggedInUsers.map((u) => u.supabaseUserId));

  const contractorsWhoLoggedIn = activeContractors.filter(
    (c) => loggedInSet.has(c.linkedUserId!)
  );

  const missing: MissingTimesheetEntry[] = [];

  for (const period of openPeriods) {
    const submittedIds = new Set(period.submissions.map((s: any) => s.employeeId));

    for (const contractor of contractorsWhoLoggedIn) {
      if (submittedIds.has(contractor.id)) continue;

      missing.push({
        employeeId: contractor.id,
        employeeNumber: contractor.employeeNumber,
        name: `${contractor.legalFirstName} ${contractor.legalLastName}`,
        email: contractor.personalEmail,
        periodId: period.id,
        periodName: period.name,
      });
    }
  }

  return missing;
}

/**
 * Send reminder emails to contractors who haven't submitted timesheets.
 */
// ─── Indirect Pay Invoice Trigger ───────────────────────────────────────────────

/**
 * Check if an org uses cor and if so, generate (or update) the
 * client invoice for the period and email the client with the QB payment link.
 * Only runs if the org profile paymentMethod is "cor" or "both".
 */
async function checkAndTriggerIndirectPayInvoice(orgId: string, periodId: string) {
  const orgProfile = await database.organizationProfile.findUnique({
    where: { organizationId: orgId },
    select: { paymentMethod: true },
  });

  const pm = orgProfile?.paymentMethod;
  if (!pm) return;

  // COR path: QB invoice + QB payment link
  if (pm === "cor" || pm === "both") {
    const { generateAndSendClientInvoiceForOrg } = await import("./client-invoices");
    const result = await generateAndSendClientInvoiceForOrg(orgId, periodId);
    console.info(
      `[Indirect Pay] Invoice ${result.invoiceId} — emailSent: ${result.emailSent}, paymentLink: ${result.paymentLink ? "yes" : "no"}`,
    );
  }

  // PPP path: ClientInvoice + per-contractor Stripe Connect payment links
  // Each contractor gets a direct charge on their Express account — RL never touches the money.
  if (pm === "ppp") {
    try {
      const { generateClientInvoiceForOrg } = await import("./client-invoices");
      const invoiceId = await generateClientInvoiceForOrg(orgId, periodId);
      if (!invoiceId) return;

      // Create per-contractor Stripe Checkout links (direct charges on contractor Express accounts)
      const { createPPPPaymentLinks, emailPPPPaymentLinks } = await import("./stripe");
      const result = await createPPPPaymentLinks(invoiceId);
      if ("error" in result) {
        console.error(`[PPP Pay] Failed to create payment links for invoice ${invoiceId}:`, result.error);
        return;
      }

      // Email the client admin with per-contractor payment breakdown and links
      await emailPPPPaymentLinks(invoiceId);
      console.info(`[PPP Pay] Invoice ${invoiceId} — ${result.links.length} payment links created, ${result.errors.length} errors, email sent`);
    } catch (err) {
      console.error("[PPP Pay] Failed to generate PPP invoice:", err);
    }
  }
}

export async function sendMissingTimesheetReminders(periodId: string): Promise<{ sent: number; failed: number } | { error: string }> {
  try {
  const session = await requireOrg();

  const period = await database.timesheetPeriod.findFirst({
    where: { id: periodId, organizationId: session.orgId },
    include: { submissions: { select: { employeeId: true } } },
  });
  if (!period) throw new HriqError("HRIQ-0901");

  const submittedIds = new Set(period.submissions.map((s: any) => s.employeeId));

  const missing = await database.employee.findMany({
    where: {
      organizationId: session.orgId,
      employmentStatus: "active",
      linkedUserId: { not: null },
      id: { notIn: Array.from(submittedIds) },
    },
    select: { legalFirstName: true, preferredName: true, personalEmail: true, workEmail: true, linkedUserId: true },
  });

  // Only send reminders to contractors who have logged in at least once
  const loggedInUsers = await database.appUser.findMany({
    where: {
      supabaseUserId: { in: missing.map((c) => c.linkedUserId!).filter(Boolean) },
      loginCount: { gt: 0 },
    },
    select: { supabaseUserId: true },
  });
  const loggedInSet = new Set(loggedInUsers.map((u) => u.supabaseUserId));

  const missingLoggedIn = missing.filter(
    (c) => loggedInSet.has(c.linkedUserId!)
  );

  let sent = 0;
  let failed = 0;
  const startDate = new Date(period.startDate as any).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const endDate = new Date(period.endDate as any).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  // Import email modules once outside the loop
  const { sendViaGmail } = await import("@/app/actions/hriq/send-email");
  const { timesheetStartReminderEmail } = await import("@/app/actions/hriq/email-templates");
  const { buildEmail } = await import("./email-template-engine");

  for (const c of missingLoggedIn) {
    const email = getContractorEmail(c);
    if (!email) { failed++; continue; }

    const name = c.preferredName ?? c.legalFirstName;
    try {
      const html = timesheetStartReminderEmail(name, period.name, startDate, endDate);
      const fallbackSubject = `Time to Fill Out Your Timesheet — ${period.name}`;
      const rendered = await buildEmail("timesheet_reminder", { name, period: period.name, start_date: startDate, end_date: endDate, dashboard_url: "" }, html, fallbackSubject);
      await sendViaGmail(email, rendered.subject, rendered.html);
      sent++;
    } catch (err) {
      console.error(`[HRIQ-1703] Timesheets — reminder email failed for ${email}:`, err);
      failed++;
    }
  }

  return { sent, failed };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[timesheets.ts:sendMissingTimesheetReminders]", _msg);
    return { error: _msg };
  }
}

/** Validate an IANA timezone string. Returns it if valid, null otherwise. */
function validateTimezone(tz: string | null | undefined): string | null {
  if (!tz) return null;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
}

// ─── Time Doctor auto-fill ─────────────────────────────────────────────────────

export type TDDailyEntry = {
  date: string;
  hours: number;
  minutes: number; // total minutes from TD (source of truth for display)
  timeIn: string | null;
  timeOut: string | null;
};

/**
 * Fetch Time Doctor worklogs for the current user's employee record for a given
 * pay period.  Returns per-day aggregated hours so the timesheet form can
 * pre-fill (or overwrite) entries from Time Doctor data.
 *
 * Only usable by contractors / admins who have a `timeDoctorEmail` set on their
 * employee record.  Wraps the existing `syncTimeDoctorForPeriod` integration but
 * scoped to a single user so we don't pull every TD user on each call.
 */
export async function getTimeDoctorEntriesForPeriod(
  periodId: string
): Promise<{ ok: true; entries: TDDailyEntry[] } | { error: string }> {
  try {
    const session = await requireSession();
    // Do NOT scope by orgId — the TD email lives on the person's employee record
    // which may be in a different org than the one currently being viewed
    // (e.g. super_admin viewing a client org's timesheet page).
    const employee = await database.employee.findFirst({
      where: { linkedUserId: session.userId },
      select: { id: true, timeDoctorEmail: true, timezone: true },
      orderBy: { createdAt: "desc" }, // prefer most recently created if somehow duplicated
    });
    if (!employee) return { error: "No employee record found for your account" };
    if (!employee.timeDoctorEmail) return { error: "No Time Doctor email linked to your account. Ask an admin to set your Time Doctor email in your employee profile." };

    // Resolve the pay period
    const period = await database.timesheetPeriod.findFirst({
      where: { id: periodId },
      select: { startDate: true, endDate: true },
    });
    if (!period) {
      return { error: "Pay period not found" };
    }

    const startStr = new Date(period.startDate as any).toISOString().split("T")[0];
    const endStr = new Date(period.endDate as any).toISOString().split("T")[0];
    // Timezone priority: TD user profile (set in syncTimeDoctorForPeriod) → HRIQ employee → UTC
    // Most contractors have timezone set in their TD profile which overrides this fallback.
    const timezone = validateTimezone(employee.timezone) ?? "UTC";
    // Use the existing syncTimeDoctorForPeriod — scoped to this one employee
    const { syncTimeDoctorForPeriod } = await import("@repo/integrations/timedoctor");
    const result = await withTimeout(syncTimeDoctorForPeriod(
      startStr,
      endStr,
      [{ id: employee.id, timeDoctorEmail: employee.timeDoctorEmail }],
      timezone
    ), 15000, "Time Doctor syncTimeDoctorForPeriod");

    if (!result) {
      return { error: "Time Doctor API timed out. Please try again." };
    }
    if (result.entries.length === 0) {
      const hint = result.unmatched.length > 0
        ? ` (no TD user found matching ${employee.timeDoctorEmail})`
        : ` (user found in TD but no activity logged in this period)`;
      return { error: `No Time Doctor activity found for this pay period.${hint}` };
    }

    const entries: TDDailyEntry[] = result.entries[0].dailyEntries.map((d) => ({
      date: d.date,
      hours: d.hours,
      minutes: d.minutes,
      timeIn: d.timeIn,
      timeOut: d.timeOut,
    }));

    return { ok: true, entries };
  } catch (err: any) {
    console.error(`[TD-FILL] failed: ${err.message}`, err.stack?.split("\n").slice(0, 3).join(" | "));
    import("@/lib/hriq/sentry").then(({ captureServerException }) => captureServerException(err, { action: "getTimeDoctorEntriesForPeriod" })).catch(() => {});
    return { error: `Time Doctor sync failed: ${err.message}` };
  }
}

/**
 * Fetch a single timesheet submission's full details for inline expansion.
 * Returns daily entries, notes, bonuses, approval metadata.
 */
export async function getTimesheetDetail(submissionId: string) {
  const session = await requireOrg();
  const sub = await database.timesheetSubmission.findFirst({
    where: {
      id: submissionId,
      employee: { organizationId: session.orgId },
    },
    select: {
      id: true,
      dailyEntries: true,
      notes: true,
      bonuses: true,
      bonusTotal: true,
      totalHours: true,
      status: true,
      submittedAt: true,
      approvedAt: true,
      rejectedAt: true,
      approvedByUserId: true,
      mondayHours: true, tuesdayHours: true, wednesdayHours: true,
      thursdayHours: true, fridayHours: true, saturdayHours: true, sundayHours: true,
      mondayStart: true, tuesdayStart: true, wednesdayStart: true,
      thursdayStart: true, fridayStart: true, saturdayStart: true, sundayStart: true,
      period: { select: { name: true, startDate: true, endDate: true } },
      employee: { select: { legalFirstName: true, legalLastName: true, hourlyRate: true, currency: true } },
    },
  });
  if (!sub) return null;
  return serialize(sub);
}

//  Timesheet Adjustment Request Flow 

/**
 * Contractor requests to edit an already-submitted timesheet.
 * Requires a note explaining why the edit is needed.
 */
export async function requestTimesheetAdjustment(submissionId: string, note: string) {
  try {
    const session = await requireSession();
    if (!note || note.trim().length < 5) throw new HriqError("HRIQ-1005", "Please provide a reason for the edit request (at least 5 characters)");

    const employee = await database.employee.findFirst({
      where: { linkedUserId: session.userId, ...(session.orgId ? { organizationId: session.orgId } : {}) },
      select: { id: true },
    });
    if (!employee) throw new HriqError("HRIQ-2501");

    const submission = await database.timesheetSubmission.findFirst({
      where: { id: submissionId, employeeId: employee.id },
      select: { status: true, adjustmentStatus: true },
    });
    if (!submission) throw new HriqError("HRIQ-0602");
    if (!["submitted", "approved", "auto_approved"].includes(submission.status)) {
      throw new HriqError("HRIQ-1003", "Only submitted or approved timesheets can request adjustments");
    }
    if (submission.adjustmentStatus === "requested") {
      throw new HriqError("HRIQ-1003", "An adjustment request is already pending");
    }

    await database.timesheetSubmission.update({
      where: { id: submissionId },
      data: { adjustmentStatus: "requested", adjustmentNote: note.trim().slice(0, 1000) },
    });

    revalidatePath("/[orgSlug]/timesheets", "page");
    return { success: true };
  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    return { error: _msg };
  }
}

/**
 * Admin applies a contractor's adjustment request.
 * The admin reads the contractor's note and makes the edits themselves,
 * then the adjustment is marked as applied. The timesheet stays submitted
 * (it does NOT go back to rejected/draft for the contractor).
 */
export async function approveTimesheetAdjustment(submissionId: string) {
  try {
    const session = await requireOrg();
    if (!["super_admin", "admin"].includes(session.orgRole)) {
      throw new HriqError("HRIQ-0105", "Only admins can approve adjustment requests");
    }

    const submission = await database.timesheetSubmission.findFirst({
      where: { id: submissionId, employee: { organizationId: session.orgId }, adjustmentStatus: "requested" },
      select: { id: true, adjustmentNote: true },
    });
    if (!submission) throw new HriqError("HRIQ-0602", "No pending adjustment request found");

    await database.timesheetSubmission.update({
      where: { id: submissionId },
      data: {
        adjustmentStatus: "approved",
        adjustmentApprovedAt: new Date(),
        adjustmentApprovedBy: session.userId,
        // Do NOT change timesheet status — admin will apply the edit themselves
      },
    });

    revalidatePath("/[orgSlug]/timesheets", "page");
    return { success: true };
  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    return { error: _msg };
  }
}

/**
 * Admin denies a contractor's adjustment request.
 */
export async function denyTimesheetAdjustment(submissionId: string, reason?: string) {
  try {
    const session = await requireOrg();
    if (!["super_admin", "admin"].includes(session.orgRole)) {
      throw new HriqError("HRIQ-0105", "Only admins can deny adjustment requests");
    }

    const submission = await database.timesheetSubmission.findFirst({
      where: { id: submissionId, employee: { organizationId: session.orgId }, adjustmentStatus: "requested" },
      select: { id: true },
    });
    if (!submission) throw new HriqError("HRIQ-0602", "No pending adjustment request found");

    await database.timesheetSubmission.update({
      where: { id: submissionId },
      data: { adjustmentStatus: "denied", adjustmentApprovedAt: new Date(), adjustmentApprovedBy: session.userId },
    });

    revalidatePath("/[orgSlug]/timesheets", "page");
    return { success: true };
  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    return { error: _msg };
  }
}

/**
 * Admin directly edits a timesheet's entries, hours, and/or bonuses.
 * Used when a contractor requests an adjustment — the admin applies the
 * changes themselves based on the contractor's notes.
 *
 * Accepts partial updates: only provided fields are changed.
 * If the submission had a pending adjustment request, it's auto-resolved.
 */
export async function adminEditTimesheet(
  submissionId: string,
  edits: {
    dailyEntries?: Array<{ date: string; timeIn?: string; hours: number; note?: string }>;
    bonuses?: Array<{ description: string; amount: number }>;
    notes?: string;
  }
) {
  try {
    const session = await requireOrg();
    if (!["super_admin", "admin"].includes(session.orgRole)) {
      throw new HriqError("HRIQ-0105", "Only admins can edit timesheets");
    }

    const submission = await database.timesheetSubmission.findFirst({
      where: { id: submissionId, employee: { organizationId: session.orgId } },
      select: {
        id: true, status: true, dailyEntries: true, bonuses: true, notes: true,
        adjustmentStatus: true, adjustmentNote: true,
        employee: { select: { legalFirstName: true, legalLastName: true } },
      },
    });
    if (!submission) throw new HriqError("HRIQ-0602", "Submission not found");

    const updateData: Record<string, any> = {};

    if (edits.dailyEntries) {
      const cleanEntries = edits.dailyEntries.map((e) => {
        const hours = Number(e.hours);
        if (!Number.isFinite(hours) || hours < 0 || hours > 24) {
          throw new HriqError("HRIQ-1005", `Invalid hours for ${e.date}: ${e.hours}`);
        }
        return { date: e.date, timeIn: e.timeIn || null, hours, note: e.note?.slice(0, 500)?.trim() || null };
      });

      const totalHours = cleanEntries.reduce((sum, e) => sum + e.hours, 0);
      const dayOfWeekNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
      const dayTotals: Record<string, number> = { monday: 0, tuesday: 0, wednesday: 0, thursday: 0, friday: 0, saturday: 0, sunday: 0 };
      const dayStarts: Record<string, string | null> = { monday: null, tuesday: null, wednesday: null, thursday: null, friday: null, saturday: null, sunday: null };

      for (const entry of cleanEntries) {
        if (entry.hours <= 0) continue;
        const d = new Date(entry.date + "T12:00:00Z");
        const dayName = dayOfWeekNames[d.getUTCDay()];
        dayTotals[dayName] += entry.hours;
        if (!dayStarts[dayName] && entry.timeIn) dayStarts[dayName] = entry.timeIn;
      }

      updateData.dailyEntries = cleanEntries;
      updateData.totalHours = new Prisma.Decimal(totalHours);
      updateData.mondayHours = new Prisma.Decimal(dayTotals.monday);
      updateData.tuesdayHours = new Prisma.Decimal(dayTotals.tuesday);
      updateData.wednesdayHours = new Prisma.Decimal(dayTotals.wednesday);
      updateData.thursdayHours = new Prisma.Decimal(dayTotals.thursday);
      updateData.fridayHours = new Prisma.Decimal(dayTotals.friday);
      updateData.saturdayHours = new Prisma.Decimal(dayTotals.saturday);
      updateData.sundayHours = new Prisma.Decimal(dayTotals.sunday);
      updateData.mondayStart = dayStarts.monday;
      updateData.tuesdayStart = dayStarts.tuesday;
      updateData.wednesdayStart = dayStarts.wednesday;
      updateData.thursdayStart = dayStarts.thursday;
      updateData.fridayStart = dayStarts.friday;
      updateData.saturdayStart = dayStarts.saturday;
      updateData.sundayStart = dayStarts.sunday;
    }

    if (edits.bonuses !== undefined) {
      const cleanBonuses = edits.bonuses
        .filter((b) => b.description?.trim() && Number.isFinite(b.amount) && b.amount > 0)
        .map((b) => ({ description: b.description.trim().slice(0, 200), amount: Math.round(b.amount * 100) / 100 }));
      updateData.bonuses = cleanBonuses.length > 0 ? cleanBonuses : Prisma.JsonNull;
      updateData.bonusTotal = new Prisma.Decimal(cleanBonuses.reduce((s, b) => s + b.amount, 0));
    }

    if (edits.notes !== undefined && edits.notes.trim()) {
      // Prepend admin edit reason with timestamp, preserving existing contractor notes
      const timestamp = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
      const editPrefix = `[Admin edit ${timestamp}] ${edits.notes.trim()}`;
      const existingNotes = (submission.notes ?? "").trim();
      updateData.notes = existingNotes
        ? `${editPrefix}\n---\n${existingNotes}`
        : editPrefix;
    }

    // If there was a pending adjustment, auto-resolve it
    if (submission.adjustmentStatus === "requested") {
      updateData.adjustmentStatus = "approved";
      updateData.adjustmentApprovedAt = new Date();
      updateData.adjustmentApprovedBy = session.userId;
    }

    await database.timesheetSubmission.update({
      where: { id: submissionId },
      data: updateData,
    });

    revalidatePath("/[orgSlug]/timesheets", "page");
    revalidatePath("/[orgSlug]/payroll", "page");
    revalidatePath("/[orgSlug]/employees/[id]", "page");

    return {
      success: true,
      name: `${submission.employee.legalFirstName} ${submission.employee.legalLastName}`,
      totalHours: updateData.totalHours ? Number(updateData.totalHours) : undefined,
    };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[timesheets.ts:adminEditTimesheet]", _msg);
    return { error: _msg };
  }
}
