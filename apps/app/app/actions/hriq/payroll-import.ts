"use server";

import { requireOrg } from "@repo/auth/session";
import { database } from "@repo/database";
import * as XLSX from "xlsx";
import Fuse from "fuse.js";

// ── Types ──────────────────────────────────────────────

export type PayrollEntry = {
  vaName: string;
  amount: number | null;
  paymentMethod: string;
  periodStart: string;
  periodEnd: string;
  paymentDate: string;
};

export type MatchedEntry = PayrollEntry & {
  employeeId: string | null;
  employeeName: string | null;
  matchScore: number;
  status: "matched" | "unmatched" | "ambiguous";
};

export type ImportResult = {
  imported: number;
  skipped: number;
  unmatched: string[];
};

// ── Parser ─────────────────────────────────────────────

const KNOWN_METHODS = ["wise", "remitly", "cadana"];
const SKIP_WORDS = ["va name", "total", "abbas mohammed", "payroll period", "payment date"];

function parseAmount(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const str = String(raw).replace(/[$,#REF!]/g, "").trim();
  if (!str || str === "0" || str === "0.00") return null;
  const num = Number.parseFloat(str);
  return Number.isNaN(num) ? null : num;
}

function parsePeriod(raw: string): { start: string; end: string } {
  const parts = raw.split("-").map((s) => s.trim());
  const year = new Date().getFullYear();
  const parse = (s: string) => {
    const d = new Date(`${s}/${year}`);
    return Number.isNaN(d.getTime()) ? s : d.toISOString().slice(0, 10);
  };
  return {
    start: parts[0] ? parse(parts[0]) : "",
    end: parts[1] ? parse(parts[1]) : "",
  };
}

function parsePaymentDate(raw: string): string {
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? raw : d.toISOString().slice(0, 10);
}

export function parsePayrollXlsx(buffer: ArrayBuffer): PayrollEntry[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const entries: PayrollEntry[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: "",
    });

    let currentMethod = "";
    let currentPeriodStart = "";
    let currentPeriodEnd = "";
    let currentPaymentDate = "";
    let inVAList = false;

    for (const row of rows) {
      const cell0 = String(row[0] ?? "").trim();
      const cell1 = String(row[1] ?? "").trim();
      const lower0 = cell0.toLowerCase();

      if (lower0.startsWith("payroll period")) {
        const { start, end } = parsePeriod(cell1);
        currentPeriodStart = start;
        currentPeriodEnd = end;
        inVAList = false;
        continue;
      }

      if (lower0.startsWith("payment date")) {
        currentPaymentDate = parsePaymentDate(cell1);
        inVAList = false;
        continue;
      }

      if (KNOWN_METHODS.includes(lower0)) {
        currentMethod = lower0;
        inVAList = false;
        continue;
      }

      if (lower0 === "va name") {
        inVAList = true;
        continue;
      }

      if (lower0 === "total" || lower0 === "") {
        if (lower0 === "total") inVAList = false;
        continue;
      }

      if (lower0.startsWith("abbas mohammed")) {
        inVAList = false;
        continue;
      }

      if (inVAList && cell0 && !SKIP_WORDS.some((w) => lower0.includes(w))) {
        entries.push({
          vaName: cell0,
          amount: parseAmount(row[1]),
          paymentMethod: currentMethod,
          periodStart: currentPeriodStart,
          periodEnd: currentPeriodEnd,
          paymentDate: currentPaymentDate,
        });
      }
    }
  }

  return entries;
}

// ── Fuzzy Matching ─────────────────────────────────────

type EmployeeRef = {
  id: string;
  legalFirstName: string;
  legalLastName: string;
  fullName: string;
  employeeNumber: string;
};

export function matchEntries(
  entries: PayrollEntry[],
  employees: EmployeeRef[]
): MatchedEntry[] {
  const fuse = new Fuse(employees, {
    keys: ["fullName"],
    threshold: 0.4,
    includeScore: true,
  });

  return entries.map((entry) => {
    const results = fuse.search(entry.vaName);
    if (results.length === 0) {
      return {
        ...entry,
        employeeId: null,
        employeeName: null,
        matchScore: 0,
        status: "unmatched" as const,
      };
    }

    const best = results[0];
    const score = 1 - (best.score ?? 1);

    if (score > 0.7) {
      return {
        ...entry,
        employeeId: best.item.id,
        employeeName: best.item.fullName,
        matchScore: score,
        status: "matched" as const,
      };
    }

    return {
      ...entry,
      employeeId: best.item.id,
      employeeName: best.item.fullName,
      matchScore: score,
      status: "ambiguous" as const,
    };
  });
}

// ── Server Actions ─────────────────────────────────────

export async function previewPayrollImport(formData: FormData) {
  const session = await requireOrg();
  const file = formData.get("file") as File;
  if (!file) throw new Error("No file provided");

  const buffer = await file.arrayBuffer();
  const entries = parsePayrollXlsx(buffer);

  const employees = await database.employee.findMany({
    where: {
      organizationId: session.orgId,
      employmentStatus: { not: "offboarded" },
    },
    select: {
      id: true,
      legalFirstName: true,
      legalLastName: true,
      employeeNumber: true,
    },
    orderBy: { legalFirstName: "asc" },
  });

  const employeeRefs: EmployeeRef[] = employees.map((e) => ({
    ...e,
    fullName: `${e.legalFirstName} ${e.legalLastName}`,
  }));

  const matched = matchEntries(entries, employeeRefs);

  return {
    entries: matched,
    employees: employeeRefs.map((e) => ({
      id: e.id,
      name: e.fullName,
      number: e.employeeNumber,
    })),
    summary: {
      total: matched.length,
      matched: matched.filter((m) => m.status === "matched").length,
      ambiguous: matched.filter((m) => m.status === "ambiguous").length,
      unmatched: matched.filter((m) => m.status === "unmatched").length,
      withAmount: matched.filter((m) => m.amount != null && m.amount > 0).length,
    },
  };
}

export async function executePayrollImport(
  entries: {
    employeeId: string;
    amount: number;
    paymentMethod: string;
    periodStart: string;
    periodEnd: string;
    paymentDate: string;
  }[]
): Promise<ImportResult> {
  const session = await requireOrg();

  let imported = 0;
  let skipped = 0;
  const unmatched: string[] = [];

  const validEntries = entries.filter((e) => e.employeeId && e.amount && e.amount > 0);
  const employeeIds = [...new Set(validEntries.map((e) => e.employeeId!))];
  const orgEmployees = await database.employee.findMany({
    where: { id: { in: employeeIds }, organizationId: session.orgId },
    select: { id: true },
  });
  const validEmployeeIds = new Set(orgEmployees.map((e) => e.id));

  skipped += entries.length - validEntries.length;

  for (const entry of validEntries) {
    if (!validEmployeeIds.has(entry.employeeId!)) {
      unmatched.push(entry.employeeId!);
      continue;
    }

    const existing = await database.payment.findFirst({
      where: {
        employeeId: entry.employeeId,
        amount: String(entry.amount),
        periodStart: entry.periodStart ? new Date(entry.periodStart) : undefined,
        periodEnd: entry.periodEnd ? new Date(entry.periodEnd) : undefined,
      },
      select: { id: true },
    });

    if (existing) {
      skipped++;
      continue;
    }

    await database.payment.create({
      data: {
        employeeId: entry.employeeId!,
        paymentType: "salary",
        amount: String(entry.amount),
        currency: "USD",
        periodStart: entry.periodStart ? new Date(entry.periodStart) : undefined,
        periodEnd: entry.periodEnd ? new Date(entry.periodEnd) : undefined,
        paymentDate: entry.paymentDate ? new Date(entry.paymentDate) : undefined,
        paymentMethod: entry.paymentMethod || undefined,
        status: "completed",
        processedByUserId: session.userId,
        processedByName: session.name ?? undefined,
        description: `Payroll import: ${entry.periodStart} - ${entry.periodEnd}`,
      },
    });

    imported++;
  }

  return { imported, skipped, unmatched };
}
