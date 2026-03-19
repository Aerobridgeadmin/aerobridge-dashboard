import { getSessionContext } from "@repo/auth/session";
import { database } from "@repo/database";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Header } from "../../../components/header";
import { OrgDetail } from "./org-detail";

export const metadata: Metadata = { title: "Organization Details" };

type Props = { params: Promise<{ id: string }> };

const OrgDetailPage = async ({ params }: Props) => {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/sign-in");
  if (ctx.orgRole !== "super_admin") redirect("/");
  const { id } = await params;

  const org = await database.organization.findUnique({
    where: { id },
    include: {
      _count: { select: { members: true, employees: true, batchSessions: true } },
    },
    // stripeConnectAccountId and stripeConnectStatus are on the model directly
  });

  if (!org) notFound();

  const [rawMembers, employees, invitations, recentAudit, payments, tasks, documents, agreements, profile] = await Promise.all([
    database.organizationMember.findMany({
      where: { organizationId: id },
      orderBy: { createdAt: "desc" },
    }),
    database.employee.findMany({
      where: { organizationId: id },
      select: {
        id: true, legalFirstName: true, legalLastName: true, employeeNumber: true,
        jobTitle: true, department: true, employmentStatus: true, employmentType: true,
        hourlyRate: true, currency: true, createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    database.organizationInvitation.findMany({
      where: { organizationId: id, acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    }),
    database.auditLog.findMany({
      where: { organizationId: id },
      orderBy: { timestamp: "desc" },
      take: 30,
      select: { id: true, action: true, objectType: true, objectId: true, timestamp: true, actorDescription: true, newValue: true },
    }),
    database.payment.findMany({
      where: { employee: { organizationId: id } },
      include: { employee: { select: { legalFirstName: true, legalLastName: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    database.task.findMany({
      where: { employee: { organizationId: id } },
      include: { employee: { select: { legalFirstName: true, legalLastName: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    database.document.findMany({
      where: { employee: { organizationId: id } },
      include: { employee: { select: { legalFirstName: true, legalLastName: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    database.serviceAgreement.findMany({
      where: { organizationId: id },
      orderBy: { createdAt: "desc" },
    }),
    database.organizationProfile.findUnique({
      where: { organizationId: id },
    }),
  ]);

  // Enrich members with names/emails from Supabase auth
  // Also filter out contractors (they appear in the Contractors tab, not Members)
  const contractorUserIds = new Set(
    employees
      .map((e: any) => e.linkedUserId)
      .filter(Boolean) as string[]
  );
  // Also get linked_user_ids from full employee list (employees select might not include it)
  const allLinkedIds = await database.employee.findMany({
    where: { organizationId: id, linkedUserId: { not: null } },
    select: { linkedUserId: true },
  });
  for (const e of allLinkedIds) {
    if (e.linkedUserId) contractorUserIds.add(e.linkedUserId);
  }
  // Filter: exclude contractors and members with role "contractor"
  const filteredMembers = rawMembers.filter(
    (m) => !contractorUserIds.has(m.userId) && m.role !== "contractor"
  );

  const userIds = filteredMembers.map((m) => m.userId);
  const userNameMap = new Map<string, { name: string; email: string }>();
  if (userIds.length > 0) {
    try {
      // Use app_users + auth.users direct query instead of the admin listUsers API
      // (listUsers returns max ~50 and silently fails at scale)
      const appUsers = await database.appUser.findMany({
        where: { id: { in: userIds } },
        select: { id: true, displayName: true, email: true, supabaseUserId: true },
      });
      for (const u of appUsers) {
        userNameMap.set(u.id, {
          name: u.displayName ?? u.email?.split("@")[0] ?? "",
          email: u.email ?? "",
        });
      }
    } catch { /* non-blocking — fall back to UUID display */ }
  }
  const members = filteredMembers.map((m) => ({
    ...m,
    displayName: userNameMap.get(m.userId)?.name ?? "",
    email: userNameMap.get(m.userId)?.email ?? "",
  }));

  const employeesByStatus = new Map<string, number>();
  const employeesByDept = new Map<string, number>();
  for (const emp of employees) {
    employeesByStatus.set(emp.employmentStatus, (employeesByStatus.get(emp.employmentStatus) ?? 0) + 1);
    const dept = emp.department ?? "Unassigned";
    employeesByDept.set(dept, (employeesByDept.get(dept) ?? 0) + 1);
  }

  return (
    <>
      <Header page={org.name} pages={["RL Internal", "Organizations"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <OrgDetail
          org={org}
          members={members}
          employees={employees}
          invitations={invitations}
          recentAudit={recentAudit as any}
          payments={payments}
          tasks={tasks}
          documents={documents}
          employeesByStatus={Object.fromEntries(employeesByStatus)}
          employeesByDept={Object.fromEntries(employeesByDept)}
          profile={profile ? {
            industry: profile.industry,
            companySize: profile.companySize,
            website: profile.website,
            country: profile.country,
            address: profile.address,
            adminName: profile.adminName,
            adminEmail: profile.adminEmail,
            adminPhone: profile.adminPhone,
            adminTitle: profile.adminTitle,
            billingEmail: profile.billingEmail,
            paymentTerms: profile.paymentTerms,
            docChecklist: profile.docChecklist as Record<string, boolean> | null,
            kycStatus: profile.kycStatus,
            kycProvider: profile.kycProvider,
            veriffSessionId: profile.veriffSessionId,
            kycVerifiedAt: profile.kycVerifiedAt,
            kycVerifiedName: profile.kycVerifiedName,
            kycDocumentType: profile.kycDocumentType,
            kycDocumentCountry: profile.kycDocumentCountry,
            kycRejectionReason: profile.kycRejectionReason,
            kycSessionUrl: profile.kycSessionUrl,
            kycInitiatedAt: profile.kycInitiatedAt,
            paymentMethod: (profile as any).paymentMethod ?? null,
            pppInvoice: (profile as any).pppInvoice ?? null,
          } : null}
          agreements={agreements.map((a: any) => ({
            id: a.id,
            name: a.name,
            feeType: a.feeType,
            feeAmount: String(a.feeAmount),
            billingCycle: a.billingCycle,
            status: a.status,
            startDate: a.startDate.toISOString(),
            endDate: a.endDate?.toISOString() ?? null,
            notes: a.notes,
          }))}
        />
      </div>
    </>
  );
};

export default OrgDetailPage;
