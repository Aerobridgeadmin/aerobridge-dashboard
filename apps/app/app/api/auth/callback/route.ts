import { createServerClient } from "@supabase/ssr";
import { database } from "@repo/database";
import { JotFormService, isJotFormConfigured } from "@repo/integrations/jotform";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

async function autoLinkOrganization(userId: string, email: string) {
  const existing = await database.organizationMember.findFirst({
    where: { userId },
  });

  if (existing) return existing.organizationId;

  const approved = await database.approvedEmail.findFirst({
    where: { email: { equals: email, mode: "insensitive" }, organizationId: { not: null } },
  });

  if (approved?.organizationId) {
    await database.organizationMember.create({
      data: {
        userId,
        organizationId: approved.organizationId,
        role: approved.role,
      },
    });
    return approved.organizationId;
  }

  const invitation = await database.organizationInvitation.findFirst({
    where: {
      email: { equals: email, mode: "insensitive" },
      acceptedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (invitation) {
    await database.organizationMember.create({
      data: {
        userId,
        organizationId: invitation.organizationId,
        role: invitation.role,
      },
    });
    await database.organizationInvitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    });
    return invitation.organizationId;
  }

  return null;
}

async function autoLinkEmployeeRecord(userId: string, email: string, orgId: string | null) {
  try {
    // Already linked to this exact user? Nothing to do.
    const alreadyLinked = await database.employee.findFirst({
      where: { linkedUserId: userId },
      select: { id: true },
    });
    if (alreadyLinked) return;

    const normalizedEmail = email.toLowerCase().trim();

    // Search by work_email or personal_email — do NOT require linkedUserId: null
    // because contractors are provisioned with personal email (password account)
    // then later sign in with Google SSO (@remoteleverage.com) which creates a
    // different Supabase user. We need to re-link in that case.
    const whereBase = orgId ? { organizationId: orgId } : {};
    const employee = await database.employee.findFirst({
      where: {
        ...whereBase,
        OR: [
          { workEmail: { equals: normalizedEmail, mode: "insensitive" as const } },
          { personalEmail: { equals: normalizedEmail, mode: "insensitive" as const } },
        ],
      },
      select: { id: true, linkedUserId: true, organizationId: true },
    });

    if (employee) {
      const oldUserId = employee.linkedUserId;

      // Update employee to point to the new (Google SSO) user
      await database.employee.update({
        where: { id: employee.id },
        data: { linkedUserId: userId },
      });

      // If there was a previous linked user (old provisioned account),
      // transfer their org memberships to the new user so roles carry over
      if (oldUserId && oldUserId !== userId) {
        const oldMemberships = await database.organizationMember.findMany({
          where: { userId: oldUserId },
          select: { organizationId: true, role: true },
        });

        for (const mem of oldMemberships) {
          await database.organizationMember.upsert({
            where: { userId_organizationId: { userId, organizationId: mem.organizationId } },
            create: {
              userId,
              organizationId: mem.organizationId,
              role: mem.role,
            },
            update: { role: mem.role },
          });
        }
        console.info(`[Auth] Re-linked employee ${employee.id}: transferred from user ${oldUserId} → ${userId} (${normalizedEmail})`);
      } else {
        console.info(`[Auth] Linked employee ${employee.id} → user ${userId} (${normalizedEmail})`);
      }
    }
  } catch (err) {
    console.error("[Auth] Auto-link employee record failed:", err);
  }
}

function extractJotFormId(formUrl?: string | null): string | null {
  if (!formUrl) return null;
  const m = formUrl.match(/form\.jotform\.com\/(\d+)/i);
  return m?.[1] ?? null;
}

async function runLoginBootstrapSync(orgId: string, userId: string) {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  const recentSync = await database.auditLog.findFirst({
    where: {
      organizationId: orgId,
      actorUserId: userId,
      action: "auth.login_sync",
      timestamp: { gte: tenMinutesAgo },
    },
    select: { id: true },
  });
  if (recentSync) return;

  let jotformStepsCompleted = 0;
  let onboardingSessionsTouched = 0;

  // Sync JotForm signature/completion progress to onboarding steps
  if (isJotFormConfigured()) {
    const sessions = await database.onboardingSession.findMany({
      where: {
        employee: { organizationId: orgId },
        status: { in: ["in_progress", "scheduled"] },
      },
      include: {
        employee: { select: { id: true, personalEmail: true, workEmail: true } },
        steps: { where: { stepType: "jotform" }, orderBy: { sortOrder: "asc" } },
      },
      take: 100,
    });

    for (const session of sessions) {
      const emailsToCheck = [session.employee.personalEmail, session.employee.workEmail].filter(
        (e): e is string => !!e
      );
      if (emailsToCheck.length === 0 || session.steps.length === 0) continue;

      let sessionChanged = false;
      for (const step of session.steps) {
        if (step.status === "completed") continue;
        const formId = extractJotFormId(step.formUrl);
        if (!formId) continue;
        try {
          let submission: Record<string, unknown> | null = null;
          for (const email of emailsToCheck) {
            submission = await JotFormService.checkSubmissionByEmail(formId, email);
            if (submission) break;
          }
          if (submission) {
            await database.onboardingStep.update({
              where: { id: step.id },
              data: {
                status: "completed",
                formSubmissionId: String((submission as { id?: string }).id ?? ""),
                completedAt: new Date(),
                notes: `Auto-completed from JotForm submission sync (${emailsToCheck.join(", ")})`,
              },
            });
            jotformStepsCompleted += 1;
            sessionChanged = true;
          }
        } catch (err) {
          console.warn("[Callback] JotForm step check failed:", err);
        }
      }

      if (sessionChanged) {
        onboardingSessionsTouched += 1;
        // Use shared progress helper (also handles dashboard provisioning if complete)
        const { recomputeSessionProgress } = await import("@/lib/hriq/utils");
        await recomputeSessionProgress(session.id);

        // Check if jotforms are all done for session-level flag
        const updatedJotformSteps = await database.onboardingStep.findMany({
          where: { sessionId: session.id, stepType: "jotform" },
          select: { status: true },
        });
        const jotformCompleted = updatedJotformSteps.length > 0 && updatedJotformSteps.every((s: any) => s.status === "completed");
        if (jotformCompleted) {
          await database.onboardingSession.update({
            where: { id: session.id },
            data: {
              jotformsCompleted: true,
              jotformsCompletedAt: new Date(),
            },
          });
        }
      }
    }
  }

  await database.auditLog.create({
    data: {
      organizationId: orgId,
      actorType: "user",
      actorUserId: userId,
      action: "auth.login_sync",
      objectType: "organization",
      objectId: orgId,
      newValue: { jotformStepsCompleted, onboardingSessionsTouched },
    },
  });
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next") ?? "/";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  if (code) {
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
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        //  PRODUCTION GATE: Only approved emails can sign in via OAuth 
        const userEmail = (user.email ?? "").toLowerCase().trim();
        const isApproved = await database.approvedEmail.findFirst({
          where: { email: { equals: userEmail, mode: "insensitive" } },
        });
        const hasInvitation = !isApproved
          ? await database.organizationInvitation.findFirst({
              where: {
                email: { equals: userEmail, mode: "insensitive" },
                acceptedAt: null,
                expiresAt: { gt: new Date() },
              },
            })
          : null;
        const existingMember = !isApproved && !hasInvitation
          ? await database.organizationMember.findFirst({
              where: { userId: user.id },
            })
          : null;

        //  RL WORKSPACE FALLBACK: Match @remoteleverage.com Google users by name 
        // Contractors are provisioned with their personalEmail but sign in via their
        // RL Google Workspace account. If the domain matches, find them by name and
        // link the Google identity to their existing provisioned account.
        const RL_ORG_ID = process.env.RL_ORGANIZATION_ID ?? "org_rl_001";
        const RL_DOMAIN = process.env.RL_WORKSPACE_DOMAIN ?? "remoteleverage.com";
        let workspaceEmployee: { id: string; linkedUserId: string | null; organizationId: string | null } | null = null;

        if (!isApproved && !hasInvitation && !existingMember) {
          const emailDomain = userEmail.split("@")[1];
          if (emailDomain === RL_DOMAIN) {
            // Get the full name from Google profile (used by both workEmail match and name match)
            const googleName = (
              user.user_metadata?.full_name ??
              user.user_metadata?.name ??
              ""
            ).trim();

            // Priority 1: Match by workEmail (most reliable)
            workspaceEmployee = await database.employee.findFirst({
              where: {
                organizationId: RL_ORG_ID,
                workEmail: { equals: userEmail, mode: "insensitive" },
              },
              select: { id: true, linkedUserId: true, organizationId: true },
            });

            // Priority 2: Match by name from Google profile
            if (!workspaceEmployee) {
            const nameParts = googleName.split(/\s+/);
            const firstName = nameParts[0] ?? "";
            const lastName = nameParts.slice(1).join(" ") ?? "";

            if (firstName && lastName) {
              // Try exact first + last name match within RL org
              workspaceEmployee = await database.employee.findFirst({
                where: {
                  organizationId: RL_ORG_ID,
                  legalFirstName: { equals: firstName, mode: "insensitive" },
                  legalLastName: { equals: lastName, mode: "insensitive" },
                },
                select: { id: true, linkedUserId: true, organizationId: true },
              });

              // Fallback: try preferred name + last name
              if (!workspaceEmployee) {
                workspaceEmployee = await database.employee.findFirst({
                  where: {
                    organizationId: RL_ORG_ID,
                    preferredName: { equals: firstName, mode: "insensitive" },
                    legalLastName: { equals: lastName, mode: "insensitive" },
                  },
                  select: { id: true, linkedUserId: true, organizationId: true },
                });
              }
            }
            } // end priority 2 name match

            if (workspaceEmployee) {
              console.info(`[Auth] RL Workspace match: ${userEmail} → employee ${workspaceEmployee.id}`);

              try {
                // Add work email as approved for this + future logins
                await database.approvedEmail.upsert({
                  where: { email_organizationId: { email: userEmail, organizationId: RL_ORG_ID } },
                  create: { email: userEmail, role: "member", organizationId: RL_ORG_ID, addedByUserId: "system" },
                  update: {},
                });
                // Save work email on the employee record
                await database.employee.update({
                  where: { id: workspaceEmployee.id },
                  data: { workEmail: userEmail },
                });

                if (workspaceEmployee.linkedUserId && workspaceEmployee.linkedUserId !== user.id) {
                  // Employee already provisioned with a different account (personal email).
                  // Transfer everything to the Google user so this login just works.
                  const oldUserId = workspaceEmployee.linkedUserId;

                  // Copy org membership from old account to new Google account
                  const oldMembership = await database.organizationMember.findFirst({
                    where: { userId: oldUserId, organizationId: RL_ORG_ID },
                    select: { role: true },
                  });
                  await database.organizationMember.upsert({
                    where: { userId_organizationId: { userId: user.id, organizationId: RL_ORG_ID } },
                    create: { userId: user.id, organizationId: RL_ORG_ID, role: oldMembership?.role ?? "member" },
                    update: { role: oldMembership?.role ?? "member" },
                  });

                  // Point the employee record to the Google user
                  await database.employee.update({
                    where: { id: workspaceEmployee.id },
                    data: { linkedUserId: user.id },
                  });

                  // Create/update AppUser for the Google account
                  await database.appUser.upsert({
                    where: { supabaseUserId: user.id },
                    create: {
                      supabaseUserId: user.id,
                      email: userEmail,
                      displayName: googleName,
                      profilePicture: user.user_metadata?.avatar_url ?? null,
                      isActive: true,
                    },
                    update: {
                      displayName: googleName,
                      profilePicture: user.user_metadata?.avatar_url ?? undefined,
                    },
                  });

                  // Deactivate the old provisioned Supabase user to prevent orphaned logins
                  try {
                    const { createClient: createAdminClient } = await import("@supabase/supabase-js");
                    const adminUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
                    const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
                    if (adminUrl && adminKey) {
                      const supabaseAdmin = createAdminClient(adminUrl, adminKey);
                      await supabaseAdmin.auth.admin.updateUserById(oldUserId, {
                        ban_duration: "876600h", // ~100 years
                        user_metadata: { deactivated: true, deactivatedReason: "workspace_transfer", transferredTo: user.id },
                      });
                    }
                  } catch (banErr) {
                    console.error("[Auth] Failed to deactivate old user after workspace transfer:", banErr);
                  }

                  // Deactivate the old AppUser record
                  await database.appUser.updateMany({
                    where: { supabaseUserId: oldUserId },
                    data: { isActive: false },
                  });

                  console.info(`[Auth] Transferred employee ${workspaceEmployee.id} from user ${oldUserId} to Google user ${user.id}`);

                  // Set password + email identity on the Google account so username+password login still works
                  try {
                    const { createClient: createAdminClient2 } = await import("@supabase/supabase-js");
                    const { DEFAULT_PASSWORD } = await import("@/app/actions/hriq/constants");
                    const adminUrl2 = process.env.NEXT_PUBLIC_SUPABASE_URL;
                    const adminKey2 = process.env.SUPABASE_SERVICE_ROLE_KEY;
                    if (adminUrl2 && adminKey2) {
                      const supabaseAdmin2 = createAdminClient2(adminUrl2, adminKey2);
                      await supabaseAdmin2.auth.admin.updateUserById(user.id, {
                        password: DEFAULT_PASSWORD,
                        user_metadata: { ...user.user_metadata, isFirstLogin: true, passwordChanged: false },
                      });
                      // Add email identity if missing
                      await database.$executeRawUnsafe(`
                        INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
                        VALUES (gen_random_uuid(), $1::uuid, jsonb_build_object('sub', $1, 'email', $2, 'email_verified', true), 'email', $1, now(), now(), now())
                        ON CONFLICT DO NOTHING
                      `, user.id, userEmail);
                      await database.$executeRawUnsafe(`
                        UPDATE auth.users SET raw_app_meta_data = jsonb_set(raw_app_meta_data, '{providers}', 
                          (SELECT jsonb_agg(DISTINCT val) FROM (SELECT jsonb_array_elements(raw_app_meta_data->'providers') AS val UNION SELECT '"email"'::jsonb) sub)
                        ) WHERE id = $1::uuid
                      `, user.id);
                    }
                  } catch (pwErr) {
                    console.warn("[Auth] Failed to set password on transferred Google account:", pwErr);
                  }
                } else if (!workspaceEmployee.linkedUserId) {
                  // Employee exists but no login yet — link directly to Google user
                  await database.employee.update({
                    where: { id: workspaceEmployee.id },
                    data: { linkedUserId: user.id },
                  });
                  // Ensure org membership exists
                  await database.organizationMember.upsert({
                    where: { userId_organizationId: { userId: user.id, organizationId: RL_ORG_ID } },
                    create: { userId: user.id, organizationId: RL_ORG_ID, role: "member" },
                    update: {},
                  });
                  console.info(`[Auth] Linked unprovisioned employee ${workspaceEmployee.id} to Google user ${user.id}`);

                  // Set password + email identity so username+password login works too
                  try {
                    const { createClient: createAdminClient3 } = await import("@supabase/supabase-js");
                    const { DEFAULT_PASSWORD: defaultPw } = await import("@/app/actions/hriq/constants");
                    const adminUrl3 = process.env.NEXT_PUBLIC_SUPABASE_URL;
                    const adminKey3 = process.env.SUPABASE_SERVICE_ROLE_KEY;
                    if (adminUrl3 && adminKey3) {
                      const supabaseAdmin3 = createAdminClient3(adminUrl3, adminKey3);
                      await supabaseAdmin3.auth.admin.updateUserById(user.id, {
                        password: defaultPw,
                        user_metadata: { ...user.user_metadata, isFirstLogin: true, passwordChanged: false },
                      });
                      await database.$executeRawUnsafe(`
                        INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
                        VALUES (gen_random_uuid(), $1::uuid, jsonb_build_object('sub', $1, 'email', $2, 'email_verified', true), 'email', $1, now(), now(), now())
                        ON CONFLICT DO NOTHING
                      `, user.id, userEmail);
                      await database.$executeRawUnsafe(`
                        UPDATE auth.users SET raw_app_meta_data = jsonb_set(raw_app_meta_data, '{providers}', 
                          (SELECT jsonb_agg(DISTINCT val) FROM (SELECT jsonb_array_elements(raw_app_meta_data->'providers') AS val UNION SELECT '"email"'::jsonb) sub)
                        ) WHERE id = $1::uuid
                      `, user.id);
                    }
                  } catch (pwErr2) {
                    console.warn("[Auth] Failed to set password on newly linked Google account:", pwErr2);
                  }
                }
                // else: linkedUserId === user.id — already linked to this Google user, nothing to do
              } catch (wsErr) {
                console.error("[Auth] Workspace fallback failed:", wsErr);
                // Don't block login — the approvedEmail might have been created,
                // so let downstream auth checks handle it
              }
            }
          }
        }

        if (!isApproved && !hasInvitation && !existingMember && !workspaceEmployee) {
          // Unauthorized email — sign out and clean up
          console.warn(`[Auth] Blocked unauthorized OAuth login: ${userEmail}`);
          await supabase.auth.signOut();
          // Delete the auto-created Supabase auth user to prevent account accumulation
          try {
            const { createClient: createAdminClient } = await import("@supabase/supabase-js");
            const adminUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
            const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
            if (adminUrl && adminKey) {
              const supabaseAdmin = createAdminClient(adminUrl, adminKey);
              await supabaseAdmin.auth.admin.deleteUser(user.id);
            }
          } catch (cleanupErr) {
            console.error("[Auth] Failed to clean up unauthorized user:", cleanupErr);
          }
          return NextResponse.redirect(
            `${origin}/sign-in?error=unauthorized_email`
          );
        }

        //  SSO ORG GATE: Only Remote Leverage members can use Google SSO 
        const membershipForSso = existingMember ?? await database.organizationMember.findFirst({
          where: { userId: user.id },
          select: { role: true, organizationId: true },
        });
        const approvedOrgId = isApproved?.organizationId ?? hasInvitation?.organizationId ?? workspaceEmployee?.organizationId ?? (membershipForSso as any)?.organizationId ?? null;
        const isRlMember = approvedOrgId === RL_ORG_ID;

        // Also check if user has ANY membership in RL (covers multi-org users)
        const rlMembership = !isRlMember
          ? await database.organizationMember.findFirst({
              where: { userId: user.id, organizationId: RL_ORG_ID },
              select: { id: true },
            })
          : null;

        if (!isRlMember && !rlMembership) {
          console.warn(`[Auth] Blocked non-RL SSO login: ${userEmail} (orgId: ${approvedOrgId})`);
          await supabase.auth.signOut();
          return NextResponse.redirect(
            `${origin}/sign-in?error=sso_not_allowed`
          );
        }
        //  END SSO ORG GATE 

        try {
          // Track login in app_users
          const appUser = await database.appUser.upsert({
            where: { supabaseUserId: user.id },
            create: {
              supabaseUserId: user.id,
              email: user.email ?? "",
              displayName: user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
              profilePicture: user.user_metadata?.avatar_url ?? null,
              lastLoginAt: new Date(),
              loginCount: 1,
            },
            update: {
              lastLoginAt: new Date(),
              loginCount: { increment: 1 },
              displayName: user.user_metadata?.full_name ?? user.user_metadata?.name ?? undefined,
              profilePicture: user.user_metadata?.avatar_url ?? undefined,
            },
          });

          const isFirstLogin = appUser.loginCount <= 1;

          const orgId = await autoLinkOrganization(
            user.id,
            user.email ?? ""
          );
          if (orgId) {
            const mem = await database.organizationMember.findFirst({ where: { userId: user.id, organizationId: orgId } });
            await supabase.auth.updateUser({
              data: {
                activeOrganizationId: orgId,
                role: mem?.role ?? "member",
                ...(isFirstLogin ? { isFirstLogin: true } : {}),
              },
            });
            // Await auto-link so the payment gate check in layout.tsx sees the linked employee on first login
            if (!workspaceEmployee) {
              try {
                await autoLinkEmployeeRecord(user.id, user.email ?? "", orgId);
              } catch (e) {
                console.error("Auto-link employee failed:", e);
              }
            }
            // Fire-and-forget: don't block the login redirect with JotForm sync
            runLoginBootstrapSync(orgId, user.id).catch((syncError) => {
              console.error("Login bootstrap sync failed:", syncError);
            });
          } else if (isFirstLogin) {
            await supabase.auth.updateUser({
              data: { isFirstLogin: true },
            });
          }
        } catch (e) {
          console.error("Auto-link org error:", e);
        }
      }

      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocalEnv = process.env.NODE_ENV === "development";

      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`);
      }
      if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }

    console.error("Auth callback error:", error.message);
  }

  return NextResponse.redirect(`${origin}/sign-in?error=auth_callback_error`);
}
