"use client";

import {
  updateEmployee,
  changeEmployeeStatus,
} from "@/app/actions/hriq/employees";
import { completeTask } from "@/app/actions/hriq/tasks";
import { createDocument } from "@/app/actions/hriq/documents";
import { createPayment } from "@/app/actions/hriq/payments";
import { createManagerNote, startOnboarding, updateOnboardingStep, sendOnboardingForms, sendZoomInvite, getJotFormForms } from "@/app/actions/hriq/onboarding";
import { getAvailableSenders } from "@/app/actions/hriq/send-email";
import type {
  Employee,
  Task,
  Document,
  Payment,
  ManagerNote,
  AccessProvisioning,
  OnboardingSession,
  OnboardingStep,
} from "@repo/database";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

type EmployeeWithRelations = Employee & {
  organization?: { id: string; name: string } | null;
  manager: { id: string; legalFirstName: string; legalLastName: string } | null;
  tasks: Task[];
  documents: Document[];
  payments: Payment[];
  managerNotes: ManagerNote[];
  accessProvisioning: AccessProvisioning[];
  onboardingSessions: (OnboardingSession & { steps: OnboardingStep[] })[];
};

type Tab = "overview" | "tasks" | "documents" | "payments" | "notes" | "onboarding";

const STATUS_COLORS: Record<string, string> = {
  pre_hire: "bg-gray-100 text-gray-800",
  onboarding_in_progress: "bg-blue-100 text-blue-800",
  active: "bg-green-100 text-green-800",
  leave: "bg-yellow-100 text-yellow-800",
  offboarding_in_progress: "bg-red-100 text-red-800",
  offboarded: "bg-gray-100 text-gray-500",
};

export function EmployeeDetail({ employee }: { employee: EmployeeWithRelations }) {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [isPendingHeader, startHeaderTransition] = useTransition();
  const router = useRouter();

  const handleStatusChange = (newStatus: string) => {
    startHeaderTransition(async () => {
      await changeEmployeeStatus(employee.id, newStatus);
      setShowStatusMenu(false);
      router.refresh();
    });
  };

  const handleDelete = () => {
    if (!confirm(`Are you sure you want to delete ${employee.legalFirstName} ${employee.legalLastName}? This cannot be undone.`)) return;
    startHeaderTransition(async () => {
      await changeEmployeeStatus(employee.id, "offboarded", "Deleted by admin");
      router.push("/client/employees");
      router.refresh();
    });
  };

  const handleLinkUser = () => {
    const userId = prompt("Enter the Supabase User ID to link this contractor to:");
    if (!userId?.trim()) return;
    startHeaderTransition(async () => {
      await updateEmployee(employee.id, { linkedUserId: userId.trim() });
      router.refresh();
    });
  };

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "tasks", label: "Tasks", count: employee.tasks.filter((t) => t.status !== "completed").length },
    { id: "documents", label: "Documents", count: employee.documents.length },
    { id: "payments", label: "Payments", count: employee.payments.length },
    { id: "notes", label: "Notes", count: employee.managerNotes.length },
  ];

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">
                {employee.preferredName ?? employee.legalFirstName}{" "}
                {employee.legalLastName}
              </h1>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_COLORS[employee.employmentStatus] ?? "bg-gray-100"}`}
              >
                {employee.employmentStatus.replace(/_/g, " ")}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {employee.employeeNumber} &middot;{" "}
              {employee.jobTitle ?? employee.employmentType} &middot;{" "}
              {employee.department ?? "No department"}
              {employee.organization && (
                <> &middot; <Link href={`/rl/organizations/${employee.organization.id}`} className="text-primary hover:underline">{employee.organization.name}</Link></>
              )}
            </p>
            {employee.manager && (
              <p className="mt-1 text-xs text-muted-foreground">
                Reports to{" "}
                <Link
                  href={`/client/employees/${employee.manager.id}`}
                  className="underline"
                >
                  {employee.manager.legalFirstName} {employee.manager.legalLastName}
                </Link>
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Status Change */}
            <div className="relative">
              <button onClick={() => setShowStatusMenu(!showStatusMenu)} disabled={isPendingHeader} className="h-9 rounded-md border px-3 text-sm hover:bg-accent disabled:opacity-50">
                Change Status
              </button>
              {showStatusMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowStatusMenu(false)} />
                  <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-md border bg-popover p-1 shadow-md">
                    {["active", "pre_hire", "onboarding_in_progress", "leave", "offboarding_in_progress", "offboarded"].map((s) => (
                      <button key={s} onClick={() => handleStatusChange(s)} className={`flex w-full rounded-sm px-2 py-1.5 text-sm hover:bg-accent ${employee.employmentStatus === s ? "bg-accent font-medium" : ""}`}>
                        {s.replace(/_/g, " ")}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Actions Menu */}
            <div className="relative">
              <button onClick={() => setShowActions(!showActions)} className="h-9 rounded-md border px-3 text-sm hover:bg-accent">
                Actions
              </button>
              {showActions && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowActions(false)} />
                  <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-md border bg-popover p-1 shadow-md">
                    <button onClick={() => { setShowActions(false); setActiveTab("overview"); }} className="flex w-full rounded-sm px-2 py-1.5 text-sm hover:bg-accent">Edit Details</button>
                    <button onClick={() => { setShowActions(false); handleLinkUser(); }} className="flex w-full rounded-sm px-2 py-1.5 text-sm hover:bg-accent">
                      {employee.linkedUserId ? "Change Linked User" : "Link to User Account"}
                    </button>
                    <div className="my-1 border-t" />
                    <button onClick={() => { setShowActions(false); handleDelete(); }} className="flex w-full rounded-sm px-2 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950">Delete Contractor</button>
                  </div>
                </>
              )}
            </div>

            <button
              onClick={() => {
                if (typeof window !== "undefined" && window.history.length > 1) window.history.back();
                else window.location.href = "/client/employees";
              }}
              className="h-9 rounded-md border px-3 text-sm hover:bg-accent"
            >
              Back
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b">
        <nav className="flex gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`relative pb-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-xs">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && <OverviewTab employee={employee} />}
      {activeTab === "tasks" && <TasksTab tasks={employee.tasks} employeeId={employee.id} />}
      {activeTab === "documents" && <DocumentsTab documents={employee.documents} employeeId={employee.id} />}
      {activeTab === "payments" && <PaymentsTab payments={employee.payments} employee={employee} />}
      {activeTab === "notes" && <NotesTab notes={employee.managerNotes} employeeId={employee.id} />}
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────

function OverviewTab({ employee }: { employee: EmployeeWithRelations }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data: Record<string, unknown> = {};
    for (const [key, value] of fd.entries()) {
      if (typeof value === "string" && value.trim()) data[key] = value.trim();
    }
    startTransition(async () => {
      await updateEmployee(employee.id, data);
      setEditing(false);
      router.refresh();
    });
  };

  if (editing) {
    return (
      <form onSubmit={handleSave} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Card title="Employment Details">
            <EditField name="department" label="Department" value={employee.department} />
            <EditField name="jobTitle" label="Job Title" value={employee.jobTitle} />
            <EditField name="location" label="Location" value={employee.location} />
            <EditField name="timezone" label="Timezone" value={employee.timezone} />
          </Card>
          <Card title="Contact Information">
            <EditField name="workEmail" label="Work Email" value={employee.workEmail} />
            <EditField name="personalEmail" label="Personal Email" value={employee.personalEmail} />
            <EditField name="phoneNumber" label="Phone" value={employee.phoneNumber} />
            <EditField name="mobileNumber" label="Mobile" value={employee.mobileNumber} />
          </Card>
          <Card title="Compensation">
            <EditField name="hourlyRate" label="Hourly Rate" value={employee.hourlyRate ? String(employee.hourlyRate) : undefined} />
            <EditField name="paymentPlatform" label="Payment Platform" value={employee.paymentPlatform} />
          </Card>
          <Card title="Emergency Contact">
            <EditField name="emergencyContactName" label="Name" value={employee.emergencyContactName} />
            <EditField name="emergencyContactPhone" label="Phone" value={employee.emergencyContactPhone} />
            <EditField name="emergencyContactRelation" label="Relation" value={employee.emergencyContactRelation} />
          </Card>
        </div>
        <div className="flex gap-2">
          <button type="submit" disabled={isPending} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">{isPending ? "Saving..." : "Save Changes"}</button>
          <button type="button" onClick={() => setEditing(false)} className="h-9 rounded-md border px-4 text-sm hover:bg-accent">Cancel</button>
        </div>
      </form>
    );
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <button onClick={() => setEditing(true)} className="h-8 rounded-md border px-3 text-xs font-medium hover:bg-accent">Edit Details</button>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Card title="Employment Details">
          <Field label="Type" value={employee.employmentType} />
          <Field label="Department" value={employee.department} />
          <Field label="Job Title" value={employee.jobTitle} />
          <Field label="Location" value={employee.location} />
          <Field label="Timezone" value={employee.timezone} />
          <Field label="Start Date" value={employee.startDate ? new Date(employee.startDate).toLocaleDateString() : undefined} />
          <Field label="Daily Hours" value={employee.dailyHoursTarget} />
          {employee.linkedUserId && <Field label="Linked User" value={employee.linkedUserId.slice(0, 16) + "..."} />}
        </Card>
        <Card title="Contact Information">
          <Field label="Work Email" value={employee.workEmail} />
          <Field label="Personal Email" value={employee.personalEmail} />
          <Field label="Phone" value={employee.phoneNumber} />
          <Field label="Mobile" value={employee.mobileNumber} />
          <Field label="Address" value={[employee.streetAddress, employee.city, employee.stateProvince, employee.country].filter(Boolean).join(", ") || undefined} />
        </Card>
        <Card title="Compensation & Banking">
          <Field label="Hourly Rate" value={employee.hourlyRate ? `${employee.hourlyRate} ${employee.currency}` : undefined} />
          <Field label="Payment Platform" value={employee.paymentPlatform} />
          <Field label="Bank Name" value={employee.bankName} />
          <Field label="Bank Account" value={employee.bankAccountNumber ? "****" + employee.bankAccountNumber.slice(-4) : undefined} />
        </Card>
        <Card title="Emergency Contact">
          <Field label="Name" value={employee.emergencyContactName} />
          <Field label="Phone" value={employee.emergencyContactPhone} />
          <Field label="Relation" value={employee.emergencyContactRelation} />
        </Card>
      </div>
    </div>
  );
}

function EditField({ name, label, value }: { name: string; label: string; value?: string | null }) {
  return (
    <div className="flex items-center justify-between py-1">
      <label className="text-sm text-muted-foreground">{label}</label>
      <input name={name} defaultValue={value ?? ""} className="h-8 w-48 rounded-md border border-input bg-background px-2 text-sm" />
    </div>
  );
}

// ── Tasks Tab ────────────────────────────────────

function TasksTab({ tasks, employeeId }: { tasks: Task[]; employeeId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showAdd, setShowAdd] = useState(false);

  const handleComplete = (taskId: string) => {
    startTransition(async () => {
      await completeTask(taskId);
      router.refresh();
    });
  };

  const handleAdd = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const { createTask } = await import("@/app/actions/hriq/tasks");
      await createTask({
        employeeId,
        title: fd.get("title") as string,
        description: (fd.get("desc") as string) || undefined,
        taskType: (fd.get("taskType") as string) || "custom",
        dueDate: (fd.get("dueDate") as string) || undefined,
      });
      setShowAdd(false);
      router.refresh();
    });
  };

  const openTasks = tasks.filter((t) => t.status !== "completed");
  const completedTasks = tasks.filter((t) => t.status === "completed");

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{openTasks.length} open, {completedTasks.length} completed</span>
        <button onClick={() => setShowAdd(!showAdd)} className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90">
          {showAdd ? "Cancel" : "+ Add Task"}
        </button>
      </div>
      {showAdd && (
        <form onSubmit={handleAdd} className="rounded-lg border p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Title *</label>
              <input name="title" required placeholder="Task title" className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium">Due Date</label>
              <input name="dueDate" type="date" className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Description</label>
            <textarea name="desc" rows={2} placeholder="Task details..." className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </div>
          <button type="submit" disabled={isPending} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {isPending ? "Adding..." : "Add Task"}
          </button>
        </form>
      )}
      {tasks.map((task) => (
        <div key={task.id} className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium">{task.title}</span>
              <span className="rounded bg-muted px-1.5 py-0.5 text-xs capitalize">{task.taskType}</span>
              {task.isBlocking && <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">Blocking</span>}
            </div>
            {task.description && <p className="mt-1 text-sm text-muted-foreground">{task.description}</p>}
            {task.dueDate && <p className="mt-1 text-xs text-muted-foreground">Due: {new Date(task.dueDate).toLocaleDateString()}</p>}
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${task.status === "completed" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}`}>
              {task.status.replace(/_/g, " ")}
            </span>
            {task.status !== "completed" && (
              <button type="button" onClick={() => handleComplete(task.id)} disabled={isPending} className="rounded-md bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700 disabled:opacity-50">Complete</button>
            )}
          </div>
        </div>
      ))}
      {tasks.length === 0 && !showAdd && (
        <div className="py-8 text-center text-muted-foreground">No tasks yet. Click &quot;+ Add Task&quot; to get started.</div>
      )}
    </div>
  );
}

// ── Documents Tab ────────────────────────────────

function DocumentsTab({ documents, employeeId }: { documents: Document[]; employeeId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showAdd, setShowAdd] = useState(false);

  const handleAdd = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await createDocument({
        employeeId,
        documentType: fd.get("docType") as string,
        documentName: fd.get("docName") as string,
        description: (fd.get("desc") as string) || undefined,
      });
      setShowAdd(false);
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={() => setShowAdd(!showAdd)} className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90">
          {showAdd ? "Cancel" : "+ Add Document"}
        </button>
      </div>
      {showAdd && (
        <form onSubmit={handleAdd} className="rounded-lg border p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Document Type *</label>
              <select name="docType" required defaultValue="" className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="" disabled>Select...</option>
                <option value="id_document">Government ID</option>
                <option value="contract">Contract</option>
                <option value="tax_form">Tax Form (W-8/W-9)</option>
                <option value="bank_details">Bank Details</option>
                <option value="resume">Resume</option>
                <option value="nda">NDA</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Document Name *</label>
              <input name="docName" required placeholder="e.g. W-8 BEN Form" className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Description</label>
            <input name="desc" placeholder="Optional notes about this document" className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" />
          </div>
          <button type="submit" disabled={isPending} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {isPending ? "Adding..." : "Add Document"}
          </button>
        </form>
      )}
      {documents.map((doc) => (
        <div key={doc.id} className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium">{doc.documentName}</span>
              <span className="rounded bg-muted px-1.5 py-0.5 text-xs capitalize">{doc.documentType.replace(/_/g, " ")}</span>
            </div>
            {doc.description && <p className="mt-1 text-sm text-muted-foreground">{doc.description}</p>}
            <p className="mt-1 text-xs text-muted-foreground">
              Added {new Date(doc.createdAt).toLocaleDateString()}
              {doc.uploadedByName && ` by ${doc.uploadedByName}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${
              doc.status === "verified" ? "bg-green-100 text-green-800" :
              doc.status === "rejected" ? "bg-red-100 text-red-800" :
              "bg-yellow-100 text-yellow-800"
            }`}>
              {doc.status}
            </span>
            {doc.fileUrl && (
              <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="rounded-md border px-3 py-1 text-xs hover:bg-accent">View</a>
            )}
          </div>
        </div>
      ))}
      {documents.length === 0 && !showAdd && (
        <div className="py-8 text-center text-muted-foreground">No documents yet. Click &quot;+ Add Document&quot; to get started.</div>
      )}
    </div>
  );
}

// ── Payments Tab ─────────────────────────────────

function PaymentsTab({ payments, employee }: { payments: Payment[]; employee: Employee }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showAdd, setShowAdd] = useState(false);

  const handleAdd = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await createPayment({
        employeeId: employee.id,
        paymentType: fd.get("payType") as string,
        amount: fd.get("amount") as string,
        currency: (fd.get("currency") as string) || employee.currency || "USD",
        paymentMethod: (fd.get("method") as string) || undefined,
        periodStart: (fd.get("pStart") as string) || undefined,
        periodEnd: (fd.get("pEnd") as string) || undefined,
        notes: (fd.get("notes") as string) || undefined,
      });
      setShowAdd(false);
      router.refresh();
    });
  };

  const totalPaid = payments.filter((p) => p.status === "completed").reduce((s, p) => s + Number(p.amount), 0);
  const totalPending = payments.filter((p) => p.status === "pending").reduce((s, p) => s + Number(p.amount), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex gap-4 text-sm">
          <span>Paid: <strong className="text-green-600">${totalPaid.toLocaleString()}</strong></span>
          <span>Pending: <strong className="text-yellow-600">${totalPending.toLocaleString()}</strong></span>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90">
          {showAdd ? "Cancel" : "+ Record Payment"}
        </button>
      </div>
      {showAdd && (
        <form onSubmit={handleAdd} className="rounded-lg border p-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-medium">Amount *</label>
              <input name="amount" type="number" step="0.01" required className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium">Currency</label>
              <select name="currency" defaultValue={employee.currency || "USD"} className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="USD">USD</option><option value="PHP">PHP</option><option value="EUR">EUR</option><option value="GBP">GBP</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Type *</label>
              <select name="payType" required defaultValue="" className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="" disabled>Select...</option>
                <option value="salary">Salary</option><option value="bonus">Bonus</option><option value="reimbursement">Reimbursement</option><option value="commission">Commission</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-medium">Method</label>
              <select name="method" defaultValue="" className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Select...</option>
                <option value="bank_transfer">Bank Transfer</option><option value="wise">Wise</option><option value="paypal">PayPal</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Period Start</label>
              <input name="pStart" type="date" className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium">Period End</label>
              <input name="pEnd" type="date" className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Notes</label>
            <input name="notes" placeholder="Optional payment notes" className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" />
          </div>
          <button type="submit" disabled={isPending} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {isPending ? "Recording..." : "Record Payment"}
          </button>
        </form>
      )}
      {payments.map((payment) => (
        <div key={payment.id} className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium capitalize">{payment.paymentType}</span>
              <span className="text-lg font-semibold">${Number(payment.amount).toLocaleString()} {payment.currency}</span>
            </div>
            {payment.periodStart && payment.periodEnd && (
              <p className="mt-1 text-xs text-muted-foreground">Period: {new Date(payment.periodStart).toLocaleDateString()} – {new Date(payment.periodEnd).toLocaleDateString()}</p>
            )}
            {payment.paymentMethod && <p className="mt-1 text-xs text-muted-foreground capitalize">Via {payment.paymentMethod.replace(/_/g, " ")}</p>}
            <p className="mt-1 text-xs text-muted-foreground">{new Date(payment.createdAt).toLocaleDateString()}</p>
          </div>
          <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${
            payment.status === "completed" ? "bg-green-100 text-green-800" :
            payment.status === "failed" ? "bg-red-100 text-red-800" :
            "bg-yellow-100 text-yellow-800"
          }`}>
            {payment.status}
          </span>
        </div>
      ))}
      {payments.length === 0 && !showAdd && (
        <div className="py-8 text-center text-muted-foreground">No payments yet. Click &quot;+ Record Payment&quot; to get started.</div>
      )}
    </div>
  );
}

// ── Notes Tab ────────────────────────────────────

function NotesTab({ notes, employeeId }: { notes: ManagerNote[]; employeeId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showAdd, setShowAdd] = useState(false);

  const NOTE_TYPE_COLORS: Record<string, string> = {
    general: "bg-gray-100 text-gray-800",
    performance: "bg-blue-100 text-blue-800",
    feedback: "bg-purple-100 text-purple-800",
    warning: "bg-orange-100 text-orange-800",
    commendation: "bg-green-100 text-green-800",
  };

  const handleAdd = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await createManagerNote({
        employeeId,
        noteType: fd.get("noteType") as string,
        content: fd.get("content") as string,
        isPrivate: fd.get("isPrivate") === "on",
      });
      setShowAdd(false);
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={() => setShowAdd(!showAdd)} className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90">
          {showAdd ? "Cancel" : "+ Add Note"}
        </button>
      </div>
      {showAdd && (
        <form onSubmit={handleAdd} className="rounded-lg border p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Note Type</label>
              <select name="noteType" defaultValue="general" className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="general">General</option>
                <option value="performance">Performance</option>
                <option value="feedback">Feedback</option>
                <option value="warning">Warning</option>
                <option value="commendation">Commendation</option>
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="isPrivate" className="h-4 w-4" />
                Private (only visible to admins)
              </label>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Content *</label>
            <textarea name="content" required rows={3} placeholder="Write your note here..." className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </div>
          <button type="submit" disabled={isPending} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {isPending ? "Adding..." : "Add Note"}
          </button>
        </form>
      )}
      {notes.map((note) => (
        <div key={note.id} className="rounded-lg border p-4">
          <div className="flex items-center gap-2">
            <span className={`rounded px-1.5 py-0.5 text-xs capitalize ${NOTE_TYPE_COLORS[note.noteType] ?? NOTE_TYPE_COLORS.general}`}>
              {note.noteType}
            </span>
            {note.isPrivate && (
              <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">Private</span>
            )}
            <span className="text-xs text-muted-foreground">
              {note.authorName ?? "Unknown"} &middot; {new Date(note.createdAt).toLocaleDateString()}
            </span>
          </div>
          <p className="mt-2 text-sm whitespace-pre-wrap">{note.content}</p>
        </div>
      ))}
      {notes.length === 0 && !showAdd && (
        <div className="py-8 text-center text-muted-foreground">No notes yet. Click &quot;+ Add Note&quot; to get started.</div>
      )}
    </div>
  );
}

// ── Onboarding Tab ───────────────────────────────

function OnboardingTab({ sessions, employeeId, employeeStatus }: { sessions: (OnboardingSession & { steps: OnboardingStep[] })[]; employeeId: string; employeeStatus: string }) {
  const getDisplayStepName = (step: OnboardingStep) => {
    const raw = step.stepName.trim();
    if (step.stepType === "zoom_invite") return "Zoom Invite (Add to Batch)";
    if (step.stepType === "zoom_attendance") return "Zoom Orientation Attendance";
    if (step.stepType === "document") return "Government ID Upload";
    if (step.stepType === "custom") return "Tool Access Provisioning";
    if (step.stepType === "jotform") {
      const lower = raw.toLowerCase();
      if (lower.includes("w-8") || lower.includes("w8") || lower.includes("w-9") || lower.includes("w9")) {
        return "W-8 BEN / W-9 Tax Form";
      }
      if (lower.includes("contractor")) return "Contractor Agreement Signature";
    }
    return raw;
  };

  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [senders, setSenders] = useState<string[]>([]);
  const [jotForms, setJotForms] = useState<{ id: string; title: string; url: string }[]>([]);
  const [selectedSender, setSelectedSender] = useState("");
  const [selectedFormIds, setSelectedFormIds] = useState<Set<string>>(new Set());
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const session = sessions[0];

  useEffect(() => {
    getAvailableSenders().then((s) => { setSenders(s); if (s[0]) setSelectedSender(s[0]); });
    getJotFormForms().then(setJotForms);
  }, []);

  const handleStartOnboarding = () => {
    startTransition(async () => {
      await startOnboarding(employeeId);
      router.refresh();
    });
  };

  if (!session) {
    return (
      <div className="py-8 text-center">
        <div className="text-muted-foreground">No onboarding session found.</div>
        {(employeeStatus === "pre_hire" || employeeStatus === "active" || employeeStatus === "onboarding_scheduled") && (
          <button onClick={handleStartOnboarding} disabled={isPending} className="mt-4 h-10 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {isPending ? "Starting..." : "Start Onboarding"}
          </button>
        )}
        <p className="mt-2 text-xs text-muted-foreground">Creates steps: Zoom invite, forms, document collection, and access provisioning.</p>
      </div>
    );
  }

  const handleStepComplete = (stepId: string) => {
    startTransition(async () => {
      await updateOnboardingStep(stepId, { status: "completed" });
      router.refresh();
    });
  };

  const handleSendZoom = async (step: OnboardingStep) => {
    if (!session.zoomMeetingLink) { setActionMsg("No Zoom link. Create a batch session first."); return; }
    setActionPending(true);
    try {
      await sendZoomInvite({
        employeeId,
        zoomLink: session.zoomMeetingLink,
        zoomDate: session.zoomMeetingDate ? new Date(session.zoomMeetingDate).toISOString() : "",
        senderEmail: selectedSender || undefined,
      });
      setActionMsg("Zoom invite sent");
      startTransition(async () => { await updateOnboardingStep(step.id, { status: "completed" }); router.refresh(); });
    } catch (e) { setActionMsg(`Error: ${e instanceof Error ? e.message : "Failed"}`); }
    finally { setActionPending(false); }
  };

  const handleSendForms = async () => {
    if (selectedFormIds.size === 0) { setActionMsg("Select forms first"); return; }
    setActionPending(true);
    try {
      const result = await sendOnboardingForms({
        employeeId,
        formIds: Array.from(selectedFormIds),
        senderEmail: selectedSender || undefined,
      });
      setActionMsg(`${result.sent} form(s) sent`);
      router.refresh();
    } catch (e) { setActionMsg(`Error: ${e instanceof Error ? e.message : "Failed"}`); }
    finally { setActionPending(false); }
  };

  const completed = session.steps.filter((s) => s.status === "completed").length;
  const total = session.steps.length;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
  const currentIdx = session.steps.findIndex((s) => s.status !== "completed" && s.status !== "skipped");

  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Onboarding Progress</h3>
          <span className="text-sm font-medium">{progress}%</span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
        {progress >= 100 && <p className="mt-2 text-sm font-medium text-green-600">Onboarding Complete</p>}
      </div>

      {actionMsg && (
        <div className={`rounded-md px-3 py-2 text-sm ${actionMsg.startsWith("Error") ? "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300" : "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300"}`}>
          {actionMsg}
          <button type="button" onClick={() => setActionMsg(null)} className="ml-2 font-bold">×</button>
        </div>
      )}

      {senders.length > 1 && (
        <div>
          <label className="text-xs font-medium text-muted-foreground">Send emails from</label>
          <select value={selectedSender} onChange={(e) => setSelectedSender(e.target.value)} className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
            {senders.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      )}

      <div className="space-y-2">
        {session.steps.map((step, idx) => {
          const isDone = step.status === "completed";
          const isSent = step.status === "sent";
          const isCurrent = idx === currentIdx;

          return (
            <div key={step.id} className={`rounded-lg border p-4 transition-all ${isDone ? "border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/30" : isCurrent ? "border-primary/50 bg-primary/5" : ""}`}>
              <div className="flex items-center gap-3">
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${isDone ? "bg-green-500 text-white" : isCurrent ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  {isDone ? "✓" : idx + 1}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{getDisplayStepName(step)}</span>
                    {isSent && <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300">Sent</span>}
                  </div>
                  {isDone && step.completedAt && <div className="text-xs text-green-600">Completed {new Date(step.completedAt).toLocaleDateString()}</div>}
                </div>
              </div>

              {!isDone && isCurrent && (
                <div className="mt-3 ml-10">
                  {step.stepType === "zoom_invite" && (
                    <div className="space-y-2">
                      {session.zoomMeetingLink ? (
                        <>
                          <div className="text-xs text-muted-foreground">Link: <a href={session.zoomMeetingLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{session.zoomMeetingLink}</a></div>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => handleSendZoom(step)} disabled={actionPending} className="inline-flex h-8 items-center rounded-md bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                              {actionPending ? "Sending..." : "Send Zoom Invite"}
                            </button>
                            <button type="button" onClick={() => handleStepComplete(step.id)} disabled={isPending} className="inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium hover:bg-accent disabled:opacity-50">Mark Done</button>
                          </div>
                        </>
                      ) : (
                        <div className="space-y-1">
                          <span className="text-xs text-muted-foreground">No Zoom link linked to this onboarding yet.</span>
                          <span className="text-xs text-muted-foreground">Use Hiring Pipeline: Actions -&gt; Add to Batch to auto-send invite and complete this step.</span>
                        </div>
                      )}
                    </div>
                  )}
                  {step.stepType === "zoom_attendance" && (
                    <div className="flex gap-2">
                      <button type="button" onClick={() => handleStepComplete(step.id)} disabled={isPending} className="inline-flex h-8 items-center rounded-md bg-green-600 px-3 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50">Mark Attended</button>
                      <button type="button" onClick={() => { startTransition(async () => { await updateOnboardingStep(step.id, { status: "skipped" }); router.refresh(); }); }} disabled={isPending} className="inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium hover:bg-accent disabled:opacity-50">Skip</button>
                    </div>
                  )}
                  {step.stepType === "jotform" && (
                    <div className="space-y-2">
                      {jotForms.length > 0 && (
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                          {jotForms.map((f) => (
                            <label key={f.id} className="flex items-center gap-2 rounded border px-2 py-1.5 text-xs hover:bg-accent cursor-pointer">
                              <input type="checkbox" checked={selectedFormIds.has(f.id)} onChange={() => setSelectedFormIds((prev) => { const n = new Set(prev); if (n.has(f.id)) n.delete(f.id); else n.add(f.id); return n; })} className="h-3.5 w-3.5" />
                              {f.title}
                            </label>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <button type="button" onClick={handleSendForms} disabled={actionPending || selectedFormIds.size === 0} className="inline-flex h-8 items-center rounded-md bg-orange-600 px-3 text-xs font-medium text-white hover:bg-orange-700 disabled:opacity-50">
                          {actionPending ? "Sending..." : `Send ${selectedFormIds.size || ""} Form${selectedFormIds.size !== 1 ? "s" : ""}`}
                        </button>
                        <button type="button" onClick={() => handleStepComplete(step.id)} disabled={isPending} className="inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium hover:bg-accent disabled:opacity-50">Mark Done</button>
                      </div>
                    </div>
                  )}
                  {step.stepType === "document" && (
                    <div className="flex gap-2">
                      <button type="button" onClick={() => handleStepComplete(step.id)} disabled={isPending} className="inline-flex h-8 items-center rounded-md bg-green-600 px-3 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50">Mark Received</button>
                      <button type="button" onClick={() => { startTransition(async () => { await updateOnboardingStep(step.id, { status: "skipped" }); router.refresh(); }); }} disabled={isPending} className="inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium hover:bg-accent disabled:opacity-50">Skip</button>
                    </div>
                  )}
                  {step.stepType === "custom" && (
                    <div className="flex gap-2">
                      <button type="button" onClick={() => handleStepComplete(step.id)} disabled={isPending} className="inline-flex h-8 items-center rounded-md bg-green-600 px-3 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50">Mark Provisioned</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Shared Components ────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-6">
      <h3 className="mb-4 font-semibold">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value ?? "—"}</span>
    </div>
  );
}
