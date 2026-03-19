import { NextResponse } from "next/server";
import { getAuthorizationUrl } from "@repo/integrations/quickbooks";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const baseUrl = `${url.protocol}//${url.host}`;
    const redirectUri = `${baseUrl}/api/quickbooks/callback`;
    const authUrl = getAuthorizationUrl(redirectUri, "hriq-qb-connect");
    return NextResponse.redirect(authUrl);
  } catch (err) {
    console.error("[QB Connect] Failed to build authorization URL:", err);
    return NextResponse.json({ error: "Failed to initiate QuickBooks connection" }, { status: 500 });
  }
}
