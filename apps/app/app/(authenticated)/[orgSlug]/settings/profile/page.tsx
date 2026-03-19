import { requireOrg } from "@repo/auth/session";
import { database } from "@repo/database";
import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "../../../components/header";
import { ChangePassword } from "../../../components/change-password";

export const metadata: Metadata = { title: "Profile Settings" };

const ProfileSettingsPage = async ({ params }: { params: Promise<{ orgSlug: string }> }) => {
  const { orgSlug } = await params;
  const session = await requireOrg();

  const linkedEmployee = await database.employee.findFirst({
    where: { linkedUserId: session.userId, ...(session.orgId ? { organizationId: session.orgId } : {}) },
    select: { username: true },
  });
  const currentUsername = linkedEmployee?.username ?? null;

  return (
    <>
      <Header page="Profile" pages={[session.orgRole === "super_admin" ? "RL Internal" : "Client Portal", "Settings"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="max-w-2xl space-y-4">
          <div className="rounded-xl border bg-card p-6">
            <h2 className="text-lg font-semibold">Your Profile</h2>
            <div className="mt-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Name</span>
                <span>{session.name ?? "—"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Email</span>
                <span>{session.email}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Role</span>
                <span className="capitalize">{session.orgRole.replace(/_/g, " ")}</span>
              </div>
            </div>
          </div>

          <ChangePassword currentUsername={currentUsername} />

          <div className="rounded-xl border bg-card p-6">
            <h3 className="font-semibold">Need to update account details?</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Team and organization-level updates are managed in settings.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-sm">
              <Link href={`/${orgSlug}/settings`} className="rounded-md border px-3 py-1.5 hover:bg-accent">
                Organization settings
              </Link>
              <Link href={`/${orgSlug}/settings/team`} className="rounded-md border px-3 py-1.5 hover:bg-accent">
                Team settings
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default ProfileSettingsPage;
