"use server";

import { requireRole } from "@repo/auth/session";
import { database } from "@repo/database";
import { revalidatePath } from "next/cache";
import { RL_ORG_ID } from "./constants";

/**
 * Get all payments across client orgs (excludes RL internal).
 * Super admin only.
 */
export async function getExternalPayments(orgFilter?: string) {
  await requireRole("super_admin");

  const orgWhere = orgFilter
    ? { organizationId: orgFilter }
    : { organizationId: { not: RL_ORG_ID } };

  return database.payment.findMany({
    where: {
      employee: orgWhere,
    },
    select: {
      id: true,
      status: true,
      amount: true,
      currency: true,
      paymentType: true,
      paymentMethod: true,
      paymentDate: true,
      createdAt: true,
      periodStart: true,
      periodEnd: true,
      hoursWorked: true,
      hourlyRate: true,
      description: true,
      transactionId: true,
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

/**
 * Get all timesheet submissions across client orgs (excludes RL internal).
 * Super admin only.
 */
export async function getExternalSubmissions(orgFilter?: string) {
  await requireRole("super_admin");

  const orgWhere = orgFilter
    ? { organizationId: orgFilter }
    : { organizationId: { not: RL_ORG_ID } };

  return database.timesheetSubmission.findMany({
    where: {
      employee: orgWhere,
    },
    include: {
      employee: {
        select: {
          id: true,
          legalFirstName: true,
          legalLastName: true,
          employeeNumber: true,
          hourlyRate: true,
          currency: true,
          organization: { select: { id: true, name: true } },
        },
      },
      period: true,
    },
    orderBy: [{ period: { startDate: "desc" } }, { submittedAt: "asc" }],
    take: 1000,
  });
}

/**
 * Get all timesheet periods across client orgs.
 * Super admin only.
 */
export async function getExternalPeriods(orgFilter?: string) {
  await requireRole("super_admin");

  const orgWhere = orgFilter
    ? { organizationId: orgFilter }
    : { organizationId: { not: RL_ORG_ID } };

  return database.timesheetPeriod.findMany({
    where: orgWhere,
    include: {
      _count: { select: { submissions: true } },
      organization: { select: { id: true, name: true } },
    },
    orderBy: { startDate: "desc" },
  });
}

/**
 * Get all client orgs (non-RL) for the filter dropdown.
 */
export async function getClientOrganizations() {
  await requireRole("super_admin");

  return database.organization.findMany({
    where: { id: { not: RL_ORG_ID } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

/**
 * Aggregate payment stats across client orgs.
 */
export async function getExternalPaymentStats(orgFilter?: string) {
  await requireRole("super_admin");

  const results = orgFilter
    ? await database.$queryRaw<Array<{ status: string; count: bigint; total: string }>>`
        SELECT p.status, count(*)::bigint as count, coalesce(sum(p.amount::numeric), 0)::text as total
        FROM hriq_payments p
        JOIN hriq_employees e ON p.employee_id = e.id
        WHERE e.organization_id = ${orgFilter}
        GROUP BY p.status
      `
    : await database.$queryRaw<Array<{ status: string; count: bigint; total: string }>>`
        SELECT p.status, count(*)::bigint as count, coalesce(sum(p.amount::numeric), 0)::text as total
        FROM hriq_payments p
        JOIN hriq_employees e ON p.employee_id = e.id
        WHERE e.organization_id != ${RL_ORG_ID}
        GROUP BY p.status
      `;

  return results.map((r: any) => ({
    status: r.status,
    count: Number(r.count),
    total: Number(r.total),
  }));
}

/**
 * Mark a single external payment as paid (super_admin cross-org).
 */
export async function markExternalPaymentPaid(paymentId: string) {
  try {
    const session = await requireRole("super_admin", "admin");

    const payment = await database.payment.findUnique({
      where: { id: paymentId },
      include: { employee: { select: { organizationId: true, id: true } } },
    });
    if (!payment) throw new Error("Payment not found");
    if (payment.employee.organizationId === RL_ORG_ID) throw new Error("Cannot use external flow for RL payments");
    // Admin role: can only mark payments within their own org
    if (session.orgRole === "admin" && payment.employee.organizationId !== session.orgId) {
      throw new Error("Insufficient permissions to manage this payment");
    }
    if (payment.status === "completed") throw new Error("Payment already completed");

    // Enforce: client invoice for this org+period must be paid first
    if (payment.periodStart && payment.periodEnd && payment.employee.organizationId) {
      const clientInvoice = await database.clientInvoice.findFirst({
        where: {
          organizationId: payment.employee.organizationId,
          periodStart: payment.periodStart,
          periodEnd: payment.periodEnd,
        },
        select: { status: true, invoiceNumber: true },
      });
      if (clientInvoice && !["paid", "void"].includes(clientInvoice.status)) {
        throw new Error(`Client invoice ${clientInvoice.invoiceNumber} must be paid before releasing contractor payment. Current status: ${clientInvoice.status}`);
      }
    }

    const updated = await database.payment.updateMany({
      where: { id: paymentId, status: { not: "completed" } },
      data: {
        status: "completed",
        paymentDate: new Date(),
        processedByUserId: session.userId,
        processedByName: session.name ?? undefined,
      },
    });
    if (updated.count === 0) throw new Error("Payment already completed or being processed");

    // Trigger paystub (non-blocking)
    try {
      const { generateAndDeliverPaystub } = await import("./paystub");
      await generateAndDeliverPaystub(paymentId);
    } catch (e) {
      console.error("[HRIQ-1704] External paystub generation failed:", e);
    }

    revalidatePath("/[orgSlug]/payments/external", "page");
    return updated;

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[external-finance.ts:markExternalPaymentPaid]", _msg);
    return { error: _msg };
  }
}

/**
 * Batch mark external payments as paid (super_admin cross-org).
 */
export async function batchMarkExternalPaymentsPaid(paymentIds: string[]) {
  try {
    const session = await requireRole("super_admin", "admin");
    if (paymentIds.length === 0) throw new Error("No payments selected");

    const orgFilter = session.orgRole === "admin" ? session.orgId : undefined;

    // Only allow pending payments from non-RL orgs (admin: scoped to their org)
    const valid = await database.payment.findMany({
      where: {
        id: { in: paymentIds },
        status: "pending",
        employee: {
          organizationId: orgFilter
            ? orgFilter
            : { not: RL_ORG_ID },
        },
      },
      select: { id: true, periodStart: true, periodEnd: true, employee: { select: { organizationId: true } } },
    });
    const validIds = valid.map((p: any) => p.id);
    if (validIds.length === 0) throw new Error("No valid pending external payments");

    // Enforce: all relevant client invoices must be paid
    const orgPeriodKeys = new Set<string>();
    const checks: { orgId: string; start: Date; end: Date }[] = [];
    for (const p of valid) {
      if (p.periodStart && p.periodEnd && (p as any).employee?.organizationId) {
        const key = `${(p as any).employee.organizationId}|${(p.periodStart as Date).toISOString()}|${(p.periodEnd as Date).toISOString()}`;
        if (!orgPeriodKeys.has(key)) {
          orgPeriodKeys.add(key);
          checks.push({ orgId: (p as any).employee.organizationId, start: p.periodStart as Date, end: p.periodEnd as Date });
        }
      }
    }

    // Batch validation: find any unpaid client invoices in a single query
    if (checks.length > 0) {
      const unpaidInvoice = await database.clientInvoice.findFirst({
        where: {
          OR: checks.map((c) => ({ organizationId: c.orgId, periodStart: c.start, periodEnd: c.end })),
          status: { notIn: ["paid", "void"] },
        },
        select: { status: true, invoiceNumber: true, organization: { select: { name: true } } },
      });
      if (unpaidInvoice) {
        throw new Error(`Client invoice ${unpaidInvoice.invoiceNumber} (${(unpaidInvoice as any).organization?.name}) must be paid first. Status: ${unpaidInvoice.status}`);
      }
    }

    await database.payment.updateMany({
      where: { id: { in: validIds }, status: { not: "completed" } },
      data: {
        status: "completed",
        paymentDate: new Date(),
        processedByUserId: session.userId,
        processedByName: session.name ?? undefined,
      },
    });

    // Generate paystubs sequentially (await each to ensure delivery)
    const { generateAndDeliverPaystub } = await import("./paystub");
    for (const pid of validIds) {
      try {
        await generateAndDeliverPaystub(pid);
      } catch (e) {
        console.error("[HRIQ-1704] External batch paystub failed for", pid, e);
      }
    }

    revalidatePath("/[orgSlug]/payments/external", "page");
    return { updated: validIds.length };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[external-finance.ts:batchMarkExternalPaymentsPaid]", _msg);
    return { error: _msg };
  }
}

/**
 * Update amount on an external payment (super_admin cross-org).
 */
export async function updateExternalPaymentAmount(paymentId: string, amount: string) {
  try {
    const session = await requireRole("super_admin", "admin");

    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) throw new Error("Invalid amount");

    const payment = await database.payment.findUnique({
      where: { id: paymentId },
      select: { status: true, employee: { select: { organizationId: true } } },
    });
    if (!payment) throw new Error("Payment not found");
    if (payment.employee.organizationId === RL_ORG_ID) throw new Error("Cannot use external flow for RL payments");
    if (session.orgRole === "admin" && payment.employee.organizationId !== session.orgId) {
      throw new Error("Insufficient permissions to manage this payment");
    }
    if (payment.status === "completed") throw new Error("Cannot edit completed payment");

    const result = await database.payment.updateMany({
      where: { id: paymentId, status: { not: "completed" } },
      data: { amount: String(parsed) },
    });
    if (result.count === 0) throw new Error("Cannot edit completed payment");

    revalidatePath("/[orgSlug]/payments/external", "page");
    return { ok: true };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[external-finance.ts:updateExternalPaymentAmount]", _msg);
    return { error: _msg };
  }
}

//  Cross-org Timesheet Approvals (super_admin) 

/**
 * Approve a timesheet submission across any org (super_admin only).
 */
export async function approveExternalTimesheet(submissionId: string) {
  try {
    const session = await requireRole("super_admin");

    const submission = await database.timesheetSubmission.findUnique({
      where: { id: submissionId },
      select: { id: true, status: true, employeeId: true },
    });
    if (!submission) throw new Error("Submission not found");
    if (submission.status !== "submitted") throw new Error(`Cannot approve timesheet with status: ${submission.status}`);

    // Atomic status transition to prevent double-approval
    const claimed = await database.timesheetSubmission.updateMany({
      where: { id: submissionId, status: "submitted" },
      data: { status: "approved", approvedAt: new Date(), approvedByUserId: session.userId, approvedByName: session.name ?? undefined },
    });
    if (claimed.count === 0) throw new Error("Timesheet was already approved or modified");

    const updated = await database.timesheetSubmission.findUnique({
      where: { id: submissionId },
      include: {
        period: true,
        employee: {
          select: {
            legalFirstName: true,
            legalLastName: true,
            preferredName: true,
            personalEmail: true,
            workEmail: true,
            hourlyRate: true,
            currency: true,
          },
        },
      },
    });
    if (!updated) throw new Error("Submission not found after approval");

    // Auto-generate payment record
    try {
      const hours = Number(updated.totalHours);
      const rate = updated.employee.hourlyRate ? Number(updated.employee.hourlyRate) : 0;
      const bonusAmt = Number(updated.bonusTotal ?? 0);
      const amount = Math.round((hours * rate + bonusAmt) * 100) / 100;

      await database.$transaction(async (tx: any) => {
        const existing = await tx.payment.findFirst({
          where: {
            employeeId: updated.employeeId,
            periodStart: updated.period.startDate,
            periodEnd: updated.period.endDate,
          },
          select: { id: true, status: true },
        });

        // Never touch a completed payment — it means the contractor was already paid
        if (existing?.status === "completed") return;

        const paymentData = {
          paymentType: "salary",
          amount: String(amount),
          currency: updated.employee.currency ?? "USD",
          hoursWorked: String(hours),
          hourlyRate: String(rate),
          description: rate > 0
            ? `${updated.period.name} — ${hours}h @ $${rate}/hr${bonusAmt > 0 ? ` + $${bonusAmt} bonus` : ""}`
            : `${updated.period.name} — ${hours}h (no rate set)`,
          status: "pending",
          processedByUserId: session.userId,
          processedByName: session.name ?? undefined,
        };

        if (existing) {
          // Existing cancelled/pending payment — reset to pending with updated amounts
          await tx.payment.update({
            where: { id: existing.id },
            data: { ...paymentData, transactionId: null, paymentDate: null },
          });
        } else {
          await tx.payment.create({
            data: {
              employeeId: updated.employeeId,
              periodStart: updated.period.startDate,
              periodEnd: updated.period.endDate,
              ...paymentData,
            },
          });
        }
      });
    } catch (err) {
      console.error("[External Payroll] Auto-payment failed:", err);
    }

    revalidatePath("/[orgSlug]/payroll/external", "page");
    revalidatePath("/[orgSlug]/payments/external", "page");
    revalidatePath("/[orgSlug]/timesheets", "page");

    // Generate client invoice for this period
    try {
      const { generateClientInvoicesForPeriod } = await import("./client-invoices");
      await generateClientInvoicesForPeriod(updated.period.id);
    } catch (err) {
      console.error("[External Payroll] Client invoice generation failed (non-blocking):", err);
    }

    return updated;

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[external-finance.ts:approveExternalTimesheet]", _msg);
    return { error: _msg };
  }
}

/**
 * Batch approve external timesheet submissions (super_admin only).
 */
export async function batchApproveExternalTimesheets(submissionIds: string[]) {
  try {
    const session = await requireRole("super_admin");
    if (submissionIds.length === 0) throw new Error("No submissions to approve");

    const valid = await database.timesheetSubmission.findMany({
      where: { id: { in: submissionIds }, status: "submitted" },
      select: { id: true },
    });
    const validIds = valid.map((v: { id: string }) => v.id);
    if (validIds.length === 0) throw new Error("No valid submissions to approve");

    // Fetch submissions for payment generation (approve + pay atomically per-employee)
    const approvedSubs = await database.timesheetSubmission.findMany({
      where: { id: { in: validIds }, status: "submitted" },
      include: {
        period: true,
        employee: { select: { hourlyRate: true, currency: true } },
      },
    });

    for (const sub of approvedSubs) {
      try {
        const hours = Number(sub.totalHours);
        const rate = sub.employee.hourlyRate ? Number(sub.employee.hourlyRate) : 0;
        const bonusAmt = Number(sub.bonusTotal ?? 0);
        const amount = Math.round((hours * rate + bonusAmt) * 100) / 100;

        await database.$transaction(async (tx: any) => {
          // Atomically approve + create payment to prevent orphaned approvals
          const claimed = await tx.timesheetSubmission.updateMany({
            where: { id: sub.id, status: "submitted" },
            data: {
              status: "approved",
              approvedAt: new Date(),
              approvedByUserId: session.userId,
              approvedByName: session.name ?? undefined,
            },
          });
          if (claimed.count === 0) return; // Already processed

          const existing = await tx.payment.findFirst({
            where: {
              employeeId: sub.employeeId,
              periodStart: sub.period.startDate,
              periodEnd: sub.period.endDate,
            },
            select: { id: true, status: true },
          });
          // Never recreate if already paid
          if (existing?.status === "completed") return;
          // If pending already exists, leave it alone
          if (existing?.status === "pending") return;

          const paymentData = {
            paymentType: "salary",
            amount: String(amount),
            currency: sub.employee.currency ?? "USD",
            hoursWorked: String(hours),
            hourlyRate: String(rate),
            description: rate > 0
              ? `${sub.period.name} — ${hours}h @ $${rate}/hr${bonusAmt > 0 ? ` + $${bonusAmt} bonus` : ""}`
              : `${sub.period.name} — ${hours}h (no rate set)`,
            status: "pending",
            processedByUserId: session.userId,
            processedByName: session.name ?? undefined,
          };

          if (existing) {
            // cancelled — reset to pending with fresh amounts
            await tx.payment.update({
              where: { id: existing.id },
              data: { ...paymentData, transactionId: null, paymentDate: null },
            });
          } else {
            await tx.payment.create({
              data: {
                employeeId: sub.employeeId,
                periodStart: sub.period.startDate,
                periodEnd: sub.period.endDate,
                ...paymentData,
              },
            });
          }
        });
      } catch (err) {
        console.error("[External Payroll] Batch payment failed for", sub.id, err);
      }
    }

    revalidatePath("/[orgSlug]/payroll/external", "page");
    revalidatePath("/[orgSlug]/payments/external", "page");

    // Generate client invoices for all affected periods
    const periodIds = [...new Set(approvedSubs.map((s: any) => s.period.id))];
    if (periodIds.length > 0) {
      const { generateClientInvoicesForPeriod } = await import("./client-invoices");
      for (const periodId of periodIds) {
        try {
          await generateClientInvoicesForPeriod(periodId);
        } catch (err) {
          console.error("[External Payroll] Client invoice generation failed for period", periodId, err);
        }
      }
    }

    return { approved: validIds.length };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[external-finance.ts:batchApproveExternalTimesheets]", _msg);
    return { error: _msg };
  }
}

/**
 * Reject an external timesheet submission (super_admin only).
 */
export async function rejectExternalTimesheet(submissionId: string, reason: string) {
  try {
    await requireRole("super_admin");

    const submission = await database.timesheetSubmission.findUnique({
      where: { id: submissionId },
      select: { id: true, status: true },
    });
    if (!submission) throw new Error("Submission not found");
    if (submission.status !== "submitted") throw new Error(`Cannot reject timesheet with status: ${submission.status}`);

    // Fetch submission to get employee + period details before updating
    const submissionFull = await database.timesheetSubmission.findUnique({
      where: { id: submissionId },
      include: { period: { select: { startDate: true, endDate: true } } },
    });

    const rejected = await database.timesheetSubmission.updateMany({
      where: { id: submissionId, status: "submitted" },
      data: {
        status: "rejected",
        rejectedAt: new Date(),
        rejectionReason: reason,
      },
    });
    if (rejected.count === 0) throw new Error("Timesheet was already processed by another user");

    // Cancel the pending payment so re-approval creates a fresh one cleanly
    if (submissionFull) {
      await database.payment.updateMany({
        where: {
          employeeId: submissionFull.employeeId,
          periodStart: submissionFull.period.startDate,
          periodEnd: submissionFull.period.endDate,
          status: "pending",
        },
        data: { status: "cancelled" },
      });
    }

    revalidatePath("/[orgSlug]/payroll/external", "page");
    revalidatePath("/[orgSlug]/timesheets", "page");
    return { rejected: true };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[external-finance.ts:rejectExternalTimesheet]", _msg);
    return { error: _msg };
  }
}

/**
 * Admin-submit a draft timesheet on behalf of a contractor (super_admin only).
 * Used when the contractor hasn't submitted themselves and the admin needs to push it forward.
 */
export async function adminSubmitExternalTimesheet(submissionId: string) {
  try {
    await requireRole("super_admin");

    const submission = await database.timesheetSubmission.findUnique({
      where: { id: submissionId },
      select: { id: true, status: true, employee: { select: { organizationId: true } } },
    });
    if (!submission) throw new Error("Submission not found");
    if (submission.employee.organizationId === RL_ORG_ID) throw new Error("Cannot admin-submit RL internal timesheets here");
    if (!["draft", "rejected"].includes(submission.status)) throw new Error(`Cannot submit timesheet with status: ${submission.status}`);

    // Auto-approve in 2 business days (same as contractor self-submit)
    const autoApproveAt = new Date();
    let daysAdded = 0;
    while (daysAdded < 2) {
      autoApproveAt.setDate(autoApproveAt.getDate() + 1);
      const day = autoApproveAt.getDay();
      if (day !== 0 && day !== 6) daysAdded++;
    }

    const claimed = await database.timesheetSubmission.updateMany({
      where: { id: submissionId, status: { in: ["draft", "rejected"] } },
      data: { status: "submitted", submittedAt: new Date(), autoApproveAt },
    });
    if (claimed.count === 0) throw new Error("Timesheet was already submitted or modified");

    const updated = await database.timesheetSubmission.findUnique({ where: { id: submissionId } });

    revalidatePath("/[orgSlug]/payroll/external", "page");
    return updated;

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[external-finance.ts:adminSubmitExternalTimesheet]", _msg);
    return { error: _msg };
  }
}

/**
 * Revert an approved external timesheet back to submitted for re-review (super_admin only).
 */
export async function adminUnapproveExternalTimesheet(submissionId: string) {
  try {
    await requireRole("super_admin");

    const submission = await database.timesheetSubmission.findUnique({
      where: { id: submissionId },
      include: { period: { select: { startDate: true, endDate: true } } },
    });
    if (!submission) throw new Error("Submission not found");
    if (!["approved", "auto_approved"].includes(submission.status)) throw new Error(`Cannot un-approve timesheet with status: ${submission.status}`);

    // Block unapproval if the payment is already completed
    const existingPayment = await database.payment.findFirst({
      where: {
        employeeId: submission.employeeId,
        periodStart: submission.period.startDate,
        periodEnd: submission.period.endDate,
        status: "completed",
      },
      select: { id: true },
    });
    if (existingPayment) {
      throw new Error("Cannot un-approve: this timesheet has already been paid. Reverse the payment first.");
    }

    const claimed = await database.timesheetSubmission.updateMany({
      where: { id: submissionId, status: { in: ["approved", "auto_approved"] } },
      data: { status: "submitted", approvedAt: null },
    });
    if (claimed.count === 0) throw new Error("Timesheet was already modified by another user");

    // Cancel pending payment so re-approval creates a fresh one
    await database.payment.updateMany({
      where: {
        employeeId: submission.employeeId,
        periodStart: submission.period.startDate,
        periodEnd: submission.period.endDate,
        status: "pending",
      },
      data: { status: "cancelled" },
    });

    revalidatePath("/[orgSlug]/payroll/external", "page");
    revalidatePath("/[orgSlug]/timesheets", "page");
    return { unapproved: true };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[external-finance.ts:adminUnapproveExternalTimesheet]", _msg);
    return { error: _msg };
  }
}
