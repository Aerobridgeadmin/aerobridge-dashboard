"use server";

import { requireRole } from "@repo/auth/session";
import { database } from "@repo/database";
import { readTimesheetFromSheet, getAllSheetNames } from "@repo/integrations/google-sheets";

export async function syncContractorTimesheet(employeeId: string, sheetId: string, sheetName?: string) {
  const session = await requireRole("super_admin");

  const employee = await database.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, legalFirstName: true, legalLastName: true, hourlyRate: true, currency: true, organizationId: true },
  });
  if (!employee) throw new Error("Contractor not found");

  const parsed = await readTimesheetFromSheet(sheetId, sheetName);
  if (!parsed) throw new Error("Could not read timesheet from Google Sheet");

  // Find or create a timesheet period for this pay period
  const periodName = parsed.periodLabel || `${parsed.cutoff}`;
  let period = await database.timesheetPeriod.findFirst({
    where: { name: periodName, organizationId: employee.organizationId ?? undefined },
  });

  if (!period) {
    period = await database.timesheetPeriod.create({
      data: {
        organizationId: employee.organizationId!,
        name: periodName,
        status: "open",
        startDate: new Date(),
        endDate: new Date(),
      },
    });
  }

  // Calculate daily hours for the week structure
  const weeklyHours: Record<string, number> = {
    monday: 0, tuesday: 0, wednesday: 0, thursday: 0, friday: 0, saturday: 0, sunday: 0,
  };

  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

  for (const row of parsed.rows) {
    if (row.payableHours <= 0) continue;
    try {
      const d = new Date(row.date);
      const dayName = dayNames[d.getDay()];
      weeklyHours[dayName] += row.payableHours;
    } catch {}
  }

  // Check if submission already exists
  const existing = await database.timesheetSubmission.findFirst({
    where: { employeeId, periodId: period.id },
  });

  if (existing) {
    // Update existing
    await database.timesheetSubmission.update({
      where: { id: existing.id },
      data: {
        mondayHours: weeklyHours.monday,
        tuesdayHours: weeklyHours.tuesday,
        wednesdayHours: weeklyHours.wednesday,
        thursdayHours: weeklyHours.thursday,
        fridayHours: weeklyHours.friday,
        saturdayHours: weeklyHours.saturday,
        sundayHours: weeklyHours.sunday,
        totalHours: parsed.totalHours,
        notes: `Synced from Google Sheet. ${parsed.rows.length} days, ${parsed.bonuses.length} bonuses.`,
        status: "submitted",
        submittedAt: new Date(),
      },
    });

    return { action: "updated", totalHours: parsed.totalHours, periodName, employeeName: parsed.employeeName };
  }

  // Create new submission
  await database.timesheetSubmission.create({
    data: {
      employeeId,
      periodId: period.id,
      mondayHours: weeklyHours.monday,
      tuesdayHours: weeklyHours.tuesday,
      wednesdayHours: weeklyHours.wednesday,
      thursdayHours: weeklyHours.thursday,
      fridayHours: weeklyHours.friday,
      saturdayHours: weeklyHours.saturday,
      sundayHours: weeklyHours.sunday,
      totalHours: parsed.totalHours,
      notes: `Synced from Google Sheet. ${parsed.rows.length} days, ${parsed.bonuses.length} bonuses.`,
      status: "submitted",
      submittedAt: new Date(),
    },
  });

  return { action: "created", totalHours: parsed.totalHours, periodName, employeeName: parsed.employeeName };
}

export async function syncAllTimesheets() {
  const session = await requireRole("super_admin");

  // Find all contractors with a Google Sheet ID
  const contractors = await database.$queryRawUnsafe<Array<{
    id: string; legal_first_name: string; legal_last_name: string; timesheet_google_sheet_id: string;
  }>>("SELECT id, legal_first_name, legal_last_name, google_sheet_id as timesheet_google_sheet_id FROM hriq_employees WHERE google_sheet_id IS NOT NULL AND google_sheet_id != '' AND employment_status = 'active'");

  const results = [];

  for (const c of contractors) {
    try {
      const result = await syncContractorTimesheet(c.id, c.timesheet_google_sheet_id);
      results.push({ name: `${c.legal_first_name} ${c.legal_last_name}`, ...result });
    } catch (err) {
      results.push({ name: `${c.legal_first_name} ${c.legal_last_name}`, action: "error", error: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  return results;
}

export async function getSheetTabs(sheetId: string) {
  return getAllSheetNames(sheetId);
}
