import { database } from "@repo/database";
import { getSupabaseAdmin } from "@/app/actions/hriq/constants";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 401 });
    }

    const userId = user.id;
    const email = user.email;
    if (!userId || !email) {
      return NextResponse.json({ ok: false, error: "Missing userId or email" }, { status: 400 });
    }

    // Check if this email has any approved emails / pending invitations
    // Org deletion sets organizationId to NULL, so we only match valid orgs
    const approvedEmail = await database.approvedEmail.findFirst({
      where: {
        email: email.toLowerCase(),
        organizationId: { not: null },
      },
      orderBy: { addedAt: "desc" },
    });

    if (approvedEmail && approvedEmail.organizationId) {
      // Create org membership
      try {
        await database.organizationMember.create({
          data: {
            userId,
            organizationId: approvedEmail.organizationId,
            role: approvedEmail.role ?? "member",
          },
        });
      } catch (err) {
        console.warn("[Post-signup] Membership may already exist:", err);
      }

      // Set active org in Supabase user metadata
      // Super admins in the RL org should default to internal/platform view (no activeOrg)
      const isSuperAdmin = approvedEmail.role === "super_admin";
      const isRLOrg = approvedEmail.organizationId === (process.env.RL_ORGANIZATION_ID ?? "org_rl_001");
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        user_metadata: {
          activeOrganizationId: (isSuperAdmin && isRLOrg) ? null : approvedEmail.organizationId,
          role: approvedEmail.role,
        },
      });

      // Mark invitation as accepted
      const invitation = await database.organizationInvitation.findFirst({
        where: {
          email: email.toLowerCase(),
          organizationId: approvedEmail.organizationId,
          acceptedAt: null,
        },
      });
      if (invitation) {
        await database.organizationInvitation.update({
          where: { id: invitation.id },
          data: { acceptedAt: new Date() },
        });
      }
    }

    // Create app_user record
    try {
      await database.appUser.create({
        data: {
          supabaseUserId: userId,
          email: email.toLowerCase(),
          displayName: null,
          isActive: true,
        },
      });
    } catch (err) {
      console.warn("[Post-signup] App user may already exist:", err);
    }

    return NextResponse.json({ ok: true, orgLinked: !!approvedEmail?.organizationId });
  } catch (error) {
    console.error("[Post-signup] Error:", error);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
