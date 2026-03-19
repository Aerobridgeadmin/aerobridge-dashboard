import { NextResponse } from "next/server";
import { verifyAdminAuth } from "@/lib/admin-auth";

const BASE = "https://api.recruitcrm.io/v1";

function getHeaders() {
  const token = process.env.RECRUITCRM_API_TOKEN;
  if (!token) throw new Error("RECRUITCRM_API_TOKEN not set");
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

// GET = list all webhooks/subscriptions
export async function GET(request: Request) {
  const authError = verifyAdminAuth(request);
  if (authError) return authError;

  try {
    const headers = getHeaders();

    // List subscriptions (the correct endpoint)
    const subsRes = await fetch(`${BASE}/subscriptions`, { headers, method: "GET" });
    let subscriptions: unknown = null;
    if (subsRes.ok) {
      subscriptions = await subsRes.json();
    } else {
      subscriptions = { status: subsRes.status, error: await subsRes.text() };
    }

    return NextResponse.json({ subscriptions });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// POST = create a webhook
export async function POST(request: Request) {
  const authError = verifyAdminAuth(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const headers = getHeaders();

    // Try creating webhook with various payload shapes
    const webhookPayload = body.payload || {
      event: "candidate.updated",
      target_url: "https://hriq.remoteleverage.com/api/webhooks/recruitcrm",
    };

    const endpoint = body.endpoint || `${BASE}/subscriptions`;

    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(webhookPayload),
    });

    const text = await res.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = text; }

    return NextResponse.json({ status: res.status, endpoint, body: parsed });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// DELETE = delete a subscription by id
export async function DELETE(request: Request) {
  const authError = verifyAdminAuth(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const webhookId = searchParams.get("id");
  if (!webhookId) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  try {
    const headers = getHeaders();
    const res = await fetch(`${BASE}/subscriptions/${webhookId}`, { method: "DELETE", headers });
    const text = await res.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    return NextResponse.json({ status: res.status, body: parsed });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
