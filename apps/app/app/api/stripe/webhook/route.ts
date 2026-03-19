import { NextRequest } from "next/server";

// Stripe is configured to hit /api/stripe/webhook but the canonical handler
// is at /api/webhooks/stripe. This standalone handler forwards the request.
export async function POST(request: NextRequest) {
  const { POST: handler } = await import("@/app/api/webhooks/stripe/route");
  return handler(request);
}
