import { database } from "@repo/database";
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { headers } from "next/headers";

const limiter = rateLimit({ max: 5, windowMs: 60_000 }); // 5 codes per minute per IP

export async function POST(request: Request) {
  const ip = (await headers()).get("x-forwarded-for") ?? "unknown";
  const { limited } = limiter.check(ip);
  if (limited) {
    return NextResponse.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
  }

  const steps: string[] = [];
  try {
    const { email } = await request.json();
    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    steps.push("email_parsed");

    // Check if account is active
    const appUser = await database.appUser.findFirst({
      where: { email: normalizedEmail },
      select: { isActive: true },
    });
    if (appUser && !appUser.isActive) {
      return NextResponse.json(
        { error: "This account has been deactivated. Contact your administrator to reactivate it." },
        { status: 403 }
      );
    }
    steps.push("user_checked");

    // Rate limit: max 5 codes per email in 15 minutes
    const recentCount = await database.loginVerification.count({
      where: {
        email: normalizedEmail,
        createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) },
      },
    });
    if (recentCount >= 5) {
      return NextResponse.json({ error: "Too many attempts. Please wait 15 minutes." }, { status: 429 });
    }
    steps.push("rate_ok");

    // Debounce: if a valid unused code was sent in the last 60s, skip sending
    const recentValid = await database.loginVerification.findFirst({
      where: {
        email: normalizedEmail,
        usedAt: null,
        expiresAt: { gte: new Date() },
        createdAt: { gte: new Date(Date.now() - 60 * 1000) },
      },
      orderBy: { createdAt: "desc" },
    });
    if (recentValid) {
      return NextResponse.json({ sent: true });
    }
    steps.push("no_recent");

    // Clean up old codes
    await database.loginVerification.deleteMany({
      where: {
        email: normalizedEmail,
        OR: [
          { usedAt: { not: null } },
          { expiresAt: { lt: new Date() } },
        ],
      },
    });
    steps.push("cleanup");

    // Generate 6-digit code
    const { randomInt } = await import("node:crypto");
    const code = String(randomInt(100000, 1000000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    steps.push("code");

    // Build HTML inline — no external imports
    const html = [
      '<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:600px;margin:0 auto;padding:20px;">',
      '<div style="text-align:center;margin-bottom:24px;"><span style="font-size:20px;font-weight:700;color:#f97316;">Remote Leverage</span></div>',
      '<h2 style="text-align:center;color:#111827;">Login Verification Code</h2>',
      '<p style="color:#4b5563;text-align:center;">Your verification code is:</p>',
      '<div style="text-align:center;margin:24px 0;">',
      `<span style="display:inline-block;font-size:36px;font-weight:800;letter-spacing:10px;color:#f97316;background:#fff7ed;padding:16px 32px;border-radius:12px;border:2px solid #fed7aa;">${code}</span>`,
      '</div>',
      '<p style="color:#4b5563;text-align:center;font-size:14px;">This code expires in 10 minutes.</p>',
      '<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;"/>',
      '<p style="font-size:11px;color:#9ca3af;text-align:center;">Automated security verification from Remote Leverage.</p>',
      '</body></html>',
    ].join("");
    steps.push("html");

    // Gmail send — all inline, dynamic import
    const keyStr = (process.env.GOOGLE_SERVICE_ACCOUNT_KEY ?? "").trim();
    const senderEmail = (process.env.GOOGLE_SENDER_EMAIL ?? "").trim();
    if (!keyStr || !senderEmail) {
      steps.push("NO_ENV");
      return NextResponse.json({ error: "Email service not configured." }, { status: 500 });
    }
    steps.push("env");

    let keyJson: { client_email: string; private_key: string };
    try {
      const s = keyStr.indexOf("{");
      const e = keyStr.lastIndexOf("}");
      keyJson = JSON.parse((s >= 0 && e > s) ? keyStr.slice(s, e + 1) : keyStr);
    } catch {
      steps.push("BAD_JSON");
      return NextResponse.json({ error: "Email misconfigured." }, { status: 500 });
    }
    steps.push("json");

    const { GoogleAuth } = await import("google-auth-library");
    steps.push("gauth");

    const auth = new GoogleAuth({
      credentials: { client_email: keyJson.client_email, private_key: keyJson.private_key },
      scopes: ["https://www.googleapis.com/auth/gmail.send"],
      clientOptions: { subject: senderEmail },
    });
    const client = await auth.getClient();
    const token = await client.getAccessToken();
    steps.push(token.token ? "tok_ok" : "tok_null");

    const rawEmail = [
      "From: Remote Leverage <" + senderEmail + ">",
      "To: " + normalizedEmail,
      "Subject: Your Login Verification Code",
      "MIME-Version: 1.0",
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from(html, "utf-8").toString("base64"),
    ].join("\r\n");

    const encoded = Buffer.from(rawEmail).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    steps.push("enc");

    // Store code in DB BEFORE sending email — ensures the code is verifiable
    // even if the email send encounters a partial failure after delivery
    await database.loginVerification.create({
      data: { email: normalizedEmail, code, expiresAt },
    });
    steps.push("db");

    const gmailRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token.token },
      body: JSON.stringify({ raw: encoded }),
    });

    if (!gmailRes.ok) {
      const errText = await gmailRes.text();
      steps.push("gmail_err_" + gmailRes.status);
      console.error("[send-login-code] Gmail:", gmailRes.status, errText);
      // Clean up the code since email failed to send
      await database.loginVerification.deleteMany({
        where: { email: normalizedEmail, code, usedAt: null },
      });
      return NextResponse.json({ error: "Failed to send code." }, { status: 500 });
    }
    steps.push("sent");

    return NextResponse.json({ sent: true });
  } catch (error) {
    const msg = error instanceof Error ? error.name + ": " + error.message : String(error);
    steps.push("ERR:" + msg.slice(0, 80));
    console.error("[send-login-code]", msg, "|", steps.join("->"));
    return NextResponse.json({ error: "Failed to send verification code." }, { status: 500 });
  }
}
