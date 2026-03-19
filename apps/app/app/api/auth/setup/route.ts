import { createServerClient } from "@supabase/ssr";
import { database } from "@repo/database";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production" || !process.env.ENABLE_DEBUG_ROUTES) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  const { searchParams } = new URL(request.url);
  const debug: string[] = [];

  try {
    // Step 1: Check Supabase auth
    debug.push("Step 1: Checking Supabase auth...");
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cookiesToSet) {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          },
        },
      }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) debug.push("Auth error: " + authError.message);
    if (!user) {
      return NextResponse.json({ error: "Not authenticated. Sign in first, then visit this URL.", debug }, { status: 401 });
    }
    debug.push("User: " + user.id + " | " + user.email);
    debug.push("Current metadata: " + JSON.stringify(user.user_metadata));

    // Step 2: Test DB connection
    debug.push("Step 2: Testing database connection...");
    let dbWorks = false;
    try {
      const orgs = await database.organization.findMany({ take: 3, select: { id: true, name: true } });
      debug.push("DB OK - orgs found: " + JSON.stringify(orgs));
      dbWorks = true;
    } catch (dbErr: unknown) {
      const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
      debug.push("DB ERROR: " + msg);
    }

    if (!dbWorks) {
      debug.push("DATABASE_URL set: " + !!process.env.DATABASE_URL);
      debug.push("DATABASE_URL prefix: " + (process.env.DATABASE_URL?.slice(0, 30) || "MISSING"));
      return NextResponse.json({ error: "Database connection failed", debug }, { status: 500 });
    }

    // Step 3: Check membership
    debug.push("Step 3: Checking org membership...");
    const membership = await database.organizationMember.findFirst({
      where: { userId: user.id },
    });
    debug.push("Membership: " + JSON.stringify(membership));

    // Step 4: Set activeOrganizationId
    if (membership) {
      debug.push("Step 4: Setting activeOrganizationId to " + membership.organizationId + " and role to " + membership.role);
      const { error: updateErr } = await supabase.auth.updateUser({
        data: { activeOrganizationId: membership.organizationId, role: membership.role },
      });
      if (updateErr) {
        debug.push("Update error: " + updateErr.message);
      } else {
        debug.push("SUCCESS - activeOrganizationId set!");
      }

      return NextResponse.json({ success: true, role: membership.role, orgId: membership.organizationId, debug });
    }

    // Step 5: No membership, check approved emails
    debug.push("Step 5: No membership found, checking approved emails...");
    const approved = await database.approvedEmail.findFirst({
      where: { email: { equals: user.email ?? "", mode: "insensitive" }, organizationId: { not: null } },
    });
    debug.push("Approved: " + JSON.stringify(approved));

    if (approved?.organizationId) {
      const member = await database.organizationMember.create({
        data: { userId: user.id, organizationId: approved.organizationId, role: approved.role },
      });
      await supabase.auth.updateUser({ data: { activeOrganizationId: approved.organizationId } });
      debug.push("Created membership and set org!");
      return NextResponse.json({ success: true, role: approved.role, orgId: approved.organizationId, debug });
    }

    return NextResponse.json({ error: "No membership or approved email found", debug });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.stack || e.message : String(e);
    debug.push("FATAL: " + msg);
    return NextResponse.json({ error: "Fatal error", debug }, { status: 500 });
  }
}
