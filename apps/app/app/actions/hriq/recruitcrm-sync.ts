"use server";

import { requireRole } from "@repo/auth/session";
import { database } from "@repo/database";

const RECRUITCRM_TOKEN = process.env.RECRUITCRM_API_TOKEN;

// Only sync candidates with this exact hiring stage
const HIRED_STAGE = "internal:hired";

export async function syncFromRecruitCRM(): Promise<{ synced: number; total: number; skipped: number; error?: string }> {
  try {
    await requireRole("super_admin");
  } catch {
    return { synced: 0, total: 0, skipped: 0, error: "Unauthorized: super_admin role required" };
  }

  if (!RECRUITCRM_TOKEN) {
    return { synced: 0, total: 0, skipped: 0, error: "RECRUITCRM_API_TOKEN is not configured" };
  }

  // Get existing slugs to skip duplicates early
  const existingSlugs = new Set<string>();
  try {
    const existing: Array<{ recruit_crm_slug: string }> = await database.$queryRaw`
      SELECT recruit_crm_slug FROM pending_hires WHERE recruit_crm_slug IS NOT NULL
    `;
    for (const row of existing) {
      existingSlugs.add(row.recruit_crm_slug);
    }
  } catch {
    // Table might not have data yet, continue
  }

  let page = 1;
  let synced = 0;
  let total = 0;
  let skipped = 0;
  const errors: string[] = [];

  try {
    while (page <= 10) {
      // No sort params — they cause 422 errors with the RecruitCRM API
      const res = await fetch(`https://api.recruitcrm.io/v1/candidates?page=${page}`, {
        signal: AbortSignal.timeout(10000),
        headers: {
          Authorization: `Bearer ${RECRUITCRM_TOKEN}`,
          Accept: "application/json",
        },
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        return { synced, total, skipped, error: `RecruitCRM API error (${res.status}): ${errBody.slice(0, 200)}` };
      }

      const data = await res.json();
      const candidates = data.data ?? [];
      if (candidates.length === 0) break;

      for (const c of candidates) {
        total++;

        // Only sync candidates with "internal:Hired" status (case-insensitive, handle spacing variants)
        const statusLabel = String(c.current_status ?? c.status ?? "").toLowerCase().trim();
        if (statusLabel !== HIRED_STAGE && statusLabel !== "internal: hired") {
          continue;
        }

        const slug = String(c.slug ?? c.id);

        // Skip if already in pending_hires
        if (existingSlugs.has(slug)) {
          skipped++;
          continue;
        }

        const firstName = (c.first_name ?? "Unknown").replace(/^hired:\s*/i, "");
        const lastName = c.last_name ?? "Unknown";

        const id = `ph_sync_${slug.slice(0, 20)}`;
        const cEmail = c.email ?? null;
        const cPhone = c.contact_number ?? null;
        const cPosition = c.position ?? null;
        const cCity = c.city ?? null;
        const cCountry = c.country ?? null;
        const cSalary = c.current_salary != null ? String(c.current_salary) : null;
        const cSalaryExp = c.salary_expectation != null ? String(c.salary_expectation) : null;
        const cLinkedin = c.linkedin ?? null;
        const cSkills = c.skill ?? null;
        const cData = JSON.stringify(c);

        try {
          await database.$executeRaw`
            INSERT INTO pending_hires (id, recruit_crm_slug, first_name, last_name, email, phone, position, city, country, current_salary, salary_expectation, linkedin, skills, recruit_crm_data, status, created_at, updated_at)
            VALUES (${id}, ${slug}, ${firstName}, ${lastName}, ${cEmail}, ${cPhone}, ${cPosition}, ${cCity}, ${cCountry}, ${cSalary}, ${cSalaryExp}, ${cLinkedin}, ${cSkills}, ${cData}::jsonb, 'pending', NOW(), NOW())
            ON CONFLICT (recruit_crm_slug) DO NOTHING
          `;
          synced++;
          existingSlugs.add(slug);
        } catch (err) {
          errors.push(`Failed ${firstName} ${lastName}: ${err instanceof Error ? err.message : "unknown"}`);
        }
      }

      if (!data.next_page_url) break;
      page++;
    }
  } catch (err) {
    return { synced, total, skipped, error: `Sync error: ${err instanceof Error ? err.message : "Unknown error"}` };
  }

  if (errors.length > 0) {
    return { synced, total, skipped, error: `Synced ${synced} but ${errors.length} failed: ${errors[0]}` };
  }

  return { synced, total, skipped };
}
