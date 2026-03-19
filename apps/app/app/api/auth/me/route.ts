import { createServerClient } from "@supabase/ssr";
import { database } from "@repo/database";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";

const limiter = rateLimit({ max: 30, windowMs: 60000 });

/**
 * GET /api/auth/me
 * Returns the authenticated user's real role from the DB membership,
 * not from user_metadata (which reflects OAuth data, not HRIQ roles).
 */
export async function GET() {
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  const { limited } = limiter.check(ip);
  if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cookiesToSet) {
            try {
              for (const { name, value, options } of cookiesToSet) {
                cookieStore.set(name, value, options);
              }
            } catch (err) { console.warn("[me/route:GET] Suppressed error:", err); }
          },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ role: "member", orgId: null });

    const activeOrgId = (user.user_metadata?.activeOrganizationId as string | null) ?? null;

    // Look up the real role from organization_members
    const membership = await database.organizationMember.findFirst({
      where: activeOrgId
        ? { userId: user.id, organizationId: activeOrgId }
        : { userId: user.id },
      select: { role: true, organizationId: true },
      orderBy: { createdAt: "asc" },
    });

    // Look up the employee's department (used to conditionally hide menus like Timesheets for salaried staff)
    let department: string | null = null;
    if (membership?.organizationId) {
      const emp = await database.employee.findFirst({
        where: {
          organizationId: membership.organizationId,
          linkedUserId: user.id,
        },
        select: { department: true },
      });
      department = emp?.department ?? null;
    }

    return NextResponse.json({
      role: membership?.role ?? "member",
      orgId: membership?.organizationId ?? null,
      department,
    });
  } catch (err) {
    console.error("[/api/auth/me] Error:", err);
    return NextResponse.json({ role: "member", orgId: null });
  }
}
