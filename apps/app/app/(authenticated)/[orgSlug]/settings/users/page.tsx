import { requireRole } from "@repo/auth/session";
import { shortDate } from "@/lib/hriq/format";
import { database } from "@repo/database";
import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "../../../components/header";
import { UserActions } from "./user-actions";

export const metadata: Metadata = { title: "User Management" };

const PAGE_SIZE = 25;

type UsersPageProps = {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ page?: string; q?: string }>;
};

const UsersPage = async ({ params, searchParams }: UsersPageProps) => {
  const { orgSlug } = await params;
  await requireRole("super_admin");

  const { page: pageStr, q } = await searchParams;
  const page = Math.max(1, Number(pageStr) || 1);
  const skip = (page - 1) * PAGE_SIZE;

  const where = q
    ? {
        OR: [
          { email: { contains: q, mode: "insensitive" as const } },
          { displayName: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [users, total] = await Promise.all([
    database.appUser.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: PAGE_SIZE,
    }),
    database.appUser.count({ where }),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const userIds = users.map((u: any) => u.supabaseUserId);
  const memberships = await database.organizationMember.findMany({
    where: { userId: { in: userIds } },
    include: { organization: { select: { name: true } } },
  });

  const membershipMap = new Map<string, typeof memberships>();
  for (const m of memberships) {
    if (!membershipMap.has(m.userId)) membershipMap.set(m.userId, []);
    membershipMap.get(m.userId)!.push(m);
  }

  return (
    <>
      <Header page="Users" pages={["RL Internal", "Settings"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">User Management ({total})</h2>
          <form action={`/${orgSlug}/settings/users`} method="GET" className="flex gap-2">
            <input
              type="text"
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search users..."
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            />
            <button type="submit" className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              Search
            </button>
          </form>
        </div>

        <div className="space-y-3">
          {users.map((u: any) => {
            const userMemberships = membershipMap.get(u.supabaseUserId) ?? [];
            return (
              <div key={u.id} className="rounded-xl border bg-card p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                        {(u.displayName ?? u.email).charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-medium">{u.displayName ?? "No name"}</div>
                        <div className="text-sm text-muted-foreground">{u.email}</div>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${u.isActive ? "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300" : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"}`}>
                        {u.isActive ? "Active" : "Inactive"}
                      </span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{u.loginCount} logins</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs">Joined {shortDate(u.createdAt as any)}</span>
                    </div>
                    {userMemberships.length > 0 && (
                      <div className="mt-3">
                        <div className="text-xs font-medium text-muted-foreground mb-1">Organization Roles:</div>
                        <div className="space-y-1">
                          {userMemberships.map((m: any) => (
                            <div key={m.id} className="flex items-center gap-2">
                              <span className="text-sm">{m.organization.name}</span>
                              <UserActions membership={m} />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {userMemberships.length === 0 && (
                      <div className="mt-2 text-xs text-muted-foreground">No organization memberships</div>
                    )}
                  </div>
                  <UserActions user={u} />
                </div>
              </div>
            );
          })}
          {users.length === 0 && (
            <div className="py-12 text-center text-muted-foreground">No users found.</div>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-2">
            {page > 1 && (
              <Link
                href={`/${orgSlug}/settings/users?page=${page - 1}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
              >
                Previous
              </Link>
            )}
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            {page < totalPages && (
              <Link
                href={`/${orgSlug}/settings/users?page=${page + 1}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
              >
                Next
              </Link>
            )}
          </div>
        )}
      </div>
    </>
  );
};

export default UsersPage;
