import { NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@repo/integrations/quickbooks";
import { database } from "@repo/database";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const realmId = url.searchParams.get("realmId");
  const error = url.searchParams.get("error");

  if (error) {
    console.error("[QB OAuth] Error:", error);
    return NextResponse.redirect(
      new URL(`/?qb_error=${encodeURIComponent(error)}`, url.origin),
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/?qb_error=no_code", url.origin),
    );
  }

  try {
    const baseUrl = `${url.protocol}//${url.host}`;
    const redirectUri = `${baseUrl}/api/quickbooks/callback`;

    const tokens = await exchangeCodeForTokens(code, redirectUri);

    // Store tokens in DB (upsert by company_id)
    const tokenId = `qb-${realmId ?? "default"}`;
    const companyId = realmId ?? process.env.QB_COMPANY_ID ?? "";
    await database.$executeRaw`
      INSERT INTO hriq_qb_tokens (id, company_id, access_token, refresh_token, access_token_expires_at, refresh_token_expires_at, connected_at, updated_at)
      VALUES (${tokenId}, ${companyId}, ${tokens.accessToken}, ${tokens.refreshToken}, ${tokens.accessTokenExpiresAt}, ${tokens.refreshTokenExpiresAt}, NOW(), NOW())
      ON CONFLICT (company_id) DO UPDATE SET
        access_token = ${tokens.accessToken},
        refresh_token = ${tokens.refreshToken},
        access_token_expires_at = ${tokens.accessTokenExpiresAt},
        refresh_token_expires_at = ${tokens.refreshTokenExpiresAt},
        updated_at = NOW()
    `;

    console.info(`[QB OAuth] Connected successfully! Company: ${realmId}`);

    return NextResponse.redirect(
      new URL("/?qb_connected=true", url.origin),
    );
  } catch (err: any) {
    console.error("[QB OAuth] Token exchange failed:", err);
    return NextResponse.redirect(
      new URL(`/?qb_error=${encodeURIComponent(err.message)}`, url.origin),
    );
  }
}
