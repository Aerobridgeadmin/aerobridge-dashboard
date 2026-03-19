"use server";

import { requireOrg } from "@repo/auth/session";
import { database } from "@repo/database";
import { revalidatePath } from "next/cache";
import { HriqError } from "@/lib/hriq/errors";

export async function createPayment(data: {
  employeeId: string;
  paymentType: string;
  amount: string;
  currency?: string;
  periodStart?: string;
  periodEnd?: string;
  paymentDate?: string;
  paymentMethod?: string;
  hoursWorked?: string;
  hourlyRate?: string;
  description?: string;
  notes?: string;
}) {
  const session = await requireOrg();
  if (!["super_admin", "admin"].includes(session.orgRole)) {
    throw new HriqError("HRIQ-0105", "Only admins can create payment records");
  }

  const ALLOWED_PAYMENT_TYPES = ["salary", "bonus", "reimbursement", "commission", "other"];
  if (!ALLOWED_PAYMENT_TYPES.includes(data.paymentType)) {
    throw new HriqError("HRIQ-0802", `Invalid payment type: ${data.paymentType}`);
  }

  const parsedAmount = Number(data.amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    throw new HriqError("HRIQ-0804");
  }

  const employee = await database.employee.findFirst({
    where: { id: data.employeeId, organizationId: session.orgId },
    select: { id: true, hourlyRate: true, currency: true },
  });
  if (!employee) throw new HriqError("HRIQ-0201");

  // Auto-fill hourlyRate from employee record if not provided
  const hourlyRate = data.hourlyRate || (employee.hourlyRate ? String(employee.hourlyRate) : undefined);

  const payment = await database.payment.create({
    data: {
      employeeId: data.employeeId,
      paymentType: data.paymentType,
      amount: data.amount,
      currency: data.currency ?? employee.currency ?? "USD",
      periodStart: data.periodStart ? new Date(data.periodStart as any) : undefined,
      periodEnd: data.periodEnd ? new Date(data.periodEnd as any) : undefined,
      paymentDate: data.paymentDate ? new Date(data.paymentDate) : undefined,
      paymentMethod: data.paymentMethod,
      hoursWorked: data.hoursWorked,
      hourlyRate,
      description: data.description,
      notes: data.notes,
      processedByUserId: session.userId,
      processedByName: session.name ?? undefined,
    },
  });

  revalidatePath("/[orgSlug]/payments", "page");
  revalidatePath("/[orgSlug]/payroll", "page");

  return payment;
}

/**
 * Requeue a completed (or failed/cancelled) payment back to pending
 * so it re-appears in the payroll queue for reprocessing.
 */
export async function requeuePayment(paymentId: string) {
  try {
    const session = await requireOrg();
    if (!["super_admin", "admin"].includes(session.orgRole)) {
      throw new HriqError("HRIQ-0105", "Only admins can requeue payments");
    }

    const payment = await database.payment.findFirst({
      where: { id: paymentId, employee: { organizationId: session.orgId } },
      select: { id: true, status: true, employee: { select: { legalFirstName: true, legalLastName: true } } },
    });
    if (!payment) throw new HriqError("HRIQ-0801", "Payment not found");

    const REQUEUE_FROM = ["completed", "failed", "cancelled"];
    if (!REQUEUE_FROM.includes(payment.status)) {
      throw new HriqError("HRIQ-0803", `Cannot requeue a payment with status: ${payment.status}`);
    }

    const result = await database.payment.updateMany({
      where: { id: paymentId, status: { in: REQUEUE_FROM }, employee: { organizationId: session.orgId } },
      data: { status: "pending", transactionId: null, paymentDate: null },
    });
    if (result.count === 0) throw new HriqError("HRIQ-0803", "Payment was already modified");

    revalidatePath("/[orgSlug]/payments", "page");
    revalidatePath("/[orgSlug]/payroll", "page");

    return {
      requeued: true,
      name: `${payment.employee.legalFirstName} ${payment.employee.legalLastName}`,
    };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[payments.ts:requeuePayment]", _msg);
    return { error: _msg };
  }
}

/**
 * Mark a single pending payment as completed (paid).
 * Uses atomic updateMany with status precondition to prevent double-processing.
 */
export async function markSinglePaymentPaid(paymentId: string) {
  try {
    const session = await requireOrg();
    if (!["super_admin", "admin"].includes(session.orgRole)) {
      throw new HriqError("HRIQ-0105", "Only admins can mark payments as paid");
    }

    const payment = await database.payment.findFirst({
      where: { id: paymentId, employee: { organizationId: session.orgId } },
      select: { id: true, status: true, amount: true, employee: { select: { legalFirstName: true, legalLastName: true } } },
    });
    if (!payment) throw new HriqError("HRIQ-0801", "Payment not found");
    if (payment.status !== "pending") {
      throw new HriqError("HRIQ-0803", `Cannot mark a ${payment.status} payment as paid`);
    }

    const result = await database.payment.updateMany({
      where: { id: paymentId, status: "pending", employee: { organizationId: session.orgId } },
      data: {
        status: "completed",
        paymentDate: new Date(),
        processedByUserId: session.userId,
        processedByName: session.name ?? undefined,
      },
    });
    if (result.count === 0) throw new HriqError("HRIQ-0803", "Payment was already modified");

    revalidatePath("/[orgSlug]/payments", "page");
    revalidatePath("/[orgSlug]/payroll", "page");

    return {
      paid: true,
      name: `${payment.employee.legalFirstName} ${payment.employee.legalLastName}`,
      amount: payment.amount,
    };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[payments.ts:markSinglePaymentPaid]", _msg);
    return { error: _msg };
  }
}

/**
 * Delete a payment record. Allowed for pending, processing, failed, and cancelled statuses.
 * Completed payments cannot be deleted.
 */
export async function deletePayment(paymentId: string) {
  try {
    const session = await requireOrg();
    if (!["super_admin", "admin"].includes(session.orgRole)) {
      throw new HriqError("HRIQ-0105", "Only admins can delete payments");
    }

    const payment = await database.payment.findFirst({
      where: { id: paymentId, employee: { organizationId: session.orgId } },
      select: { id: true, status: true, amount: true, employee: { select: { legalFirstName: true, legalLastName: true } } },
    });
    if (!payment) throw new HriqError("HRIQ-0801", "Payment not found");

    if (payment.status === "completed") {
      throw new HriqError("HRIQ-0803", "Cannot delete a completed payment. Requeue it first if you need to remove it.");
    }

    await database.payment.delete({ where: { id: paymentId } });

    revalidatePath("/[orgSlug]/payments", "page");
    revalidatePath("/[orgSlug]/payroll", "page");

    return {
      deleted: true,
      name: `${payment.employee.legalFirstName} ${payment.employee.legalLastName}`,
      amount: payment.amount,
    };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[payments.ts:deletePayment]", _msg);
    return { error: _msg };
  }
}

/**
 * Get (or regenerate) the Stripe Checkout URL for a PPP payment.
 * Looks up the matching client invoice line item for this payment's employee+period.
 * If the checkout link is expired or missing, regenerates it.
 */
export async function getPPPCheckoutUrl(paymentId: string): Promise<{ url: string } | { error: string }> {
  try {
    const session = await requireOrg();
    if (!["super_admin", "admin"].includes(session.orgRole)) {
      return { error: "Only admins can access payment links" };
    }

    const payment = await database.payment.findFirst({
      where: { id: paymentId, employee: { organizationId: session.orgId } },
      select: { employeeId: true, periodStart: true, periodEnd: true },
    });
    if (!payment || !payment.periodStart || !payment.periodEnd) {
      return { error: "Payment not found" };
    }

    // Find the matching invoice line item (unpaid first)
    const lineItem = await database.clientInvoiceLineItem.findFirst({
      where: {
        employeeId: payment.employeeId,
        clientInvoice: {
          organizationId: session.orgId,
          periodStart: payment.periodStart,
          periodEnd: payment.periodEnd,
        },
        paymentStatus: { not: "paid" },
      },
      select: { id: true, paymentLink: true, clientInvoiceId: true },
      orderBy: { createdAt: "desc" },
    });

    if (!lineItem) {
      // Check if there's an already-paid line item for this period
      const paidItem = await database.clientInvoiceLineItem.findFirst({
        where: {
          employeeId: payment.employeeId,
          clientInvoice: {
            organizationId: session.orgId,
            periodStart: payment.periodStart,
            periodEnd: payment.periodEnd,
          },
          paymentStatus: "paid",
        },
        select: { id: true },
      });
      if (paidItem) {
        // Already paid — auto-mark this payment as completed
        await database.payment.updateMany({
          where: { id: paymentId, status: "pending" },
          data: { status: "completed", paymentDate: new Date(), paymentMethod: "stripe_connect", payoutProvider: "stripe_connect" },
        });
        return { error: "This contractor was already paid for this period. Payment marked as complete." };
      }
      return { error: "No invoice found for this payment. Approve the timesheet to generate one." };
    }

    // If link exists, return it
    if (lineItem.paymentLink) {
      return { url: lineItem.paymentLink };
    }

    // No link — try to regenerate
    const { createPPPPaymentLinks } = await import("./stripe");
    const result = await createPPPPaymentLinks(lineItem.clientInvoiceId);
    if ("error" in result) {
      return { error: result.error };
    }

    // Find the link for this specific line item
    const link = result.links.find((l) => l.lineItemId === lineItem.id);
    if (link) {
      return { url: link.url };
    }

    // Check errors for this contractor
    const err = result.errors.find((e) => e.contractorName);
    return { error: err?.reason ?? "Failed to create payment link. Check contractor's Stripe account." };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[payments.ts:getPPPCheckoutUrl]", _msg);
    return { error: _msg };
  }
}
