import { getHiringPipeline, syncCalendarRsvps } from "@/app/actions/hriq/hiring";
import { cleanupPastCalendarEvents } from "@/app/actions/hriq/hiring-calendar";
import { getJotFormForms, getJotFormStatus } from "@/app/actions/hriq/onboarding";
import { getAvailableSenders } from "@/app/actions/hriq/send-email";
import { getOffboardingPipeline } from "@/app/actions/hriq/offboarding";
import { getSessionContext } from "@repo/auth/session";
import { database } from "@repo/database";
import { getAvailableZoomHosts, getConfiguredZoomHostByOrg } from "@repo/integrations/zoom";
import type { Metadata } from "next";
import { Header } from "../../components/header";
import dynamic from "next/dynamic";
import { withTimeout } from "@/lib/hriq/format";
import { serialize } from "@/lib/hriq/serialize";

const HiringPipeline = dynamic(() => import("./hiring-pipeline").then((m) => m.HiringPipeline), {
  loading: () => (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div className="flex items-center gap-3">
        <img src="/logo.png" alt="Loading" width={28} height={28} className="animate-spin-slow rounded-md" />
        <div className="h-5 w-40 animate-pulse rounded bg-muted" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {[...Array(3)].map((_, i) => <div key={i} className="h-28 animate-pulse rounded-xl border bg-card" />)}
      </div>
      <div className="h-96 animate-pulse rounded-xl border bg-card" />
    </div>
  ),
});

const ClientHiringPipeline = dynamic(() => import("./client-hiring-pipeline").then((m) => m.ClientHiringPipeline), {
  loading: () => (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div className="h-7 w-48 animate-pulse rounded bg-muted" />
      <div className="h-10 w-72 animate-pulse rounded-lg bg-muted" />
      <div className="h-96 animate-pulse rounded-xl border bg-card" />
    </div>
  ),
});

export const metadata: Metadata = { title: "Hiring, Onboarding & Offboarding" };

const RL_ORG_ID = process.env.RL_ORGANIZATION_ID ?? "org_rl_001";

const HiringPage = async () => {
  const ctx = await getSessionContext();
  if (!ctx) {
    const { redirect } = await import("next/navigation");
    redirect("/sign-in");
    return null as never;
  }
  if (!["super_admin", "admin"].includes(ctx.orgRole)) {
    const { redirect } = await import("next/navigation");
    redirect("/");
  }
  const session = ctx as typeof ctx & { orgId: string };

  const isRLOrg = session.orgId === RL_ORG_ID;

  // Client org: simplified pipeline
  if (!isRLOrg && session.orgId) {
    let entries: Awaited<ReturnType<typeof getHiringPipeline>> = [];
    let senders: string[] = [];
    let orgName = "Dashboard";
    let paymentMethod: string | null = null;
    let vaSeats: number | null = null;

    try {
      const [_entries, _senders, _org, _profile] = await Promise.all([
        getHiringPipeline(),
        getAvailableSenders(),
        database.organization.findUnique({ where: { id: session.orgId }, select: { name: true } }),
        database.organizationProfile.findUnique({ where: { organizationId: session.orgId }, select: { paymentMethod: true, vaSeats: true, planType: true } }),
      ]);
      entries = serialize(_entries);
      senders = _senders;
      orgName = _org?.name ?? "Dashboard";
      paymentMethod = (_profile as any)?.paymentMethod ?? null;
      vaSeats = (_profile as any)?.vaSeats ?? null;
    } catch (err) {
      console.error("[Hiring Page] Failed to load client data:", err);
    }
    const activeTaken = entries.filter((e: any) =>
      ["active", "pre_hire", "onboarding_scheduled", "onboarding_in_progress"].includes(e.employmentStatus)
    ).length;

    return (
      <>
        <Header page="Hiring & Onboarding" pages={[orgName]} />
        <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
          <ClientHiringPipeline
            entries={entries}
            orgId={session.orgId}
            orgName={orgName}
            senders={senders}
            paymentMethod={paymentMethod}
            vaSeats={vaSeats}
            seatsTaken={activeTaken}
          />
        </div>
      </>
    );
  }

  // RL org: full pipeline with Zoom, JotForm, etc.
  // Sync Google Calendar RSVPs in background — don't block page render
  syncCalendarRsvps().catch((err) => console.error("[Hiring Page] RSVP sync failed:", err));
  // Auto-cleanup past calendar events (silently, no cancellation emails)
  cleanupPastCalendarEvents().catch((err) => console.error("[Hiring Page] Calendar cleanup failed:", err));

  let entries: Awaited<ReturnType<typeof getHiringPipeline>> = [];
  let organizations: { id: string; name: string }[] = [];
  let jotformForms: Awaited<ReturnType<typeof getJotFormForms>> = [];
  let jotformStatus: Awaited<ReturnType<typeof getJotFormStatus>> = { configured: false, connected: false, message: "" };
  let senders: string[] = [];
  let zoomSessions: { id: string; title: string | null; zoomJoinUrl: string | null; zoomMeetingDate: Date | null; zoomDuration: number | null; _count: { onboardingSessions: number } }[] = [];
  let batchSessions: any[] = [];
  let onboardingEmployees: any[] = [];
  let combinedZoomHosts: string[] = [];
  let zoomHostByOrg: Record<string, string> = {};
  let offboardingEntries: Awaited<ReturnType<typeof getOffboardingPipeline>> = [];
  let orgPaymentMethods: Record<string, string> = {};
  let orgSeatData: Record<string, { vaSeats: number; taken: number }> = {};
  let pendingHiresCount = 0;

  try {
    // Timeout wrapper to prevent external services from blocking the page

    const [
      _entries,
      _organizations,
      _jotformForms,
      _jotformStatus,
      _senders,
      _batchSessions,
      _standaloneZoomSessions,
      _zoomHosts,
      _zoomHostByOrg,
      _orgMemberEmails,
      _offboardingEntries,
      _orgProfiles,
    ] = await Promise.all([
      getHiringPipeline(),
      database.organization.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
      withTimeout(getJotFormForms(), 3000, []),
      withTimeout(getJotFormStatus(), 3000, { configured: false, connected: false, message: "Timeout" }),
      getAvailableSenders(),
      // Single batch session query (was two separate queries before)
      database.batchSession.findMany({
        where: { status: { not: "cancelled" } },
        select: {
          id: true, title: true, description: true, status: true,
          zoomMeetingId: true, zoomJoinUrl: true, zoomStartUrl: true, zoomMeetingDate: true, zoomDuration: true,
          calendarOrganizerEmail: true, googleCalendarEventId: true,
          onboardingSessions: {
            where: { status: { notIn: ["cancelled", "completed"] } },
            select: { id: true, googleCalendarEventId: true, employee: { select: { id: true, legalFirstName: true, legalLastName: true, personalEmail: true } } },
          },
          _count: { select: { onboardingSessions: { where: { status: { notIn: ["cancelled", "completed"] } } } } },
        },
        orderBy: { createdAt: "desc" },
      }),
      // Standalone onboarding sessions with Zoom (not in any batch)
      database.onboardingSession.findMany({
        where: {
          batchSessionId: null,
          zoomMeetingId: { not: null },
          status: { notIn: ["cancelled", "completed"] },
          employee: { organizationId: session.orgId },
        },
        select: {
          id: true, googleCalendarEventId: true, zoomMeetingId: true,
          zoomMeetingLink: true, zoomMeetingDate: true,
          employee: { select: { id: true, legalFirstName: true, legalLastName: true, personalEmail: true } },
        },
      }),
      withTimeout(getAvailableZoomHosts(), 3000, []),
      Promise.resolve(getConfiguredZoomHostByOrg()),
      database.organizationMember.findMany({ select: { userId: true } })
        .then(async (members: any[]) => {
          const ids = [...new Set(members.map((m: any) => m.userId).filter(Boolean))];
          if (ids.length === 0) return [] as string[];
          const users = await database.appUser.findMany({
            where: { supabaseUserId: { in: ids } },
            select: { email: true },
          });
          return users.map((u: any) => u.email?.trim()).filter(Boolean);
        }),
      // Offboarding + org profiles now run in parallel (were sequential before)
      getOffboardingPipeline().catch(() => [] as any[]),
      database.organizationProfile.findMany({ select: { organizationId: true, paymentMethod: true, vaSeats: true, planType: true } }),
    ]);

    entries = serialize(_entries);
    organizations = _organizations;
    jotformForms = _jotformForms;
    jotformStatus = _jotformStatus;
    senders = _senders;
    // Derive zoom sessions from consolidated batch query
    zoomSessions = _batchSessions
      .filter((b: any) => b.zoomJoinUrl)
      .map((b: any) => ({ id: b.id, title: b.title, zoomJoinUrl: b.zoomJoinUrl, zoomMeetingDate: b.zoomMeetingDate, zoomDuration: b.zoomDuration, _count: b._count }));
    // Merge standalone zoom sessions into batchSessions as synthetic batch entries
    const standaloneBatches = _standaloneZoomSessions.map((os: any) => ({
      id: `standalone_${os.id}`,
      title: `Onboarding — ${os.employee.legalFirstName} ${os.employee.legalLastName}`,
      description: null,
      status: "scheduled",
      zoomMeetingId: os.zoomMeetingId,
      zoomJoinUrl: os.zoomMeetingLink,
      zoomStartUrl: null,
      zoomMeetingDate: os.zoomMeetingDate,
      zoomDuration: 30,
      calendarOrganizerEmail: null,
      googleCalendarEventId: os.googleCalendarEventId,
      onboardingSessions: [{
        id: os.id,
        googleCalendarEventId: os.googleCalendarEventId,
        employee: os.employee,
      }],
    }));
    batchSessions = [..._batchSessions, ...standaloneBatches];
    onboardingEmployees = entries
      .filter((e: any) => ["onboarding_in_progress", "onboarding_scheduled"].includes(e.employmentStatus))
      .map((e: any) => ({
        id: e.id, legalFirstName: e.legalFirstName, legalLastName: e.legalLastName,
        personalEmail: e.personalEmail, workEmail: e.workEmail,
        onboardingSessions: e.onboardingSessions?.length > 0 ? [{
          id: e.onboardingSessions[0].id,
          jotformsSent: e.onboardingSessions[0].jotformsSent,
          jotformsSentAt: e.onboardingSessions[0].startedAt,
          jotformsSentData: e.onboardingSessions[0].jotformsSentData,
        }] : [],
      }));
    combinedZoomHosts = Array.from(new Set([..._zoomHosts, ..._orgMemberEmails]));
    zoomHostByOrg = _zoomHostByOrg;

    orgPaymentMethods = Object.fromEntries(
      (_orgProfiles || []).map((p: any) => [p.organizationId, p.paymentMethod ?? "ppp"])
    );

    // Seat data: vaSeats purchased + active/onboarding count per org
    const activeCountByOrg: Record<string, number> = {};
    for (const e of entries) {
      if (!e.organizationId) continue;
      if (["active", "pre_hire", "onboarding_scheduled", "onboarding_in_progress"].includes(e.employmentStatus)) {
        activeCountByOrg[e.organizationId] = (activeCountByOrg[e.organizationId] ?? 0) + 1;
      }
    }
    orgSeatData = Object.fromEntries(
      (_orgProfiles || [])
        .filter((p: any) => p.vaSeats != null)
        .map((p: any) => [p.organizationId, { vaSeats: p.vaSeats as number, taken: activeCountByOrg[p.organizationId] ?? 0 }])
    );
    offboardingEntries = _offboardingEntries || [];
  } catch (err) {
    console.error("[Hiring Page] Failed to load data:", err);
    // Render with empty data — the page will show empty states
  }

  // Offboarding now loads in parallel above

  // Get pending hires count
  try {
    const result = await database.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM pending_hires WHERE status = 'pending'
    `;
    pendingHiresCount = Number(result[0]?.count ?? 0);
  } catch (err) {
    console.error("[Hiring Page] Pending hires count failed:", err);
  }

  return (
    <>
      <Header page="Hiring, Onboarding & Offboarding" pages={["RL Internal"]} />
      <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
        <HiringPipeline
          entries={entries}
          organizations={organizations}
          jotformForms={jotformForms}
          jotformStatus={jotformStatus}
          senders={senders}
          zoomSessions={zoomSessions.map((s) => ({ ...s, title: s.title ?? "", zoomDuration: s.zoomDuration ?? 0 }))}
          batchSessions={batchSessions}
          zoomHosts={combinedZoomHosts}
          zoomHostByOrg={zoomHostByOrg}
          onboardingEmployees={onboardingEmployees.map((e) => ({
            ...e,
            onboardingSession: e.onboardingSessions[0] ?? null,
          }))}
          offboardingEntries={offboardingEntries}
          orgPaymentMethods={orgPaymentMethods}
          orgSeatData={orgSeatData}
          fixedOrgId={session.orgId}
          pendingHiresCount={pendingHiresCount}
        />
      </div>
    </>
  );
};

export default HiringPage;
