import { database } from "@repo/database";
import { NextResponse } from "next/server";

export const maxDuration = 60;

/**
 * Every-8-hours cron: sync Google Workspace users → HRIQ contractor work emails.
 *
 * For each HRIQ contractor that has a personal_email but NO @remoteleverage.com
 * work_email, checks if their personal email appears in any Google Workspace
 * user's email list (aliases, recovery email). If found, sets work_email to
 * that GWS user's primaryEmail (@remoteleverage.com).
 *
 * Schedule: Every 8 hours → vercel.json: "0 0,8,16 * * *"
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const log: Array<{ contractor: string; personalEmail: string; action: string; gwsEmail?: string }> = [];

  try {
    // ── 1. Get GWS access token ─────────────────────────────────────────
    const gwsToken = await getGwsAccessToken();
    if (!gwsToken) {
      return NextResponse.json({ error: "Failed to get GWS access token — check GOOGLE_SERVICE_ACCOUNT_KEY" }, { status: 500 });
    }

    // ── 2. List ALL Google Workspace users ───────────────────────────────
    const gwsUsers = await listAllGwsUsers(gwsToken);
    console.log(`[GWS Sync] Fetched ${gwsUsers.length} Google Workspace users`);

    // ── 3. Build lookup: personal email → GWS primary email ─────────────
    // Maps ANY email associated with a GWS user (aliases, recovery) to their primary @rl email
    const personalToRLEmail = new Map<string, string>();

    for (const user of gwsUsers) {
      const primary = (user.primaryEmail ?? "").toLowerCase().trim();
      if (!primary.endsWith("@remoteleverage.com")) continue;

      // Index all emails/aliases
      if (Array.isArray(user.emails)) {
        for (const e of user.emails) {
          const addr = (e.address ?? "").toLowerCase().trim();
          if (addr && !addr.endsWith("@remoteleverage.com")) {
            personalToRLEmail.set(addr, primary);
          }
        }
      }

      // Index recovery email
      if (user.recoveryEmail) {
        const recovery = user.recoveryEmail.toLowerCase().trim();
        if (recovery && !recovery.endsWith("@remoteleverage.com")) {
          personalToRLEmail.set(recovery, primary);
        }
      }

      // Index non-organization emails from the emails array
      if (Array.isArray(user.nonEditableAliases)) {
        for (const alias of user.nonEditableAliases) {
          const a = (alias ?? "").toLowerCase().trim();
          if (a && !a.endsWith("@remoteleverage.com")) {
            personalToRLEmail.set(a, primary);
          }
        }
      }
    }

    console.log(`[GWS Sync] Built lookup: ${personalToRLEmail.size} personal emails → RL emails`);

    // ── 4. Also build a name-based lookup as fallback ────────────────────
    // GWS user full name → primary email (for contractors whose personal email
    // isn't in any GWS alias/recovery but whose name matches)
    const nameToRLEmail = new Map<string, string>();
    for (const user of gwsUsers) {
      const primary = (user.primaryEmail ?? "").toLowerCase().trim();
      if (!primary.endsWith("@remoteleverage.com")) continue;
      if (user.name?.fullName) {
        nameToRLEmail.set(user.name.fullName.toLowerCase().trim(), primary);
      }
      // Also index by "firstName lastName"
      if (user.name?.givenName && user.name?.familyName) {
        const key = `${user.name.givenName} ${user.name.familyName}`.toLowerCase().trim();
        nameToRLEmail.set(key, primary);
      }
    }

    // ── 5. Find HRIQ contractors missing RL work email ──────────────────
    const contractors: Array<{
      id: string;
      legal_first_name: string;
      legal_last_name: string;
      personal_email: string;
      work_email: string | null;
    }> = await database.$queryRaw`
      SELECT id, legal_first_name, legal_last_name, personal_email, work_email
      FROM hriq_employees
      WHERE employment_status = 'active'
        AND personal_email IS NOT NULL
        AND personal_email != ''
        AND (work_email IS NULL OR work_email = '' OR work_email NOT LIKE '%@remoteleverage.com')
    `;

    console.log(`[GWS Sync] Found ${contractors.length} active contractors without RL work email`);

    // ── 6. Match and update ─────────────────────────────────────────────
    let updated = 0;

    for (const c of contractors) {
      const personalLower = c.personal_email.toLowerCase().trim();
      const fullName = `${c.legal_first_name} ${c.legal_last_name}`.toLowerCase().trim();

      // Try email-based match first (most reliable)
      let matchedRLEmail = personalToRLEmail.get(personalLower);

      // Fallback: name-based match
      if (!matchedRLEmail) {
        matchedRLEmail = nameToRLEmail.get(fullName);
      }

      if (!matchedRLEmail) {
        log.push({
          contractor: `${c.legal_first_name} ${c.legal_last_name}`,
          personalEmail: c.personal_email,
          action: "no_match",
        });
        continue;
      }

      // Don't overwrite an existing RL work email with a different one
      if (c.work_email && c.work_email.toLowerCase().includes("@remoteleverage.com")) {
        log.push({
          contractor: `${c.legal_first_name} ${c.legal_last_name}`,
          personalEmail: c.personal_email,
          action: "already_has_rl_email",
          gwsEmail: matchedRLEmail,
        });
        continue;
      }

      // Update work_email
      try {
        await database.employee.update({
          where: { id: c.id },
          data: { workEmail: matchedRLEmail },
        });
        updated++;
        log.push({
          contractor: `${c.legal_first_name} ${c.legal_last_name}`,
          personalEmail: c.personal_email,
          action: "updated",
          gwsEmail: matchedRLEmail,
        });

        // Audit log
        try {
          await database.auditLog.create({
            data: {
              actorType: "system",
              action: "cron.gws_email_synced",
              objectType: "employee",
              objectId: c.id,
              newValue: { workEmail: matchedRLEmail, matchedVia: personalToRLEmail.has(personalLower) ? "email" : "name", personalEmail: c.personal_email },
            },
          }).catch(() => {});
        } catch {}
      } catch (err) {
        console.error(`[GWS Sync] Failed to update ${c.id}:`, err);
        log.push({
          contractor: `${c.legal_first_name} ${c.legal_last_name}`,
          personalEmail: c.personal_email,
          action: "error",
        });
      }
    }

    console.log(`[GWS Sync] Complete: ${updated} work emails updated out of ${contractors.length} checked`);

    return NextResponse.json({
      gwsUsersFound: gwsUsers.length,
      contractorsChecked: contractors.length,
      updated,
      noMatch: log.filter((l) => l.action === "no_match").length,
      results: log,
    });
  } catch (err: any) {
    console.error("[GWS Sync] Fatal error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ─── GWS Auth ──────────────────────────────────────────────────────────────

async function getGwsAccessToken(): Promise<string | null> {
  const saKeyRaw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!saKeyRaw) {
    console.error("[GWS Sync] No GOOGLE_SERVICE_ACCOUNT_KEY configured");
    return null;
  }

  try {
    const saKey = JSON.parse(saKeyRaw);
    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const claimSet = Buffer.from(JSON.stringify({
      iss: saKey.client_email,
      sub: "admin@remoteleverage.com",
      scope: "https://www.googleapis.com/auth/admin.directory.user.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })).toString("base64url");

    const pemContents = saKey.private_key.replace(/-----[A-Z ]+-----/g, "").replace(/\n/g, "");
    const binaryKey = Buffer.from(pemContents, "base64");
    const cryptoKey = await crypto.subtle.importKey(
      "pkcs8", binaryKey,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false, ["sign"]
    );
    const sig = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5", cryptoKey,
      new TextEncoder().encode(`${header}.${claimSet}`)
    );
    const signature = Buffer.from(sig).toString("base64url");
    const jwt = `${header}.${claimSet}.${signature}`;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });
    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      console.error("[GWS Sync] Token exchange failed:", tokenData.error_description);
      return null;
    }
    return tokenData.access_token;
  } catch (err) {
    console.error("[GWS Sync] Auth error:", err);
    return null;
  }
}

// ─── GWS User List ─────────────────────────────────────────────────────────

interface GwsUser {
  primaryEmail?: string;
  name?: { givenName?: string; familyName?: string; fullName?: string };
  emails?: Array<{ address?: string; type?: string; primary?: boolean }>;
  recoveryEmail?: string;
  nonEditableAliases?: string[];
  suspended?: boolean;
}

async function listAllGwsUsers(accessToken: string): Promise<GwsUser[]> {
  const allUsers: GwsUser[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL("https://admin.googleapis.com/admin/directory/v1/users");
    url.searchParams.set("domain", "remoteleverage.com");
    url.searchParams.set("maxResults", "500");
    url.searchParams.set("projection", "full");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[GWS Sync] Directory API error ${res.status}:`, body);
      break;
    }

    const data = await res.json();
    const users: GwsUser[] = data.users ?? [];

    // Only include non-suspended users
    for (const u of users) {
      if (!u.suspended) {
        allUsers.push(u);
      }
    }

    pageToken = data.nextPageToken;
  } while (pageToken);

  return allUsers;
}
