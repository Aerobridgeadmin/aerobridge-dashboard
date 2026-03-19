import { Metadata } from "next";
import { StripeCompleteClient } from "./complete-client";

export const metadata: Metadata = {
  title: "Payment Setup — Remote Leverage",
};

export default async function StripeConnectCompletePage(props: {
  searchParams: Promise<{ status?: string; name?: string; account?: string }>;
}) {
  const searchParams = await props.searchParams;
  return (
    <StripeCompleteClient
      initialStatus={searchParams.status ?? "onboarding"}
      name={searchParams.name ?? ""}
    />
  );
}
