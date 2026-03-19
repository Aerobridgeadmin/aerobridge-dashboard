import { database } from "@repo/database";
import { NextResponse } from "next/server";

export const maxDuration = 30;

const RL_ORG_ID = process.env.RL_ORGANIZATION_ID ?? "org_rl_001";

/**
 * Twice-daily cron: sync @remoteleverage.com auth accounts with employee profiles.
 *
 * Handles the gap where an RL email is created (via Google Workspace) after
 * the contractor is already onboarded and logged in with their personal email.
 *
 * What it does:
 * 1. Finds all @remoteleverage.com auth accounts not linked to any employee
 * 2. Matches them to employees by exact work_email or personal_email
 * 3. If no exact match, tries fuzzy match (email prefix → first name)
 * 4. Links the employee to the RL auth account (re-links if needed)
 * 5. Syncs org memberships and approved_emails
 *
 * Schedule: Twice daily at 7am and 7pm UTC → vercel.json: "0 7,19 * * *"
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: { email: string; action: string; employee?: string }[] = [];

  try {
    // ── 1. Find all @remoteleverage.com auth accounts not linked to any employee ──
    const orphanRLUsers: { email: string; supabase_user_id: string }[] =
      await database.$queryRaw`
        SELECT au.email, au.supabase_user_id
        FROM public.app_users au
        LEFT JOIN public.hriq_employees e ON e.linked_user_id = au.supabase_user_id
        WHERE au.email LIKE '%@remoteleverage.com'
          AND e.id IS NULL
      `;

    for (const rlUser of orphanRLUsers) {
      const email = rlUser.email.toLowerCase().trim();
      const prefix = email.split("@")[0]; // e.g. "john" from "john@remoteleverage.com"

      // ── 2. Exact match by work_email or personal_email ──
      let employee = await database.employee.findFirst({
        where: {
          organizationId: RL_ORG_ID,
          employmentStatus: { in: ["active", "onboarding_in_progress", "onboarding_scheduled", "pre_hire"] },
          OR: [
            { workEmail: { equals: email, mode: "insensitive" } },
            { personalEmail: { equals: email, mode: "insensitive" } },
          ],
        },
        select: { id: true, legalFirstName: true, legalLastName: true, linkedUserId: true, workEmail: true },
      });

      // ── 3. Fuzzy match: email prefix matches work_email prefix (handles typos like oliveria vs oliveira) ──
      if (!employee && prefix.length >= 3) {
        // Try: work_email starts with same prefix (within 2 chars difference)
        const candidates = await database.employee.findMany({
          where: {
            organizationId: RL_ORG_ID,
            employmentStatus: { in: ["active", "onboarding_in_progress", "onboarding_scheduled", "pre_hire"] },
            workEmail: { contains: "@remoteleverage.com", mode: "insensitive" },
          },
          select: { id: true, legalFirstName: true, legalLastName: true, linkedUserId: true, workEmail: true },
        });

        // Match by work_email prefix similarity
        for (const cand of candidates) {
          if (!cand.workEmail) continue;
          const candPrefix = cand.workEmail.toLowerCase().split("@")[0];
          // Levenshtein distance ≤ 2 for short prefixes, ≤ 3 for longer ones
          const maxDist = candPrefix.length <= 6 ? 2 : 3;
          if (levenshtein(prefix, candPrefix) <= maxDist) {
            // Check this candidate isn't already linked to someone who actively uses it
            if (!cand.linkedUserId || cand.linkedUserId === rlUser.supabase_user_id) {
              employee = cand;
              break;
            }
            // If linked to a different user, check if that user has logged in
            const linkedUser = await database.appUser.findFirst({
              where: { supabaseUserId: cand.linkedUserId },
              select: { loginCount: true },
            });
            // Only steal the link if the current linked user never logged in (orphan provisioned account)
            if (linkedUser && linkedUser.loginCount === 0) {
              employee = cand;
              break;
            }
          }
        }

        // Also try first name match as fallback
        if (!employee) {
          employee = await database.employee.findFirst({
            where: {
              organizationId: RL_ORG_ID,
              employmentStatus: { in: ["active", "onboarding_in_progress"] },
              linkedUserId: null,
              legalFirstName: { equals: prefix, mode: "insensitive" },
            },
            select: { id: true, legalFirstName: true, legalLastName: true, linkedUserId: true, workEmail: true },
          });
        }
      }

      if (!employee) {
        results.push({ email, action: "no_match" });
        continue;
      }

      // ── 4. Link the employee to the RL auth account ──
      const oldLinkedUserId = employee.linkedUserId;
      await database.employee.update({
        where: { id: employee.id },
        data: {
          linkedUserId: rlUser.supabase_user_id,
          // Set work email if not already set or if it was a typo
          ...(!employee.workEmail || !employee.workEmail.includes("@remoteleverage.com")
            ? { workEmail: email }
            : {}),
        },
      });

      // ── 5. Sync org membership: ensure RL user has membership ──
      try {
        // Copy role from old linked user if exists, default to "member"
        let role = "member";
        if (oldLinkedUserId) {
          const oldMembership = await database.organizationMember.findFirst({
            where: { userId: oldLinkedUserId, organizationId: RL_ORG_ID },
            select: { role: true },
          });
          if (oldMembership) role = oldMembership.role;
        }

        await database.organizationMember.upsert({
          where: { userId_organizationId: { userId: rlUser.supabase_user_id, organizationId: RL_ORG_ID } },
          create: { userId: rlUser.supabase_user_id, organizationId: RL_ORG_ID, role },
          update: {},
        });
      } catch (e) {
        console.error(`[SyncRL] Membership sync failed for ${email}:`, e);
      }

      // ── 6. Ensure approved_emails entry exists ──
      try {
        await database.approvedEmail.upsert({
          where: { email_organizationId: { email: email, organizationId: RL_ORG_ID } },
          create: { email, organizationId: RL_ORG_ID, role: "member" },
          update: {},
        });
      } catch (err) { console.warn("[sync-rl-accounts/route:GET] Suppressed error:", err); }

      const empName = `${employee.legalFirstName} ${employee.legalLastName}`;
      results.push({ email, action: oldLinkedUserId ? "re-linked" : "linked", employee: empName });

      // ── 7. Audit log ──
      try {
        await database.auditLog.create({
          data: {
            organizationId: RL_ORG_ID,
            actorType: "system",
            action: "cron.rl_account_linked",
            objectType: "employee",
            objectId: employee.id,
            newValue: {
              rlEmail: email,
              previousLinkedUserId: oldLinkedUserId,
              newLinkedUserId: rlUser.supabase_user_id,
            },
          },
        }).catch(() => {});
      } catch (err) { console.warn("[sync-rl-accounts/route:GET] Suppressed error:", err); }
    }

    // ── 8. Sync approved_emails for active employees with RL work emails ──
    // Ensures every active contractor's RL email is in the approved list
    let approvedSynced = 0;
    try {
      const activeWithRL = await database.employee.findMany({
        where: {
          organizationId: RL_ORG_ID,
          employmentStatus: { in: ["active", "onboarding_in_progress"] },
          workEmail: { contains: "@remoteleverage.com", mode: "insensitive" },
        },
        select: { workEmail: true },
      });

      for (const emp of activeWithRL) {
        if (!emp.workEmail) continue;
        try {
          await database.approvedEmail.upsert({
            where: { email_organizationId: { email: emp.workEmail.toLowerCase(), organizationId: RL_ORG_ID } },
            create: { email: emp.workEmail.toLowerCase(), organizationId: RL_ORG_ID, role: "member" },
            update: {},
          });
          approvedSynced++;
        } catch (err) { console.warn("[sync-rl-accounts/route:GET] Suppressed error:", err); }
      }
    } catch (e) {
      console.error("[SyncRL] Approved email sync failed:", e);
    }

    return NextResponse.json({
      message: `Processed ${orphanRLUsers.length} orphan RL accounts`,
      linked: results.filter((r) => r.action === "linked" || r.action === "re-linked").length,
      noMatch: results.filter((r) => r.action === "no_match").length,
      approvedEmailsSynced: approvedSynced,
      results,
    });
  } catch (err: any) {
    console.error("[SyncRL] Fatal error:", err);
    try {
      const { captureServerException } = await import("@/lib/hriq/sentry");
      await captureServerException(err, { action: "syncRLAccounts" });
    } catch (err) { console.warn("[sync-rl-accounts/route:GET] Suppressed error:", err); }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** Simple Levenshtein distance for fuzzy email prefix matching */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}
