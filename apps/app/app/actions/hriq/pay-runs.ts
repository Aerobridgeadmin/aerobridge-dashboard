"use server";

import { revalidatePath } from "next/cache";

import { requireRole, requireOrg, getSessionContext } from "@repo/auth/session";
import { database } from "@repo/database";
import { HriqError } from "@/lib/hriq/errors";
import { getSupabaseAdmin, RL_ORG_ID } from "./constants";

//  Types 

type CreatePayRunInput = {
  organizationId: string;
  name: string;
  periodStart: string; // ISO date
  periodEnd: string;
  rlFeeType?: string;
  rlFeeAmount?: number;
  notes?: string;
};

//  Create Pay Run 

export async function createPayRun(input: CreatePayRunInput) {
  try {
    const session = await requireRole("super_admin");
    const ctx = await getSessionContext();

    const org = await database.organization.findUnique({
      where: { id: input.organizationId },
      select: { id: true, name: true },
    });
    if (!org) throw new HriqError("HRIQ-1601", "Organization not found");

    const periodStart = new Date(input.periodStart as any);
    const periodEnd = new Date(input.periodEnd as any);

    // Pull approved timesheets for this org and period — exclude any already in a pay run
    const submissions = await database.timesheetSubmission.findMany({
      where: {
        status: "approved",
        employee: { organizationId: org.id },
        period: {
          startDate: { lte: periodEnd },
          endDate: { gte: periodStart },
        },
        // Exclude timesheets already referenced by a PayRunItem in any non-cancelled run
        payRunItems: { none: { payRun: { status: { not: "cancelled" } } } },
      },
      include: {
        employee: {
          select: {
            id: true,
            legalFirstName: true,
            legalLastName: true,
            hourlyRate: true,
            currency: true,
          },
        },
      },
    });

    // Also include active employees with no timesheet (salary-based)
    const employeesWithTimesheets = new Set(submissions.map((s) => s.employeeId));
    const salariedEmployees = await database.employee.findMany({
      where: {
        organizationId: org.id,
        employmentStatus: "active",
        employmentType: "salary",
        id: { notIn: Array.from(employeesWithTimesheets) },
      },
      select: {
        id: true,
        legalFirstName: true,
        legalLastName: true,
        hourlyRate: true,
        currency: true,
      },
    });

    // Build items
    const items: Array<{
      employeeId: string;
      timesheetSubmissionId: string | null;
      description: string;
      hoursWorked: number | null;
      hourlyRate: number | null;
      grossAmount: number;
      deductions: number;
      netAmount: number;
    }> = [];

    for (const sub of submissions) {
      const rate = Number(sub.employee.hourlyRate ?? 0);
      const hours = Number(sub.totalHours ?? 0);
      const bonusTotal = Number(sub.bonusTotal ?? 0);
      if (!Number.isFinite(rate) || !Number.isFinite(hours)) {
        console.error(`[PayRun] Invalid rate/hours for ${sub.employeeId}: rate=${sub.employee.hourlyRate}, hours=${sub.totalHours}`);
        continue; // Skip this employee — don't create a payment with NaN
      }
      const gross = rate * hours + bonusTotal;
      items.push({
        employeeId: sub.employeeId,
        timesheetSubmissionId: sub.id,
        description: `${sub.employee.legalFirstName} ${sub.employee.legalLastName} — Timesheet`,
        hoursWorked: hours,
        hourlyRate: rate,
        grossAmount: gross,
        deductions: 0,
        netAmount: gross,
      });
    }

    // Salaried employees without timesheets
    for (const emp of salariedEmployees) {
      const rate = Number(emp.hourlyRate ?? 0);
      items.push({
        employeeId: emp.id,
        timesheetSubmissionId: null,
        description: `${emp.legalFirstName} ${emp.legalLastName} — Salary`,
        hoursWorked: null,
        hourlyRate: rate,
        grossAmount: rate, // salary rate is monthly/period rate
        deductions: 0,
        netAmount: rate,
      });
    }

    const totalAmount = items.reduce((sum, i) => sum + i.grossAmount, 0);

    // Auto-fill fee from active service agreement if not explicitly provided
    let feeType = input.rlFeeType;
    let feeAmount = input.rlFeeAmount;
    if (!feeType || feeAmount == null) {
      const agreement = await database.serviceAgreement.findFirst({
        where: { organizationId: org.id, status: "active" },
        orderBy: { createdAt: "desc" },
        select: { feeType: true, feeAmount: true },
      });
      if (agreement) {
        feeType = feeType ?? agreement.feeType;
        feeAmount = feeAmount ?? Number(agreement.feeAmount);
      }
    }

    const rlFeeTotal = calculateFee(feeType, feeAmount, totalAmount, items.length);
    const grandTotal = totalAmount + rlFeeTotal;

    // Prevent duplicate pay runs for the same org+period
    const existingRun = await database.payRun.findFirst({
      where: {
        organizationId: org.id,
        periodStart,
        periodEnd,
        status: { not: "cancelled" },
      },
      select: { id: true, name: true },
    });
    if (existingRun) {
      throw new HriqError("HRIQ-0910", `A pay run already exists for this period: "${existingRun.name}"`);
    }

    const payRun = await database.payRun.create({
      data: {
        organizationId: org.id,
        name: input.name,
        periodStart,
        periodEnd,
        status: "draft",
        totalAmount: totalAmount.toFixed(2),
        currency: "USD",
        rlFeeType: feeType ?? null,
        rlFeeAmount: feeAmount != null ? feeAmount.toFixed(2) : null,
        rlFeeTotal: rlFeeTotal.toFixed(2),
        grandTotal: grandTotal.toFixed(2),
        notes: input.notes ?? null,
        createdByUserId: session.userId,
        createdByName: ctx?.name ?? null,
        items: {
          create: items.map((item) => ({
            employeeId: item.employeeId,
            timesheetSubmissionId: item.timesheetSubmissionId,
            description: item.description,
            hoursWorked: item.hoursWorked != null ? item.hoursWorked.toFixed(2) : null,
            hourlyRate: item.hourlyRate != null ? item.hourlyRate.toFixed(2) : null,
            grossAmount: item.grossAmount.toFixed(2),
            deductions: item.deductions.toFixed(2),
            netAmount: item.netAmount.toFixed(2),
          })),
        },
      },
      include: { items: true },
    });

    revalidatePath("/[orgSlug]/payroll", "page");

    return payRun;

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[pay-runs.ts:createPayRun]", _msg);
    import("@/lib/hriq/sentry").then(({ captureServerException }) => captureServerException(err, { action: "createPayRun" })).catch(() => {});
    return { error: _msg };
  }
}

//  Approve Pay Run (client action) 

export async function approvePayRun(payRunId: string, managementPassword: string) {
  try {
    const session = await requireOrg();
    const ctx = await getSessionContext();

    // Management password only required for RL internal pay runs
    const isRL = session.orgId === RL_ORG_ID;
    if (isRL && managementPassword) {
      const { verifyManagementPassword } = await import("./management-auth");
      await verifyManagementPassword(managementPassword);
    } else if (isRL && !managementPassword) {
      throw new HriqError("HRIQ-0850", "Management password required for RL pay runs");
    }

    const payRun = await database.payRun.findUnique({
      where: { id: payRunId },
      select: { status: true, organizationId: true },
    });

    if (!payRun) throw new HriqError("HRIQ-3001", "Pay run not found");
    if (payRun.organizationId !== session.orgId) throw new HriqError("HRIQ-3005", "Not authorized for this pay run");
    if (payRun.status !== "pending_approval") throw new HriqError("HRIQ-3006", "Pay run is not pending approval");

    // Atomic status transition to prevent double-approval
    const claimed = await database.payRun.updateMany({
      where: { id: payRunId, status: "pending_approval", organizationId: session.orgId },
      data: {
        status: "approved",
        approvedByUserId: session.userId,
        approvedByName: ctx?.name ?? null,
        approvedAt: new Date(),
      },
    });
    if (claimed.count === 0) throw new HriqError("HRIQ-3006", "Pay run was already approved or modified");

    // Auto-generate pay run summary document and store in RL documents
    try {
      await generatePayRunSummaryDoc(payRunId);
    } catch (err) {
      console.error("[pay-runs.ts:approvePayRun] Summary doc generation failed (non-blocking):", err);
    }

    revalidatePath("/[orgSlug]/payroll", "page");

    return { success: true };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[pay-runs.ts:approvePayRun]", _msg);
    return { error: _msg };
  }
}

//  Reject Pay Run (client action) 

export async function rejectPayRun(payRunId: string, reason: string) {
  try {
    const session = await requireOrg();

    const payRun = await database.payRun.findUnique({
      where: { id: payRunId },
      select: { status: true, organizationId: true },
    });

    if (!payRun) throw new HriqError("HRIQ-3001", "Pay run not found");
    if (payRun.organizationId !== session.orgId) throw new HriqError("HRIQ-3005", "Not authorized for this pay run");
    if (payRun.status !== "pending_approval") throw new HriqError("HRIQ-3006", "Pay run is not pending approval");

    // Atomic status transition to prevent rejecting an already-approved pay run
    const claimed = await database.payRun.updateMany({
      where: { id: payRunId, status: "pending_approval", organizationId: session.orgId },
      data: {
        status: "draft",
        rejectedAt: new Date(),
        rejectionReason: reason || "No reason provided",
      },
    });
    if (claimed.count === 0) throw new HriqError("HRIQ-3006", "Pay run was already approved or modified");

    revalidatePath("/[orgSlug]/payroll", "page");

    return { success: true };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[pay-runs.ts:rejectPayRun]", _msg);
    return { error: _msg };
  }
}

//  Complete Pay Run (mark paid, generate paystubs) 

export async function completePayRun(payRunId: string, managementPassword?: string) {
  try {
    await requireRole("super_admin");
    if (managementPassword) {
      const { verifyManagementPassword } = await import("./management-auth");
      await verifyManagementPassword(managementPassword);
    }

    const payRun = await database.payRun.findUnique({
      where: { id: payRunId },
      select: { status: true },
    });

    if (!payRun) throw new HriqError("HRIQ-3001", "Pay run not found");
    if (payRun.status !== "approved" && payRun.status !== "processing") throw new HriqError("HRIQ-3007", "Pay run must be approved before completing");

    // Atomic status transition to prevent double-completion
    const claimed = await database.payRun.updateMany({
      where: { id: payRunId, status: { in: ["approved", "processing"] } },
      data: { status: "processing" },
    });
    if (claimed.count === 0) throw new HriqError("HRIQ-3007", "Pay run is already being completed or was modified");

    const { completePayRunInternal } = await import("./pay-runs-internal");

    revalidatePath("/[orgSlug]/payroll", "page");
    revalidatePath("/[orgSlug]/payments", "page");
    return completePayRunInternal(payRunId);

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[pay-runs.ts:completePayRun]", _msg);
    import("@/lib/hriq/sentry").then(({ captureServerException }) => captureServerException(err, { action: "completePayRun" })).catch(() => {});
    return { error: _msg };
  }
}

//  Helpers 

function calculateFee(feeType: string | undefined, feeAmount: number | undefined, totalAmount: number, contractorCount: number): number {
  if (!feeType || !feeAmount) return 0;
  switch (feeType) {
    case "percentage":
      return totalAmount * (feeAmount / 100);
    case "per_contractor":
      return feeAmount * contractorCount;
    case "flat":
      return feeAmount;
    default:
      return 0;
  }
}

async function recalculatePayRunTotals(payRunId: string) {
  const items = await database.payRunItem.findMany({
    where: { payRunId },
    select: { grossAmount: true, netAmount: true },
  });

  const totalAmount = items.reduce((sum, i) => sum + Number(i.grossAmount), 0);

  const payRun = await database.payRun.findUnique({
    where: { id: payRunId },
    select: { rlFeeType: true, rlFeeAmount: true },
  });

  const rlFeeTotal = payRun
    ? calculateFee(payRun.rlFeeType ?? undefined, payRun.rlFeeAmount ? Number(payRun.rlFeeAmount) : undefined, totalAmount, items.length)
    : 0;

  // Use updateMany with status precondition to prevent race conditions
  // (e.g., two admins recalculating simultaneously, or recalculating after approval)
  await database.payRun.updateMany({
    where: { id: payRunId, status: { in: ["draft", "pending_approval"] } },
    data: {
      totalAmount: totalAmount.toFixed(2),
      rlFeeTotal: rlFeeTotal.toFixed(2),
      grandTotal: (totalAmount + rlFeeTotal).toFixed(2),
    },
  });
}

//  Pay Run Summary Document Generator 

/**
 * Generate an HTML summary of an approved pay run and upload to Supabase storage.
 * Also creates a Document record linked to RL for easy access.
 */
async function generatePayRunSummaryDoc(payRunId: string) {
  const payRun = await database.payRun.findUnique({
    where: { id: payRunId },
    include: {
      organization: { select: { name: true } },
      items: {
        include: {
          employee: { select: { legalFirstName: true, legalLastName: true, employeeNumber: true, hourlyRate: true, currency: true } },
          timesheet: { select: { totalHours: true, bonusTotal: true, period: { select: { name: true } } } },
        },
        orderBy: { employee: { legalLastName: "asc" } },
      },
    },
  });
  if (!payRun) return;

  const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const fmtMoney = (v: number | any) => `$${Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const rows = payRun.items.map((item) => {
    const emp = item.employee;
    const ts = item.timesheet;
    return `<tr>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb">${emp.legalFirstName} ${emp.legalLastName}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb">${emp.employeeNumber ?? "—"}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:right">${ts ? Number(ts.totalHours) : "—"}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:right">${emp.hourlyRate ? fmtMoney(emp.hourlyRate) : "—"}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:right">${fmtMoney(item.grossAmount)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:right">${fmtMoney(item.deductions)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600">${fmtMoney(item.netAmount)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb">${ts?.period?.name ?? "—"}</td>
    </tr>`;
  });

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Pay Run Summary — ${payRun.name}</title>
<style>body{font-family:'Inter',system-ui,sans-serif;margin:40px;color:#1a1a2e}h1{font-size:20px;margin-bottom:4px}table{width:100%;border-collapse:collapse;font-size:13px;margin-top:16px}th{text-align:left;padding:8px 10px;background:#f4f5f7;border-bottom:2px solid #d1d5db;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280}td{font-size:13px}.meta{display:flex;gap:32px;margin:12px 0;font-size:13px;color:#6b7280}.meta strong{color:#1a1a2e}.totals{margin-top:16px;text-align:right;font-size:14px}</style></head>
<body>
<h1>Pay Run Summary</h1>
<h2 style="font-size:16px;color:#6b7280;font-weight:400;margin-top:0">${payRun.name} — ${payRun.organization.name}</h2>
<div class="meta">
  <div><strong>Period:</strong> ${fmtDate(payRun.periodStart)} – ${fmtDate(payRun.periodEnd)}</div>
  <div><strong>Status:</strong> Approved</div>
  <div><strong>Approved:</strong> ${payRun.approvedAt ? fmtDate(payRun.approvedAt) : "—"} ${payRun.approvedByName ? `by ${payRun.approvedByName}` : ""}</div>
  <div><strong>Contractors:</strong> ${payRun.items.length}</div>
</div>
<table>
  <thead><tr>
    <th>Contractor</th><th>ID</th><th style="text-align:right">Hours</th><th style="text-align:right">Rate</th>
    <th style="text-align:right">Gross</th><th style="text-align:right">Deductions</th><th style="text-align:right">Net</th><th>Period</th>
  </tr></thead>
  <tbody>${rows.join("")}</tbody>
</table>
<div class="totals">
  <div>Subtotal: <strong>${fmtMoney(payRun.totalAmount)}</strong></div>
  ${payRun.rlFeeTotal && Number(payRun.rlFeeTotal) > 0 ? `<div>RL Fee (${payRun.rlFeeType ?? ""}${payRun.rlFeeAmount ? " " + fmtMoney(payRun.rlFeeAmount) : ""}): <strong>${fmtMoney(payRun.rlFeeTotal)}</strong></div>` : ""}
  <div style="font-size:16px;margin-top:8px">Grand Total: <strong>${fmtMoney(payRun.grandTotal)}</strong></div>
</div>
<div style="margin-top:24px;font-size:11px;color:#9ca3af">Generated ${new Date().toISOString()} by HRIQ</div>
</body></html>`;

  // Upload to Supabase storage
  const supabase = getSupabaseAdmin();
  const storagePath = `rl/pay-run-summaries/${payRunId}.html`;
  const { error: uploadError } = await supabase.storage
    .from("org-documents")
    .upload(storagePath, html, { contentType: "text/html", upsert: true });

  if (uploadError) {
    console.error("[pay-runs.ts] Summary upload failed:", uploadError.message);
    return;
  }

  // Update pay run with doc path
  await database.payRun.update({
    where: { id: payRunId },
    data: { summaryDocPath: storagePath },
  });
}
