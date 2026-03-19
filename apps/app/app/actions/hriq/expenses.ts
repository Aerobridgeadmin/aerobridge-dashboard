"use server";

import { revalidatePath } from "next/cache";

import { requireOrg, requireSession } from "@repo/auth/session";
import { database } from "@repo/database";
import { HriqError } from "@/lib/hriq/errors";

export async function getExpenseReports(status?: string) {
  const session = await requireOrg();
  return database.expenseReport.findMany({
    where: {
      organizationId: session.orgId,
      ...(status ? { status } : {}),
    },
    include: {
      employee: { select: { id: true, legalFirstName: true, legalLastName: true } },
      _count: { select: { items: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function createExpenseReport(data: {
  title: string;
  description?: string;
  currency?: string;
  items: { category: string; description: string; amount: number; date: string }[];
}) {
  const session = await requireSession();
  const employee = await database.employee.findFirst({
    where: { linkedUserId: session.userId, ...(session.orgId ? { organizationId: session.orgId } : {}) },
    select: { id: true, organizationId: true },
  });
  if (!employee || !employee.organizationId) throw new HriqError("HRIQ-2501");

  for (const item of data.items) {
    if (!Number.isFinite(item.amount) || item.amount <= 0) {
      throw new HriqError("HRIQ-1204");
    }
    const itemDate = new Date(item.date as any);
    if (Number.isNaN(itemDate.getTime())) {
      throw new HriqError("HRIQ-1006", `Invalid date: ${item.date}`);
    }
  }
  const totalAmount = data.items.reduce((sum, item) => sum + item.amount, 0);

  const report = await database.expenseReport.create({
    data: {
      employeeId: employee.id,
      organizationId: employee.organizationId,
      title: data.title,
      description: data.description,
      totalAmount,
      currency: data.currency ?? "USD",
      status: "submitted",
      submittedAt: new Date(),
      items: {
        create: data.items.map((item) => ({
          category: item.category,
          description: item.description,
          amount: item.amount,
          currency: data.currency ?? "USD",
          date: new Date(item.date as any),
        })),
      },
    },
  });
  revalidatePath("/[orgSlug]/expenses", "page");
  return report;
}

export async function approveExpenseReport(reportId: string) {
  try {
    const session = await requireOrg();
    // Atomic status transition: only approve if currently "submitted" and belongs to this org
    const where = session.orgRole === "super_admin"
      ? { id: reportId, status: "submitted" }
      : { id: reportId, organizationId: session.orgId, status: "submitted" };

    const result = await database.expenseReport.updateMany({
      where,
      data: { status: "approved", approvedBy: session.userId, approvedAt: new Date() },
    });

    if (result.count === 0) {
      // Check why it failed
      const report = await database.expenseReport.findFirst({
        where: session.orgRole === "super_admin" ? { id: reportId } : { id: reportId, organizationId: session.orgId },
        select: { status: true },
      });
      if (!report) throw new HriqError("HRIQ-1201");
      throw new HriqError("HRIQ-1202", `Cannot approve report with status: ${report.status}`);
    }

    revalidatePath("/[orgSlug]/expenses", "page");
    return { approved: true };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[expenses.ts:approveExpenseReport]", _msg);
    return { error: _msg };
  }
}

export async function rejectExpenseReport(reportId: string, reason: string) {
  try {
    const session = await requireOrg();
    // Atomic status transition: only reject if currently "submitted"
    const where = session.orgRole === "super_admin"
      ? { id: reportId, status: "submitted" }
      : { id: reportId, organizationId: session.orgId, status: "submitted" };

    const result = await database.expenseReport.updateMany({
      where,
      data: { status: "rejected", rejectedReason: reason },
    });

    if (result.count === 0) {
      const report = await database.expenseReport.findFirst({
        where: session.orgRole === "super_admin" ? { id: reportId } : { id: reportId, organizationId: session.orgId },
        select: { status: true },
      });
      if (!report) throw new HriqError("HRIQ-1201");
      throw new HriqError("HRIQ-1203", `Cannot reject report with status: ${report.status}`);
    }

    revalidatePath("/[orgSlug]/expenses", "page");
    return { rejected: true };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[expenses.ts:rejectExpenseReport]", _msg);
    return { error: _msg };
  }
}

export async function getMyExpenseReports() {
  const session = await requireSession();
  const employee = await database.employee.findFirst({
    where: { linkedUserId: session.userId, ...(session.orgId ? { organizationId: session.orgId } : {}) },
  });
  if (!employee) return [];

  return database.expenseReport.findMany({
    where: { employeeId: employee.id },
    include: { _count: { select: { items: true } } },
    orderBy: { createdAt: "desc" },
  });
}
