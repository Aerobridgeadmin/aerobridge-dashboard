import { getEmployeeForWiseSetup } from "@/app/actions/hriq/wise-setup";
import type { Metadata } from "next";
import { WiseSetupForm } from "./wise-setup-form";

export const metadata: Metadata = {
  title: "Set Up Payment Details — Remote Leverage",
  description: "Set up your Wise payment details to receive contractor payments.",
};

export default async function WiseSetupPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  let employee;
  try {
    employee = await getEmployeeForWiseSetup(token);
  } catch {
    employee = null;
  }

  if (!employee) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <img src="/logo.png" alt="Remote Leverage" className="mx-auto mb-4 h-16 w-16" />
          <h1 className="text-xl font-bold text-white">Link Not Available</h1>
          <p className="mt-2 text-sm text-gray-400">
            This link is no longer valid. Please contact your onboarding coordinator if you need assistance.
          </p>
        </div>
      </div>
    );
  }

  // If Wise is already set up (real recipient, not placeholder -1), show success
  if (employee.wiseRecipientId && employee.wiseRecipientId !== -1) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-900/50 text-emerald-400">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          </div>
          <img src="/logo.png" alt="Remote Leverage" className="mx-auto mb-3 h-12 w-12 rounded-lg" />
          <h1 className="text-xl font-bold text-white">Payment Details Already Set Up</h1>
          <p className="mt-2 text-sm text-gray-400">
            Thank you, {employee.legalFirstName}! Your payment details are already configured. No further action is needed.
          </p>
          <p className="mt-4 text-xs text-gray-600">
            If you need to make changes, please contact your team.
          </p>
        </div>
      </div>
    );
  }

  return (
    <WiseSetupForm
      token={token}
      contractorName={employee.legalFirstName}
      prefill={{
        accountHolderName: employee.bankAccountName ?? `${employee.legalFirstName} ${employee.legalLastName ?? ""}`.trim(),
        country: employee.country ?? "",
        currency: employee.wiseRecipientCurrency ?? employee.currency ?? "",
        bankName: employee.bankName ?? "",
        accountNumber: employee.bankAccountNumber ?? "",
        swiftCode: employee.bankSwiftCode ?? "",
        routingNumber: employee.bankRoutingNumber ?? "",
        streetAddress: employee.streetAddress ?? "",
        city: employee.city ?? "",
        state: employee.stateProvince ?? "",
        postalCode: employee.postalCode ?? "",
      }}
    />
  );
}
