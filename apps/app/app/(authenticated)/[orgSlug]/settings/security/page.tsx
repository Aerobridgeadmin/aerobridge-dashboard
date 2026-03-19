import { requireOrg, getSessionContext } from "@repo/auth/session";
import { database } from "@repo/database";
import type { Metadata } from "next";
import { Header } from "../../../components/header";
import { AuditLogClient } from "./audit-log-client";
import { serialize } from "@/lib/hriq/serialize";

export const metadata: Metadata = { title: "Security & Audit Log" };

const PAGE_SIZE = 50;

type PageProps = {
  searchParams: Promise<{ page?: string; action?: string; type?: string }>;
};

const SecurityPage = async ({ searchParams }: PageProps) => {
  await requireOrg();
  const ctx = await getSessionContext();
  const isSuperAdmin = ctx?.orgRole === "super_admin";
  const { page: pageStr, action: actionFilter, type: typeFilter } = await searchParams;
  const page = Math.max(1, Number(pageStr) || 1);

  if (!isSuperAdmin) {
    return (
      <>
        <Header page="Security" pages={["Client Portal", "Settings"]} />
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <div className="max-w-2xl rounded-xl border bg-card p-6">
            <h2 className="text-lg font-semibold">Security Overview</h2>
            <div className="mt-4 space-y-3">
              {[
                { label: "Session security", value: "Managed by Remote Leverage" },
                { label: "Access control", value: "Role based" },
                { label: "Audit visibility", value: "Available to admins" },
              ].map((row) => (
                <div className="flex justify-between text-sm" key={row.label}>
                  <span className="text-muted-foreground">{row.label}</span>
                  <span>{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </>
    );
  }

  const where: Record<string, unknown> = {};
  if (actionFilter) where.action = { contains: actionFilter, mode: "insensitive" };
  if (typeFilter) where.objectType = typeFilter;

  const [auditLogs, totalCount, distinctActions, distinctTypes] = await Promise.all([
    database.auditLog.findMany({
      where,
      orderBy: { timestamp: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    database.auditLog.count({ where }),
    database.auditLog.findMany({
      select: { action: true },
      distinct: ["action"],
      orderBy: { action: "asc" },
    }),
    database.auditLog.findMany({
      select: { objectType: true },
      distinct: ["objectType"],
      orderBy: { objectType: "asc" },
    }),
  ]);

  // Batch-resolve all unique IDs to human names
  const actorUserIds = [...new Set(auditLogs.map((e) => e.actorUserId).filter(Boolean))] as string[];
  const orgIds = [...new Set([
    ...auditLogs.map((e) => e.organizationId),
    ...auditLogs.filter((e) => e.objectType === "organization").map((e) => e.objectId),
  ].filter(Boolean))] as string[];
  const employeeIds = [...new Set(
    auditLogs.filter((e) => e.objectType === "employee").map((e) => e.objectId)
  )] as string[];

  const [users, orgs, employees] = await Promise.all([
    actorUserIds.length > 0
      ? database.appUser.findMany({
          where: { supabaseUserId: { in: actorUserIds } },
          select: { supabaseUserId: true, displayName: true, email: true },
        })
      : [],
    orgIds.length > 0
      ? database.organization.findMany({
          where: { id: { in: orgIds } },
          select: { id: true, name: true },
        })
      : [],
    employeeIds.length > 0
      ? database.employee.findMany({
          where: { id: { in: employeeIds } },
          select: { id: true, legalFirstName: true, legalLastName: true, personalEmail: true, workEmail: true },
        })
      : [],
  ]);

  const userMap = Object.fromEntries(users.map((u) => [u.supabaseUserId, u.displayName || u.email]));
  const orgMap = Object.fromEntries(orgs.map((o) => [o.id, o.name]));
  const empMap = Object.fromEntries(employees.map((e) => [e.id, {
    name: `${e.legalFirstName} ${e.legalLastName ?? ""}`.trim(),
    email: e.workEmail || e.personalEmail || "",
  }]));

  const integrationStatus = {
    arcjet: !!process.env.ARCJET_KEY,
    sentry: !!process.env.SENTRY_DSN,
    posthog: !!process.env.NEXT_PUBLIC_POSTHOG_KEY,
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <>
      <Header page="Security & Audit Log" pages={["RL Internal", "Settings"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <AuditLogClient
          auditLogs={auditLogs.map((e) => {
            let objectName: string | null = null;
            if (e.objectType === "employee" && empMap[e.objectId]) {
              const emp = empMap[e.objectId];
              objectName = emp.email ? `${emp.name} (${emp.email})` : emp.name;
            } else if (e.objectType === "organization" && orgMap[e.objectId]) {
              objectName = orgMap[e.objectId];
            }

            return {
              id: e.id,
              timestamp: e.timestamp.toISOString(),
              action: e.action,
              objectType: e.objectType,
              objectId: e.objectId,
              objectName,
              actorUserId: e.actorUserId ?? null,
              actorName: e.actorUserId ? (userMap[e.actorUserId] ?? null) : null,
              actorDescription: e.actorDescription ?? null,
              actorType: e.actorType,
              reason: e.reason ?? null,
              organizationId: e.organizationId ?? null,
              organizationName: e.organizationId ? (orgMap[e.organizationId] ?? null) : null,
              oldValue: e.oldValue ? serialize(e.oldValue) : null,
              newValue: e.newValue ? serialize(e.newValue) : null,
            };
          })}
          totalCount={totalCount}
          page={page}
          totalPages={totalPages}
          actionFilter={actionFilter ?? ""}
          typeFilter={typeFilter ?? ""}
          distinctActions={distinctActions.map((a) => a.action)}
          distinctTypes={distinctTypes.map((t) => t.objectType)}
          integrationStatus={integrationStatus}
        />
      </div>
    </>
  );
};

export default SecurityPage;
