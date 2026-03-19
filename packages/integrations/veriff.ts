/**
 * Veriff Identity Verification Integration
 * Used for client (organization) onboarding KYC/KYB verification.
 *
 * Docs: https://developers.veriff.com
 *
 * Flow:
 *   1. Create a Veriff session for the org admin
 *   2. Send verification URL to the admin via email
 *   3. Admin completes verification (ID scan + selfie)
 *   4. Veriff sends webhook with decision
 *   5. We update org profile verification status
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type VeriffSessionStatus =
  | "created"       // Session created, awaiting user
  | "started"       // User opened the verification link
  | "submitted"     // User submitted documents, awaiting decision
  | "approved"      // Identity verified successfully
  | "declined"      // Verification failed
  | "resubmission_requested" // Need to redo verification
  | "abandoned"     // User didn't complete
  | "expired";      // Session expired (7 days default)

export type VeriffDecisionCode =
  | 9001  // Approved
  | 9102  // Declined: person denied
  | 9103  // Declined: document issue
  | 9104  // Declined: fraud
  | 9121; // Resubmission requested

export interface VeriffSessionResponse {
  status: string;
  verification: {
    id: string;
    url: string;
    vendorData: string;
    host: string;
    status: string;
    sessionToken: string;
  };
}

export interface VeriffDecisionPayload {
  id: string;
  feature: string;
  code: number;
  action: string;
  vendorData: string;
  verification: {
    id: string;
    code: number;
    person: {
      firstName: string | null;
      lastName: string | null;
      dateOfBirth: string | null;
      nationality: string | null;
      yearOfBirth: string | null;
      placeOfBirth: string | null;
      idNumber: string | null;
      gender: string | null;
    };
    document: {
      number: string | null;
      type: string | null;
      country: string | null;
      validFrom: string | null;
      validUntil: string | null;
    };
    reason: string | null;
    reasonCode: number | null;
    status: string;
    additionalVerifiedData: Record<string, unknown>;
    vendorData: string;
    decisionTime: string;
    acceptanceTime: string;
    riskLabels: Array<{ label: string; category: string }>;
  };
  technicalData: {
    ip: string | null;
  };
}

export interface VeriffEventPayload {
  id: string;
  feature: string;
  code: number;
  action: string;
  vendorData: string;
}

export interface CreateSessionParams {
  /** Organization ID — stored as vendorData for webhook correlation */
  organizationId: string;
  /** Admin's full name */
  fullName: string;
  /** Admin's email */
  email: string;
  /** Optional: admin's document country (ISO 3166-1 alpha-2) */
  documentCountry?: string;
  /** Optional: language code (e.g. "en") */
  lang?: string;
}

// ─── Configuration ───────────────────────────────────────────────────────────

function getConfig() {
  const apiKey = process.env.VERIFF_API_KEY;
  const apiSecret = process.env.VERIFF_API_SECRET;
  const baseUrl = process.env.VERIFF_BASE_URL || "https://stationapi.veriff.com";

  if (!apiKey) throw new Error("[Veriff] VERIFF_API_KEY is not set");
  if (!apiSecret) throw new Error("[Veriff] VERIFF_API_SECRET is not set");

  return { apiKey, apiSecret, baseUrl };
}

// ─── HMAC Signature Verification ─────────────────────────────────────────────

/**
 * Verify Veriff webhook signature (HMAC SHA-256).
 * The signature is computed over the request body using the shared secret.
 */
export async function verifyWebhookSignature(
  body: string,
  signature: string,
): Promise<boolean> {
  const { apiSecret } = getConfig();

  // Use Node.js crypto for HMAC
  const { createHmac } = await import("node:crypto");
  const expectedSignature = createHmac("sha256", apiSecret)
    .update(body, "utf-8")
    .digest("hex");

  // Constant-time comparison
  const { timingSafeEqual } = await import("node:crypto");
  try {
    return timingSafeEqual(
      Buffer.from(signature.toLowerCase(), "hex"),
      Buffer.from(expectedSignature.toLowerCase(), "hex"),
    );
  } catch {
    return false;
  }
}

// ─── API Client ──────────────────────────────────────────────────────────────

/**
 * Create a new Veriff verification session.
 * Returns the session ID and verification URL to send to the user.
 */
export async function createVeriffSession(
  params: CreateSessionParams,
): Promise<VeriffSessionResponse> {
  const { apiKey, baseUrl } = getConfig();

  const payload = {
    verification: {
      callback: `${process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://hriq.remoteleverage.com"}/api/webhooks/veriff`,
      person: {
        firstName: params.fullName.split(" ")[0] || params.fullName,
        lastName: params.fullName.split(" ").slice(1).join(" ") || "",
        email: params.email,
      },
      vendorData: params.organizationId,
      // Only pass country if it's a valid 2-letter ISO 3166-1 alpha-2 code
      ...(params.documentCountry && /^[A-Z]{2}$/i.test(params.documentCountry.trim()) && {
        document: { country: params.documentCountry.trim().toUpperCase() },
      }),
      ...(params.lang && { lang: params.lang }),
      timestamp: new Date().toISOString(),
    },
  };

  const res = await fetch(`${baseUrl}/v1/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-AUTH-CLIENT": apiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`[Veriff] Failed to create session (${res.status}): ${errText}`);
  }

  return res.json() as Promise<VeriffSessionResponse>;
}

/**
 * Get the status/details of an existing Veriff session.
 */
export async function getVeriffSession(sessionId: string): Promise<{
  id: string;
  status: string;
  verification: Record<string, unknown>;
}> {
  const { apiKey, baseUrl } = getConfig();

  const res = await fetch(`${baseUrl}/v1/sessions/${sessionId}`, {
    method: "GET",
    headers: {
      "X-AUTH-CLIENT": apiKey,
    },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`[Veriff] Failed to get session (${res.status}): ${errText}`);
  }

  return res.json();
}

/**
 * Get the full decision for a completed session.
 * Only available after the session is in a terminal state.
 */
export async function getVeriffDecision(sessionId: string): Promise<VeriffDecisionPayload | null> {
  const { apiKey, apiSecret, baseUrl } = getConfig();
  const { createHmac } = await import("node:crypto");

  // Decision endpoint requires HMAC signature
  const signature = createHmac("sha256", apiSecret)
    .update(sessionId, "utf-8")
    .digest("hex")
    .toLowerCase();

  const res = await fetch(`${baseUrl}/v1/sessions/${sessionId}/decision`, {
    method: "GET",
    headers: {
      "X-AUTH-CLIENT": apiKey,
      "X-HMAC-SIGNATURE": signature,
    },
  });

  if (res.status === 404) return null;

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`[Veriff] Failed to get decision (${res.status}): ${errText}`);
  }

  return res.json() as Promise<VeriffDecisionPayload>;
}

/**
 * Generate the media (document images/selfie) download URL.
 * Useful for audit trail / compliance records.
 */
export async function getVeriffMedia(sessionId: string): Promise<{
  images: Array<{ id: string; name: string; url: string; context: string }>;
  videos: Array<{ id: string; name: string; url: string; context: string }>;
}> {
  const { apiKey, apiSecret, baseUrl } = getConfig();
  const { createHmac } = await import("node:crypto");

  const signature = createHmac("sha256", apiSecret)
    .update(sessionId, "utf-8")
    .digest("hex")
    .toLowerCase();

  const res = await fetch(`${baseUrl}/v1/sessions/${sessionId}/media`, {
    method: "GET",
    headers: {
      "X-AUTH-CLIENT": apiKey,
      "X-HMAC-SIGNATURE": signature,
    },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`[Veriff] Failed to get media (${res.status}): ${errText}`);
  }

  return res.json();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Map Veriff decision code to a human-readable status */
export function decisionCodeToStatus(code: number): VeriffSessionStatus {
  switch (code) {
    case 9001: return "approved";
    case 9102:
    case 9103:
    case 9104: return "declined";
    case 9121: return "resubmission_requested";
    default:   return "declined";
  }
}

/** Map Veriff decision code to a human-readable reason */
export function decisionCodeToReason(code: number): string {
  switch (code) {
    case 9001: return "Identity verified successfully";
    case 9102: return "Person could not be identified";
    case 9103: return "Document issue (unreadable, expired, or wrong type)";
    case 9104: return "Suspected fraud or manipulation detected";
    case 9121: return "Please resubmit — some information was unclear";
    default:   return `Unknown decision code: ${code}`;
  }
}

/** Map Veriff event code to a status */
export function eventCodeToStatus(code: number): VeriffSessionStatus | null {
  switch (code) {
    case 7001: return "started";
    case 7002: return "submitted";
    default:   return null;
  }
}
