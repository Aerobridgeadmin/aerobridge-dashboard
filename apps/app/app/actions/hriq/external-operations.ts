"use server";

import { requireRole } from "@repo/auth/session";
import { database } from "@repo/database";
import { revalidatePath } from "next/cache";
import { RL_ORG_ID } from "./constants";

function empOrgWhere(orgFilter?: string) {
  return orgFilter
    ? { organizationId: orgFilter }
    : { organizationId: { not: RL_ORG_ID } };
}

function orgWhere(orgFilter?: string) {
  return orgFilter
    ? { organizationId: orgFilter }
    : { organizationId: { not: RL_ORG_ID } };
}

//  External Documents 

export async function getExternalDocuments(orgFilter?: string) {
  await requireRole("super_admin");

  return database.document.findMany({
    where: { employee: empOrgWhere(orgFilter) },
    select: {
      id: true,
      documentType: true,
      documentName: true,
      description: true,
      fileUrl: true,
      fileName: true,
      fileSize: true,
      mimeType: true,
      issuedDate: true,
      expiryDate: true,
      isExpired: true,
      status: true,
      rejectionReason: true,
      verifiedAt: true,
      isConfidential: true,
      createdAt: true,
      updatedAt: true,
      employee: {
        select: {
          id: true,
          legalFirstName: true,
          legalLastName: true,
          employeeNumber: true,
          organization: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });
}

export async function getExternalDocumentStats(orgFilter?: string) {
  await requireRole("super_admin");

  const results = orgFilter
    ? await database.$queryRaw<Array<{ status: string; count: bigint }>>`
        SELECT d.status, count(*)::bigint as count
        FROM hriq_documents d
        JOIN hriq_employees e ON d.employee_id = e.id
        WHERE e.organization_id = ${orgFilter}
        GROUP BY d.status`
    : await database.$queryRaw<Array<{ status: string; count: bigint }>>`
        SELECT d.status, count(*)::bigint as count
        FROM hriq_documents d
        JOIN hriq_employees e ON d.employee_id = e.id
        WHERE e.organization_id != ${RL_ORG_ID}
        GROUP BY d.status`;

  return results.map((r: any) => ({ status: r.status, count: Number(r.count) }));
}

export async function verifyExternalDocument(documentId: string) {
  try {
    const session = await requireRole("super_admin");

    const doc = await database.document.findUnique({ where: { id: documentId }, select: { id: true, status: true } });
    if (!doc) throw new Error("Document not found");

    const updated = await database.document.update({
      where: { id: documentId },
      data: { status: "verified", verifiedByUserId: session.userId, verifiedAt: new Date() },
    });

    revalidatePath("/[orgSlug]/documents/external", "page");
    return updated;

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[external-operations.ts:verifyExternalDocument]", _msg);
    return { error: _msg };
  }
}

export async function rejectExternalDocument(documentId: string, reason: string) {
  try {
    await requireRole("super_admin");

    const doc = await database.document.findUnique({ where: { id: documentId }, select: { id: true, status: true } });
    if (!doc) throw new Error("Document not found");

    const updated = await database.document.update({
      where: { id: documentId },
      data: { status: "rejected", rejectionReason: reason },
    });

    revalidatePath("/[orgSlug]/documents/external", "page");
    return updated;

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[external-operations.ts:rejectExternalDocument]", _msg);
    return { error: _msg };
  }
}

export async function batchVerifyExternalDocuments(documentIds: string[]) {
  try {
    const session = await requireRole("super_admin");
    if (documentIds.length === 0) throw new Error("No documents selected");

    const valid = await database.document.findMany({
      where: { id: { in: documentIds }, status: "pending" },
      select: { id: true },
    });
    const validIds = valid.map((d: { id: string }) => d.id);
    if (validIds.length === 0) throw new Error("No valid pending documents");

    await database.document.updateMany({
      where: { id: { in: validIds }, status: "pending" },
      data: { status: "verified", verifiedByUserId: session.userId, verifiedAt: new Date() },
    });

    revalidatePath("/[orgSlug]/documents/external", "page");
    return { verified: validIds.length };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[external-operations.ts:batchVerifyExternalDocuments]", _msg);
    return { error: _msg };
  }
}

//  External Contracts 

export async function getExternalContracts(orgFilter?: string) {
  await requireRole("super_admin");

  return database.contractSigningRequest.findMany({
    where: { employee: empOrgWhere(orgFilter) },
    select: {
      id: true,
      status: true,
      sentAt: true,
      viewedAt: true,
      signedAt: true,
      declinedAt: true,
      expiresAt: true,
      signedDocumentUrl: true,
      signerEmail: true,
      signerName: true,
      createdAt: true,
      updatedAt: true,
      employee: {
        select: {
          id: true,
          legalFirstName: true,
          legalLastName: true,
          employeeNumber: true,
          organization: { select: { id: true, name: true } },
        },
      },
      template: {
        select: { id: true, name: true, category: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });
}

export async function getExternalContractStats(orgFilter?: string) {
  await requireRole("super_admin");

  const results = orgFilter
    ? await database.$queryRaw<Array<{ status: string; count: bigint }>>`
        SELECT csr.status, count(*)::bigint as count
        FROM contract_signing_requests csr
        JOIN hriq_employees e ON csr.employee_id = e.id
        WHERE e.organization_id = ${orgFilter}
        GROUP BY csr.status`
    : await database.$queryRaw<Array<{ status: string; count: bigint }>>`
        SELECT csr.status, count(*)::bigint as count
        FROM contract_signing_requests csr
        JOIN hriq_employees e ON csr.employee_id = e.id
        WHERE e.organization_id != ${RL_ORG_ID}
        GROUP BY csr.status`;

  return results.map((r: any) => ({ status: r.status, count: Number(r.count) }));
}

//  External Expenses 

export async function getExternalExpenses(orgFilter?: string) {
  await requireRole("super_admin");

  const where = orgFilter
    ? { organizationId: orgFilter }
    : { organizationId: { not: RL_ORG_ID } };

  return database.expenseReport.findMany({
    where,
    select: {
      id: true,
      title: true,
      description: true,
      totalAmount: true,
      currency: true,
      status: true,
      submittedAt: true,
      approvedAt: true,
      rejectedReason: true,
      createdAt: true,
      updatedAt: true,
      employee: {
        select: {
          id: true,
          legalFirstName: true,
          legalLastName: true,
          employeeNumber: true,
          organization: { select: { id: true, name: true } },
        },
      },
      _count: { select: { items: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });
}

export async function getExternalExpenseStats(orgFilter?: string) {
  await requireRole("super_admin");

  const results = orgFilter
    ? await database.$queryRaw<Array<{ status: string; count: bigint; total: string }>>`
        SELECT er.status, count(*)::bigint as count, coalesce(sum(er.total_amount), 0)::text as total
        FROM expense_reports er
        WHERE er.organization_id = ${orgFilter}
        GROUP BY er.status`
    : await database.$queryRaw<Array<{ status: string; count: bigint; total: string }>>`
        SELECT er.status, count(*)::bigint as count, coalesce(sum(er.total_amount), 0)::text as total
        FROM expense_reports er
        WHERE er.organization_id != ${RL_ORG_ID}
        GROUP BY er.status`;

  return results.map((r: any) => ({ status: r.status, count: Number(r.count), total: Number(r.total) }));
}

export async function approveExternalExpense(reportId: string) {
  try {
    const session = await requireRole("super_admin");

    const report = await database.expenseReport.findUnique({ where: { id: reportId }, select: { id: true, status: true } });
    if (!report) throw new Error("Expense report not found");
    if (report.status !== "submitted") throw new Error(`Cannot approve report with status: ${report.status}`);

    const updated = await database.expenseReport.update({
      where: { id: reportId },
      data: { status: "approved", approvedBy: session.userId, approvedAt: new Date() },
    });

    revalidatePath("/[orgSlug]/expenses/external", "page");
    return updated;

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[external-operations.ts:approveExternalExpense]", _msg);
    return { error: _msg };
  }
}

export async function rejectExternalExpense(reportId: string, reason: string) {
  try {
    await requireRole("super_admin");

    const report = await database.expenseReport.findUnique({ where: { id: reportId }, select: { id: true, status: true } });
    if (!report) throw new Error("Expense report not found");
    if (report.status !== "submitted") throw new Error(`Cannot reject report with status: ${report.status}`);

    const updated = await database.expenseReport.update({
      where: { id: reportId },
      data: { status: "rejected", rejectedReason: reason },
    });

    revalidatePath("/[orgSlug]/expenses/external", "page");
    return updated;

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[external-operations.ts:rejectExternalExpense]", _msg);
    return { error: _msg };
  }
}

export async function batchApproveExternalExpenses(reportIds: string[]) {
  try {
    const session = await requireRole("super_admin");
    if (reportIds.length === 0) throw new Error("No reports selected");

    const valid = await database.expenseReport.findMany({
      where: { id: { in: reportIds }, status: "submitted" },
      select: { id: true },
    });
    const validIds = valid.map((r: { id: string }) => r.id);
    if (validIds.length === 0) throw new Error("No valid submitted reports");

    await database.expenseReport.updateMany({
      where: { id: { in: validIds }, status: { not: "approved" } },
      data: { status: "approved", approvedBy: session.userId, approvedAt: new Date() },
    });

    revalidatePath("/[orgSlug]/expenses/external", "page");
    return { approved: validIds.length };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[external-operations.ts:batchApproveExternalExpenses]", _msg);
    return { error: _msg };
  }
}

//  External Time Off 

export async function getExternalTimeOff(orgFilter?: string) {
  await requireRole("super_admin");

  return database.timeOffRequest.findMany({
    where: { employee: empOrgWhere(orgFilter) },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      totalDays: true,
      reason: true,
      status: true,
      approvedAt: true,
      rejectedReason: true,
      createdAt: true,
      updatedAt: true,
      employee: {
        select: {
          id: true,
          legalFirstName: true,
          legalLastName: true,
          employeeNumber: true,
          organization: { select: { id: true, name: true } },
        },
      },
      policy: { select: { name: true, type: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });
}

export async function getExternalTimeOffStats(orgFilter?: string) {
  await requireRole("super_admin");

  const results = orgFilter
    ? await database.$queryRaw<Array<{ status: string; count: bigint; total_days: string }>>`
        SELECT tor.status, count(*)::bigint as count, coalesce(sum(tor.total_days), 0)::text as total_days
        FROM time_off_requests tor
        JOIN hriq_employees e ON tor.employee_id = e.id
        WHERE e.organization_id = ${orgFilter}
        GROUP BY tor.status`
    : await database.$queryRaw<Array<{ status: string; count: bigint; total_days: string }>>`
        SELECT tor.status, count(*)::bigint as count, coalesce(sum(tor.total_days), 0)::text as total_days
        FROM time_off_requests tor
        JOIN hriq_employees e ON tor.employee_id = e.id
        WHERE e.organization_id != ${RL_ORG_ID}
        GROUP BY tor.status`;

  return results.map((r: any) => ({ status: r.status, count: Number(r.count), totalDays: Number(r.total_days) }));
}

export async function approveExternalTimeOff(requestId: string) {
  try {
    const session = await requireRole("super_admin");

    const req = await database.timeOffRequest.findUnique({ where: { id: requestId }, select: { id: true, status: true } });
    if (!req) throw new Error("Time-off request not found");
    if (req.status !== "pending") throw new Error(`Cannot approve request with status: ${req.status}`);

    const updated = await database.timeOffRequest.update({
      where: { id: requestId },
      data: { status: "approved", approvedBy: session.userId, approvedAt: new Date() },
    });

    revalidatePath("/[orgSlug]/time-off/external", "page");
    return updated;

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[external-operations.ts:approveExternalTimeOff]", _msg);
    return { error: _msg };
  }
}

export async function rejectExternalTimeOff(requestId: string, reason: string) {
  try {
    await requireRole("super_admin");

    const req = await database.timeOffRequest.findUnique({ where: { id: requestId }, select: { id: true, status: true } });
    if (!req) throw new Error("Time-off request not found");
    if (req.status !== "pending") throw new Error(`Cannot reject request with status: ${req.status}`);

    const updated = await database.timeOffRequest.update({
      where: { id: requestId },
      data: { status: "rejected", rejectedReason: reason },
    });

    revalidatePath("/[orgSlug]/time-off/external", "page");
    return updated;

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[external-operations.ts:rejectExternalTimeOff]", _msg);
    return { error: _msg };
  }
}

export async function batchApproveExternalTimeOff(requestIds: string[]) {
  try {
    const session = await requireRole("super_admin");
    if (requestIds.length === 0) throw new Error("No requests selected");

    const valid = await database.timeOffRequest.findMany({
      where: { id: { in: requestIds }, status: "pending" },
      select: { id: true },
    });
    const validIds = valid.map((r: { id: string }) => r.id);
    if (validIds.length === 0) throw new Error("No valid pending requests");

    await database.timeOffRequest.updateMany({
      where: { id: { in: validIds }, status: "pending" },
      data: { status: "approved", approvedBy: session.userId, approvedAt: new Date() },
    });

    revalidatePath("/[orgSlug]/time-off/external", "page");
    return { approved: validIds.length };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[external-operations.ts:batchApproveExternalTimeOff]", _msg);
    return { error: _msg };
  }
}

//  External Tasks 

export async function getExternalTasks(orgFilter?: string) {
  await requireRole("super_admin");

  return database.task.findMany({
    where: { employee: empOrgWhere(orgFilter) },
    select: {
      id: true,
      taskType: true,
      title: true,
      description: true,
      ownerRole: true,
      dueDate: true,
      status: true,
      isBlocking: true,
      completedAt: true,
      phase: true,
      createdAt: true,
      updatedAt: true,
      employee: {
        select: {
          id: true,
          legalFirstName: true,
          legalLastName: true,
          employeeNumber: true,
          organization: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
    take: 1000,
  });
}

export async function getExternalTaskStats(orgFilter?: string) {
  await requireRole("super_admin");

  const results = orgFilter
    ? await database.$queryRaw<Array<{ status: string; count: bigint }>>`
        SELECT t.status, count(*)::bigint as count
        FROM hriq_tasks t
        JOIN hriq_employees e ON t.employee_id = e.id
        WHERE e.organization_id = ${orgFilter}
        GROUP BY t.status`
    : await database.$queryRaw<Array<{ status: string; count: bigint }>>`
        SELECT t.status, count(*)::bigint as count
        FROM hriq_tasks t
        JOIN hriq_employees e ON t.employee_id = e.id
        WHERE e.organization_id != ${RL_ORG_ID}
        GROUP BY t.status`;

  return results.map((r: any) => ({ status: r.status, count: Number(r.count) }));
}

export async function completeExternalTask(taskId: string) {
  try {
    const session = await requireRole("super_admin");

    const task = await database.task.findUnique({ where: { id: taskId }, select: { id: true, status: true } });
    if (!task) throw new Error("Task not found");

    const updated = await database.task.update({
      where: { id: taskId },
      data: { status: "completed", completedAt: new Date(), completedByUserId: session.userId },
    });

    revalidatePath("/[orgSlug]/tasks/external", "page");
    return updated;

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[external-operations.ts:completeExternalTask]", _msg);
    return { error: _msg };
  }
}

export async function batchCompleteExternalTasks(taskIds: string[]) {
  try {
    const session = await requireRole("super_admin");
    if (taskIds.length === 0) throw new Error("No tasks selected");

    const valid = await database.task.findMany({
      where: { id: { in: taskIds }, status: { in: ["pending", "in_progress"] } },
      select: { id: true },
    });
    const validIds = valid.map((t: { id: string }) => t.id);
    if (validIds.length === 0) throw new Error("No valid pending tasks");

    await database.task.updateMany({
      where: { id: { in: validIds }, status: { not: "completed" } },
      data: { status: "completed", completedAt: new Date(), completedByUserId: session.userId },
    });

    revalidatePath("/[orgSlug]/tasks/external", "page");
    return { completed: validIds.length };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[external-operations.ts:batchCompleteExternalTasks]", _msg);
    return { error: _msg };
  }
}
