import { getBatchSessions, getJotFormForms } from "@/app/actions/hriq/onboarding";
import { getAvailableSenders } from "@/app/actions/hriq/send-email";
import { requireOrg } from "@repo/auth/session";
import { database } from "@repo/database";
import type { Metadata } from "next";
import { Header } from "../../components/header";
import { BatchOnboarding } from "./batch-onboarding";

export const metadata: Metadata = {
  title: "Onboarding",
  description: "Manage batch onboarding sessions",
};

const OnboardingPage = async () => {
  const session = await requireOrg();

  const [batchSessions, employees, jotformForms, senders] = await Promise.all([
    getBatchSessions(),
    database.employee.findMany({
      where: { organizationId: session.orgId, employmentStatus: "pre_hire" },
      orderBy: { createdAt: "desc" },
    }),
    getJotFormForms(),
    getAvailableSenders(),
  ]);

  const onboardingEmployees = await database.employee.findMany({
    where: {
      organizationId: session.orgId,
      employmentStatus: { in: ["onboarding_in_progress", "onboarding_scheduled"] },
    },
    select: {
      id: true,
      legalFirstName: true,
      legalLastName: true,
      personalEmail: true,
      workEmail: true,
      onboardingSessions: {
        select: { id: true, jotformsSent: true, jotformsSentAt: true, jotformsSentData: true },
        take: 1,
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { legalFirstName: "asc" },
  });

  const mapped = onboardingEmployees.map((e: any) => ({
    id: e.id,
    legalFirstName: e.legalFirstName,
    legalLastName: e.legalLastName,
    personalEmail: e.personalEmail,
    workEmail: e.workEmail,
    onboardingSession: e.onboardingSessions[0] ?? null,
  }));

  return (
    <>
      <Header page="Onboarding" pages={[session.orgRole === "super_admin" ? "RL Internal" : "Client Portal"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <BatchOnboarding
          batchSessions={batchSessions}
          availableEmployees={employees}
          onboardingEmployees={mapped}
          jotformForms={jotformForms}
          senders={senders}
        />
      </div>
    </>
  );
};

export default OnboardingPage;
