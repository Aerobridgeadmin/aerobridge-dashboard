"use client";

import { inviteTeamMember, revokeInvitation } from "@/app/actions/hriq/invitations";
import type { OrganizationMember, OrganizationInvitation } from "@repo/database";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin", admin: "Admin", manager: "Manager",
  bookkeeper: "Bookkeeper", va: "VA", member: "Member", owner: "Owner",
};

export function TeamSettings({
  members,
  invitations,
}: {
  members: OrganizationMember[];
  invitations: OrganizationInvitation[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showInvite, setShowInvite] = useState(false);

  const handleInvite = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await inviteTeamMember({
        email: fd.get("email") as string,
        role: fd.get("role") as string,
        name: fd.get("name") as string,
      });
      setShowInvite(false);
      router.refresh();
    });
  };

  const handleRevoke = (id: string) => {
    startTransition(async () => {
      await revokeInvitation(id);
      router.refresh();
    });
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Team Members ({members.length})</h2>
        <button type="button" onClick={() => setShowInvite(true)} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          + Invite Member
        </button>
      </div>

      <div className="space-y-2">
        {members.map((m) => (
          <div key={m.id} className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <span className="text-sm font-mono">{m.userId}</span>
              <span className="ml-3 rounded bg-muted px-2 py-0.5 text-xs capitalize">{ROLE_LABELS[m.role] ?? m.role}</span>
            </div>
            <span className="text-xs text-muted-foreground">Joined {new Date(m.createdAt).toLocaleDateString()}</span>
          </div>
        ))}
      </div>

      {invitations.length > 0 && (
        <div>
          <h3 className="text-base font-semibold">Pending Invitations ({invitations.length})</h3>
          <div className="mt-2 space-y-2">
            {invitations.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between rounded-lg border border-dashed p-3">
                <div>
                  <span className="text-sm">{inv.email}</span>
                  <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs capitalize">{inv.role}</span>
                  <span className="ml-2 text-xs text-muted-foreground">Expires {new Date(inv.expiresAt).toLocaleDateString()}</span>
                </div>
                <button type="button" onClick={() => handleRevoke(inv.id)} disabled={isPending} className="text-xs text-red-600 hover:underline disabled:opacity-50">Revoke</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl border bg-background p-6 shadow-lg">
            <h2 className="text-lg font-semibold">Invite Team Member</h2>
            <form onSubmit={handleInvite} className="mt-4 space-y-4">
              <div>
                <label className="text-sm font-medium">Email *</label>
                <input name="email" type="email" required className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium">Name</label>
                <input name="name" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium">Role *</label>
                <select name="role" required className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="admin">Admin</option>
                  <option value="manager">Manager</option>
                  <option value="bookkeeper">Bookkeeper</option>
                  <option value="va">VA</option>
                  <option value="member">Member</option>
                </select>
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowInvite(false)} className="h-10 rounded-md border px-4 text-sm">Cancel</button>
                <button type="submit" disabled={isPending} className="h-10 rounded-md bg-primary px-4 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                  {isPending ? "Inviting..." : "Send Invitation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
