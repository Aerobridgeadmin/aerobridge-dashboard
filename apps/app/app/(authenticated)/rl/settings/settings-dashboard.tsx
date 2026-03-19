"use client";

import { inviteTeamMember } from "@/app/actions/hriq/invitations";
import { updateUserRole, deactivateUser, reactivateUser } from "@/app/actions/hriq/users";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin", admin: "Admin", manager: "Manager",
  bookkeeper: "Bookkeeper", va: "VA", member: "Member",
};
const ROLE_COLORS: Record<string, string> = {
  super_admin: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  admin: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  manager: "bg-green-100 text-green-800",
  bookkeeper: "bg-yellow-100 text-yellow-800",
  va: "bg-orange-100 text-orange-800",
  member: "bg-gray-100 text-gray-600",
};
const ROLES = ["super_admin", "admin", "manager", "bookkeeper", "va", "member"];

type Props = {
  session: { email: string; userId: string; role: string; name: string | null };
  stats: { orgCount: number; userCount: number; employeeCount: number; activeUsers: number; memberCount: number; pendingInvites: number };
  integrations: Record<string, boolean>;
  rlMembers: Array<{ id: string; userId: string; role: string; createdAt: Date }>;
  rlOrgId: string | null;
  allUsers: Array<{ id: string; supabaseUserId: string; email: string; displayName: string | null; isActive: boolean; loginCount: number; createdAt: Date }>;
};

export function SettingsDashboard({ session, stats, integrations, rlMembers, rlOrgId, allUsers }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [tab, setTab] = useState<"platform" | "team" | "integrations" | "account">("platform");
  const [showInvite, setShowInvite] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const handleRoleChange = (memberId: string, newRole: string) => {
    startTransition(async () => {
      await updateUserRole(memberId, newRole);
      router.refresh();
    });
  };

  const handleToggleActive = (userId: string, isActive: boolean) => {
    startTransition(async () => {
      if (isActive) await deactivateUser(userId);
      else await reactivateUser(userId);
      router.refresh();
    });
  };

  const handleInvite = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await inviteTeamMember({
          email: fd.get("email") as string,
          role: fd.get("role") as string,
          name: fd.get("name") as string,
        });
        setInviteError(null);
        setShowInvite(false);
        router.refresh();
      } catch (error) {
        setInviteError(error instanceof Error ? error.message : "Failed to send invite");
      }
    });
  };

  const userMap = new Map(allUsers.map((u) => [u.supabaseUserId, u]));

  const tabs = [
    { key: "platform" as const, label: "Platform" },
    { key: "team" as const, label: `RL Team (${rlMembers.length})` },
    { key: "integrations" as const, label: "Integrations" },
    { key: "account" as const, label: "My Account" },
  ];

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${tab === t.key ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Platform Tab */}
      {tab === "platform" && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border bg-card p-6">
            <h3 className="font-semibold">Platform Statistics</h3>
            <div className="mt-4 space-y-3">
              <StatRow label="Client Organizations" value={stats.orgCount} />
              <StatRow label="Total Contractors" value={stats.employeeCount} />
              <StatRow label="Registered Users" value={stats.userCount} />
              <StatRow label="Active Users" value={stats.activeUsers} />
              <StatRow label="Org Memberships" value={stats.memberCount} />
              <StatRow label="Pending Invitations" value={stats.pendingInvites} />
            </div>
          </div>
          <div className="space-y-4">
            <div className="rounded-xl border bg-card p-6">
              <h3 className="font-semibold">Quick Actions</h3>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Link href="/rl/organizations/new" className="rounded-lg border p-3 text-center text-sm hover:bg-muted/50 transition-colors">
                  <div className="text-lg">🏢</div>
                  <div className="mt-1 font-medium">Add Client</div>
                </Link>
                <Link href="/rl/hiring" className="rounded-lg border p-3 text-center text-sm hover:bg-muted/50 transition-colors">
                  <div className="text-lg">👤</div>
                  <div className="mt-1 font-medium">Hiring Pipeline</div>
                </Link>
                <Link href="/rl/settings/users" className="rounded-lg border p-3 text-center text-sm hover:bg-muted/50 transition-colors">
                  <div className="text-lg">👥</div>
                  <div className="mt-1 font-medium">All Users</div>
                </Link>
                <Link href="/rl/settings/security" className="rounded-lg border p-3 text-center text-sm hover:bg-muted/50 transition-colors">
                  <div className="text-lg">🔒</div>
                  <div className="mt-1 font-medium">Audit Log</div>
                </Link>
              </div>
            </div>
            <div className="rounded-xl border bg-card p-6">
              <h3 className="font-semibold">Environment</h3>
              <div className="mt-4 space-y-2">
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Node.js</span><span className="font-mono text-xs">{typeof process !== "undefined" ? "Active" : "N/A"}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Framework</span><span className="font-mono text-xs">Next.js 16</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Database</span><span className="font-mono text-xs">PostgreSQL (Supabase)</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Hosting</span><span className="font-mono text-xs">Vercel</span></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Team Tab */}
      {tab === "team" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Remote Leverage Team Members</h3>
            <button onClick={() => setShowInvite(true)} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              + Add Team Member
            </button>
          </div>

          <div className="rounded-xl border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left text-sm text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Member</th>
                    <th className="px-4 py-3 font-medium">Email</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Logins</th>
                    <th className="px-4 py-3 font-medium">Role</th>
                    <th className="px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rlMembers.map((m) => {
                    const user = userMap.get(m.userId);
                    return (
                      <tr key={m.id} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                              {(user?.displayName ?? user?.email ?? "?").charAt(0).toUpperCase()}
                            </div>
                            <span className="text-sm font-medium">{user?.displayName ?? "Unknown"}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm">{user?.email ?? m.userId.slice(0, 12) + "..."}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2 py-0.5 text-xs ${user?.isActive !== false ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-500"}`}>
                            {user?.isActive !== false ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">{user?.loginCount ?? 0}</td>
                        <td className="px-4 py-3">
                          <select
                            value={m.role}
                            onChange={(e) => handleRoleChange(m.id, e.target.value)}
                            disabled={isPending}
                            className={`h-7 rounded-md border-0 px-2 text-xs font-medium cursor-pointer disabled:opacity-50 ${ROLE_COLORS[m.role] ?? "bg-gray-100"}`}
                          >
                            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          {user && (
                            <button
                              onClick={() => handleToggleActive(user.id, user.isActive)}
                              disabled={isPending || m.userId === session.userId}
                              className={`h-7 rounded-md border px-2 text-xs font-medium disabled:opacity-30 ${user.isActive ? "text-red-600 hover:bg-red-50" : "text-green-600 hover:bg-green-50"}`}
                            >
                              {user.isActive ? "Deactivate" : "Reactivate"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {rlMembers.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No team members found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-lg bg-muted/50 p-4">
            <h4 className="text-sm font-medium">Role Permissions</h4>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              {[
                { role: "Super Admin", desc: "Full platform access across all orgs. Can manage users, settings, and all data." },
                { role: "Admin", desc: "Full access within their organization. Can manage contractors, payments, and settings." },
                { role: "Manager", desc: "Manage their team. Can view contractors, tasks, time off, and documents." },
                { role: "Bookkeeper", desc: "Financial access. Can view contractors, manage payments, expenses, and reports." },
                { role: "VA", desc: "Self-service portal. Can view own tasks, timesheets, documents, and payments." },
                { role: "Member", desc: "Basic access. Can view announcements and dashboard only." },
              ].map((r) => (
                <div key={r.role} className="rounded-lg border p-3">
                  <div className="text-sm font-medium">{r.role}</div>
                  <div className="text-xs text-muted-foreground">{r.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Integrations Tab */}
      {tab === "integrations" && (
        <div className="grid gap-4 md:grid-cols-2">
          {[
            { name: "Supabase", desc: "Authentication & file storage", key: "supabase", icon: "🔐" },
            { name: "Stripe", desc: "Payment processing", key: "stripe", icon: "💳" },
            { name: "Resend", desc: "Transactional email", key: "resend", icon: "📧" },
            { name: "Zoom", desc: "Video meetings for onboarding", key: "zoom", icon: "📹" },
            { name: "JotForm", desc: "Form collection & e-signatures", key: "jotform", icon: "📝" },
            { name: "Sentry", desc: "Error tracking & monitoring", key: "sentry", icon: "🐛" },
            { name: "PostHog", desc: "Product analytics", key: "posthog", icon: "📊" },
            { name: "Knock", desc: "Notifications", key: "knock", icon: "🔔" },
            { name: "Liveblocks", desc: "Real-time collaboration", key: "liveblocks", icon: "🤝" },
            { name: "Google", desc: "Calendar & OAuth", key: "google", icon: "📅" },
          ].map((integration) => (
            <div key={integration.key} className="rounded-xl border bg-card p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{integration.icon}</span>
                  <div>
                    <div className="font-medium">{integration.name}</div>
                    <div className="text-xs text-muted-foreground">{integration.desc}</div>
                  </div>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${integrations[integration.key] ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"}`}>
                  {integrations[integration.key] ? "Connected" : "Not configured"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Account Tab */}
      {tab === "account" && (
        <div className="max-w-lg space-y-4">
          <div className="rounded-xl border bg-card p-6">
            <h3 className="font-semibold">My Account</h3>
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground">
                  {(session.name ?? session.email).charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="text-lg font-medium">{session.name ?? "Admin"}</div>
                  <div className="text-sm text-muted-foreground">{session.email}</div>
                </div>
              </div>
              <div className="mt-4 space-y-2 rounded-lg bg-muted/50 p-4">
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">User ID</span><span className="font-mono text-xs">{session.userId.slice(0, 20)}...</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Role</span><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[session.role] ?? ""}`}>{ROLE_LABELS[session.role] ?? session.role}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Organization ID</span><span className="font-mono text-xs">{rlOrgId?.slice(0, 20) ?? "N/A"}</span></div>
              </div>
            </div>
          </div>
          <div className="rounded-xl border bg-card p-6">
            <h3 className="font-semibold">Security</h3>
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Password</div>
                  <div className="text-xs text-muted-foreground">Change your login password</div>
                </div>
                <button className="h-8 rounded-md border px-3 text-xs font-medium hover:bg-accent">Change Password</button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Two-Factor Authentication</div>
                  <div className="text-xs text-muted-foreground">Add an extra layer of security</div>
                </div>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">Not enabled</span>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Active Sessions</div>
                  <div className="text-xs text-muted-foreground">Manage your logged-in devices</div>
                </div>
                <span className="text-xs text-muted-foreground">1 active</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Invite Dialog */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg">
            <h2 className="text-lg font-semibold">Add RL Team Member</h2>
            <p className="text-sm text-muted-foreground">Invite someone to the Remote Leverage internal team. Ask them to sign in using Google SSO from the invite email.</p>
            {inviteError && (
              <div className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {inviteError}
              </div>
            )}
            <form onSubmit={handleInvite} className="mt-4 space-y-4">
              <div>
                <label className="text-sm font-medium">Name</label>
                <input name="name" placeholder="Jane Doe" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium">Email *</label>
                <input name="email" type="email" required placeholder="jane@remoteleverage.com" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium">Role *</label>
                <select name="role" required className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="super_admin">Super Admin — Full platform access</option>
                  <option value="admin">Admin — Org-level management</option>
                  <option value="manager">Manager — Team management</option>
                  <option value="bookkeeper">Bookkeeper — Financial access</option>
                  <option value="member">Member — Basic access</option>
                </select>
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowInvite(false)} className="h-10 rounded-md border px-4 text-sm">Cancel</button>
                <button type="submit" disabled={isPending} className="h-10 rounded-md bg-primary px-4 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                  {isPending ? "Inviting..." : "Send Invite"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
