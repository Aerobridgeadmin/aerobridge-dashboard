import { getSessionContext } from "@repo/auth/session";
import { database } from "@repo/database";
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { headers } from "next/headers";

const limiter = rateLimit({ max: 30, windowMs: 60000 });

export async function GET() {
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  const { limited } = limiter.check(ip);
  if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  try {
    const session = await getSessionContext();
    if (!session) return NextResponse.json({ count: 0, items: [] });

    const items: { id: string; message: string; time: string; link: string }[] = [];
    const orgFilter = session.orgId ? { employee: { organizationId: session.orgId } } : {};

    // Resolve org slug for links
    let orgSlug = "rl";
    if (session.orgId) {
      const org = await database.organization.findUnique({ where: { id: session.orgId }, select: { slug: true } });
      if (org) orgSlug = org.slug;
    }

    if (session.orgRole === "super_admin") {
      const [pendingHiresResult, pendingPayments, pendingTimesheets, pendingTasks, pendingDocs, pendingOnboarding] = await Promise.all([
        database.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM pending_hires WHERE status = 'pending'`.catch(() => [{ count: BigInt(0) }]),
        database.payment.count({ where: { status: "pending", ...orgFilter } }),
        database.timesheetSubmission.count({ where: { status: "submitted", ...orgFilter } }),
        session.orgId ? database.task.count({ where: { employee: { organizationId: session.orgId }, status: "pending" } }) : Promise.resolve(0),
        database.document.count({ where: { status: "pending", ...orgFilter } }),
        database.onboardingSession.count({ where: { status: "in_progress" } }),
      ]);

      const pendingHiresCount = Number(pendingHiresResult[0]?.count ?? 0);
      if (pendingHiresCount > 0) items.push({ id: "pending-hires", message: `${pendingHiresCount} candidate${pendingHiresCount > 1 ? "s" : ""} waiting for approval`, time: "RecruitCRM", link: `/${orgSlug}/pending-hires` });
      if (pendingPayments > 0) items.push({ id: "pending-payments", message: `${pendingPayments} payment${pendingPayments > 1 ? "s" : ""} pending`, time: "Payments", link: `/${orgSlug}/payroll` });
      if (pendingTimesheets > 0) items.push({ id: "pending-timesheets", message: `${pendingTimesheets} timesheet${pendingTimesheets > 1 ? "s" : ""} to review`, time: "Timesheets", link: `/${orgSlug}/payroll` });
      if (pendingTasks > 0) items.push({ id: "pending-tasks", message: `${pendingTasks} task${pendingTasks > 1 ? "s" : ""} pending`, time: "Tasks", link: `/${orgSlug}/tasks` });
      if (pendingDocs > 0) items.push({ id: "pending-docs", message: `${pendingDocs} document${pendingDocs > 1 ? "s" : ""} awaiting review`, time: "Documents", link: `/${orgSlug}/documents` });
      if (pendingOnboarding > 0) items.push({ id: "pending-onboarding", message: `${pendingOnboarding} onboarding${pendingOnboarding > 1 ? "s" : ""} in progress`, time: "Onboarding", link: `/${orgSlug}/hiring` });
    } else if (session.orgRole === "member") {
      // VA / Member notifications
      const employee = await database.employee.findFirst({
        where: { linkedUserId: session.userId, ...(session.orgId ? { organizationId: session.orgId } : {}) },
        select: { id: true, organizationId: true },
      });

      if (employee) {
        const now = new Date();
        const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

        const [myTasks, pendingTimeOff] = await Promise.all([
          database.task.count({ where: { employeeId: employee.id, status: { in: ["pending", "in_progress"] } } }),
          database.timeOffRequest.count({ where: { employeeId: employee.id, status: "pending" } }),
        ]);

        if (myTasks > 0) items.push({ id: "my-tasks", message: `${myTasks} task${myTasks > 1 ? "s" : ""} assigned to you`, time: "Tasks", link: `/${orgSlug}/tasks` });
        if (pendingTimeOff > 0) items.push({ id: "pending-timeoff", message: `${pendingTimeOff} time-off request${pendingTimeOff > 1 ? "s" : ""} pending`, time: "Time Off", link: `/${orgSlug}/time-off` });
      }
    } else if (session.orgId) {
      const [pendingTasks, pendingDocs] = await Promise.all([
        database.task.count({ where: { employee: { organizationId: session.orgId }, status: "pending" } }),
        database.document.count({ where: { status: "pending", ...orgFilter } }),
      ]);
      if (pendingTasks > 0) items.push({ id: "pending-tasks", message: `${pendingTasks} task${pendingTasks > 1 ? "s" : ""} pending`, time: "Tasks", link: `/${orgSlug}/tasks` });
      if (pendingDocs > 0) items.push({ id: "pending-docs", message: `${pendingDocs} document${pendingDocs > 1 ? "s" : ""} awaiting review`, time: "Documents", link: `/${orgSlug}/documents` });
    }

    return NextResponse.json({ count: items.length, items });
  } catch (err) {
    console.error("[Notifications] Failed to fetch:", err);
    return NextResponse.json({ count: 0, items: [] });
  }
}
