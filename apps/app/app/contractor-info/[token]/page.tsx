import { getContractorForInfoForm } from "@/app/actions/hriq/contractor-info";
import type { Metadata } from "next";
import { ContractorInfoForm } from "./contractor-info-form";

export const metadata: Metadata = {
  title: "Complete Your Information — Remote Leverage",
  description: "Submit your personal details, banking information, and government ID",
};

export default async function ContractorInfoPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  let employee;
  try {
    employee = await getContractorForInfoForm(token);
  } catch {
    employee = null;
  }

  if (!employee) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <img src="/logo.png" alt="Remote Leverage" className="mx-auto mb-4 h-16 w-16" />
          <h1 className="text-xl font-bold">Form Not Available</h1>
          <p className="mt-2 text-sm text-gray-500">
            This link is no longer valid. Please contact your onboarding coordinator if you need assistance.
          </p>
        </div>
      </div>
    );
  }

  // One-time use: block access after successful submission (pending_review or approved)
  // Still allow re-entry if rejected (admin asked them to fix info)
  if (employee.infoApprovalStatus === "pending_review" || employee.infoApprovalStatus === "approved") {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          </div>
          <img src="/logo.png" alt="Remote Leverage" className="mx-auto mb-3 h-12 w-12 rounded-lg" />
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {employee.infoApprovalStatus === "approved" ? "Information Approved" : "Information Already Submitted"}
          </h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {employee.infoApprovalStatus === "approved"
              ? `Thank you, ${employee.legalFirstName}! Your information has been reviewed and approved. No further action is needed.`
              : `Thank you, ${employee.legalFirstName}! Your information has been submitted and is being reviewed by our team. You'll be notified once everything is approved.`
            }
          </p>
          <p className="mt-4 text-xs text-gray-400 dark:text-gray-600">
            If you need to make changes, please contact your onboarding coordinator.
          </p>
        </div>
      </div>
    );
  }

  return <ContractorInfoForm employee={employee} token={token} />;
}
