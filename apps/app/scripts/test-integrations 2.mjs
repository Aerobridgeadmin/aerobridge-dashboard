import { GoogleAuth } from "google-auth-library";
import fs from "node:fs";
import path from "node:path";

const appDir = process.cwd();
const envFile = path.join(appDir, ".env.local");

function parseEnvFile(filePath) {
  const output = {};
  if (!fs.existsSync(filePath)) return output;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) continue;
    const eqIndex = trimmedLine.indexOf("=");
    if (eqIndex <= 0) continue;
    const key = trimmedLine.slice(0, eqIndex).trim();
    let value = trimmedLine.slice(eqIndex + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    output[key] = value;
  }
  return output;
}

const parsedEnv = parseEnvFile(envFile);

const trim = (value) => (typeof value === "string" ? value.trim() : value);

const env = {
  JOTFORM_API_KEY: trim(parsedEnv.JOTFORM_API_KEY ?? process.env.JOTFORM_API_KEY),
  ZOOM_ACCOUNT_ID: trim(parsedEnv.ZOOM_ACCOUNT_ID ?? process.env.ZOOM_ACCOUNT_ID),
  ZOOM_CLIENT_ID: trim(parsedEnv.ZOOM_CLIENT_ID ?? process.env.ZOOM_CLIENT_ID),
  ZOOM_CLIENT_SECRET: trim(parsedEnv.ZOOM_CLIENT_SECRET ?? process.env.ZOOM_CLIENT_SECRET),
  GOOGLE_SERVICE_ACCOUNT_KEY: trim(
    parsedEnv.GOOGLE_SERVICE_ACCOUNT_KEY ?? process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  ),
  GOOGLE_SENDER_EMAIL: trim(parsedEnv.GOOGLE_SENDER_EMAIL ?? process.env.GOOGLE_SENDER_EMAIL),
  ZOOM_HOST_USERS: trim(parsedEnv.ZOOM_HOST_USERS ?? process.env.ZOOM_HOST_USERS),
};

const shouldSendEmail = process.argv.includes("--send-email");
const results = [];

function normalizeJsonObjectString(raw) {
  const trimmed = String(raw ?? "").trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return trimmed;
  return trimmed.slice(start, end + 1);
}

async function testJotform() {
  if (!env.JOTFORM_API_KEY) {
    return { name: "Jotform", ok: false, message: "Missing JOTFORM_API_KEY" };
  }
  const response = await fetch(
    `https://api.jotform.com/user?apiKey=${encodeURIComponent(env.JOTFORM_API_KEY)}`
  );
  if (!response.ok) {
    const text = await response.text();
    return { name: "Jotform", ok: false, message: `HTTP ${response.status}: ${text.slice(0, 300)}` };
  }
  const data = await response.json();
  return {
    name: "Jotform",
    ok: true,
    message: `Connected as ${data?.content?.username ?? "unknown user"}`,
  };
}

async function getZoomToken() {
  const creds = Buffer.from(
    `${env.ZOOM_CLIENT_ID}:${env.ZOOM_CLIENT_SECRET}`
  ).toString("base64");
  const response = await fetch("https://zoom.us/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${creds}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "account_credentials",
      account_id: env.ZOOM_ACCOUNT_ID,
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Zoom OAuth failed (${response.status}): ${text.slice(0, 300)}`);
  }
  const data = await response.json();
  if (!data?.access_token) throw new Error("Zoom OAuth succeeded but no access_token returned");
  return data.access_token;
}

async function testZoom() {
  if (!env.ZOOM_ACCOUNT_ID || !env.ZOOM_CLIENT_ID || !env.ZOOM_CLIENT_SECRET) {
    return {
      name: "Zoom",
      ok: false,
      message: "Missing one of ZOOM_ACCOUNT_ID/ZOOM_CLIENT_ID/ZOOM_CLIENT_SECRET",
    };
  }
  const token = await getZoomToken();
  const configuredHosts = (env.ZOOM_HOST_USERS ?? "")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);
  const zoomHost = configuredHosts[0] ?? "me";
  const createResponse = await fetch(`https://api.zoom.us/v2/users/${encodeURIComponent(zoomHost)}/meetings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      topic: `Integration Smoke Test ${new Date().toISOString()}`,
      type: 2,
      start_time: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      duration: 30,
      timezone: "America/Los_Angeles",
      agenda: "Automated integration test meeting",
      settings: {
        join_before_host: true,
        waiting_room: false,
      },
    }),
  });
  if (!createResponse.ok) {
    const text = await createResponse.text();
    return { name: "Zoom", ok: false, message: `Create meeting failed (${createResponse.status}): ${text.slice(0, 300)}` };
  }
  const meeting = await createResponse.json();
  const meetingId = String(meeting?.id ?? "");
  if (!meetingId) {
    return { name: "Zoom", ok: false, message: "Meeting created but no id returned" };
  }
  const deleteResponse = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!deleteResponse.ok && deleteResponse.status !== 204) {
    const text = await deleteResponse.text();
    return { name: "Zoom", ok: false, message: `Delete test meeting failed (${deleteResponse.status}): ${text.slice(0, 300)}` };
  }
  return {
    name: "Zoom",
    ok: true,
    message: `Created and deleted test meeting ${meetingId} (host: ${zoomHost})`,
  };
}

async function testGmail() {
  if (!env.GOOGLE_SERVICE_ACCOUNT_KEY || !env.GOOGLE_SENDER_EMAIL) {
    return {
      name: "Gmail",
      ok: false,
      message: "Missing GOOGLE_SERVICE_ACCOUNT_KEY or GOOGLE_SENDER_EMAIL",
    };
  }

  let keyJson;
  try {
    keyJson = JSON.parse(normalizeJsonObjectString(env.GOOGLE_SERVICE_ACCOUNT_KEY));
  } catch (error) {
    return {
      name: "Gmail",
      ok: false,
      message: `Invalid GOOGLE_SERVICE_ACCOUNT_KEY JSON: ${error instanceof Error ? error.message : "Unknown parse error"}`,
    };
  }

  const auth = new GoogleAuth({
    credentials: {
      client_email: keyJson.client_email,
      private_key: keyJson.private_key,
    },
    scopes: ["https://www.googleapis.com/auth/gmail.send"],
    clientOptions: { subject: env.GOOGLE_SENDER_EMAIL },
  });

  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token?.token) {
    return { name: "Gmail", ok: false, message: "Could not obtain OAuth access token" };
  }

  if (!shouldSendEmail) {
    return {
      name: "Gmail",
      ok: true,
      message: "OAuth token acquired (use --send-email to send a live test email)",
    };
  }

  const subject = `Integration Test ${new Date().toISOString()}`;
  const htmlBody = `<p>This is an automated test email from hriq-platform integration check.</p>`;
  const rawEmail = [
    `From: Remote Leverage <${env.GOOGLE_SENDER_EMAIL}>`,
    `To: ${env.GOOGLE_SENDER_EMAIL}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "",
    htmlBody,
  ].join("\r\n");
  const encoded = Buffer.from(rawEmail)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const response = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token.token}`,
      },
      body: JSON.stringify({ raw: encoded }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    return { name: "Gmail", ok: false, message: `HTTP ${response.status}: ${text.slice(0, 300)}` };
  }

  const data = await response.json();
  return {
    name: "Gmail",
    ok: true,
    message: `Email sent to ${env.GOOGLE_SENDER_EMAIL} (message id: ${data?.id ?? "unknown"})`,
  };
}

const tests = [testJotform, testZoom, testGmail];
for (const test of tests) {
  try {
    results.push(await test());
  } catch (error) {
    results.push({
      name: test.name.replace(/^test/, ""),
      ok: false,
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

for (const result of results) {
  const prefix = result.ok ? "PASS" : "FAIL";
  console.log(`${prefix} ${result.name}: ${result.message}`);
}

if (results.some((r) => !r.ok)) {
  process.exit(1);
}
