import { getOnboardingByToken } from "@/app/actions/hriq/org-onboarding";
import type { Metadata } from "next";
import { OrgOnboardForm } from "./org-onboard-form";
import { serialize } from "@/lib/hriq/serialize";

export const metadata: Metadata = {
  title: "Client Onboarding — Remote Leverage",
  description: "Complete your organization setup to get started with Remote Leverage",
};

export default async function OrgOnboardPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  let session;
  try {
    session = await getOnboardingByToken(token);
  } catch {
    session = null;
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-purple-50 dark:from-gray-950 dark:to-purple-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <img src="/logo.png" alt="Remote Leverage" className="mx-auto mb-4 h-16 w-16 rounded-xl shadow" />
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Link Not Available</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            This onboarding link is no longer valid or has expired. Please contact your Remote Leverage representative for a new link.
          </p>
        </div>
      </div>
    );
  }

  if (session.status === "completed") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-purple-50 dark:from-gray-950 dark:to-purple-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            </div>
            <img src="/logo.png" alt="Remote Leverage" className="mx-auto mb-3 h-12 w-12 rounded-lg shadow" />
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Onboarding Complete</h1>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Thank you{session.companyName ? `, ${session.companyName}` : ""}! Your information has been submitted successfully.
            </p>
          </div>
          <div className="mt-6 rounded-xl border border-orange-200 bg-orange-50 dark:bg-orange-900/20 dark:border-orange-800 p-4 text-left">
            <h3 className="text-sm font-semibold text-orange-900 dark:text-orange-100 mb-2">What happens next</h3>
            <div className="space-y-2 text-xs text-orange-700 dark:text-orange-300">
              <p>1. We&apos;re setting up your workspace (usually within 1 business day)</p>
              <p>2. You&apos;ll receive login credentials by email</p>
              <p>3. Quick identity verification, then you&apos;re ready to manage your team</p>
            </div>
          </div>
          <div className="mt-3 rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20 p-4 text-left">
            <h3 className="text-sm font-semibold text-purple-900 dark:text-purple-100 mb-1">What we handle for you</h3>
            <p className="text-xs text-purple-700 dark:text-purple-300">Time tracking, payroll processing, HR and document management, and a live reporting dashboard — all managed by our team.</p>
          </div>
          <p className="mt-4 text-center text-xs text-gray-400 dark:text-gray-500">Questions? Reply to the email you received and we&apos;ll be happy to help.</p>
        </div>
      </div>
    );
  }

  return <OrgOnboardForm session={serialize(session)} />;
}
