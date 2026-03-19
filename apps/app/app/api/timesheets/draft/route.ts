import { getSessionContext } from "@repo/auth/session";
import { database, Prisma } from "@repo/database";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionContext();
    if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const data = await req.json();
    const { periodId, dailyEntries = [], notes, bonuses = [] } = data;

    if (!periodId) return NextResponse.json({ error: "periodId required" }, { status: 400 });

    const employee = await database.employee.findFirst({
      where: {
        linkedUserId: session.userId,
        ...(session.orgId ? { organizationId: session.orgId } : {}),
      },
      select: { id: true, organizationId: true },
    });
    if (!employee) return NextResponse.json({ ok: true, skipped: true });

    const period = await database.timesheetPeriod.findFirst({
      where: { id: periodId, organizationId: employee.organizationId ?? undefined },
      select: { status: true },
    });
    if (!period || period.status === "locked") return NextResponse.json({ ok: true, skipped: true });

    // Don't overwrite submitted/approved
    const existing = await database.timesheetSubmission.findUnique({
      where: { employeeId_periodId: { employeeId: employee.id, periodId } },
      select: { status: true },
    });
    if (existing && !["draft", "rejected"].includes(existing.status)) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const cleanEntries = (dailyEntries as any[]).map((e: any) => {
      const minutes = e.minutes != null ? Number(e.minutes) : undefined;
      const rawHours = Math.min(Math.max(Number(e.hours) || 0, 0), 24);
      const tdHours = e.tdHours != null ? Number(e.tdHours) : undefined;
      return {
        date: e.date,
        timeIn: e.timeIn || null,
        timeOut: null,
        hours: minutes != null ? Math.round((minutes / 60) * 1e6) / 1e6 : rawHours,
        ...(minutes != null ? { minutes } : {}),
        ...(tdHours != null ? { tdHours } : {}),
        note: e.note ? String(e.note).slice(0, 500).trim() || null : null,
      };
    });

    // Compute totalHours from minutes sum when available (avoids float drift)
    const hasMinutes = cleanEntries.some((e: any) => e.minutes != null);
    const totalHours = hasMinutes
      ? Math.round((cleanEntries.reduce((sum, e: any) => sum + (e.minutes ?? Math.round(e.hours * 60)), 0) / 60) * 1e6) / 1e6
      : cleanEntries.reduce((sum, e) => sum + e.hours, 0);
    const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
    const dayTotals: Record<string, number> = { monday: 0, tuesday: 0, wednesday: 0, thursday: 0, friday: 0, saturday: 0, sunday: 0 };
    const dayStarts: Record<string, string | null> = { monday: null, tuesday: null, wednesday: null, thursday: null, friday: null, saturday: null, sunday: null };

    for (const e of cleanEntries) {
      if (e.hours <= 0) continue;
      const d = new Date(e.date + "T12:00:00Z");
      const name = dayNames[d.getUTCDay()];
      dayTotals[name] += e.hours;
      if (!dayStarts[name] && e.timeIn) dayStarts[name] = e.timeIn;
    }

    const cleanBonuses = Array.isArray(bonuses)
      ? (bonuses as any[])
          .filter((b: any) => b.description && Number(b.amount) > 0)
          .map((b: any) => ({ description: String(b.description).slice(0, 200), amount: Number(b.amount) }))
      : [];
    const bonusTotalVal = cleanBonuses.reduce((s: number, b: any) => s + b.amount, 0);

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
      notes: notes ?? null,
      status: "draft" as const,
      bonuses: cleanBonuses.length > 0 ? cleanBonuses : [],
      bonusTotal: new Prisma.Decimal(bonusTotalVal),
    };

    await database.timesheetSubmission.upsert({
      where: { employeeId_periodId: { employeeId: employee.id, periodId } },
      create: { employeeId: employee.id, periodId, ...shared },
      update: shared,
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Draft save error:", err);
    return NextResponse.json({ error: "Failed to save draft" }, { status: 500 });
  }
}
