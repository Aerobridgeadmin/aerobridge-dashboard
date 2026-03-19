import { database } from "@repo/database";
import { NextResponse } from "next/server";

export const maxDuration = 30;

/**
 * Daily cron: clean up expired login verification codes and trusted devices.
 * Schedule: Daily at 3am UTC  vercel.json: "0 3 * * *"
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  const [verifications, devices] = await Promise.all([
    database.loginVerification.deleteMany({
      where: { expiresAt: { lt: now } },
    }),
    database.trustedDevice.deleteMany({
      where: { expiresAt: { lt: now } },
    }),
  ]);

  // Prune vercel_logs older than 3 days to prevent DB bloat
  let prunedLogs = 0;
  try {
    const result = await database.$executeRaw`DELETE FROM vercel_logs WHERE timestamp < now() - interval '3 days'`;
    prunedLogs = result;
  } catch (err) {
    console.error("[cleanup-auth] Failed to prune vercel_logs:", err);
  }

  return NextResponse.json({
    ok: true,
    deletedVerifications: verifications.count,
    deletedDevices: devices.count,
    prunedLogs,
    timestamp: now.toISOString(),
  });
}
