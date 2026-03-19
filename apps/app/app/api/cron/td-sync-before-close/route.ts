import { database, Prisma } from "@repo/database";
import { NextResponse } from "next/server";

export const maxDuration = 120; // TD API can be slow with many users

/**
 * Recurring cron: sync Time Doctor hours for ALL TD-tracked contractors
 * on the current open timesheet period.
 *
 * This runs every 8 hours to keep timesheets populated with TD data
 * so contractors don't need to manually click "Fill from TD".
 * Manual fill still works — this just ensures drafts stay current.
 *
 * For each open period that is currently active OR just expired:
 * 1. Fetch all active employees with timeDoctorEmail set
 * 2. Skip employees who already submitted/approved
 * 3. Call syncTimeDoctorForPeriod in one batch per period
 * 4. Create/update draft timesheets with synced hours (preserving bonuses)
 *
 * Schedule: Every 8 hours → vercel.json: "30 0,8,16 * * *"
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // "Today" in PST — match the same cutoff auto-submit uses
  const todayPST = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  const todayDate = new Date(todayPST + "T00:00:00Z");

  // Find all open periods: current (today is within range) OR just expired (deadline passed)
  const openPeriods = await database.timesheetPeriod.findMany({
    where: {
      status: "open",
      startDate: { lte: todayDate },
    },
    select: { id: true, name: true, startDate: true, endDate: true, organizationId: true },
  });

  if (openPeriods.length === 0) {
    return NextResponse.json({ message: "No open periods to sync", synced: 0 });
  }

  const allResults: Array<{
    period: string;
    employee: string;
    hours: number;
    status: string;
  }> = [];

  for (const period of openPeriods) {
    const startStr = new Date(period.startDate as any).toISOString().split("T")[0]!;
    const endStr = new Date(period.endDate as any).toISOString().split("T")[0]!;

    // Get all active employees with TD email in this org
    const employees = await database.employee.findMany({
      where: {
        organizationId: period.organizationId,
        employmentStatus: { in: ["active", "onboarding_in_progress"] },
        timeDoctorEmail: { not: null },
      },
      select: {
        id: true,
        timeDoctorEmail: true,
        legalFirstName: true,
        legalLastName: true,
        timezone: true,
      },
    });

    if (employees.length === 0) continue;

    // Check existing submissions — include bonuses so we can preserve them
    const existingSubs = await database.timesheetSubmission.findMany({
      where: {
        periodId: period.id,
        employeeId: { in: employees.map((e) => e.id) },
      },
      select: {
        employeeId: true,
        status: true,
        totalHours: true,
        bonuses: true,
        bonusTotal: true,
      },
    });

    const subByEmployee = new Map(existingSubs.map((s) => [s.employeeId, s]));

    // Only sync employees who need it:
    // - No submission at all (never opened their timesheet)
    // - Draft (re-sync to get final TD numbers before auto-submit)
    // Never touch: submitted, approved, auto_approved, rejected
    const needsSync = employees.filter((e) => {
      const sub = subByEmployee.get(e.id);
      if (!sub) return true;
      if (sub.status === "draft") return true;
      return false;
    });

    if (needsSync.length === 0) {
      allResults.push({ period: period.name, employee: "(all)", hours: 0, status: "all-already-submitted" });
      continue;
    }

    // Batch sync from Time Doctor — one TD API call per period
    let syncResult;
    try {
      const { syncTimeDoctorForPeriod } = await import("@repo/integrations/timedoctor");
      syncResult = await syncTimeDoctorForPeriod(
        startStr,
        endStr,
        needsSync.map((e) => ({ id: e.id, timeDoctorEmail: e.timeDoctorEmail })),
      );
    } catch (err) {
      console.error(`[TD-Sync-Cron] TD API failed for period ${period.name}:`, err);
      allResults.push({
        period: period.name,
        employee: "(all)",
        hours: 0,
        status: `td-api-error:${err instanceof Error ? err.message.slice(0, 80) : "unknown"}`,
      });
      continue;
    }

    if (!syncResult || syncResult.entries.length === 0) {
      allResults.push({
        period: period.name,
        employee: "(all)",
        hours: 0,
        status: `no-td-data:matched=${syncResult?.matched ?? 0}`,
      });
      continue;
    }

    // Build day-of-week helpers
    const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

    for (const entry of syncResult.entries) {
      const emp = needsSync.find((e) => e.id === entry.employeeId);
      const name = emp ? `${emp.legalFirstName} ${emp.legalLastName}` : entry.employeeId;

      if (entry.dailyEntries.length === 0 || entry.totalHours <= 0) {
        allResults.push({ period: period.name, employee: name, hours: 0, status: "no-hours" });
        continue;
      }

      try {
        // Build daily entries from TD minutes (clean decimals)
        const cleanEntries = entry.dailyEntries.map((d) => ({
          date: d.date,
          timeIn: d.timeIn || null,
          timeOut: d.timeOut || null,
          hours: Math.round((d.minutes / 60) * 1e6) / 1e6,
          minutes: d.minutes,
          note: null,
        }));

        // Compute totals from integer minutes (avoids float drift)
        const totalMinutes = cleanEntries.reduce((s, e) => s + (e.minutes ?? 0), 0);
        const totalHours = Math.round((totalMinutes / 60) * 1e6) / 1e6;

        const dayTotals: Record<string, number> = {
          monday: 0, tuesday: 0, wednesday: 0, thursday: 0,
          friday: 0, saturday: 0, sunday: 0,
        };
        const dayStarts: Record<string, string | null> = {
          monday: null, tuesday: null, wednesday: null, thursday: null,
          friday: null, saturday: null, sunday: null,
        };

        for (const e of cleanEntries) {
          if (e.hours <= 0) continue;
          const d = new Date(e.date + "T12:00:00Z");
          const dayName = dayNames[d.getUTCDay()];
          dayTotals[dayName] += e.hours;
          if (!dayStarts[dayName] && e.timeIn) dayStarts[dayName] = e.timeIn;
        }

        // Preserve bonuses from existing draft (contractor may have added bonuses manually)
        const existingSub = subByEmployee.get(entry.employeeId);
        const existingBonuses = existingSub?.bonuses ?? [];
        const existingBonusTotal = existingSub?.bonusTotal ?? 0;

        const shared = {
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
          status: "draft" as const,
        };

        // Upsert: create new draft or update existing draft with fresh TD data
        // Existing bonuses are preserved on update; new submissions get no bonus
        await database.timesheetSubmission.upsert({
          where: {
            employeeId_periodId: {
              employeeId: entry.employeeId,
              periodId: period.id,
            },
          },
          create: {
            employeeId: entry.employeeId,
            periodId: period.id,
            ...shared,
            notes: "Auto-synced from Time Doctor",
            bonuses: [],
            bonusTotal: new Prisma.Decimal(0),
          },
          update: {
            ...shared,
            // Keep existing bonuses + notes; only overwrite hours data
            ...(existingSub
              ? {
                  bonuses: existingBonuses as any,
                  bonusTotal: new Prisma.Decimal(Number(existingBonusTotal)),
                }
              : {
                  bonuses: [],
                  bonusTotal: new Prisma.Decimal(0),
                }),
          },
        });

        allResults.push({ period: period.name, employee: name, hours: totalHours, status: "synced" });
      } catch (err) {
        console.error(`[TD-Sync-Cron] Draft upsert failed for ${name}:`, err);
        allResults.push({ period: period.name, employee: name, hours: entry.totalHours, status: "db-error" });
      }
    }

    // Log unmatched TD users for ops visibility
    if (syncResult.unmatched.length > 0) {
      console.warn(
        `[TD-Sync-Cron] ${period.name}: ${syncResult.unmatched.length} TD users not matched to HRIQ employees:`,
        syncResult.unmatched.slice(0, 5),
      );
    }
  }

  const synced = allResults.filter((r) => r.status === "synced").length;

  // ─── Auto-backfill timezones from TD profiles ─────────────────────────────
  // On every sync run, pull TD user timezones and fill any HRIQ employees
  // that are still missing theirs. This is cheap (1 API call) and ensures
  // new contractors get their timezone set automatically.
  let tzUpdated = 0;
  try {
    const { getTDToken, getTDCompanyId, getTDUsers } = await import("@repo/integrations/timedoctor");
    const token = await getTDToken();
    const companyId = await getTDCompanyId(token);
    const tdUsers = await getTDUsers(token, companyId);

    const tzByEmail = new Map<string, string>();
    for (const u of tdUsers) {
      if (u.email && u.timezone) {
        tzByEmail.set(u.email.toLowerCase(), u.timezone);
      }
    }

    // Find employees missing timezone who have a TD email
    const missing = await database.employee.findMany({
      where: {
        employmentStatus: { in: ["active", "onboarding_in_progress"] },
        timeDoctorEmail: { not: null },
        timezone: null,
      },
      select: { id: true, timeDoctorEmail: true },
    });

    for (const emp of missing) {
      const tz = tzByEmail.get(emp.timeDoctorEmail!.toLowerCase());
      if (!tz) continue;
      // Validate IANA timezone
      try { Intl.DateTimeFormat("en-US", { timeZone: tz }); } catch { continue; }
      await database.employee.update({ where: { id: emp.id }, data: { timezone: tz } });
      tzUpdated++;
    }

    if (tzUpdated > 0) {
      console.log(`[TD-Sync-Cron] Backfilled ${tzUpdated} employee timezone(s) from TD profiles`);
    }
  } catch (err) {
    console.warn("[TD-Sync-Cron] Timezone backfill failed (non-blocking):", err instanceof Error ? err.message : err);
  }

  return NextResponse.json({
    message: `TD sync complete: ${synced} timesheets synced across ${openPeriods.length} period(s)${tzUpdated > 0 ? `, ${tzUpdated} timezones backfilled` : ""}`,
    synced,
    periods: openPeriods.length,
    tzUpdated,
    results: allResults,
  });
}
