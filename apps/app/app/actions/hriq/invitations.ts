"use server";

import { requireRole, requireOrg } from "@repo/auth/session";
import { database } from "@repo/database";
import { normalizeEmail, checkEmailConflicts } from "@/lib/hriq/utils";
import { revalidatePath } from "next/cache";
import { HriqError } from "@/lib/hriq/errors";
import { serialize } from "@/lib/hriq/serialize";

// RL: Create Client Organization 

export async function createClientOrganization(data: {
 name: string;
 adminEmail: string;
 adminName?: string;
 industry?: string;
 companySize?: string;
 website?: string;
 country?: string;
 address?: string;
 adminPhone?: string;
 adminTitle?: string;
 billingEmail?: string;
 paymentTerms?: string;
 docChecklist?: Record<string, boolean>;
 paymentMethod?: string;
 vaSeats?: number;
 planType?: string;
 suppressInviteEmail?: boolean;
 suppressKycEmail?: boolean;
 skipKyc?: boolean;
 pppInvoice?: { id: string; docNumber: string | null; txnDate: string; totalAmount: number; customerName: string | null; status: string } | null;
}) {
 const session = await requireRole("super_admin");

 if (!data.name?.trim()) return { error: "[HRIQ-9903] Organization name is required" } as any;
 if (!data.adminEmail?.trim()) return { error: "[HRIQ-1405] Admin email is required" } as any;

 const adminEmail = normalizeEmail(data.adminEmail);

 // ─── Cross-system email conflict detection ─────────────────────────
 // BLOCK if this email belongs to an active contractor in any org.
 // WARN (but allow) if it's an existing dashboard user — they'll get
 // added to the new org as well.
 const conflict = await checkEmailConflicts(adminEmail, {
   context: "creating a client organization admin",
 });
 if (conflict.hasConflict && conflict.details.employeeRecords.length > 0) {
   return { error: `[HRIQ-0203] Cannot use "${adminEmail}" as org admin. ${conflict.message}` } as any;
 }
 const sharedOrgNames: string[] = conflict.details.orgMemberships.map((m) => m.orgName);

 const slug =
 data.name
 .toLowerCase()
 .replace(/[^a-z0-9]+/g, "-")
 .replace(/^-|-$/g, "")
 .slice(0, 48) +
 "-"+
 Date.now().toString(36);

 const org = await database.organization.create({
 data: {
 name: data.name,
 slug,
 },
 });

 // Auto-create Stripe Customer for client invoicing (only for ppp / both)
 const effectivePaymentMethod = data.paymentMethod || "ppp";
 if (effectivePaymentMethod === "ppp" || effectivePaymentMethod === "both") {
   try {
     const { ensureStripeCustomer } = await import("./stripe");
     await ensureStripeCustomer(org.id);
   } catch (stripeErr) {
     console.error("[HRIQ] Failed to auto-create Stripe Customer for org:", stripeErr);
   }
 }

 // Save org profile with extra details
 try {
 await database.organizationProfile.create({
 data: {
 organizationId: org.id,
 industry: data.industry || null,
 companySize: data.companySize || null,
 website: data.website || null,
 country: data.country || null,
 address: data.address || null,
 adminName: data.adminName || null,
 adminEmail: adminEmail,
 adminPhone: data.adminPhone || null,
 adminTitle: data.adminTitle || null,
 billingEmail: data.billingEmail || null,
 paymentTerms: data.paymentTerms || "net_30",
 docChecklist: data.docChecklist ?? {},
 paymentMethod: data.paymentMethod || "ppp",
 vaSeats: data.vaSeats ?? null,
 planType: data.planType ?? null,
 suppressInviteEmail: data.suppressInviteEmail ?? false,
 suppressKycEmail: data.suppressKycEmail ?? false,
 ...(data.skipKyc ? { kycStatus: "approved", kycVerifiedAt: new Date(), kycVerifiedName: "Skipped by admin" } : {}),
 pppInvoice: data.pppInvoice ?? undefined,
 },
 });
 } catch (profileError) {
 console.error("[HRIQ-1601] Invitations — failed to create org profile:", profileError);
 }

 // Create invitation for the client admin
 const invitation = await database.organizationInvitation.create({
 data: {
 organizationId: org.id,
 email: adminEmail,
 role: "admin",
 invitedBy: session.userId,
 expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
 },
 });

 // Pre-approve the email
 await database.approvedEmail.create({
 data: {
 email: adminEmail,
 role: "admin",
 organizationId: org.id,
 addedByUserId: session.userId,
 },
 });

 // Provision Supabase Auth account for the org admin
 try {
 const { getSupabaseAdmin, DEFAULT_PASSWORD } = await import("./constants");
 const supabaseAdmin = getSupabaseAdmin();
 const displayName = data.adminName || adminEmail.split("@")[0];

 // Check if user already exists (via our DB first, then try create)
 const existingAppUser = await database.appUser.findFirst({
 where: { email: { equals: adminEmail, mode: "insensitive"} },
 select: { supabaseUserId: true },
 });

 let userId: string | null = null;
 const isCurrentUser = existingAppUser?.supabaseUserId === session.userId;
 if (existingAppUser) {
 userId = existingAppUser.supabaseUserId;
      // Skip password reset if this is the currently logged-in user to avoid
      // invalidating their active session (which causes logout mid-wizard).
      // Always update user_metadata so next login resolves to this new org.
      if (!isCurrentUser) {
        await supabaseAdmin.auth.admin.updateUserById(userId, {
          password: DEFAULT_PASSWORD,
          user_metadata: {
            activeOrganizationId: org.id,
            role: "admin",
            isFirstLogin: true,
            passwordChanged: false,
          },
        });
      } else {
        // Even if this is the current user, update their activeOrganizationId
        // so future logins resolve to the new org.
        await supabaseAdmin.auth.admin.updateUserById(userId, {
          user_metadata: { activeOrganizationId: org.id, role: "admin" },
        });
      }
 } else {
 const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
 email: adminEmail,
 password: DEFAULT_PASSWORD,
 email_confirm: true,
 user_metadata: {
 name: displayName,
 activeOrganizationId: org.id,
 role: "admin",
 isFirstLogin: true,
 },
 });
 if (!createErr && newUser?.user?.id) userId = newUser.user.id;
 }

 if (userId) {
 await database.appUser.upsert({
 where: { email: adminEmail },
 create: { supabaseUserId: userId, email: adminEmail, displayName },
 update: { displayName },
 });
 const alreadyMember = await database.organizationMember.findFirst({
 where: { userId, organizationId: org.id },
 });
 if (!alreadyMember) {
 await database.organizationMember.create({
 data: { userId, organizationId: org.id, role: "admin"},
 });
 }
 }
 } catch (provisionErr) {
 console.error("[HRIQ] Failed to provision org admin account:", provisionErr);
 }

 try {
   await database.auditLog.create({
     data: {
       organizationId: org.id,
       actorType: "user",
       actorUserId: session.userId,
       action: "organization.created",
       objectType: "organization",
       objectId: org.id,
       newValue: serialize({ name: data.name, adminEmail: adminEmail, industry: data.industry, paymentMethod: data.paymentMethod }),
     },
   });
 } catch (auditErr) {
   console.error("[HRIQ] Failed to create audit log for org creation (non-blocking):", auditErr);
 }

 // Auto-create Contact record so admin appears in Contacts sidebar
 if (data.adminName || adminEmail) {
   try {
     await database.contact.create({
       data: {
         organizationId: org.id,
         fullName: data.adminName || adminEmail.split("@")[0],
         email: adminEmail,
         phone: data.adminPhone || null,
         jobTitle: data.adminTitle || null,
         role: "primary",
         createdByUserId: session.userId,
         createdByName: "System (org wizard)",
       },
     });
     // If a separate billing email was provided, create a billing contact too
     if (data.billingEmail && normalizeEmail(data.billingEmail) !== adminEmail) {
       await database.contact.create({
         data: {
           organizationId: org.id,
           fullName: data.billingEmail.split("@")[0],
           email: normalizeEmail(data.billingEmail),
           role: "billing",
           createdByUserId: session.userId,
           createdByName: "System (org wizard)",
         },
       });
     }
   } catch (contactErr) {
     console.error("[HRIQ] Failed to auto-create contact from org wizard:", contactErr);
   }
 }

 // Send admin invitation email (skipped if suppress flag was set at creation)
 let emailSent = false;
 let emailError: string | null = null;
 if (!data.suppressInviteEmail) {
  try {
   const { sendOrgAdminInviteEmail } = await import("./send-email");
   await sendOrgAdminInviteEmail(adminEmail, data.name, data.adminName);
   emailSent = true;
  } catch (e) {
   emailError = e instanceof Error ? e.message : "Unknown email error";
   console.error("[HRIQ-1703] Invitations — failed to send org admin invite email:", e);
  }
 }

 revalidatePath("/", "layout");
 return {
 organization: org,
 invitation,
 emailSent,
 emailError,
 sharedEmailWarning: sharedOrgNames.length > 0
 ? ` ${adminEmail} already has access to: ${sharedOrgNames.join(", ")}. They will now have access to ${data.name} as well.`
 : null,
 };
}

export async function resendOrgAdminDashboardInvite(organizationId: string) {
  await requireRole("super_admin");
  const profile = await database.organizationProfile.findUnique({
    where: { organizationId },
    select: { adminEmail: true, adminName: true, organization: { select: { name: true } } },
  });
  if (!profile?.adminEmail) return { error: "No admin email found for this organization." };
  try {
    const { sendOrgAdminInviteEmail } = await import("./send-email");
    await sendOrgAdminInviteEmail(profile.adminEmail, profile.organization.name, profile.adminName ?? undefined);
    return { success: true };
  } catch (e) {
    console.error("[HRIQ] resendOrgAdminDashboardInvite failed:", e);
    return { error: "Failed to send dashboard invite email." };
  }
}

export async function getOrganizations() {
 const session = await requireRole("super_admin");

 // Get the super_admin's own org to exclude it (that's RL's internal org)
 const ownMembership = await database.organizationMember.findFirst({
 where: { userId: session.userId, role: "super_admin"},
 select: { organizationId: true },
 });

 return database.organization.findMany({
 where: ownMembership ? { id: { not: ownMembership.organizationId } } : {},
 include: {
 _count: { select: { members: true, employees: true } },
 profile: { select: { kycStatus: true, adminName: true, adminEmail: true, adminPhone: true, adminTitle: true, industry: true, vaSeats: true, planType: true, paymentMethod: true } },
 },
 orderBy: { createdAt: "desc"},
 });
}

export async function updateOrganizationProfile(organizationId: string, data: {
 industry?: string | null;
 companySize?: string | null;
 website?: string | null;
 country?: string | null;
 address?: string | null;
 adminName?: string | null;
 adminEmail?: string | null;
 adminPhone?: string | null;
 adminTitle?: string | null;
 billingEmail?: string | null;
 paymentTerms?: string | null;
 docChecklist?: Record<string, boolean>;
 paymentMethod?: string | null;
}) {
 await requireRole("super_admin");
 const result = await database.organizationProfile.upsert({
 where: { organizationId },
 create: { organizationId, ...data, docChecklist: data.docChecklist ?? {} },
 update: { ...data, ...(data.docChecklist ? { docChecklist: data.docChecklist } : {}) },
 });
 revalidatePath("/", "layout");
 return result;
}

export async function deleteClientOrganization(organizationId: string) {
  try {
   const session = await requireRole("super_admin");
   if (!organizationId) throw new HriqError("HRIQ-9903", "Organization ID is required");

   // Protect RL internal org (super admin home org) from accidental deletion.
   const ownMembership = await database.organizationMember.findFirst({
   where: { userId: session.userId, role: "super_admin"},
   select: { organizationId: true },
   });
   if (ownMembership?.organizationId === organizationId) {
   throw new HriqError("HRIQ-1603");
   }

   const org = await database.organization.findUnique({
   where: { id: organizationId },
   select: { id: true, name: true },
   });
   if (!org) throw new HriqError("HRIQ-1601");

   // ─── Clear stale activeOrganizationId for all users in this org ───
   // Without this, users who had this org as their active org will be
   // redirected to a ghost dashboard after login.
   try {
   const { getSupabaseAdmin } = await import("./constants");
   const supabaseAdmin = getSupabaseAdmin();

   // Find all members of this org BEFORE cascade-delete removes them
   const membersToClean = await database.organizationMember.findMany({
   where: { organizationId },
   select: { userId: true },
   });

   for (const member of membersToClean) {
   try {
   const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(member.userId);
   if (user?.user_metadata?.activeOrganizationId === organizationId) {
   // Find their next valid org membership (if any)
   const nextMembership = await database.organizationMember.findFirst({
   where: { userId: member.userId, organizationId: { not: organizationId } },
   include: { organization: { select: { id: true } } },
   orderBy: { createdAt: "asc"},
   });
   await supabaseAdmin.auth.admin.updateUserById(member.userId, {
   user_metadata: {
   ...user.user_metadata,
   activeOrganizationId: nextMembership?.organization?.id ?? null,
   },
   });
   }
   } catch (e) {
   console.warn(`[HRIQ] Failed to clean metadata for user ${member.userId}:`, e);
   }
   }
   } catch (e) {
   console.error("[HRIQ] Failed to clean up user metadata on org delete:", e);
   }

   // ─── Delete auth accounts for users with no other org membership ─────
   // app_users and Supabase auth accounts are not org-scoped, so they don't
   // cascade automatically. We clean them up here for single-org members.
   try {
   const { getSupabaseAdmin } = await import("./constants");
   const supabaseAdmin = getSupabaseAdmin();

   // Re-read membersToClean in case we need it after the metadata loop
   const singleOrgMembers = await database.organizationMember.findMany({
   where: { organizationId },
   select: { userId: true },
   });

   for (const member of singleOrgMembers) {
   // Check if they belong to any other org
   const otherMemberships = await database.organizationMember.count({
   where: { userId: member.userId, organizationId: { not: organizationId } },
   });
   if (otherMemberships === 0) {
   // No other orgs — safe to fully delete this user
   try {
   await database.appUser.deleteMany({ where: { supabaseUserId: member.userId } });
   } catch (e) { /* ignore */ }
   try {
   await supabaseAdmin.auth.admin.deleteUser(member.userId);
   } catch (e) {
   console.warn(`[HRIQ] Failed to delete auth user ${member.userId}:`, e);
   }
   }
   }
   } catch (e) {
   console.error("[HRIQ] Failed to clean up orphaned auth accounts on org delete:", e);
   }

   // ─── FK constraints handle cascading automatically ─────────────────
   // All child tables (employees, profiles, members, invitations, timesheets,
   // pay runs, invoices, contracts, etc.) cascade-delete at the DB level.
   // Audit logs and approved_emails get their org reference SET NULL.

   try {
     await database.auditLog.create({
     data: {
     organizationId: null,
     actorType: "user",
     actorUserId: session.userId,
     action: "organization.deleted",
     objectType: "organization",
     objectId: organizationId,
     oldValue: serialize({ name: org.name }),
     },
     });
   } catch (auditErr) {
     console.error("[HRIQ] Audit log write failed (non-blocking):", auditErr);
   }

   await database.organization.delete({ where: { id: organizationId } });

   revalidatePath("/", "layout");
   return { ok: true as const };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[invitations.ts:deleteClientOrganization]", _msg);
    return { error: _msg };
  }
}

// Client: Invite VA / Team Member 

export async function inviteTeamMember(data: {
 email: string;
 role: string;
 name?: string;
 personalEmail?: string;
}): Promise<{ emailSent?: boolean; emailError?: string | null; addedImmediately?: boolean; error?: string }> {
 try {
 return await _inviteTeamMemberInternal(data);
 } catch (err) {
 console.error("[HRIQ] inviteTeamMember failed:", err);
 return { error: err instanceof Error ? err.message : "Failed to send invite"};
 }
}

async function _inviteTeamMemberInternal(data: {
 email: string;
 role: string;
 name?: string;
 personalEmail?: string;
}) {
 const session = await requireOrg();

 // Only admins and super_admins can invite team members
 if (!["super_admin", "admin"].includes(session.orgRole)) {
   throw new HriqError("HRIQ-0105", "Only admins can invite team members");
 }

 // Validate role
 const allowedRoles = ["super_admin", "admin", "manager", "member"];
 if (!allowedRoles.includes(data.role)) {
 throw new HriqError("HRIQ-1504", `Invalid role: ${data.role}`);
 }

 const email = normalizeEmail(data.email);

 // Cross-system email conflict check — prevent inviting an email that's an active contractor elsewhere
 const conflict = await checkEmailConflicts(email, {
   allowSameOrg: session.orgId,
   context: "inviting a team member",
 });
 if (conflict.hasConflict && conflict.details.employeeRecords.length > 0) {
   throw new Error(`[HRIQ-0203] ${conflict.message}`);
 }

 // Check if already a member of this org
 const existingUser = await database.appUser.findFirst({
 where: { email: { equals: email, mode: "insensitive"} },
 select: { supabaseUserId: true },
 });
 if (existingUser) {
 const existingMember = await database.organizationMember.findFirst({
 where: { userId: existingUser.supabaseUserId, organizationId: session.orgId },
 });
 if (existingMember) {
 throw new Error(`${data.email} is already a member of this organization (role: ${existingMember.role}).`);
 }
 }

 // Check if there's already a pending invitation
 const existingInvite = await database.organizationInvitation.findFirst({
 where: { email: { equals: email, mode: "insensitive"}, organizationId: session.orgId, acceptedAt: null, expiresAt: { gt: new Date() } },
 });
 if (existingInvite) {
 throw new Error(`A pending invitation already exists for ${data.email}. It expires on ${existingInvite.expiresAt.toLocaleDateString()}.`);
 }

 const invitation = await database.organizationInvitation.create({
 data: {
 organizationId: session.orgId,
 email,
 role: data.role,
 invitedBy: session.userId,
 expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
 },
 });

 // Pre-approve the email so they get auto-linked on first login
 await database.approvedEmail.upsert({
 where: {
 email_organizationId: {
 email: email,
 organizationId: session.orgId,
 },
 },
 create: {
 email: email,
 role: data.role,
 organizationId: session.orgId,
 addedByUserId: session.userId,
 },
 update: {
 role: data.role,
 },
 });

 // Provision Supabase Auth account (email + password) so they can log in immediately
 const { getSupabaseAdmin, DEFAULT_PASSWORD } = await import("./constants");
 const supabaseAdmin = getSupabaseAdmin();
 const displayName = data.name || email.split("@")[0];
 let addedImmediately = false;

 try {
 // Check if user already exists (via our DB first, then try create)
 const existingAppUserForAuth = await database.appUser.findFirst({
 where: { email: { equals: email, mode: "insensitive"} },
 select: { supabaseUserId: true },
 });

 let userId: string;
 if (existingAppUserForAuth) {
 userId = existingAppUserForAuth.supabaseUserId;
 // Don't reset the password for existing users — they already have credentials
 } else {
 const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
 email,
 password: DEFAULT_PASSWORD,
 email_confirm: true,
 user_metadata: {
 name: displayName,
 activeOrganizationId: session.orgId,
 role: data.role,
 isFirstLogin: true,
 },
 });
 if (createErr) throw new Error(createErr.message);
 userId = newUser?.user?.id ?? "";
 }

 if (userId) {
 await database.appUser.upsert({
 where: { email },
 create: { supabaseUserId: userId, email, displayName },
 update: { displayName },
 });

 const alreadyMember = await database.organizationMember.findFirst({
 where: { userId, organizationId: session.orgId },
 });
 if (!alreadyMember) {
 await database.organizationMember.create({
 data: { userId, organizationId: session.orgId, role: data.role },
 });
 }
 addedImmediately = true;
 }

 // Auto-link to employee record if one exists with matching email
 if (userId) {
 try {
 // Check if user is already linked to an employee IN THIS ORG
 const alreadyLinked = await database.employee.findFirst({
 where: { linkedUserId: userId, organizationId: session.orgId },
 select: { id: true },
 });
 if (!alreadyLinked) {
 // Build email match conditions: invite email + personal email if provided
 const emailMatches: Array<Record<string, unknown>> = [
 { workEmail: { equals: email, mode: "insensitive"} },
 { personalEmail: { equals: email, mode: "insensitive"} },
 ];
 if (data.personalEmail) {
 const pEmail = data.personalEmail.trim().toLowerCase();
 emailMatches.push(
 { workEmail: { equals: pEmail, mode: "insensitive"} },
 { personalEmail: { equals: pEmail, mode: "insensitive"} },
 );
 }
 const employee = await database.employee.findFirst({
 where: {
 organizationId: session.orgId,
 linkedUserId: null,
 OR: emailMatches,
 },
 select: { id: true, workEmail: true },
 });
 if (employee) {
 // Link the employee and also set work_email to the invite email if missing
 await database.employee.update({
 where: { id: employee.id },
 data: {
 linkedUserId: userId,
 ...(!employee.workEmail ? { workEmail: email } : {}),
 },
 });
 }
 }
 } catch (linkErr) {
 console.error("[HRIQ] Auto-link employee on invite failed:", linkErr);
 }
 }
 } catch (provisionErr) {
 console.error("[HRIQ] Failed to provision auth account for team invite:", provisionErr);
 // Fallback: check if user already exists in app_users
 const existingUser = await database.appUser.findFirst({
 where: { email: { equals: email, mode: "insensitive"} },
 select: { id: true, supabaseUserId: true },
 });
 if (existingUser) {
 const alreadyMember = await database.organizationMember.findFirst({
 where: { userId: existingUser.supabaseUserId, organizationId: session.orgId },
 });
 if (!alreadyMember) {
 await database.organizationMember.create({
 data: { userId: existingUser.supabaseUserId, organizationId: session.orgId, role: data.role },
 });
 }
 addedImmediately = true;
 }
 }

 try {
   await database.auditLog.create({
   data: {
   organizationId: session.orgId,
   actorType: "user",
   actorUserId: session.userId,
   action: "invitation.created",
   objectType: "invitation",
   objectId: invitation.id,
   newValue: serialize({ email: email, role: data.role, addedImmediately, personalEmail: data.personalEmail || null }),
   },
   });
 } catch (auditErr) {
   console.error("[HRIQ] Audit log write failed (non-blocking):", auditErr);
 }

 // Send invitation email via Gmail
 let emailSent = false;
 let emailError: string | null = null;
 try {
 const { sendTeamInviteEmail } = await import("./send-email");
 await sendTeamInviteEmail(email, data.role, data.name);
 emailSent = true;
 } catch (err) {
 emailError = err instanceof Error ? err.message : "Unknown email error";
 console.error("[HRIQ-1703] Invitations — failed to send invitation email:", err);
 }

 revalidatePath("/[orgSlug]/settings", "page");

 return { ...invitation, emailSent, emailError, addedImmediately };
}

export async function getPendingInvitations() {
 const session = await requireOrg();

 return database.organizationInvitation.findMany({
 where: {
 organizationId: session.orgId,
 acceptedAt: null,
 expiresAt: { gt: new Date() },
 },
 orderBy: { createdAt: "desc"},
 });
}

export async function revokeInvitation(invitationId: string) {
  try {
   const session = await requireOrg();

   const invitation = await database.organizationInvitation.findFirst({
   where: { id: invitationId, organizationId: session.orgId },
   });
   if (!invitation) throw new HriqError("HRIQ-1401");

   // Set expiry to now to effectively revoke it
   const revoked = await database.organizationInvitation.update({
   where: { id: invitationId },
   data: { expiresAt: new Date() },
   });

   revalidatePath("/[orgSlug]/settings", "page");

   return revoked;

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[invitations.ts:revokeInvitation]", _msg);
    return { error: _msg };
  }
}

export async function updateOrgSeats(organizationId: string, vaSeats: number, planType?: string) {
  try {
    await requireRole("super_admin");
    if (vaSeats < 1 || vaSeats > 500) throw new Error("Invalid seat count");
    await database.organizationProfile.upsert({
      where: { organizationId },
      create: { organizationId, vaSeats, ...(planType ? { planType } : {}) },
      update: { vaSeats, ...(planType ? { planType } : {}) },
    });
    revalidatePath("/", "layout");

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[invitations.ts:updateOrgSeats]", _msg);
    return { error: _msg };
  }
}

/**
 * Preview what will be deleted when an organization is removed.
 * Returns counts for confirmation dialog — no mutations.
 */
export async function previewDeleteOrganization(organizationId: string) {
  try {
    await requireRole("super_admin");

    const org = await database.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true },
    });
    if (!org) return { error: "Organization not found" };

    const [employees, members, payments, timesheets, documents, invoices, tasks, agreements, invites, onboardingSessions] = await Promise.all([
      database.employee.count({ where: { organizationId } }),
      database.organizationMember.count({ where: { organizationId } }),
      database.payment.count({ where: { employee: { organizationId } } }),
      database.timesheetSubmission.count({ where: { employee: { organizationId } } }),
      database.document.count({ where: { employee: { organizationId } } }),
      database.clientInvoice.count({ where: { organizationId } }),
      database.task.count({ where: { employee: { organizationId } } }),
      database.serviceAgreement.count({ where: { organizationId } }),
      database.organizationInvitation.count({ where: { organizationId } }),
      database.onboardingSession.count({ where: { employee: { organizationId } } }),
    ]);

    // Users who will lose their auth accounts (single-org members)
    const allMembers = await database.organizationMember.findMany({
      where: { organizationId },
      select: { userId: true },
    });
    let authAccountsDeleted = 0;
    for (const m of allMembers) {
      const otherOrgs = await database.organizationMember.count({
        where: { userId: m.userId, organizationId: { not: organizationId } },
      });
      if (otherOrgs === 0) authAccountsDeleted++;
    }

    return {
      orgName: org.name,
      employees,
      members,
      authAccountsDeleted,
      payments,
      timesheets,
      documents,
      invoices,
      tasks,
      agreements,
      invites,
      onboardingSessions,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to preview";
    return { error: msg };
  }
}
