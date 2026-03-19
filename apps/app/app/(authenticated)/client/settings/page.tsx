import { requireOrg } from "@repo/auth/session";
import { database } from "@repo/database";
import type { Metadata } from "next";
import { Header } from "../../components/header";

export const metadata: Metadata = { title: "Organization Settings" };

const SettingsPage = async () => {
  const session = await requireOrg();

  const org = await database.organization.findUnique({
    where: { id: session.orgId },
    include: { _count: { select: { members: true, employees: true } } },
  });

  return (
    <>
      <Header page="Settings" pages={["Client Portal"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="max-w-2xl space-y-6">
          <div className="rounded-xl border bg-card p-6">
            <h2 className="text-lg font-semibold">Organization</h2>
            <div className="mt-4 space-y-3">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Name</span><span className="font-medium">{org?.name}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Slug</span><span className="font-mono text-xs">{org?.slug}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Members</span><span>{org?._count.members}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Contractors</span><span>{org?._count.employees}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Created</span><span>{org?.createdAt ? new Date(org.createdAt).toLocaleDateString() : "—"}</span></div>
            </div>
          </div>

          <div className="rounded-xl border bg-card p-6">
            <h2 className="text-lg font-semibold">Your Account</h2>
            <div className="mt-4 space-y-3">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Email</span><span>{session.email}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Role</span><span className="capitalize">{session.orgRole.replace(/_/g, " ")}</span></div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default SettingsPage;
