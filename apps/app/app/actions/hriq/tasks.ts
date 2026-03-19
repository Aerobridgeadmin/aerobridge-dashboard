"use server";
import { getContractorEmail } from "@/lib/hriq/utils";

import { revalidatePath } from "next/cache";

import { requireOrg } from "@repo/auth/session";
import { database } from "@repo/database";
import { HriqError } from "@/lib/hriq/errors";

export async function getPendingTasks() {
  const session = await requireOrg();

  return database.task.findMany({
    where: {
      employee: { organizationId: session.orgId },
      status: { in: ["pending", "in_progress"] },
    },
    include: {
      employee: {
        select: { id: true, legalFirstName: true, legalLastName: true, employeeNumber: true },
      },
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
  });
}

export async function createTask(data: {
  employeeId: string;
  taskType: string;
  title: string;
  description?: string;
  ownerRole?: string;
  assignedToUserId?: string;
  dueDate?: string;
  phase?: string;
  isBlocking?: boolean;
}) {
  const session = await requireOrg();

  // Verify employee belongs to org
  const employee = await database.employee.findFirst({
    where: { id: data.employeeId, organizationId: session.orgId },
  });
  if (!employee) throw new HriqError("HRIQ-0201");

  const task = await database.task.create({
    data: {
      employeeId: data.employeeId,
      taskType: data.taskType,
      title: data.title,
      description: data.description,
      ownerRole: data.ownerRole,
      assignedToUserId: data.assignedToUserId,
      dueDate: data.dueDate ? new Date(data.dueDate as any) : undefined,
      phase: data.phase,
      isBlocking: data.isBlocking ?? false,
    },
  });

  // Send task assignment email
  try {
    const email = getContractorEmail(employee);
    if (email) {
      const { sendTaskAssignmentEmail } = await import("./send-email");
      await sendTaskAssignmentEmail(email, employee.legalFirstName, data.title, data.dueDate);
    }
  } catch (e) {
    console.error("[HRIQ-1703] Tasks — failed to send task email:", e);
  }

  revalidatePath("/[orgSlug]/tasks", "page");

  return task;
}

export async function completeTask(taskId: string) {
  try {
    const session = await requireOrg();

    const task = await database.task.findFirst({
      where: { id: taskId, employee: { organizationId: session.orgId } },
    });
    if (!task) throw new HriqError("HRIQ-1101");

    const updated = await database.task.update({
      where: { id: taskId },
      data: {
        status: "completed",
        completedAt: new Date(),
        completedByUserId: session.userId,
      },
    });

    revalidatePath("/[orgSlug]/tasks", "page");

    return updated;

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[tasks.ts:completeTask]", _msg);
    return { error: _msg };
  }
}
