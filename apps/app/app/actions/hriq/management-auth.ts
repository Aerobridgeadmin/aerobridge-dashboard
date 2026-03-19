"use server";

import { HriqError } from "@/lib/hriq/errors";
import { requireOrg } from "@repo/auth/session";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Verify the management password for sensitive financial operations.
 * Accepts either a raw password OR a session token (from createManagementSession).
 */
export async function verifyManagementPassword(passwordOrToken: string): Promise<void> {
  // Check if it's a session token first (starts with "mgmt_")
  if (passwordOrToken.startsWith("mgmt_")) {
    await verifyManagementToken(passwordOrToken);
    return;
  }

  const expected = process.env.MANAGEMENT_PASSWORD;
  if (!expected) {
    throw new HriqError("HRIQ-0850", "Management password not configured — contact admin");
  }

  const crypto = await import("crypto");
  const a = Buffer.from(passwordOrToken);
  const b = Buffer.from(expected);

  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    const session = await requireOrg().catch(() => null);
    console.error(
      `[MANAGEMENT_AUTH] Failed password attempt by ${session?.name ?? "unknown"} (${session?.userId ?? "?"})`
    );
    throw new HriqError("HRIQ-0851", "Invalid management password");
  }
}

/**
 * Quick check for client-side — validates password, returns true/false.
 */
export async function checkManagementPassword(password: string): Promise<{ valid: boolean }> {
  try {
    await verifyManagementPassword(password);
    return { valid: true };
  } catch {
    return { valid: false };
  }
}

/**
 * Create a signed management session token after password verification.
 * Returns a token the client can cache in sessionStorage for 24h.
 * The token is bound to the user's ID so it can't be reused by another user.
 */
export async function createManagementSession(password: string): Promise<{ token: string; expiresAt: number }> {
  // First verify the password
  await verifyManagementPassword(password);

  const session = await requireOrg();
  const crypto = await import("crypto");
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = `${session.userId}:${expiresAt}`;
  const secret = process.env.MANAGEMENT_PASSWORD!;
  const hmac = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  const token = `mgmt_${payload}:${hmac}`;

  return { token, expiresAt };
}

/**
 * Verify a management session token.
 * Checks: signature valid, not expired, matches current user.
 */
async function verifyManagementToken(token: string): Promise<void> {
  const session = await requireOrg();
  const crypto = await import("crypto");
  const secret = process.env.MANAGEMENT_PASSWORD;
  if (!secret) throw new HriqError("HRIQ-0850", "Management password not configured");

  const raw = token.replace("mgmt_", "");
  const parts = raw.split(":");
  if (parts.length !== 3) throw new HriqError("HRIQ-0851", "Invalid session token");

  const [userId, expiresAtStr, providedHmac] = parts;
  const payload = `${userId}:${expiresAtStr}`;
  const expectedHmac = crypto.createHmac("sha256", secret).update(payload).digest("hex");

  // Constant-time comparison
  const a = Buffer.from(providedHmac);
  const b = Buffer.from(expectedHmac);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new HriqError("HRIQ-0851", "Invalid session token");
  }

  // Check expiry
  const expiresAt = Number(expiresAtStr);
  if (Date.now() > expiresAt) {
    throw new HriqError("HRIQ-0851", "Session expired — please re-enter management password");
  }

  // Check user match
  if (userId !== session.userId) {
    throw new HriqError("HRIQ-0851", "Session token does not match current user");
  }
}
