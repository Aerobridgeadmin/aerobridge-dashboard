"use server";

import { requireRole } from "@repo/auth/session";
import { database } from "@repo/database";

export type OrgBillingRow = {
  orgId: string;
  orgName: string;
  slug: string;
  paymentMethod: string | null;
  // Stripe Billing (Checkout) — client pays RL
  stripeCustomerId: string | null;
  // Stripe Connect (PPP client payout account) — RL pays contractors via platform
  stripeConnectAccountId: string | null;
  stripeConnectStatus: string | null;
  adminEmail: string | null;
};

export type ContractorPaymentRow = {
  employeeId: string;
  employeeNumber: string | null;
  name: string;
  email: string | null;
  orgId: string;
  orgName: string;
  paymentMethod: string;
  // Stripe Connect Express (PPP) — contractor receives payouts
  stripeAccountId: string | null;
  stripeAccountStatus: string | null;
  // Wise (COR) — contractor receives international transfers
  wiseRecipientId: number | null;
  wiseRecipientCurrency: string | null;
  wiseRecipientSyncedAt: Date | null;
  hasBankDetails: boolean;
};

export type PaymentsSettingsData = {
  orgs: OrgBillingRow[];
  contractors: ContractorPaymentRow[];
};

export async function getPaymentsSettingsData(): Promise<PaymentsSettingsData> {
  await requireRole("super_admin");

  const [orgs, contractors] = await Promise.all([
    database.organization.findMany({
      where: { id: { not: process.env.RL_ORGANIZATION_ID ?? "org_rl_001" } },
      select: {
        id: true,
        name: true,
        slug: true,
        stripeCustomerId: true,
        stripeConnectAccountId: true,
        stripeConnectStatus: true,
        profile: {
          select: { paymentMethod: true, adminEmail: true },
        },
      },
      orderBy: { name: "asc" },
    }),
    database.employee.findMany({
      where: {
        employmentStatus: { in: ["active", "onboarding_in_progress"] },
        organization: {
          profile: {
            paymentMethod: { in: ["ppp", "cor", "both"] },
          },
          id: { not: process.env.RL_ORGANIZATION_ID ?? "org_rl_001" },
        },
      },
      select: {
        id: true,
        employeeNumber: true,
        legalFirstName: true,
        legalLastName: true,
        personalEmail: true,
        workEmail: true,
        organizationId: true,
        stripeAccountId: true,
        stripeAccountStatus: true,
        wiseRecipientId: true,
        wiseRecipientCurrency: true,
        wiseRecipientSyncedAt: true,
        bankAccountNumber: true,
        organization: {
          select: {
            name: true,
            profile: { select: { paymentMethod: true } },
          },
        },
      },
      orderBy: [{ organization: { name: "asc" } }, { legalLastName: "asc" }],
    }),
  ]);

  return {
    orgs: orgs.map(o => ({
      orgId: o.id,
      orgName: o.name,
      slug: o.slug,
      paymentMethod: o.profile?.paymentMethod ?? null,
      stripeCustomerId: o.stripeCustomerId ?? null,
      stripeConnectAccountId: o.stripeConnectAccountId ?? null,
      stripeConnectStatus: o.stripeConnectStatus ?? null,
      adminEmail: o.profile?.adminEmail ?? null,
    })),
    contractors: contractors.map(c => ({
      employeeId: c.id,
      employeeNumber: c.employeeNumber ?? null,
      name: `${c.legalFirstName} ${c.legalLastName}`,
      email: c.personalEmail ?? c.workEmail ?? null,
      orgId: c.organizationId ?? "",
      orgName: c.organization?.name ?? "Unknown",
      paymentMethod: c.organization?.profile?.paymentMethod ?? "ppp",
      stripeAccountId: c.stripeAccountId ?? null,
      stripeAccountStatus: c.stripeAccountStatus ?? null,
      wiseRecipientId: c.wiseRecipientId ?? null,
      wiseRecipientCurrency: c.wiseRecipientCurrency ?? null,
      wiseRecipientSyncedAt: c.wiseRecipientSyncedAt ?? null,
      hasBankDetails: !!c.bankAccountNumber,
    })),
  };
}
