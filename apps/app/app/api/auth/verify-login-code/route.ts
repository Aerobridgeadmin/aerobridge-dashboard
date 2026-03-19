import { database } from "@repo/database";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { rateLimit } from "@/lib/rate-limit";

const COOKIE_NAME = "rl_device_trust";
const TRUST_DAYS = 30;
const limiter = rateLimit({ max: 10, windowMs: 60_000 }); // 10 attempts per minute

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(request: Request) {
  const ip = (await headers()).get("x-forwarded-for") ?? "unknown";
  const { limited } = limiter.check(ip);
  if (limited) {
    return NextResponse.json({ error: "Too many attempts. Please try again shortly." }, { status: 429 });
  }

  try {
    const { email, code } = await request.json();
    if (!email || !code) {
      return NextResponse.json({ error: "Email and code required" }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedCode = code.trim();

    // Rate limit: max 10 verification attempts per email in 15 minutes
    const recentAttempts = await database.loginVerification.count({
      where: {
        email: normalizedEmail,
        createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) },
      },
    });
    if (recentAttempts > 10) {
      return NextResponse.json({ error: "Too many attempts. Please request a new code." }, { status: 429 });
    }

    const verification = await database.loginVerification.findFirst({
      where: {
        email: normalizedEmail,
        code: normalizedCode,
        usedAt: null,
        expiresAt: { gte: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!verification) {
      // Check if code exists but expired
      const expired = await database.loginVerification.findFirst({
        where: { email: normalizedEmail, code: normalizedCode, usedAt: null },
        orderBy: { createdAt: "desc" },
      });

      if (expired) {
        return NextResponse.json({ error: "Code expired. Please request a new one." }, { status: 400 });
      }

      return NextResponse.json({ error: "Invalid code" }, { status: 400 });
    }

    // Atomically mark as used — only succeeds if still unused (prevents race condition)
    const atomicUpdate = await database.loginVerification.updateMany({
      where: { id: verification.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (atomicUpdate.count === 0) {
      // Another request already consumed this code
      return NextResponse.json({ error: "Code already used. Please request a new one." }, { status: 400 });
    }

    // --- Trust this device for 30 days ---
    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + TRUST_DAYS * 24 * 60 * 60 * 1000);
    const userAgent = request.headers.get("user-agent")?.slice(0, 500) ?? null;

    // Store trust record
    await database.trustedDevice.create({
      data: {
        email: normalizedEmail,
        tokenHash,
        userAgent,
        expiresAt,
      },
    });

    // Clean up expired tokens for this email (keep it tidy)
    database.trustedDevice.deleteMany({
      where: { email: normalizedEmail, expiresAt: { lt: new Date() } },
    }).catch(() => {});

    // Set secure cookie
    const cookieStore = await cookies();
    cookieStore.set(COOKIE_NAME, rawToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: TRUST_DAYS * 24 * 60 * 60,
    });

    return NextResponse.json({ verified: true });
  } catch (error) {
    console.error("[verify-login-code] Error:", error);
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
