import { database } from "@repo/database";
import { NextResponse } from "next/server";

export const maxDuration = 120;

/**
 * One-off admin endpoint:
 * 1. Backfill HRIQ employee timezones from Time Doctor user profiles
 * 2. Fix RecruitCRM candidate_stage for offboarded employees stuck at "Internal: Hired"
 *
 * Auth: CRON_SECRET bearer token
 * Usage: GET /api/admin/backfill-tz-and-rcrm
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: {
    tdTimezones: { updated: number; skipped: number; errors: string[] };
    rcrmFixes: { updated: number; skipped: number; failed: string[] };
  } = {
    tdTimezones: { updated: 0, skipped: 0, errors: [] },
    rcrmFixes: { updated: 0, skipped: 0, failed: [] },
  };

  // ─── 1. Backfill TD Timezones ─────────────────────────────────────────────

  try {
    const { getTDToken, getTDCompanyId, getTDUsers } = await import("@repo/integrations/timedoctor");
    const token = await getTDToken();
    const companyId = await getTDCompanyId(token);
    const tdUsers = await getTDUsers(token, companyId);

    // Build email → timezone map from TD profiles
    const tzByEmail = new Map<string, string>();
    for (const u of tdUsers) {
      if (u.email && u.timezone) {
        tzByEmail.set(u.email.toLowerCase(), u.timezone);
      }
    }

    console.log(`[Backfill] TD users: ${tdUsers.length}, with timezone: ${tzByEmail.size}`);

    // Get all employees missing timezone who have TD email
    const employees = await database.employee.findMany({
      where: {
        employmentStatus: { in: ["active", "onboarding_in_progress"] },
        timeDoctorEmail: { not: null },
        timezone: null,
      },
      select: { id: true, timeDoctorEmail: true, legalFirstName: true, legalLastName: true },
    });

    for (const emp of employees) {
      const tdEmail = emp.timeDoctorEmail?.toLowerCase();
      if (!tdEmail) continue;

      const tz = tzByEmail.get(tdEmail);
      if (!tz) {
        results.tdTimezones.skipped++;
        continue;
      }

      // Validate IANA timezone
      try {
        Intl.DateTimeFormat("en-US", { timeZone: tz });
      } catch {
        results.tdTimezones.errors.push(`${emp.legalFirstName} ${emp.legalLastName}: invalid tz "${tz}"`);
        continue;
      }

      try {
        await database.employee.update({
          where: { id: emp.id },
          data: { timezone: tz },
        });
        results.tdTimezones.updated++;
      } catch (err: any) {
        results.tdTimezones.errors.push(`${emp.legalFirstName}: ${err.message}`);
      }
    }
  } catch (err: any) {
    results.tdTimezones.errors.push(`TD API error: ${err.message}`);
  }

  // ─── 2. Fix RCRM Candidate Stage for Offboarded Employees ────────────────

  const RCRM_TOKEN = process.env.RECRUITCRM_API_TOKEN;
  if (RCRM_TOKEN) {
    const offboarded = await database.employee.findMany({
      where: {
        employmentStatus: "offboarded",
        recruitCrmSlug: { not: null },
      },
      select: {
        id: true,
        recruitCrmSlug: true,
        legalFirstName: true,
        legalLastName: true,
      },
    });

    for (const emp of offboarded) {
      if (!emp.recruitCrmSlug) continue;
      const name = `${emp.legalFirstName} ${emp.legalLastName}`;

      try {
        // POST to update both current_status and custom_field #2 (Candidate Stage dropdown)
        const res = await fetch(
          `https://api.recruitcrm.io/v1/candidates/${emp.recruitCrmSlug}`,
          {
            signal: AbortSignal.timeout(8000),
            method: "POST",
            headers: {
              Authorization: `Bearer ${RCRM_TOKEN}`,
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              current_status: "Disqualified: Check Notes",
              custom_fields: [{ field_id: 2, value: "Disqualified: Check Notes" }],
            }),
          }
        );

        if (res.ok) {
          results.rcrmFixes.updated++;
          console.log(`[Backfill] RCRM updated: ${name} (${emp.recruitCrmSlug})`);
        } else {
          const errText = await res.text().catch(() => "");
          results.rcrmFixes.failed.push(`${name}: ${res.status} ${errText.slice(0, 100)}`);
          console.error(`[Backfill] RCRM failed for ${name}: ${res.status} ${errText.slice(0, 200)}`);
        }

        // Small delay to avoid rate limiting
        await new Promise((r) => setTimeout(r, 300));
      } catch (err: any) {
        results.rcrmFixes.failed.push(`${name}: ${err.message}`);
      }
    }
  } else {
    results.rcrmFixes.failed.push("RECRUITCRM_API_TOKEN not configured");
  }

  return NextResponse.json({
    message: `Backfill complete: ${results.tdTimezones.updated} timezones updated, ${results.rcrmFixes.updated} RCRM records fixed`,
    ...results,
  });
}
