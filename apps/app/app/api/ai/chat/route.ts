// @ts-nocheck
import { streamText, tool, stepCountIs, convertToModelMessages } from "ai";
import { gateway } from "@ai-sdk/gateway";
import { z } from "zod";
import { database } from "@repo/database";
import { getSessionContext } from "@repo/auth/session";
import { NextResponse } from "next/server";
import { RL_ORG_ID, getSupabaseAdmin, getDefaultPassword } from "@/app/actions/hriq/constants";
import { serialize } from "@/lib/hriq/serialize";

export const maxDuration = 60;

// ─── SELECT shape for employee lookups ────────────────────────────────────
const EMP_SELECT = {
  id: true, legalFirstName: true, legalLastName: true, preferredName: true,
  linkedUserId: true, personalEmail: true, workEmail: true, username: true,
  organizationId: true, employmentStatus: true, department: true, jobTitle: true,
  hourlyRate: true, monthlySalary: true, compensationType: true, currency: true,
  country: true, employmentType: true, preferredPaymentMethod: true,
  startDate: true, wiseGateRequired: true, cadanaGateRequired: true,
  cadanaPersonId: true,
  organization: { select: { name: true, id: true } },
};

function empSummary(e) {
  return {
    id: e.id,
    name: `${e.legalFirstName} ${e.legalLastName}`,
    preferredName: e.preferredName ?? null,
    email: e.personalEmail ?? e.workEmail ?? "—",
    department: e.department ?? "Unassigned",
    jobTitle: e.jobTitle ?? "—",
    status: e.employmentStatus,
    org: e.organization?.name ?? "—",
  };
}

// ─── Find ALL matching employees (returns array for disambiguation) ───────
async function findEmployees(employeeId, name, maxResults = 5) {
  if (employeeId) {
    const emp = await database.employee.findUnique({ where: { id: employeeId }, select: EMP_SELECT });
    return emp ? [emp] : [];
  }
  if (!name) return [];

  const parts = name.trim().split(/\s+/).filter(Boolean);

  // Strategy 1: exact first+last
  if (parts.length > 1) {
    const exact = await database.employee.findMany({
      where: {
        AND: [
          { legalFirstName: { equals: parts[0], mode: "insensitive" } },
          { legalLastName: { equals: parts.slice(1).join(" "), mode: "insensitive" } },
        ],
      },
      select: EMP_SELECT, take: maxResults,
    });
    if (exact.length > 0) return exact;
  }

  // Strategy 2: all words match somewhere in name fields
  const allWordsWhere = parts.length > 1
    ? {
        AND: parts.map((part) => ({
          OR: [
            { legalFirstName: { contains: part, mode: "insensitive" } },
            { legalLastName: { contains: part, mode: "insensitive" } },
            { preferredName: { contains: part, mode: "insensitive" } },
          ],
        })),
      }
    : {
        OR: [
          { legalFirstName: { contains: parts[0], mode: "insensitive" } },
          { legalLastName: { contains: parts[0], mode: "insensitive" } },
          { preferredName: { contains: parts[0], mode: "insensitive" } },
          { personalEmail: { contains: parts[0], mode: "insensitive" } },
          { workEmail: { contains: parts[0], mode: "insensitive" } },
          { username: { contains: parts[0], mode: "insensitive" } },
        ],
      };

  const found = await database.employee.findMany({ where: allWordsWhere, select: EMP_SELECT, take: maxResults });
  if (found.length > 0) return found;

  // Strategy 3: try each part individually
  for (const part of parts) {
    if (part.length < 3) continue;
    const fallback = await database.employee.findMany({
      where: {
        OR: [
          { legalFirstName: { contains: part, mode: "insensitive" } },
          { legalLastName: { contains: part, mode: "insensitive" } },
          { preferredName: { contains: part, mode: "insensitive" } },
          { personalEmail: { contains: part, mode: "insensitive" } },
          { username: { contains: part, mode: "insensitive" } },
        ],
      },
      select: EMP_SELECT, take: maxResults,
    });
    if (fallback.length > 0) return fallback;
  }
  return [];
}

// Resolve to exactly one employee, or return an error/disambiguation object
async function resolveOneEmployee(employeeId, name) {
  const matches = await findEmployees(employeeId, name);
  if (matches.length === 0) return { error: `No one found matching "${name || employeeId}". Try the full name or check spelling.` };
  if (matches.length === 1) return { employee: matches[0] };
  return {
    error: `Found ${matches.length} people matching "${name}". Which one?`,
    matches: matches.map(empSummary),
  };
}

// ─── System prompt ────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the RL Assistant for Remote Leverage — a friendly, concise HR assistant embedded in the HRIQ dashboard. Today is ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}.

CRITICAL — How to talk:
- Talk like a helpful coworker, NOT like a developer or AI.
- NEVER mention tools, queries, databases, SQL, tables, schemas, APIs, or any technical implementation detail.
- NEVER say things like "Let me query...", "Let me check the database...", "Let me try the audit log table...", "I'll run a search...", "Let me look up the records...".
- NEVER narrate what you're doing behind the scenes. Just DO it and present the results naturally.
- If a tool fails or returns no data, say something natural like "I couldn't find that" or "Nothing came up for that" — NEVER explain the technical reason.
- NEVER mention tool names, function names, field names, or error messages from the system.

Good examples:
  User: "How many active contractors?"
  Bad: "Let me query the database to check... I found 47 active contractors."
  Good: "You've got 47 active contractors right now."

  User: "Reset Sebastian's password"  
  Bad: "Let me search for Sebastian in the employees table..."
  Good (if 1 match): "Done — Sebastian's password has been reset and he'll get an email with the new one."
  Good (if 3 matches): "There are 3 Sebastians — Sebastian Ruiz (Sales), Sebastian Lee (Engineering), Sebastian Torres (Support). Which one?"

Style:
- Be concise. No fluff, no preamble, no "Sure!", no "Great question!".
- Format numbers nicely ($2,500 not 2500).
- When listing people, include their department and status.
- Never expose passwords, tokens, or credentials.
- For actions (reset password, approve timesheet, etc.), just confirm what happened in plain English.
- If you find multiple matches for a name, list them with their department so the user can pick.
- If you don't know something, just say so.`;

function buildSystemPrompt(role) {
  if (role === "super_admin") {
    return SYSTEM_PROMPT + `\n\nThis user is a super admin with full access. Execute requests directly. If a name matches multiple people, list them with departments and ask which one. You can do everything: look up anyone, reset passwords, change roles, approve/reject things, manage timesheets, offboard people, view documents, check login activity, etc.`;
  }
  if (role === "admin") {
    return SYSTEM_PROMPT + "\n\nThis user is an admin. They can view all employee data and approve/reject timesheets and time off.";
  }
  return SYSTEM_PROMPT + "\n\nThis user is a contractor. Only help with their own data — timesheets, pay info, general questions. Never reveal other people's data.";
}

export async function POST(req) {
  const session = await getSessionContext();
  if (!session?.userId) return new Response("Unauthorized", { status: 401 });

  let isRL = session.orgId === RL_ORG_ID;
  if (!isRL) { const m = await database.organizationMember.findFirst({ where: { userId: session.userId, organizationId: RL_ORG_ID }, select: { id: true } }); isRL = !!m; }
  if (!isRL) { const s = await database.organizationMember.findFirst({ where: { userId: session.userId, role: "super_admin" }, select: { id: true } }); isRL = !!s; }
  if (!isRL) return NextResponse.json({ error: "RL only" }, { status: 403 });

  const { messages } = await req.json();

  let effectiveRole = session.orgRole ?? "member";
  if (effectiveRole === "member" || !effectiveRole) {
    const superCheck = await database.organizationMember.findFirst({ where: { userId: session.userId, role: "super_admin" }, select: { role: true } });
    if (superCheck) effectiveRole = "super_admin";
  }
  const isAdmin = ["super_admin", "admin"].includes(effectiveRole);
  const isSuperAdmin = effectiveRole === "super_admin";

  // ─── Read tools (all roles) ──────────────────────────────────────────────

  const readTools = {
    searchEmployees: tool({
      description: "Search or filter contractors/employees by name, email, department, status, org. Use for any people lookup.",
      inputSchema: z.object({
        search: z.string().optional().describe("Name or email to search for — can be full name, first name, last name, or email"),
        department: z.string().optional(),
        status: z.string().optional().describe("active, offboarded, onboarding_scheduled, pre_hire, onboarding_in_progress"),
        organizationId: z.string().optional(),
        limit: z.number().optional().default(20),
      }),
      execute: async ({ search, department, status, organizationId, limit }) => {
        const where = {};
        if (search) {
          const parts = search.trim().split(/\s+/).filter(Boolean);
          if (parts.length > 1) {
            where.AND = parts.map((part) => ({
              OR: [
                { legalFirstName: { contains: part, mode: "insensitive" } },
                { legalLastName: { contains: part, mode: "insensitive" } },
                { preferredName: { contains: part, mode: "insensitive" } },
                { personalEmail: { contains: part, mode: "insensitive" } },
                { workEmail: { contains: part, mode: "insensitive" } },
                { username: { contains: part, mode: "insensitive" } },
              ],
            }));
          } else {
            where.OR = [
              { legalFirstName: { contains: search, mode: "insensitive" } },
              { legalLastName: { contains: search, mode: "insensitive" } },
              { preferredName: { contains: search, mode: "insensitive" } },
              { personalEmail: { contains: search, mode: "insensitive" } },
              { workEmail: { contains: search, mode: "insensitive" } },
              { username: { contains: search, mode: "insensitive" } },
            ];
          }
        }
        if (department) where.department = { contains: department, mode: "insensitive" };
        if (status) where.employmentStatus = status;
        if (organizationId) where.organizationId = organizationId;
        if (!isSuperAdmin && !organizationId) where.organizationId = session.orgId;
        const employees = await database.employee.findMany({
          where, take: limit ?? 20, orderBy: { legalFirstName: "asc" },
          select: EMP_SELECT,
        });
        return {
          count: employees.length,
          employees: employees.map((e) => ({
            ...empSummary(e),
            username: e.username ?? "—",
            type: e.employmentType,
            rate: e.compensationType === "monthly"
              ? (e.monthlySalary ? `${e.currency ?? "USD"} ${e.monthlySalary}/mo` : "—")
              : (e.hourlyRate ? `${e.currency ?? "USD"} ${e.hourlyRate}/hr` : "—"),
            country: e.country ?? "—",
            orgId: e.organization?.id ?? "—",
            hasAccount: !!e.linkedUserId,
            payMethod: e.preferredPaymentMethod ?? "—",
            startDate: e.startDate ? new Date(e.startDate).toLocaleDateString("en-US") : "—",
            wiseGate: e.wiseGateRequired ?? false,
            cadanaGate: e.cadanaGateRequired ?? false,
          })),
        };
      },
    }),

    getEmployeeDetail: tool({
      description: "Get full detailed profile for one person — their info, account status, login activity, org, payment setup. Use for 'tell me about Maria', 'show Sebastian's profile', 'what's John's email', etc.",
      inputSchema: z.object({
        employeeId: z.string().optional(),
        name: z.string().optional(),
      }),
      execute: async ({ employeeId, name }) => {
        const result = await resolveOneEmployee(employeeId, name);
        if (result.error) return result;
        const e = result.employee;
        // Get linked user info
        let loginInfo = null;
        if (e.linkedUserId) {
          const user = await database.appUser.findUnique({
            where: { supabaseUserId: e.linkedUserId },
            select: { email: true, displayName: true, isActive: true, lastLoginAt: true, loginCount: true, createdAt: true },
          });
          if (user) loginInfo = {
            accountActive: user.isActive,
            lastLogin: user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("en-US", { timeZone: "America/Los_Angeles" }) : "Never",
            loginCount: user.loginCount ?? 0,
            accountCreated: user.createdAt ? new Date(user.createdAt).toLocaleDateString("en-US") : "—",
          };
        }
        // Get org memberships
        const memberships = e.linkedUserId ? await database.organizationMember.findMany({
          where: { userId: e.linkedUserId },
          select: { role: true, organization: { select: { name: true } } },
        }) : [];

        return {
          ...empSummary(e),
          username: e.username ?? "—",
          type: e.employmentType,
          rate: e.compensationType === "monthly"
            ? (e.monthlySalary ? `${e.currency ?? "USD"} ${e.monthlySalary}/mo` : "—")
            : (e.hourlyRate ? `${e.currency ?? "USD"} ${e.hourlyRate}/hr` : "—"),
          country: e.country ?? "—",
          startDate: e.startDate ? new Date(e.startDate).toLocaleDateString("en-US") : "—",
          payMethod: e.preferredPaymentMethod ?? "—",
          wiseGate: e.wiseGateRequired ?? false,
          cadanaGate: e.cadanaGateRequired ?? false,
          hasCadana: !!e.cadanaPersonId,
          hasAccount: !!e.linkedUserId,
          login: loginInfo,
          roles: memberships.map((m) => ({ org: m.organization?.name, role: m.role })),
        };
      },
    }),

    getEmployeeTimesheets: tool({
      description: "Get timesheet submissions for a specific person. Use for 'show Maria's timesheets', 'has John submitted?', 'Sebastian's hours', etc.",
      inputSchema: z.object({
        employeeId: z.string().optional(),
        name: z.string().optional(),
        limit: z.number().optional().default(5),
      }),
      execute: async ({ employeeId, name, limit }) => {
        const result = await resolveOneEmployee(employeeId, name);
        if (result.error) return result;
        const e = result.employee;
        const subs = await database.timesheetSubmission.findMany({
          where: { employeeId: e.id },
          orderBy: { createdAt: "desc" }, take: limit ?? 5,
          include: { period: { select: { name: true, startDate: true, endDate: true } } },
        });
        return {
          employee: `${e.legalFirstName} ${e.legalLastName}`,
          department: e.department ?? "—",
          submissionCount: subs.length,
          timesheets: subs.map((s) => ({
            id: s.id,
            period: s.period?.name ?? "—",
            status: s.status,
            totalHours: Number(s.totalHours ?? 0),
            bonusTotal: Number(s.bonusTotal ?? 0),
            submittedAt: s.submittedAt ? new Date(s.submittedAt).toLocaleDateString("en-US") : "—",
          })),
        };
      },
    }),

    getEmployeePayments: tool({
      description: "Get payment history for a specific person. Use for 'show Maria's payments', 'has John been paid?', etc.",
      inputSchema: z.object({
        employeeId: z.string().optional(),
        name: z.string().optional(),
        limit: z.number().optional().default(10),
      }),
      execute: async ({ employeeId, name, limit }) => {
        const result = await resolveOneEmployee(employeeId, name);
        if (result.error) return result;
        const e = result.employee;
        const payments = await database.payment.findMany({
          where: { employeeId: e.id },
          orderBy: { createdAt: "desc" }, take: limit ?? 10,
        });
        return {
          employee: `${e.legalFirstName} ${e.legalLastName}`,
          count: payments.length,
          payments: payments.map((p) => ({
            id: p.id, amount: Number(p.amount ?? 0), currency: p.currency ?? "USD",
            status: p.status, method: p.paymentMethod ?? "—",
            date: p.paymentDate ? new Date(p.paymentDate).toLocaleDateString("en-US") : "—",
            hoursWorked: p.hoursWorked ? Number(p.hoursWorked) : "—",
          })),
        };
      },
    }),

    getEmployeeDocuments: tool({
      description: "Get documents for a specific person — contracts, IDs, forms, etc.",
      inputSchema: z.object({
        employeeId: z.string().optional(),
        name: z.string().optional(),
      }),
      execute: async ({ employeeId, name }) => {
        const result = await resolveOneEmployee(employeeId, name);
        if (result.error) return result;
        const e = result.employee;
        const docs = await database.document.findMany({
          where: { employeeId: e.id },
          orderBy: { createdAt: "desc" }, take: 20,
          select: { id: true, documentType: true, documentName: true, status: true, createdAt: true, isConfidential: true },
        });
        return {
          employee: `${e.legalFirstName} ${e.legalLastName}`,
          count: docs.length,
          documents: docs.map((d) => ({
            id: d.id, type: d.documentType ?? "—", name: d.documentName ?? "—",
            status: d.status ?? "—", confidential: d.isConfidential ?? false,
            uploaded: d.createdAt ? new Date(d.createdAt).toLocaleDateString("en-US") : "—",
          })),
        };
      },
    }),

    getStats: tool({
      description: "Get high-level organization stats: total employees, by status, by department, recent hires.",
      inputSchema: z.object({}),
      execute: async () => {
        const orgWhere = isSuperAdmin ? {} : { organizationId: session.orgId };
        const [total, byStatus, byDept, recentHires] = await Promise.all([
          database.employee.count({ where: orgWhere }),
          database.employee.groupBy({ by: ["employmentStatus"], where: orgWhere, _count: true }),
          database.employee.groupBy({ by: ["department"], where: { ...orgWhere, employmentStatus: "active" }, _count: true, orderBy: { _count: { department: "desc" } } }),
          database.employee.count({ where: { ...orgWhere, employmentStatus: "active", createdAt: { gte: new Date(Date.now() - 30 * 86400000) } } }),
        ]);
        return {
          totalEmployees: total,
          byStatus: Object.fromEntries(byStatus.map((s) => [s.employmentStatus, s._count])),
          activeDepartments: byDept.map((d) => ({ department: d.department ?? "Unassigned", count: d._count })),
          newHiresLast30Days: recentHires,
        };
      },
    }),

    getTimesheetInfo: tool({
      description: "Get timesheet period info — current period, submission stats, who hasn't submitted.",
      inputSchema: z.object({
        periodId: z.string().optional().describe("Specific period ID, or leave empty for most recent"),
      }),
      execute: async ({ periodId }) => {
        const period = periodId
          ? await database.timesheetPeriod.findUnique({ where: { id: periodId } })
          : await database.timesheetPeriod.findFirst({ orderBy: { startDate: "desc" } });
        if (!period) return { error: "No timesheet period found" };
        const submissions = await database.timesheetSubmission.findMany({
          where: { periodId: period.id },
          select: { id: true, employeeId: true, status: true, totalHours: true, bonusTotal: true, employee: { select: { legalFirstName: true, legalLastName: true, department: true } } },
        });
        const activeEmployees = await database.employee.findMany({
          where: { employmentStatus: "active", ...(isSuperAdmin ? {} : { organizationId: session.orgId }) },
          select: { id: true, legalFirstName: true, legalLastName: true, department: true },
        });
        const submittedIds = new Set(submissions.map((s) => s.employeeId));
        const notSubmitted = activeEmployees.filter((e) => !submittedIds.has(e.id));
        return {
          period: { id: period.id, name: period.name, start: period.startDate, end: period.endDate, status: period.status },
          totalSubmissions: submissions.length,
          byStatus: {
            submitted: submissions.filter((s) => s.status === "submitted").length,
            approved: submissions.filter((s) => s.status === "approved").length,
            rejected: submissions.filter((s) => s.status === "rejected").length,
            draft: submissions.filter((s) => s.status === "draft").length,
          },
          topSubmissions: submissions.slice(0, 15).map((s) => ({
            id: s.id, name: `${s.employee.legalFirstName} ${s.employee.legalLastName}`,
            department: s.employee.department ?? "—",
            status: s.status, hours: Number(s.totalHours ?? 0), bonuses: Number(s.bonusTotal ?? 0),
          })),
          notSubmittedCount: notSubmitted.length,
          notSubmitted: notSubmitted.slice(0, 25).map((e) => ({ name: `${e.legalFirstName} ${e.legalLastName}`, department: e.department ?? "Unassigned" })),
        };
      },
    }),

    getOnboardingPipeline: tool({
      description: "Get the current onboarding/hiring pipeline — who is being onboarded.",
      inputSchema: z.object({}),
      execute: async () => {
        const pipeline = await database.employee.findMany({
          where: { employmentStatus: { in: ["pre_hire", "onboarding_scheduled", "onboarding_in_progress"] } },
          select: { id: true, legalFirstName: true, legalLastName: true, personalEmail: true, employmentStatus: true, jobTitle: true, department: true, startDate: true, organization: { select: { name: true } } },
          orderBy: { createdAt: "desc" }, take: 30,
        });
        return {
          total: pipeline.length,
          byStage: {
            preHire: pipeline.filter((e) => e.employmentStatus === "pre_hire").length,
            scheduled: pipeline.filter((e) => e.employmentStatus === "onboarding_scheduled").length,
            inProgress: pipeline.filter((e) => e.employmentStatus === "onboarding_in_progress").length,
          },
          contractors: pipeline.map((e) => ({
            id: e.id, name: `${e.legalFirstName} ${e.legalLastName}`, email: e.personalEmail ?? "—",
            stage: e.employmentStatus, role: e.jobTitle ?? "—", org: e.organization?.name ?? "—",
            startDate: e.startDate ? new Date(e.startDate).toLocaleDateString("en-US") : "TBD",
          })),
        };
      },
    }),

    getTimeOffRequests: tool({
      description: "Get time off requests. Can filter by status or look up a specific person's requests.",
      inputSchema: z.object({
        status: z.enum(["pending", "approved", "rejected", "all"]).optional().default("all"),
        employeeName: z.string().optional().describe("Filter to a specific person's requests"),
      }),
      execute: async ({ status, employeeName }) => {
        const where = {
          ...(isSuperAdmin ? {} : { employee: { organizationId: session.orgId } }),
          ...(status && status !== "all" ? { status } : {}),
        };
        if (employeeName) {
          const result = await resolveOneEmployee(undefined, employeeName);
          if (result.error) return result;
          where.employeeId = result.employee.id;
        }
        const requests = await database.timeOffRequest.findMany({
          where, take: 30, orderBy: { createdAt: "desc" },
          include: {
            employee: { select: { legalFirstName: true, legalLastName: true, department: true } },
            policy: { select: { name: true, type: true } },
          },
        });
        return {
          count: requests.length,
          requests: requests.map((r) => ({
            id: r.id, employee: `${r.employee.legalFirstName} ${r.employee.legalLastName}`,
            department: r.employee.department ?? "—", policy: r.policy?.name ?? "—",
            startDate: r.startDate ? new Date(r.startDate).toLocaleDateString("en-US") : "—",
            endDate: r.endDate ? new Date(r.endDate).toLocaleDateString("en-US") : "—",
            totalDays: r.totalDays, status: r.status, reason: r.reason ?? "—",
          })),
        };
      },
    }),

    getExpenseReports: tool({
      description: "Get expense reports — filter by status or person.",
      inputSchema: z.object({
        status: z.enum(["pending", "approved", "rejected", "all"]).optional().default("all"),
        employeeName: z.string().optional(),
      }),
      execute: async ({ status, employeeName }) => {
        const where = {
          ...(isSuperAdmin ? {} : { employee: { organizationId: session.orgId } }),
          ...(status && status !== "all" ? { status } : {}),
        };
        if (employeeName) {
          const result = await resolveOneEmployee(undefined, employeeName);
          if (result.error) return result;
          where.employeeId = result.employee.id;
        }
        const reports = await database.expenseReport.findMany({
          where, take: 30, orderBy: { createdAt: "desc" },
          include: { employee: { select: { legalFirstName: true, legalLastName: true } }, items: { select: { description: true, amount: true, category: true } } },
        });
        return {
          count: reports.length,
          reports: reports.map((r) => ({
            id: r.id, employee: `${r.employee.legalFirstName} ${r.employee.legalLastName}`,
            status: r.status, totalAmount: r.items.reduce((sum, i) => sum + Number(i.amount ?? 0), 0),
            itemCount: r.items.length,
            createdAt: r.createdAt ? new Date(r.createdAt).toLocaleDateString("en-US") : "—",
          })),
        };
      },
    }),

    getPayRunInfo: tool({
      description: "Get pay run details — latest or specific pay run.",
      inputSchema: z.object({ payRunId: z.string().optional() }),
      execute: async ({ payRunId }) => {
        const payRun = payRunId
          ? await database.payRun.findUnique({ where: { id: payRunId }, include: { items: { include: { employee: { select: { legalFirstName: true, legalLastName: true } } } } } })
          : await database.payRun.findFirst({ orderBy: { createdAt: "desc" }, include: { items: { include: { employee: { select: { legalFirstName: true, legalLastName: true } } } } } });
        if (!payRun) return { error: "No pay run found" };
        return {
          id: payRun.id, name: payRun.name, status: payRun.status,
          totalAmount: Number(payRun.totalAmount ?? 0), currency: payRun.currency ?? "USD",
          itemCount: payRun.items.length,
          items: payRun.items.slice(0, 30).map((i) => ({
            employee: `${i.employee.legalFirstName} ${i.employee.legalLastName}`,
            hours: Number(i.hoursWorked ?? 0), rate: Number(i.hourlyRate ?? 0),
            gross: Number(i.grossAmount ?? 0), net: Number(i.netAmount ?? 0),
          })),
          createdAt: payRun.createdAt ? new Date(payRun.createdAt).toLocaleDateString("en-US") : "—",
        };
      },
    }),

    getPayments: tool({
      description: "Get payments list — filter by status, employee name, or employee ID.",
      inputSchema: z.object({
        status: z.string().optional().describe("pending, processing, paid, failed"),
        employeeName: z.string().optional().describe("Filter by person's name"),
        employeeId: z.string().optional(),
        limit: z.number().optional().default(20),
      }),
      execute: async ({ status, employeeName, employeeId, limit }) => {
        const where = { ...(status ? { status } : {}) };
        if (employeeName) {
          const result = await resolveOneEmployee(undefined, employeeName);
          if (result.error) return result;
          where.employeeId = result.employee.id;
        } else if (employeeId) {
          where.employeeId = employeeId;
        }
        const payments = await database.payment.findMany({
          where, take: limit ?? 20, orderBy: { createdAt: "desc" },
          include: { employee: { select: { legalFirstName: true, legalLastName: true } } },
        });
        return {
          count: payments.length,
          payments: payments.map((p) => ({
            id: p.id, employee: `${p.employee.legalFirstName} ${p.employee.legalLastName}`,
            amount: Number(p.amount ?? 0), currency: p.currency ?? "USD", status: p.status,
            method: p.paymentMethod ?? "—",
            date: p.paymentDate ? new Date(p.paymentDate).toLocaleDateString("en-US") : "—",
          })),
        };
      },
    }),

    getOrganizations: tool({
      description: "List all organizations / client companies.",
      inputSchema: z.object({}),
      execute: async () => {
        const orgs = await database.organization.findMany({
          take: 50, orderBy: { name: "asc" },
          select: { id: true, name: true, slug: true, _count: { select: { members: true, employees: true } } },
        });
        return { count: orgs.length, organizations: orgs.map((o) => ({ id: o.id, name: o.name, slug: o.slug, memberCount: o._count.members, employeeCount: o._count.employees })) };
      },
    }),

    getLoginActivity: tool({
      description: "Get login activity — who logged in recently, who hasn't, inactive users. Use for 'who hasn't logged in?', 'inactive users', 'last login for Sebastian', etc.",
      inputSchema: z.object({
        mode: z.enum(["recent", "inactive", "never", "all"]).default("inactive"),
        days: z.number().optional().default(14),
        limit: z.number().optional().default(25),
      }),
      execute: async ({ mode, days, limit }) => {
        const threshold = new Date(Date.now() - (days ?? 14) * 86400000);
        let query;
        if (mode === "recent") {
          query = `SELECT e.legal_first_name, e.legal_last_name, e.department, u.last_login_at, u.login_count FROM hriq_employees e JOIN app_users u ON e.linked_user_id = u.supabase_user_id WHERE u.last_login_at IS NOT NULL AND e.employment_status = 'active' ORDER BY u.last_login_at DESC LIMIT ${limit ?? 25}`;
        } else if (mode === "inactive") {
          query = `SELECT e.legal_first_name, e.legal_last_name, e.department, u.last_login_at, u.login_count FROM hriq_employees e JOIN app_users u ON e.linked_user_id = u.supabase_user_id WHERE e.employment_status = 'active' AND (u.last_login_at IS NULL OR u.last_login_at < '${threshold.toISOString()}') ORDER BY u.last_login_at ASC NULLS FIRST LIMIT ${limit ?? 25}`;
        } else if (mode === "never") {
          query = `SELECT e.legal_first_name, e.legal_last_name, e.department, u.created_at as account_created FROM hriq_employees e JOIN app_users u ON e.linked_user_id = u.supabase_user_id WHERE e.employment_status = 'active' AND u.last_login_at IS NULL ORDER BY e.legal_first_name LIMIT ${limit ?? 25}`;
        } else {
          query = `SELECT e.legal_first_name, e.legal_last_name, e.department, u.last_login_at, u.login_count FROM hriq_employees e JOIN app_users u ON e.linked_user_id = u.supabase_user_id WHERE e.employment_status = 'active' ORDER BY u.last_login_at DESC NULLS LAST LIMIT ${limit ?? 25}`;
        }
        try {
          const rawRows = await database.$queryRawUnsafe(query);
          const rows = serialize(rawRows);
          return {
            mode, threshold: mode === "inactive" ? `${days ?? 14} days` : undefined,
            count: Array.isArray(rows) ? rows.length : 0,
            users: (Array.isArray(rows) ? rows : []).map((r) => ({
              name: `${r.legal_first_name} ${r.legal_last_name}`, department: r.department ?? "Unassigned",
              lastLogin: r.last_login_at ? new Date(r.last_login_at).toLocaleString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "medium", timeStyle: "short" }) : "Never",
              loginCount: r.login_count ?? 0,
            })),
          };
        } catch { return { error: "Couldn't retrieve login data" }; }
      },
    }),

    getAuditLog: tool({
      description: "View recent audit log entries — what happened recently, who changed what.",
      inputSchema: z.object({
        action: z.string().optional().describe("Filter by action type: password_reset, role_changed, field_updated, offboarded, deactivated"),
        limit: z.number().optional().default(15),
      }),
      execute: async ({ action, limit }) => {
        const where = action ? { action: { contains: action, mode: "insensitive" } } : {};
        const logs = await database.auditLog.findMany({
          where, take: limit ?? 15, orderBy: { createdAt: "desc" },
          select: { id: true, action: true, actorUserId: true, objectType: true, objectId: true, oldValue: true, newValue: true, reason: true, createdAt: true },
        });
        return {
          count: logs.length,
          entries: logs.map((l) => ({
            action: l.action, objectType: l.objectType,
            oldValue: l.oldValue, newValue: l.newValue, reason: l.reason,
            when: l.createdAt ? new Date(l.createdAt).toLocaleString("en-US", { timeZone: "America/Los_Angeles" }) : "—",
          })),
        };
      },
    }),
  };

  // ─── Admin write tools ──────────────────────────────────────────────────

  const adminWriteTools = isAdmin ? {
    approveTimesheet: tool({
      description: "Approve a timesheet — by submission ID, or by person's name (approves their most recent submitted timesheet).",
      inputSchema: z.object({
        submissionId: z.string().optional(),
        employeeName: z.string().optional().describe("Person's name — will find and approve their latest submitted timesheet"),
      }),
      execute: async ({ submissionId, employeeName }) => {
        let subId = submissionId;
        if (!subId && employeeName) {
          const result = await resolveOneEmployee(undefined, employeeName);
          if (result.error) return result;
          const latest = await database.timesheetSubmission.findFirst({
            where: { employeeId: result.employee.id, status: "submitted" },
            orderBy: { createdAt: "desc" }, select: { id: true },
          });
          if (!latest) return { error: `${result.employee.legalFirstName} ${result.employee.legalLastName} has no submitted timesheets to approve.` };
          subId = latest.id;
        }
        if (!subId) return { error: "Need a submission ID or person's name." };
        const sub = await database.timesheetSubmission.findUnique({ where: { id: subId }, select: { id: true, status: true, totalHours: true, employee: { select: { legalFirstName: true, legalLastName: true } }, period: { select: { name: true } } } });
        if (!sub) return { error: "Submission not found" };
        if (sub.status === "approved") return { already: true, employee: `${sub.employee.legalFirstName} ${sub.employee.legalLastName}` };
        await database.timesheetSubmission.update({ where: { id: subId }, data: { status: "approved", reviewedAt: new Date() } });
        return { success: true, employee: `${sub.employee.legalFirstName} ${sub.employee.legalLastName}`, period: sub.period?.name, hours: Number(sub.totalHours ?? 0), newStatus: "approved" };
      },
    }),

    rejectTimesheet: tool({
      description: "Reject a timesheet — by submission ID or person's name.",
      inputSchema: z.object({
        submissionId: z.string().optional(),
        employeeName: z.string().optional(),
        reason: z.string(),
      }),
      execute: async ({ submissionId, employeeName, reason }) => {
        let subId = submissionId;
        if (!subId && employeeName) {
          const result = await resolveOneEmployee(undefined, employeeName);
          if (result.error) return result;
          const latest = await database.timesheetSubmission.findFirst({
            where: { employeeId: result.employee.id, status: "submitted" },
            orderBy: { createdAt: "desc" }, select: { id: true },
          });
          if (!latest) return { error: `${result.employee.legalFirstName} ${result.employee.legalLastName} has no submitted timesheets to reject.` };
          subId = latest.id;
        }
        if (!subId) return { error: "Need a submission ID or person's name." };
        const sub = await database.timesheetSubmission.findUnique({ where: { id: subId }, select: { id: true, employee: { select: { legalFirstName: true, legalLastName: true } }, period: { select: { name: true } } } });
        if (!sub) return { error: "Submission not found" };
        await database.timesheetSubmission.update({ where: { id: subId }, data: { status: "rejected", rejectionReason: reason, reviewedAt: new Date() } });
        return { success: true, employee: `${sub.employee.legalFirstName} ${sub.employee.legalLastName}`, period: sub.period?.name, newStatus: "rejected", reason };
      },
    }),

    approveTimeOff: tool({
      description: "Approve a time off request — by request ID or person's name (approves their most recent pending request).",
      inputSchema: z.object({
        requestId: z.string().optional(),
        employeeName: z.string().optional(),
      }),
      execute: async ({ requestId, employeeName }) => {
        let reqId = requestId;
        if (!reqId && employeeName) {
          const result = await resolveOneEmployee(undefined, employeeName);
          if (result.error) return result;
          const latest = await database.timeOffRequest.findFirst({
            where: { employeeId: result.employee.id, status: "pending" },
            orderBy: { createdAt: "desc" }, select: { id: true },
          });
          if (!latest) return { error: `${result.employee.legalFirstName} ${result.employee.legalLastName} has no pending time off requests.` };
          reqId = latest.id;
        }
        if (!reqId) return { error: "Need a request ID or person's name." };
        const req = await database.timeOffRequest.findUnique({ where: { id: reqId }, select: { id: true, status: true, totalDays: true, startDate: true, endDate: true, employee: { select: { legalFirstName: true, legalLastName: true } } } });
        if (!req) return { error: "Request not found" };
        if (req.status === "approved") return { already: true, employee: `${req.employee.legalFirstName} ${req.employee.legalLastName}` };
        await database.timeOffRequest.update({ where: { id: reqId }, data: { status: "approved", reviewedAt: new Date() } });
        return { success: true, employee: `${req.employee.legalFirstName} ${req.employee.legalLastName}`, days: req.totalDays, newStatus: "approved" };
      },
    }),

    rejectTimeOff: tool({
      description: "Reject a time off request — by request ID or person's name.",
      inputSchema: z.object({ requestId: z.string().optional(), employeeName: z.string().optional(), reason: z.string() }),
      execute: async ({ requestId, employeeName, reason }) => {
        let reqId = requestId;
        if (!reqId && employeeName) {
          const result = await resolveOneEmployee(undefined, employeeName);
          if (result.error) return result;
          const latest = await database.timeOffRequest.findFirst({
            where: { employeeId: result.employee.id, status: "pending" },
            orderBy: { createdAt: "desc" }, select: { id: true },
          });
          if (!latest) return { error: `No pending time off request found.` };
          reqId = latest.id;
        }
        if (!reqId) return { error: "Need a request ID or person's name." };
        const req = await database.timeOffRequest.findUnique({ where: { id: reqId }, select: { id: true, employee: { select: { legalFirstName: true, legalLastName: true } } } });
        if (!req) return { error: "Request not found" };
        await database.timeOffRequest.update({ where: { id: reqId }, data: { status: "rejected", rejectionReason: reason, reviewedAt: new Date() } });
        return { success: true, employee: `${req.employee.legalFirstName} ${req.employee.legalLastName}`, newStatus: "rejected", reason };
      },
    }),

    runReadOnlyQuery: tool({
      description: `Run a read-only SQL query for complex questions. Only SELECT.
KEY TABLES: app_users(id,email,display_name,is_active,last_login_at,login_count), hriq_employees(id,legal_first_name,legal_last_name,preferred_name,personal_email,work_email,department,role,employment_status,hourly_rate,monthly_salary,currency,country,linked_user_id→app_users.id,organization_id,start_date,compensation_type,username), organizations(id,name,slug), organization_members(id,user_id,organization_id,role), timesheet_periods(id,name,start_date,end_date,status), timesheet_submissions(id,employee_id,period_id,status,total_hours,bonus_total,daily_entries,bonuses), hriq_payments(id,employee_id,amount,currency,status,payment_method,payment_date), pay_runs(id,name,status,total_amount), pay_run_items(id,pay_run_id,employee_id,hours_worked,hourly_rate,gross_amount,net_amount), time_off_requests(id,employee_id,start_date,end_date,total_days,status,reason), hriq_audit_log(id,timestamp,action,actor_user_id,object_type,old_value,new_value,reason), hriq_documents(id,employee_id,document_type,document_name,status)
JOIN: hriq_employees e JOIN app_users u ON e.linked_user_id = u.supabase_user_id`,
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => {
        const trimmed = query.trim();
        if (/^\s*(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE)/i.test(trimmed)) return { error: "Only SELECT queries allowed." };
        if (!trimmed.toUpperCase().startsWith("SELECT")) return { error: "Query must start with SELECT." };
        const safeSql = /\bLIMIT\b/i.test(trimmed) ? trimmed : `${trimmed} LIMIT 50`;
        try {
          const rawResult = await database.$queryRawUnsafe(safeSql);
          const result = serialize(rawResult);
          return { rows: result, count: Array.isArray(result) ? result.length : 0 };
        } catch (err) { return { error: err instanceof Error ? err.message : "Query failed" }; }
      },
    }),
  } : {};

  // ─── Super admin write tools ────────────────────────────────────────────

  const superAdminTools = isSuperAdmin ? {
    resetPassword: tool({
      description: "Reset a contractor's dashboard password. Sends them an email with temporary creds.",
      inputSchema: z.object({ employeeId: z.string().optional(), name: z.string().optional(), newPassword: z.string().optional() }),
      execute: async ({ employeeId, name, newPassword }) => {
        const result = await resolveOneEmployee(employeeId, name);
        if (result.error) return result;
        const emp = result.employee;
        if (!emp.linkedUserId) return { error: `${emp.legalFirstName} ${emp.legalLastName} has no dashboard account — can't reset password.` };

        const password = newPassword || getDefaultPassword();
        const supabaseAdmin = getSupabaseAdmin();
        const { error } = await supabaseAdmin.auth.admin.updateUserById(emp.linkedUserId, {
          password, user_metadata: { isFirstLogin: true, passwordChanged: false },
        });
        if (error) return { error: `Failed: ${error.message}` };

        const email = emp.personalEmail ?? emp.workEmail;
        if (email) {
          try {
            const { sendViaGmailSystem } = await import("@/app/actions/hriq/send-email");
            const { layout, heading, greeting, paragraph, primaryButton } = await import("@/app/actions/hriq/email-templates");
            const { APP_URL, normalizeAppUrl } = await import("@/app/actions/hriq/constants");
            const appUrl = normalizeAppUrl(APP_URL);
            const html = layout(
              heading("Your Password Has Been Reset") + greeting(emp.legalFirstName) +
              paragraph("Your dashboard password has been reset. Use the temporary password below to log in, then create a new one.") +
              `<div style="margin:20px 0;padding:16px 20px;background:#f4f5f7;border-radius:8px;text-align:center"><p style="margin:0 0 4px;font-size:12px;color:#6b7280">Temporary Password</p><p style="margin:0;font-size:20px;font-weight:700;letter-spacing:1px;font-family:monospace;color:#1a1a2e">${password}</p></div>` +
              paragraph("You'll be required to change this on your next login.") + primaryButton("Log In Now", `${appUrl}/sign-in`)
            );
            await sendViaGmailSystem(email, "Your Password Has Been Reset — Action Required", html);
          } catch (emailErr) { console.error("[AI] Password reset email failed:", emailErr); }
        }
        try { await database.auditLog.create({ data: { actorType: "user", actorUserId: session.userId, action: "employee.password_reset", objectType: "employee", objectId: emp.id, reason: "Reset via RL Assistant" } }); } catch {}
        return { success: true, employee: `${emp.legalFirstName} ${emp.legalLastName}`, emailSent: !!email, note: "Password reset. They'll be forced to change it on next login." };
      },
    }),

    deactivateAccount: tool({
      description: "Deactivate a user's account (prevents login).",
      inputSchema: z.object({ employeeId: z.string().optional(), name: z.string().optional() }),
      execute: async ({ employeeId, name }) => {
        const result = await resolveOneEmployee(employeeId, name);
        if (result.error) return result;
        const emp = result.employee;
        if (!emp.linkedUserId) return { error: `${emp.legalFirstName} ${emp.legalLastName} has no account.` };
        await database.appUser.update({ where: { supabaseUserId: emp.linkedUserId }, data: { isActive: false } });
        try { await database.auditLog.create({ data: { actorType: "user", actorUserId: session.userId, action: "user.deactivated", objectType: "app_user", objectId: emp.linkedUserId, reason: "Deactivated via RL Assistant" } }); } catch {}
        return { success: true, employee: `${emp.legalFirstName} ${emp.legalLastName}`, action: "deactivated" };
      },
    }),

    reactivateAccount: tool({
      description: "Reactivate a deactivated user account.",
      inputSchema: z.object({ employeeId: z.string().optional(), name: z.string().optional() }),
      execute: async ({ employeeId, name }) => {
        const result = await resolveOneEmployee(employeeId, name);
        if (result.error) return result;
        const emp = result.employee;
        if (!emp.linkedUserId) return { error: `${emp.legalFirstName} ${emp.legalLastName} has no account.` };
        await database.appUser.update({ where: { supabaseUserId: emp.linkedUserId }, data: { isActive: true } });
        return { success: true, employee: `${emp.legalFirstName} ${emp.legalLastName}`, action: "reactivated" };
      },
    }),

    updateEmployeeField: tool({
      description: "Update a field on a contractor's record — department, title, pay rate, email, country, status, etc.",
      inputSchema: z.object({
        employeeId: z.string().optional(), name: z.string().optional(),
        field: z.string().describe("department, jobTitle, hourlyRate, monthlySalary, currency, country, personalEmail, workEmail, preferredPaymentMethod, employmentStatus, compensationType, employmentType"),
        value: z.string(),
      }),
      execute: async ({ employeeId, name, field, value }) => {
        const result = await resolveOneEmployee(employeeId, name);
        if (result.error) return result;
        const emp = result.employee;
        const allowed = ["department", "jobTitle", "hourlyRate", "monthlySalary", "currency", "country", "personalEmail", "workEmail", "preferredPaymentMethod", "employmentStatus", "compensationType", "employmentType"];
        if (!allowed.includes(field)) return { error: `Can't update '${field}'.` };
        let parsed = value;
        if (field === "hourlyRate" || field === "monthlySalary") parsed = parseFloat(value.replace(/[,$]/g, ""));
        const old = await database.employee.findUnique({ where: { id: emp.id }, select: { [field]: true } });
        await database.employee.update({ where: { id: emp.id }, data: { [field]: parsed } });
        try { await database.auditLog.create({ data: { actorType: "user", actorUserId: session.userId, action: "employee.field_updated", objectType: "employee", objectId: emp.id, oldValue: { [field]: old?.[field] }, newValue: { [field]: parsed }, reason: "Updated via RL Assistant" } }); } catch {}
        return { success: true, employee: `${emp.legalFirstName} ${emp.legalLastName}`, field, oldValue: old?.[field] ?? "—", newValue: value };
      },
    }),

    clearPaymentGate: tool({
      description: "Clear a payment gate (Wise, Cadana, or both).",
      inputSchema: z.object({ employeeId: z.string().optional(), name: z.string().optional(), gateType: z.enum(["wise", "cadana", "all"]).default("all") }),
      execute: async ({ employeeId, name, gateType }) => {
        const result = await resolveOneEmployee(employeeId, name);
        if (result.error) return result;
        const emp = result.employee;
        const data = {};
        if (gateType === "wise" || gateType === "all") data.wiseGateRequired = false;
        if (gateType === "cadana" || gateType === "all") data.cadanaGateRequired = false;
        await database.employee.update({ where: { id: emp.id }, data });
        return { success: true, cleared: gateType, employee: `${emp.legalFirstName} ${emp.legalLastName}` };
      },
    }),

    changeEmployeeRole: tool({
      description: "Change a contractor's dashboard role. Roles: super_admin, admin, manager, member.",
      inputSchema: z.object({ employeeId: z.string().optional(), name: z.string().optional(), newRole: z.enum(["super_admin", "admin", "manager", "member"]) }),
      execute: async ({ employeeId, name, newRole }) => {
        const result = await resolveOneEmployee(employeeId, name);
        if (result.error) return result;
        const emp = result.employee;
        if (!emp.linkedUserId) return { error: `${emp.legalFirstName} ${emp.legalLastName} has no account.` };
        if (emp.linkedUserId === session.userId) return { error: "Can't change your own role." };
        const membership = await database.organizationMember.findFirst({ where: { userId: emp.linkedUserId }, select: { id: true, role: true, organization: { select: { name: true } } } });
        if (!membership) return { error: "No org membership found." };
        const oldRole = membership.role;
        await database.organizationMember.update({ where: { id: membership.id }, data: { role: newRole } });
        try { await database.auditLog.create({ data: { actorType: "user", actorUserId: session.userId, action: "employee.role_changed", objectType: "organization_member", objectId: membership.id, oldValue: { role: oldRole }, newValue: { role: newRole }, reason: "Changed via RL Assistant" } }); } catch {}
        return { success: true, employee: `${emp.legalFirstName} ${emp.legalLastName}`, org: membership.organization?.name, oldRole, newRole };
      },
    }),

    markPaymentPaid: tool({
      description: "Mark a payment as paid — by payment ID, or by person's name (marks their most recent pending payment).",
      inputSchema: z.object({ paymentId: z.string().optional(), employeeName: z.string().optional() }),
      execute: async ({ paymentId, employeeName }) => {
        let pId = paymentId;
        if (!pId && employeeName) {
          const result = await resolveOneEmployee(undefined, employeeName);
          if (result.error) return result;
          const latest = await database.payment.findFirst({
            where: { employeeId: result.employee.id, status: { in: ["pending", "processing"] } },
            orderBy: { createdAt: "desc" }, select: { id: true },
          });
          if (!latest) return { error: `${result.employee.legalFirstName} ${result.employee.legalLastName} has no pending payments.` };
          pId = latest.id;
        }
        if (!pId) return { error: "Need a payment ID or person's name." };
        const payment = await database.payment.findUnique({ where: { id: pId }, select: { id: true, status: true, amount: true, currency: true, employee: { select: { legalFirstName: true, legalLastName: true } } } });
        if (!payment) return { error: "Payment not found" };
        if (payment.status === "paid") return { already: true, employee: `${payment.employee.legalFirstName} ${payment.employee.legalLastName}` };
        await database.payment.update({ where: { id: pId }, data: { status: "paid", paidAt: new Date() } });
        return { success: true, employee: `${payment.employee.legalFirstName} ${payment.employee.legalLastName}`, amount: Number(payment.amount ?? 0), currency: payment.currency, newStatus: "paid" };
      },
    }),

    initiateOffboarding: tool({
      description: "Start offboarding for a contractor — changes status to offboarded and deactivates account.",
      inputSchema: z.object({ employeeId: z.string().optional(), name: z.string().optional(), reason: z.string().optional() }),
      execute: async ({ employeeId, name, reason }) => {
        const result = await resolveOneEmployee(employeeId, name);
        if (result.error) return result;
        const emp = result.employee;
        if (emp.employmentStatus === "offboarded") return { already: true, employee: `${emp.legalFirstName} ${emp.legalLastName}` };
        const prev = emp.employmentStatus;
        await database.employee.update({ where: { id: emp.id }, data: { employmentStatus: "offboarded", offboardedAt: new Date() } });
        if (emp.linkedUserId) { await database.appUser.update({ where: { supabaseUserId: emp.linkedUserId }, data: { isActive: false } }).catch(() => {}); }
        try { await database.auditLog.create({ data: { actorType: "user", actorUserId: session.userId, action: "employee.offboarded", objectType: "employee", objectId: emp.id, oldValue: { status: prev }, newValue: { status: "offboarded" }, reason: reason ?? "Offboarded via RL Assistant" } }); } catch {}
        return { success: true, employee: `${emp.legalFirstName} ${emp.legalLastName}`, previousStatus: prev, newStatus: "offboarded", accountDeactivated: !!emp.linkedUserId };
      },
    }),

    unapproveTimesheet: tool({
      description: "Unapprove a timesheet (revert to submitted) — by ID or person's name.",
      inputSchema: z.object({ submissionId: z.string().optional(), employeeName: z.string().optional() }),
      execute: async ({ submissionId, employeeName }) => {
        let subId = submissionId;
        if (!subId && employeeName) {
          const result = await resolveOneEmployee(undefined, employeeName);
          if (result.error) return result;
          const latest = await database.timesheetSubmission.findFirst({
            where: { employeeId: result.employee.id, status: "approved" },
            orderBy: { createdAt: "desc" }, select: { id: true },
          });
          if (!latest) return { error: `No approved timesheet found for ${result.employee.legalFirstName}.` };
          subId = latest.id;
        }
        if (!subId) return { error: "Need a submission ID or person's name." };
        const sub = await database.timesheetSubmission.findUnique({ where: { id: subId }, select: { id: true, status: true, employee: { select: { legalFirstName: true, legalLastName: true } } } });
        if (!sub) return { error: "Submission not found" };
        if (sub.status !== "approved") return { error: `Can't unapprove — current status is "${sub.status}"` };
        await database.timesheetSubmission.update({ where: { id: subId }, data: { status: "submitted", reviewedAt: null } });
        return { success: true, employee: `${sub.employee.legalFirstName} ${sub.employee.legalLastName}`, newStatus: "submitted" };
      },
    }),

    lockTimesheetPeriod: tool({
      description: "Lock a timesheet period.",
      inputSchema: z.object({ periodId: z.string() }),
      execute: async ({ periodId }) => {
        const p = await database.timesheetPeriod.findUnique({ where: { id: periodId } });
        if (!p) return { error: "Period not found" };
        await database.timesheetPeriod.update({ where: { id: periodId }, data: { status: "locked" } });
        return { success: true, period: p.name, newStatus: "locked" };
      },
    }),

    unlockTimesheetPeriod: tool({
      description: "Unlock a timesheet period.",
      inputSchema: z.object({ periodId: z.string() }),
      execute: async ({ periodId }) => {
        const p = await database.timesheetPeriod.findUnique({ where: { id: periodId } });
        if (!p) return { error: "Period not found" };
        await database.timesheetPeriod.update({ where: { id: periodId }, data: { status: "open" } });
        return { success: true, period: p.name, newStatus: "open" };
      },
    }),

    approveExpenseReport: tool({
      description: "Approve an expense report — by ID or person's name.",
      inputSchema: z.object({ reportId: z.string().optional(), employeeName: z.string().optional() }),
      execute: async ({ reportId, employeeName }) => {
        let rId = reportId;
        if (!rId && employeeName) {
          const result = await resolveOneEmployee(undefined, employeeName);
          if (result.error) return result;
          const latest = await database.expenseReport.findFirst({
            where: { employeeId: result.employee.id, status: "pending" },
            orderBy: { createdAt: "desc" }, select: { id: true },
          });
          if (!latest) return { error: `No pending expense report found.` };
          rId = latest.id;
        }
        if (!rId) return { error: "Need a report ID or person's name." };
        const r = await database.expenseReport.findUnique({ where: { id: rId }, select: { id: true, status: true, employee: { select: { legalFirstName: true, legalLastName: true } } } });
        if (!r) return { error: "Report not found" };
        await database.expenseReport.update({ where: { id: rId }, data: { status: "approved", reviewedAt: new Date() } });
        return { success: true, employee: `${r.employee.legalFirstName} ${r.employee.legalLastName}`, newStatus: "approved" };
      },
    }),
  } : {};

  // ─── Build and run ──────────────────────────────────────────────────────

  try {
    const result = streamText({
      model: gateway("anthropic/claude-sonnet-4"),
      system: buildSystemPrompt(effectiveRole),
      messages: convertToModelMessages(messages),
      maxOutputTokens: 4096,
      stopWhen: stepCountIs(15),
      tools: { ...readTools, ...adminWriteTools, ...superAdminTools },
    });

    return result.toUIMessageStreamResponse();
  } catch (err) {
    console.error("[AI Chat]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "AI error" }, { status: 500 });
  }
}
