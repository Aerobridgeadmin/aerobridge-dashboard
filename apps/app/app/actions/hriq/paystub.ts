"use server";
import { getContractorEmail } from "@/lib/hriq/utils";

import { database } from "@repo/database";
import { getSupabaseAdmin, getSignedStorageUrl, APP_URL, normalizeAppUrl } from "./constants";
import { HriqError } from "@/lib/hriq/errors";

//  Types 

type PaystubData = {
  // Company
  companyName: string;
  companyAddress: string;
  companyLogoUrl: string | null;

  // Employee
  employeeName: string;
  employeeAddress: string;
  employeeId: string; // employee number

  // Pay details
  payPeriodStart: string;
  payPeriodEnd: string;
  payDate: string;
  chequeNumber: string;

  // Income
  incomeType: string;
  rate: string;
  hours: string;
  currentTotal: string;

  // Deductions (array of { name, currentTotal, ytd })
  deductions: { name: string; currentTotal: string; yearToDate: string }[];

  // Totals
  ytdGross: string;
  ytdDeductions: string;
  ytdNetPay: string;
  currentGross: string;
  currentDeductions: string;
  netPay: string;
};

//  PDF Paystub Generator 

async function generatePaystubPdf(data: PaystubData): Promise<Buffer> {
  const { PDFDocument, rgb, StandardFonts } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]); // US Letter
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const { width } = page.getSize();

  // Colors
  const C = {
    white: rgb(1, 1, 1),
    black: rgb(0.07, 0.07, 0.07),
    dark: rgb(0.22, 0.25, 0.27),
    gray: rgb(0.42, 0.44, 0.47),
    lightText: rgb(0.56, 0.58, 0.60),
    line: rgb(0.82, 0.84, 0.86),
    headerBg: rgb(0.24, 0.24, 0.27),
    warmBg: rgb(0.97, 0.95, 0.93),
    stripeBg: rgb(0.97, 0.97, 0.98),
  };

  const mx = 48; // margin
  const cw = width - 2 * mx; // content width
  let y = 792 - 48;

  // Helper: right-aligned text
  const drawRight = (text: string, x: number, yy: number, sz: number, f = font, c = C.dark) => {
    const w = f.widthOfTextAtSize(text, sz);
    page.drawText(text, { x: x - w, y: yy, size: sz, font: f, color: c });
  };

  // Helper: centered text
  const drawCenter = (text: string, cx: number, colW: number, yy: number, sz: number, f = font, c = C.dark) => {
    const w = f.widthOfTextAtSize(text, sz);
    page.drawText(text, { x: cx + (colW - w) / 2, y: yy, size: sz, font: f, color: c });
  };

  //  Logo embedding 
  let logoImage: any = null;
  if (data.companyLogoUrl) {
    try {
      const res = await fetch(data.companyLogoUrl, { signal: AbortSignal.timeout(8000) });
      const buf = new Uint8Array(await res.arrayBuffer());
      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("png")) logoImage = await doc.embedPng(buf);
      else if (ct.includes("jpeg") || ct.includes("jpg")) logoImage = await doc.embedJpg(buf);
    } catch (e) {
      console.error("[Paystub] Logo embed failed:", e);
    }
  }

  // 
  // HEADER BAR
  // 
  const headerH = 50;
  page.drawRectangle({ x: mx, y: y - headerH, width: cw, height: headerH, color: C.headerBg });

  if (logoImage) {
    const logoDim = logoImage.scale(1);
    const logoH = 30;
    const logoW = (logoDim.width / logoDim.height) * logoH;
    page.drawImage(logoImage, { x: mx + 16, y: y - headerH + 10, width: logoW, height: logoH });
    page.drawText(data.companyName, { x: mx + 16 + logoW + 10, y: y - 32, size: 14, font: fontBold, color: C.white });
  } else {
    page.drawText(data.companyName, { x: mx + 16, y: y - 32, size: 16, font: fontBold, color: C.white });
  }
  if (data.companyAddress) {
    page.drawText(data.companyAddress, { x: mx + 16, y: y - 44, size: 7, font, color: rgb(0.75, 0.75, 0.78) });
  }

  drawRight("EARNINGS STATEMENT", mx + cw - 16, y - 30, 12, fontBold, C.white);
  y -= headerH + 1;

  // 
  // EMPLOYEE NAME ROW
  // 
  const empH = 24;
  page.drawRectangle({ x: mx, y: y - empH, width: cw, height: empH, color: C.stripeBg });
  page.drawText(data.employeeName + (data.employeeAddress ? `  ·  ${data.employeeAddress}` : ""), {
    x: mx + 16, y: y - 17, size: 10, font: fontBold, color: C.dark,
  });
  y -= empH + 1;

  // 
  // INFO GRID (4 columns)
  // 
  const infoH = 38;
  page.drawRectangle({ x: mx, y: y - infoH, width: cw, height: infoH, color: C.warmBg });
  const infoCols = [
    { label: "EMPLOYEE ID", value: data.employeeId },
    { label: "PAY PERIOD", value: `${data.payPeriodStart}  —  ${data.payPeriodEnd}` },
    { label: "PAY DATE", value: data.payDate },
    { label: "REFERENCE", value: data.chequeNumber },
  ];
  const infoW = cw / 4;
  for (let i = 0; i < 4; i++) {
    const cx = mx + i * infoW + 16;
    page.drawText(infoCols[i].label, { x: cx, y: y - 14, size: 6.5, font: fontBold, color: C.gray });
    page.drawText(infoCols[i].value, { x: cx, y: y - 28, size: 9, font, color: C.dark });
    if (i < 3) {
      page.drawLine({ start: { x: mx + (i + 1) * infoW, y }, end: { x: mx + (i + 1) * infoW, y: y - infoH }, thickness: 0.5, color: C.line });
    }
  }
  y -= infoH;

  // 
  // SECTION HEADERS (Income | Deductions)
  // 
  const secH = 28;
  const leftW = cw * 0.55;
  const rightW = cw * 0.45;

  page.drawRectangle({ x: mx, y: y - secH, width: cw, height: secH, color: C.warmBg });
  page.drawLine({ start: { x: mx, y: y }, end: { x: mx + cw, y: y }, thickness: 0.5, color: C.line });

  // Income column headers (left side: 55%)
  const iCols = [
    { label: "DESCRIPTION", x: mx + 16 },
    { label: "RATE", x: mx + leftW * 0.45 },
    { label: "HOURS", x: mx + leftW * 0.62 },
    { label: "AMOUNT", x: mx + leftW - 16, right: true },
  ];
  for (const col of iCols) {
    if (col.right) {
      drawRight(col.label, col.x, y - 18, 6.5, fontBold, C.gray);
    } else {
      page.drawText(col.label, { x: col.x, y: y - 18, size: 6.5, font: fontBold, color: C.gray });
    }
  }

  // Deductions column headers (right side: 45%)
  const rx = mx + leftW;
  const dCols = [
    { label: "DESCRIPTION", x: rx + 16 },
    { label: "CURRENT", x: rx + rightW * 0.55, right: true },
    { label: "YTD", x: rx + rightW - 16, right: true },
  ];
  for (const col of dCols) {
    if (col.right) {
      drawRight(col.label, col.x, y - 18, 6.5, fontBold, C.gray);
    } else {
      page.drawText(col.label, { x: col.x, y: y - 18, size: 6.5, font: fontBold, color: C.gray });
    }
  }

  // Vertical divider
  page.drawLine({ start: { x: mx + leftW, y }, end: { x: mx + leftW, y: y - secH }, thickness: 0.5, color: C.line });
  y -= secH;

  // 
  // BODY (Income + Deductions rows)
  // 
  const bodyTop = y;
  const bodyH = 100;

  // Income data row
  page.drawText(data.incomeType, { x: mx + 16, y: y - 18, size: 9.5, font, color: C.dark });
  page.drawText(`$${data.rate}/hr`, { x: mx + leftW * 0.45, y: y - 18, size: 9.5, font, color: C.dark });
  page.drawText(data.hours, { x: mx + leftW * 0.62, y: y - 18, size: 9.5, font, color: C.dark });
  drawRight(data.currentTotal, mx + leftW - 16, y - 18, 9.5, fontBold, C.dark);

  // Deductions data
  if (data.deductions.length > 0) {
    let dy = y - 18;
    for (const d of data.deductions) {
      page.drawText(d.name, { x: rx + 16, y: dy, size: 9.5, font, color: C.dark });
      drawRight(d.currentTotal, rx + rightW * 0.55, dy, 9.5, font, C.dark);
      drawRight(d.yearToDate, rx + rightW - 16, dy, 9.5, font, C.dark);
      dy -= 20;
    }
  } else {
    page.drawText("No deductions", { x: rx + 16, y: y - 18, size: 9, font, color: C.lightText });
  }

  // Vertical divider for body
  page.drawLine({ start: { x: mx + leftW, y: bodyTop }, end: { x: mx + leftW, y: bodyTop - bodyH }, thickness: 0.5, color: C.line });
  y -= bodyH;

  // 
  // FOOTER TOTALS (2 rows: YTD + Current)
  // 
  page.drawLine({ start: { x: mx, y }, end: { x: mx + cw, y }, thickness: 1.5, color: C.line });

  const footerH = 48;
  const col3W = cw / 6;

  // Left side: YTD (white bg)
  const ytdItems = [
    { label: "YTD GROSS", value: data.ytdGross },
    { label: "YTD DEDUCTIONS", value: data.ytdDeductions },
    { label: "YTD NET PAY", value: data.ytdNetPay },
  ];
  for (let i = 0; i < 3; i++) {
    drawCenter(ytdItems[i].label, mx + i * col3W, col3W, y - 16, 6.5, fontBold, C.gray);
    drawCenter(ytdItems[i].value, mx + i * col3W, col3W, y - 34, 12, font, C.dark);
    if (i < 2) {
      page.drawLine({ start: { x: mx + (i + 1) * col3W, y }, end: { x: mx + (i + 1) * col3W, y: y - footerH }, thickness: 0.5, color: C.line });
    }
  }

  // Right side: Current (warm bg)
  page.drawRectangle({ x: mx + 3 * col3W, y: y - footerH, width: 3 * col3W, height: footerH, color: C.warmBg });
  // Divider between left/right
  page.drawLine({ start: { x: mx + 3 * col3W, y }, end: { x: mx + 3 * col3W, y: y - footerH }, thickness: 1, color: C.line });

  const curItems = [
    { label: "GROSS PAY", value: data.currentGross },
    { label: "DEDUCTIONS", value: data.currentDeductions },
    { label: "NET PAY", value: data.netPay, bold: true },
  ];
  for (let i = 0; i < 3; i++) {
    const cx = mx + (3 + i) * col3W;
    const vFont = curItems[i].bold ? fontBold : font;
    const vSize = curItems[i].bold ? 14 : 12;
    drawCenter(curItems[i].label, cx, col3W, y - 16, 6.5, fontBold, C.gray);
    drawCenter(curItems[i].value, cx, col3W, y - 34, vSize, vFont, curItems[i].bold ? C.black : C.dark);
    if (i < 2) {
      page.drawLine({ start: { x: cx + col3W, y }, end: { x: cx + col3W, y: y - footerH }, thickness: 0.5, color: C.line });
    }
  }

  // 
  // OUTER BORDER
  // 
  const totalH = 792 - 48 - (y - footerH);
  page.drawRectangle({
    x: mx, y: y - footerH, width: cw, height: totalH,
    borderColor: C.line, borderWidth: 1,
    opacity: 0,
  });

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtDate(d: Date | string | null): string {
  if (!d) return "—";
  const dt = new Date(typeof d === "string" ? d : d.getTime());
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("en-CA"); // YYYY/MM/DD format
}

function fmtMoney(amount: number | string): string {
  const n = typeof amount === "string" ? Number.parseFloat(amount) : amount;
  if (Number.isNaN(n)) return "0.00";
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

//  Paystub Email Template 

function paystubEmailHtml(
  recipientName: string,
  employeeName: string,
  amount: string,
  currency: string,
  payDate: string,
  isProcessor: boolean,
  orgSlug: string,
): string {
  const { layout, heading, greeting, paragraph, primaryButton, dataTable, dataRow, statusBadge } = require("./email-templates");
  const appUrl = normalizeAppUrl(APP_URL);

  const roleText = isProcessor
    ? `A payment to <strong>${esc(employeeName)}</strong> has been completed and a paystub has been generated.`
    : "Your payment has been processed and your paystub is ready.";

  const body =
    heading("Paystub Ready") +
    greeting(recipientName) +
    paragraph(roleText) +
    `<div style="margin-bottom:16px;border:1px solid #e5e7eb;border-radius:10px;padding:16px;">
      ${dataTable(
        dataRow("Amount", `<span style="font-size:18px;font-weight:700;color:#111827;">$${esc(amount)} ${esc(currency)}</span>`) +
        dataRow("Pay Date", esc(payDate)) +
        dataRow("Status", statusBadge("Completed", "#16a34a"))
      )}
    </div>` +
    paragraph("The paystub is attached to this email and has been saved to the documents section of the dashboard.") +
    primaryButton("View in Dashboard", `${appUrl}/${orgSlug}/${isProcessor ? "payroll" : "documents"}`);

  return layout(body, "This is an automated notification from Remote Leverage.");
}

//  Main: Generate + Upload + Document + Email 

export async function generateAndDeliverPaystub(paymentId: string) {
  try {

    // 1. Fetch payment with employee + org data
    const payment = await database.payment.findUnique({
      where: { id: paymentId },
      include: {
        employee: {
          include: {
            organization: {
              include: { profile: true },
            },
          },
        },
      },
    });
    if (!payment) {
      console.error("[Paystub] Payment not found:", paymentId);
      throw new HriqError("HRIQ-0801", "Payment not found for paystub generation");
    }

    const emp = payment.employee;
    if (!emp) {
      console.error("[Paystub] No employee on payment:", paymentId);
      throw new HriqError("HRIQ-2501", "No employee linked to payment");
    }

    const org = emp.organization;
    const orgProfile = org?.profile;

    // 2. Calculate YTD totals (all completed payments for this employee this year)
    const yearStart = new Date(new Date().getFullYear(), 0, 1);
    const ytdPayments = await database.payment.findMany({
      where: {
        employeeId: emp.id,
        status: "completed",
        paymentDate: { gte: yearStart },
      },
      select: { amount: true },
    });
    const ytdGross = ytdPayments.reduce((sum, p) => sum + Number(p.amount), 0);

    // 3. Build paystub data
    const companyName = org?.name ?? "Remote Leverage";
    const companyAddress = orgProfile?.address ?? org?.name ?? "";
    const companyLogoUrl = org?.logoUrl ?? `${normalizeAppUrl(APP_URL)}/logo.png`;

    const employeeName = `${emp.legalFirstName} ${emp.legalLastName}`;
    const addressParts = [emp.streetAddress, emp.city, emp.stateProvince, emp.postalCode, emp.country].filter(Boolean);
    const employeeAddress = addressParts.join(", ");

    const amount = Number(payment.amount);
    const rate = payment.hourlyRate ? Number(payment.hourlyRate) : 0;
    const hours = payment.hoursWorked ? Number(payment.hoursWorked) : 0;

    const deductions: { name: string; currentTotal: string; yearToDate: string }[] = [];
    const totalDeductions = 0;
    const netPay = amount - totalDeductions;

    const paystubData: PaystubData = {
      companyName,
      companyAddress,
      companyLogoUrl,
      employeeName,
      employeeAddress,
      employeeId: emp.employeeNumber,
      payPeriodStart: fmtDate(payment.periodStart),
      payPeriodEnd: fmtDate(payment.periodEnd),
      payDate: fmtDate(payment.paymentDate ?? new Date()),
      chequeNumber: payment.transactionId ?? paymentId.slice(-8).toUpperCase(),
      incomeType: payment.paymentType.toUpperCase(),
      rate: rate > 0 ? fmtMoney(rate) : "—",
      hours: hours > 0 ? fmtMoney(hours) : "—",
      currentTotal: fmtMoney(amount),
      deductions,
      ytdGross: fmtMoney(ytdGross),
      ytdDeductions: fmtMoney(0),
      ytdNetPay: fmtMoney(ytdGross),
      currentGross: fmtMoney(amount),
      currentDeductions: fmtMoney(totalDeductions),
      netPay: fmtMoney(netPay),
    };

    // 4. Generate PDF paystub
    const paystubBuffer = await generatePaystubPdf(paystubData);
    const timestamp = Date.now();
    const fileName = `paystub_${fmtDate(payment.paymentDate ?? new Date()).replace(/\//g, "-")}_${timestamp}.pdf`;

    // 5. Upload to Supabase storage (non-blocking — email is more important)
    const storagePath = `employees/${emp.id}/paystubs/${fileName}`;
    let signedUrl: string | null = null;
    let uploadSucceeded = false;
    try {
      const supabase = getSupabaseAdmin();
      const { error: uploadError } = await supabase.storage
        .from("org-documents")
        .upload(storagePath, paystubBuffer, {
          contentType: "application/pdf",
          upsert: true,
        });

      if (uploadError) {
        console.error("[Paystub] Storage upload failed:", uploadError.message);
      } else {
        signedUrl = await getSignedStorageUrl("org-documents", storagePath);
        uploadSucceeded = true;
      }
    } catch (e) {
      console.error("[Paystub] Storage upload error:", e);
    }

    // 6. Create Document record — only if file was actually stored
    try {
      const periodLabel = payment.periodStart && payment.periodEnd
        ? `${fmtDate(payment.periodStart)} to ${fmtDate(payment.periodEnd)}`
        : fmtDate(payment.paymentDate ?? new Date());

      await database.document.create({
        data: {
          employeeId: emp.id,
          documentType: "paystub",
          documentName: `Paystub — ${periodLabel}`,
          description: `Earnings statement for ${payment.paymentType} payment of $${fmtMoney(amount)} ${payment.currency}`,
          fileUrl: signedUrl,
          filePath: uploadSucceeded ? storagePath : undefined,
          fileName,
          fileSize: paystubBuffer.length,
          mimeType: "application/pdf",
          isConfidential: true,
          status: uploadSucceeded ? "verified" : "pending",
          uploadedByUserId: payment.processedByUserId,
          uploadedByName: payment.processedByName ?? "System",
          issuedDate: payment.paymentDate ?? new Date(),
        },
      });
      if (!uploadSucceeded) {
        console.warn(`[Paystub] Document created without file for employee ${emp.id} — upload failed, status set to pending`);
      }
    } catch (e) {
      console.error("[Paystub] Document creation error:", e);
    }

    // 7. Email paystub to contractor (THE MOST IMPORTANT STEP)
    const payDateStr = fmtDate(payment.paymentDate ?? new Date());
    const amountStr = fmtMoney(amount);
    const contractorEmail = getContractorEmail(emp);

    if (contractorEmail) {
      try {
        const { sendViaGmailSystem } = await import("./send-email");
        const contractorHtml = paystubEmailHtml(
          emp.legalFirstName,
          employeeName,
          amountStr,
          payment.currency,
          payDateStr,
          false,
          org?.slug ?? "rl",
        );
        try {
          await sendViaGmailSystem(
            contractorEmail,
            `Your Paystub — $${amountStr} ${payment.currency}`,
            contractorHtml,
            [{ filename: fileName, content: paystubBuffer, mimeType: "application/pdf" }],
          );
        } catch (emailErr) {
          console.error("[HRIQ] Email send failed (non-blocking):", emailErr);
        }
      } catch (e) {
        console.error("[Paystub] FAILED to email contractor:", contractorEmail, e);
      }
    } else {
      console.warn("[Paystub] No contractor email found for employee:", emp.id);
    }

    // 8. Email paystub to processor
    if (payment.processedByUserId) {
      try {
        const processor = await database.$queryRaw<Array<{ email: string; name: string }>>`
          SELECT email, COALESCE(raw_user_meta_data->>'name', email) as name
          FROM auth.users
          WHERE id = ${payment.processedByUserId}::uuid
          LIMIT 1
        `;
        if (processor.length > 0 && processor[0].email) {
          const { sendViaGmailSystem } = await import("./send-email");
          const processorHtml = paystubEmailHtml(
            processor[0].name ?? "Admin",
            employeeName,
            amountStr,
            payment.currency,
            payDateStr,
            true,
            org?.slug ?? "rl",
          );
          try {
            await sendViaGmailSystem(
              processor[0].email,
              `Paystub Generated — ${employeeName} ($${amountStr} ${payment.currency})`,
              processorHtml,
              [{ filename: fileName, content: paystubBuffer, mimeType: "application/pdf" }],
            );
          } catch (emailErr) {
            console.error("[HRIQ] Email send failed (non-blocking):", emailErr);
          }
        }
      } catch (e) {
        console.error("[Paystub] FAILED to email processor:", e);
      }
    }

    return { storagePath, signedUrl, fileName };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[paystub.ts:generateAndDeliverPaystub]", _msg);
    import("@/lib/hriq/sentry").then(({ captureServerException }) => captureServerException(err, { action: "generateAndDeliverPaystub", paymentId })).catch(() => {});
    return { error: _msg };
  }
}
