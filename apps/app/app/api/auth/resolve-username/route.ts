import { database } from "@repo/database";
import { NextResponse } from "next/server";

// Simple in-memory rate limiter: max 10 attempts per IP per 5 minutes
// Includes periodic cleanup to prevent memory leaks
const attempts = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 5 * 60 * 1000; // 5 minutes
const RATE_LIMIT_MAX = 10;
const CLEANUP_INTERVAL = 10 * 60 * 1000; // Clean up every 10 minutes
let lastCleanup = Date.now();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();

  // Periodic cleanup of expired entries to prevent memory leak
  if (now - lastCleanup > CLEANUP_INTERVAL) {
    lastCleanup = now;
    for (const [key, entry] of attempts) {
      if (now > entry.resetAt) attempts.delete(key);
    }
  }

  const entry = attempts.get(ip);
  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT_MAX;
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const visible = local.length <= 2 ? local[0] : local.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(local.length - 2, 1))}@${domain}`;
}

export async function POST(req: Request) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (!checkRateLimit(ip)) {
      return NextResponse.json({ error: "Too many attempts. Please wait a few minutes." }, { status: 429 });
    }

    const { username } = await req.json();

    if (!username || typeof username !== "string") {
      return NextResponse.json({ error: "Username required" }, { status: 400 });
    }

    const trimmed = username.trim().toLowerCase();

    // Search by employee username field (primary), then fall back to app_users displayName
    const employee = await database.employee.findFirst({
      where: {
        username: { equals: trimmed, mode: "insensitive" },
      },
      select: { personalEmail: true, workEmail: true, employmentStatus: true, linkedUserId: true },
    });

    if (employee) {
      if (employee.employmentStatus === "offboarded") {
        return NextResponse.json({ error: "This account has been deactivated. Contact your administrator." }, { status: 403 });
      }

      // Find the email that matches the actual auth account.
      // The app_users table stores the email the auth account was created with.
      // This avoids querying auth.users which requires elevated permissions.
      let email: string | null = null;

      if (employee.linkedUserId) {
        const appUser = await database.appUser.findFirst({
          where: { supabaseUserId: employee.linkedUserId },
          select: { email: true },
        });
        if (appUser?.email) {
          email = appUser.email;
        }
      }

      // Fallback: use personal email first (matches provisioned accounts),
      // then work email (matches Google SSO accounts)
      if (!email) {
        email = employee.personalEmail || employee.workEmail;
      }

      if (!email) {
        return NextResponse.json({ error: "No email associated with this username." }, { status: 404 });
      }
      return NextResponse.json({ email, maskedEmail: maskEmail(email) });
    }

    // Fallback: search app_users by displayName
    const user = await database.appUser.findFirst({
      where: {
        displayName: { equals: trimmed, mode: "insensitive" },
      },
      select: { email: true, isActive: true },
    });

    if (!user) {
      return NextResponse.json({ error: "Username not found" }, { status: 404 });
    }

    if (!user.isActive) {
      return NextResponse.json({ error: "This account has been deactivated. Contact your administrator to reactivate it." }, { status: 403 });
    }

    // Return full email for the login flow, but also a masked version for display
    return NextResponse.json({ email: user.email, maskedEmail: maskEmail(user.email) });
  } catch (err) {
    console.error("[resolve-username] Error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
