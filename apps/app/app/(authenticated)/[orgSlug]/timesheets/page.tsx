import { getMyTimesheets, getTimesheetPeriods } from "@/app/actions/hriq/timesheets";
import { requireOrg } from "@repo/auth/session";
import { database } from "@repo/database";
import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "../../components/header";
import { TimesheetForm } from "./timesheet-form";
import { AdminTimesheetOverview } from "./admin-timesheet-overview";

export const metadata: Metadata = {
  title: "Timesheets",
  description: "Submit and view your timesheets",
};

// TD sync can take up to 20s (token refresh + user lookup + worklog fetch)
export const maxDuration = 30;

const RL_ORG_ID = process.env.RL_ORGANIZATION_ID ?? "org_rl_001";

const TimesheetsPage = async ({ searchParams }: { searchParams: Promise<{ view?: string }> }) => {
  const params = await searchParams;
  const viewMine = params?.view === "mine";

  let session;
  try {
    session = await requireOrg();
  } catch {
    return (
      <>
        <Header page="My Timesheets" pages={["Self Service"]} />
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <div className="rounded-xl border bg-card p-8 text-center">
            <p className="text-muted-foreground">Please sign in to view your timesheets.</p>
          </div>
        </div>
      </>
    );
  }

  const isAdmin = ["super_admin", "admin"].includes(session.orgRole);
  const isRL = session.orgId === RL_ORG_ID;
  const breadcrumb = isRL ? "RL Internal" : isAdmin ? "Timesheets" : "Self Service";

  // ─── Admin viewing their OWN timesheet (RL only) ─────────────────────────────
  if (isAdmin && isRL && viewMine) {
    const [timesheets, periods] = await Promise.all([
      getMyTimesheets(),
      getTimesheetPeriods(),
    ]);

    const openPeriods = periods.filter((p: any) => p.status === "open" || p.status === "active");

    const employee = await database.employee.findFirst({
      where: {
        linkedUserId: session.userId,
        ...(session.orgId ? { organizationId: session.orgId } : {}),
      },
      select: { hourlyRate: true, currency: true, dailyHoursTarget: true, timeDoctorEmail: true },
    });

    return (
      <>
        <Header page="My Timesheet" pages={[breadcrumb]} />
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          {/* Tab switcher */}
          <div className="flex gap-1 border-b pb-0">
            <Link
              href="timesheets"
              className="rounded-t-md px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Contractor Timesheets
            </Link>
            <span className="rounded-t-md border-b-2 border-primary px-4 py-2 text-sm font-medium text-foreground">
              My Timesheet
            </span>
          </div>
          <TimesheetForm
            timesheets={timesheets}
            openPeriods={openPeriods}
            dailyTarget={employee?.dailyHoursTarget ? Number(employee.dailyHoursTarget) : undefined}
            hourlyRate={employee?.hourlyRate ? Number(employee.hourlyRate) : undefined}
            currency={employee?.currency}
            timeDoctorEmail={employee?.timeDoctorEmail ?? undefined}
          />
        </div>
      </>
    );
  }

  // ─── Admin view: show contractor overview ─────────────────────────────────────
  if (isAdmin) {
    const periods = await getTimesheetPeriods();

    const sorted = [...periods].sort(
      (a: any, b: any) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
    );

    // Default to the period whose date range contains today (PST), then fall back to open/active, then most recent
    // "today" uses PST so the admin view matches the contractor deadline (11:59 PM PST)
    // Period dates use toISOString() because they are calendar dates stored at midnight UTC
    const todayPST = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }); // YYYY-MM-DD
    const defaultPeriod: any =
      sorted.find((p: any) => {
        const start = new Date(p.startDate).toISOString().split("T")[0];
        const end = new Date(p.endDate).toISOString().split("T")[0];
        return todayPST >= start && todayPST <= end;
      })
      ?? sorted.find((p: any) => p.status === "open" || p.status === "active")
      ?? sorted[0]
      ?? null;

    const activeContractors = await database.employee.findMany({
      where: {
        organizationId: session.orgId,
        employmentStatus: { in: ["active", "onboarding_in_progress"] },
      },
      select: {
        id: true,
        employeeNumber: true,
        legalFirstName: true,
        legalLastName: true,
        secondLastName: true,
        preferredName: true,
        workEmail: true,
        photoUrl: true,
        department: true,
        organization: { select: { id: true, name: true } },
      },
      orderBy: { legalLastName: "asc" },
    });

    const submissions = await database.timesheetSubmission.findMany({
      where: {
        employee: { organizationId: session.orgId },
        periodId: { in: periods.map((p: any) => p.id) },
      },
      select: {
        id: true,
        employeeId: true,
        periodId: true,
        status: true,
        totalHours: true,
        bonusTotal: true,
        submittedAt: true,
        adjustmentStatus: true,
        adjustmentNote: true,
      },
    });

    const subMap = new Map<string, (typeof submissions)[0]>();
    for (const s of submissions) {
      subMap.set(`${s.employeeId}:${s.periodId}`, s);
    }

    type ContractorRow = {
      id: string;
      employeeNumber: string | null;
      name: string;
      preferredName: string | null;
      secondLastName: string | null;
      workEmail: string | null;
      photoUrl: string | null;
      submissionId: string | null;
      status: "not_started" | "draft" | "submitted" | "approved" | "auto_approved" | "rejected";
      totalHours: number;
      bonusTotal: number;
      submittedAt: Date | null;
      periodId: string;
      department: string | null;
      orgName: string | null;
    };

    const allRows: ContractorRow[] = [];
    for (const p of periods as any[]) {
      for (const c of activeContractors) {
        const sub = subMap.get(`${c.id}:${p.id}`);
        allRows.push({
          id: c.id,
          employeeNumber: c.employeeNumber,
          name: `${c.legalFirstName} ${c.legalLastName}`,
          preferredName: c.preferredName ?? null,
          secondLastName: c.secondLastName ?? null,
          workEmail: c.workEmail ?? null,
          photoUrl: c.photoUrl ?? null,
          submissionId: sub?.id ?? null,
          status: (sub?.status as ContractorRow["status"]) ?? "not_started",
          totalHours: sub ? Number(sub.totalHours ?? 0) : 0,
          bonusTotal: sub ? Number((sub as any).bonusTotal ?? 0) : 0,
          submittedAt: sub?.submittedAt ?? null,
          periodId: p.id,
          department: c.department ?? null,
          orgName: c.organization?.name ?? null,
        });
      }
    }

    return (
      <>
        <Header page="Contractor Timesheets" pages={[breadcrumb]} />
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          {/* Tab switcher — RL admins can switch to their own timesheet */}
          <div className="flex gap-1 border-b pb-0">
            <span className="rounded-t-md border-b-2 border-primary px-4 py-2 text-sm font-medium text-foreground">
              Contractor Timesheets
            </span>
            {isRL && (
            <Link
              href="timesheets?view=mine"
              className="rounded-t-md px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              My Timesheet
            </Link>
            )}
          </div>
          <AdminTimesheetOverview
            contractors={allRows as any}
            periods={sorted.map((p: any) => ({
              id: p.id,
              name: p.name,
              startDate: p.startDate,
              endDate: p.endDate,
              status: p.status,
            }))}
            initialPeriodId={defaultPeriod?.id ?? null}
          />
        </div>
      </>
    );
  }

  // ─── Contractor self-service view ─────────────────────────────────────────────
  const [timesheets, periods] = await Promise.all([
    getMyTimesheets(),
    getTimesheetPeriods(),
  ]);

  const openPeriods = periods.filter((p: any) => p.status === "open" || p.status === "active");

  const employee = await database.employee.findFirst({
    where: {
      linkedUserId: session.userId,
      ...(session.orgId ? { organizationId: session.orgId } : {}),
    },
    select: { hourlyRate: true, currency: true, dailyHoursTarget: true, timeDoctorEmail: true },
  });

  return (
    <>
      <Header page="My Timesheets" pages={[breadcrumb]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <TimesheetForm
          timesheets={timesheets}
          openPeriods={openPeriods}
          dailyTarget={employee?.dailyHoursTarget ? Number(employee.dailyHoursTarget) : undefined}
          hourlyRate={employee?.hourlyRate ? Number(employee.hourlyRate) : undefined}
          currency={employee?.currency}
          timeDoctorEmail={employee?.timeDoctorEmail ?? undefined}
        />
      </div>
    </>
  );
};

export default TimesheetsPage;
