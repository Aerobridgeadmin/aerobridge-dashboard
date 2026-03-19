import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const LOG_DRAIN_SECRET = process.env.LOG_DRAIN_SECRET || "";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

/** Split a bundled lambda message into individual log entries */
function splitBundledMessage(log: any): any[] {
  const msg = log.message || log.text || "";
  const source = log.source || log.type || "";

  // Lambda logs bundle START/console output/END/REPORT into one message
  // Split on newlines and create separate entries for each meaningful line
  if (source === "lambda" && msg.includes("\n")) {
    const lines = msg.split("\n").filter((l: string) => l.trim());
    const results: any[] = [];
    
    for (const line of lines) {
      // Determine log level from line content
      let level = "info";
      if (line.startsWith("ERROR") || line.includes("[error]") || line.includes("Error:") || line.includes("HRIQ-")) level = "error";
      else if (line.startsWith("WARN") || line.includes("[warn]") || line.includes("[warning]")) level = "warning";
      else if (line.startsWith("REPORT")) level = "info";
      else if (line.startsWith("START") || line.startsWith("END")) level = "info";
      
      // Extract HTTP status from request lines like [POST] /path status=500
      const statusMatch = line.match(/status=(\d+)/);
      const statusCode = statusMatch ? parseInt(statusMatch[1]) : null;
      if (statusCode && statusCode >= 400) level = "error";

      results.push({
        timestamp: log.timestamp ? new Date(log.timestamp).toISOString() : new Date().toISOString(),
        level,
        message: line.trim(),
        source,
        request_path: log.path || log.requestPath || log.proxy?.path || "",
        status_code: statusCode || log.statusCode || log.proxy?.statusCode || null,
        deployment_id: log.deploymentId || "",
        raw: results.length === 0 ? log : null, // Only store raw on first entry to save space
      });
    }
    return results;
  }

  // Non-bundled: return as single entry
  return [{
    timestamp: log.timestamp ? new Date(log.timestamp).toISOString() : new Date().toISOString(),
    level: log.level || log.type || "info",
    message: msg,
    source,
    request_path: log.path || log.requestPath || log.proxy?.path || "",
    status_code: log.statusCode || log.proxy?.statusCode || null,
    deployment_id: log.deploymentId || "",
    raw: log,
  }];
}

export async function POST(req: NextRequest) {
  // Validate secret via query param
  const secret = req.nextUrl.searchParams.get("secret");
  if (!LOG_DRAIN_SECRET || secret !== LOG_DRAIN_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.text();
    const lines = body
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    if (lines.length === 0) {
      return NextResponse.json({ ok: true, inserted: 0 });
    }

    const rows = lines
      .filter((log: any) => {
        // Skip recursive log-drain entries to prevent noise
        const path = log.path || log.requestPath || log.proxy?.path || "";
        const msg = log.message || log.text || "";
        if (path.includes("/api/internal/log-drain")) return false;
        if (msg.includes("/api/internal/log-drain")) return false;
        return true;
      })
      .flatMap((log: any) => splitBundledMessage(log))
      .filter((row: any) => row.message.trim()); // Skip empty messages

    const supabase = getSupabase();

    if (rows.length === 0) {
      return NextResponse.json({ ok: true, inserted: 0 });
    }

    // Insert in batches of 100 to avoid payload limits
    const batchSize = 100;
    let totalInserted = 0;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const { error } = await supabase.from("vercel_logs").insert(batch);
      if (error) {
        console.error("[log-drain] Supabase insert error:", error);
      } else {
        totalInserted += batch.length;
      }
    }

    return NextResponse.json({ ok: true, inserted: totalInserted });
  } catch (err) {
    console.error("[log-drain] Error processing logs:", err);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}

// Vercel sends a GET to verify the endpoint when creating a log drain
export async function GET(req: NextRequest) {
  // Always return the Vercel log drain verification header on GET
  const verifyToken = process.env.VERCEL_LOG_DRAIN_VERIFY;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (verifyToken) {
    headers["x-vercel-verify"] = verifyToken;
  }

  return new NextResponse(JSON.stringify({ ok: true, status: "log-drain-ready" }), {
    status: 200,
    headers,
  });
}
