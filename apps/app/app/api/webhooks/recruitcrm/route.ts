import { database } from "@repo/database";
import { NextResponse } from "next/server";

// Match various "hired" status patterns from RecruitCRM
// Note: "hired" alone is too broad (matches "Hired Date:" field name in every payload)
const HIRED_PATTERNS = [
  "internal: hired",
  "internal:hired",
  "internal hired",
  "internally hired",
  "status_changed_to_hired",
];

function isHiredPayload(body: unknown): boolean {
  const obj = body as Record<string, unknown>;

  // For candidate.hiringstage.updated events, check the stage name directly
  if (obj.event === "candidate.hiringstage.updated") {
    const data = (obj.data ?? obj) as Record<string, unknown>;
    const stageName = String(
      data.hiring_stage_name ?? data.stage_name ?? data.hiring_stage
        ?? (data as any).candidate_stage ?? ""
    ).toLowerCase();
    // Accept any stage with "hired" in its name (e.g. "Internal: Hired", "Hired")
    if (stageName.includes("hired")) return true;

    // Also check custom_fields for "Internal Candidate Stage" or "Candidate Stage"
    const candidate = (data.candidate ?? data) as Record<string, unknown>;
    const customFields = (candidate.custom_fields ?? []) as Array<{ field_id?: number; field_name?: string; value?: string | null }>;
    for (const field of customFields) {
      if ((field.field_id === 2 || field.field_id === 31 || /candidate.stage/i.test(field.field_name ?? ""))
        && field.value && field.value.toLowerCase().includes("hired")) {
        return true;
      }
    }
  }

  // For general payloads, search the full JSON for specific patterns
  const fullPayload = JSON.stringify(body).toLowerCase();
  return HIRED_PATTERNS.some((kw) => fullPayload.includes(kw));
}

function extractField(obj: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const val = obj[key];
    if (val !== undefined && val !== null && String(val).trim() !== "") {
      return String(val).trim();
    }
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const webhookSecret = process.env.RECRUITCRM_WEBHOOK_SECRET;
    if (!webhookSecret && process.env.NODE_ENV === "production") {
      console.error("[RecruitCRM Webhook] RECRUITCRM_WEBHOOK_SECRET not set in production");
      return NextResponse.json({ ok: false, error: "Not configured" }, { status: 500 });
    }
    if (webhookSecret) {
      // RecruitCRM subscriptions API doesn't support custom headers,
      // so we accept the secret via query param, header, or Authorization bearer
      const { searchParams } = new URL(request.url);
      const signature = searchParams.get("secret")
        ?? request.headers.get("x-webhook-secret")
        ?? request.headers.get("x-recruitcrm-secret")
        ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
        ?? "";
      // Use timing-safe comparison to prevent timing attacks
      const { timingSafeEqual } = await import("node:crypto");
      const a = Buffer.from(signature);
      const b = Buffer.from(webhookSecret);
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        console.error("[RecruitCRM Webhook] Invalid signature. Received:", signature.slice(0, 10) + "...");
        return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 });
      }
    }

    const body = await request.json();
    const isHired = isHiredPayload(body);

    if (!isHired) {
      return NextResponse.json({ ok: true, message: "Not a hired candidate, ignored" });
    }

    // It's a hired candidate — extract info from nested structures
    const data = (body as any).data ?? body;
    const candidate = data.candidate ?? data.contact ?? data;

    const firstName = extractField(candidate, "first_name", "firstName", "name")?.replace(/^(hired|internal):\s*/i, "") ?? "Unknown";
    const lastName = extractField(candidate, "last_name", "lastName") ?? "Unknown";
    const email = extractField(candidate, "email", "email1", "candidate_email", "contact_email");
    const phone = extractField(candidate, "contact_number", "phone", "mobile", "phone_number");
    const position = extractField(candidate, "position", "current_position", "job_title", "designation");
    const city = extractField(candidate, "city", "location_city");
    const country = extractField(candidate, "country", "location_country");
    const currentSalary = extractField(candidate, "current_salary", "salary");
    const salaryExpectation = extractField(candidate, "salary_expectation", "expected_salary");
    const linkedin = extractField(candidate, "linkedin", "linkedin_url", "social_linkedin");
    const skills = extractField(candidate, "skill", "skills", "key_skills");
    const slug = String(candidate.slug ?? candidate.candidate_slug ?? candidate.id ?? data.slug ?? data.id ?? Date.now());

    const id = `ph_${Date.now().toString(36)}_${slug.slice(0, 20)}`;
    const bodyJson = JSON.stringify(body);

    await database.$executeRaw`
      INSERT INTO pending_hires (id, recruit_crm_slug, first_name, last_name, email, phone, position, city, country, current_salary, salary_expectation, linkedin, skills, recruit_crm_data, status, created_at, updated_at)
      VALUES (${id}, ${slug}, ${firstName}, ${lastName}, ${email}, ${phone}, ${position}, ${city}, ${country}, ${currentSalary}, ${salaryExpectation}, ${linkedin}, ${skills}, ${bodyJson}::jsonb, 'pending', NOW(), NOW())
      ON CONFLICT (recruit_crm_slug) DO UPDATE SET
        first_name = ${firstName}, last_name = ${lastName}, email = ${email}, phone = ${phone}, position = ${position},
        recruit_crm_data = ${bodyJson}::jsonb, status = 'pending', updated_at = NOW()
    `;
    return NextResponse.json({ ok: true, message: `Hired candidate added: ${firstName} ${lastName}` });
  } catch (error) {
    console.error("[RecruitCRM Webhook] Error:", error);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: "RecruitCRM webhook active",
    filter: "Candidates with hired status anywhere in payload",
    patterns: HIRED_PATTERNS,
    url: "POST /api/webhooks/recruitcrm",
    headers: "x-webhook-secret OR x-recruitcrm-secret OR Authorization: Bearer <secret>",
  });
}
