import "server-only";
import { GoogleAuth } from "google-auth-library";

export function isGoogleSheetsConfigured(): boolean {
  return !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
}

async function getAuthToken() {
  const keyJson = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!);

  const auth = new GoogleAuth({
    credentials: {
      client_email: keyJson.client_email,
      private_key: keyJson.private_key,
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  const client = await auth.getClient();
  const token = await client.getAccessToken();
  return token.token;
}

export type TimesheetRow = {
  date: string;
  startTime: string | null;
  payableHours: number;
  notes: string | null;
};

export type ParsedTimesheet = {
  employeeName: string;
  hourlyRate: number;
  periodLabel: string;
  cutoff: string;
  rows: TimesheetRow[];
  totalHours: number;
  bonuses: { description: string; amount: number }[];
};

function parseTimeToHours(timeStr: string): number {
  if (!timeStr) return 0;
  const cleaned = String(timeStr).trim();
  // Handle HH:MM:SS or H:MM:SS format
  const parts = cleaned.split(":");
  if (parts.length >= 2) {
    const hours = parseInt(parts[0], 10) || 0;
    const minutes = parseInt(parts[1], 10) || 0;
    return hours + minutes / 60;
  }
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

export async function readTimesheetFromSheet(spreadsheetId: string, sheetName?: string): Promise<ParsedTimesheet | null> {
  if (!isGoogleSheetsConfigured()) return null;

  const token = await getAuthToken();

  // Get sheet names if no specific sheet requested
  if (!sheetName) {
    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!metaRes.ok) return null;
    const meta = await metaRes.json();
    const sheets = meta.sheets?.map((s: { properties: { title: string } }) => s.properties.title) ?? [];
    // Use the last sheet (most recent pay period)
    sheetName = sheets[sheets.length - 1];
    if (!sheetName) return null;
  }

  const range = `'${sheetName}'!A1:J30`;
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) {
    console.error("[Google Sheets] API error:", await res.text());
    return null;
  }

  const data = await res.json();
  const values: (string | number | null)[][] = data.values ?? [];

  if (values.length < 5) return null;

  // Parse header info
  const periodLabel = String(values[0]?.[0] ?? "").trim();
  const cutoff = String(values[1]?.[0] ?? "").trim();
  const employeeName = String(values[2]?.[1] ?? "").replace(/Employee Name:\s*/i, "").trim();
  const hourlyRate = Number(values[2]?.[4]) || 0;

  // Parse daily rows (rows 5-20, index 4-19)
  const rows: TimesheetRow[] = [];
  let totalHours = 0;

  for (let i = 4; i < Math.min(values.length, 21); i++) {
    const row = values[i];
    if (!row || !row[0]) continue;

    const dateVal = String(row[0]).trim();
    if (!dateVal || dateVal === "TOTAL:" || dateVal.includes("TOTAL")) break;

    const startTime = row[1] ? String(row[1]).trim() : null;
    const payableTimeStr = row[2] ? String(row[2]) : "";
    const notes = row[3] ? String(row[3]).trim() : null;

    // Skip day off entries
    if (startTime === "Day off" || startTime === "day off") {
      rows.push({ date: dateVal, startTime: "Day off", payableHours: 0, notes });
      continue;
    }

    const payableHours = parseTimeToHours(payableTimeStr);
    totalHours += payableHours;

    rows.push({ date: dateVal, startTime, payableHours, notes });
  }

  // Parse bonuses (columns G-H, index 6-7)
  const bonuses: { description: string; amount: number }[] = [];
  for (let i = 4; i < Math.min(values.length, 21); i++) {
    const row = values[i];
    if (!row) continue;
    const desc = row[6] ? String(row[6]).trim() : "";
    const amt = row[7] ? Number(row[7]) : 0;
    if (desc && amt > 0 && !desc.includes("KINDLY") && !desc.includes("CREATE") && !desc.includes("CLICK") && !desc.includes("BOOKMARK") && !desc.includes("PLEASE")) {
      bonuses.push({ description: desc, amount: amt });
    }
  }

  return {
    employeeName,
    hourlyRate,
    periodLabel,
    cutoff,
    rows,
    totalHours: Math.round(totalHours * 100) / 100,
    bonuses,
  };
}

export async function getAllSheetNames(spreadsheetId: string): Promise<string[]> {
  if (!isGoogleSheetsConfigured()) return [];

  const token = await getAuthToken();
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) return [];
  const meta = await res.json();
  return meta.sheets?.map((s: { properties: { title: string } }) => s.properties.title) ?? [];
}

export async function readAllPeriodsFromSheet(
  spreadsheetId: string
): Promise<ParsedTimesheet[]> {
  const sheetNames = await getAllSheetNames(spreadsheetId);
  if (sheetNames.length === 0) return [];

  const periods: ParsedTimesheet[] = [];
  for (const sheetName of sheetNames) {
    try {
      const parsed = await readTimesheetFromSheet(spreadsheetId, sheetName);
      if (parsed) periods.push(parsed);
    } catch (error) {
      console.error(`[Google Sheets] Failed to parse sheet "${sheetName}":`, error);
    }
  }

  return periods;
}
