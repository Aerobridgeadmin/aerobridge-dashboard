import { getMyProfile, getMyClientAdminProfile } from "@/app/actions/hriq/contractor-self-service";
import { requireSession } from "@repo/auth/session";
import { database } from "@repo/database";
import type { Metadata } from "next";
import { Header } from "../components/header";
import { ProfileEditor } from "../components/profile-editor";
import { ClientAdminProfileEditor } from "../components/client-admin-profile-editor";
import { MyDocuments } from "../components/my-documents";
import { ChangePassword } from "../components/change-password";

export const metadata: Metadata = {
  title: "My Profile",
  description: "View and update your personal information",
};

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Client Admin",
  manager: "Manager",
  member: "Contractor",
  va: "Virtual Assistant",
};

export default async function SharedProfilePage() {
  const session = await requireSession();

  // Fetch username for the account security section
  const linkedEmployee = await database.employee.findFirst({
    where: { linkedUserId: session.userId, ...(session.orgId ? { organizationId: session.orgId } : {}) },
    select: { username: true },
  });
  const currentUsername = linkedEmployee?.username ?? null;

  let profile: Awaited<ReturnType<typeof getMyProfile>> | null = null;
  try {
    profile = await getMyProfile();
  } catch {
    // No employee record linked
  }

  if (!profile) {
    // No contractor record — check if this is a client admin and show rich editor
    if (session.orgRole === "admin" && session.orgId) {
      try {
        const { profile: adminProfile, appUser } = await getMyClientAdminProfile();
        return (
          <>
            <Header page="My Profile" pages={[]} />
            <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
              <ClientAdminProfileEditor
                adminName={adminProfile?.adminName ?? appUser?.displayName ?? null}
                adminEmail={adminProfile?.adminEmail ?? appUser?.email ?? null}
                adminPhone={adminProfile?.adminPhone ?? null}
                adminTitle={adminProfile?.adminTitle ?? null}
                country={adminProfile?.country ?? null}
                address={adminProfile?.address ?? null}
                orgName={adminProfile?.organization?.name ?? ""}
                orgLogoUrl={adminProfile?.organization ? null : null}
                role={session.orgRole}
              />
              <ChangePassword currentUsername={currentUsername} />
            </div>
          </>
        );
      } catch {
        // Fall through to basic view
      }
    }

    // Generic fallback for users with no profile at all
    const appUser = await database.appUser.findFirst({
      where: { supabaseUserId: session.userId },
      select: { displayName: true, email: true, profilePicture: true },
    });

    const initials = (appUser?.displayName ?? session.email ?? "?")
      .split(" ")
      .map((w: string) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();

    return (
      <>
        <Header page="My Profile" pages={[]} />
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <div className="rounded-xl border bg-card p-6">
            <div className="flex items-center gap-4 mb-6">
              {appUser?.profilePicture ? (
                <img
                  src={appUser.profilePicture}
                  alt={appUser.displayName ?? ""}
                  className="h-14 w-14 rounded-full object-cover"
                />
              ) : (
                <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center text-lg font-semibold text-muted-foreground">
                  {initials}
                </div>
              )}
              <div>
                <p className="font-semibold text-base">{appUser?.displayName ?? "—"}</p>
                <p className="text-sm text-muted-foreground">{appUser?.email ?? session.email}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{ROLE_LABELS[session.orgRole] ?? session.orgRole}</p>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Name</p>
                <p className="text-sm">{appUser?.displayName ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Email</p>
                <p className="text-sm">{appUser?.email ?? session.email}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Role</p>
                <p className="text-sm">{ROLE_LABELS[session.orgRole] ?? session.orgRole}</p>
              </div>
            </div>
          </div>
          <ChangePassword currentUsername={currentUsername} />
        </div>
      </>
    );
  }

  const employee = await database.employee.findFirst({
    where: { linkedUserId: session.userId, ...(session.orgId ? { organizationId: session.orgId } : {}) },
    select: { id: true },
  });

  const documents = employee
    ? await database.document.findMany({
        where: { employeeId: employee.id },
        orderBy: { createdAt: "desc" },
      })
    : [];

  return (
    <>
      <Header page="My Profile" pages={[]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <ProfileEditor profile={{...profile, bankExtraData: profile.bankExtraData as Record<string, string> | null}} role={session.orgRole} />
        <ChangePassword currentUsername={currentUsername} />
        <MyDocuments documents={documents} hasProfile={!!employee} />
      </div>
    </>
  );
}
