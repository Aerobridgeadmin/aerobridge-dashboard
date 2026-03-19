import { NextRequest, NextResponse } from "next/server";

/**
 * Tech Newsletter API - Routes to the tech-newsletter Supabase edge functions.
 * The edge functions contain complex business logic (AI search, Slack, email sending)
 * that runs natively on Supabase infrastructure.
 */
const SUPA_URL = "https://tvzhfpxbbtojmurvmvni.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR2emhmcHhiYnRvam11cnZtdm5pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNjYyMTksImV4cCI6MjA4Njc0MjIxOX0.CXBx2hoIBper3kTdNOa-pAlnNRUqvVg5IJSPrW3VIVQ";

function getEdgeFunctionPath(req: NextRequest): string {
  const url = new URL(req.url);
  // /api/tech-newsletter/newsletters -> /functions/v1/newsletters
  return url.pathname.replace("/api/tech-newsletter", "/functions/v1");
}

async function handler(req: NextRequest) {
  const fnPath = getEdgeFunctionPath(req);
  const url = new URL(req.url);
  const target = `${SUPA_URL}${fnPath}${url.search}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${SUPA_KEY}`,
    "Content-Type": "application/json",
    apikey: SUPA_KEY,
  };

  const init: RequestInit = { method: req.method, headers };
  if (req.method !== "GET" && req.method !== "HEAD") {
    try { init.body = await req.text(); } catch (err) { console.warn("[[...path]/route:handler] Suppressed error:", err); }
  }

  try {
    const resp = await fetch(target, init);
    const body = await resp.text();
    return new NextResponse(body, {
      status: resp.status,
      headers: { "Content-Type": resp.headers.get("content-type") || "application/json" },
    });
  } catch (e) {
    return NextResponse.json({ error: "Tech newsletter API error", detail: String(e) }, { status: 502 });
  }
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
export const PATCH = handler;
