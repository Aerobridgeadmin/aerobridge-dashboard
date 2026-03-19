"use server";

import { requireRole } from "@repo/auth/session";
import { database } from "@repo/database";
import { revalidatePath } from "next/cache";
import { HriqError } from "@/lib/hriq/errors";

//  Get active agreement for an org 

export async function getActiveAgreement(orgId: string) {
  await requireRole("super_admin");

  return database.serviceAgreement.findFirst({
    where: { organizationId: orgId, status: "active" },
    orderBy: { createdAt: "desc" },
  });
}

//  Get fee config for pay run auto-fill 

export async function getOrgFeeConfig(orgId: string) {
  await requireRole("super_admin");

  const agreement = await database.serviceAgreement.findFirst({
    where: { organizationId: orgId, status: "active" },
    orderBy: { createdAt: "desc" },
    select: { feeType: true, feeAmount: true },
  });

  if (!agreement) return null;
  return { feeType: agreement.feeType, feeAmount: Number(agreement.feeAmount) };
}

//  List all agreements for an org 

export async function listAgreements(orgId: string) {
  await requireRole("super_admin");

  return database.serviceAgreement.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: "desc" },
  });
}

//  Create or update agreement 

export async function upsertAgreement(data: {
  id?: string;
  organizationId: string;
  name?: string;
  feeType: string;
  feeAmount: number;
  billingCycle?: string;
  notes?: string;
}) {
  const session = await requireRole("super_admin");

  if (!["percentage", "per_contractor", "flat"].includes(data.feeType)) {
    throw new HriqError("HRIQ-9903", "Invalid fee type. Must be percentage, per_contractor, or flat.");
  }
  if (data.feeAmount < 0) {
    throw new HriqError("HRIQ-9903", "Fee amount cannot be negative.");
  }

  if (data.id) {
    // Update existing
    const updated = await database.serviceAgreement.update({
      where: { id: data.id },
      data: {
        name: data.name ?? undefined,
        feeType: data.feeType,
        feeAmount: data.feeAmount.toFixed(2),
        billingCycle: data.billingCycle ?? "per_pay_run",
        notes: data.notes ?? undefined,
      },
    });
    revalidatePath("/[orgSlug]/settings", "page");
    return updated;
  }

  // Deactivate any existing active agreement for this org
  await database.serviceAgreement.updateMany({
    where: { organizationId: data.organizationId, status: "active" },
    data: { status: "paused" },
  });

  // Create new
  const created = await database.serviceAgreement.create({
    data: {
      organizationId: data.organizationId,
      name: data.name ?? "Default",
      feeType: data.feeType,
      feeAmount: data.feeAmount.toFixed(2),
      billingCycle: data.billingCycle ?? "per_pay_run",
      notes: data.notes ?? null,
      createdByUserId: session.userId,
    },
  });

  revalidatePath("/[orgSlug]/settings", "page");

  return created;
}

//  Pause / Cancel / Reactivate 

export async function updateAgreementStatus(id: string, status: "active" | "paused" | "cancelled") {
  try {
    await requireRole("super_admin");

    if (status === "active") {
      // Deactivate others for this org first
      const agreement = await database.serviceAgreement.findUnique({ where: { id }, select: { organizationId: true } });
      if (agreement) {
        await database.serviceAgreement.updateMany({
          where: { organizationId: agreement.organizationId, status: "active", id: { not: id } },
          data: { status: "paused" },
        });
      }
    }

    const updated = await database.serviceAgreement.update({
      where: { id },
      data: {
        status,
        ...(status === "cancelled" ? { endDate: new Date() } : {}),
      },
    });

    revalidatePath("/[orgSlug]/settings", "page");

    return updated;

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[service-agreements.ts:updateAgreementStatus]", _msg);
    return { error: _msg };
  }
}

//  Delete agreement 

export async function deleteAgreement(id: string) {
  try {
    await requireRole("super_admin");
    const deleted = await database.serviceAgreement.delete({ where: { id } });
    revalidatePath("/[orgSlug]/settings", "page");
    return deleted;

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[service-agreements.ts:deleteAgreement]", _msg);
    return { error: _msg };
  }
}
