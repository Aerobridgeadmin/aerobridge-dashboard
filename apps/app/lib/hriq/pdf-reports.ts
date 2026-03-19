"use client";

import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

type DeptRow = {
  department: string;
  headcount: number;
  approvedHours: number;
  avgRate: number;
  laborCost: number;
  totalPaid: number;
  pctOfTotal: string;
};

type ReportData = {
  title: string;
  dateRange?: string;
  generatedAt: string;
  summary: { label: string; value: string }[];
  departments: DeptRow[];
  totals: { headcount: number; hours: number; avgRate: string; laborCost: string; totalPaid: string };
};

const COLORS = {
  headerBg: rgb(0.12, 0.12, 0.15),
  headerText: rgb(1, 1, 1),
  accent: rgb(0.26, 0.54, 0.93),
  text: rgb(0.12, 0.12, 0.15),
  muted: rgb(0.45, 0.45, 0.5),
  border: rgb(0.85, 0.85, 0.88),
  rowAlt: rgb(0.97, 0.97, 0.98),
  totalBg: rgb(0.93, 0.93, 0.95),
  greenBg: rgb(0.14, 0.65, 0.37),
};

function fmt$(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export async function generateLaborCostPDF(data: ReportData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]); // US Letter
  const { width, height } = page.getSize();

  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const margin = 48;
  let y = height - margin;

  // ── Header bar ─────────────────────────────────────────────────────────────
  const headerH = 60;
  page.drawRectangle({ x: 0, y: height - headerH, width, height: headerH, color: COLORS.headerBg });
  page.drawText("REMOTE LEVERAGE", { x: margin, y: height - 28, size: 11, font: fontBold, color: COLORS.headerText });
  page.drawText(data.title, { x: margin, y: height - 48, size: 16, font: fontBold, color: COLORS.headerText });
  if (data.dateRange) {
    const drW = fontRegular.widthOfTextAtSize(data.dateRange, 9);
    page.drawText(data.dateRange, { x: width - margin - drW, y: height - 28, size: 9, font: fontRegular, color: rgb(0.7, 0.7, 0.75) });
  }
  const genW = fontRegular.widthOfTextAtSize(data.generatedAt, 8);
  page.drawText(data.generatedAt, { x: width - margin - genW, y: height - 48, size: 8, font: fontRegular, color: rgb(0.55, 0.55, 0.6) });

  y = height - headerH - 24;

  // ── Summary cards ──────────────────────────────────────────────────────────
  const cardW = (width - margin * 2 - 12 * (data.summary.length - 1)) / data.summary.length;
  const cardH = 50;
  for (let i = 0; i < data.summary.length; i++) {
    const cx = margin + i * (cardW + 12);
    page.drawRectangle({ x: cx, y: y - cardH, width: cardW, height: cardH, borderColor: COLORS.border, borderWidth: 0.5, color: rgb(1, 1, 1) });
    page.drawText(data.summary[i].label, { x: cx + 10, y: y - 16, size: 7.5, font: fontRegular, color: COLORS.muted });
    page.drawText(data.summary[i].value, { x: cx + 10, y: y - 36, size: 14, font: fontBold, color: COLORS.text });
  }
  y -= cardH + 24;

  // ── Section title ──────────────────────────────────────────────────────────
  page.drawText("Department Breakdown", { x: margin, y, size: 12, font: fontBold, color: COLORS.text });
  y -= 18;

  // ── Table ──────────────────────────────────────────────────────────────────
  const cols = [
    { label: "Department", width: 140, align: "left" as const },
    { label: "Headcount", width: 60, align: "right" as const },
    { label: "Approved Hrs", width: 72, align: "right" as const },
    { label: "Avg $/hr", width: 60, align: "right" as const },
    { label: "Labor Cost", width: 80, align: "right" as const },
    { label: "Total Paid", width: 80, align: "right" as const },
    { label: "% of Total", width: 56, align: "right" as const },
  ];

  const tableW = cols.reduce((s, c) => s + c.width, 0);
  const tableX = margin;
  const rowH = 22;
  const headerRowH = 26;

  // Table header
  page.drawRectangle({ x: tableX, y: y - headerRowH, width: tableW, height: headerRowH, color: COLORS.headerBg });
  let cx = tableX;
  for (const col of cols) {
    const textX = col.align === "right" ? cx + col.width - 8 - fontBold.widthOfTextAtSize(col.label, 7.5) : cx + 8;
    page.drawText(col.label, { x: textX, y: y - 17, size: 7.5, font: fontBold, color: COLORS.headerText });
    cx += col.width;
  }
  y -= headerRowH;

  // Table rows
  for (let i = 0; i < data.departments.length; i++) {
    const d = data.departments[i];
    if (i % 2 === 1) {
      page.drawRectangle({ x: tableX, y: y - rowH, width: tableW, height: rowH, color: COLORS.rowAlt });
    }
    // Bottom border
    page.drawLine({ start: { x: tableX, y: y - rowH }, end: { x: tableX + tableW, y: y - rowH }, thickness: 0.3, color: COLORS.border });

    const vals = [
      d.department,
      String(d.headcount),
      d.approvedHours > 0 ? d.approvedHours.toFixed(1) : "0",
      d.avgRate > 0 ? `$${d.avgRate.toFixed(2)}` : "—",
      d.laborCost > 0 ? fmt$(d.laborCost) : "$0.00",
      d.totalPaid > 0 ? fmt$(d.totalPaid) : "$0.00",
      d.pctOfTotal,
    ];

    cx = tableX;
    for (let c = 0; c < cols.length; c++) {
      const font = c === 0 || c === 4 ? fontBold : fontRegular;
      const color = c === 4 ? COLORS.accent : COLORS.text;
      const sz = 8;
      const tw = font.widthOfTextAtSize(vals[c], sz);
      const textX = cols[c].align === "right" ? cx + cols[c].width - 8 - tw : cx + 8;
      page.drawText(vals[c], { x: textX, y: y - 15, size: sz, font, color });
      cx += cols[c].width;
    }
    y -= rowH;

    // Check page break
    if (y < margin + 80) {
      const newPage = doc.addPage([612, 792]);
      y = 792 - margin;
      // Minimal header on continuation page
      newPage.drawText("Department Breakdown (continued)", { x: margin, y, size: 10, font: fontBold, color: COLORS.text });
      y -= 20;
    }
  }

  // Totals row
  page.drawRectangle({ x: tableX, y: y - rowH - 2, width: tableW, height: rowH + 2, color: COLORS.totalBg });
  const totVals = [
    "Total",
    String(data.totals.headcount),
    data.totals.hours.toFixed(1),
    data.totals.avgRate,
    data.totals.laborCost,
    data.totals.totalPaid,
    "100%",
  ];
  cx = tableX;
  for (let c = 0; c < cols.length; c++) {
    const sz = 8.5;
    const tw = fontBold.widthOfTextAtSize(totVals[c], sz);
    const textX = cols[c].align === "right" ? cx + cols[c].width - 8 - tw : cx + 8;
    page.drawText(totVals[c], { x: textX, y: y - 16, size: sz, font: fontBold, color: COLORS.text });
    cx += cols[c].width;
  }
  y -= rowH + 2;

  // ── Footer ─────────────────────────────────────────────────────────────────
  const footerY = margin - 10;
  page.drawLine({ start: { x: margin, y: footerY + 12 }, end: { x: width - margin, y: footerY + 12 }, thickness: 0.3, color: COLORS.border });
  page.drawText("Generated by HRIQ · Remote Leverage", { x: margin, y: footerY, size: 7, font: fontRegular, color: COLORS.muted });
  const pageLabel = "Page 1";
  page.drawText(pageLabel, { x: width - margin - fontRegular.widthOfTextAtSize(pageLabel, 7), y: footerY, size: 7, font: fontRegular, color: COLORS.muted });

  return doc.save();
}

// ── Full payroll report PDF ─────────────────────────────────────────────────

type PayrollRow = {
  name: string;
  department: string;
  hours: number;
  rate: number;
  bonus: number;
  totalPay: number;
  status: string;
  period: string;
};

type PayrollReportData = {
  title: string;
  periodName: string;
  dateRange: string;
  generatedAt: string;
  summary: { label: string; value: string }[];
  rows: PayrollRow[];
  byDepartment: DeptRow[];
  totals: { headcount: number; hours: number; avgRate: string; laborCost: string; totalPaid: string };
};

export async function generateFullPayrollPDF(data: PayrollReportData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const W = 612;
  const H = 792;
  const margin = 40;

  function newPage() {
    const p = doc.addPage([W, H]);
    return { page: p, y: H - margin };
  }

  function drawFooter(page: ReturnType<typeof doc.addPage>, pageNum: number) {
    const fy = 28;
    page.drawLine({ start: { x: margin, y: fy + 10 }, end: { x: W - margin, y: fy + 10 }, thickness: 0.3, color: COLORS.border });
    page.drawText("Generated by HRIQ · Remote Leverage", { x: margin, y: fy, size: 7, font: fontRegular, color: COLORS.muted });
    const pl = `Page ${pageNum}`;
    page.drawText(pl, { x: W - margin - fontRegular.widthOfTextAtSize(pl, 7), y: fy, size: 7, font: fontRegular, color: COLORS.muted });
  }

  // ── Page 1: Cover + Summary ────────────────────────────────────────────────
  let { page, y } = newPage();

  // Header
  page.drawRectangle({ x: 0, y: H - 70, width: W, height: 70, color: COLORS.headerBg });
  page.drawText("REMOTE LEVERAGE", { x: margin, y: H - 24, size: 10, font: fontBold, color: COLORS.headerText });
  page.drawText(data.title, { x: margin, y: H - 44, size: 18, font: fontBold, color: COLORS.headerText });
  page.drawText(`${data.periodName} · ${data.dateRange}`, { x: margin, y: H - 60, size: 9, font: fontRegular, color: rgb(0.7, 0.7, 0.75) });
  const genT = `Generated ${data.generatedAt}`;
  page.drawText(genT, { x: W - margin - fontRegular.widthOfTextAtSize(genT, 8), y: H - 44, size: 8, font: fontRegular, color: rgb(0.55, 0.55, 0.6) });
  y = H - 70 - 28;

  // Summary cards
  const cardW = (W - margin * 2 - 36) / 4;
  for (let i = 0; i < Math.min(data.summary.length, 4); i++) {
    const cx = margin + i * (cardW + 12);
    page.drawRectangle({ x: cx, y: y - 50, width: cardW, height: 50, borderColor: COLORS.border, borderWidth: 0.5, color: rgb(1, 1, 1) });
    page.drawText(data.summary[i].label, { x: cx + 8, y: y - 14, size: 7, font: fontRegular, color: COLORS.muted });
    page.drawText(data.summary[i].value, { x: cx + 8, y: y - 34, size: 13, font: fontBold, color: COLORS.text });
  }
  y -= 78;

  // Department summary table
  page.drawText("Labor Cost by Department", { x: margin, y, size: 11, font: fontBold, color: COLORS.text });
  y -= 16;

  const dCols = [
    { label: "Department", w: 130, a: "left" as const },
    { label: "People", w: 50, a: "right" as const },
    { label: "Hours", w: 65, a: "right" as const },
    { label: "Avg Rate", w: 60, a: "right" as const },
    { label: "Labor Cost", w: 80, a: "right" as const },
    { label: "Paid", w: 80, a: "right" as const },
    { label: "% Total", w: 52, a: "right" as const },
  ];
  const dTableW = dCols.reduce((s, c) => s + c.w, 0);
  const rH = 20;

  // Dept header
  page.drawRectangle({ x: margin, y: y - 22, width: dTableW, height: 22, color: COLORS.headerBg });
  let dx = margin;
  for (const c of dCols) {
    const tw = fontBold.widthOfTextAtSize(c.label, 7);
    const tx = c.a === "right" ? dx + c.w - 6 - tw : dx + 6;
    page.drawText(c.label, { x: tx, y: y - 15, size: 7, font: fontBold, color: COLORS.headerText });
    dx += c.w;
  }
  y -= 22;

  for (let i = 0; i < data.byDepartment.length; i++) {
    const d = data.byDepartment[i];
    if (i % 2 === 1) page.drawRectangle({ x: margin, y: y - rH, width: dTableW, height: rH, color: COLORS.rowAlt });
    page.drawLine({ start: { x: margin, y: y - rH }, end: { x: margin + dTableW, y: y - rH }, thickness: 0.25, color: COLORS.border });

    const vals = [d.department, String(d.headcount), d.approvedHours.toFixed(1), d.avgRate > 0 ? `$${d.avgRate.toFixed(2)}` : "—", fmt$(d.laborCost), fmt$(d.totalPaid), d.pctOfTotal];
    dx = margin;
    for (let c = 0; c < dCols.length; c++) {
      const f = c === 0 || c === 4 ? fontBold : fontRegular;
      const tw = f.widthOfTextAtSize(vals[c], 7.5);
      const tx = dCols[c].a === "right" ? dx + dCols[c].w - 6 - tw : dx + 6;
      page.drawText(vals[c], { x: tx, y: y - 14, size: 7.5, font: f, color: COLORS.text });
      dx += dCols[c].w;
    }
    y -= rH;
  }

  // Totals
  page.drawRectangle({ x: margin, y: y - rH, width: dTableW, height: rH, color: COLORS.totalBg });
  const tVals = ["Total", String(data.totals.headcount), data.totals.hours.toFixed(1), data.totals.avgRate, data.totals.laborCost, data.totals.totalPaid, "100%"];
  dx = margin;
  for (let c = 0; c < dCols.length; c++) {
    const tw = fontBold.widthOfTextAtSize(tVals[c], 7.5);
    const tx = dCols[c].a === "right" ? dx + dCols[c].w - 6 - tw : dx + 6;
    page.drawText(tVals[c], { x: tx, y: y - 14, size: 7.5, font: fontBold, color: COLORS.text });
    dx += dCols[c].w;
  }
  y -= rH;

  drawFooter(page, 1);

  // ── Page 2+: Contractor Detail ─────────────────────────────────────────────
  if (data.rows.length > 0) {
    let pg = newPage();
    page = pg.page;
    y = pg.y;

    page.drawText("Contractor Detail", { x: margin, y, size: 12, font: fontBold, color: COLORS.text });
    y -= 18;

    const cCols = [
      { label: "Contractor", w: 130, a: "left" as const },
      { label: "Department", w: 90, a: "left" as const },
      { label: "Hours", w: 55, a: "right" as const },
      { label: "Rate", w: 55, a: "right" as const },
      { label: "Bonus", w: 55, a: "right" as const },
      { label: "Total Pay", w: 75, a: "right" as const },
      { label: "Status", w: 60, a: "left" as const },
    ];
    const cTableW = cCols.reduce((s, c) => s + c.w, 0);
    let pageNum = 2;

    // Header
    page.drawRectangle({ x: margin, y: y - 22, width: cTableW, height: 22, color: COLORS.headerBg });
    dx = margin;
    for (const c of cCols) {
      const tw = fontBold.widthOfTextAtSize(c.label, 7);
      const tx = c.a === "right" ? dx + c.w - 6 - tw : dx + 6;
      page.drawText(c.label, { x: tx, y: y - 15, size: 7, font: fontBold, color: COLORS.headerText });
      dx += c.w;
    }
    y -= 22;

    for (let i = 0; i < data.rows.length; i++) {
      if (y < 60) {
        drawFooter(page, pageNum);
        pageNum++;
        const np = newPage();
        page = np.page;
        y = np.y;
        page.drawText("Contractor Detail (continued)", { x: margin, y, size: 10, font: fontBold, color: COLORS.text });
        y -= 16;
        // Re-draw header
        page.drawRectangle({ x: margin, y: y - 22, width: cTableW, height: 22, color: COLORS.headerBg });
        dx = margin;
        for (const c of cCols) {
          const tw = fontBold.widthOfTextAtSize(c.label, 7);
          const tx = c.a === "right" ? dx + c.w - 6 - tw : dx + 6;
          page.drawText(c.label, { x: tx, y: y - 15, size: 7, font: fontBold, color: COLORS.headerText });
          dx += c.w;
        }
        y -= 22;
      }

      const r = data.rows[i];
      if (i % 2 === 1) page.drawRectangle({ x: margin, y: y - rH, width: cTableW, height: rH, color: COLORS.rowAlt });
      page.drawLine({ start: { x: margin, y: y - rH }, end: { x: margin + cTableW, y: y - rH }, thickness: 0.25, color: COLORS.border });

      const vals = [
        r.name.length > 22 ? r.name.slice(0, 22) + "…" : r.name,
        r.department.length > 14 ? r.department.slice(0, 14) + "…" : r.department,
        r.hours > 0 ? r.hours.toFixed(1) : "0",
        r.rate > 0 ? `$${r.rate.toFixed(2)}` : "—",
        r.bonus > 0 ? fmt$(r.bonus) : "—",
        fmt$(r.totalPay),
        r.status.replace(/_/g, " "),
      ];
      dx = margin;
      for (let c = 0; c < cCols.length; c++) {
        const f = c === 0 || c === 5 ? fontBold : fontRegular;
        const sz = 7;
        const tw = f.widthOfTextAtSize(vals[c], sz);
        const tx = cCols[c].a === "right" ? dx + cCols[c].w - 6 - tw : dx + 6;
        page.drawText(vals[c], { x: tx, y: y - 14, size: sz, font: f, color: COLORS.text });
        dx += cCols[c].w;
      }
      y -= rH;
    }

    drawFooter(page, pageNum);
  }

  return doc.save();
}

export function downloadPDFBlob(pdfBytes: Uint8Array, filename: string) {
  const ab = pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer;
  const blob = new Blob([ab], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
