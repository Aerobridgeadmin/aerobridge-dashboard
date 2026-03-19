"use server";

import { database } from "@repo/database";
import { requireRole } from "@repo/auth/session";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { HriqError } from "@/lib/hriq/errors";

// ─── Schedule ACH Collection for a pay period ────────────────────────────────

/**
 * Called when a pay period closes (timesheets approved, payroll generated).
 * Creates an AchCollection record for each COR client org that has approved
 * timesheets in this period, scheduled for 3 business days before payout.
 *
 * Safe to call multiple times — upserts by (organizationId, payPeriod).
 */
export async function scheduleAchCollections(opts: {
  payPeriod: string;       // "A-2026-03" or "B-2026-03"
  organizationId?: string; // if set, only schedule for this org; else all COR orgs
}): Promise<{ scheduled: number; skipped: number; errors: string[] }> {
  await requireRole("super_admin");

  const { subtractBusinessDays, getPayoutDate } = await import(
    "@repo/integrations/quickbooks-payments"
  );

  const payoutDate = getPayoutDate(opts.payPeriod);
  const scheduledDate = subtractBusinessDays(payoutDate, 3);

  // Find COR client orgs that have approved payments in this period
  const [cycle, year, month] = opts.payPeriod.split("-");
  const y = parseInt(year!);
  const m = parseInt(month!) - 1;

  let periodStart: Date, periodEnd: Date;
  if (cycle === "A") {
    periodStart = new Date(y, m, 6);
    periodEnd = new Date(y, m, 20, 23, 59, 59);
  } else {
    periodStart = new Date(y, m, 21);
    // end = 5th of next month
    const nm = m + 1 > 11 ? 0 : m + 1;
    const ny = m + 1 > 11 ? y + 1 : y;
    periodEnd = new Date(ny, nm, 5, 23, 59, 59);
  }

  // Find all client orgs with COR payment method that have payments in this period
  const orgFilter = opts.organizationId ? { id: opts.organizationId } : undefined;

  const clientOrgs = await database.organization.findMany({
    where: {
      ...(orgFilter ?? {}),
      // Payments in this period exist
      employees: {
        some: {
          payments: {
            some: {
              periodStart: { gte: periodStart },
              periodEnd: { lte: periodEnd },
              status: { in: ["pending", "processing", "completed"] },
            },
          },
        },
      },
    },
    select: {
      id: true,
      name: true,
      qbBankAccountToken: true,
      profile: { select: { paymentMethod: true } },
      employees: {
        select: {
          payments: {
            where: {
              periodStart: { gte: periodStart },
              periodEnd: { lte: periodEnd },
              status: { in: ["pending", "processing", "completed"] },
            },
            select: { amount: true },
          },
        },
      },
    } as any,
  });

  let scheduled = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const org of clientOrgs) {
    const pm = (org as any).profile?.paymentMethod ?? "";
    if (pm !== "cor" && pm !== "COR") {
      skipped++;
      continue;
    }

    // Sum all contractor amounts for this org in this period
    let total = 0;
    for (const emp of (org as any).employees) {
      for (const p of emp.payments) {
        total += Number(p.amount);
      }
    }

    if (total <= 0) {
      skipped++;
      continue;
    }

    if (!(org as any).qbBankAccountToken) {
      errors.push(
        `${org.name}: no QB bank account token on file — cannot schedule ACH collection`,
      );
      skipped++;
      continue;
    }

    try {
      const orgId = String(org.id);
      await database.achCollection.upsert({
        where: {
          organizationId_payPeriod: {
            organizationId: orgId,
            payPeriod: opts.payPeriod,
          },
        },
        create: {
          organizationId: orgId,
          payPeriod: opts.payPeriod,
          amount: total.toFixed(2),
          scheduledDate,
          payoutDate,
          status: "SCHEDULED",
          idempotencyKey: randomUUID(),
        },
        update: {
          amount: total.toFixed(2),
          scheduledDate,
          payoutDate,
          // Only reset if still SCHEDULED (don't overwrite in-progress)
        },
      });
      scheduled++;
    } catch (err: any) {
      errors.push(`${org.name}: ${err.message}`);
    }
  }

  revalidatePath("/", "layout");
  return { scheduled, skipped, errors };
}

// ─── Tokenize client bank account ────────────────────────────────────────────

/**
 * Store a QB Payments bank account token for a COR client org.
 * Called during client onboarding after they provide bank details.
 */
export async function saveClientBankToken(opts: {
  organizationId: string;
  routingNumber: string;
  accountNumber: string;
  accountType: "PERSONAL_CHECKING" | "PERSONAL_SAVINGS" | "BUSINESS_CHECKING" | "BUSINESS_SAVINGS";
  accountName: string;
  last4: string;
}): Promise<{ success: boolean; error?: string }> {
  await requireRole("super_admin");

  try {
    const { getQBAccessToken } = await import("./quickbooks");
    const { tokenizeBankAccount } = await import(
      "@repo/integrations/quickbooks-payments"
    );

    const accessToken = await getQBAccessToken();
    if (!accessToken) throw new Error("QuickBooks not connected");

    const idempotencyKey = randomUUID();
    const { token } = await tokenizeBankAccount(
      {
        routingNumber: opts.routingNumber,
        accountNumber: opts.accountNumber,
        accountType: opts.accountType,
        name: opts.accountName,
      },
      accessToken,
      idempotencyKey,
    );

    await database.organization.update({
      where: { id: opts.organizationId },
      data: {
        qbBankAccountToken: token,
        qbBankAccountLast4: opts.last4,
        achAuthorizedAt: new Date(),
      } as any,
    });

    revalidatePath("/", "layout");
    return { success: true };
  } catch (err: any) {
    console.error("[ACH] saveClientBankToken failed:", err);
    return { success: false, error: err.message };
  }
}

// ─── List ACH Collections (admin view) ───────────────────────────────────────

export type AchCollectionRow = {
  id: string;
  organizationId: string;
  orgName: string;
  payPeriod: string;
  amount: string;
  scheduledDate: string;
  payoutDate: string;
  status: string;
  qbChargeId: string | null;
  retryCount: number;
  failureReason: string | null;
  collectedAt: string | null;
};

export async function listAchCollections(opts?: {
  status?: string;
  upcoming?: boolean;
}): Promise<AchCollectionRow[]> {
  await requireRole("super_admin");

  const now = new Date();
  const thirtyDaysOut = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const rows = await database.achCollection.findMany({
    where: {
      ...(opts?.status ? { status: opts.status } : {}),
      ...(opts?.upcoming
        ? { scheduledDate: { lte: thirtyDaysOut }, status: { in: ["SCHEDULED", "PROCESSING", "FAILED"] } }
        : {}),
    },
    include: { organization: { select: { name: true } } },
    orderBy: { scheduledDate: "asc" },
    take: 100,
  });

  return rows.map((r: any) => ({
    id: r.id,
    organizationId: r.organizationId,
    orgName: (r as any).organization?.name ?? "",
    payPeriod: r.payPeriod,
    amount: r.amount,
    scheduledDate: r.scheduledDate.toISOString(),
    payoutDate: r.payoutDate.toISOString(),
    status: r.status,
    qbChargeId: r.qbChargeId ?? null,
    retryCount: r.retryCount,
    failureReason: r.failureReason ?? null,
    collectedAt: r.collectedAt?.toISOString() ?? null,
  }));
}

// ─── Retry a failed collection (manual) ──────────────────────────────────────

export async function retryAchCollection(
  collectionId: string,
): Promise<{ success: boolean; error?: string }> {
  await requireRole("super_admin");

  const col = await database.achCollection.findUnique({
    where: { id: collectionId },
  });
  if (!col) throw new HriqError("HRIQ-0831", "ACH collection not found");
  if (!["FAILED", "PERMANENTLY_FAILED"].includes(col.status)) {
    throw new HriqError(
      "HRIQ-0832",
      `Cannot retry collection in status ${col.status}`,
    );
  }

  const { subtractBusinessDays } = await import(
    "@repo/integrations/quickbooks-payments"
  );

  await database.achCollection.update({
    where: { id: collectionId },
    data: {
      status: "SCHEDULED",
      scheduledDate: subtractBusinessDays(new Date(), -1), // tomorrow
      failureReason: null,
    },
  });

  revalidatePath("/", "layout");
  return { success: true };
}
