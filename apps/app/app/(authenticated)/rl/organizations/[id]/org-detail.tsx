"use client";

import { revokeInvitation } from "@/app/actions/hriq/invitations";
import { updateUserRole } from "@/app/actions/hriq/users";
import { addContractorToOrg, recordPaymentForOrg, updatePaymentStatusForOrg, createTaskForOrg, completeTaskForOrg, addDocumentForOrg, verifyDocumentForOrg, inviteMemberToOrg } from "@/app/actions/hriq/org-management";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const ROLE_LABELS: Record<string, string> = { super_admin: "Super Admin", admin: "Admin", manager: "Manager", bookkeeper: "Bookkeeper", va: "VA", member: "Member", owner: "Owner" };
const ROLE_COLORS: Record<string, string> = { super_admin: "bg-purple-100 text-purple-800", admin: "bg-blue-100 text-blue-800", manager: "bg-green-100 text-green-800", bookkeeper: "bg-yellow-100 text-yellow-800", va: "bg-orange-100 text-orange-800", member: "bg-gray-100 text-gray-600" };
const STATUS_COLORS: Record<string, string> = { active: "bg-green-100 text-green-800", pre_hire: "bg-blue-100 text-blue-800", onboarding_in_progress: "bg-yellow-100 text-yellow-800", onboarding_scheduled: "bg-yellow-100 text-yellow-800", offboarded: "bg-gray-100 text-gray-500", completed: "bg-green-100 text-green-800", pending: "bg-yellow-100 text-yellow-800", processing: "bg-blue-100 text-blue-800", failed: "bg-red-100 text-red-800", verified: "bg-green-100 text-green-800" };
const ROLES = ["super_admin", "admin", "manager", "bookkeeper", "va", "member"];

type PaymentRecord = { id: string; amount: unknown; currency: string; status: string; paymentType: string; paymentMethod: string | null; periodStart: Date | null; periodEnd: Date | null; createdAt: Date; employee: { legalFirstName: string; legalLastName: string } };
type TaskRecord = { id: string; title: string; status: string; dueDate: Date | null; createdAt: Date; employee: { legalFirstName: string; legalLastName: string } };
type DocumentRecord = { id: string; documentType: string; fileName: string | null; status: string; createdAt: Date; employee: { legalFirstName: string; legalLastName: string } };
type EmployeeRecord = { id: string; legalFirstName: string; legalLastName: string; employeeNumber: string; jobTitle: string | null; department: string | null; employmentStatus: string; employmentType: string; hourlyRate: unknown; currency: string; createdAt: Date };

type Props = {
  org: { id: string; name: string; slug: string; logoUrl: string | null; createdAt: Date; updatedAt: Date; _count: { members: number; employees: number; announcements: number; batchSessions: number } };
  members: Array<{ id: string; userId: string; role: string; createdAt: Date }>;
  employees: EmployeeRecord[];
  invitations: Array<{ id: string; email: string; role: string; expiresAt: Date; createdAt: Date }>;
  recentAudit: Array<{ id: string; action: string; objectType: string; timestamp: Date }>;
  payments: PaymentRecord[];
  tasks: TaskRecord[];
  documents: DocumentRecord[];
  employeesByStatus: Record<string, number>;
  employeesByDept: Record<string, number>;
};

export function OrgDetail({ org, members, employees, invitations, recentAudit, payments, tasks, documents, employeesByStatus, employeesByDept }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [tab, setTab] = useState<"overview" | "members" | "contractors" | "payments" | "tasks" | "documents" | "activity">("overview");
  const [showDialog, setShowDialog] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => { setShowDialog(null); setError(null); router.refresh(); };

  const handleAction = (fn: () => Promise<unknown>) => {
    startTransition(async () => {
      try { await fn(); refresh(); } catch (err) { setError(err instanceof Error ? err.message : "Action failed"); }
    });
  };

  const totalPaid = payments.filter((p) => p.status === "completed").reduce((s, p) => s + Number(p.amount), 0);
  const totalPending = payments.filter((p) => p.status === "pending").reduce((s, p) => s + Number(p.amount), 0);
  const openTasks = tasks.filter((t) => t.status !== "completed").length;

  const tabs = [
    { key: "overview" as const, label: "Overview" },
    { key: "members" as const, label: `Members (${members.length})` },
    { key: "contractors" as const, label: `Contractors (${employees.length})` },
    { key: "payments" as const, label: `Payments (${payments.length})` },
    { key: "tasks" as const, label: `Tasks (${tasks.length})` },
    { key: "documents" as const, label: `Docs (${documents.length})` },
    { key: "activity" as const, label: "Activity" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-xl font-bold text-primary-foreground">{org.name.charAt(0)}</div>
            <div>
              <h2 className="text-2xl font-bold">{org.name}</h2>
              <p className="text-sm text-muted-foreground">Created {new Date(org.createdAt).toLocaleDateString()}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowDialog("invite")} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">+ Invite</button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-6 gap-3">
          {[
            { v: org._count.members, l: "Members" }, { v: org._count.employees, l: "Contractors" },
            { v: `$${totalPaid.toLocaleString()}`, l: "Paid" }, { v: `$${totalPending.toLocaleString()}`, l: "Pending" },
            { v: openTasks, l: "Open Tasks" }, { v: invitations.length, l: "Invites" },
          ].map((s) => (
            <div key={s.l} className="rounded-lg bg-muted/50 p-3 text-center">
              <div className="text-xl font-bold">{s.v}</div>
              <div className="text-[10px] text-muted-foreground">{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto rounded-lg bg-muted p-1">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors ${tab === t.key ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
        ))}
      </div>

      {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error} <button onClick={() => setError(null)} className="ml-2 underline">dismiss</button></div>}

      {/* Overview */}
      {tab === "overview" && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border bg-card p-6">
            <h3 className="font-semibold">Contractors by Status</h3>
            <div className="mt-4 space-y-2">
              {Object.entries(employeesByStatus).map(([s, c]) => (
                <div key={s} className="flex items-center justify-between"><span className="text-sm capitalize">{s.replace(/_/g, " ")}</span><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[s] ?? "bg-gray-100"}`}>{c}</span></div>
              ))}
              {Object.keys(employeesByStatus).length === 0 && <p className="text-sm text-muted-foreground">No contractors yet. <button onClick={() => setShowDialog("contractor")} className="text-primary underline">Add one</button></p>}
            </div>
          </div>
          <div className="rounded-xl border bg-card p-6">
            <h3 className="font-semibold">Contractors by Department</h3>
            <div className="mt-4 space-y-2">
              {Object.entries(employeesByDept).map(([d, c]) => (
                <div key={d} className="flex items-center justify-between"><span className="text-sm">{d}</span><span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{c}</span></div>
              ))}
              {Object.keys(employeesByDept).length === 0 && <p className="text-sm text-muted-foreground">No departments yet.</p>}
            </div>
          </div>
          <div className="rounded-xl border bg-card p-6">
            <h3 className="font-semibold">Payment Summary</h3>
            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Total Paid</span><span className="font-medium text-green-600">${totalPaid.toLocaleString()}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Pending</span><span className="font-medium text-yellow-600">${totalPending.toLocaleString()}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Total Records</span><span className="font-medium">{payments.length}</span></div>
            </div>
          </div>
          <div className="rounded-xl border bg-card p-6">
            <h3 className="font-semibold">Quick Actions</h3>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button onClick={() => setShowDialog("contractor")} className="rounded-lg border p-3 text-center text-sm hover:bg-muted/50">+ Add Contractor</button>
              <button onClick={() => setShowDialog("payment")} className="rounded-lg border p-3 text-center text-sm hover:bg-muted/50">+ Record Payment</button>
              <button onClick={() => setShowDialog("task")} className="rounded-lg border p-3 text-center text-sm hover:bg-muted/50">+ Create Task</button>
              <button onClick={() => setShowDialog("invite")} className="rounded-lg border p-3 text-center text-sm hover:bg-muted/50">+ Invite Member</button>
            </div>
          </div>
        </div>
      )}

      {/* Members */}
      {tab === "members" && (
        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-6">
            <div className="flex items-center justify-between"><h3 className="font-semibold">Members</h3><button onClick={() => setShowDialog("invite")} className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground">+ Invite</button></div>
            <div className="mt-4 space-y-2">
              {members.map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{m.userId.charAt(0).toUpperCase()}</div>
                    <div><div className="text-sm font-mono">{m.userId.slice(0, 16)}...</div><div className="text-xs text-muted-foreground">Joined {new Date(m.createdAt).toLocaleDateString()}</div></div>
                  </div>
                  <select value={m.role} onChange={(e) => handleAction(() => updateUserRole(m.id, e.target.value))} disabled={isPending} className={`h-7 rounded-md border-0 px-2 text-xs font-medium cursor-pointer ${ROLE_COLORS[m.role] ?? "bg-gray-100"}`}>
                    {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select>
                </div>
              ))}
              {members.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No members.</p>}
            </div>
          </div>
          {invitations.length > 0 && (
            <div className="rounded-xl border bg-card p-6">
              <h3 className="font-semibold">Pending Invitations</h3>
              <div className="mt-4 space-y-2">
                {invitations.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between rounded-lg border border-dashed p-3">
                    <div><span className="text-sm font-medium">{inv.email}</span><span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${ROLE_COLORS[inv.role] ?? "bg-gray-100"}`}>{ROLE_LABELS[inv.role]}</span></div>
                    <button onClick={() => handleAction(() => revokeInvitation(inv.id))} disabled={isPending} className="text-xs text-red-600 hover:underline">Revoke</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Contractors */}
      {tab === "contractors" && (
        <div className="space-y-4">
          <div className="flex justify-end"><button onClick={() => setShowDialog("contractor")} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">+ Add Contractor</button></div>
          <div className="rounded-xl border bg-card"><div className="overflow-x-auto"><table className="w-full"><thead><tr className="border-b text-left text-sm text-muted-foreground"><th className="px-4 py-3 font-medium">Contractor</th><th className="px-4 py-3 font-medium">ID</th><th className="px-4 py-3 font-medium">Title / Dept</th><th className="px-4 py-3 font-medium">Type</th><th className="px-4 py-3 font-medium">Rate</th><th className="px-4 py-3 font-medium">Status</th></tr></thead><tbody>
            {employees.map((e) => (
              <tr key={e.id} className="border-b last:border-0 hover:bg-muted/50">
                <td className="px-4 py-3"><Link href={`/client/employees/${e.id}`} className="text-sm font-medium hover:underline">{e.legalFirstName} {e.legalLastName}</Link></td>
                <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{e.employeeNumber}</td>
                <td className="px-4 py-3 text-sm">{e.jobTitle ?? "—"} {e.department ? `· ${e.department}` : ""}</td>
                <td className="px-4 py-3"><span className="rounded bg-muted px-1.5 py-0.5 text-xs capitalize">{e.employmentType.replace(/_/g, " ")}</span></td>
                <td className="px-4 py-3 text-sm">{e.hourlyRate ? `${e.hourlyRate} ${e.currency}` : "—"}</td>
                <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs capitalize ${STATUS_COLORS[e.employmentStatus] ?? "bg-gray-100"}`}>{e.employmentStatus.replace(/_/g, " ")}</span></td>
              </tr>
            ))}
            {employees.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No contractors. <button onClick={() => setShowDialog("contractor")} className="text-primary underline">Add one</button></td></tr>}
          </tbody></table></div></div>
        </div>
      )}

      {/* Payments */}
      {tab === "payments" && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border bg-card p-5 text-center"><div className="text-2xl font-bold text-green-600">${totalPaid.toLocaleString()}</div><div className="text-xs text-muted-foreground">Completed</div></div>
            <div className="rounded-xl border bg-card p-5 text-center"><div className="text-2xl font-bold text-yellow-600">${totalPending.toLocaleString()}</div><div className="text-xs text-muted-foreground">Pending</div></div>
            <div className="rounded-xl border bg-card p-5"><button onClick={() => setShowDialog("payment")} className="flex h-full w-full items-center justify-center rounded-lg border-2 border-dashed text-sm font-medium text-muted-foreground hover:border-primary hover:text-primary">+ Record Payment</button></div>
          </div>
          <div className="rounded-xl border bg-card"><div className="overflow-x-auto"><table className="w-full"><thead><tr className="border-b text-left text-sm text-muted-foreground"><th className="px-4 py-3 font-medium">Contractor</th><th className="px-4 py-3 font-medium">Type</th><th className="px-4 py-3 font-medium">Amount</th><th className="px-4 py-3 font-medium">Method</th><th className="px-4 py-3 font-medium">Period</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Action</th></tr></thead><tbody>
            {payments.map((p) => (
              <tr key={p.id} className="border-b last:border-0 hover:bg-muted/50">
                <td className="px-4 py-3 text-sm font-medium">{p.employee.legalFirstName} {p.employee.legalLastName}</td>
                <td className="px-4 py-3"><span className="rounded bg-muted px-1.5 py-0.5 text-xs capitalize">{p.paymentType}</span></td>
                <td className="px-4 py-3 text-sm font-medium">${Number(p.amount).toLocaleString()} {p.currency}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground capitalize">{p.paymentMethod?.replace(/_/g, " ") ?? "—"}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{p.periodStart ? `${new Date(p.periodStart).toLocaleDateString()} – ${p.periodEnd ? new Date(p.periodEnd).toLocaleDateString() : ""}` : new Date(p.createdAt).toLocaleDateString()}</td>
                <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs capitalize ${STATUS_COLORS[p.status] ?? "bg-gray-100"}`}>{p.status}</span></td>
                <td className="px-4 py-3">
                  {p.status === "pending" && (
                    <div className="flex gap-1">
                      <button onClick={() => handleAction(() => updatePaymentStatusForOrg(p.id, "processing"))} disabled={isPending} className="h-6 rounded bg-blue-600 px-2 text-[10px] font-medium text-white">Process</button>
                      <button onClick={() => handleAction(() => updatePaymentStatusForOrg(p.id, "completed"))} disabled={isPending} className="h-6 rounded bg-green-600 px-2 text-[10px] font-medium text-white">Paid</button>
                    </div>
                  )}
                  {p.status === "processing" && (
                    <button onClick={() => handleAction(() => updatePaymentStatusForOrg(p.id, "completed"))} disabled={isPending} className="h-6 rounded bg-green-600 px-2 text-[10px] font-medium text-white">Mark Paid</button>
                  )}
                </td>
              </tr>
            ))}
            {payments.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No payments. <button onClick={() => setShowDialog("payment")} className="text-primary underline">Record one</button></td></tr>}
          </tbody></table></div></div>
        </div>
      )}

      {/* Tasks */}
      {tab === "tasks" && (
        <div className="space-y-4">
          <div className="flex justify-end"><button onClick={() => setShowDialog("task")} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">+ Create Task</button></div>
          <div className="rounded-xl border bg-card"><div className="overflow-x-auto"><table className="w-full"><thead><tr className="border-b text-left text-sm text-muted-foreground"><th className="px-4 py-3 font-medium">Task</th><th className="px-4 py-3 font-medium">Contractor</th><th className="px-4 py-3 font-medium">Due</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Action</th></tr></thead><tbody>
            {tasks.map((t) => (
              <tr key={t.id} className="border-b last:border-0 hover:bg-muted/50">
                <td className="px-4 py-3 text-sm font-medium">{t.title}</td>
                <td className="px-4 py-3 text-sm">{t.employee.legalFirstName} {t.employee.legalLastName}</td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{t.dueDate ? new Date(t.dueDate).toLocaleDateString() : "—"}</td>
                <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs capitalize ${STATUS_COLORS[t.status] ?? "bg-gray-100"}`}>{t.status.replace(/_/g, " ")}</span></td>
                <td className="px-4 py-3">{t.status !== "completed" && <button onClick={() => handleAction(() => completeTaskForOrg(t.id))} disabled={isPending} className="h-6 rounded bg-green-600 px-2 text-[10px] font-medium text-white">Complete</button>}</td>
              </tr>
            ))}
            {tasks.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No tasks. <button onClick={() => setShowDialog("task")} className="text-primary underline">Create one</button></td></tr>}
          </tbody></table></div></div>
        </div>
      )}

      {/* Documents */}
      {tab === "documents" && (
        <div className="space-y-4">
          <div className="flex justify-end"><button onClick={() => setShowDialog("document")} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">+ Add Document</button></div>
          <div className="rounded-xl border bg-card"><div className="overflow-x-auto"><table className="w-full"><thead><tr className="border-b text-left text-sm text-muted-foreground"><th className="px-4 py-3 font-medium">Type</th><th className="px-4 py-3 font-medium">Contractor</th><th className="px-4 py-3 font-medium">File</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Action</th></tr></thead><tbody>
            {documents.map((d) => (
              <tr key={d.id} className="border-b last:border-0 hover:bg-muted/50">
                <td className="px-4 py-3"><span className="rounded bg-muted px-1.5 py-0.5 text-xs capitalize">{d.documentType.replace(/_/g, " ")}</span></td>
                <td className="px-4 py-3 text-sm">{d.employee.legalFirstName} {d.employee.legalLastName}</td>
                <td className="px-4 py-3 text-sm">{d.fileName ?? "—"}</td>
                <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs capitalize ${STATUS_COLORS[d.status] ?? "bg-gray-100"}`}>{d.status}</span></td>
                <td className="px-4 py-3">{d.status === "pending" && <button onClick={() => handleAction(() => verifyDocumentForOrg(d.id, "system"))} disabled={isPending} className="h-6 rounded bg-green-600 px-2 text-[10px] font-medium text-white">Verify</button>}</td>
              </tr>
            ))}
            {documents.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No documents. <button onClick={() => setShowDialog("document")} className="text-primary underline">Add one</button></td></tr>}
          </tbody></table></div></div>
        </div>
      )}

      {/* Activity */}
      {tab === "activity" && (
        <div className="rounded-xl border bg-card p-6"><h3 className="font-semibold">Recent Activity</h3><div className="mt-4 space-y-2">
          {recentAudit.map((log) => (<div key={log.id} className="flex items-center justify-between rounded-lg border p-3"><div><div className="text-sm font-medium capitalize">{log.action.replace(/\./g, " → ")}</div><div className="text-xs text-muted-foreground">{log.objectType}</div></div><span className="text-xs text-muted-foreground">{new Date(log.timestamp).toLocaleString()}</span></div>))}
          {recentAudit.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No activity.</p>}
        </div></div>
      )}

      {/* === DIALOGS === */}

      {/* Add Contractor Dialog */}
      {showDialog === "contractor" && (
        <Dialog title="Add Contractor" onClose={() => setShowDialog(null)}>
          <FormHandler onSubmit={(fd) => handleAction(() => addContractorToOrg(org.id, { legalFirstName: fd.get("firstName") as string, legalLastName: fd.get("lastName") as string, employmentType: fd.get("type") as string, personalEmail: fd.get("email") as string, department: fd.get("dept") as string, jobTitle: fd.get("title") as string, hourlyRate: fd.get("rate") as string, currency: fd.get("currency") as string || "USD", startDate: fd.get("start") as string }))} isPending={isPending}>
            <div className="grid grid-cols-2 gap-3">
              <Input name="firstName" label="First Name *" required />
              <Input name="lastName" label="Last Name *" required />
            </div>
            <Input name="email" label="Email" type="email" />
            <div className="grid grid-cols-2 gap-3">
              <Select name="type" label="Type" options={[["contractor","Contractor"],["full_time","Full Time"],["part_time","Part Time"]]} />
              <Input name="dept" label="Department" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input name="title" label="Job Title" />
              <Input name="rate" label="Hourly Rate" type="number" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Select name="currency" label="Currency" options={[["USD","USD"],["PHP","PHP"],["EUR","EUR"],["GBP","GBP"]]} />
              <Input name="start" label="Start Date" type="date" />
            </div>
          </FormHandler>
        </Dialog>
      )}

      {/* Record Payment Dialog */}
      {showDialog === "payment" && (
        <Dialog title="Record Payment" onClose={() => setShowDialog(null)}>
          {employees.length === 0 ? (
            <div className="py-6 text-center text-muted-foreground">
              <p>No contractors in this organization yet.</p>
              <button onClick={() => setShowDialog("contractor")} className="mt-2 text-sm text-primary underline">Add a contractor first</button>
            </div>
          ) : (
          <FormHandler onSubmit={(fd) => handleAction(() => recordPaymentForOrg(org.id, { employeeId: fd.get("empId") as string, amount: fd.get("amount") as string, currency: fd.get("currency") as string || "USD", paymentType: fd.get("payType") as string, paymentMethod: fd.get("method") as string, periodStart: fd.get("pStart") as string, periodEnd: fd.get("pEnd") as string, notes: fd.get("notes") as string }))} isPending={isPending} error={error}>
            <Select name="empId" label="Contractor *" required options={employees.map((e) => [e.id, `${e.legalFirstName} ${e.legalLastName} (${e.employeeNumber})`])} />
            <div className="grid grid-cols-3 gap-3">
              <Input name="amount" label="Amount *" type="number" required />
              <Select name="currency" label="Currency" options={[["USD","USD"],["PHP","PHP"],["EUR","EUR"]]} />
              <Select name="payType" label="Type *" required options={[["salary","Salary"],["bonus","Bonus"],["reimbursement","Reimbursement"],["commission","Commission"]]} />
            </div>
            <Select name="method" label="Payment Method" options={[["","Select..."],["bank_transfer","Bank Transfer"],["wise","Wise"],["paypal","PayPal"],["check","Check"]]} />
            <div className="grid grid-cols-2 gap-3">
              <Input name="pStart" label="Period Start" type="date" />
              <Input name="pEnd" label="Period End" type="date" />
            </div>
            <Input name="notes" label="Notes" />
          </FormHandler>
          )}
        </Dialog>
      )}

      {/* Create Task Dialog */}
      {showDialog === "task" && (
        <Dialog title="Create Task" onClose={() => setShowDialog(null)}>
          <FormHandler onSubmit={(fd) => handleAction(() => createTaskForOrg(org.id, { employeeId: fd.get("empId") as string, title: fd.get("title") as string, description: fd.get("desc") as string, dueDate: fd.get("due") as string }))} isPending={isPending}>
            <Select name="empId" label="Contractor *" required options={employees.map((e) => [e.id, `${e.legalFirstName} ${e.legalLastName}`])} />
            <Input name="title" label="Task Title *" required />
            <Input name="desc" label="Description" />
            <Input name="due" label="Due Date" type="date" />
          </FormHandler>
        </Dialog>
      )}

      {/* Add Document Dialog */}
      {showDialog === "document" && (
        <Dialog title="Add Document" onClose={() => setShowDialog(null)}>
          <FormHandler onSubmit={(fd) => handleAction(() => addDocumentForOrg(org.id, { employeeId: fd.get("empId") as string, documentType: fd.get("docType") as string, documentName: fd.get("docName") as string }))} isPending={isPending}>
            <Select name="empId" label="Contractor *" required options={employees.map((e) => [e.id, `${e.legalFirstName} ${e.legalLastName}`])} />
            <Select name="docType" label="Document Type *" required options={[["id_document","Government ID"],["contract","Contract"],["tax_form","Tax Form"],["bank_details","Bank Details"],["resume","Resume"],["other","Other"]]} />
            <Input name="docName" label="Document Name *" required />
          </FormHandler>
        </Dialog>
      )}

      {/* Invite Member Dialog */}
      {showDialog === "invite" && (
        <Dialog title={`Invite Member to ${org.name}`} onClose={() => setShowDialog(null)}>
          <FormHandler onSubmit={(fd) => handleAction(() => inviteMemberToOrg(org.id, { email: fd.get("email") as string, role: fd.get("role") as string, name: fd.get("name") as string }))} isPending={isPending}>
            <Input name="name" label="Name" />
            <Input name="email" label="Email *" type="email" required />
            <Select name="role" label="Role *" required options={ROLES.map((r) => [r, ROLE_LABELS[r]])} />
          </FormHandler>
        </Dialog>
      )}
    </div>
  );
}

// ── Reusable UI Components ──

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl border bg-card p-6 shadow-lg max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-semibold">{title}</h2><button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg">✕</button></div>
        {children}
      </div>
    </div>
  );
}

function FormHandler({ onSubmit, isPending, children, error }: { onSubmit: (fd: FormData) => void; isPending: boolean; children: React.ReactNode; error?: string | null }) {
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(new FormData(e.currentTarget)); }} className="space-y-3">
      {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      {children}
      <button type="submit" disabled={isPending} className="mt-2 h-10 w-full rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
        {isPending ? "Saving..." : "Save"}
      </button>
    </form>
  );
}

function Input({ name, label, type, required, placeholder }: { name: string; label: string; type?: string; required?: boolean; placeholder?: string }) {
  return (
    <div><label className="text-sm font-medium">{label}</label><input name={name} type={type ?? "text"} required={required} placeholder={placeholder} step={type === "number" ? "0.01" : undefined} className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" /></div>
  );
}

function Select({ name, label, options, required }: { name: string; label: string; options: string[][]; required?: boolean }) {
  return (
    <div>
      <label className="text-sm font-medium">{label}</label>
      <select name={name} required={required} defaultValue="" className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
        <option value="" disabled>Select...</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}
