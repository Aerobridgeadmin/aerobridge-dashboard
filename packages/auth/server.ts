import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { database } from "@repo/database";

export const createClient = async () => {
  const cookieStore = await cookies();

  return createServerClient(
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
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  );
};

export const currentUser = async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) return user;

  const devEntryEnabled =
    process.env.NODE_ENV !== "production" &&
    (process.env.DEV_ENTRY_ENABLED === "true" ||
      process.env.NEXT_PUBLIC_DEV_ENTRY_ENABLED === "true" ||
      !!process.env.DEV_ENTRY_USER_ID);
  if (!devEntryEnabled) return null;

  const envUserId = process.env.DEV_ENTRY_USER_ID?.trim();
  const fallbackSuperAdmin = await database.organizationMember.findFirst({
    where: { role: "super_admin" },
    select: { userId: true, organizationId: true },
    orderBy: { createdAt: "asc" },
  });
  const chosenUserId = envUserId ?? fallbackSuperAdmin?.userId ?? null;
  if (!chosenUserId) return null;
  const chosenOrgId = process.env.DEV_ENTRY_ORG_ID?.trim() ?? fallbackSuperAdmin?.organizationId ?? null;

  return {
    id: chosenUserId,
    email: process.env.DEV_ENTRY_EMAIL ?? "dev-entry@local.test",
    user_metadata: {
      activeOrganizationId: chosenOrgId,
      name: process.env.DEV_ENTRY_NAME ?? "Dev Entry",
    },
  } as any;
};

export const auth = async () => {
  const user = await currentUser();

  if (!user) {
    return { userId: null, orgId: null, redirectToSignIn: () => null };
  }

  const orgId =
    (user.user_metadata?.activeOrganizationId as string | null) ?? null;

  return {
    userId: user.id,
    orgId,
    redirectToSignIn: () => null,
  };
};
