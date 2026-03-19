import { database } from "@repo/database";
import { NextResponse } from "next/server";
import { headers } from "next/headers";

// Simple in-memory rate limiter (resets on deploy, fine for this use case)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10; // max requests
const RATE_WINDOW = 60_000; // per minute
const CLEANUP_INTERVAL = 5 * 60_000; // clean up every 5 minutes
let lastCleanup = Date.now();

function isRateLimited(key: string): boolean {
  const now = Date.now();

  // Periodic cleanup of expired entries to prevent memory leak
  if (now - lastCleanup > CLEANUP_INTERVAL) {
    lastCleanup = now;
    for (const [k, entry] of rateLimitMap) {
      if (now > entry.resetAt) rateLimitMap.delete(k);
    }
  }

  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_WINDOW });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT;
}

export async function POST(request: Request) {
  try {
    const hdrs = await headers();
    const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (isRateLimited(ip)) {
      return NextResponse.json({ allowed: false, reason: "Too many requests. Please try again later." }, { status: 429 });
    }

    const { email } = (await request.json()) as { email?: string };
    if (!email) {
      return NextResponse.json({ allowed: false, reason: "Email required" });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check approved_emails table
    const approved = await database.approvedEmail.findFirst({
      where: { email: normalizedEmail },
    });

    if (approved) {
      return NextResponse.json({ allowed: true });
    }

    // Check pending organization_invitations
    const invitation = await database.organizationInvitation.findFirst({
      where: {
        email: normalizedEmail,
        acceptedAt: null,
      },
    });

    if (invitation) {
      return NextResponse.json({ allowed: true });
    }

    return NextResponse.json({
      allowed: false,
      reason: "This email is not authorized to create an account. Please contact your administrator for an invitation.",
    });
  } catch (error) {
    console.error("[check-email] Error:", error);
    return NextResponse.json({ allowed: false, reason: "Unable to verify email" });
  }
}
