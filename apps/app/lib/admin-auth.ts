import { NextResponse } from "next/server";

/**
 * Verify admin/cron auth via Bearer header or ?key= query param.
 * Prefers the Authorization header; falls back to query param for backward compat.
 *
 * Usage:
 *   const authError = verifyAdminAuth(request);
 *   if (authError) return authError;
 */
export function verifyAdminAuth(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  // Prefer Authorization: Bearer header
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${secret}`) return null;

  // Fallback: ?key= query param (legacy, logs in URLs)
  const url = new URL(request.url);
  const keyParam = url.searchParams.get("key") ?? url.searchParams.get("secret");
  if (keyParam === secret) return null;

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
