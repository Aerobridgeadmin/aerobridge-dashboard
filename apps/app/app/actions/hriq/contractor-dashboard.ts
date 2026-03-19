"use server";
import { getContractorEmail } from "@/lib/hriq/utils";

import { requireRole } from "@repo/auth/session";
import { database } from "@repo/database";
import { revalidatePath } from "next/cache";

import { DEFAULT_PASSWORD, APP_URL, normalizeAppUrl, buildUniqueUsername, getSupabaseAdmin, RL_ORG_ID } from "./constants";
import { HriqError } from "@/lib/hriq/errors";

/** Determine role for new contractor accounts — always "member" */
function contractorRole(_orgId: string): "member" {
  return "member";
}

/**
 * Provision a Supabase account for a contractor.
 * - Email + fixed password (DEFAULT_PASSWORD)
 * - Role: "member" for RL for client orgs
 * - Profile picture: Remote Leverage logo
 * - Username: first initial + first last name (e.g. "JSmith")
 * - Password change disabled via metadata flag
 */
export async function provisionContractorDashboard(employeeId: string) {
  try {
    const session = await requireRole("super_admin", "admin");

    // Super admins can provision any contractor; client admins only their own org
    const where = session.orgRole === "super_admin"
      ? { id: employeeId }
      : { id: employeeId, organizationId: session.orgId };

    const employee = await database.employee.findFirst({
      where,
      select: {
        id: true,
        legalFirstName: true,
        legalLastName: true,
        preferredName: true,
        personalEmail: true,
        workEmail: true,
        linkedUserId: true,
        organizationId: true,
        photoUrl: true,
        username: true,
      },
    });

    if (!employee) throw new HriqError("HRIQ-0201");

    const email = (getContractorEmail(employee))?.trim().toLowerCase();
    if (!email) throw new HriqError("HRIQ-0207");

    // Check if another employee already has this email linked to an account
    const duplicateEmployee = await database.employee.findFirst({
      where: {
        id: { not: employeeId },
        linkedUserId: { not: null },
        OR: [
          { personalEmail: { equals: email, mode: "insensitive" } },
          { workEmail: { equals: email, mode: "insensitive" } },
        ],
      },
      select: { id: true, legalFirstName: true, legalLastName: true },
    });
    if (duplicateEmployee) {
      throw new HriqError("HRIQ-0203", `Cannot provision: email "${email}" is already linked to another contractor (${duplicateEmployee.legalFirstName} ${duplicateEmployee.legalLastName}). Please update this contractor's email first.`);
    }

    if (employee.linkedUserId) {
      // Return the STORED username, not a freshly generated one
      const username = employee.username || await buildUniqueUsername(employee.legalFirstName, employee.legalLastName);
      return { alreadyProvisioned: true, email, username };
    }

    const supabaseAdmin = getSupabaseAdmin();
    const appUrl = normalizeAppUrl(APP_URL);
    const orgId = (employee.organizationId ?? session.orgId) as string;
    const username = await buildUniqueUsername(employee.legalFirstName, employee.legalLastName);
    const fullName = `${employee.preferredName ?? employee.legalFirstName} ${employee.legalLastName}`;
    const logoUrl = `${appUrl}/logo.png`;

    // 1) Check if user already exists
    let userId: string | null = null;

    const existingAppUser = await database.appUser.findFirst({
      where: { email },
      select: { supabaseUserId: true },
    });

    if (existingAppUser) {
      userId = existingAppUser.supabaseUserId;
    } else {
      // Use security definer function — Prisma's pooler role can't access auth schema directly
      const authRows = await database.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id::text FROM public.lookup_auth_user_by_email($1)`,
        email
      );
      const found = authRows[0];

      if (found) {
        userId = found.id;
        // Get existing metadata via Admin SDK, then reset password
        const { data: { user: existingAuthUser } } = await supabaseAdmin.auth.admin.getUserById(found.id);
        await supabaseAdmin.auth.admin.updateUserById(found.id, {
          password: DEFAULT_PASSWORD,
          user_metadata: {
            ...(existingAuthUser?.user_metadata ?? {}),
            activeOrganizationId: orgId,
            role: contractorRole(orgId),
            isFirstLogin: true,
            canChangePassword: true,
          },
        });
      } else {
        // 2) Create new user with email + password (auto-confirmed)
        const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
          email,
          password: DEFAULT_PASSWORD,
          email_confirm: true,
          user_metadata: {
            name: fullName,
            activeOrganizationId: orgId,
            role: contractorRole(orgId),

            avatar_url: logoUrl,
            isFirstLogin: true,
            canChangePassword: true,
          },
        });

        if (createErr) throw new HriqError("HRIQ-1502", `Failed to create account: ${createErr.message}`);
        if (!newUser?.user?.id) throw new HriqError("HRIQ-2003");
        userId = newUser.user.id;
      }
    }

    // 3-5, 7) Batch DB operations in a transaction for atomicity
    if (!userId) throw new HriqError("HRIQ-1503");
    const resolvedUserId: string = userId;

    await database.$transaction(async (tx: any) => {
      // 3) Create/update AppUser record
      await tx.appUser.upsert({
        where: { email },
        create: {
          supabaseUserId: resolvedUserId,
          email,
          displayName: fullName,
          profilePicture: logoUrl,
          isActive: true,
        },
        update: { displayName: fullName, profilePicture: logoUrl },
      });

      // 4) ApprovedEmail for auto-link on login
      await tx.approvedEmail.upsert({
        where: { email_organizationId: { email, organizationId: orgId } },
        create: {
          email,
          role: contractorRole(orgId),
          organizationId: orgId,
          addedByUserId: session.userId,
        },
        update: { role: contractorRole(orgId) },
      });

      // 4b) Also approve workEmail (e.g. RL Google Workspace) so Google SSO works
      const rlWorkEmail = employee.workEmail?.trim().toLowerCase();
      if (rlWorkEmail && rlWorkEmail !== email) {
        await tx.approvedEmail.upsert({
          where: { email_organizationId: { email: rlWorkEmail, organizationId: orgId } },
          create: {
            email: rlWorkEmail,
            role: contractorRole(orgId),
            organizationId: orgId,
            addedByUserId: session.userId,
          },
          update: { role: contractorRole(orgId) },
        });
      }

      // 5) Org membership
      await tx.organizationMember.upsert({
        where: { userId_organizationId: { userId: resolvedUserId, organizationId: orgId } },
        create: {
          userId: resolvedUserId,
          organizationId: orgId,
          role: contractorRole(orgId),
        },
        update: { role: contractorRole(orgId) },
      });

      // 7) Link employee + set logo as photo if none + store username
      await tx.employee.update({
        where: { id: employee.id },
        data: {
          linkedUserId: resolvedUserId,
          username,
          ...(employee.photoUrl ? {} : { photoUrl: logoUrl }),
        },
      });
    });

    // 6) Set user metadata (external API — outside transaction)
    await supabaseAdmin.auth.admin.updateUserById(resolvedUserId, {
      user_metadata: {
        activeOrganizationId: orgId,
        name: fullName,
        role: contractorRole(orgId),

        avatar_url: logoUrl,
        isFirstLogin: true,
        canChangePassword: true,
      },
    });

    revalidatePath(`/[orgSlug]/employees/${employee.id}`, "page");
    revalidatePath("/[orgSlug]/hiring", "page");

    return { alreadyProvisioned: false, email, userId: resolvedUserId, username };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[contractor-dashboard.ts:provisionContractorDashboard]", _msg);
    return { error: _msg };
  }
}

/**
 * Send a branded welcome email with login credentials.
 * Automatically provisions the contractor account if not already done.
 * This can be used to re-send credentials to an existing contractor.
 */
export async function sendDashboardInviteEmail(
  employeeId: string,
  fromEmail?: string
) {
  try {
    const session = await requireRole("super_admin", "admin");

    // 1) Ensure account exists before sending credentials
    const provisionResult = await provisionContractorDashboard(employeeId);

    // If already provisioned, reset password back to default so the email credentials are valid
    if ((provisionResult as any).alreadyProvisioned) {
      const supabaseAdmin = getSupabaseAdmin();
      const emp = await database.employee.findFirst({
        where: { id: employeeId },
        select: { linkedUserId: true, workEmail: true, personalEmail: true },
      });
      if (emp?.linkedUserId) {
        // Merge metadata — preserve Google SSO / provider data
        const { data: { user: existingUser } } = await supabaseAdmin.auth.admin.getUserById(emp.linkedUserId);
        await supabaseAdmin.auth.admin.updateUserById(emp.linkedUserId, {
          password: DEFAULT_PASSWORD,
          ban_duration: "none", // Unban in case user was offboarded and banned
          user_metadata: {
            ...(existingUser?.user_metadata ?? {}),
            isFirstLogin: true,
            passwordChanged: false,
          },
        });

        // If user was created via Google SSO, they won't have an 'email' identity.
        // Without it, signInWithPassword fails even though a password hash is set.
        // Add the email identity so both Google SSO and password login work.
        const providers: string[] = existingUser?.app_metadata?.providers ?? [];
        if (!providers.includes("email")) {
          const userEmail = existingUser?.email ?? emp.workEmail ?? emp.personalEmail;
          try {
            // Use security definer function — Prisma role can't access auth schema directly
            await database.$executeRawUnsafe(
              `SELECT public.add_email_identity_to_user($1::uuid, $2)`,
              emp.linkedUserId, userEmail
            );
          } catch (identityErr) {
            // Non-blocking — Google SSO still works even if this fails
            console.warn("[sendDashboardInviteEmail] Failed to add email identity:", identityErr);
          }
        }
      }
    }

    // Super admins can send invites for any contractor
    const empWhere = session.orgRole === "super_admin"
      ? { id: employeeId }
      : { id: employeeId, organizationId: session.orgId };

    const employee = await database.employee.findFirst({
      where: empWhere,
      select: {
        legalFirstName: true,
        legalLastName: true,
        preferredName: true,
        personalEmail: true,
        workEmail: true,
        username: true,
        startDate: true,
        hourlyRate: true,
        currency: true,
        timeDoctorEmail: true,
        organizationId: true,
        organization: { select: { name: true } },
      },
    });

    if (!employee) throw new HriqError("HRIQ-0201");

    const email = (getContractorEmail(employee))?.trim();
    if (!email) throw new HriqError("HRIQ-0207");

    const name = employee.preferredName ?? employee.legalFirstName;
    const appUrl = normalizeAppUrl(APP_URL);

    const startDateStr = employee.startDate
      ? new Date(employee.startDate as any).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
      : "your start date";

    const { sendViaGmail } = await import("@/app/actions/hriq/send-email");
    const { layout, heading, greeting, paragraph, credentialsBox, primaryButton, highlightBox } = await import("@/app/actions/hriq/email-templates");
    const { buildEmail } = await import("./email-template-engine");

    const creds = {
      email,
      password: DEFAULT_PASSWORD,
      username: employee.username || undefined,
      loginUrl: `${appUrl}/sign-in`,
    };

    const isRL = employee.organizationId === RL_ORG_ID;
    const orgName = isRL ? "Remote Leverage" : (employee.organization?.name ?? "your organization");

    // Send a simple credentials-only email — NOT the full onboarding welcome
    const emailHtml = layout(
      heading("Your Dashboard Credentials") +
      greeting(name) +
      paragraph(`Your contractor dashboard for <strong>${orgName}</strong> is ready. Use the credentials below to log in and manage your timesheets, payments, documents, and more.`) +
      credentialsBox(creds.email, creds.password, creds.username, creds.loginUrl) +
      primaryButton("Login to My Dashboard", creds.loginUrl) +
      highlightBox("yellow", "<strong>Security Notice:</strong> You will be required to change your password on your first login. Do not share your login credentials with anyone."),
      "If you have trouble signing in, contact your coordinator for assistance."
    );

    const fallbackSubject = `Your Dashboard Credentials — ${orgName}`;
    const rendered = await buildEmail("dashboard_credentials", {
      name, org_name: orgName, email: creds.email, password: creds.password,
      username: creds.username ?? creds.email, login_url: creds.loginUrl,
    }, emailHtml, fallbackSubject);

    try {
      await sendViaGmail(
        email,
        rendered.subject,
        rendered.html,
        fromEmail
      );
    } catch (emailErr) {
      console.error("[HRIQ] Email send failed (non-blocking):", emailErr);
    }

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[contractor-dashboard.ts:sendDashboardInviteEmail]", _msg);
    return { error: _msg };
  }
}

//  System-level variants (no session required) 

/**
 * System-level contractor provisioning for webhooks, crons, and background tasks.
 * Same as provisionContractorDashboard but does NOT require an authenticated session.
 */
export async function provisionContractorDashboardSystem(employeeId: string) {
  try {
    const employee = await database.employee.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        legalFirstName: true,
        legalLastName: true,
        preferredName: true,
        personalEmail: true,
        workEmail: true,
        linkedUserId: true,
        organizationId: true,
        photoUrl: true,
        username: true,
      },
    });

    if (!employee) throw new HriqError("HRIQ-0201");
    if (!employee.organizationId) throw new HriqError("HRIQ-0208");

    const email = (getContractorEmail(employee))?.trim().toLowerCase();
    if (!email) throw new HriqError("HRIQ-0207");

    if (employee.linkedUserId) {
      // Return stored username, not a freshly generated one
      const username = employee.username || await buildUniqueUsername(employee.legalFirstName, employee.legalLastName);
      return { alreadyProvisioned: true, email, username };
    }

    const supabaseAdmin = getSupabaseAdmin();
    const appUrl = normalizeAppUrl(APP_URL);
    const orgId = employee.organizationId;
    const username = await buildUniqueUsername(employee.legalFirstName, employee.legalLastName);
    const fullName = `${employee.preferredName ?? employee.legalFirstName} ${employee.legalLastName}`;
    const logoUrl = `${appUrl}/logo.png`;

    let userId: string | null = null;

    const existingAppUser = await database.appUser.findFirst({
      where: { email },
      select: { supabaseUserId: true },
    });

    if (existingAppUser) {
      userId = existingAppUser.supabaseUserId;
    } else {
      // Use security definer function — Prisma's pooler role can't access auth schema directly
      const authRows = await database.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id::text FROM public.lookup_auth_user_by_email($1)`,
        email
      );
      const found = authRows[0];

      if (found) {
        userId = found.id;
        await supabaseAdmin.auth.admin.updateUserById(found.id, {
          password: DEFAULT_PASSWORD,
          user_metadata: {
            activeOrganizationId: orgId,
            role: contractorRole(orgId),
            isFirstLogin: true,
            canChangePassword: true,
          },
        });
      } else {
        const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
          email,
          password: DEFAULT_PASSWORD,
          email_confirm: true,
          user_metadata: {
            name: fullName,
            activeOrganizationId: orgId,
            role: contractorRole(orgId),

            avatar_url: logoUrl,
            isFirstLogin: true,
            canChangePassword: true,
          },
        });

        if (createErr) throw new HriqError("HRIQ-1502", `Failed to create account: ${createErr.message}`);
        if (!newUser?.user?.id) throw new HriqError("HRIQ-2003");
        userId = newUser.user.id;
      }

      if (!userId) throw new HriqError("HRIQ-1503");
      await database.appUser.upsert({
        where: { email },
        create: {
          supabaseUserId: userId,
          email,
          displayName: fullName,
          profilePicture: logoUrl,
          isActive: true,
        },
        update: { displayName: fullName, profilePicture: logoUrl },
      });
    }

    if (!userId) throw new HriqError("HRIQ-1503");
    const resolvedUserId: string = userId;

    // Wrap DB operations in a transaction for atomicity
    await database.$transaction(async (tx: any) => {
      await tx.approvedEmail.upsert({
        where: { email_organizationId: { email, organizationId: orgId } },
        create: {
          email,
          role: contractorRole(orgId),
          organizationId: orgId,
          addedByUserId: "system",
        },
        update: { role: contractorRole(orgId) },
      });

      // Also approve workEmail (e.g. RL Google Workspace) so Google SSO works
      const rlWorkEmail = employee.workEmail?.trim().toLowerCase();
      if (rlWorkEmail && rlWorkEmail !== email) {
        await tx.approvedEmail.upsert({
          where: { email_organizationId: { email: rlWorkEmail, organizationId: orgId } },
          create: {
            email: rlWorkEmail,
            role: contractorRole(orgId),
            organizationId: orgId,
            addedByUserId: "system",
          },
          update: { role: contractorRole(orgId) },
        });
      }

      await tx.organizationMember.upsert({
        where: { userId_organizationId: { userId: resolvedUserId, organizationId: orgId } },
        create: {
          userId: resolvedUserId,
          organizationId: orgId,
          role: contractorRole(orgId),
        },
        update: { role: contractorRole(orgId) },
      });

      await tx.employee.update({
        where: { id: employee.id },
        data: {
          linkedUserId: resolvedUserId,
          username,
          ...(employee.photoUrl ? {} : { photoUrl: logoUrl }),
        },
      });
    });

    // Set user metadata (external API — outside transaction)
    await supabaseAdmin.auth.admin.updateUserById(resolvedUserId, {
      user_metadata: {
        activeOrganizationId: orgId,
        name: fullName,
        role: contractorRole(orgId),

        avatar_url: logoUrl,
        isFirstLogin: true,
        canChangePassword: true,
      },
    });

    return { alreadyProvisioned: false, email, userId: resolvedUserId, username };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[contractor-dashboard.ts:provisionContractorDashboardSystem]", _msg);
    return { error: _msg };
  }
}

/**
 * System-level dashboard invite email for webhooks/crons.
 * Does NOT require an authenticated session.
 */
export async function sendDashboardInviteEmailSystem(employeeId: string) {
  try {
    const provisionResult = await provisionContractorDashboardSystem(employeeId);

    // If already provisioned, reset password back to default so the email credentials are valid
    if ((provisionResult as any).alreadyProvisioned) {
      const supabaseAdmin = getSupabaseAdmin();
      const emp = await database.employee.findFirst({
        where: { id: employeeId },
        select: { linkedUserId: true },
      });
      if (emp?.linkedUserId) {
        const { data: { user: existingUser } } = await supabaseAdmin.auth.admin.getUserById(emp.linkedUserId);
        await supabaseAdmin.auth.admin.updateUserById(emp.linkedUserId, {
          password: DEFAULT_PASSWORD,
          user_metadata: {
            ...(existingUser?.user_metadata ?? {}),
            isFirstLogin: true,
            passwordChanged: false,
          },
        });
      }
    }

    const employee = await database.employee.findUnique({
      where: { id: employeeId },
      select: {
        legalFirstName: true,
        legalLastName: true,
        preferredName: true,
        personalEmail: true,
        workEmail: true,
        username: true,
        startDate: true,
        hourlyRate: true,
        currency: true,
        timeDoctorEmail: true,
        organizationId: true,
        organization: { select: { name: true } },
      },
    });

    if (!employee) throw new HriqError("HRIQ-0201");

    const email = (getContractorEmail(employee))?.trim();
    if (!email) throw new HriqError("HRIQ-0207");

    const name = employee.preferredName ?? employee.legalFirstName;
    const appUrl = normalizeAppUrl(APP_URL);

    const { sendViaGmailSystem } = await import("@/app/actions/hriq/send-email");

    const creds = {
      email,
      password: DEFAULT_PASSWORD,
      username: employee.username || undefined,
      loginUrl: `${appUrl}/sign-in`,
    };

    const isRL = employee.organizationId === RL_ORG_ID;

    if (isRL) {
      // RL internal contractors — credentials email (same template as session-based version)
      const { layout, heading, greeting, paragraph, credentialsBox, primaryButton, highlightBox } = await import("@/app/actions/hriq/email-templates");
      const { buildEmail } = await import("./email-template-engine");
      const orgName = "Remote Leverage";
      const fallbackHtml = layout(
        heading("Your Dashboard Credentials") +
        greeting(name) +
        paragraph(`Your contractor dashboard for <strong>${orgName}</strong> is ready. Use the credentials below to log in and manage your timesheets, payments, documents, and more.`) +
        credentialsBox(creds.email, creds.password, creds.username, creds.loginUrl) +
        primaryButton("Login to My Dashboard", creds.loginUrl) +
        highlightBox("yellow", "<strong>Security Notice:</strong> You will be required to change your password on your first login. Do not share your login credentials with anyone."),
        "If you have trouble signing in, contact your coordinator for assistance."
      );
      const rendered = await buildEmail("dashboard_credentials", {
        name, org_name: orgName, email: creds.email, password: creds.password,
        username: creds.username ?? creds.email, login_url: creds.loginUrl,
      }, fallbackHtml, `Your Dashboard Credentials — ${orgName}`);
      try {
        await sendViaGmailSystem(email, rendered.subject, rendered.html);
      } catch (emailErr) {
        console.error("[HRIQ] Email send failed (non-blocking):", emailErr);
      }
    } else {
      // Non-RL contractors — credentials-only email (no TD/docs/payment repeat)
      const orgName = employee.organization?.name ?? "your organization";
      const { clientDashboardCredentialsEmail } = await import("@/app/actions/hriq/email-templates");
      const { buildEmail } = await import("./email-template-engine");
      const fallbackHtml = clientDashboardCredentialsEmail(name, orgName, creds);
      const rendered = await buildEmail("client_dashboard_credentials", {
        name, org_name: orgName,
        login_url: creds.loginUrl, username: creds.username ?? creds.email, password: creds.password,
      }, fallbackHtml, `Your ${orgName} Dashboard is Ready`);
      try {
        await sendViaGmailSystem(email, rendered.subject, rendered.html);
      } catch (emailErr) {
        console.error("[HRIQ] Email send failed (non-blocking):", emailErr);
      }
    }

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[contractor-dashboard.ts:sendDashboardInviteEmailSystem]", _msg);
    return { error: _msg };
  }
}
