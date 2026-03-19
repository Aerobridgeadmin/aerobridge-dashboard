"use server";
import { getContractorEmail } from "@/lib/hriq/utils";

import { database } from "@repo/database";
import { requireRole } from "@repo/auth/session";
import { revalidatePath } from "next/cache";
import { HriqError } from "@/lib/hriq/errors";
import { getSupabaseAdmin, getSignedStorageUrl, APP_URL, normalizeAppUrl, RL_ORG_ID } from "./constants";

//  Types 

const PAYOUT_PROVIDERS = ["stripe_connect", "wise", "cadana", "bank_transfer", "paypal", "crypto", "zelle", "other"] as const;
type PayoutProvider = typeof PAYOUT_PROVIDERS[number];

const PROVIDER_LABELS: Record<string, string> = {
  stripe_connect: "Stripe Connect",
  wise: "Wise",
  bank_transfer: "Bank Transfer",
  paypal: "PayPal",
  crypto: "Crypto",
  zelle: "Zelle",
  other: "Other",
};

//  Get Contractor Payment Details 

export async function getContractorPayoutInfo(paymentId: string) {
  try {
    await requireRole("super_admin", "admin");

    const payment = await database.payment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        amount: true,
        currency: true,
        status: true,
        paymentType: true,
        description: true,
        periodStart: true,
        periodEnd: true,
        hoursWorked: true,
        hourlyRate: true,
        employee: {
          select: {
            id: true,
            legalFirstName: true,
            legalLastName: true,
            employeeNumber: true,
            personalEmail: true,
            workEmail: true,
            paymentPlatform: true,
            paymentAccountInfo: true,
            bankName: true,
            bankAccountNumber: true,
            bankAccountName: true,
            bankSwiftCode: true,
            bankRoutingNumber: true,
            debitCardNumber: true,
            bankAddress: true,
            country: true,
            preferredPaymentMethod: true,
            paymentMethodVerified: true,
            stripeAccountId: true,
            stripeAccountStatus: true,
            wiseRecipientId: true,
            wiseTag: true,
            cadanaPersonId: true,
            organization: {
              select: {
                id: true,
                name: true,
                slug: true,
                profile: { select: { paymentMethod: true } },
              },
            },
          },
        },
      },
    });

    if (!payment) throw new HriqError("HRIQ-0801", "Payment not found");
    if (payment.status === "completed") throw new HriqError("HRIQ-0802", "Payment already completed");

    return payment;

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[payouts.ts:getContractorPayoutInfo]", _msg);
    return { error: _msg };
  }
}

//  Process Payout (main flow) 

export async function processContractorPayout(data: {
  paymentId: string;
  provider: string;
  reference: string;
  notes?: string;
  receiptUrl?: string;
  managementPassword?: string;
}) {
  const session = await requireRole("super_admin");
  const { verifyManagementPassword } = await import("./management-auth");
  if (data.managementPassword) await verifyManagementPassword(data.managementPassword);

  // Validate provider
  if (!(PAYOUT_PROVIDERS as unknown as string[]).includes(data.provider)) {
    throw new HriqError("HRIQ-0803", `Invalid payout provider: ${data.provider}`);
  }
  if (!data.reference.trim()) {
    throw new HriqError("HRIQ-0804", "Transaction reference is required");
  }

  // 1. Load payment + employee + org
  const payment = await database.payment.findUnique({
    where: { id: data.paymentId },
    include: {
      employee: {
        include: {
          organization: { include: { profile: true } },
        },
      },
    },
  });

  if (!payment) throw new HriqError("HRIQ-0801", "Payment not found");
  if (payment.status === "completed") throw new HriqError("HRIQ-0802", "Payment already completed");

  // Atomically claim the payment to prevent double-processing from concurrent clicks.
  // Only updates if status is still "pending" — returns null if already claimed.
  // Skip if status is already "processing" (e.g., from processStripeConnectPayout which pre-claims).
  if (payment.status === "pending") {
    const claimed = await database.payment.updateMany({
      where: { id: data.paymentId, status: "pending" },
      data: { status: "processing" },
    });
    if (claimed.count === 0) {
      throw new HriqError("HRIQ-0802", "Payment is already being processed or completed");
    }
  } else if (payment.status !== "processing") {
    throw new HriqError("HRIQ-0802", "Payment is already being processed or completed");
  }

  // Enforce: client invoice for this org+period must be paid before releasing contractor payment
  let payoutSuccess = false;
  try {
  const empOrgId = payment.employee.organizationId;
  if (payment.periodStart && payment.periodEnd && empOrgId && empOrgId !== RL_ORG_ID) {
    const clientInvoice = await database.clientInvoice.findFirst({
      where: {
        organizationId: empOrgId,
        periodStart: payment.periodStart,
        periodEnd: payment.periodEnd,
      },
      select: { status: true, invoiceNumber: true },
    });
    if (clientInvoice && clientInvoice.status !== "paid" && clientInvoice.status !== "void" && clientInvoice.status !== "cancelled") {
      throw new HriqError("HRIQ-0805", `Client invoice ${clientInvoice.invoiceNumber} must be paid before releasing contractor payment (current status: ${clientInvoice.status})`);
    }
  }

  const emp = payment.employee;
  const org = emp.organization;
  const providerLabel = PROVIDER_LABELS[data.provider] ?? data.provider;
  const amount = Number(payment.amount);

  // 2. Generate invoice number: INV-YYYYMM-XXXX
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const seq = await database.payment.count({
    where: {
      status: { in: ["completed", "processing"] },
      paymentDate: { gte: new Date(now.getFullYear(), now.getMonth(), 1) },
    },
  });
  const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
  const invoiceNumber = `INV-${yearMonth}-${String(seq + 1).padStart(4, "0")}-${rand}`;

  // 3. Generate invoice PDF
  let invoiceUrl: string | null = null;
  let invoiceBuffer: Buffer | null = null;
  let invoiceStoragePath: string | null = null;
  try {
    invoiceBuffer = await generateInvoicePdf({
      invoiceNumber,
      invoiceDate: fmtDateFull(now),
      dueDate: fmtDateFull(now), // Already paid
      companyName: org?.name ?? "Client Organization",
      companyAddress: org?.profile?.address ?? "",
      companyLogoUrl: org?.logoUrl ?? null,
      contractorName: `${emp.legalFirstName} ${emp.legalLastName}`,
      contractorEmail: getContractorEmail(emp) ?? "",
      contractorAddress: [emp.streetAddress, emp.city, emp.stateProvince, emp.postalCode, emp.country].filter(Boolean).join(", "),
      contractorId: emp.employeeNumber,
      description: payment.description ?? `${payment.paymentType} payment`,
      periodStart: payment.periodStart ? fmtDateFull(payment.periodStart) : null,
      periodEnd: payment.periodEnd ? fmtDateFull(payment.periodEnd) : null,
      hours: payment.hoursWorked ? Number(payment.hoursWorked) : null,
      rate: payment.hourlyRate ? Number(payment.hourlyRate) : null,
      amount,
      currency: payment.currency,
      paymentMethod: providerLabel,
      transactionRef: data.reference,
      status: "PAID",
    });

    // Upload to Supabase storage
    const fileName = `invoice_${invoiceNumber}.pdf`;
    invoiceStoragePath = `employees/${emp.id}/invoices/${fileName}`;
    const supabase = getSupabaseAdmin();
    const { error: uploadError } = await supabase.storage
      .from("org-documents")
      .upload(invoiceStoragePath, invoiceBuffer, { contentType: "application/pdf", upsert: true });

    if (uploadError) {
      console.error("[Payout] Invoice upload failed:", uploadError.message);
      invoiceStoragePath = null;
    } else {
      invoiceUrl = await getSignedStorageUrl("org-documents", invoiceStoragePath);
    }
  } catch (e) {
    console.error("[Payout] Invoice generation failed:", e);
  }

  // 4. Mark payment as completed (atomic to prevent double-completion)
  const completed = await database.payment.updateMany({
    where: { id: data.paymentId, status: { in: ["pending", "processing"] } },
    data: {
      status: "completed",
      paymentDate: now,
      paymentMethod: data.provider,
      transactionId: data.reference,
      notes: data.notes ?? null,
      payoutProvider: data.provider,
      payoutReference: data.reference,
      payoutReceiptUrl: data.receiptUrl ?? null,
      payoutConfirmedAt: now,
      payoutConfirmedBy: session.userId,
      invoiceUrl,
      invoiceNumber,
      processedByUserId: session.userId,
      processedByName: session.name ?? undefined,
    },
  });

  // 5. Create document record for the invoice
  if (invoiceBuffer) {
    try {
      const periodLabel = payment.periodStart && payment.periodEnd
        ? `${fmtDateShort(payment.periodStart)} to ${fmtDateShort(payment.periodEnd)}`
        : fmtDateShort(now);

      await database.document.create({
        data: {
          employeeId: emp.id,
          documentType: "invoice",
          documentName: `Invoice ${invoiceNumber} — ${periodLabel}`,
          description: `Payment invoice for $${fmtMoney(amount)} ${payment.currency} via ${providerLabel}`,
          fileUrl: invoiceUrl,
          filePath: invoiceStoragePath,
          fileName: `invoice_${invoiceNumber}.pdf`,
          fileSize: invoiceBuffer.length,
          mimeType: "application/pdf",
          isConfidential: false,
          status: invoiceStoragePath ? "verified" : "pending",
          uploadedByUserId: session.userId,
          uploadedByName: session.name ?? "System",
          issuedDate: now,
        },
      });
      if (!invoiceStoragePath) {
        console.warn(`[Payout] Invoice document created without file for employee ${emp.id} — upload failed, status set to pending`);
      }
    } catch (e) {
      console.error("[Payout] Invoice document record failed:", e);
    }
  }

  // 6. Generate and deliver paystub (existing flow)
  try {
    const { generateAndDeliverPaystub } = await import("./paystub");
    await generateAndDeliverPaystub(data.paymentId);
  } catch (e) {
    console.error("[Payout] Paystub generation failed:", e);
  }

  // 7. Email contractor the invoice (separate from paystub email)
  const contractorEmail = getContractorEmail(emp);
  if (contractorEmail && invoiceBuffer) {
    try {
      const { sendViaGmail } = await import("./send-email");
      const { layout, heading, greeting, paragraph, primaryButton, dataTable, dataRow, statusBadge } = await import("./email-templates");

      const appUrl = normalizeAppUrl(APP_URL);
      const slug = org?.slug ?? "rl";

      const body =
        heading("Payment Confirmation") +
        greeting(emp.legalFirstName) +
        paragraph(`Your payment of <strong>$${fmtMoney(amount)} ${payment.currency}</strong> has been processed via ${providerLabel}.`) +
        `<div style="margin-bottom:16px;border:1px solid #e5e7eb;border-radius:10px;padding:16px;">` +
        dataTable(
          dataRow("Invoice", `<strong>${invoiceNumber}</strong>`) +
          dataRow("Amount", `<span style="font-size:18px;font-weight:700;color:#111827;">$${fmtMoney(amount)} ${payment.currency}</span>`) +
          dataRow("Method", providerLabel) +
          dataRow("Reference", data.reference) +
          dataRow("Status", statusBadge("Paid", "#16a34a"))
        ) +
        `</div>` +
        paragraph("Your invoice and paystub are attached. They have also been saved to your documents in the dashboard.") +
        primaryButton("View in Dashboard", `${appUrl}/${slug}/documents`);

      try {
        await sendViaGmail(
          contractorEmail,
          `Payment Received — $${fmtMoney(amount)} ${payment.currency} (${invoiceNumber})`,
          layout(body, "This is an automated notification from Remote Leverage."),
          undefined,
          undefined,
          [{ filename: `invoice_${invoiceNumber}.pdf`, content: invoiceBuffer, mimeType: "application/pdf" }],
        );
      } catch (emailErr) {
        console.error("[HRIQ] Email send failed (non-blocking):", emailErr);
      }
    } catch (e) {
      console.error("[Payout] Invoice email failed:", e);
    }
  }

  // 8. Create audit log
  try {
    await database.auditLog.create({
      data: {
        action: "payment_completed",
        objectType: "payment",
        objectId: data.paymentId,
        actorType: "user",
        actorUserId: session.userId,
        actorDescription: session.name ?? session.userId,
        newValue: {
          provider: data.provider,
          reference: data.reference,
          amount: payment.amount,
          currency: payment.currency,
          invoiceNumber,
          employeeId: emp.id,
          employeeName: `${emp.legalFirstName} ${emp.legalLastName}`,
        },
        organizationId: org?.id ?? null,
      },
    });
  } catch (e) {
    console.error("[Payout] Audit log failed:", e);
  }

  // Sync to QuickBooks (non-blocking)
  try {
    const { syncPaymentToQuickBooks } = await import("./quickbooks");
    const qbResult = await syncPaymentToQuickBooks(data.paymentId);
    if (qbResult.success) {
      console.info(`[Payout] QB synced — Bill: ${qbResult.qbBillId}`);
    } else if (qbResult.error !== "QuickBooks not connected") {
      console.warn(`[Payout] QB sync failed: ${qbResult.error}`);
    }
  } catch (e) {
    console.error("[Payout] QB sync error:", e);
  }

  revalidatePath("/[orgSlug]/payments", "page");
  revalidatePath("/[orgSlug]/payroll", "page");
  revalidatePath("/[orgSlug]/payments/external", "page");
  revalidatePath("/[orgSlug]/payroll/external", "page");
  revalidatePath("/[orgSlug]/documents", "page");

  payoutSuccess = true;
  return { success: true, invoiceNumber, invoiceUrl };
  } catch (err: unknown) {
    // Revert status back to pending if payout processing failed
    if (!payoutSuccess) {
      await database.payment.updateMany({
        where: { id: data.paymentId, status: "processing" },
        data: { status: "pending" },
      }).catch((e) => console.error("[revert failed]", e));
    }
    const msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[processContractorPayout]", msg);
    return { error: msg };
  }
}

//  Invoice PDF Generator 

type InvoiceData = {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  companyName: string;
  companyAddress: string;
  companyLogoUrl: string | null;
  contractorName: string;
  contractorEmail: string;
  contractorAddress: string;
  contractorId: string;
  description: string;
  periodStart: string | null;
  periodEnd: string | null;
  hours: number | null;
  rate: number | null;
  amount: number;
  currency: string;
  paymentMethod: string;
  transactionRef: string;
  status: string;
};

async function generateInvoicePdf(data: InvoiceData): Promise<Buffer> {
  const { PDFDocument, rgb, StandardFonts } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const { width } = page.getSize();

  const C = {
    black: rgb(0.07, 0.07, 0.07),
    dark: rgb(0.22, 0.25, 0.27),
    gray: rgb(0.42, 0.44, 0.47),
    light: rgb(0.56, 0.58, 0.60),
    line: rgb(0.82, 0.84, 0.86),
    headerBg: rgb(0.13, 0.55, 0.33), // RL green
    white: rgb(1, 1, 1),
    warmBg: rgb(0.97, 0.95, 0.93),
    stripeBg: rgb(0.97, 0.97, 0.98),
    paidBg: rgb(0.86, 0.96, 0.88),
    paidText: rgb(0.08, 0.47, 0.22),
  };

  const mx = 48;
  const cw = width - 2 * mx;
  let y = 792 - 48;

  const drawRight = (text: string, x: number, yy: number, sz: number, f = font, c = C.dark) => {
    const w = f.widthOfTextAtSize(text, sz);
    page.drawText(text, { x: x - w, y: yy, size: sz, font: f, color: c });
  };

  //  Logo 
  let logoImage: any = null;
  if (data.companyLogoUrl) {
    try {
      const res = await fetch(data.companyLogoUrl, { signal: AbortSignal.timeout(8000) });
      const buf = new Uint8Array(await res.arrayBuffer());
      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("png")) logoImage = await doc.embedPng(buf);
      else if (ct.includes("jpeg") || ct.includes("jpg")) logoImage = await doc.embedJpg(buf);
    } catch (err) { console.warn("[payouts:generateInvoicePdf] logo optional:", err); }
  }

  // 
  // HEADER
  // 
  const headerH = 48;
  page.drawRectangle({ x: mx, y: y - headerH, width: cw, height: headerH, color: C.headerBg });

  if (logoImage) {
    const ld = logoImage.scale(1);
    const lh = 28;
    const lw = (ld.width / ld.height) * lh;
    page.drawImage(logoImage, { x: mx + 16, y: y - headerH + 10, width: lw, height: lh });
    page.drawText(data.companyName, { x: mx + 16 + lw + 10, y: y - 30, size: 13, font: fontBold, color: C.white });
  } else {
    page.drawText(data.companyName, { x: mx + 16, y: y - 30, size: 15, font: fontBold, color: C.white });
  }

  drawRight("INVOICE", mx + cw - 16, y - 28, 14, fontBold, C.white);
  y -= headerH + 1;

  // 
  // INVOICE INFO
  // 
  const infoH = 80;
  page.drawRectangle({ x: mx, y: y - infoH, width: cw, height: infoH, color: C.warmBg });

  // Left: Bill To
  page.drawText("BILL TO:", { x: mx + 16, y: y - 16, size: 7, font: fontBold, color: C.gray });
  page.drawText(data.contractorName, { x: mx + 16, y: y - 30, size: 11, font: fontBold, color: C.dark });
  if (data.contractorEmail) page.drawText(data.contractorEmail, { x: mx + 16, y: y - 44, size: 8.5, font, color: C.gray });
  if (data.contractorAddress) page.drawText(data.contractorAddress, { x: mx + 16, y: y - 56, size: 8, font, color: C.gray });
  page.drawText(`ID: ${data.contractorId}`, { x: mx + 16, y: y - 70, size: 7.5, font, color: C.light });

  // Right: Invoice details
  const rx = mx + cw - 180;
  page.drawText("INVOICE NO:", { x: rx, y: y - 16, size: 7, font: fontBold, color: C.gray });
  drawRight(data.invoiceNumber, mx + cw - 16, y - 16, 10, fontBold, C.dark);

  page.drawText("DATE:", { x: rx, y: y - 32, size: 7, font: fontBold, color: C.gray });
  drawRight(data.invoiceDate, mx + cw - 16, y - 32, 9, font, C.dark);

  page.drawText("STATUS:", { x: rx, y: y - 48, size: 7, font: fontBold, color: C.gray });
  // PAID badge
  const badgeW = fontBold.widthOfTextAtSize(data.status, 9) + 16;
  const badgeX = mx + cw - 16 - badgeW;
  page.drawRectangle({ x: badgeX, y: y - 54, width: badgeW, height: 16, color: C.paidBg });
  drawRight(data.status, mx + cw - 24, y - 49, 9, fontBold, C.paidText);

  page.drawText("METHOD:", { x: rx, y: y - 66, size: 7, font: fontBold, color: C.gray });
  drawRight(data.paymentMethod, mx + cw - 16, y - 66, 9, font, C.dark);

  y -= infoH;

  // 
  // LINE ITEMS TABLE HEADER
  // 
  const thH = 24;
  page.drawRectangle({ x: mx, y: y - thH, width: cw, height: thH, color: C.stripeBg });
  page.drawLine({ start: { x: mx, y }, end: { x: mx + cw, y }, thickness: 0.5, color: C.line });

  page.drawText("DESCRIPTION", { x: mx + 16, y: y - 16, size: 7, font: fontBold, color: C.gray });
  if (data.hours != null) {
    page.drawText("HOURS", { x: mx + cw * 0.45, y: y - 16, size: 7, font: fontBold, color: C.gray });
    page.drawText("RATE", { x: mx + cw * 0.58, y: y - 16, size: 7, font: fontBold, color: C.gray });
  }
  drawRight("AMOUNT", mx + cw - 16, y - 16, 7, fontBold, C.gray);
  y -= thH;

  // 
  // LINE ITEM ROW
  // 
  const rowH = 28;
  let desc = data.description;
  if (data.periodStart && data.periodEnd) desc += `  (${data.periodStart} — ${data.periodEnd})`;
  page.drawText(desc.substring(0, 60), { x: mx + 16, y: y - 18, size: 9.5, font, color: C.dark });

  if (data.hours != null && data.rate != null) {
    page.drawText(`${data.hours}`, { x: mx + cw * 0.45, y: y - 18, size: 9.5, font, color: C.dark });
    page.drawText(`$${fmtMoney(data.rate)}/hr`, { x: mx + cw * 0.58, y: y - 18, size: 9.5, font, color: C.dark });
  }
  drawRight(`$${fmtMoney(data.amount)}`, mx + cw - 16, y - 18, 10, fontBold, C.dark);
  y -= rowH;

  // 
  // TOTALS
  // 
  page.drawLine({ start: { x: mx, y }, end: { x: mx + cw, y }, thickness: 1, color: C.line });

  const totH = 60;
  page.drawRectangle({ x: mx + cw * 0.55, y: y - totH, width: cw * 0.45, height: totH, color: C.warmBg });

  const totX = mx + cw * 0.6;
  const totVX = mx + cw - 16;

  page.drawText("SUBTOTAL:", { x: totX, y: y - 20, size: 8, font, color: C.gray });
  drawRight(`$${fmtMoney(data.amount)} ${data.currency}`, totVX, y - 20, 10, font, C.dark);

  page.drawLine({ start: { x: totX - 8, y: y - 30 }, end: { x: totVX, y: y - 30 }, thickness: 0.5, color: C.line });

  page.drawText("TOTAL DUE:", { x: totX, y: y - 46, size: 9, font: fontBold, color: C.dark });
  drawRight(`$${fmtMoney(data.amount)} ${data.currency}`, totVX, y - 46, 13, fontBold, C.black);
  y -= totH;

  // 
  // PAYMENT DETAILS
  // 
  y -= 16;
  page.drawLine({ start: { x: mx, y }, end: { x: mx + cw, y }, thickness: 0.5, color: C.line });
  y -= 20;
  page.drawText("PAYMENT DETAILS", { x: mx + 16, y, size: 8, font: fontBold, color: C.gray });
  y -= 16;
  page.drawText(`Method: ${data.paymentMethod}`, { x: mx + 16, y, size: 9, font, color: C.dark });
  y -= 14;
  page.drawText(`Transaction Reference: ${data.transactionRef}`, { x: mx + 16, y, size: 9, font, color: C.dark });
  y -= 14;
  page.drawText(`Payment Date: ${data.invoiceDate}`, { x: mx + 16, y, size: 9, font, color: C.dark });

  // 
  // FOOTER
  // 
  page.drawText("Managed by Remote Leverage  ·  remoteleverage.com", {
    x: mx + 16, y: 48, size: 7, font, color: C.light,
  });
  drawRight(`Invoice ${data.invoiceNumber}`, mx + cw - 16, 48, 7, font, C.light);

  // Outer border
  const boxTop = 792 - 48;
  const boxBottom = y - 20;
  page.drawRectangle({
    x: mx, y: boxBottom, width: cw, height: boxTop - boxBottom,
    borderColor: C.line, borderWidth: 0.5, opacity: 0,
  });

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

//  Helpers 

function fmtMoney(n: number | string): string {
  const val = typeof n === "string" ? parseFloat(n) : n;
  if (isNaN(val)) return "0.00";
  return val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDateFull(d: Date | string): string {
  const dt = new Date(typeof d === "string" ? d : d.getTime());
  return dt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function fmtDateShort(d: Date | string): string {
  const dt = new Date(typeof d === "string" ? d : d.getTime());
  return dt.toLocaleDateString("en-CA"); // YYYY-MM-DD
}

// ── Stripe Connect Payout ──

export async function processStripeConnectPayout(data: {
  paymentId: string;
  notes?: string;
  managementPassword?: string;
}): Promise<{ transferId: string; invoiceNumber: string } | { error: string }> {
  await requireRole("super_admin");
  const { verifyManagementPassword } = await import("./management-auth");
  if (data.managementPassword) await verifyManagementPassword(data.managementPassword);

  const payment = await database.payment.findUnique({
    where: { id: data.paymentId },
    include: {
      employee: {
        select: {
          id: true,
          legalFirstName: true,
          legalLastName: true,
          stripeAccountId: true,
          stripeAccountStatus: true,
        },
      },
    },
  });

  if (!payment) throw new HriqError("HRIQ-0801", "Payment not found");
  if (payment.status === "completed") throw new HriqError("HRIQ-0802", "Payment already completed");

  const emp = payment.employee;
  if (!emp.stripeAccountId || emp.stripeAccountStatus !== "verified") {
    throw new HriqError("HRIQ-0806", "Contractor does not have a verified Stripe Connect account");
  }

  const amountCents = Math.round(Number(payment.amount) * 100);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    throw new HriqError("HRIQ-0807", "Invalid payment amount for Stripe transfer");
  }

  // Atomically claim the payment BEFORE making the Stripe API call
  // to prevent double-transfers from concurrent clicks
  const claimed = await database.payment.updateMany({
    where: { id: data.paymentId, status: "pending" },
    data: { status: "processing" },
  });
  if (claimed.count === 0) {
    throw new HriqError("HRIQ-0802", "Payment is already being processed or completed");
  }

  let transferId: string;
  try {
    // Create Stripe transfer
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

    const transfer = await stripe.transfers.create({
      amount: amountCents,
      currency: (payment.currency ?? "usd").toLowerCase(),
      destination: emp.stripeAccountId,
      description: `Payment — ${payment.description ?? "contractor services"}`,
      metadata: {
        hriq_payment_id: payment.id,
        hriq_employee_id: emp.id,
      },
    }, {
      idempotencyKey: `hriq-payout-${data.paymentId}`,
    });
    transferId = transfer.id;
  } catch (err: unknown) {
    // Revert status on Stripe failure
    await database.payment.updateMany({
      where: { id: data.paymentId, status: "processing" },
      data: { status: "pending" },
    }).catch((e) => console.error("[background task failed]", e));
    const msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[processStripeConnectPayout]", msg);
    return { error: msg };
  }

  // Now process through the normal payout flow (invoice, email, etc.)
  // Note: processContractorPayout will see status="processing" and skip re-claiming
  const result = await processContractorPayout({
    paymentId: data.paymentId,
    provider: "stripe_connect",
    reference: transferId,
    notes: data.notes,
  });

  if ("error" in result) return { error: result.error ?? "An unexpected error occurred" };
  return { transferId, invoiceNumber: result.invoiceNumber };
}
