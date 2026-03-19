import { createClient } from "@repo/auth/server";
import { database } from "@repo/database";
import { redirect } from "next/navigation";

/**
 * Universal deep-link redirector for email links.
 *
 * Resolves the authenticated user's org slug and redirects to
 * /{orgSlug}/{path}. This avoids hardcoding org slugs in email templates.
 *
 * Example: /go/timesheets → /rl/timesheets (for RL contractors)
 */
export default async function GoRedirectPage({
  params,
}: {
  params: Promise<{ path: string[] }>;
}) {
  const { path } = await params;
  const targetPath = path.join("/");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/sign-in?next=/${targetPath}`);
  }

  // Try activeOrganizationId first
  let orgSlug: string | null = null;
  const activeOrgId = user.user_metadata?.activeOrganizationId as string | undefined;

  if (activeOrgId) {
    const org = await database.organization.findUnique({
      where: { id: activeOrgId },
      select: { slug: true },
    });
    if (org) orgSlug = org.slug;
  }

  // Fall back to first org membership
  if (!orgSlug) {
    const membership = await database.organizationMember.findFirst({
      where: { userId: user.id },
      include: { organization: { select: { slug: true } } },
      orderBy: { createdAt: "asc" },
    });
    orgSlug = membership?.organization?.slug ?? null;
  }

  if (orgSlug) {
    redirect(`/${orgSlug}/${targetPath}`);
  }

  // No org at all — send to root
  redirect("/");
}
