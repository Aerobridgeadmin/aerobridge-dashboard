const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

type LogLevel = "info" | "warn" | "error" | "debug";

interface LogEntry {
  level: LogLevel;
  message: string;
  source?: string;
  request_path?: string;
  status_code?: number;
  raw?: Record<string, unknown>;
}

/**
 * Write a structured log entry to the vercel_logs table.
 * Fire-and-forget: never throws, never blocks the calling function.
 * Uses raw fetch to avoid extra dependencies.
 */
export function dbLog(entry: LogEntry): void {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;

  const row = {
    timestamp: new Date().toISOString(),
    level: entry.level,
    message: entry.message,
    source: entry.source || "app",
    request_path: entry.request_path || "",
    status_code: entry.status_code || null,
    deployment_id: process.env.VERCEL_DEPLOYMENT_ID || "",
    raw: entry.raw || null,
  };

  fetch(`${SUPABASE_URL}/rest/v1/vercel_logs`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(row),
  }).catch(() => {
    // Silently ignore — logging should never crash the app
  });
}

/** Convenience wrappers */
export const dbLogInfo = (message: string, meta?: Omit<LogEntry, "level" | "message">) =>
  dbLog({ level: "info", message, ...meta });

export const dbLogWarn = (message: string, meta?: Omit<LogEntry, "level" | "message">) =>
  dbLog({ level: "warn", message, ...meta });

export const dbLogError = (message: string, meta?: Omit<LogEntry, "level" | "message">) =>
  dbLog({ level: "error", message, ...meta });
