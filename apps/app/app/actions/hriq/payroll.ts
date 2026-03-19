"use server";
import { getContractorEmail } from "@/lib/hriq/utils";

import { requireOrg } from "@repo/auth/session";
import { database } from "@repo/database";
import { revalidatePath } from "next/cache";
import { DEFAULT_PASSWORD, getSupabaseAdmin } from "./constants";
import { HriqError } from "@/lib/hriq/errors";

//  Period Generation 

/**
 * Generate semi-monthly pay periods for a given year.
 *
 * Cutoff pattern (matching the company timesheet template):
 *   - 15th payout: work period = 26th of previous month  10th of current month
 *   - 30th payout: work period = 11th  25th of current month
 *     (For February, payout date adjusts to 28th/29th)
 *
 * Naming: "Jan 15, 2026 Payout", "Jan 30, 2026 Payout", etc.
 * Only generates periods up to one month ahead of today.
 * Idempotent: skips periods whose date range already exists.
 */
export async function generatePeriodsForYear(year: number) {
  try {
    const session = await requireOrg();
    if (!["super_admin", "admin"].includes(session.orgRole)) {
      throw new HriqError("HRIQ-0105", "Only admins can generate pay periods");
    }

    if (year < 2024 || year > 2030) throw new HriqError("HRIQ-0902");

    const orgId = session.orgId;
    const existing = await database.timesheetPeriod.findMany({
      where: { organizationId: orgId },
      select: { startDate: true, endDate: true },
    });

    const existingSet = new Set(
      existing.map((p: any) => `${p.startDate.toISOString().slice(0, 10)}|${p.endDate.toISOString().slice(0, 10)}`)
    );

    const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const periods: { name: string; startDate: Date; endDate: Date }[] = [];

    // Only generate up to 1 month ahead of today
    const now = new Date();
    const maxMonth = now.getFullYear() === year
      ? Math.min(now.getMonth() + 1, 11)  // current month + 1, capped at December
      : now.getFullYear() > year
        ? 11  // past year  generate all months
        : -1; // future year  generate nothing

    if (maxMonth < 0) return { created: 0, skipped: 0, total: 0, year };

    for (let month = 0; month <= maxMonth; month++) {
      //  15th payout: cutoff = 26th of previous month  10th of current month 
      const prevMonth = month === 0 ? 11 : month - 1;
      const prevYear = month === 0 ? year - 1 : year;
      const firstStart = new Date(prevYear, prevMonth, 26);
      const firstEnd = new Date(year, month, 10);

      //  30th payout: cutoff = 11th  25th of current month 
      const secondStart = new Date(year, month, 11);
      const secondEnd = new Date(year, month, 25);

      // Payout date for the "30th" — use last day of month for Feb
      const lastDay = new Date(year, month + 1, 0).getDate();
      const payoutDay30 = Math.min(30, lastDay);

      periods.push(
        {
          name: `${MONTH_NAMES[month]} 15, ${year} Payout`,
          startDate: firstStart,
          endDate: firstEnd,
        },
        {
          name: `${MONTH_NAMES[month]} ${payoutDay30}, ${year} Payout`,
          startDate: secondStart,
          endDate: secondEnd,
        }
      );
    }

    let created = 0;
    let skipped = 0;

    const toCreate: { organizationId: string; name: string; startDate: Date; endDate: Date; status: string }[] = [];

    for (const p of periods) {
      const key = `${p.startDate.toISOString().slice(0, 10)}|${p.endDate.toISOString().slice(0, 10)}`;
      if (existingSet.has(key)) {
        skipped++;
        continue;
      }
      toCreate.push({
        organizationId: orgId,
        name: p.name,
        startDate: p.startDate,
        endDate: p.endDate,
        status: "open",
      });
    }

    if (toCreate.length > 0) {
      await database.timesheetPeriod.createMany({ data: toCreate });
      created = toCreate.length;
    }

    if (created > 0) {
      revalidatePath("/[orgSlug]/timesheets", "page");
      revalidatePath("/[orgSlug]/payroll", "page");
    }

    return { created, skipped, total: periods.length, year };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[payroll.ts:generatePeriodsForYear]", _msg);
    return { error: _msg };
  }
}

//  Payroll Summary 

export type PayrollSummaryItem = {
  periodId: string;
  periodName: string;
  startDate: string;
  endDate: string;
  periodStatus: string;
  totalSubmissions: number;
  approved: number;
  pending: number;
  rejected: number;
  totalHours: number;
  totalCost: number;
  unpaidApproved: number;
  unpaidAmount: number;
};

/**
 * Mark all pending payments for a period as completed (batch pay).
 */
export async function updatePaymentAmount(paymentId: string, amount: string) {
  try {
    const session = await requireOrg();
    const num = Number(amount);
    if (!Number.isFinite(num) || num <= 0) throw new HriqError("HRIQ-0804", "Invalid payment amount");

    const payment = await database.payment.findFirst({
      where: { id: paymentId, employee: { organizationId: session.orgId } },
    });
    if (!payment) throw new HriqError("HRIQ-0801", "Payment not found");
    if (payment.status === "completed") throw new HriqError("HRIQ-0803", "Cannot edit a completed payment");

    const updated = await database.payment.updateMany({
      where: { id: paymentId, status: { not: "completed" } },
      data: { amount: String(num) },
    });
    if (updated.count === 0) throw new HriqError("HRIQ-0803", "Cannot edit a completed payment");

    revalidatePath("/[orgSlug]/payments", "page");
    revalidatePath("/[orgSlug]/payroll", "page");

    return { success: true };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[payroll.ts:updatePaymentAmount]", _msg);
    return { error: _msg };
  }
}

export async function batchMarkPaid(periodId: string) {
  try {
    const session = await requireOrg();
    if (!["super_admin", "admin"].includes(session.orgRole)) {
      throw new HriqError("HRIQ-0105", "Only admins can mark payments as paid");
    }

    const period = await database.timesheetPeriod.findFirst({
      where: { id: periodId, organizationId: session.orgId },
    });
    if (!period) throw new HriqError("HRIQ-0901");

    // Enforce: if there are client invoices for this period in THIS org, they must be paid first
    const unpaidInvoices = await database.clientInvoice.findMany({
      where: {
        organizationId: session.orgId,
        periodStart: period.startDate,
        periodEnd: period.endDate,
        status: { notIn: ["paid", "void"] },
      },
      select: { invoiceNumber: true, status: true, organization: { select: { name: true } } },
    });
    if (unpaidInvoices.length > 0) {
      const names = unpaidInvoices.map((i: any) => `${i.invoiceNumber} (${i.organization?.name ?? "Unknown"} — ${i.status})`).join(", ");
      throw new HriqError("HRIQ-0805", `Client invoices must be paid before releasing contractor payments: ${names}`);
    }

    const result = await database.payment.updateMany({
      where: {
        employee: { organizationId: session.orgId },
        periodStart: period.startDate,
        periodEnd: period.endDate,
        status: "pending",
      },
      data: {
        status: "completed",
        paymentDate: new Date(),
        processedByUserId: session.userId,
        processedByName: session.name ?? undefined,
      },
    });

    // Generate paystubs and send emails
    if (result.count > 0) {
      try {
        await generatePaystubsForPeriod(session.orgId, period.startDate, period.endDate);
      } catch (err) {
        console.error("[Payroll] Paystub generation failed:", err);
      }

      // Sync to QuickBooks (RL internal only, non-blocking)
      const isRL = session.orgId === (process.env.RL_ORGANIZATION_ID ?? "org_rl_001");
      if (isRL) {
        try {
          const completedPayments = await database.payment.findMany({
            where: {
              employee: { organizationId: session.orgId },
              periodStart: period.startDate,
              periodEnd: period.endDate,
              status: "completed",
              qbSyncedAt: null,
            },
            select: { id: true },
          });
          const { syncPaymentToQuickBooks } = await import("./quickbooks");
          for (const p of completedPayments) {
            try {
              await syncPaymentToQuickBooks(p.id);
            } catch (e) {
              console.error(`[Payroll] QB sync failed for ${p.id}:`, e);
            }
          }
        } catch (e) {
          console.error("[Payroll] QB batch sync error:", e);
        }
      }
    }

    revalidatePath("/[orgSlug]/payments", "page");
    revalidatePath("/[orgSlug]/payroll", "page");

    return { paid: result.count, periodName: period.name };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[payroll.ts:batchMarkPaid]", _msg);
    return { error: _msg };
  }
}

async function generatePaystubsForPeriod(orgId: string, periodStart: Date, periodEnd: Date) {
  const payments = await database.payment.findMany({
    where: {
      employee: { organizationId: orgId },
      periodStart,
      periodEnd,
      status: "completed",
    },
    select: { id: true },
  });

  const { generateAndDeliverPaystub } = await import("./paystub");
  for (const payment of payments) {
    try {
      await generateAndDeliverPaystub(payment.id);
    } catch (err) {
      console.error("[Payroll] Paystub failed for payment", payment.id, err);
      // Fallback: send simple notification
      try {
        const p = await database.payment.findUnique({
          where: { id: payment.id },
          include: { employee: { select: { legalFirstName: true, personalEmail: true, workEmail: true } } },
        });
        const email = getContractorEmail(p?.employee ?? {});
        if (email && p) {
          const { sendPaymentNotificationEmail } = await import("./send-email");
          try {
            await sendPaymentNotificationEmail(email.trim(), p.employee.legalFirstName, p.amount, p.currency, p.paymentType);
          } catch (emailErr) {
            console.error("[HRIQ] Email send failed (non-blocking):", emailErr);
          }
        }
      } catch (e2) {
        console.error("[Payroll] Fallback notification also failed:", e2);
      }
    }
  }
}

//  Bulk Account Management 

/**
 * Reset password for a contractor's dashboard account.
 */
export async function resetContractorPassword(employeeId: string, newPassword?: string) {
  try {
    const session = await requireOrg();

    const employee = await database.employee.findFirst({
      where: { id: employeeId, organizationId: session.orgId },
      select: { id: true, linkedUserId: true, legalFirstName: true, legalLastName: true, preferredName: true, personalEmail: true, workEmail: true },
    });
    if (!employee) throw new HriqError("HRIQ-0201");
    if (!employee.linkedUserId) throw new HriqError("HRIQ-0209");

    const password = newPassword || DEFAULT_PASSWORD;

    const supabaseAdmin = getSupabaseAdmin();
    // Reset password AND set metadata flags so the force-password-change modal shows on next login
    const { error } = await supabaseAdmin.auth.admin.updateUserById(employee.linkedUserId, {
      password,
      user_metadata: { isFirstLogin: true, passwordChanged: false },
    });
    if (error) throw new HriqError("HRIQ-1506", `Failed to reset password: ${error.message}`);

    // Email the contractor their temporary password
    const email = getContractorEmail(employee);
    if (email) {
      try {
        const { sendViaGmail } = await import("./send-email");
        const { layout, heading, greeting, paragraph, primaryButton } = await import("./email-templates");
        const { APP_URL, normalizeAppUrl } = await import("./constants");
        const appUrl = normalizeAppUrl(APP_URL);
        const name = employee.preferredName ?? employee.legalFirstName;

        const html = layout(
          heading("Your Password Has Been Reset") +
          greeting(name) +
          paragraph("Your dashboard password has been reset. Please use the temporary password below to log in, then you'll be asked to create a new one.") +
          `<div style="margin:20px 0;padding:16px 20px;background:#f4f5f7;border-radius:8px;text-align:center">
            <p style="margin:0 0 4px;font-size:12px;color:#6b7280">Temporary Password</p>
            <p style="margin:0;font-size:20px;font-weight:700;letter-spacing:1px;font-family:monospace;color:#1a1a2e">${password}</p>
          </div>` +
          paragraph("You will be required to change this password when you next log in.") +
          primaryButton("Log In Now", `${appUrl}/sign-in`)
        );

        try {
          await sendViaGmail(email, "Your Password Has Been Reset — Action Required", html);
        } catch (emailErr) {
          console.error("[HRIQ] Password reset email failed (non-blocking):", emailErr);
        }
      } catch (err) {
        console.error("[HRIQ] Password reset email setup failed:", err);
      }
    }

    return { name: `${employee.legalFirstName} ${employee.legalLastName}`, reset: true, emailSent: !!email };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[payroll.ts:resetContractorPassword]", _msg);
    return { error: _msg };
  }
}

/**
 * Bulk provision dashboard accounts for active employees without one.
 */
export async function getUnlinkedEmployees() {
  const session = await requireOrg();

  return database.employee.findMany({
    where: {
      organizationId: session.orgId,
      employmentStatus: "active",
      linkedUserId: null,
      personalEmail: { not: null },
    },
    select: {
      id: true,
      employeeNumber: true,
      legalFirstName: true,
      legalLastName: true,
      personalEmail: true,
    },
    orderBy: { employeeNumber: "asc" },
  });
}
