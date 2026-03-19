"use server";

import { revalidatePath } from "next/cache";
import { database } from "@repo/database";

export async function completePayRunInternal(payRunId: string) {
  try {
    const payRun = await database.payRun.findUnique({
      where: { id: payRunId },
      include: {
        items: {
          include: {
            employee: { select: { id: true, legalFirstName: true, legalLastName: true, hourlyRate: true, currency: true } },
          },
        },
      },
    });

    if (!payRun) throw new Error(`Pay run ${payRunId} not found`);
    if (payRun.status === "completed") return { success: true, paymentsCreated: 0 };

    // Create all payment records in a single transaction to prevent partial completion
    // Use an atomic status check inside the transaction to prevent double-processing
    // from concurrent webhook deliveries
    const paymentIds: string[] = [];

    await database.$transaction(async (tx: any) => {
      // Re-check status inside the transaction to prevent race condition
      const current = await tx.payRun.findUnique({
        where: { id: payRunId },
        select: { status: true },
      });
      if (current?.status === "completed") return;
      for (const item of payRun.items) {
        const payment = await tx.payment.create({
          data: {
            employeeId: item.employeeId,
            paymentType: "salary",
            amount: item.netAmount.toString(),
            currency: payRun.currency,
            periodStart: payRun.periodStart,
            periodEnd: payRun.periodEnd,
            paymentDate: new Date(),
            status: "completed",
            hoursWorked: item.hoursWorked?.toString() ?? null,
            hourlyRate: item.hourlyRate?.toString() ?? null,
            description: `Pay Run: ${payRun.name}`,
            processedByUserId: payRun.createdByUserId ?? null,
            processedByName: payRun.createdByName ?? null,
          },
        });

        paymentIds.push(payment.id);

        // Link payment to pay run item
        await tx.payRunItem.update({
          where: { id: item.id },
          data: { paymentId: payment.id },
        });
      }

      await tx.payRun.update({
        where: { id: payRunId },
        data: {
          status: "completed",
          paidAt: new Date(),
        },
      });
    });

    // Generate paystubs outside the transaction (non-blocking, best-effort)
    const { generateAndDeliverPaystub } = await import("./paystub");
    for (const pid of paymentIds) {
      try {
        await generateAndDeliverPaystub(pid);
      } catch (err) {
        console.error(`[PayRun] Paystub failed for payment ${pid}:`, err);
      }
    }

    revalidatePath("/[orgSlug]/payroll", "page");
    revalidatePath("/[orgSlug]/payments", "page");

    return { success: true, paymentsCreated: payRun.items.length };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[pay-runs-internal.ts:completePayRunInternal]", _msg);
    import("@/lib/hriq/sentry").then(({ captureServerException }) => captureServerException(err, { action: "completePayRunInternal" })).catch(() => {});
    return { error: _msg };
  }
}
