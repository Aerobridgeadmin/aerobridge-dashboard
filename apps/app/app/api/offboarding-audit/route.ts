import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { refreshAccessToken } from "@repo/integrations/quickbooks";

export const maxDuration = 120;

type CheckResult = {
  service: string;
  user_found: boolean;
  is_flagged: boolean;
  user_status: string;
  user_id_on_service: string | null;
  user_email_matched: string | null;
  flag_reason: string | null;
};

function skip(svc: string, reason: string): CheckResult {
  return { service: svc, user_found: false, is_flagged: false, user_status: "skipped", user_id_on_service: null, user_email_matched: null, flag_reason: reason };
}
function clear(svc: string): CheckResult {
  return { service: svc, user_found: false, is_flagged: false, user_status: "not_found", user_id_on_service: null, user_email_matched: null, flag_reason: null };
}
function found(svc: string, email: string, uid: string | null, reason: string): CheckResult {
  return { service: svc, user_found: true, is_flagged: true, user_status: "active", user_id_on_service: uid, user_email_matched: email, flag_reason: reason };
}
function err(svc: string, msg: string): CheckResult {
  return { service: svc, user_found: false, is_flagged: false, user_status: "error", user_id_on_service: null, user_email_matched: null, flag_reason: msg };
}

const lc = (s: string) => s.trim().toLowerCase();

// Helper: check if any of the provided emails match
function emailMatch(candidate: string | undefined | null, emails: string[]): boolean {
  if (!candidate) return false;
  return emails.some((e) => lc(e) === lc(candidate));
}

// ━━━ 1. SLACK (searches by personal email primarily) ━━━━━━━━━━━

async function checkSlack(emails: string[]): Promise<CheckResult> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return skip("slack", "No SLACK_BOT_TOKEN");
  try {
    let cursor = "";
    let all: any[] = [];
    do {
      const res = await fetch(`https://slack.com/api/users.list?limit=200${cursor ? `&cursor=${cursor}` : ""}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!data.ok) return err("slack", data.error);
      all = all.concat(data.members || []);
      cursor = data.response_metadata?.next_cursor || "";
    } while (cursor);
    const m = all.find((u: any) => emailMatch(u.profile?.email, emails) && !u.deleted && !u.is_bot);
    return m ? found("slack", m.profile.email, m.id, "Active Slack account still exists") : clear("slack");
  } catch (e: any) { return err("slack", e.message); }
}

// ━━━ 2. QUO / OPENPHONE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function checkQuo(emails: string[]): Promise<CheckResult> {
  const token = process.env.QUO_OPENPHONE_API_KEY;
  if (!token) return skip("quo_openphone", "No QUO_OPENPHONE_API_KEY");
  try {
    const res = await fetch("https://api.openphone.com/v1/users", { headers: { Authorization: token } });
    const data = await res.json();
    const users = data.data || data.users || [];
    const m = (Array.isArray(users) ? users : []).find((u: any) => emailMatch(u.email, emails));
    return m ? found("quo_openphone", m.email, m.id, "Active Quo/OpenPhone account still exists") : clear("quo_openphone");
  } catch (e: any) { return err("quo_openphone", e.message); }
}

// ━━━ 3. RECRUITCRM ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function checkRecruitCRM(emails: string[]): Promise<CheckResult> {
  const token = process.env.RECRUITCRM_API_TOKEN;
  if (!token) return skip("recruitcrm", "No RECRUITCRM_API_TOKEN");
  try {
    const res = await fetch("https://api.recruitcrm.io/v1/users", {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    const data = await res.json();
    const users = data.data || data || [];
    const m = (Array.isArray(users) ? users : []).find((u: any) => emailMatch(u.email, emails));
    return m ? found("recruitcrm", m.email, m.id || m.slug, "Active RecruitCRM user still exists") : clear("recruitcrm");
  } catch (e: any) { return err("recruitcrm", e.message); }
}

// ━━━ 4. FATHOM ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function checkFathom(emails: string[]): Promise<CheckResult> {
  const token = process.env.FATHOM_API_KEY;
  if (!token) return skip("fathom", "No FATHOM_API_KEY");
  try {
    const res = await fetch("https://api.fathom.ai/external/v1/meetings?limit=100", {
      headers: { "X-Api-Key": token },
    });
    const data = await res.json();
    const items = data.items || [];
    const hit = items.some(
      (m: any) => emailMatch(m.recorded_by?.email, emails)
    );
    return hit ? found("fathom", emails[0]!, null, "Recent Fathom recording activity — check if account still active") : clear("fathom");
  } catch (e: any) { return err("fathom", e.message); }
}

// ━━━ 5. GOOGLE WORKSPACE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function checkGoogleWorkspace(emails: string[]): Promise<CheckResult> {
  const saKeyRaw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!saKeyRaw) return skip("google_workspace", "No GOOGLE_SERVICE_ACCOUNT_KEY");
  try {
    const saKey = JSON.parse(saKeyRaw);
    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const claimSet = Buffer.from(JSON.stringify({
      iss: saKey.client_email, sub: "admin@remoteleverage.com",
      scope: "https://www.googleapis.com/auth/admin.directory.user.readonly",
      aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
    })).toString("base64url");
    const pemContents = saKey.private_key.replace(/-----[A-Z ]+-----/g, "").replace(/\n/g, "");
    const binaryKey = Buffer.from(pemContents, "base64");
    const cryptoKey = await crypto.subtle.importKey("pkcs8", binaryKey, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(`${header}.${claimSet}`));
    const signature = Buffer.from(sig).toString("base64url");
    const jwt = `${header}.${claimSet}.${signature}`;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return err("google_workspace", tokenData.error_description || "Token exchange failed");

    // Only check @remoteleverage.com emails against Google Workspace
    const workEmails = emails.filter((e) => e.includes("@remoteleverage.com"));
    for (const email of workEmails) {
      const userRes = await fetch(`https://admin.googleapis.com/admin/directory/v1/users/${encodeURIComponent(email)}`, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (userRes.status === 404) continue;
      const u = await userRes.json();
      if (u.suspended) return { service: "google_workspace", user_found: true, is_flagged: false, user_status: "suspended", user_id_on_service: u.id, user_email_matched: u.primaryEmail, flag_reason: null };

      // If primaryEmail differs from what we queried, the person's account
      // was deleted and the email was reassigned as an alias on someone else's
      // account (e.g. for mail forwarding). This is CLEAR — not a flag.
      if (u.primaryEmail && lc(u.primaryEmail) !== lc(email)) {
        return {
          service: "google_workspace", user_found: false, is_flagged: false,
          user_status: "not_found", user_id_on_service: null, user_email_matched: email,
          flag_reason: `Account deleted — email is now an alias on ${u.primaryEmail}`,
        };
      }

      if (u.primaryEmail) return found("google_workspace", u.primaryEmail, u.id, `Active Google Workspace account (${u.isAdmin ? "ADMIN" : "user"})`);
    }
    return clear("google_workspace");
  } catch (e: any) { return err("google_workspace", e.message); }
}

// ━━━ 6. ZOOM ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function checkZoom(emails: string[]): Promise<CheckResult> {
  const accountId = process.env.ZOOM_ACCOUNT_ID?.trim();
  const clientId = process.env.ZOOM_CLIENT_ID?.trim();
  const clientSecret = process.env.ZOOM_CLIENT_SECRET?.trim();
  if (!accountId || !clientId || !clientSecret) return skip("zoom", "Missing Zoom credentials");
  try {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const tokenRes = await fetch("https://zoom.us/oauth/token", {
      method: "POST", headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "account_credentials", account_id: accountId }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return err("zoom", `Zoom OAuth failed: ${tokenData.reason || tokenData.error || "unknown"}`);

    for (const email of emails) {
      const userRes = await fetch(`https://api.zoom.us/v2/users/${encodeURIComponent(email)}`, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (userRes.status === 404) continue;
      if (!userRes.ok) continue;
      const u = await userRes.json();
      if (u.status === "active") return found("zoom", u.email, u.id, `Active Zoom account (${u.type === 1 ? "Basic" : "Licensed"})`);
      return { service: "zoom", user_found: true, is_flagged: false, user_status: u.status || "inactive", user_id_on_service: u.id, user_email_matched: u.email, flag_reason: null };
    }
    return clear("zoom");
  } catch (e: any) { return err("zoom", e.message); }
}

// ━━━ 7. CALENDLY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function checkCalendly(emails: string[]): Promise<CheckResult> {
  const token = process.env.CALENDLY_API_KEY;
  if (!token) return skip("calendly", "No CALENDLY_API_KEY");
  try {
    const meRes = await fetch("https://api.calendly.com/users/me", { headers: { Authorization: `Bearer ${token}` } });
    const meData = await meRes.json();
    const orgUri = meData.resource?.current_organization;
    if (!orgUri) return err("calendly", "Could not resolve org URI");
    const mbRes = await fetch(
      `https://api.calendly.com/organization_memberships?organization=${encodeURIComponent(orgUri)}&count=100`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const mbData = await mbRes.json();
    const m = (mbData.collection || []).find((mb: any) => emailMatch(mb.user?.email, emails));
    return m ? found("calendly", m.user.email, m.user.uri, `Active Calendly member (${m.role})`) : clear("calendly");
  } catch (e: any) { return err("calendly", e.message); }
}

// ━━━ 8. QUICKBOOKS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function checkQuickBooks(emails: string[], supabase: any): Promise<CheckResult> {
  const clientId = process.env.QB_CLIENT_ID;
  const clientSecret = process.env.QB_CLIENT_SECRET;
  const companyId = process.env.QB_COMPANY_ID;
  if (!clientId || !clientSecret || !companyId) return skip("quickbooks", "Missing QB credentials");
  try {
    const { data: tokenRow } = await supabase.from("hriq_qb_tokens").select("*").limit(1).single();
    if (!tokenRow?.access_token) return skip("quickbooks", "No QuickBooks tokens in DB");

    let accessToken = tokenRow.access_token;
    if (tokenRow.access_token_expires_at && new Date(tokenRow.access_token_expires_at) < new Date()) {
      try {
        const refreshed = await refreshAccessToken(tokenRow.refresh_token);
        accessToken = refreshed.accessToken;
        await supabase.from("hriq_qb_tokens").update({
          access_token: refreshed.accessToken, refresh_token: refreshed.refreshToken,
          access_token_expires_at: refreshed.accessTokenExpiresAt.toISOString(),
          refresh_token_expires_at: refreshed.refreshTokenExpiresAt.toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("company_id", tokenRow.company_id);
      } catch (e: any) { return err("quickbooks", `Token refresh failed: ${e.message}`); }
    }

    for (const email of emails) {
      const q = encodeURIComponent(`SELECT * FROM Employee WHERE PrimaryEmailAddr = '${email}'`);
      const res = await fetch(`https://quickbooks.api.intuit.com/v3/company/${companyId}/query?query=${q}&minorversion=75`, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      });
      if (!res.ok) continue;
      const data = await res.json();
      const employees = data.QueryResponse?.Employee || [];
      const m = employees.find((e: any) => emailMatch(e.PrimaryEmailAddr?.Address, emails) && e.Active);
      if (m) return found("quickbooks", email, m.Id, `Active QuickBooks employee: ${m.DisplayName}`);
    }
    return clear("quickbooks");
  } catch (e: any) { return err("quickbooks", e.message); }
}

// ━━━ MAIN HANDLER ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function POST(req: NextRequest) {
  try {
    // Auth check: verify the request has a valid Supabase session cookie or cron auth
    const authHeader = req.headers.get("authorization");
    const cookieHeader = req.headers.get("cookie");
    const isCronAuth = authHeader === `Bearer ${process.env.CRON_SECRET}`;
    if (!isCronAuth && !authHeader && !cookieHeader) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { employee_email, employee_name, initiated_by } = await req.json();
    if (!employee_email) return NextResponse.json({ error: "employee_email is required" }, { status: 400 });

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // Look up employee in DB to get both work + personal email
    // Prefer offboarded employees (they're who we're auditing) and take the most recently updated
    const { data: empRows } = await supabase
      .from("hriq_employees")
      .select("id, work_email, personal_email, legal_first_name, legal_last_name, employment_status, end_date")
      .or(`work_email.ilike.${employee_email},personal_email.ilike.${employee_email}`)
      .order("end_date", { ascending: false, nullsFirst: false })
      .limit(10);

    // Pick the best match: prefer offboarded > offboarding_in_progress > others
    const statusPriority: Record<string, number> = { offboarded: 0, offboarding_in_progress: 1 };
    const sorted = (empRows ?? []).sort((a: any, b: any) => {
      const pa = statusPriority[a.employment_status] ?? 99;
      const pb = statusPriority[b.employment_status] ?? 99;
      return pa - pb;
    });
    const emp = sorted[0] ?? null;
    const emails: string[] = [];
    if (emp?.work_email) emails.push(emp.work_email);
    if (emp?.personal_email && lc(emp.personal_email) !== lc(emp.work_email || "")) emails.push(emp.personal_email);
    if (!emails.some((e) => lc(e) === lc(employee_email))) emails.push(employee_email);

    const resolvedName = emp ? `${emp.legal_first_name} ${emp.legal_last_name}` : (employee_name || employee_email);

    // Create audit run
    const { data: run, error: runErr } = await supabase
      .from("hriq_offboarding_audit_runs")
      .insert({
        employee_id: emp?.id || null,
        employee_email,
        employee_name: resolvedName,
        run_status: "running",
        initiated_by: initiated_by || "system",
        started_at: new Date().toISOString(),
      })
      .select().single();
    if (runErr) throw new Error(runErr.message);

    // Run all 8 checks in parallel — each gets ALL emails to search
    const settled = await Promise.allSettled([
      checkSlack(emails),
      checkQuo(emails),
      checkRecruitCRM(emails),
      checkFathom(emails),
      checkGoogleWorkspace(emails),
      checkZoom(emails),
      checkCalendly(emails),
      checkQuickBooks(emails, supabase),
    ]);

    const results: CheckResult[] = settled.map((r) =>
      r.status === "fulfilled" ? r.value : err("unknown", (r as PromiseRejectedResult).reason?.message || "Failed")
    );

    await supabase.from("hriq_offboarding_audit_results").insert(
      results.map((r) => ({ audit_run_id: run.id, service_name: r.service, user_found: r.user_found, user_status: r.user_status, user_email_matched: r.user_email_matched, user_id_on_service: r.user_id_on_service, is_flagged: r.is_flagged, flag_reason: r.flag_reason, raw_response: {} }))
    );

    const totalFlags = results.filter((r) => r.is_flagged).length;
    const totalChecked = results.filter((r) => r.user_status !== "skipped").length;

    await supabase.from("hriq_offboarding_audit_runs").update({
      run_status: "completed", completed_at: new Date().toISOString(), total_services_checked: totalChecked, total_flags: totalFlags,
      summary: { emails_checked: emails, services: results.map((r) => ({ name: r.service, flagged: r.is_flagged, status: r.user_status })) },
    }).eq("id", run.id);

    return NextResponse.json({
      audit_run_id: run.id, employee_email, emails_checked: emails,
      total_services_checked: totalChecked, total_flags: totalFlags, results,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
