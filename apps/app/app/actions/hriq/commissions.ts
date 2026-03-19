"use server";

import { requireRole, requireOrg } from "@repo/auth/session";
import { database } from "@repo/database";
import { revalidatePath } from "next/cache";
import { HriqError } from "@/lib/hriq/errors";

// Commission tier → rate mapping
const TIER_RATES: Record<string, number> = {
  standard: 0.006,     // 0.6%
  bundle: 0.01,        // 1.0%
  ae: 0.012,           // 1.2%
  bundle_ae: 0.02,     // 2.0%
  ppp: 0.02,           // 2.0%
  bundle_fill: 0,      // $20 flat (not percentage-based)
};

const BUNDLE_FILL_FLAT = 20;

function getCommissionRate(tier: string): number {
  return TIER_RATES[tier] ?? 0.006;
}

function calculateCommission(tier: string, revenueAmount: number): { rate: number; amount: number } {
  if (tier === "bundle_fill") {
    return { rate: 0, amount: BUNDLE_FILL_FLAT };
  }
  const rate = getCommissionRate(tier);
  return { rate, amount: Number((revenueAmount * rate).toFixed(2)) };
}

/**
 * List commissions with filters
 */
export async function listCommissions(filters?: {
  status?: string;
  employeeId?: string;
  commissionTier?: string;
  dateFrom?: string;
  dateTo?: string;
  take?: number;
  skip?: number;
}) {
  const session = await requireOrg();
  if (!["super_admin", "manager"].includes(session.orgRole)) {
    throw new HriqError("HRIQ-0105", "Insufficient permissions");
  }

  const where: any = {};
  if (filters?.status && filters.status !== "all") where.status = filters.status;
  if (filters?.employeeId) where.employeeId = filters.employeeId;
  if (filters?.commissionTier) where.commissionTier = filters.commissionTier;
  if (filters?.dateFrom || filters?.dateTo) {
    where.createdAt = {};
    if (filters.dateFrom) where.createdAt.gte = new Date(filters.dateFrom);
    if (filters.dateTo) where.createdAt.lte = new Date(filters.dateTo + "T23:59:59Z");
  }

  // For managers, only show commissions for employees in RL org
  if (session.orgRole === "manager") {
    const managerEmp = await database.employee.findFirst({
      where: { linkedUserId: session.userId },
      select: { id: true },
    });
    if (managerEmp) {
      where.employee = { managerId: managerEmp.id };
    }
  }

  const [commissions, total] = await Promise.all([
    database.commission.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            legalFirstName: true,
            legalLastName: true,
            preferredName: true,
            department: true,
            photoUrl: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: filters?.take ?? 100,
      skip: filters?.skip ?? 0,
    }),
    database.commission.count({ where }),
  ]);

  return { commissions, total };
}

/**
 * Create a single commission entry
 */
export async function createCommission(data: {
  employeeId: string;
  commissionTier: string;
  clientName?: string;
  revenueAmount?: number;
  commissionAmount?: number; // override auto-calculated
  qbPaymentRef?: string;
  qbVendorName?: string;
  qbPaymentAmount?: number;
  qbPaymentDate?: string;
  qbInvoiceNumber?: string;
  description?: string;
  notes?: string;
}) {
  const session = await requireOrg();
  if (!["super_admin", "manager"].includes(session.orgRole)) {
    throw new HriqError("HRIQ-0105", "Insufficient permissions to create commissions");
  }

  const employee = await database.employee.findFirst({
    where: { id: data.employeeId },
    select: { id: true, legalFirstName: true, legalLastName: true },
  });
  if (!employee) throw new HriqError("HRIQ-0201", "Employee not found");

  const tier = data.commissionTier || "standard";
  const revenue = data.revenueAmount ?? 0;
  const calc = calculateCommission(tier, revenue);
  const amount = data.commissionAmount ?? calc.amount;

  const commission = await database.commission.create({
    data: {
      commissionType: "hiring_manager",
      employeeId: data.employeeId,
      commissionTier: tier,
      clientName: data.clientName,
      revenueAmount: revenue || undefined,
      commissionRate: calc.rate,
      commissionAmount: amount,
      qbPaymentRef: data.qbPaymentRef,
      qbVendorName: data.qbVendorName,
      qbPaymentAmount: data.qbPaymentAmount,
      qbPaymentDate: data.qbPaymentDate ? new Date(data.qbPaymentDate) : undefined,
      qbInvoiceNumber: data.qbInvoiceNumber,
      description: data.description,
      notes: data.notes,
      assignedByUserId: session.userId,
      assignedByName: session.name ?? undefined,
    },
  });

  revalidatePath("/[orgSlug]/commissions", "page");
  return commission;
}

/**
 * Bulk create commissions from parsed spreadsheet data
 */
export async function bulkCreateCommissions(entries: {
  employeeName: string; // first name match
  clientName: string;
  revenueAmount: number;
  commissionTier: string;
  commissionAmount: number;
  date?: string;
}[]) {
  const session = await requireOrg();
  if (!["super_admin", "manager"].includes(session.orgRole)) {
    throw new HriqError("HRIQ-0105", "Insufficient permissions to create commissions");
  }
  const employees = await database.employee.findMany({
    where: { employmentStatus: { in: ["active", "onboarding_in_progress"] } },
    select: { id: true, legalFirstName: true, preferredName: true },
  });

  const results: { created: number; skipped: number; errors: string[] } = {
    created: 0,
    skipped: 0,
    errors: [],
  };

  for (const entry of entries) {
    const name = entry.employeeName.toLowerCase().trim();
    const match = employees.find(
      (e) =>
        e.legalFirstName?.toLowerCase() === name ||
        e.preferredName?.toLowerCase() === name
    );

    if (!match) {
      results.errors.push(`No employee match for "${entry.employeeName}"`);
      results.skipped++;
      continue;
    }

    try {
      const tier = entry.commissionTier || "standard";
      const calc = calculateCommission(tier, entry.revenueAmount);

      await database.commission.create({
        data: {
          commissionType: "hiring_manager",
          employeeId: match.id,
          commissionTier: tier,
          clientName: entry.clientName,
          revenueAmount: entry.revenueAmount || undefined,
          commissionRate: calc.rate,
          commissionAmount: entry.commissionAmount || calc.amount,
          qbPaymentDate: entry.date ? new Date(entry.date) : undefined,
          assignedByUserId: session.userId,
          assignedByName: session.name ?? undefined,
        },
      });
      results.created++;
    } catch (err: any) {
      results.errors.push(`Failed for ${entry.employeeName}: ${err.message}`);
      results.skipped++;
    }
  }

  revalidatePath("/[orgSlug]/commissions", "page");
  return results;
}

/**
 * Approve a commission → adds as bonus to contractor's current timesheet
 */
export async function approveCommission(commissionId: string) {
  const session = await requireOrg();
  if (!["super_admin", "manager"].includes(session.orgRole)) {
    throw new HriqError("HRIQ-0105", "Insufficient permissions to approve");
  }

  const commission = await database.commission.findUnique({
    where: { id: commissionId },
    include: { employee: { select: { id: true, legalFirstName: true, legalLastName: true } } },
  });

  if (!commission) throw new HriqError("HRIQ-0901", "Commission not found");
  if (commission.status !== "pending") {
    throw new HriqError("HRIQ-0902", `Cannot approve a ${commission.status} commission`);
  }

  // Find the current open timesheet for this employee
  const currentPeriod = await database.timesheetPeriod.findFirst({
    where: { status: "open" },
    orderBy: { endDate: "desc" },
  });

  let timesheetId: string | null = null;

  if (currentPeriod) {
    // Find or create a timesheet submission for this period
    let submission = await database.timesheetSubmission.findFirst({
      where: { employeeId: commission.employeeId, periodId: currentPeriod.id },
    });

    if (submission) {
      // Append commission as a bonus entry
      const existingBonuses = Array.isArray(submission.bonuses) ? (submission.bonuses as any[]) : [];
      const tierLabel = commission.commissionTier === "bundle_fill" ? "Bundle Fill" :
        commission.commissionTier === "bundle_ae" ? "Bundle+AE" :
        commission.commissionTier.toUpperCase();
      const newBonus = {
        description: `HM Commission (${tierLabel}) — ${commission.clientName ?? "Client"}`,
        amount: Number(commission.commissionAmount),
      };
      const updatedBonuses = [...existingBonuses, newBonus];
      const newBonusTotal = updatedBonuses.reduce((s: number, b: any) => s + (b.amount || 0), 0);

      await database.timesheetSubmission.update({
        where: { id: submission.id },
        data: {
          bonuses: updatedBonuses,
          bonusTotal: newBonusTotal,
        },
      });
      timesheetId = submission.id;
    }
  }

  // Mark commission as approved
  await database.commission.update({
    where: { id: commissionId },
    data: {
      status: "approved",
      approvedByUserId: session.userId,
      approvedByName: session.name ?? undefined,
      approvedAt: new Date(),
      timesheetSubmissionId: timesheetId,
    },
  });

  revalidatePath("/[orgSlug]/commissions", "page");
  revalidatePath("/[orgSlug]/timesheets", "page");

  const empName = `${commission.employee.legalFirstName ?? ""} ${commission.employee.legalLastName ?? ""}`.trim();
  return {
    approved: true,
    employeeName: empName,
    amount: Number(commission.commissionAmount),
    addedToTimesheet: !!timesheetId,
  };
}

/**
 * Bulk approve multiple commissions
 */
export async function bulkApproveCommissions(commissionIds: string[]) {
  const session = await requireOrg();
  if (!["super_admin", "manager"].includes(session.orgRole)) {
    throw new HriqError("HRIQ-0105", "Insufficient permissions");
  }

  let approved = 0;
  const errors: string[] = [];

  for (const id of commissionIds) {
    try {
      await approveCommission(id);
      approved++;
    } catch (err: any) {
      errors.push(`${id}: ${err.message}`);
    }
  }

  return { approved, failed: errors.length, errors };
}

/**
 * Reject a commission
 */
export async function rejectCommission(commissionId: string, reason?: string) {
  const session = await requireOrg();
  if (!["super_admin", "manager"].includes(session.orgRole)) {
    throw new HriqError("HRIQ-0105", "Insufficient permissions");
  }

  const commission = await database.commission.findUnique({
    where: { id: commissionId },
  });
  if (!commission) throw new HriqError("HRIQ-0901", "Commission not found");
  if (commission.status !== "pending") {
    throw new HriqError("HRIQ-0902", `Cannot reject a ${commission.status} commission`);
  }

  await database.commission.update({
    where: { id: commissionId },
    data: {
      status: "rejected",
      rejectedAt: new Date(),
      rejectionReason: reason,
    },
  });

  revalidatePath("/[orgSlug]/commissions", "page");
  return { rejected: true };
}

/**
 * Delete a commission (pending only)
 */
export async function deleteCommission(commissionId: string) {
  const session = await requireOrg();
  if (session.orgRole !== "super_admin") {
    throw new HriqError("HRIQ-0105", "Only super admins can delete commissions");
  }

  const commission = await database.commission.findUnique({ where: { id: commissionId } });
  if (!commission) throw new HriqError("HRIQ-0901", "Commission not found");
  if (commission.status === "approved" || commission.status === "paid") {
    throw new HriqError("HRIQ-0902", "Cannot delete an approved/paid commission");
  }

  await database.commission.delete({ where: { id: commissionId } });
  revalidatePath("/[orgSlug]/commissions", "page");
  return { deleted: true };
}

/**
 * Get commission summary stats
 */
export async function getCommissionStats() {
  const session = await requireOrg();
  if (!["super_admin", "manager"].includes(session.orgRole)) {
    throw new HriqError("HRIQ-0105", "Insufficient permissions");
  }

  const [pending, approved, totalPaid] = await Promise.all([
    database.commission.aggregate({
      where: { status: "pending" },
      _sum: { commissionAmount: true },
      _count: true,
    }),
    database.commission.aggregate({
      where: { status: "approved" },
      _sum: { commissionAmount: true },
      _count: true,
    }),
    database.commission.aggregate({
      where: { status: "paid" },
      _sum: { commissionAmount: true },
      _count: true,
    }),
  ]);

  return {
    pending: { count: pending._count, total: Number(pending._sum.commissionAmount ?? 0) },
    approved: { count: approved._count, total: Number(approved._sum.commissionAmount ?? 0) },
    paid: { count: totalPaid._count, total: Number(totalPaid._sum.commissionAmount ?? 0) },
  };
}

/**
 * Get all RL employees for the commission assignment dropdown
 */
export async function getCommissionableEmployees() {
  const session = await requireOrg();
  if (!["super_admin", "manager"].includes(session.orgRole)) {
    throw new HriqError("HRIQ-0105", "Insufficient permissions");
  }

  const RL_ORG_ID = process.env.RL_ORGANIZATION_ID ?? "org_rl_001";
  return database.employee.findMany({
    where: {
      organizationId: RL_ORG_ID,
      employmentStatus: { in: ["active", "onboarding_in_progress"] },
    },
    select: {
      id: true,
      legalFirstName: true,
      legalLastName: true,
      preferredName: true,
      department: true,
      photoUrl: true,
    },
    orderBy: { legalFirstName: "asc" },
  });
}
