"use client";

import { createEmployee } from "@/app/actions/hriq/employees";
import type { Employee } from "@repo/database";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { CsvExportButton } from "../../components/csv-export";

const STATUS_COLORS: Record<string, string> = {
  pre_hire: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  onboarding_scheduled: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  onboarding_in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  active: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  leave: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  termination_scheduled: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  offboarding_in_progress: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  offboarded: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

const STATUSES = [
  { value: "", label: "Active (default)" },
  { value: "active", label: "Active" },
  { value: "pre_hire", label: "Pre-Hire" },
  { value: "onboarding_in_progress", label: "Onboarding" },
  { value: "leave", label: "On Leave" },
  { value: "offboarding_in_progress", label: "Offboarding" },
  { value: "offboarded", label: "Offboarded" },
  { value: "all", label: "All Statuses" },
];

type EmployeeListProps = {
  employees: (Employee & { organization?: { name: string } | null })[];
  departments: { department: string; count: number }[];
  filters: { status?: string; department?: string; search?: string };
  isSuperAdmin?: boolean;
  pendingHiresCount?: number;
};

export function EmployeeList({ employees, departments, filters, isSuperAdmin, pendingHiresCount }: EmployeeListProps) {
  const router = useRouter();
  const [search, setSearch] = useState(filters.search ?? "");
  const [showCreate, setShowCreate] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === employees.length) setSelected(new Set());
    else setSelected(new Set(employees.map((e) => e.id)));
  };

  const handleBulkStatus = (newStatus: string) => {
    const { changeEmployeeStatus } = require("@/app/actions/hriq/employees");
    startTransition(async () => {
      for (const id of selected) {
        await changeEmployeeStatus(id, newStatus);
      }
      setSelected(new Set());
      router.refresh();
    });
  };

  const updateFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams();
      if (key === "status" && value) params.set("status", value);
      else if (filters.status) params.set("status", filters.status);
      if (key === "department" && value) params.set("department", value);
      else if (filters.department) params.set("department", filters.department);
      if (key === "search" && value) params.set("search", value);
      else if (key !== "search" && search) params.set("search", search);
      router.push(`/client/employees?${params.toString()}`);
    },
    [router, filters, search]
  );

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      updateFilter("search", search);
    },
    [search, updateFilter]
  );

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <form onSubmit={handleSearch} className="flex-1">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employees..."
            className="flex h-10 w-full max-w-sm rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </form>
        <select
          value={filters.status ?? ""}
          onChange={(e) => updateFilter("status", e.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          value={filters.department ?? ""}
          onChange={(e) => updateFilter("department", e.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All Departments</option>
          {departments.map((d) => (
            <option key={d.department} value={d.department}>
              {d.department} ({d.count})
            </option>
          ))}
        </select>
        <CsvExportButton
          data={employees.map((e) => ({
            name: `${e.legalFirstName} ${e.legalLastName}`,
            email: e.workEmail ?? e.personalEmail ?? "",
            id: e.employeeNumber,
            department: e.department ?? "",
            title: e.jobTitle ?? e.employmentType,
            status: e.employmentStatus,
            startDate: e.startDate ? new Date(e.startDate).toLocaleDateString() : "",
          }))}
          filename="contractors"
          columns={[
            { key: "name", label: "Name" },
            { key: "email", label: "Email" },
            { key: "id", label: "Employee ID" },
            { key: "department", label: "Department" },
            { key: "title", label: "Title" },
            { key: "status", label: "Status" },
            { key: "startDate", label: "Start Date" },
          ]}
        />
        {isSuperAdmin && (
          <Link href="/rl/pending-hires" className={`inline-flex h-10 items-center gap-2 rounded-md border px-4 text-sm font-medium ${pendingHiresCount ? "border-orange-300 bg-orange-50 text-orange-800 hover:bg-orange-100 dark:border-orange-700 dark:bg-orange-950 dark:text-orange-200" : "hover:bg-accent"}`}>
            {pendingHiresCount ? <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{pendingHiresCount}</span> : null}
            Pending Hires
          </Link>
        )}
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          + Add Contractor
        </button>
      </div>

      {/* Bulk Actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg bg-primary/10 p-3">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <select onChange={(e) => { if (e.target.value) handleBulkStatus(e.target.value); e.target.value = ""; }} disabled={isPending} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
            <option value="">Change Status...</option>
            <option value="active">Set Active</option>
            <option value="leave">Set On Leave</option>
            <option value="offboarding_in_progress">Start Offboarding</option>
            <option value="offboarded">Offboard</option>
          </select>
          <button onClick={() => setSelected(new Set())} className="text-xs text-muted-foreground hover:underline">Clear</button>
        </div>
      )}

      {/* Contractor Table */}
      <div className="rounded-xl border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b text-left text-sm text-muted-foreground">
                <th className="px-2 py-3 w-8"><input type="checkbox" checked={selected.size === employees.length && employees.length > 0} onChange={toggleAll} className="h-4 w-4" /></th>
                <th className="px-4 py-3 font-medium">Contractor</th>
                <th className="px-4 py-3 font-medium">Email</th>
                {isSuperAdmin && <th className="px-4 py-3 font-medium">Organization</th>}
                <th className="px-4 py-3 font-medium">Department</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Start Date</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => (
                <tr key={emp.id} className={`border-b last:border-0 hover:bg-muted/50 transition-colors ${selected.has(emp.id) ? "bg-primary/5" : ""}`}>
                  <td className="px-2 py-3"><input type="checkbox" checked={selected.has(emp.id)} onChange={() => toggleSelect(emp.id)} className="h-4 w-4" /></td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/client/employees/${emp.id}`}
                      className="font-medium hover:underline"
                    >
                      {emp.legalFirstName} {emp.legalLastName}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {emp.employeeNumber}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {emp.workEmail ?? emp.personalEmail ?? "—"}
                  </td>
                  {isSuperAdmin && (
                    <td className="px-4 py-3 text-sm">
                      {(() => {
                        const org = (emp as typeof emp & { organization?: { id: string; name: string } | null }).organization;
                        if (org) return <Link href={`/rl/organizations/${org.id}`} className="text-primary hover:underline">{org.name}</Link>;
                        return <span className="rounded bg-yellow-100 px-1.5 py-0.5 text-xs text-yellow-800">Unassigned</span>;
                      })()}
                    </td>
                  )}
                  <td className="px-4 py-3 text-sm">
                    {emp.department ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {emp.jobTitle ?? emp.employmentType}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_COLORS[emp.employmentStatus] ?? STATUS_COLORS.pre_hire}`}
                    >
                      {emp.employmentStatus.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {emp.startDate
                      ? new Date(emp.startDate).toLocaleDateString()
                      : "—"}
                  </td>
                </tr>
              ))}
              {employees.length === 0 && (
                <tr>
                  <td colSpan={isSuperAdmin ? 8 : 7} className="px-4 py-8 text-center text-muted-foreground">
                    No contractors found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Employee Dialog */}
      {showCreate && (
        <CreateEmployeeDialog
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function CreateEmployeeDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      try {
        await createEmployee({
          legalFirstName: formData.get("legalFirstName") as string,
          legalLastName: formData.get("legalLastName") as string,
          employmentType: formData.get("employmentType") as string,
          personalEmail: formData.get("personalEmail") as string,
          workEmail: formData.get("workEmail") as string,
          department: formData.get("department") as string,
          jobTitle: formData.get("jobTitle") as string,
          hourlyRate: formData.get("hourlyRate") as string,
          startDate: formData.get("startDate") as string,
        });
        onCreated();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create employee");
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-xl border bg-background p-6 shadow-lg">
        <h2 className="text-lg font-semibold">Add New Employee</h2>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">First Name *</label>
              <input name="legalFirstName" required className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium">Last Name *</label>
              <input name="legalLastName" required className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Employment Type *</label>
            <select name="employmentType" required className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="contractor">Contractor</option>
              <option value="full_time">Full Time</option>
              <option value="part_time">Part Time</option>
              <option value="intern">Intern</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Personal Email</label>
              <input name="personalEmail" type="email" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium">Work Email</label>
              <input name="workEmail" type="email" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Department</label>
              <input name="department" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium">Job Title</label>
              <input name="jobTitle" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Hourly Rate</label>
              <input name="hourlyRate" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium">Start Date</label>
              <input name="startDate" type="date" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-md border border-input px-4 text-sm font-medium hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isPending ? "Creating..." : "Create Employee"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
