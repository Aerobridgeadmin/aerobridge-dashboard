import { getHiringPipeline } from "@/app/actions/hriq/hiring";
import { getJotFormForms, getJotFormStatus } from "@/app/actions/hriq/onboarding";
import { getAvailableSenders } from "@/app/actions/hriq/send-email";
import { requireRole } from "@repo/auth/session";
import { database } from "@repo/database";
import { getConfiguredZoomHostByOrg, getConfiguredZoomHosts } from "@repo/integrations/zoom";
import type { Metadata } from "next";
import { Header } from "../../components/header";
import { HiringPipeline } from "./hiring-pipeline";

export const metadata: Metadata = { title: "Hiring & Onboarding" };

const HiringPage = async () => {
  await requireRole("super_admin", "admin");

  const [entries, organizations, jotformForms, jotformStatus, senders, zoomSessions, batchSessions, onboardingEmployees, zoomHosts, zoomHostByOrg] = await Promise.all([
    getHiringPipeline(),
    database.organization.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    getJotFormForms(),
    getJotFormStatus(),
    getAvailableSenders(),
    database.batchSession.findMany({
      where: { status: { not: "cancelled" }, zoomJoinUrl: { not: null } },
      select: { id: true, title: true, zoomJoinUrl: true, zoomMeetingDate: true, zoomDuration: true, _count: { select: { onboardingSessions: true } } },
      orderBy: { createdAt: "desc" },
    }),
    database.batchSession.findMany({
      where: { status: { not: "cancelled" } },
      select: {
        id: true, title: true, description: true, status: true,
        zoomMeetingId: true, zoomJoinUrl: true, zoomStartUrl: true, zoomMeetingDate: true, zoomDuration: true,
        onboardingSessions: {
          select: { id: true, employee: { select: { id: true, legalFirstName: true, legalLastName: true, personalEmail: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    database.employee.findMany({
      where: { employmentStatus: { in: ["onboarding_in_progress", "onboarding_scheduled"] } },
      select: {
        id: true, legalFirstName: true, legalLastName: true, personalEmail: true, workEmail: true,
        onboardingSessions: {
          select: { id: true, jotformsSent: true, jotformsSentAt: true, jotformsSentData: true },
          take: 1, orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { legalFirstName: "asc" },
    }),
    Promise.resolve(getConfiguredZoomHosts()),
    Promise.resolve(getConfiguredZoomHostByOrg()),
  ]);

  return (
    <>
      <Header page="Hiring & Onboarding" pages={["RL Internal"]} />
      <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
        <HiringPipeline
          entries={entries}
          organizations={organizations}
          jotformForms={jotformForms}
          jotformStatus={jotformStatus}
          senders={senders}
          zoomSessions={zoomSessions}
          batchSessions={batchSessions}
          zoomHosts={zoomHosts}
          zoomHostByOrg={zoomHostByOrg}
          onboardingEmployees={onboardingEmployees.map((e) => ({
            ...e,
            onboardingSession: e.onboardingSessions[0] ?? null,
          }))}
        />
      </div>
    </>
  );
};

export default HiringPage;
