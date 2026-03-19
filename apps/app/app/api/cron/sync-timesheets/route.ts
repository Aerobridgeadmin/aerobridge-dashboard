import { database } from "@repo/database";
import { readAllPeriodsFromSheet } from "@repo/integrations/google-sheets";
import { NextResponse } from "next/server";

export const maxDuration = 300;

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

function computeWeeklyHours(rows: Array<{ date: string; payableHours: number }>) {
  const weekly: Record<string, number> = {
    monday: 0, tuesday: 0, wednesday: 0, thursday: 0,
    friday: 0, saturday: 0, sunday: 0,
  };
  for (const row of rows) {
    if (row.payableHours <= 0) continue;
    try {
      const d = new Date(row.date);
      weekly[DAY_NAMES[d.getDay()]!] += row.payableHours;
    } catch {}
  }
  return weekly;
}

function parsePeriodDates(label: string): { start: Date; end: Date } {
  // Parse "January 26 - February 10, 2026" or similar
  const match = label.match(/(\w+ \d{1,2})\s*[-–]\s*(\w+ \d{1,2}),?\s*(\d{4})/);
  if (match) {
    const start = new Date(`${match[1]}, ${match[3]}`);
    const end = new Date(`${match[2]}, ${match[3]}`);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      return { start, end };
    }
  }
  return { start: new Date(), end: new Date() };
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contractors = await database.$queryRawUnsafe<Array<{
    id: string;
    legal_first_name: string;
    legal_last_name: string;
    google_sheet_id: string;
    organization_id: string;
  }>>(
    `SELECT id, legal_first_name, legal_last_name, google_sheet_id, organization_id
     FROM hriq_employees
     WHERE google_sheet_id IS NOT NULL AND google_sheet_id != '' AND employment_status = 'active'`,
  );

  const results: Array<{
    name: string;
    status: string;
    periods?: number;
    totalHours?: number;
    error?: string;
  }> = [];

  for (const c of contractors) {
    try {
      const allPeriods = await readAllPeriodsFromSheet(c.google_sheet_id);

      if (allPeriods.length === 0) {
        results.push({ name: `${c.legal_first_name} ${c.legal_last_name}`, status: "skipped" });
        continue;
      }

      let syncedPeriods = 0;
      let totalHoursAll = 0;

      for (const parsed of allPeriods) {
        const periodName = parsed.periodLabel || "Auto-synced";
        const { start, end } = parsePeriodDates(periodName);

        let period = await database.timesheetPeriod.findFirst({
          where: { name: periodName, organizationId: c.organization_id },
        });

        if (!period) {
          period = await database.timesheetPeriod.create({
            data: {
              organizationId: c.organization_id,
              name: periodName,
              status: "open",
              startDate: start,
              endDate: end,
            },
          });
        }

        const weekly = computeWeeklyHours(parsed.rows);

        await database.timesheetSubmission.upsert({
          where: { employeeId_periodId: { employeeId: c.id, periodId: period.id } },
          create: {
            employeeId: c.id,
            periodId: period.id,
            mondayHours: weekly.monday,
            tuesdayHours: weekly.tuesday,
            wednesdayHours: weekly.wednesday,
            thursdayHours: weekly.thursday,
            fridayHours: weekly.friday,
            saturdayHours: weekly.saturday,
            sundayHours: weekly.sunday,
            totalHours: parsed.totalHours,
            notes: `Auto-synced from Google Sheet (${parsed.periodLabel})`,
            status: "submitted",
            submittedAt: new Date(),
          },
          update: {
            mondayHours: weekly.monday,
            tuesdayHours: weekly.tuesday,
            wednesdayHours: weekly.wednesday,
            thursdayHours: weekly.thursday,
            fridayHours: weekly.friday,
            saturdayHours: weekly.saturday,
            sundayHours: weekly.sunday,
            totalHours: parsed.totalHours,
            notes: `Auto-synced from Google Sheet (${parsed.periodLabel})`,
            submittedAt: new Date(),
          },
        });

        syncedPeriods++;
        totalHoursAll += parsed.totalHours;
      }

      results.push({
        name: `${c.legal_first_name} ${c.legal_last_name}`,
        status: "synced",
        periods: syncedPeriods,
        totalHours: Math.round(totalHoursAll * 100) / 100,
      });
    } catch (err) {
      results.push({
        name: `${c.legal_first_name} ${c.legal_last_name}`,
        status: "error",
        error: String(err),
      });
    }
  }

  return NextResponse.json({
    synced: results.filter((r) => r.status === "synced").length,
    total: contractors.length,
    results,
  });
}
