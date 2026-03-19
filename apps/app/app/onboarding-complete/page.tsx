import type { Metadata } from "next";
import Image from "next/image";

export const metadata: Metadata = {
  title: "Onboarding Complete — Remote Leverage",
  description: "Thank you for completing your onboarding forms.",
};

export default function OnboardingCompletePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-orange-50 via-white to-purple-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 px-4">
      <div className="w-full max-w-md text-center">
        <Image
          src="/logo.png"
          alt="Remote Leverage"
          width={64}
          height={64}
          className="mx-auto mb-6 rounded-xl"
        />
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-8 w-8 text-green-600 dark:text-green-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          You&apos;re All Set!
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
          Thank you for completing your onboarding forms. Our team will review
          your information and reach out if anything else is needed.
        </p>
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4 text-left dark:border-gray-700 dark:bg-gray-800">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            What happens next?
          </p>
          <ul className="mt-2 space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-orange-500"></span>
              Our team reviews your submitted information
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-orange-500"></span>
              You&apos;ll receive your dashboard login credentials once approved
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-orange-500"></span>
              Check your email for Time Doctor and Slack invites before your start date
            </li>
          </ul>
        </div>
        <p className="mt-6 text-xs text-gray-400 dark:text-gray-500">
          Questions? Contact{" "}
          <a
            href="mailto:maria@remoteleverage.com"
            className="text-orange-500 underline underline-offset-2 hover:text-orange-600"
          >
            maria@remoteleverage.com
          </a>
        </p>
      </div>
    </div>
  );
}
