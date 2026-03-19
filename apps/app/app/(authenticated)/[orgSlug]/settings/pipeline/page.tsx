import { getSessionContext } from "@repo/auth/session";
import { database } from "@repo/database";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Header } from "../../../components/header";
import { PipelineAdminView } from "./pipeline-admin-view";
import {
  getHiringPipeline,
} from "@/app/actions/hriq/hiring";
import { getJotFormForms, getJotFormStatus } from "@/app/actions/hriq/onboarding";
import { getAvailableSenders } from "@/app/actions/hriq/send-email";
import { getOffboardingPipeline } from "@/app/actions/hriq/offboarding";
import { withTimeout } from "@/lib/hriq/format";
import {
  getAvailableZoomHosts,
  getConfiguredZoomHostByOrg,
} from "@repo/integrations/zoom";
import { serialize } from "@/lib/hriq/serialize";

export const metadata: Metadata = { title: "Pipeline Management" };
export const maxDuration = 60; // Allow up to 60s for all the parallel data loads

const RL_ORG_ID = process.env.RL_ORGANIZATION_ID ?? "org_rl_001";


export default async function PipelinePage() {
  const ctx = await getSessionContext();

  if (!ctx) {
    redirect("/sign-in");
    return null as never; // TS: redirect throws, this line is unreachable
  }

  if (ctx.orgRole !== "super_admin") {
    redirect("/");
  }

  // RSVP sync handled by /api/cron/rsvp-sync — removed from SSR to avoid
  // "revalidatePath during render" warnings and page timeout

  const [_entries, _organizations, _jotformForms, _jotformStatus, _senders, _batchSessions, _standaloneZoomSessions, _zoomHosts, _orgProfiles, _offboardingEntries] = await Promise.all([
    withTimeout(getHiringPipeline(), 8000, []),
    database.organization.findMany({
      where: { id: { not: RL_ORG_ID } },
      select: {
        id: true, name: true, slug: true,
        profile: {
          select: { paymentMethod: true, vaSeats: true, planType: true, adminEmail: true },
        },
        _count: { select: { employees: true } },
      },
      orderBy: { name: "asc" },
    }).catch(() => [] as any[]),
    withTimeout(getJotFormForms(), 3000, []),
    withTimeout(getJotFormStatus(), 3000, { configured: false, connected: false, message: "Timeout" }),
    withTimeout(getAvailableSenders(), 3000, []),
    database.batchSession.findMany({
      where: { status: { not: "cancelled" } },
      select: {
        id: true, title: true, description: true, status: true,
        zoomMeetingId: true, zoomJoinUrl: true, zoomStartUrl: true,
        zoomMeetingDate: true, zoomDuration: true,
        calendarOrganizerEmail: true, googleCalendarEventId: true,
        onboardingSessions: {
          where: { status: { notIn: ["cancelled", "completed"] } },
          select: {
            id: true, googleCalendarEventId: true,
            employee: { select: { id: true, legalFirstName: true, legalLastName: true, personalEmail: true } },
          },
        },
        _count: {
          select: { onboardingSessions: { where: { status: { notIn: ["cancelled", "completed"] } } } },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }).catch(() => [] as any[]),
    database.onboardingSession.findMany({
      where: {
        batchSessionId: null,
        zoomMeetingId: { not: null },
        status: { notIn: ["cancelled", "completed"] },
        employee: { organizationId: RL_ORG_ID },
      },
      select: {
        id: true, googleCalendarEventId: true, zoomMeetingId: true,
        zoomMeetingLink: true, zoomMeetingDate: true,
        employee: { select: { id: true, legalFirstName: true, legalLastName: true, personalEmail: true } },
      },
    }).catch(() => [] as any[]),
    withTimeout(getAvailableZoomHosts(), 3000, []),
    database.organizationProfile.findMany({
      select: { organizationId: true, paymentMethod: true, vaSeats: true, planType: true },
    }).catch(() => [] as any[]),
    withTimeout(getOffboardingPipeline(), 8000, []),
  ]);

  const entries = serialize(_entries);
  const zoomHostByOrg = getConfiguredZoomHostByOrg();

  const standaloneBatches = _standaloneZoomSessions.map((os: any) => ({
    id: `standalone_${os.id}`,
    title: `Onboarding — ${os.employee.legalFirstName} ${os.employee.legalLastName}`,
    description: null, status: "scheduled",
    zoomMeetingId: os.zoomMeetingId, zoomJoinUrl: os.zoomMeetingLink, zoomStartUrl: null,
    zoomMeetingDate: os.zoomMeetingDate, zoomDuration: 30,
    calendarOrganizerEmail: null, googleCalendarEventId: os.googleCalendarEventId,
    onboardingSessions: [{ id: os.id, googleCalendarEventId: os.googleCalendarEventId, employee: os.employee }],
  }));
  const batchSessions = [..._batchSessions, ...standaloneBatches];

  const zoomSessions = _batchSessions
    .filter((b: any) => b.zoomJoinUrl)
    .map((b: any) => ({
      id: b.id, title: b.title ?? "", zoomJoinUrl: b.zoomJoinUrl,
      zoomMeetingDate: b.zoomMeetingDate, zoomDuration: b.zoomDuration ?? 0, _count: b._count,
    }));

  const onboardingEmployees = entries
    .filter((e: any) => ["onboarding_in_progress", "onboarding_scheduled"].includes(e.employmentStatus))
    .map((e: any) => ({
      id: e.id, legalFirstName: e.legalFirstName, legalLastName: e.legalLastName,
      personalEmail: e.personalEmail, workEmail: e.workEmail,
      onboardingSession: e.onboardingSessions?.[0]
        ? { id: e.onboardingSessions[0].id, jotformsSent: e.onboardingSessions[0].jotformsSent, jotformsSentAt: e.onboardingSessions[0].startedAt, jotformsSentData: e.onboardingSessions[0].jotformsSentData }
        : null,
    }));

  const orgPaymentMethods = Object.fromEntries(
    (_orgProfiles || []).map((p: any) => [p.organizationId, p.paymentMethod ?? "ppp"])
  );

  const activeCountByOrg: Record<string, number> = {};
  for (const e of entries) {
    if (!e.organizationId) continue;
    if (["active", "pre_hire", "onboarding_scheduled", "onboarding_in_progress"].includes(e.employmentStatus)) {
      activeCountByOrg[e.organizationId] = (activeCountByOrg[e.organizationId] ?? 0) + 1;
    }
  }
  const orgSeatData = Object.fromEntries(
    (_orgProfiles || [])
      .filter((p: any) => p.vaSeats != null)
      .map((p: any) => [p.organizationId, { vaSeats: p.vaSeats, taken: activeCountByOrg[p.organizationId] ?? 0 }])
  );

  const clientOrgs = _organizations.map((o: any) => ({
    id: o.id, name: o.name, slug: o.slug,
    paymentMethod: o.profile?.paymentMethod ?? null,
    vaSeats: o.profile?.vaSeats ?? null,
    adminEmail: o.profile?.adminEmail ?? null,
    employeeCount: o._count.employees,
  }));

  return (
    <>
      <Header page="Pipeline Management" pages={["RL Internal"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <PipelineAdminView
          clientOrgs={clientOrgs}
          internalPipelineProps={{
            entries, organizations: _organizations.map((o: any) => ({ id: o.id, name: o.name })),
            jotformForms: _jotformForms, jotformStatus: _jotformStatus,
            senders: _senders, zoomSessions, batchSessions,
            zoomHosts: _zoomHosts, zoomHostByOrg,
            onboardingEmployees, offboardingEntries: _offboardingEntries ?? [],
            orgPaymentMethods, orgSeatData,
            rlOrgId: RL_ORG_ID,
          }}
        />
      </div>
    </>
  );
}
