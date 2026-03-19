import { getSessionContext } from "@repo/auth/session";
import { database } from "@repo/database";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Header } from "../components/header";

type SearchPageProperties = {
  searchParams: Promise<{
    q: string;
    page?: string;
  }>;
};

export const generateMetadata = async ({
  searchParams,
}: SearchPageProperties) => {
  const { q } = await searchParams;
  return {
    title: q ? `${q} - Search results` : "Search",
    description: q ? `Search results for ${q}` : "Search contractors and records",
  };
};

const PAGE_SIZE = 24;

const SearchPage = async ({ searchParams }: SearchPageProperties) => {
  const { q, page: pageStr } = await searchParams;
  const session = await getSessionContext();

  if (!session) {
    redirect("/sign-in");
  }

  // Only super_admin, admin, client, and manager roles can search contractors
  if (!["super_admin", "admin", "manager"].includes(session.orgRole ?? "")) {
    return (
      <>
        <Header page="Search" pages={["Remote Leverage"]} />
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <div className="rounded-xl border bg-card p-6">
            <h2 className="text-lg font-semibold">Access Denied</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              You do not have permission to search contractor records.
            </p>
          </div>
        </div>
      </>
    );
  }

  // Resolve org slug for links
  let orgSlug = "rl";
  if (session.orgId) {
    const org = await database.organization.findUnique({ where: { id: session.orgId }, select: { slug: true } });
    if (org) orgSlug = org.slug;
  }

  if (!q) {
    return (
      <>
        <Header page="Search" pages={["Remote Leverage"]} />
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <div className="rounded-xl border bg-card p-6">
            <h2 className="text-lg font-semibold">Search contractors</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Use the sidebar search input to find people by name, email, phone, role, or employee number.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-sm">
              <Link href={`/${orgSlug}/employees`} className="rounded-md border px-3 py-1.5 hover:bg-accent">
                View all contractors
              </Link>
            </div>
          </div>
        </div>
      </>
    );
  }

  const page = Math.max(1, Number(pageStr) || 1);
  const skip = (page - 1) * PAGE_SIZE;

  // Super admin: search across all orgs; others: scoped to their org
  const orgFilter = session.orgRole === "super_admin" ? {} : session.orgId ? { organizationId: session.orgId } : {};

  // Split query into individual terms so "Sebastian Steele" matches
  // firstName=Sebastian + lastName=Steele (each term must match at least one field)
  const terms = q.trim().split(/\s+/).filter(Boolean);

  const fieldContains = (term: string) => [
    { legalFirstName: { contains: term, mode: "insensitive" as const } },
    { legalLastName: { contains: term, mode: "insensitive" as const } },
    { preferredName: { contains: term, mode: "insensitive" as const } },
    { workEmail: { contains: term, mode: "insensitive" as const } },
    { personalEmail: { contains: term, mode: "insensitive" as const } },
    { employeeNumber: { contains: term, mode: "insensitive" as const } },
    { phoneNumber: { contains: term, mode: "insensitive" as const } },
    { mobileNumber: { contains: term, mode: "insensitive" as const } },
    { jobTitle: { contains: term, mode: "insensitive" as const } },
    { department: { contains: term, mode: "insensitive" as const } },
  ];

  const searchCondition = {
    ...orgFilter,
    AND: terms.map((term) => ({ OR: fieldContains(term) })),
  };

  const [employees, total] = await Promise.all([
    database.employee.findMany({
      where: searchCondition,
      include: { organization: { select: { name: true } } },
      skip,
      take: PAGE_SIZE,
      orderBy: [{ employmentStatus: "asc" }, { legalFirstName: "asc" }],
    }),
    database.employee.count({ where: searchCondition }),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const statusColors: Record<string, string> = {
    active: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
    pre_hire: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300",
    onboarding_scheduled: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300",
    onboarding_in_progress: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    offboarded: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  };

  return (
    <>
      <Header page="Search" pages={["Remote Leverage"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {total} result{total !== 1 ? "s" : ""} for &ldquo;{q}&rdquo;
          </h2>
          <span className="text-sm text-muted-foreground">
            Searching names, emails, phone, role, department, employee #
          </span>
        </div>
        <div className="grid auto-rows-min gap-3 md:grid-cols-3 lg:grid-cols-4">
          {employees.map((emp: any) => (
            <Link
              href={`/${orgSlug}/employees/${emp.id}`}
              className="rounded-xl border bg-card p-4 transition-colors hover:bg-muted/50"
              key={emp.id}
            >
              <div className="flex items-start justify-between">
                <div className="font-medium">
                  {emp.preferredName ?? emp.legalFirstName} {emp.legalLastName}
                </div>
                <span className="text-xs text-muted-foreground">{emp.employeeNumber}</span>
              </div>
              {emp.jobTitle && (
                <div className="mt-0.5 text-sm text-muted-foreground">{emp.jobTitle}</div>
              )}
              {emp.organization && (
                <div className="mt-0.5 text-xs text-muted-foreground">{emp.organization.name}</div>
              )}
              <div className="mt-2 flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${statusColors[emp.employmentStatus] ?? "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"}`}>
                  {emp.employmentStatus.replace(/_/g, " ")}
                </span>
              </div>
            </Link>
          ))}
          {employees.length === 0 && (
            <div className="col-span-full py-8 text-center text-muted-foreground">
              No results found for &ldquo;{q}&rdquo;.
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-4">
            {page > 1 && (
              <Link
                href={`/search?q=${encodeURIComponent(q)}&page=${page - 1}`}
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
                href={`/search?q=${encodeURIComponent(q)}&page=${page + 1}`}
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

export default SearchPage;
