"use client";



import { createEmployee } from "@/app/actions/hriq/employees";
import { shortDate } from "@/lib/hriq/format";
import { CustomSelect } from "@/app/(authenticated)/components/custom-select";
import { CustomSelectWithOther } from "@/app/(authenticated)/components/custom-select-with-other";
import { JOB_TITLE_OPTIONS, DEPARTMENT_OPTIONS } from "@/lib/hriq/role-department-options";
import { COUNTRY_OPTIONS } from "@/lib/hriq/country-options";
import { TIMEZONE_OPTIONS } from "@/lib/hriq/timezone-options";
import { CURRENCY_OPTIONS } from "@/lib/hriq/currency-options";
import { SearchableSelect } from "@/app/(authenticated)/components/searchable-select";
import { DatePicker } from "@/app/(authenticated)/components/date-picker";
import { useErrorDialog } from "@/app/(authenticated)/components/error-dialog";
import { DestructiveConfirmDialog } from "@/app/(authenticated)/components/destructive-confirm-dialog";
import type { ImpactLine } from "@/app/(authenticated)/components/destructive-confirm-dialog";
import type { Employee } from "@repo/database";
import type { BulkActionResult } from "@/app/actions/hriq/bulk-actions";
import Link from "next/link";
import { useRouter, useParams, useSearchParams} from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { CsvExportButton } from "../../components/csv-export";

const STATUS_COLORS: Record<string, string> = {
  pre_hire: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  onboarding_scheduled: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300",
  onboarding_in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300",
  active: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
  leave: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300",
  termination_scheduled: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  offboarding_in_progress: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300",
  offboarded: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

const STATUSES = [
  { value: "", label: "Active (default)" },
  { value: "active", label: "Active" },
  { value: "pre_hire", label: "Pre-Hire" },
  { value: "onboarding_in_progress", label: "Onboarding" },
  { value: "offboarding_in_progress", label: "Offboarding" },
  { value: "offboarded", label: "Offboarded" },
  { value: "all", label: "All Statuses" },
];

type EmployeeListProps = {
  employees: (Employee & { organization?: { id: string; name: string } | null })[];
  departments: { department: string; count: number }[];
  filters: { status?: string; department?: string; search?: string; org?: string };
  isSuperAdmin?: boolean;
  orgOptions?: { id: string; name: string }[];
};

export function EmployeeList({ employees, departments, filters, isSuperAdmin, orgOptions }: EmployeeListProps) {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(filters.search ?? "");
  const [showCreate, setShowCreate] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { showError, showSuccess } = useErrorDialog();
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

  const sortedEmployees = [...employees].sort((a, b) => {
    if (!sortCol) return 0;
    let aVal = "";
    let bVal = "";
    switch (sortCol) {
      case "name": aVal = `${a.legalFirstName} ${a.legalLastName}`.toLowerCase(); bVal = `${b.legalFirstName} ${b.legalLastName}`.toLowerCase(); break;
      case "email": aVal = (a.workEmail ?? a.personalEmail ?? "").toLowerCase(); bVal = (b.workEmail ?? b.personalEmail ?? "").toLowerCase(); break;
      case "org": aVal = ((a as any).organization?.name ?? "").toLowerCase(); bVal = ((b as any).organization?.name ?? "").toLowerCase(); break;
      case "department": aVal = (a.department ?? "").toLowerCase(); bVal = (b.department ?? "").toLowerCase(); break;
      case "role": aVal = (a.jobTitle ?? a.employmentType ?? "").toLowerCase(); bVal = (b.jobTitle ?? b.employmentType ?? "").toLowerCase(); break;
      case "status": aVal = a.employmentStatus; bVal = b.employmentStatus; break;
      case "startDate": aVal = a.startDate ? new Date(a.startDate as any).toISOString() : ""; bVal = b.startDate ? new Date(b.startDate as any).toISOString() : ""; break;
    }
    if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
    if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const SortHeader = ({ col, children }: { col: string; children: React.ReactNode }) => (
    <th
      className="px-4 py-3 font-medium cursor-pointer select-none hover:text-foreground transition-colors group"
      onClick={() => handleSort(col)}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        <span className={`text-[10px] transition-opacity ${sortCol === col ? "opacity-100" : "opacity-0 group-hover:opacity-40"}`}>
          {sortCol === col && sortDir === "desc" ? "\u25BC" : "\u25B2"}
        </span>
      </span>
    </th>
  );

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setConfirmDelete(false);
  };

  const toggleAll = () => {
    if (selected.size === employees.length) setSelected(new Set());
    else setSelected(new Set(employees.map((e) => e.id)));
    setConfirmDelete(false);
  };

  const handleBulkStatus = (newStatus: string) => {
    setBulkActionLoading(`Updating status to ${newStatus.replace(/_/g, " ")}...`);
    startTransition(async () => {
      try {
        const { changeEmployeeStatus } = await import("@/app/actions/hriq/employees");
        for (const id of selected) {
          await changeEmployeeStatus(id, newStatus);
        }
        setSelected(new Set());
        showSuccess(`${selected.size} contractor(s) updated to ${newStatus.replace(/_/g, " ")}.`);
      } catch (err) {
        showError({
          title: "Bulk status change failed",
          message: err instanceof Error ? err.message : "Failed to update one or more contractors.",
        });
      } finally {
        setBulkActionLoading(null);
      }
    });
  };

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletePreview, setDeletePreview] = useState<{ loading: boolean; error: string | null; lines: ImpactLine[]; names: string[] }>({ loading: false, error: null, lines: [], names: [] });
  const [bulkEmailOpen, setBulkEmailOpen] = useState(false);
  const [bulkActionDropdown, setBulkActionDropdown] = useState(false);
  const [bulkActionLoading, setBulkActionLoading] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setBulkActionDropdown(false);
      }
    };
    if (bulkActionDropdown) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [bulkActionDropdown]);

  const handleBulkSendDashboardLink = async () => {
    setBulkActionDropdown(false);
    setBulkActionLoading("Sending dashboard links...");
    startTransition(async () => {
      try {
        const { bulkSendDashboardLink } = await import("@/app/actions/hriq/bulk-actions");
        const result: BulkActionResult = await bulkSendDashboardLink(Array.from(selected));
        if (result.failed > 0) {
          showError({
            title: `Sent ${result.sent} of ${result.total}`,
            message: `${result.failed} failed: ${result.errors.map((e) => `${e.name} — ${e.error}`).join("; ")}`,
          });
        } else {
          showSuccess(`Dashboard link sent to ${result.sent} contractor(s).`);
          setSelected(new Set());
        }
      } catch (err) {
        showError({
          title: "Bulk send failed",
          message: err instanceof Error ? err.message : "Failed to send dashboard links.",
        });
      } finally {
        setBulkActionLoading(null);
      }
    });
  };

  const handleBulkResendOnboarding = async () => {
    setBulkActionDropdown(false);
    setBulkActionLoading("Resending onboarding emails...");
    startTransition(async () => {
      try {
        const { bulkResendOnboarding } = await import("@/app/actions/hriq/bulk-actions");
        const result: BulkActionResult = await bulkResendOnboarding(Array.from(selected));
        if (result.failed > 0) {
          showError({
            title: `Resent ${result.sent} of ${result.total}`,
            message: `${result.failed} failed: ${result.errors.map((e) => `${e.name} — ${e.error}`).join("; ")}`,
          });
        } else {
          showSuccess(`Onboarding email resent to ${result.sent} contractor(s).`);
          setSelected(new Set());
        }
      } catch (err) {
        showError({
          title: "Bulk resend failed",
          message: err instanceof Error ? err.message : "Failed to resend onboarding emails.",
        });
      } finally {
        setBulkActionLoading(null);
      }
    });
  };

  const handleBulkSendDashboardInvite = async () => {
    setBulkActionDropdown(false);
    setBulkActionLoading("Provisioning accounts & sending invites...");
    startTransition(async () => {
      try {
        const { bulkSendDashboardInvite } = await import("@/app/actions/hriq/bulk-actions");
        const result: BulkActionResult = await bulkSendDashboardInvite(Array.from(selected));
        if (result.failed > 0) {
          showError({
            title: `Invited ${result.sent} of ${result.total}`,
            message: `${result.failed} failed: ${result.errors.map((e) => `${e.name} — ${e.error}`).join("; ")}`,
          });
        } else {
          showSuccess(`Dashboard invite with credentials sent to ${result.sent} contractor(s).`);
          setSelected(new Set());
        }
      } catch (err) {
        showError({
          title: "Bulk invite failed",
          message: err instanceof Error ? err.message : "Failed to send dashboard invites.",
        });
      } finally {
        setBulkActionLoading(null);
      }
    });
  };

  const handleBulkSendCustomEmail = async (opts: { subject: string; body: string; ctaLabel?: string; ctaUrl?: string }) => {
    setBulkEmailOpen(false);
    setBulkActionLoading("Sending custom email...");
    startTransition(async () => {
      try {
        const { bulkSendCustomEmail } = await import("@/app/actions/hriq/bulk-actions");
        const result: BulkActionResult = await bulkSendCustomEmail(Array.from(selected), opts);
        if (result.failed > 0) {
          showError({
            title: `Sent ${result.sent} of ${result.total}`,
            message: `${result.failed} failed: ${result.errors.map((e) => `${e.name} — ${e.error}`).join("; ")}`,
          });
        } else {
          showSuccess(`Email sent to ${result.sent} contractor(s).`);
          setSelected(new Set());
        }
      } catch (err) {
        showError({
          title: "Bulk email failed",
          message: err instanceof Error ? err.message : "Failed to send emails.",
        });
      } finally {
        setBulkActionLoading(null);
      }
    });
  };

  const handleBulkInviteToCadana = async () => {
    setBulkActionDropdown(false);
    setBulkActionLoading("Inviting to Cadana org...");
    startTransition(async () => {
      try {
        const { bulkInviteToCadana } = await import("@/app/actions/hriq/bulk-actions");
        const result: BulkActionResult = await bulkInviteToCadana(Array.from(selected));
        if (result.failed > 0) {
          showError({
            title: `Invited ${result.sent} of ${result.total}`,
            message: `${result.failed} failed: ${result.errors.map((e) => `${e.name} — ${e.error}`).join("; ")}`,
          });
        } else {
          showSuccess(`${result.sent} contractor(s) invited to Cadana org.`);
          setSelected(new Set());
        }
      } catch (err) {
        showError({
          title: "Cadana invite failed",
          message: err instanceof Error ? err.message : "Failed to invite to Cadana.",
        });
      } finally {
        setBulkActionLoading(null);
      }
    });
  };

  const openBulkDeleteConfirm = async () => {
    setConfirmDelete(true);
    setDeletePreview({ loading: true, error: null, lines: [], names: [] });
    try {
      const { previewDeleteEmployees } = await import("@/app/actions/hriq/employees");
      const result = await previewDeleteEmployees(Array.from(selected));
      if ("error" in result) {
        setDeletePreview({ loading: false, error: result.error ?? "Failed to load preview", lines: [], names: [] });
        return;
      }
      setDeletePreview({
        loading: false,
        error: null,
        names: result.employees.map((e: any) => `${e.name} (${e.email})`),
        lines: [
          { label: "Auth accounts permanently deleted", count: result.authAccountsDeleted, severity: result.authAccountsDeleted > 0 ? "critical" : "normal" },
          { label: "Payments erased", count: result.payments, severity: result.payments > 0 ? "warn" : "normal" },
          { label: "Timesheets erased", count: result.timesheets },
          { label: "Documents erased", count: result.documents },
          { label: "Onboarding sessions erased", count: result.onboardingSessions },
          { label: "Stripe Connect accounts", count: result.hasStripe },
          { label: "Wise recipients", count: result.hasWise },
        ],
      });
    } catch {
      setDeletePreview({ loading: false, error: "Failed to load preview", lines: [], names: [] });
    }
  };

  const handleBulkDelete = async () => {
    try {
      const { hardDeleteEmployees } = await import("@/app/actions/hriq/employees");
      const result = await hardDeleteEmployees(Array.from(selected));
      if ("error" in result) {
        showError({ title: "Delete failed", message: result.error ?? "An error occurred" });
        return;
      }
      setSelected(new Set());
      setConfirmDelete(false);
      showSuccess(`${(result as any).deleted} contractor(s) permanently deleted.`);
    } catch (err) {
      showError({
        title: "Delete failed",
        message: err instanceof Error ? err.message : "Failed to delete one or more contractors.",
      });
    }
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
      if (key === "org" && value) params.set("org", value);
      else if (filters.org) params.set("org", filters.org);
      router.push(`/${orgSlug}/employees?${params.toString()}`);
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
        <form onSubmit={handleSearch} className="flex-1 min-w-[180px]">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search contractors..."
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </form>
        <div className="w-[160px]">
          <CustomSelect
            value={filters.status ?? ""}
            onValueChange={(value) => updateFilter("status", value)}
            placeholder="Active (default)"
            triggerClassName="h-10 w-full"
            options={STATUSES.filter((s) => s.value !== "").map((s) => ({ value: s.value, label: s.label }))}
          />
        </div>
        <div className="w-[180px]">
          <CustomSelect
            value={filters.department ?? ""}
            onValueChange={(value) => updateFilter("department", value)}
            placeholder="All Departments"
            triggerClassName="h-10 w-full"
            options={departments.map((d) => ({ value: d.department, label: `${d.department} (${d.count})` }))}
          />
        </div>
        {orgOptions && orgOptions.length > 0 && (
          <div className="w-[180px]">
            <CustomSelect
              value={filters.org ?? ""}
              onValueChange={(value) => updateFilter("org", value)}
              placeholder="All Organizations"
              triggerClassName="h-10 w-full"
              options={[
                ...orgOptions.map((o) => ({ value: o.id, label: o.name })),
                { value: "unassigned", label: "Unassigned" },
              ]}
            />
          </div>
        )}
        <CsvExportButton
          data={employees.map((e) => ({
            name: `${e.legalFirstName} ${e.legalLastName}`,
            email: e.workEmail ?? e.personalEmail ?? "",
            id: e.employeeNumber,
            department: e.department ?? "",
            title: e.jobTitle ?? e.employmentType,
            status: e.employmentStatus,
            startDate: e.startDate ? shortDate(e.startDate as any) : "",
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
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            + Add Contractor
          </button>
        )}
      </div>

      {/* Bulk Actions */}
      {selected.size > 0 && (
        bulkActionLoading ? (
          /* ── Loading state ── */
          <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3 animate-in fade-in duration-200">
            <div className="flex items-center gap-2.5">
              <svg className="h-4 w-4 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <div>
                <div className="text-sm font-medium">{bulkActionLoading}</div>
                <div className="text-xs text-muted-foreground">
                  Processing {selected.size} contractor{selected.size > 1 ? "s" : ""} — please wait, do not close this page
                </div>
              </div>
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse [animation-delay:150ms]" />
              <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse [animation-delay:300ms]" />
            </div>
          </div>
        ) : (
          /* ── Normal actions bar ── */
          <div className="flex items-center gap-3 rounded-lg bg-primary/10 p-3">
            <span className="text-sm font-medium">{selected.size} selected</span>
            <div className="w-[180px]">
              <CustomSelect
                placeholder="Change Status..."
                disabled={isPending}
                onValueChange={(value) => {
                  if (value) handleBulkStatus(value);
                }}
                triggerClassName="h-8 w-full text-xs"
                options={[
                  { value: "active", label: "Set Active" },
                  { value: "offboarding_in_progress", label: "Start Offboarding" },
                  { value: "offboarded", label: "Offboard" },
                ]}
              />
            </div>

            {/* Bulk Email Actions Dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setBulkActionDropdown(!bulkActionDropdown)}
                disabled={isPending}
                className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors disabled:opacity-50"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" /></svg>
                Bulk Actions
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
              </button>
              {bulkActionDropdown && (
                <div className="absolute top-full left-0 mt-1 z-50 w-64 rounded-lg border bg-popover p-1 shadow-lg animate-in fade-in zoom-in-95 duration-100">
                  <button
                    onClick={handleBulkSendDashboardInvite}
                    className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors text-left"
                  >
                    <svg className="h-4 w-4 text-orange-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z" /></svg>
                    <div>
                      <div className="font-medium">Send Dashboard Invite</div>
                      <div className="text-xs text-muted-foreground">Provision account + send credentials</div>
                    </div>
                  </button>
                  <div className="my-1 border-t" />
                  <button
                    onClick={handleBulkSendDashboardLink}
                    className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors text-left"
                  >
                    <svg className="h-4 w-4 text-blue-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
                    <div>
                      <div className="font-medium">Send Dashboard Link</div>
                      <div className="text-xs text-muted-foreground">Login URL + feature overview</div>
                    </div>
                  </button>
                  <button
                    onClick={handleBulkResendOnboarding}
                    className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors text-left"
                  >
                    <svg className="h-4 w-4 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" /></svg>
                    <div>
                      <div className="font-medium">Resend Onboarding</div>
                      <div className="text-xs text-muted-foreground">Welcome email + form links</div>
                    </div>
                  </button>
                  <div className="my-1 border-t" />
                  <button
                    onClick={() => { setBulkActionDropdown(false); setBulkEmailOpen(true); }}
                    className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors text-left"
                  >
                    <svg className="h-4 w-4 text-purple-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>
                    <div>
                      <div className="font-medium">Send Custom Email</div>
                      <div className="text-xs text-muted-foreground">Compose a branded email</div>
                    </div>
                  </button>
                  <div className="my-1 border-t" />
                  <button
                    onClick={handleBulkInviteToCadana}
                    className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors text-left"
                  >
                    <svg className="h-4 w-4 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" /></svg>
                    <div>
                      <div className="font-medium">Invite to Cadana Org</div>
                      <div className="text-xs text-muted-foreground">Add to Cadana + send setup email</div>
                    </div>
                  </button>
                </div>
              )}
            </div>

            <button onClick={() => setSelected(new Set())} className="text-xs text-muted-foreground hover:underline">Clear</button>
            <button
              onClick={openBulkDeleteConfirm}
              disabled={isPending}
              className="ml-auto rounded-md bg-red-600 hover:bg-red-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors"
            >
              Delete Permanently
            </button>
          </div>
        )
      )}

      {/* Contractor Table */}
      <div className="rounded-xl border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b text-left text-sm text-muted-foreground">
                <th className="px-2 py-3 w-8"><input type="checkbox" checked={selected.size === employees.length && employees.length > 0} onChange={toggleAll} className="h-4 w-4" /></th>
                <SortHeader col="name">Contractor</SortHeader>
                <SortHeader col="email">Email</SortHeader>
                {isSuperAdmin && <SortHeader col="org">Organization</SortHeader>}
                <SortHeader col="department">Department</SortHeader>
                <SortHeader col="role">Role</SortHeader>
                <SortHeader col="status">Status</SortHeader>
                <SortHeader col="startDate">Start Date</SortHeader>
              </tr>
            </thead>
            <tbody>
              {sortedEmployees.map((emp) => (
                <tr key={emp.id} className={`border-b last:border-0 hover:bg-muted/50 transition-colors ${selected.has(emp.id) ? "bg-primary/5" : ""}`}>
                  <td className="px-2 py-3"><input type="checkbox" checked={selected.has(emp.id)} onChange={() => toggleSelect(emp.id)} className="h-4 w-4" /></td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/${orgSlug}/employees/${emp.id}${searchParams.toString() ? `?from=${encodeURIComponent(`/${orgSlug}/employees?${searchParams.toString()}`)}` : ""}`}
                      prefetch={false}
                      className="flex items-center gap-3 font-medium hover:underline"
                    >
                      {emp.photoUrl && !emp.photoUrl.endsWith("/logo.png") ? (
                        <img src={emp.photoUrl} alt="" className="h-8 w-8 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-white dark:bg-white/90 p-0.5">
                          <img src="/logo.png" alt="RL" className="h-full w-full object-contain" />
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-1">
                          {emp.preferredName ?? emp.legalFirstName} {emp.legalLastName}
                          {(emp as any).paymentMethodVerified && (emp as any).preferredPaymentMethod && (
                            <span className="text-orange-500" title={`Payment verified (${(emp as any).preferredPaymentMethod})`}>
                              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.31-8.86c-1.77-.45-2.34-.94-2.34-1.67 0-.84.79-1.43 2.1-1.43 1.38 0 1.9.66 1.94 1.64h1.71c-.05-1.34-.87-2.57-2.49-2.97V5H11.1v1.69c-1.51.32-2.72 1.3-2.72 2.81 0 1.79 1.49 2.69 3.66 3.21 1.95.46 2.34 1.15 2.34 1.87 0 .53-.39 1.39-2.1 1.39-1.6 0-2.23-.72-2.32-1.64H8.25c.1 1.71 1.38 2.66 2.85 2.97V19h2.34v-1.67c1.52-.29 2.72-1.16 2.73-2.77-.01-2.2-1.9-2.96-3.86-3.42z" /></svg>
                            </span>
                          )}
                        </div>
                        <div className="text-xs font-normal text-muted-foreground">{emp.employeeNumber}</div>
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {emp.workEmail ?? emp.personalEmail ?? "—"}
                  </td>
                  {isSuperAdmin && (
                    <td className="px-4 py-3 text-sm">
                      {(() => {
                        const org = (emp as typeof emp & { organization?: { id: string; name: string } | null }).organization;
                        if (org) return <Link href={`/${orgSlug}/organizations/${org.id}`} className="text-primary hover:underline">{org.name}</Link>;
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
                      ? shortDate(emp.startDate as any)
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

      {/* Add Contractor Dialog */}
      {showCreate && (
        <CreateEmployeeDialog
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
          }}
        />
      )}

      <DestructiveConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleBulkDelete}
        title={`Permanently Delete ${selected.size} Contractor${selected.size > 1 ? "s" : ""}`}
        description="This will permanently erase all data for the selected contractors. Their auth accounts, timesheets, documents, and payment records will be destroyed. This cannot be undone."
        loading={deletePreview.loading}
        error={deletePreview.error}
        entityNames={deletePreview.names}
        impactLines={deletePreview.lines}
        confirmText="DELETE"
        confirmLabel={`Delete ${selected.size} Contractor${selected.size > 1 ? "s" : ""}`}
      />

      {/* Bulk Custom Email Dialog */}
      {bulkEmailOpen && (
        <BulkEmailDialog
          count={selected.size}
          onClose={() => setBulkEmailOpen(false)}
          onSend={handleBulkSendCustomEmail}
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
  const { showError } = useErrorDialog();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      try {
        const result = await createEmployee({
          legalFirstName: formData.get("legalFirstName") as string,
          legalLastName: formData.get("legalLastName") as string,
          preferredName: formData.get("preferredName") as string,
          employmentType: formData.get("employmentType") as string,
          personalEmail: formData.get("personalEmail") as string,
          workEmail: formData.get("workEmail") as string,
          phoneNumber: formData.get("phoneNumber") as string,
          mobileNumber: formData.get("mobileNumber") as string,
          dateOfBirth: formData.get("dateOfBirth") as string,
          department: formData.get("department") as string,
          jobTitle: formData.get("jobTitle") as string,
          timezone: formData.get("timezone") as string,
          hourlyRate: formData.get("hourlyRate") as string,
          currency: (formData.get("currency") as string) || "USD",
          startDate: formData.get("startDate") as string,
          country: formData.get("country") as string,
        });
        if (result && typeof result === "object" && "error" in result) {
          showError({ title: "Failed to add contractor", message: (result as any).error });
          return;
        }
        onCreated();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
        const isMasked = msg.includes("Server Components render") || msg.includes("specific message is omitted");
        showError({
          title: "Failed to add contractor",
          message: isMasked
            ? "Server error adding the contractor. Check Vercel logs for details."
            : msg,
          detail: isMasked && err instanceof Error
            ? `Next.js masked the real error in production.\nDigest: ${(err as any).digest ?? "N/A"}\n\nCheck Vercel Runtime Logs for the actual error.`
            : err instanceof Error ? err.stack : undefined,
        });
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in duration-150">
      <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl border bg-card p-6 shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-200" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">Add New Contractor</h2>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium">First Name *</label>
              <input name="legalFirstName" required className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium">Last Name *</label>
              <input name="legalLastName" required className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium">Preferred Name</label>
              <input name="preferredName" placeholder="Display name" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium">Date of Birth</label>
              <input name="dateOfBirth" type="date" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Employment Type *</label>
            <CustomSelect
              name="employmentType"
              defaultValue="contractor"
              triggerClassName="mt-1 h-10 w-full"
              options={[
                { value: "contractor", label: "Contractor" },
                { value: "full_time", label: "Full Time" },
                { value: "part_time", label: "Part Time" },
                { value: "intern", label: "Intern" },
              ]}
            />
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
              <label className="text-sm font-medium">Phone</label>
              <input name="phoneNumber" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium">Mobile Number</label>
              <input name="mobileNumber" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium">Country</label>
              <SearchableSelect name="country" placeholder="Select country..." triggerClassName="mt-1 h-10 w-full" options={[...COUNTRY_OPTIONS]} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Department</label>
              <CustomSelectWithOther name="department" placeholder="Select department..." triggerClassName="mt-1 h-10 w-full" baseOptions={[...DEPARTMENT_OPTIONS]} category="department" />
            </div>
            <div>
              <label className="text-sm font-medium">Job Title</label>
              <CustomSelectWithOther name="jobTitle" placeholder="Select role..." triggerClassName="mt-1 h-10 w-full" baseOptions={[...JOB_TITLE_OPTIONS]} category="job_title" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Timezone</label>
              <SearchableSelect name="timezone" placeholder="Select timezone..." triggerClassName="mt-1 h-10 w-full" options={[...TIMEZONE_OPTIONS]} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium">Hourly Rate</label>
              <input name="hourlyRate" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium">Currency</label>
              <CustomSelect
                name="currency"
                defaultValue="USD"
                triggerClassName="mt-1 h-10 w-full"
                options={[...CURRENCY_OPTIONS]}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Start Date</label>
              <DatePicker name="startDate" className="mt-1" />
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
              {isPending ? "Creating..." : "Create Contractor"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function BulkEmailDialog({
  count,
  onClose,
  onSend,
}: {
  count: number;
  onClose: () => void;
  onSend: (opts: { subject: string; body: string; ctaLabel?: string; ctaUrl?: string }) => void;
}) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [showCta, setShowCta] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSend({
      subject: subject.trim(),
      body: body.trim(),
      ctaLabel: ctaLabel.trim() || undefined,
      ctaUrl: ctaUrl.trim() || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in duration-150" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-xl border bg-card p-6 shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-200" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">Send Email to {count} Contractor{count > 1 ? "s" : ""}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Compose a branded email that will be sent to all selected contractors.
        </p>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="text-sm font-medium">Subject *</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              placeholder="e.g. Important Update — Remote Leverage"
              className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Message *</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
              rows={6}
              placeholder="Write your message here. Each contractor will be greeted by name automatically."
              className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
            />
            <p className="mt-1 text-xs text-muted-foreground">Plain text or HTML. Line breaks are preserved.</p>
          </div>
          {!showCta ? (
            <button
              type="button"
              onClick={() => setShowCta(true)}
              className="text-sm text-primary hover:underline"
            >
              + Add a button (optional)
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-3 rounded-lg border p-3">
              <div>
                <label className="text-xs font-medium">Button Label</label>
                <input
                  value={ctaLabel}
                  onChange={(e) => setCtaLabel(e.target.value)}
                  placeholder="e.g. Open Link"
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium">Button URL</label>
                <input
                  value={ctaUrl}
                  onChange={(e) => setCtaUrl(e.target.value)}
                  placeholder="https://..."
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                />
              </div>
            </div>
          )}
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
              disabled={!subject.trim() || !body.trim()}
              className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Send to {count} Contractor{count > 1 ? "s" : ""}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
