import { requireSession } from "@repo/auth/session";
import { createClient } from "@repo/auth/server";
import { database } from "@repo/database";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { OrgProvider } from "./org-context";

type Props = {
  readonly children?: ReactNode;
  readonly params: Promise<{ orgSlug: string }>;
};

export default async function OrgLayout({ children, params }: Props) {
  let session;
  try {
    session = await requireSession();
  } catch {
    redirect("/sign-in");
  }

  const { orgSlug } = await params;

  // Resolve slug  org
  const org = await database.organization.findFirst({
    where: { slug: orgSlug },
    select: { id: true, slug: true },
  });

  if (!org) notFound();

  // Check membership
  const membership = await database.organizationMember.findFirst({
    where: { userId: session.userId, organizationId: org.id },
    select: { role: true },
  });

  if (!membership) {
    // Super admins can access any org
    const isSuperAdmin = await database.organizationMember.findFirst({
      where: { userId: session.userId, role: "super_admin" },
      select: { id: true },
    });
    if (!isSuperAdmin) redirect("/");
  }

  // Sync activeOrganizationId so requireOrg() works in server actions
  // Non-blocking — don't let auth sync failures break page navigation
  if (session.orgId !== org.id) {
    try {
      const supabase = await createClient();
      await supabase.auth.updateUser({ data: { activeOrganizationId: org.id } });
    } catch (e) {
      console.error("[OrgLayout] Failed to sync activeOrganizationId:", e);
    }
  }

  return <OrgProvider slug={org.slug}>{children}</OrgProvider>;
}
