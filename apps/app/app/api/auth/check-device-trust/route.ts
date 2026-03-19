import { database } from "@repo/database";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { rateLimit } from "@/lib/rate-limit";

const limiter = rateLimit({ max: 10, windowMs: 60000 });

const COOKIE_NAME = "rl_device_trust";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(request: Request) {
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  const { limited } = limiter.check(ip);
  if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  try {
    const { email } = await request.json();
    if (!email || typeof email !== "string") {
      return NextResponse.json({ trusted: false });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;

    if (!token) {
      return NextResponse.json({ trusted: false });
    }

    const tokenHash = hashToken(token);

    const device = await database.trustedDevice.findFirst({
      where: {
        email: normalizedEmail,
        tokenHash,
        expiresAt: { gte: new Date() },
      },
    });

    if (!device) {
      return NextResponse.json({ trusted: false });
    }

    return NextResponse.json({ trusted: true });
  } catch (err) {
    console.error("[check-device-trust] Error:", err);
    return NextResponse.json({ trusted: false });
  }
}
