"use server";

import { revalidatePath } from "next/cache";

import { requireOrg, requireSession } from "@repo/auth/session";
import { database } from "@repo/database";
import { HriqError } from "@/lib/hriq/errors";

export async function getTimeOffPolicies() {
  const session = await requireOrg();
  return database.timeOffPolicy.findMany({
    where: { organizationId: session.orgId, isActive: true },
    orderBy: { name: "asc" },
  });
}

export async function createTimeOffPolicy(data: {
  name: string;
  type: string;
  daysPerYear: number;
  carryOverMax?: number;
}) {
  const session = await requireOrg();
  const policy = await database.timeOffPolicy.create({
    data: {
      organizationId: session.orgId,
      name: data.name,
      type: data.type,
      daysPerYear: data.daysPerYear,
      carryOverMax: data.carryOverMax ?? 0,
    },
  });

  revalidatePath("/[orgSlug]/time-off", "page");

  return policy;
}

export async function getTimeOffRequests(status?: string) {
  const session = await requireOrg();
  return database.timeOffRequest.findMany({
    where: {
      employee: { organizationId: session.orgId },
      ...(status ? { status } : {}),
    },
    include: {
      employee: { select: { id: true, legalFirstName: true, legalLastName: true, employeeNumber: true } },
      policy: { select: { name: true, type: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function requestTimeOff(data: {
  policyId: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason?: string;
}) {
  const session = await requireSession();

  if (!Number.isFinite(data.totalDays) || data.totalDays <= 0 || data.totalDays > 365) {
    throw new HriqError("HRIQ-1305");
  }
  const startDate = new Date(data.startDate as any);
  const endDate = new Date(data.endDate as any);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new HriqError("HRIQ-1006");
  }
  if (endDate < startDate) {
    throw new HriqError("HRIQ-1304");
  }

  const employee = await database.employee.findFirst({
    where: { linkedUserId: session.userId, ...(session.orgId ? { organizationId: session.orgId } : {}) },
    select: { id: true, organizationId: true },
  });
  if (!employee) throw new HriqError("HRIQ-2501");
  if (!employee.organizationId) throw new HriqError("HRIQ-2501", "Employee not linked to an organization");

  // Validate that the policy belongs to the employee's org
  const policy = await database.timeOffPolicy.findFirst({
    where: { id: data.policyId, organizationId: employee.organizationId },
    select: { id: true },
  });
  if (!policy) throw new HriqError("HRIQ-1306", "Time-off policy not found");

  // Check for overlapping approved/pending requests
  const overlap = await database.timeOffRequest.findFirst({
    where: {
      employeeId: employee.id,
      status: { in: ["pending", "approved"] },
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
    select: { id: true },
  });
  if (overlap) throw new HriqError("HRIQ-1307", "You already have an overlapping time-off request for these dates");

  const request = await database.timeOffRequest.create({
    data: {
      employeeId: employee.id,
      policyId: data.policyId,
      startDate,
      endDate,
      totalDays: data.totalDays,
      reason: data.reason,
    },
  });

  revalidatePath("/[orgSlug]/time-off", "page");

  return request;
}

export async function approveTimeOff(requestId: string) {
  try {
    const session = await requireOrg();

    // Atomic status transition: only approve if currently "pending" and belongs to this org
    const result = await database.timeOffRequest.updateMany({
      where: {
        id: requestId,
        employee: { organizationId: session.orgId },
        status: "pending",
      },
      data: { status: "approved", approvedBy: session.userId, approvedAt: new Date() },
    });

    if (result.count === 0) {
      const request = await database.timeOffRequest.findFirst({
        where: { id: requestId, employee: { organizationId: session.orgId } },
        select: { status: true },
      });
      if (!request) throw new HriqError("HRIQ-1301");
      throw new HriqError("HRIQ-1302", `Cannot approve request with status: ${request.status}`);
    }

    revalidatePath("/[orgSlug]/time-off", "page");

    return { approved: true };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[time-off.ts:approveTimeOff]", _msg);
    return { error: _msg };
  }
}

export async function rejectTimeOff(requestId: string, reason: string) {
  try {
    const session = await requireOrg();

    // Atomic status transition: only reject if currently "pending" and belongs to this org
    const result = await database.timeOffRequest.updateMany({
      where: {
        id: requestId,
        employee: { organizationId: session.orgId },
        status: "pending",
      },
      data: { status: "rejected", rejectedReason: reason },
    });

    if (result.count === 0) {
      const request = await database.timeOffRequest.findFirst({
        where: { id: requestId, employee: { organizationId: session.orgId } },
        select: { status: true },
      });
      if (!request) throw new HriqError("HRIQ-1301");
      throw new HriqError("HRIQ-1303", `Cannot reject request with status: ${request.status}`);
    }

    revalidatePath("/[orgSlug]/time-off", "page");

    return { rejected: true };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[time-off.ts:rejectTimeOff]", _msg);
    return { error: _msg };
  }
}

export async function getMyTimeOffRequests() {
  const session = await requireSession();
  const employee = await database.employee.findFirst({
    where: { linkedUserId: session.userId, ...(session.orgId ? { organizationId: session.orgId } : {}) },
    select: { id: true },
  });
  if (!employee) return [];

  return database.timeOffRequest.findMany({
    where: { employeeId: employee.id },
    include: { policy: { select: { name: true, type: true } } },
    orderBy: { createdAt: "desc" },
  });
}
