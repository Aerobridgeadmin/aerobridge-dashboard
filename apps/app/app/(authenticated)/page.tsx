import { createClient } from "@repo/auth/server";
import { database } from "@repo/database";
import Image from "next/image";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Header } from "./components/header";

export const metadata: Metadata = {
  title: "Remote Leverage",
  description: "Manage your global workforce with Remote Leverage.",
};

const App = async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  // Find user's org slug for redirect
  const activeOrgId = user.user_metadata?.activeOrganizationId as string | undefined;

  let orgSlug: string | null = null;

  if (activeOrgId) {
    // Validate both org existence AND user membership to prevent stale redirects
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
  }

  // If no valid active org, find user's first membership
  if (!orgSlug) {
    const membership = await database.organizationMember.findFirst({
      where: { userId: user.id },
      include: { organization: { select: { slug: true } } },
      orderBy: { createdAt: "asc" },
    });
    orgSlug = membership?.organization?.slug ?? null;
  }

  if (orgSlug) {
    redirect(`/${orgSlug}`);
  }

  return (
    <>
      <Header page="Welcome" pages={["Remote Leverage"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="flex flex-1 items-center justify-center rounded-xl bg-muted/50">
          <div className="text-center">
            <Image src="/logo.png" alt="Remote Leverage" width={64} height={64} className="mx-auto mb-4 h-16 w-16" />
            <h2 className="text-2xl font-bold">Welcome to Remote Leverage</h2>
            <p className="mt-2 text-muted-foreground">
              Your account does not have an organization yet. Please contact
              your administrator to get started.
            </p>
          </div>
        </div>
      </div>
    </>
  );
};

export default App;
