"use server";

import { requireSession } from "@repo/auth/session";
import { getSupabaseAdmin } from "./constants";
import { database } from "@repo/database";

/**
 * Server action to change the current user's password.
 * Works even when the browser client can't access the session cookie.
 */
export async function changeMyPassword(newPassword: string): Promise<{ ok: true } | { error: string }> {
  try {
    const session = await requireSession();

    if (!newPassword || newPassword.length < 8) {
      return { error: "Password must be at least 8 characters." };
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { error } = await supabaseAdmin.auth.admin.updateUserById(session.userId, {
      password: newPassword,
      user_metadata: {
        isFirstLogin: false,
        passwordChanged: true,
        canChangePassword: true,
      },
    });

    if (error) return { error: error.message };
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to change password" };
  }
}

/**
 * Set a password for a Google SSO user so they can also log in via username/password.
 * No current password required since they authenticated via Google.
 */
export async function setMyPassword(newPassword: string): Promise<{ ok: true } | { error: string }> {
  try {
    const session = await requireSession();

    if (!newPassword || newPassword.length < 8) {
      return { error: "Password must be at least 8 characters." };
    }
    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return { error: "Password must include uppercase, lowercase, and a number." };
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Add email provider so they can sign in with password too
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(session.userId);
    const providers: string[] = userData?.user?.app_metadata?.providers ?? [];
    if (!providers.includes("email")) {
      providers.push("email");
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(session.userId, {
      password: newPassword,
      app_metadata: { ...userData?.user?.app_metadata, providers },
      user_metadata: {
        ...userData?.user?.user_metadata,
        passwordChanged: true,
        canChangePassword: true,
      },
    });

    if (error) return { error: error.message };
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to set password" };
  }
}

/**
 * Change the current user's username. Updates both the employee record and auth metadata.
 * Username must be unique, 3-30 chars, alphanumeric/underscores/hyphens only.
 */
export async function changeMyUsername(newUsername: string): Promise<{ ok: true } | { error: string }> {
  try {
    const session = await requireSession();

    const trimmed = newUsername.trim().toLowerCase();
    if (trimmed.length < 3 || trimmed.length > 30) {
      return { error: "Username must be 3–30 characters." };
    }
    if (!/^[a-z0-9_-]+$/.test(trimmed)) {
      return { error: "Username can only contain letters, numbers, underscores, and hyphens." };
    }

    // Check uniqueness
    const existing = await database.employee.findFirst({
      where: { username: { equals: trimmed, mode: "insensitive" }, linkedUserId: { not: session.userId } },
      select: { id: true },
    });
    if (existing) {
      return { error: "That username is already taken." };
    }

    // Update employee record
    const employee = await database.employee.findFirst({
      where: { linkedUserId: session.userId, ...(session.orgId ? { organizationId: session.orgId } : {}) },
      select: { id: true },
    });
    if (employee) {
      await database.employee.update({
        where: { id: employee.id },
        data: { username: trimmed },
      });
    }

    // Also update auth user_metadata so resolve-username can find it
    const supabaseAdmin = getSupabaseAdmin();
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(session.userId);
    await supabaseAdmin.auth.admin.updateUserById(session.userId, {
      user_metadata: { ...userData?.user?.user_metadata, username: trimmed },
    });

    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update username" };
  }
}
