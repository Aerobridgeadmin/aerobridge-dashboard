import { createServerClient } from "@supabase/ssr";
import { database } from "@repo/database";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

/**
 * POST /api/auth/resolve-redirect
 *
 * Called by the sign-in form after successful authentication.
 * Returns the org slug so the client can navigate directly to /{orgSlug}
 * instead of going to / which causes a visible flash + double redirect.
 */
export async function POST() {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              for (const { name, value, options } of cookiesToSet) {
                cookieStore.set(name, value, options);
              }
            } catch {
              // Read-only cookies in certain contexts
            }
          },
        },
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ redirect: "/" });
    }

    // Track login for password-based sign-ins.
    // OAuth logins are already tracked in /api/auth/callback, but password
    // logins (both trusted-device and OTP-verified) only go through here.
    try {
      await database.appUser.upsert({
        where: { supabaseUserId: user.id },
        create: {
          supabaseUserId: user.id,
          email: user.email ?? "",
          displayName: user.user_metadata?.name ?? user.user_metadata?.full_name ?? null,
          lastLoginAt: new Date(),
          loginCount: 1,
        },
        update: {
          lastLoginAt: new Date(),
          loginCount: { increment: 1 },
        },
      });
    } catch (e) {
      // Non-blocking — don't break the login redirect if tracking fails
      console.error("[resolve-redirect] Login tracking failed:", e);
    }

    const activeOrgId = user.user_metadata?.activeOrganizationId as
      | string
      | undefined;

    let orgSlug: string | null = null;

    if (activeOrgId) {
      // Validate both that the org exists AND the user still has membership
      const org = await database.organization.findUnique({
        where: { id: activeOrgId },
        select: { slug: true },
      });
      if (org) {
        const hasMembership = await database.organizationMember.findFirst({
          where: { userId: user.id, organizationId: activeOrgId },
          select: { id: true },
        });
        if (hasMembership) {
          orgSlug = org.slug;
        }
      }
      // If org doesn't exist or user has no membership, the activeOrgId is stale
      // Fall through to find a valid org below
    }

    if (!orgSlug) {
      const membership = await database.organizationMember.findFirst({
        where: { userId: user.id },
        include: { organization: { select: { slug: true } } },
        orderBy: { createdAt: "asc" },
      });
      orgSlug = membership?.organization?.slug ?? null;
    }

    return NextResponse.json({ redirect: orgSlug ? `/${orgSlug}` : "/" });
  } catch (err) {
    console.error("[resolve-redirect] Error:", err);
    return NextResponse.json({ redirect: "/" });
  }
}
