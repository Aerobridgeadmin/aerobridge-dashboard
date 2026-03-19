import { currentUser } from "@repo/auth/server";
import { getSessionContext } from "@repo/auth/session";
import { database } from "@repo/database";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ContractorPaymentGateClient } from "./contractor-payment-gate-client";

export const metadata: Metadata = {
  title: "Payment Setup — Remote Leverage",
  description: "Set up your payment account to receive contractor payments.",
};

export default async function ContractorPaymentGatePage() {
  const [user, session] = await Promise.all([
    currentUser(),
    getSessionContext(),
  ]);

  if (!user || !session) {
    redirect("/sign-in");
  }

  const orgId = session.orgId;
  if (!orgId) {
    redirect("/");
  }

  // Only contractors (member/va role) reach this page — admins skip in layout
  const RL_ORG_ID = process.env.RL_ORGANIZATION_ID ?? "org_rl_001";
  if (session.orgRole === "super_admin" || session.orgRole === "admin") {
    const org = await database.organization.findUnique({
      where: { id: orgId },
      select: { slug: true },
    });
    redirect(`/${org?.slug || ""}`);
  }

  // Find the employee linked to this user
  const employee = await database.employee.findFirst({
    where: { linkedUserId: user.id },
    select: {
      id: true,
      legalFirstName: true,
      legalLastName: true,
      personalEmail: true,
      workEmail: true,
      stripeAccountId: true,
      stripeAccountStatus: true,
      wiseRecipientId: true,
      wiseRecipientCurrency: true,
      wiseGateRequired: true,
      cadanaGateRequired: true,
      cadanaSyncedAt: true,
      organizationId: true,
      organization: { select: { name: true, slug: true } },
      country: true,
      currency: true,
      bankName: true,
      bankAccountNumber: true,
      bankAccountName: true,
      bankSwiftCode: true,
      bankRoutingNumber: true,
      streetAddress: true,
      city: true,
      stateProvince: true,
      postalCode: true,
    },
  });

  if (!employee) {
    const org = await database.organization.findUnique({
      where: { id: orgId },
      select: { slug: true },
    });
    redirect(`/${org?.slug || ""}`);
  }

  // Get org payment method
  const orgProfile = await database.organizationProfile.findUnique({
    where: { organizationId: employee.organizationId ?? orgId },
    select: { paymentMethod: true },
  });

  const paymentMethod = orgProfile?.paymentMethod ?? "ppp";
  const isRLEmployee = (employee.organizationId ?? orgId) === RL_ORG_ID;

  // Determine what setup is needed
  const needsStripe = !isRLEmployee && (paymentMethod === "ppp" || paymentMethod === "both") &&
    !["verified", "restricted"].includes(employee.stripeAccountStatus ?? "");
  const needsWise = employee.wiseGateRequired === true;
  const needsCadana = employee.cadanaGateRequired === true;

  if (!needsStripe && !needsWise && !needsCadana) {
    redirect(`/${employee.organization?.slug || ""}`);
  }

  return (
    <ContractorPaymentGateClient
      employeeId={employee.id}
      contractorName={employee.legalFirstName}
      orgName={employee.organization?.name ?? "your organization"}
      orgSlug={employee.organization?.slug ?? ""}
      paymentMethod={paymentMethod}
      needsStripe={needsStripe}
      needsWise={needsWise}
      needsCadana={needsCadana}
      hasStripeAccount={!!employee.stripeAccountId}
      stripeStatus={employee.stripeAccountStatus ?? "none"}
      hasWiseRecipient={employee.wiseRecipientId !== null && employee.wiseRecipientId !== undefined}
      hasCadanaSetup={employee.cadanaSyncedAt !== null}
      wisePrefill={{
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
