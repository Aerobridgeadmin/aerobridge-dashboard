"use client";



import { shortDate, fullDate } from "@/lib/hriq/format";
import { JOB_TITLE_OPTIONS, DEPARTMENT_OPTIONS } from "@/lib/hriq/role-department-options";
import { COUNTRY_OPTIONS } from "@/lib/hriq/country-options";
import { TIMEZONE_OPTIONS } from "@/lib/hriq/timezone-options";
import { CURRENCY_OPTIONS } from "@/lib/hriq/currency-options";
import { SearchableSelect } from "@/app/(authenticated)/components/searchable-select";
import {
  updateEmployee,
  changeEmployeeStatus,
  hardDeleteEmployees,
} from "@/app/actions/hriq/employees";
import { initiateOffboarding } from "@/app/actions/hriq/offboarding";
import { uploadEmployeePhoto, uploadEmployeeDocument } from "@/app/actions/hriq/upload";
import { compressImage } from "@/lib/hriq/compress-image";
import { useErrorDialog } from "@/app/(authenticated)/components/error-dialog";
import { DestructiveConfirmDialog } from "@/app/(authenticated)/components/destructive-confirm-dialog";
import { CustomSelect } from "@/app/(authenticated)/components/custom-select";
import { CustomSelectWithOther } from "@/app/(authenticated)/components/custom-select-with-other";
import { DatePicker } from "@/app/(authenticated)/components/date-picker";
import { completeTask } from "@/app/actions/hriq/tasks";
import { createDocument, deleteDocument, updateDocument, refetchJotformPdf, refreshDocumentSignedUrl } from "@/app/actions/hriq/documents";
import { createPayment } from "@/app/actions/hriq/payments";
import { createManagerNote } from "@/app/actions/hriq/onboarding";
// employee-permissions imported dynamically in Change Role modal
import type {
  Employee,
  Task,
  Document,
  Payment,
  ManagerNote,
  TimesheetSubmission,
} from "@repo/database";
import Link from "next/link";
import { useRouter , useParams, useSearchParams} from "next/navigation";
import { useRef, useState, useTransition, useEffect } from "react";

type EmployeeWithRelations = Employee & {
  organization?: { id: string; name: string } | null;
  manager: { id: string; legalFirstName: string; legalLastName: string } | null;
  tasks: Task[];
  documents: Document[];
  payments: Payment[];
  managerNotes: ManagerNote[];
  timesheetSubmissions: (TimesheetSubmission & { period: { name: string; startDate: Date; endDate: Date } })[];
};

type Tab = "overview" | "timesheets" | "tasks" | "documents" | "payments" | "notes";

const STATUS_COLORS: Record<string, string> = {
  pre_hire: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  onboarding_scheduled: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300",
  onboarding_in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300",
  active: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
  leave: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300",
  offboarding_in_progress: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300",
  offboarded: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

export function EmployeeDetail({ employee, isSuperAdmin, prevEmployeeId, nextEmployeeId }: { employee: EmployeeWithRelations; isSuperAdmin?: boolean; prevEmployeeId?: string | null; nextEmployeeId?: string | null }) {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [linkUserModalOpen, setLinkUserModalOpen] = useState(false);
  const [linkUserIdInput, setLinkUserIdInput] = useState("");
  const [isPendingHeader, startHeaderTransition] = useTransition();
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [roleData, setRoleData] = useState<{ memberships: { id: string; orgName: string; role: string }[]; linked: boolean } | null>(null);
  const [photoUrl, setPhotoUrl] = useState(employee.photoUrl);
  const [infoStatus, setInfoStatus] = useState(employee.infoApprovalStatus);
  const [justApproved, setJustApproved] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showError, showSuccess } = useErrorDialog();

  // Smart back navigation: use ?from= param if present, otherwise router.back()
  const fromPath = searchParams.get("from");
  const backLabel = fromPath
    ? fromPath.includes("/employees?") ? "Contractors"
    : fromPath.includes("/timesheets") ? "Timesheets"
    : fromPath.includes("/payroll") ? "Payroll"
    : fromPath.includes("/payments") ? "Payments"
    : fromPath.includes("/hiring") ? "Hiring"
    : fromPath.includes("/onboarding") ? "Onboarding"
    : fromPath.includes("/documents") ? "Documents"
    : fromPath.includes("/contracts") ? "Contracts"
    : fromPath.includes("/tasks") ? "Tasks"
    : fromPath.includes("/time-off") ? "Time Off"
    : fromPath.includes("/expenses") ? "Expenses"
    : fromPath.includes("/organizations") ? "Organization"
    : fromPath.includes("/reports") ? "Reports"
    : "Back"
    : null;

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    startHeaderTransition(async () => {
      try {
        const compressed = await compressImage(file, 800, 0.75);
        const fd = new FormData();
        fd.set("file", compressed);
        fd.set("employeeId", employee.id);
        const { url } = await uploadEmployeePhoto(fd);
        setPhotoUrl(url);
      } catch (err) {
        showError({
          title: "Photo upload failed",
          message: err instanceof Error ? err.message : "Could not upload the photo. Please try again.",
        });
      }
    });
  };

  const initials = `${(employee.preferredName ?? employee.legalFirstName).charAt(0)}${employee.legalLastName.charAt(0)}`.toUpperCase();

  const handleStatusChange = (newStatus: string) => {
    startHeaderTransition(async () => {
      try {
        await changeEmployeeStatus(employee.id, newStatus);
        setShowStatusMenu(false);
        showSuccess(`Status changed to ${newStatus.replace(/_/g, " ")}.`);
      } catch (err) {
        showError({
          title: "Status change failed",
          message: err instanceof Error ? err.message : "Could not update the contractor's status.",
        });
      }
    });
  };

  const handleDelete = () => {
    startHeaderTransition(async () => {
      try {
        const result = await hardDeleteEmployees([employee.id]);
        if ("error" in result) {
          showError({ title: "Delete failed", message: result.error });
          return;
        }
        router.push(`/${orgSlug}/employees`);
      } catch (err) {
        showError({
          title: "Delete failed",
          message: err instanceof Error ? err.message : "Could not delete the contractor record.",
        });
      }
    });
  };

  const handleLinkUser = (userId: string) => {
    if (!userId.trim()) return;
    startHeaderTransition(async () => {
      try {
        await updateEmployee(employee.id, { linkedUserId: userId.trim() });
        showSuccess("User account linked successfully.");
      } catch (err) {
        showError({
          title: "Link user failed",
          message: err instanceof Error ? err.message : "Could not link the user account.",
        });
      }
    });
  };

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "timesheets", label: "Timesheets", count: employee.timesheetSubmissions.length },
    { id: "tasks", label: "Tasks", count: employee.tasks.filter((t: any) => t.status !== "completed").length },
    { id: "documents", label: "Documents", count: employee.documents.length },
    { id: "payments", label: "Payments", count: employee.payments.length },
    { id: "notes", label: "Notes", count: employee.managerNotes.length },
  ];

  return (
    <div className="space-y-6">
      {/* Back link + prev/next nav */}
      <div className="flex items-center justify-between">
        {fromPath ? (
          <Link href={fromPath} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
            {backLabel}
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined" && window.history.length > 1) router.back();
              else router.push(`/${orgSlug}/employees`);
            }}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
            Back
          </button>
        )}
        {(prevEmployeeId || nextEmployeeId) && (
          <div className="flex items-center gap-1">
            {prevEmployeeId ? (
              <Link href={`/${orgSlug}/employees/${prevEmployeeId}`} className="inline-flex items-center gap-1 h-8 px-3 rounded-md border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                Prev
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1 h-8 px-3 rounded-md border text-xs font-medium text-muted-foreground/40 cursor-not-allowed">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                Prev
              </span>
            )}
            {nextEmployeeId ? (
              <Link href={`/${orgSlug}/employees/${nextEmployeeId}`} className="inline-flex items-center gap-1 h-8 px-3 rounded-md border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                Next
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1 h-8 px-3 rounded-md border text-xs font-medium text-muted-foreground/40 cursor-not-allowed">
                Next
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
              </span>
            )}
          </div>
        )}
      </div>
      {/* Header Card */}
      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            {/* Avatar with upload */}
            <div className="relative group">
              {photoUrl && !photoUrl.endsWith("/logo.png") ? (
                <img src={photoUrl} alt="" className="h-14 w-14 rounded-full object-cover border-2 border-muted" />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-white dark:bg-white/90 p-1 border border-border">
                  <img src="/logo.png" alt="RL" className="h-full w-full object-contain" />
                </div>
              )}
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                disabled={isPendingHeader}
                className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-white text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity disabled:cursor-wait"
              >
                {isPendingHeader ? "..." : "Edit"}
              </button>
              <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
            </div>
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
                {(employee as any).paymentMethodVerified && (employee as any).preferredPaymentMethod && (
                  <span className="text-orange-500" title={`Payment verified (${(employee as any).preferredPaymentMethod})`}>
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.31-8.86c-1.77-.45-2.34-.94-2.34-1.67 0-.84.79-1.43 2.1-1.43 1.38 0 1.9.66 1.94 1.64h1.71c-.05-1.34-.87-2.57-2.49-2.97V5H11.1v1.69c-1.51.32-2.72 1.3-2.72 2.81 0 1.79 1.49 2.69 3.66 3.21 1.95.46 2.34 1.15 2.34 1.87 0 .53-.39 1.39-2.1 1.39-1.6 0-2.23-.72-2.32-1.64H8.25c.1 1.71 1.38 2.66 2.85 2.97V19h2.34v-1.67c1.52-.29 2.72-1.16 2.73-2.77-.01-2.2-1.9-2.96-3.86-3.42z" /></svg>
                  </span>
                )}
              </div>
              {employee.preferredName && (
                <p className="text-xs text-muted-foreground">
                  Legal name: {employee.legalFirstName} {employee.legalLastName}
                </p>
              )}
              <p className="mt-1 text-sm text-muted-foreground">
                {employee.employeeNumber} &middot;{" "}
                {employee.jobTitle ?? employee.employmentType} &middot;{" "}
                {employee.department ?? "No department"}
                {employee.organization && (
                  <> &middot; <Link href={`/${orgSlug}/organizations/${employee.organization.id}`} className="text-primary hover:underline">{employee.organization.name}</Link></>
                )}
              </p>
              {employee.manager && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Reports to{" "}
                  <Link
                    href={`/${orgSlug}/employees/${employee.manager.id}`}
                    className="underline"
                  >
                    {employee.manager.legalFirstName} {employee.manager.legalLastName}
                  </Link>
                </p>
              )}
            </div>
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
                  <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-md border bg-popover p-1 shadow-md animate-in fade-in slide-in-from-top-1 duration-150">
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
                  <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-md border bg-popover p-1 shadow-md animate-in fade-in slide-in-from-top-1 duration-150">
                    <button onClick={() => { setShowActions(false); setActiveTab("overview"); }} className="flex w-full rounded-sm px-2 py-1.5 text-sm hover:bg-accent">Edit Details</button>
                    <button onClick={() => { setShowActions(false); setLinkUserIdInput(employee.linkedUserId ?? ""); setLinkUserModalOpen(true); }} className="flex w-full rounded-sm px-2 py-1.5 text-sm hover:bg-accent">
                      {employee.linkedUserId ? "Change Linked User" : "Link to User Account"}
                    </button>
                    <button
                      onClick={async () => {
                        setShowActions(false);
                        try {
                          const { provisionContractorDashboard, sendDashboardInviteEmail } = await import("@/app/actions/hriq/contractor-dashboard");
                          const result = await provisionContractorDashboard(employee.id);
                          if ("error" in result) { showError({ title: "Error", message: (result as any).error ?? "Failed" }); return; }
                          if ((result as any).alreadyProvisioned) {
                            await sendDashboardInviteEmail(employee.id);
                            showSuccess(`Dashboard invite re-sent to ${(result as any).email}`);
                          } else {
                            await sendDashboardInviteEmail(employee.id);
                            showSuccess(`Dashboard provisioned and invite sent to ${(result as any).email}`);
                          }
                        } catch (err) {
                          showError({ title: "Error", message: err instanceof Error ? err.message : "Failed to provision dashboard." });
                        }
                      }}
                      className="flex w-full rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                    >
                      {employee.linkedUserId ? "Re-send Dashboard Invite" : "Provision Dashboard"}
                    </button>
                    {employee.linkedUserId && (
                      <button
                        onClick={async () => {
                          setShowActions(false);
                          try {
                            const { resetContractorPassword } = await import("@/app/actions/hriq/payroll");
                            const result = await resetContractorPassword(employee.id);
                            if ("error" in result) { showError({ title: "Error", message: (result as any).error }); return; }
                            showSuccess(
                              result.emailSent
                                ? `Password reset and temporary password emailed to ${employee.legalFirstName}. They'll be asked to change it on next login.`
                                : `Password reset for ${employee.legalFirstName}. No email on file — share the temporary password manually.`
                            );
                          } catch (err) {
                            showError({ title: "Error", message: err instanceof Error ? err.message : "Failed to reset password." });
                          }
                        }}
                        className="flex w-full rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                      >
                        Reset Password
                      </button>
                    )}
                    <button
                      onClick={async () => {
                        setShowActions(false);
                        try {
                          const { sendContractorInfoLink } = await import("@/app/actions/hriq/contractor-info");
                          const result = await sendContractorInfoLink(employee.id);
                          if (result.success) {
                            showSuccess(result.message);
                          } else {
                            showError({ title: "Error", message: result.message });
                          }
                        } catch (err) {
                          showError({ title: "Error", message: err instanceof Error ? err.message : "Failed to send info form link." });
                        }
                      }}
                      className="flex w-full rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                    >
                      Send Info Form
                    </button>
                    <button
                      onClick={async () => {
                        setShowActions(false);
                        try {
                          const { getEmployeePermissions } = await import("@/app/actions/hriq/employee-permissions");
                          const result = await getEmployeePermissions(employee.id);
                          if ("error" in result) throw new Error((result as any).error);
                          setRoleData({
                            memberships: (result as any).memberships.map((m: any) => ({ id: m.id, orgName: m.organizationName, role: m.role })),
                            linked: (result as any).linked,
                          });
                          setRoleModalOpen(true);
                        } catch (err) {
                          showError({ title: "Error", message: err instanceof Error ? err.message : "Failed to load role info." });
                        }
                      }}
                      className="flex w-full rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                    >
                      Change Role
                    </button>
                    <button
                      onClick={async () => {
                        setShowActions(false);
                        try {
                          const { sendContractorVeriff } = await import("@/app/actions/hriq/contractor-kyc");
                          const result = await sendContractorVeriff(employee.id);
                          if ("error" in result) { showError({ title: "Veriff Error", message: (result as any).error }); return; }
                          showSuccess(`Veriff identity verification link sent to ${employee.legalFirstName}`);
                        } catch (err) {
                          showError({ title: "Error", message: err instanceof Error ? err.message : "Failed to send Veriff link." });
                        }
                      }}
                      className="flex w-full rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                    >
                      Send Veriff KYC
                    </button>
                    <button
                        onClick={async () => {
                          setShowActions(false);
                          try {
                            const { sendStripeConnectInvite } = await import("@/app/actions/hriq/stripe");
                            const result = await sendStripeConnectInvite(employee.id);
                            if ("error" in result) { showError({ title: "Stripe Error", message: (result as any).error }); return; }
                            showSuccess(`Stripe account setup email sent to ${employee.legalFirstName}`);
                          } catch (err) {
                            showError({ title: "Error", message: err instanceof Error ? err.message : "Failed to send Stripe setup." });
                          }
                        }}
                        className="flex w-full rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                      >
                        Send Stripe Setup
                      </button>
                    <button
                      onClick={async () => {
                        setShowActions(false);
                        try {
                          const { sendWiseSetupLink } = await import("@/app/actions/hriq/wise-setup");
                          const result = await sendWiseSetupLink(employee.id);
                          if (result.success) {
                            showSuccess(result.message);
                          } else {
                            showError({ title: "Wise Setup", message: result.message });
                          }
                        } catch (err) {
                          showError({ title: "Error", message: err instanceof Error ? err.message : "Failed to send Wise setup link." });
                        }
                      }}
                      className="flex w-full rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                    >
                      Send Wise Setup Link
                    </button>
                    <button
                      onClick={async () => {
                        setShowActions(false);
                        try {
                          const { sendCadanaSetupLink } = await import("@/app/actions/hriq/cadana-setup");
                          const result = await sendCadanaSetupLink(employee.id);
                          if (result.success) {
                            showSuccess(result.message);
                          } else {
                            showError({ title: "Cadana Bank Link", message: result.message });
                          }
                        } catch (err) {
                          showError({ title: "Error", message: err instanceof Error ? err.message : "Failed to send Cadana bank link." });
                        }
                      }}
                      className="flex w-full rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                    >
                      Send Cadana Bank Link
                    </button>
                    <button
                      onClick={async () => {
                        setShowActions(false);
                        try {
                          const { sendCadanaInvite } = await import("@/app/actions/hriq/cadana-setup");
                          const result = await sendCadanaInvite(employee.id);
                          if (result.success) {
                            showSuccess(result.message);
                          } else {
                            showError({ title: "Cadana Org Invite", message: result.message });
                          }
                        } catch (err) {
                          showError({ title: "Error", message: err instanceof Error ? err.message : "Failed to send Cadana org invite." });
                        }
                      }}
                      className="flex w-full rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                    >
                      Invite to Cadana Org
                    </button>
                    <div className="my-1 border-t" />
                    {employee.employmentStatus === "active" && (
                      <button
                        onClick={async () => {
                          setShowActions(false);
                          startHeaderTransition(async () => {
                            try {
                              const result = await initiateOffboarding(employee.id);
                              if ("success" in result && result.success) {
                                showSuccess(`Offboarding started for ${employee.legalFirstName} ${employee.legalLastName}. Redirecting to pipeline…`);
                                router.push(`/${orgSlug}/hiring?tab=offboarding`);
                              } else if ("error" in result) {
                                showError({ title: "Offboarding Error", message: result.error ?? "Unknown error" });
                              }
                            } catch (err) {
                              showError({ title: "Error", message: err instanceof Error ? err.message : "Failed to start offboarding." });
                            }
                          });
                        }}
                        className="flex w-full rounded-sm px-2 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                      >
                         Start Offboarding
                      </button>
                    )}
                    <button onClick={() => { setShowActions(false); setConfirmDeleteOpen(true); }} className="flex w-full rounded-sm px-2 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950">Delete Contractor</button>
                  </div>
                </>
              )}
            </div>

            <button
              onClick={() => {
                if (typeof window !== "undefined" && window.history.length > 1) window.history.back();
                else router.push(`/${orgSlug}/employees`);
              }}
              className="h-9 rounded-md border px-3 text-sm hover:bg-accent"
            >
              Back
            </button>
          </div>
        </div>
      </div>

      {/* Info Form Approval Banner */}
      {infoStatus === "pending_review" && (
        <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/30">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900">
              <svg className="h-3.5 w-3.5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M12 3a9 9 0 100 18 9 9 0 000-18z" /></svg>
            </div>
            <span className="text-sm font-medium text-amber-800 dark:text-amber-200">Contractor info submitted — awaiting approval</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isPendingHeader}
              onClick={() => startHeaderTransition(async () => {
                try {
                  const { approveContractorInfo } = await import("@/app/actions/hriq/contractor-info");
                  const result = await approveContractorInfo(employee.id);
                  if ("error" in result) {
                    showError({ title: "Error", message: (result as any).error });
                  } else {
                    setInfoStatus("approved");
                    setJustApproved(true);
                    showSuccess("Contractor info approved.");
                    router.refresh();
                    setTimeout(() => setJustApproved(false), 3000);
                  }
                } catch (err) {
                  showError({ title: "Error", message: err instanceof Error ? err.message : "Failed to approve." });
                }
              })}
              className="h-7 rounded bg-green-600 px-3 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              Approve
            </button>
            <button
              type="button"
              disabled={isPendingHeader}
              onClick={() => startHeaderTransition(async () => {
                const reason = prompt("Rejection reason (optional):");
                if (reason === null) return; // cancelled
                try {
                  const { rejectContractorInfo } = await import("@/app/actions/hriq/contractor-info");
                  const result = await rejectContractorInfo(employee.id, reason || undefined);
                  if ("error" in result) {
                    showError({ title: "Error", message: (result as any).error });
                  } else {
                    setInfoStatus("rejected");
                    showSuccess("Contractor info rejected. They can resubmit.");
                    router.refresh();
                  }
                } catch (err) {
                  showError({ title: "Error", message: err instanceof Error ? err.message : "Failed to reject." });
                }
              })}
              className="h-7 rounded border border-red-200 px-3 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
            >
              Reject
            </button>
          </div>
        </div>
      )}
      {infoStatus === "approved" && justApproved && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2 dark:border-green-800 dark:bg-green-950/30 animate-in fade-in duration-200">
          <svg className="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
          <span className="text-sm text-green-700 dark:text-green-300">Contractor info approved</span>
        </div>
      )}
      {infoStatus === "rejected" && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 dark:border-red-800 dark:bg-red-950/30">
          <svg className="h-4 w-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          <span className="text-sm text-red-700 dark:text-red-300">Contractor info rejected — awaiting resubmission</span>
        </div>
      )}

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
      {activeTab === "overview" && <OverviewTab employee={employee} isSuperAdmin={isSuperAdmin} />}
      {activeTab === "timesheets" && <TimesheetsTab timesheets={employee.timesheetSubmissions} hourlyRate={employee.hourlyRate ? Number(employee.hourlyRate) : null} compensationType={(employee as any).compensationType ?? "hourly"} monthlySalary={(employee as any).monthlySalary ? Number((employee as any).monthlySalary) : null} isSuperAdmin={isSuperAdmin} />}
      {activeTab === "tasks" && <TasksTab tasks={employee.tasks} employeeId={employee.id} />}
      {activeTab === "documents" && <DocumentsTab documents={employee.documents} employeeId={employee.id} isOnboarding={["pre_hire", "onboarding_in_progress", "onboarding_scheduled"].includes(employee.employmentStatus)} bankInfo={{ bankName: employee.bankName, bankAccountName: employee.bankAccountName, bankAccountNumber: employee.bankAccountNumber, bankRoutingNumber: employee.bankRoutingNumber, bankAddress: employee.bankAddress }} />}
      {activeTab === "payments" && <PaymentsTab payments={employee.payments} employee={employee} />}
      {activeTab === "notes" && <NotesTab notes={employee.managerNotes} employeeId={employee.id} />}

      <DestructiveConfirmDialog
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirm={async () => {
          try {
            const result = await hardDeleteEmployees([employee.id]);
            if ("error" in result) {
              showError({ title: "Delete failed", message: result.error });
              return;
            }
            router.push(`/${orgSlug}/employees`);
          } catch (err) {
            showError({ title: "Delete failed", message: err instanceof Error ? err.message : "Could not delete the contractor record." });
          }
        }}
        title="Permanently Delete Contractor"
        description={`This will permanently delete ${employee.legalFirstName} ${employee.legalLastName} and all associated records. This action cannot be undone.`}
        impactLines={[
          { label: "Contractor record permanently deleted", count: 1, severity: "critical" },
          { label: "Timesheets, documents, payments removed", count: 1, severity: "critical" },
          { label: "Auth account removed", count: employee.linkedUserId ? 1 : 0, severity: "warn" },
        ]}
        confirmLabel="Permanently Delete"
      />

      {linkUserModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-200" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold">Link User Account</h3>
            <p className="mt-2 text-sm text-muted-foreground">Enter the Supabase User ID to link this contractor.</p>
            <input
              value={linkUserIdInput}
              onChange={(e) => setLinkUserIdInput(e.target.value)}
              placeholder="e.g. 7f7b7e20-..."
              className="mt-3 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setLinkUserModalOpen(false)} disabled={isPendingHeader} className="h-9 rounded-md border px-4 text-sm hover:bg-accent disabled:opacity-50">Cancel</button>
              <button
                type="button"
                onClick={() => {
                  const value = linkUserIdInput;
                  setLinkUserModalOpen(false);
                  handleLinkUser(value);
                }}
                disabled={isPendingHeader || !linkUserIdInput.trim()}
                className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {isPendingHeader ? "Saving..." : employee.linkedUserId ? "Update Link" : "Link User"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Role Change Modal */}
      {roleModalOpen && roleData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-200" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold">Permissions &amp; Access</h3>
            {!roleData.linked ? (
              <p className="mt-3 text-sm text-amber-600">No linked user account. Provision a dashboard first to assign a role.</p>
            ) : roleData.memberships.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No organization memberships found.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {roleData.memberships.map((m) => (
                  <div key={m.id} className="rounded-lg border p-3 space-y-3">
                    <div>
                      <div className="text-sm font-medium">{m.orgName}</div>
                      <div className="mt-0.5 flex items-center gap-2">
                        <span className="inline-flex rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-medium capitalize">{m.role.replace("_", " ")}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {m.role === "super_admin" ? "Full platform access" : m.role === "admin" ? "Full org access" : m.role === "manager" ? "Team management" : "Self-service access"}
                        </span>
                      </div>
                    </div>
                    <div className="text-xs font-medium text-muted-foreground">Change Role</div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {([
                        { value: "super_admin", label: "Super Admin" },
                        { value: "admin", label: "Admin" },
                        { value: "manager", label: "Manager" },
                        { value: "member", label: "Member" },
                      ]).map((opt) => (
                        <button
                          key={opt.value}
                          disabled={isPendingHeader || m.role === opt.value}
                          onClick={() => {
                            startHeaderTransition(async () => {
                              try {
                                const { changeEmployeeRole } = await import("@/app/actions/hriq/employee-permissions");
                                const result = await changeEmployeeRole(employee.id, m.id, opt.value);
                                if ((result as any).success) {
                                  setRoleData((prev) => prev ? {
                                    ...prev,
                                    memberships: prev.memberships.map((mem) => mem.id === m.id ? { ...mem, role: opt.value } : mem),
                                  } : prev);
                                  showSuccess(`Role changed to ${opt.label}`);
                                }
                              } catch (err) {
                                showError({ title: "Error", message: err instanceof Error ? err.message : "Failed to change role." });
                              }
                            });
                          }}
                          className={`rounded-md border px-2 py-1.5 text-[11px] font-medium transition-colors disabled:cursor-not-allowed ${
                            m.role === opt.value
                              ? "border-primary bg-primary/10 text-primary ring-1 ring-primary/20"
                              : "hover:bg-accent disabled:opacity-40"
                          }`}
                        >
                          {isPendingHeader ? "..." : opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 flex justify-end">
              <button onClick={() => setRoleModalOpen(false)} className="h-9 rounded-md border px-4 text-sm hover:bg-accent">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

//  Overview Tab 

function OverviewTab({ employee, isSuperAdmin }: { employee: EmployeeWithRelations; isSuperAdmin?: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [editCompType, setEditCompType] = useState<"hourly" | "monthly">((employee as any).compensationType === "monthly" ? "monthly" : "hourly");
  const [editPayMethod, setEditPayMethod] = useState<"" | "cadana" | "wise">(((employee as any).preferredPaymentMethod === "cadana" || (employee as any).preferredPaymentMethod === "wise") ? (employee as any).preferredPaymentMethod : "");
  const [editCountry, setEditCountry] = useState(employee.country ?? "");
  const { showError, showSuccess } = useErrorDialog();

  const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data: Record<string, unknown> = {};
    const bankExtra: Record<string, string> = {};
    for (const [key, value] of (fd as any).entries()) {
      if (typeof value === "string") {
        // Collect bankExtra* fields into JSON
        if (key.startsWith("bankExtra")) {
          const shortKey = key.replace("bankExtra", "");
          const camelKey = shortKey.charAt(0).toLowerCase() + shortKey.slice(1);
          if (value.trim()) bankExtra[camelKey] = value.trim();
        } else {
          data[key] = value.trim() || null;
        }
      }
    }
    // Pack extra bank data into JSON field
    if (Object.keys(bankExtra).length > 0) {
      data.bankExtraData = bankExtra;
    }
    startTransition(async () => {
      try {
        await updateEmployee(employee.id, data);
        showSuccess("Contractor details saved.");
        setEditing(false);
      } catch (err) {
        showError({
          title: "Save failed",
          message: err instanceof Error ? err.message : "Could not save contractor details.",
          detail: err instanceof Error ? err.stack : undefined,
        });
      }
    });
  };

  if (editing) {
    return (
      <form onSubmit={handleSave} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Card title="Personal Information">
            <EditField name="legalFirstName" label="Legal First Name" value={employee.legalFirstName} />
            <EditField name="secondName" label="Second Name (Middle)" value={(employee as any).secondName} />
            <EditField name="legalLastName" label="Legal Last Name (first surname)" value={employee.legalLastName} />
            <EditField name="secondLastName" label="Second Last Name (maternal)" value={(employee as any).secondLastName} />
            <EditField name="preferredName" label="Preferred Name" value={employee.preferredName} />
            <EditField name="dateOfBirth" label="Date of Birth" type="date" value={employee.dateOfBirth ? new Date(employee.dateOfBirth as any).toISOString().split("T")[0] : undefined} />
            <EditField name="mobileNumber" label="Mobile" value={employee.mobileNumber} />
            <EditField name="homePhone" label="Home Phone" value={employee.homePhone} />
          </Card>
          <Card title="Employment Details">
            <div className="flex items-center justify-between py-1">
              <label className="text-sm text-muted-foreground">Employment Type</label>
              <div className="w-48">
                <CustomSelect name="employmentType" defaultValue={employee.employmentType ?? "full_time"} triggerClassName="h-8 w-full" options={[{ value: "full_time", label: "Full Time" }, { value: "part_time", label: "Part Time" }]} />
              </div>
            </div>
            <div className="flex items-center justify-between py-1">
              <label className="text-sm text-muted-foreground">Department</label>
              <div className="w-48">
                <CustomSelectWithOther name="department" defaultValue={employee.department ?? ""} placeholder="Select department..." triggerClassName="h-8 w-full" baseOptions={[...DEPARTMENT_OPTIONS]} category="department" />
              </div>
            </div>
            <div className="flex items-center justify-between py-1">
              <label className="text-sm text-muted-foreground">Job Title</label>
              <div className="w-48">
                <CustomSelectWithOther name="jobTitle" defaultValue={employee.jobTitle ?? ""} placeholder="Select role..." triggerClassName="h-8 w-full" baseOptions={[...JOB_TITLE_OPTIONS]} category="job_title" />
              </div>
            </div>
            <div className="flex items-center justify-between py-1">
              <label className="text-sm text-muted-foreground">Timezone</label>
              <div className="w-48">
                <SearchableSelect name="timezone" defaultValue={employee.timezone ?? ""} placeholder="Select timezone..." triggerClassName="h-8 w-full" options={[...TIMEZONE_OPTIONS]} />
              </div>
            </div>
            <EditField name="startDate" label="Start Date" type="date" value={employee.startDate ? new Date(employee.startDate as any).toISOString().split("T")[0] : undefined} />
            <EditField name="endDate" label="End Date" type="date" value={employee.endDate ? new Date(employee.endDate as any).toISOString().split("T")[0] : undefined} />
          </Card>
          <Card title="Contact Information">
            <EditField name="workEmail" label="Work Email" value={employee.workEmail} />
            <EditField name="personalEmail" label="Personal Email" value={employee.personalEmail} />
            <EditField name="phoneNumber" label="Phone" value={employee.phoneNumber} />
          </Card>
          <Card title="Address">
            <EditField name="streetAddress" label="Street" value={employee.streetAddress} />
            <EditField name="city" label="City" value={employee.city} />
            <EditField name="stateProvince" label="State/Province" value={employee.stateProvince} />
            <EditField name="postalCode" label="Postal Code" value={employee.postalCode} />
            <div className="flex items-center justify-between py-1">
              <label className="text-sm text-muted-foreground">Country</label>
              <div className="w-48">
                <SearchableSelect name="country" value={editCountry} onValueChange={setEditCountry} placeholder="Select country..." triggerClassName="h-8 w-full" options={[...COUNTRY_OPTIONS]} />
              </div>
            </div>
          </Card>
          <Card title="Compensation">
            <div className="flex items-center justify-between py-1">
              <label className="text-sm text-muted-foreground">Compensation Type</label>
              <div className="flex h-8 w-48 rounded-md border border-input overflow-hidden">
                <input type="hidden" name="compensationType" value={editCompType} />
                <button type="button" onClick={() => setEditCompType("hourly")} className={`flex-1 text-xs font-medium transition-colors ${editCompType === "hourly" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent"}`}>Hourly</button>
                <button type="button" onClick={() => setEditCompType("monthly")} className={`flex-1 text-xs font-medium transition-colors ${editCompType === "monthly" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent"}`}>Monthly</button>
              </div>
            </div>
            {editCompType === "hourly" ? (
              <EditField name="hourlyRate" label="Hourly Rate" value={employee.hourlyRate ? String(employee.hourlyRate) : undefined} />
            ) : (
              <EditField name="monthlySalary" label="Monthly Salary" value={(employee as any).monthlySalary ? String((employee as any).monthlySalary) : undefined} />
            )}
            <div className="flex items-center justify-between py-1">
              <label className="text-sm text-muted-foreground">Currency</label>
              <div className="w-48">
                <SearchableSelect name="currency" defaultValue={employee.currency ?? ""} placeholder="Select currency..." triggerClassName="h-8 w-full" options={[...CURRENCY_OPTIONS]} />
              </div>
            </div>
            <div className="flex items-center justify-between py-1">
              <label className="text-sm text-muted-foreground">Payment Method</label>
              <div className="flex h-8 w-48 rounded-md border border-input overflow-hidden">
                <input type="hidden" name="preferredPaymentMethod" value={editPayMethod} />
                {isSuperAdmin ? (
                  <>
                    <button type="button" onClick={() => setEditPayMethod(editPayMethod === "cadana" ? "" : "cadana")} className={`flex-1 text-xs font-medium transition-colors ${editPayMethod === "cadana" ? "bg-orange-500 text-white" : "bg-background hover:bg-accent"}`}>Cadana</button>
                    <button type="button" onClick={() => setEditPayMethod(editPayMethod === "wise" ? "" : "wise")} className={`flex-1 text-xs font-medium transition-colors ${editPayMethod === "wise" ? "bg-green-600 text-white" : "bg-background hover:bg-accent"}`}>Wise</button>
                  </>
                ) : (
                  <>
                    <div className={`flex-1 flex items-center justify-center text-xs font-medium ${editPayMethod === "cadana" ? "bg-orange-500/60 text-white" : "bg-muted text-muted-foreground"}`}>Cadana</div>
                    <div className={`flex-1 flex items-center justify-center text-xs font-medium ${editPayMethod === "wise" ? "bg-green-600/60 text-white" : "bg-muted text-muted-foreground"}`}>Wise</div>
                  </>
                )}
              </div>
            </div>
            {!isSuperAdmin && <p className="text-[10px] text-muted-foreground ml-1 -mt-1">Only super admins can change the payment method</p>}
          </Card>
          <Card title="Banking">
            <DynamicBankingEdit payMethod={editPayMethod || null} country={editCountry} employee={employee} />
          </Card>
          <Card title="Emergency Contact">
            <EditField name="emergencyContactName" label="Name" value={employee.emergencyContactName} />
            <EditField name="emergencyContactPhone" label="Phone" value={employee.emergencyContactPhone} />
            <EditField name="emergencyContactRelation" label="Relation" value={employee.emergencyContactRelation} />
          </Card>
          <Card title="Integrations">
            <EditField name="timeDoctorEmail" label="Time Doctor Email" value={employee.timeDoctorEmail} />
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
        <Card title="Personal Information">
          <Field label="Preferred Name" value={employee.preferredName} />
          <Field label="Second Name (Middle)" value={(employee as any).secondName} />
          <Field label="Second Last Name" value={(employee as any).secondLastName} />
          <Field label="Date of Birth" value={employee.dateOfBirth ? fullDate(employee.dateOfBirth) : undefined} />
          <Field label="Mobile" value={employee.mobileNumber} />
          <Field label="Home Phone" value={employee.homePhone} />
        </Card>
        <Card title="Employment Details">
          <Field label="Type" value={employee.employmentType} />
          <Field label="Department" value={employee.department} />
          <Field label="Job Title" value={employee.jobTitle} />
          <Field label="Country" value={employee.country} />
          <Field label="Timezone" value={employee.timezone} />
          <Field label="Start Date" value={employee.startDate ? fullDate(employee.startDate) : undefined} />
          <Field label="End Date" value={employee.endDate ? fullDate(employee.endDate) : undefined} />
          {employee.linkedUserId && <Field label="Linked User" value={employee.linkedUserId.slice(0, 16) + "..."} />}
        </Card>
        <Card title="Contact Information">
          <Field label="Work Email" value={employee.workEmail} />
          <Field label="Personal Email" value={employee.personalEmail} />
          <Field label="Phone" value={employee.phoneNumber} />
          <Field label="Address" value={[employee.streetAddress, employee.city, employee.stateProvince, employee.postalCode, employee.country].filter(Boolean).join(", ") || undefined} />
        </Card>
        <Card title="Compensation & Banking">
          <CompSensitiveSection employee={employee} isSuperAdmin={isSuperAdmin} />
        </Card>
        <Card title="Emergency Contact">
          <Field label="Name" value={employee.emergencyContactName} />
          <Field label="Phone" value={employee.emergencyContactPhone} />
          <Field label="Relation" value={employee.emergencyContactRelation} />
        </Card>
        <Card title="Integrations">
          <Field label="Time Doctor Email" value={employee.timeDoctorEmail} />
          {employee.recruitCrmSlug && <Field label="RecruitCRM" value={employee.recruitCrmSlug} />}
        </Card>

      </div>
    </div>
  );
}

function EditField({ name, label, value, type }: { name: string; label: string; value?: string | null; type?: string }) {
  if (type === "date") {
    return (
      <div className="flex items-center justify-between py-1">
        <label className="text-sm text-muted-foreground">{label}</label>
        <div className="w-48">
          <DatePicker name={name} defaultValue={value ?? ""} />
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between py-1">
      <label className="text-sm text-muted-foreground">{label}</label>
      <input name={name} type={type ?? "text"} defaultValue={value ?? ""} className="h-8 w-48 rounded-md border border-input bg-background px-2 text-sm" />
    </div>
  );
}

//  Timesheets Tab 

type TSWithPeriod = TimesheetSubmission & { period: { name: string; startDate: Date; endDate: Date } };

/** Format decimal hours as "Xh Ym" (e.g. 13.333 → "13h 20m") to match TimeDoctor display */
function fmtHrs(h: number): string {
  if (!h || h === 0) return "—";
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  if (mins === 60) return `${hrs + 1}h`;
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

/** Format decimal hours as "H:MM" for edit inputs */
function fmtHrsEdit(h: number): string {
  if (!h || h === 0) return "";
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  if (mins === 60) return `${hrs + 1}:00`;
  return `${hrs}:${String(mins).padStart(2, "0")}`;
}

/** Parse "H:MM", "Hh30", or plain decimal into decimal hours */
function parseHoursEditInput(value: string): number {
  const v = value.trim();
  if (!v) return 0;
  const colonMatch = v.match(/^(\d{1,2})[h:H](\d{1,2})$/);
  if (colonMatch) {
    const h = parseInt(colonMatch[1], 10);
    const m = parseInt(colonMatch[2], 10);
    return h + m / 60;
  }
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 24) : 0;
}

function TimesheetsTab({ timesheets, hourlyRate, compensationType, monthlySalary, isSuperAdmin }: { timesheets: TSWithPeriod[]; hourlyRate: number | null; compensationType?: string; monthlySalary?: number | null; isSuperAdmin?: boolean }) {
  const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
  const DAY_KEYS = ["mondayHours", "tuesdayHours", "wednesdayHours", "thursdayHours", "fridayHours", "saturdayHours", "sundayHours"] as const;
  const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editEntries, setEditEntries] = useState<Array<{ date: string; hours: number; timeIn: string }>>([]);
  const [editBonuses, setEditBonuses] = useState<Array<{ description: string; amount: number }>>([]);
  const [editNote, setEditNote] = useState("");
  const [isPending, startTransition] = useTransition();
  const { showError, showSuccess } = useErrorDialog();

  const isMonthly = compensationType === "monthly";
  const totalHours = timesheets.reduce((s, ts) => s + Number(ts.totalHours), 0);
  const totalBonuses = timesheets.reduce((s, ts) => s + Number((ts as any).bonusTotal ?? 0), 0);
  const totalCost = isMonthly ? (monthlySalary ?? 0) : (hourlyRate ? totalHours * hourlyRate + totalBonuses : 0);
  const showCostPerRow = !isMonthly && hourlyRate;

  const statusColors: Record<string, string> = {
    submitted: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
    approved: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    auto_approved: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    rejected: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
    draft: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  };

  const canEdit = (status: string) => isSuperAdmin;
  const needsEditNote = (_status: string) => true; // Always require a reason when admin edits

  const fmtDateLabel = (dateStr: string) => {
    const d = new Date(dateStr + "T12:00:00Z");
    return `${DAY_NAMES[d.getUTCDay()]} ${d.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" })}`;
  };

  const startEditing = (ts: TSWithPeriod) => {
    setEditingId(ts.id);
    setEditNote("");

    // Build entries from dailyEntries if available, else generate dates for the full period
    const existing = (ts as any).dailyEntries as Array<{ date: string; hours: number; timeIn?: string }> | null;
    const existingMap = new Map((existing ?? []).map((e) => [e.date, e]));

    const start = new Date(ts.period.startDate);
    const end = new Date(ts.period.endDate);
    const entries: Array<{ date: string; hours: number; timeIn: string }> = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      const dateStr = cursor.toISOString().slice(0, 10);
      const ex = existingMap.get(dateStr);
      entries.push({
        date: dateStr,
        hours: ex?.hours ?? 0,
        timeIn: ex?.timeIn ?? "",
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    setEditEntries(entries);

    const bonuses = (ts as any).bonuses;
    setEditBonuses(Array.isArray(bonuses) ? bonuses.map((b: any) => ({ description: b.description ?? "", amount: Number(b.amount) || 0 })) : []);
  };

  const handleSave = (ts: TSWithPeriod) => {
    if (needsEditNote(ts.status) && !editNote.trim()) {
      showError({ title: "Note required", message: "Please provide a reason for editing this timesheet." });
      return;
    }
    startTransition(async () => {
      try {
        const { adminEditTimesheet } = await import("@/app/actions/hriq/timesheets");

        const result = await adminEditTimesheet(ts.id, {
          dailyEntries: editEntries.filter((e) => e.hours > 0).map((e) => ({
            date: e.date,
            hours: e.hours,
            timeIn: e.timeIn || undefined,
          })),
          bonuses: editBonuses.filter((b) => b.description.trim() && b.amount > 0),
          ...(editNote.trim() ? { notes: editNote.trim() } : {}),
        });

        if ("error" in result) {
          showError({ title: "Edit failed", message: (result as any).error });
        } else {
          showSuccess("Timesheet updated.");
          setEditingId(null);
        }
      } catch (err) {
        showError({ title: "Error", message: err instanceof Error ? err.message : "Failed to save" });
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border bg-card p-4 text-center">
          <div className="text-2xl font-bold tabular-nums">{timesheets.length}</div>
          <div className="text-[10px] font-medium text-muted-foreground uppercase">Submissions</div>
        </div>
        <div className="rounded-xl border bg-card p-4 text-center">
          <div className="text-2xl font-bold tabular-nums">{fmtHrs(totalHours)}</div>
          <div className="text-[10px] font-medium text-muted-foreground uppercase">Total Hours</div>
        </div>
        <div className="rounded-xl border bg-card p-4 text-center">
          <div className="text-2xl font-bold tabular-nums">{totalCost > 0 ? `$${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}</div>
          <div className="text-[10px] font-medium text-muted-foreground uppercase">{isMonthly ? "Monthly Salary" : "Total Cost"}</div>
          {!isMonthly && totalBonuses > 0 && <div className="text-[10px] text-muted-foreground">incl. ${totalBonuses.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} bonus</div>}
        </div>
      </div>

      {/* Table */}
      {timesheets.length > 0 ? (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b text-[11px] text-muted-foreground">
                  <th className="px-4 py-2.5 text-left font-medium">Period</th>
                  {DAY_LABELS.map((d) => <th key={d} className="px-2 py-2.5 text-center font-medium w-10">{d}</th>)}
                  <th className="px-3 py-2.5 text-right font-medium">Total</th>
                  {showCostPerRow && <th className="px-3 py-2.5 text-right font-medium">Cost</th>}
                  <th className="px-3 py-2.5 text-center font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {timesheets.map((ts) => {
                  const bonusAmt = Number((ts as any).bonusTotal ?? 0);
                  const cost = Number(ts.totalHours) * (hourlyRate ?? 0) + bonusAmt;
                  const isEditing = editingId === ts.id;

                  if (isEditing) {
                    const editTotal = editEntries.reduce((s, e) => s + e.hours, 0);
                    const editCost = editTotal * (hourlyRate ?? 0);
                    const bonusTotal = editBonuses.reduce((s, b) => s + (b.amount || 0), 0);
                    return (
                      <tr key={ts.id} className="border-b last:border-0 bg-muted/20">
                        <td colSpan={DAY_LABELS.length + (showCostPerRow ? 4 : 3)} className="px-4 py-3">
                          <div className="space-y-3">
                            {/* Header */}
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="text-sm font-medium">{ts.period.name}</div>
                                <div className="text-[10px] text-muted-foreground">{shortDate(ts.period.startDate)} – {shortDate(ts.period.endDate)}</div>
                              </div>
                              <div className="flex items-center gap-2">
                                <button onClick={() => setEditingId(null)} disabled={isPending} className="rounded-md border px-3 py-1 text-xs hover:bg-muted transition-colors">Cancel</button>
                                <button onClick={() => handleSave(ts)} disabled={isPending} className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
                                  {isPending ? "Saving..." : "Save"}
                                </button>
                              </div>
                            </div>

                            {/* Per-date entries */}
                            <div className="rounded-lg border overflow-hidden">
                              <div className="grid grid-cols-[100px_1fr_80px] text-[10px] font-medium text-muted-foreground uppercase bg-muted/50 px-3 py-1.5">
                                <span>Date</span>
                                <span>Time In</span>
                                <span className="text-right">Hours</span>
                              </div>
                              <div className="divide-y max-h-[320px] overflow-y-auto">
                                {editEntries.map((entry, idx) => {
                                  const d = new Date(entry.date + "T12:00:00Z");
                                  const isWeekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
                                  return (
                                    <div key={entry.date} className={`grid grid-cols-[100px_1fr_80px] items-center px-3 py-1.5 ${isWeekend ? "bg-muted/30" : ""}`}>
                                      <span className={`text-xs ${isWeekend ? "text-muted-foreground" : "font-medium"}`}>
                                        {fmtDateLabel(entry.date)}
                                      </span>
                                      <input
                                        type="text"
                                        placeholder="—"
                                        value={entry.timeIn}
                                        onChange={(e) => setEditEntries((prev) => { const n = [...prev]; n[idx] = { ...n[idx], timeIn: e.target.value }; return n; })}
                                        className="w-20 h-6 rounded border bg-background px-2 text-xs tabular-nums"
                                      />
                                      <input
                                        type="text"
                                        placeholder="—"
                                        defaultValue={entry.hours ? fmtHrsEdit(entry.hours) : ""}
                                        onBlur={(e) => {
                                          const v = parseHoursEditInput(e.target.value);
                                          const rounded = Math.round(v * 60) / 60;
                                          setEditEntries((prev) => { const n = [...prev]; n[idx] = { ...n[idx], hours: rounded }; return n; });
                                          e.target.value = rounded > 0 ? fmtHrsEdit(rounded) : "";
                                        }}
                                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
                                        className="w-full h-6 rounded border bg-background px-2 text-right text-xs tabular-nums focus:ring-1 focus:ring-primary"
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Totals */}
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <span>Total: <strong className="text-foreground">{fmtHrs(editTotal)}</strong></span>
                              {hourlyRate ? <span>Cost: <strong className="text-foreground">${(editCost + bonusTotal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>{bonusTotal > 0 && <span className="text-muted-foreground ml-1">(incl. ${bonusTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} bonus)</span>}</span> : null}
                            </div>

                            {/* Bonuses */}
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] font-medium text-muted-foreground uppercase">Bonuses / Commissions</span>
                                <button type="button" onClick={() => setEditBonuses((prev) => [...prev, { description: "", amount: 0 }])} className="text-[10px] text-primary hover:underline">+ Add bonus</button>
                              </div>
                              {editBonuses.length === 0 && <div className="text-[11px] text-muted-foreground/60">No bonuses</div>}
                              {editBonuses.map((b, bi) => (
                                <div key={bi} className="flex items-center gap-2 mt-1">
                                  <input type="text" placeholder="Description" value={b.description} onChange={(e) => setEditBonuses((prev) => { const n = [...prev]; n[bi] = { ...n[bi], description: e.target.value }; return n; })} className="flex-1 h-7 rounded-md border bg-background px-2 text-xs" />
                                  <div className="relative">
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                                    <input type="number" step="0.01" min="0" value={b.amount || ""} onChange={(e) => setEditBonuses((prev) => { const n = [...prev]; n[bi] = { ...n[bi], amount: Number(e.target.value) || 0 }; return n; })} className="w-24 h-7 rounded-md border bg-background pl-5 pr-2 text-xs tabular-nums" />
                                  </div>
                                  <button type="button" onClick={() => setEditBonuses((prev) => prev.filter((_, i) => i !== bi))} className="text-muted-foreground hover:text-red-500 text-xs px-1">✕</button>
                                </div>
                              ))}
                            </div>

                            {/* Edit note — mandatory for all admin edits */}
                            {needsEditNote(ts.status) && (
                              <div className="mt-3">
                                <label className="text-[10px] font-medium text-muted-foreground uppercase">Reason for edit <span className="text-red-500">*</span></label>
                                <textarea
                                  value={editNote}
                                  onChange={(e) => setEditNote(e.target.value)}
                                  placeholder="Explain why this timesheet is being modified..."
                                  rows={2}
                                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-xs"
                                />
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={ts.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div>
                            <div className="text-sm font-medium">{ts.period.name}</div>
                            <div className="text-[10px] text-muted-foreground">{shortDate(ts.period.startDate)} – {shortDate(ts.period.endDate)}</div>
                          </div>
                          {canEdit(ts.status) && (
                            <button onClick={() => startEditing(ts)} className="ml-1 rounded-md border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Edit hours & bonuses">Edit</button>
                          )}
                        </div>
                      </td>
                      {DAY_KEYS.map((k, i) => {
                        const h = Number(ts[k]);
                        return (
                          <td key={DAY_LABELS[i]} className={`px-2 py-2.5 text-center text-xs tabular-nums ${h > 8 ? "text-amber-600 font-medium" : h > 0 ? "" : "text-muted-foreground/40"}`}>
                            {h > 0 ? fmtHrs(h) : "·"}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2.5 text-right text-sm font-semibold tabular-nums">{fmtHrs(Number(ts.totalHours))}</td>
                      {showCostPerRow && <td className="px-3 py-2.5 text-right text-sm tabular-nums">
                        <div>${cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        {bonusAmt > 0 && <div className="text-[10px] text-muted-foreground">incl. ${bonusAmt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} bonus</div>}
                      </td>}
                      <td className="px-3 py-2.5 text-center">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${statusColors[ts.status] ?? "bg-muted"}`}>
                          {ts.status === "submitted" ? "pending" : ts.status.replace(/_/g, " ")}
                        </span>
                        {ts.approvedByName && <div className="text-[9px] text-muted-foreground mt-0.5">by {ts.approvedByName}</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border bg-card py-12 text-center text-sm text-muted-foreground">
          No timesheets submitted yet.
        </div>
      )}
    </div>
  );
}

//  Tasks Tab 

function TasksTab({ tasks, employeeId }: { tasks: Task[]; employeeId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showAdd, setShowAdd] = useState(false);
  const { showError, showSuccess } = useErrorDialog();

  const handleComplete = (taskId: string) => {
    startTransition(async () => {
      try {
        await completeTask(taskId);
        showSuccess("Task completed.");
      } catch (err) {
        showError({ title: "Task error", message: err instanceof Error ? err.message : "Could not complete the task." });
      }
    });
  };

  const handleAdd = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        const { createTask } = await import("@/app/actions/hriq/tasks");
        await createTask({
          employeeId,
          title: fd.get("title") as string,
          description: (fd.get("desc") as string) || undefined,
          taskType: (fd.get("taskType") as string) || "custom",
          dueDate: (fd.get("dueDate") as string) || undefined,
        });
        setShowAdd(false);
      } catch (err) {
        showError({ title: "Failed to create task", message: err instanceof Error ? err.message : "Could not create the task." });
      }
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
              <div><label className="text-xs font-medium">Due Date</label><DatePicker name="dueDate" className="mt-1" /></div>
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
            {task.dueDate && <p className="mt-1 text-xs text-muted-foreground">Due: {shortDate(task.dueDate)}</p>}
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${task.status === "completed" ? "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300" : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300"}`}>
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

//  Documents Tab 

function DocumentsTab({ documents, employeeId, isOnboarding, bankInfo }: { documents: Document[]; employeeId: string; isOnboarding?: boolean; bankInfo?: { bankName: string | null; bankAccountName: string | null; bankAccountNumber: string | null; bankRoutingNumber: string | null; bankAddress: string | null } }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showAdd, setShowAdd] = useState(false);
  const [pendingDeleteDocumentId, setPendingDeleteDocumentId] = useState<string | null>(null);
  const [viewingBankDetails, setViewingBankDetails] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fetchingDocIds, setFetchingDocIds] = useState<Set<string>>(new Set());
  const [refreshingDocId, setRefreshingDocId] = useState<string | null>(null);
  const { showError, showSuccess } = useErrorDialog();

  // Auto-fetch any JotForm docs that don't yet have a stored PDF
  useEffect(() => {
    const jotformDocs = documents.filter(
      (d) => !d.fileUrl && d.description && /submission \d+/i.test(d.description)
    );
    if (jotformDocs.length === 0) return;

    const fetchDoc = async (docId: string) => {
      setFetchingDocIds((prev) => new Set(prev).add(docId));
      try {
        const result = await refetchJotformPdf(docId);
        if (!result.success) {
          console.warn(`[Documents] Auto-fetch failed for doc ${docId}:`, result.error);
        }
      } catch (err) {
        console.warn(`[Documents] Auto-fetch error for doc ${docId}:`, err);
      }
      setFetchingDocIds((prev) => {
        const next = new Set(prev);
        next.delete(docId);
        return next;
      });
    };

    for (const doc of jotformDocs) {
      fetchDoc(doc.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAdd = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        let fileUrl: string | undefined;
        let fileName: string | undefined;
        let fileSize: number | undefined;
        let mimeType: string | undefined;
        let filePath: string | undefined;

        if (selectedFile) {
          const uploadFd = new FormData();
          uploadFd.append("file", selectedFile);
          uploadFd.append("employeeId", employeeId);
          uploadFd.append("docType", fd.get("docType") as string);
          const result = await uploadEmployeeDocument(uploadFd);
          fileUrl = result.url;
          fileName = result.fileName;
          fileSize = selectedFile.size;
          mimeType = selectedFile.type;
          filePath = result.storagePath;
        }

        await createDocument({
          employeeId,
          documentType: fd.get("docType") as string,
          documentName: fd.get("docName") as string,
          description: (fd.get("desc") as string) || undefined,
          fileUrl,
          fileName,
          fileSize,
          mimeType,
          filePath,
        });
        setShowAdd(false);
        setSelectedFile(null);
      } catch (err) {
        showError({ title: "Failed to add document", message: err instanceof Error ? err.message : "Could not add the document." });
      }
    });
  };


  const handleDelete = (documentId: string) => {
    startTransition(async () => {
      try {
        await deleteDocument(documentId);
      } catch (err) {
        showError({ title: "Failed to delete document", message: err instanceof Error ? err.message : "Could not delete the document." });
      }
    });
  };

  const [optimisticStatuses, setOptimisticStatuses] = useState<Record<string, string>>({});

  const handleStatusChange = (documentId: string, status: string) => {
    // Optimistically update the UI immediately
    setOptimisticStatuses((prev) => ({ ...prev, [documentId]: status }));
    startTransition(async () => {
      try {
        await updateDocument(documentId, { status });
        if (status === "verified") showSuccess("Document approved.");
        // Delayed refresh to prevent scroll jump
      } catch (err) {
        // Revert optimistic update on error
        setOptimisticStatuses((prev) => { const next = { ...prev }; delete next[documentId]; return next; });
        showError({ title: "Failed to update document", message: err instanceof Error ? err.message : "Could not update the document." });
      }
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
              <CustomSelect
                name="docType"
                placeholder="Select..."
                triggerClassName="mt-1 h-9 w-full"
                options={[
                  { value: "id_document", label: "Government ID" },
                  { value: "contract", label: "Contract" },
                  { value: "tax_form", label: "Tax Form (W-8/W-9)" },
                  { value: "bank_details", label: "Bank Details" },
                  { value: "resume", label: "Resume" },
                  { value: "nda", label: "NDA" },
                  { value: "other", label: "Other" },
                ]}
              />
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
          <div>
            <label className="text-sm font-medium">Attach File <span className="text-muted-foreground font-normal">(optional)</span></label>
            <input
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp,.txt,.rtf,.csv,.zip"
              onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-sm text-muted-foreground file:mr-3 file:h-8 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:text-xs file:font-medium file:text-foreground hover:file:bg-muted cursor-pointer"
            />
            {selectedFile && (
              <p className="mt-1 text-xs text-muted-foreground">{selectedFile.name} ({(selectedFile.size / 1024).toFixed(0)} KB)</p>
            )}
          </div>
          <button type="submit" disabled={isPending} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {isPending ? "Adding..." : "Add Document"}
          </button>
        </form>
      )}
      {/* Folder-grouped documents */}
      {(() => {
        const FOLDER_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
          contracts: { label: "Contracts & Agreements", icon: "file-text", color: "border-blue-200 dark:border-blue-900/50" },
          pay: { label: "Pay & Invoices", icon: "dollar", color: "border-green-200 dark:border-green-900/50" },
          identity: { label: "Identity Documents", icon: "id-card", color: "border-purple-200 dark:border-purple-900/50" },
          tax: { label: "Tax Forms", icon: "clipboard", color: "border-amber-200 dark:border-amber-900/50" },
          banking: { label: "Banking Details", icon: "building", color: "border-cyan-200 dark:border-cyan-900/50" },
          other: { label: "Other Documents", icon: "paperclip", color: "border-gray-200 dark:border-gray-800" },
        };
        const FOLDER_ICONS: Record<string, React.ReactNode> = {
          "file-text": <svg className="h-4 w-4 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>,
          "dollar": <svg className="h-4 w-4 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>,
          "id-card": <svg className="h-4 w-4 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Zm6-10.125a1.875 1.875 0 1 1-3.75 0 1.875 1.875 0 0 1 3.75 0Zm1.294 6.336a6.721 6.721 0 0 1-3.17.789 6.721 6.721 0 0 1-3.168-.789 3.376 3.376 0 0 1 6.338 0Z" /></svg>,
          "clipboard": <svg className="h-4 w-4 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z" /></svg>,
          "building": <svg className="h-4 w-4 text-cyan-600 dark:text-cyan-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3H21" /></svg>,
          "paperclip": <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" /></svg>,
        };
        const FOLDER_ORDER = ["contracts", "pay", "identity", "tax", "banking", "other"];

        // Group documents by folder
        const grouped: Record<string, typeof documents> = {};
        for (const doc of documents) {
          const folder = (doc as any).folder ?? "other";
          if (!grouped[folder]) grouped[folder] = [];
          grouped[folder].push(doc);
        }

        const nonEmptyFolders = FOLDER_ORDER.filter((f) => grouped[f]?.length);

        if (nonEmptyFolders.length === 0 && !showAdd) {
          return <div className="py-8 text-center text-muted-foreground">No documents yet. Click &quot;+ Add Document&quot; to get started.</div>;
        }

        return nonEmptyFolders.map((folderKey) => {
          const cfg = FOLDER_CONFIG[folderKey] ?? FOLDER_CONFIG.other;
          const folderDocs = grouped[folderKey] ?? [];
          return (
            <details key={folderKey} open className="group rounded-lg border bg-card overflow-hidden">
              <summary className={`flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors border-b ${cfg.color} group-open:border-b group-[&:not([open])]:border-b-0`}>
                <div className="flex items-center gap-2">
                  {FOLDER_ICONS[cfg.icon]}
                  <span className="text-sm font-semibold">{cfg.label}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums">{folderDocs.length}</span>
                </div>
                <svg className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
              </summary>
              <div className="divide-y">
                {folderDocs.map((doc) => {
                  const effectiveStatus = optimisticStatuses[doc.id] ?? doc.status;
                  return (
                    <div key={doc.id} className="flex items-center justify-between px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">{doc.documentName}</span>
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] capitalize flex-shrink-0">{doc.documentType.replace(/_/g, " ")}</span>
                        </div>
                        {doc.description && doc.documentType === "time_doctor_report" ? (
                          <details className="mt-1 group/td">
                            <summary className="text-xs text-primary cursor-pointer hover:underline">View Time Doctor Report</summary>
                            <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-muted/50 p-3 text-xs text-muted-foreground whitespace-pre-wrap font-mono">{doc.description}</pre>
                          </details>
                        ) : doc.description ? (
                          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{doc.description}</p>
                        ) : null}
                        <p className="mt-0.5 text-[11px] text-muted-foreground/60">
                          Added {shortDate(doc.createdAt)}
                          {doc.uploadedByName && ` by ${doc.uploadedByName}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] capitalize ${
                          effectiveStatus === "verified" ? "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300" :
                          effectiveStatus === "rejected" ? "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300" :
                          "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300"
                        }`}>
                          {effectiveStatus}
                        </span>
                        {(doc.fileUrl || doc.filePath || (doc.description && /submission \d+/i.test(doc.description))) && (
                          <button
                            type="button"
                            onClick={() => window.open(`/api/documents/view?id=${doc.id}`, "_blank", "noopener,noreferrer")}
                            className="rounded-md border px-2 py-0.5 text-[11px] hover:bg-accent"
                          >
                            View
                          </button>
                        )}
                        {!doc.fileUrl && !doc.filePath && doc.description && /submission \d+/i.test(doc.description) && (
                          <button
                            type="button"
                            disabled={fetchingDocIds.has(doc.id)}
                            onClick={() => {
                              const docId = doc.id;
                              setFetchingDocIds((prev) => new Set(prev).add(docId));
                              refetchJotformPdf(docId)
                                .then((res) => {
                                  if (res.success) showSuccess("PDF Retrieved");
                                  else showError({ title: "Fetch Failed", message: res.error ?? "Could not retrieve from JotForm." });
                                })
                                .catch(() => showError({ title: "Fetch Failed", message: "Network error." }))
                                .finally(() => setFetchingDocIds((prev) => { const next = new Set(prev); next.delete(docId); return next; }));
                            }}
                            className="rounded-md border border-amber-200 px-2 py-0.5 text-[11px] text-amber-700 hover:bg-amber-50 disabled:opacity-50 dark:border-amber-800 dark:text-amber-400"
                          >
                            {fetchingDocIds.has(doc.id) ? "..." : "Retry PDF"}
                          </button>
                        )}
                        {!doc.fileUrl && doc.documentType === "bank_details" && bankInfo && (
                          <button type="button" onClick={() => setViewingBankDetails(true)} className="rounded-md border px-2 py-0.5 text-[11px] hover:bg-accent">View Details</button>
                        )}
                        {effectiveStatus === "pending" && !isOnboarding && (
                          <>
                            <button type="button" onClick={() => handleStatusChange(doc.id, "verified")} disabled={isPending} className="rounded-md bg-green-600 px-2 py-0.5 text-[11px] text-white hover:bg-green-700 disabled:opacity-50">Approve</button>
                            <button type="button" onClick={() => handleStatusChange(doc.id, "rejected")} disabled={isPending} className="rounded-md border border-red-200 px-2 py-0.5 text-[11px] text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400">Reject</button>
                          </>
                        )}
                        <button type="button" onClick={() => setPendingDeleteDocumentId(doc.id)} disabled={isPending} className="rounded-md border border-red-200 px-2 py-0.5 text-[11px] text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400">Delete</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </details>
          );
        });
      })()}

      {/* Bank Details View Modal */}
      {viewingBankDetails && bankInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Bank & Personal Details</h3>
              <button onClick={() => setViewingBankDetails(false)} className="rounded p-1 hover:bg-accent" aria-label="Close">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="space-y-3">
              <BankField label="Bank Name" value={bankInfo.bankName} />
              <BankField label="Account Holder" value={bankInfo.bankAccountName} />
              <BankField label="Account Number" value={bankInfo.bankAccountNumber} />
              <BankField label="Routing Number" value={bankInfo.bankRoutingNumber} />
              <BankField label="Bank/Branch Address" value={bankInfo.bankAddress} />
            </div>
            {(!bankInfo.bankName && !bankInfo.bankAccountNumber) && (
              <p className="mt-4 text-sm text-muted-foreground">Contractor has not submitted bank details yet.</p>
            )}
            <div className="mt-5 flex justify-end">
              <button onClick={() => setViewingBankDetails(false)} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">Close</button>
            </div>
          </div>
        </div>
      )}

      {pendingDeleteDocumentId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in duration-150">
          <div className="w-full max-w-sm rounded-xl border bg-card p-5 shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-200" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold">Delete Document</h3>
            <p className="mt-2 text-sm text-muted-foreground">Delete this document? This cannot be undone.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setPendingDeleteDocumentId(null)} disabled={isPending} className="h-9 rounded-md border px-4 text-sm hover:bg-accent disabled:opacity-50">Cancel</button>
              <button
                type="button"
                onClick={() => {
                  const id = pendingDeleteDocumentId;
                  setPendingDeleteDocumentId(null);
                  if (id) handleDelete(id);
                }}
                disabled={isPending}
                className="h-9 rounded-md bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {isPending ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BankField({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value || "—"}</span>
    </div>
  );
}

//  Payments Tab 

function PaymentsTab({ payments, employee }: { payments: Payment[]; employee: Employee }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showAdd, setShowAdd] = useState(false);
  const { showError } = useErrorDialog();

  const handleAdd = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
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
      } catch (err) {
        showError({ title: "Failed to record payment", message: err instanceof Error ? err.message : "Could not record the payment." });
      }
    });
  };

  const totalPaid = payments.filter((p) => p.status === "completed").reduce((s, p) => s + Number(p.amount), 0);
  const totalPending = payments.filter((p) => p.status === "pending").reduce((s, p) => s + Number(p.amount), 0);
  const totalWiseFees = payments.filter((p) => p.status === "completed").reduce((s, p) => s + Number((p as any).wiseFee ?? 0), 0);
  const totalActualCost = totalPaid + totalWiseFees;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex gap-4 text-sm">
          <span>Paid: <strong className="text-green-600">${totalPaid.toLocaleString()}</strong></span>
          {totalWiseFees > 0 && <span>Transfer Fees: <strong className="text-orange-500">${totalWiseFees.toLocaleString()}</strong></span>}
          {totalWiseFees > 0 && <span>Actual Cost: <strong className="text-foreground">${totalActualCost.toLocaleString()}</strong></span>}
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
              <CustomSelect
                name="currency"
                defaultValue={employee.currency || "USD"}
                triggerClassName="mt-1 h-9 w-full"
                options={[...CURRENCY_OPTIONS]}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Type *</label>
              <CustomSelect
                name="payType"
                placeholder="Select..."
                triggerClassName="mt-1 h-9 w-full"
                options={[
                  { value: "salary", label: "Salary" },
                  { value: "bonus", label: "Bonus" },
                  { value: "reimbursement", label: "Reimbursement" },
                  { value: "commission", label: "Commission" },
                ]}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-medium">Method</label>
              <CustomSelect
                name="method"
                placeholder="Select..."
                triggerClassName="mt-1 h-9 w-full"
                options={[
                  { value: "bank_transfer", label: "Bank Transfer" },
                  { value: "wise", label: "Wise" },
                  { value: "paypal", label: "PayPal" },
                ]}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Period Start</label>
              <DatePicker name="pStart" className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Period End</label>
              <DatePicker name="pEnd" className="mt-1" />
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
      {payments.map((payment) => {
        const p = payment as any;
        const wiseFee = Number(p.wiseFee ?? 0);
        const wiseSource = Number(p.wiseSourceAmount ?? 0);
        const wiseTarget = Number(p.wiseTargetAmount ?? 0);
        const hasWiseDetails = wiseFee > 0 || wiseSource > 0;
        return (
        <div key={payment.id} className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium capitalize">{payment.paymentType}</span>
              <span className="text-lg font-semibold">${Number(payment.amount).toLocaleString()} {payment.currency}</span>
            </div>
            {hasWiseDetails && (
              <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                {wiseFee > 0 && <span>Fee: <strong className="text-orange-500">${wiseFee.toFixed(2)}</strong></span>}
                {wiseSource > 0 && <span>Debited: <strong className="text-foreground">${wiseSource.toFixed(2)}</strong></span>}
                {wiseTarget > 0 && p.wiseTargetCurrency && p.wiseTargetCurrency !== payment.currency && (
                  <span>Received: <strong className="text-foreground">{wiseTarget.toFixed(2)} {p.wiseTargetCurrency}</strong></span>
                )}
                {p.wiseExchangeRate && Number(p.wiseExchangeRate) > 0 && (
                  <span>Rate: {Number(p.wiseExchangeRate).toFixed(4)}</span>
                )}
              </div>
            )}
            {payment.periodStart && payment.periodEnd && (
              <p className="mt-1 text-xs text-muted-foreground">Period: {shortDate(payment.periodStart)} – {shortDate(payment.periodEnd)}</p>
            )}
            {payment.paymentMethod && <p className="mt-1 text-xs text-muted-foreground capitalize">Via {payment.paymentMethod.replace(/_/g, " ")}</p>}
            {p.payoutProvider && <p className="text-xs text-muted-foreground capitalize">Provider: {p.payoutProvider.replace(/_/g, " ")}</p>}
            <p className="mt-1 text-xs text-muted-foreground">{shortDate(payment.createdAt)}</p>
          </div>
          <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${
            payment.status === "completed" ? "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300" :
            payment.status === "failed" ? "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300" :
            "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300"
          }`}>
            {payment.status}
          </span>
        </div>
        );
      })}
      {payments.length === 0 && !showAdd && (
        <div className="py-8 text-center text-muted-foreground">No payments yet. Click &quot;+ Record Payment&quot; to get started.</div>
      )}
    </div>
  );
}

//  Notes Tab 

function NotesTab({ notes, employeeId }: { notes: ManagerNote[]; employeeId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showAdd, setShowAdd] = useState(false);
  const { showError } = useErrorDialog();

  const NOTE_TYPE_COLORS: Record<string, string> = {
    general: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
    performance: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300",
    feedback: "bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300",
    warning: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    commendation: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
  };

  const handleAdd = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await createManagerNote({
          employeeId,
          noteType: fd.get("noteType") as string,
          content: fd.get("content") as string,
          isPrivate: fd.get("isPrivate") === "on",
        });
        setShowAdd(false);
      } catch (err) {
        showError({ title: "Failed to add note", message: err instanceof Error ? err.message : "Could not save the note." });
      }
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
              <CustomSelect
                name="noteType"
                defaultValue="general"
                triggerClassName="mt-1 h-9 w-full"
                options={[
                  { value: "general", label: "General" },
                  { value: "performance", label: "Performance" },
                  { value: "feedback", label: "Feedback" },
                  { value: "warning", label: "Warning" },
                  { value: "commendation", label: "Commendation" },
                ]}
              />
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
              {note.authorName ?? "Unknown"} &middot; {shortDate(note.createdAt)}
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

//  Shared Components 

function CompSensitiveSection({ employee, isSuperAdmin }: { employee: EmployeeWithRelations; isSuperAdmin?: boolean }) {
  const [revealed, setRevealed] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ valid: boolean; issues: string[] } | null>(null);

  const emp = employee as any;
  const compType: string = emp.compensationType ?? "hourly";
  const monthlySalary = emp.monthlySalary;
  const preferredPaymentMethod: string | null = emp.preferredPaymentMethod;
  const paymentMethodVerified: boolean = emp.paymentMethodVerified ?? false;

  const hasData = employee.hourlyRate || monthlySalary || employee.bankAccountNumber || employee.bankName || employee.paymentPlatform || (employee.wiseRecipientId && employee.wiseRecipientId !== -1) || emp.cadanaPersonId || preferredPaymentMethod;
  if (!hasData) return <p className="text-sm text-muted-foreground">No compensation data yet.</p>;

  const handleVerify = async () => {
    setVerifying(true);
    try {
      const { verifyPaymentMethodCompliance } = await import("@/app/actions/hriq/payment-validation");
      const result = await verifyPaymentMethodCompliance(employee.id);
      setVerifyResult(result);
    } catch (err) {
      setVerifyResult({ valid: false, issues: [err instanceof Error ? err.message : "Verification failed"] });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <>
      <Field label="Compensation Type" value={compType === "monthly" ? "Monthly Salary" : "Hourly Rate"} />
      {compType === "monthly" ? (
        <Field label="Monthly Salary" value={revealed ? (monthlySalary ? `${monthlySalary} ${employee.currency}` : undefined) : (monthlySalary ? `****  ${employee.currency}` : undefined)} />
      ) : (
        <Field label="Hourly Rate" value={revealed ? (employee.hourlyRate ? `${employee.hourlyRate} ${employee.currency}` : undefined) : (employee.hourlyRate ? `****  ${employee.currency}` : undefined)} />
      )}
      {/* Payment Method with orange $ verified indicator */}
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Payment Method</span>
        <span className="flex items-center gap-1.5 font-medium">
          {preferredPaymentMethod ? (
            <>
              <span className="capitalize">{preferredPaymentMethod}</span>
              {paymentMethodVerified && (
                <span className="text-orange-500" title="Payment method verified">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.31-8.86c-1.77-.45-2.34-.94-2.34-1.67 0-.84.79-1.43 2.1-1.43 1.38 0 1.9.66 1.94 1.64h1.71c-.05-1.34-.87-2.57-2.49-2.97V5H11.1v1.69c-1.51.32-2.72 1.3-2.72 2.81 0 1.79 1.49 2.69 3.66 3.21 1.95.46 2.34 1.15 2.34 1.87 0 .53-.39 1.39-2.1 1.39-1.6 0-2.23-.72-2.32-1.64H8.25c.1 1.71 1.38 2.66 2.85 2.97V19h2.34v-1.67c1.52-.29 2.72-1.16 2.73-2.77-.01-2.2-1.9-2.96-3.86-3.42z" /></svg>
                </span>
              )}
            </>
          ) : "—"}
        </span>
      </div>
      {isSuperAdmin && preferredPaymentMethod && (
        <div className="mt-1">
          {paymentMethodVerified && (
            <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 border border-orange-200 px-2 py-0.5 text-[10px] font-medium text-orange-600 dark:bg-orange-950/30 dark:border-orange-700 dark:text-orange-400">
              ✓ Verified on {preferredPaymentMethod === "cadana" ? "Cadana" : "Wise"}
            </span>
          )}
        </div>
      )}
      <Field label="Payment Platform" value={employee.paymentPlatform} />
      <Field label="Payment Account" value={revealed ? employee.paymentAccountInfo : (employee.paymentAccountInfo ? "****" + (employee.paymentAccountInfo.length > 4 ? employee.paymentAccountInfo.slice(-4) : "") : undefined)} />
      <Field label="Bank Name" value={revealed ? employee.bankName : (employee.bankName ? employee.bankName.charAt(0) + "****" : undefined)} />
      <Field label="Account Name" value={revealed ? employee.bankAccountName : (employee.bankAccountName ? "****" : undefined)} />
      <Field label="Bank Account" value={employee.bankAccountNumber ? (revealed ? employee.bankAccountNumber : "****" + employee.bankAccountNumber.slice(-4)) : undefined} />
      <Field label="Routing Number" value={revealed ? employee.bankRoutingNumber : (employee.bankRoutingNumber ? "****" + employee.bankRoutingNumber.slice(-4) : undefined)} />
      <Field label="SWIFT / BIC" value={revealed ? employee.bankSwiftCode : (employee.bankSwiftCode ? employee.bankSwiftCode.slice(0, 2) + "****" : undefined)} />
      <Field label="Bank Address" value={revealed ? employee.bankAddress : (employee.bankAddress ? "****" : undefined)} />
      <Field label="Debit Card" value={(employee as any).debitCardNumber ? (revealed ? (employee as any).debitCardNumber : "****" + (employee as any).debitCardNumber.slice(-4)) : undefined} />
      {(() => {
        const extra = (employee as any).bankExtraData as Record<string, string> | null | undefined;
        if (!extra || Object.keys(extra).length === 0) return null;
        const labels: Record<string, string> = { accountType: "Account Type", rut: "RUT (Tax ID)", idType: "ID Type", idNumber: "ID Number", phone: "Mobile (Banking)" };
        return Object.entries(extra).map(([k, v]) => (
          <Field key={k} label={labels[k] ?? k} value={revealed ? v : "****"} />
        ));
      })()}
      {(employee.wiseRecipientId && employee.wiseRecipientId !== -1) ? (
        <>
          <div className="mt-2 border-t pt-2" />
          <Field label="Wise Recipient ID" value={String(employee.wiseRecipientId)} />
          <Field label="Wise Currency" value={employee.wiseRecipientCurrency} />
          <Field label="Wise Type" value={employee.wiseRecipientType} />
          {employee.wiseRecipientSyncedAt && <Field label="Wise Synced" value={shortDate(employee.wiseRecipientSyncedAt)} />}
        </>
      ) : (
        <>
          <div className="mt-2 border-t pt-2" />
          <Field label="Wise Status" value={employee.wiseGateRequired ? "⏳ Gate active — awaiting setup" : "Not configured"} />
        </>
      )}
      {/* Cadana section */}
      {emp.cadanaPersonId ? (
        <>
          <div className="mt-2 border-t pt-2" />
          <Field label="Cadana Person ID" value={emp.cadanaPersonId} />
          <Field label="Cadana Status" value={emp.cadanaPersonStatus ? String(emp.cadanaPersonStatus).replace(/_/g, " ") : undefined} />
          {emp.cadanaSyncedAt && <Field label="Cadana Synced" value={shortDate(emp.cadanaSyncedAt)} />}
        </>
      ) : emp.cadanaGateRequired ? (
        <>
          <div className="mt-2 border-t pt-2" />
          <Field label="Cadana Status" value="⏳ Gate active — awaiting setup" />
        </>
      ) : null}
      {isSuperAdmin && (
        <button
          type="button"
          onClick={() => setRevealed(!revealed)}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
        >
          {revealed ? (
            <><svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg> Hide Details</>
          ) : (
            <><svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg> Reveal Full Details</>
          )}
        </button>
      )}
      {/* Verify button — visible when payment method is set (no need to reveal details first) */}
      {isSuperAdmin && preferredPaymentMethod && (
        <div className="mt-2">
          <button
            type="button"
            onClick={handleVerify}
            disabled={verifying}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
              paymentMethodVerified
                ? "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-700 dark:bg-orange-950/30 dark:text-orange-400"
                : "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-950/30 dark:text-blue-400 dark:hover:bg-blue-950/50"
            }`}
          >
            {verifying ? "Checking..." : paymentMethodVerified ? "✓ Verified — Re-check" : "Verify Bank Details"}
          </button>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Validates bank details locally, then checks the live {preferredPaymentMethod === "cadana" ? "Cadana" : "Wise"} API to confirm the contractor is payable.
          </p>
          {verifyResult && !verifyResult.valid && (
            <div className="mt-1.5 rounded-md border border-red-200 bg-red-50 p-2 dark:border-red-900 dark:bg-red-950/30">
              <p className="text-xs font-medium text-red-700 dark:text-red-400">Issues found:</p>
              {verifyResult.issues.map((issue: string, i: number) => (
                <p key={i} className="text-xs text-red-600 dark:text-red-400">• {issue}</p>
              ))}
            </div>
          )}
          {verifyResult?.valid && (
            <div className="mt-1.5 rounded-md border border-green-200 bg-green-50 p-2 dark:border-green-900 dark:bg-green-950/30">
              <p className="text-xs font-medium text-green-700 dark:text-green-400">✓ Verified via {preferredPaymentMethod === "cadana" ? "Cadana" : "Wise"} API</p>
              {(verifyResult as any).apiDetail && (
                <p className="text-[11px] text-green-600 dark:text-green-500 mt-0.5">{(verifyResult as any).apiDetail}</p>
              )}
            </div>
          )}
          {verifyResult && (verifyResult as any).apiStatus === "error" && (
            <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">⚠ API check encountered an error — result based on local fields only</p>
          )}
        </div>
      )}
      {!isSuperAdmin && !revealed && (
        <p className="mt-2 text-[11px] text-muted-foreground">Contact a super admin to view full compensation details.</p>
      )}
    </>
  );
}

// ─── Country-Specific Bank Lists (Cadana & Wise) ───────────────────────────
const ADMIN_COUNTRY_BANKS: Record<string, string[]> = {
  Philippines: ["BDO Unibank", "BPI (Bank of the Philippine Islands)", "Metrobank", "UnionBank", "Security Bank", "Landbank of the Philippines", "PNB (Philippine National Bank)", "Other"],
  Chile: ["Banco de Chile", "Banco Santander Chile", "BCI (Banco de Crédito e Inversiones)", "Banco Estado", "Itaú Chile", "BBVA Chile", "Scotiabank Chile", "Banco Falabella", "Banco Ripley", "Tanner", "Other"],
  Colombia: ["Bancolombia", "Banco Davivienda", "Banco de Bogotá", "BBVA Colombia", "Banco Popular", "Scotiabank Colpatria", "Nequi", "Daviplata", "Other"],
  Mexico: ["BBVA México", "Banamex (Citibanamex)", "Banco Santander México", "Banorte", "Inbursa", "Other"],
  Argentina: ["Banco Nación", "Banco Provincia", "Santander Argentina", "BBVA Argentina", "Galicia", "HSBC Argentina", "Macro", "Other"],
  "United States": ["Chase Bank", "Bank of America", "Wells Fargo", "Citibank", "US Bank", "Capital One", "TD Bank", "PNC Bank", "Other"],
  Canada: ["RBC (Royal Bank of Canada)", "TD Canada Trust", "BMO (Bank of Montreal)", "Scotiabank", "CIBC", "Other"],
  "United Kingdom": ["Barclays", "HSBC UK", "Lloyds Bank", "NatWest", "Monzo", "Revolut", "Other"],
  India: ["State Bank of India", "HDFC Bank", "ICICI Bank", "Axis Bank", "Kotak Mahindra Bank", "Other"],
  Brazil: ["Banco do Brasil", "Itaú Unibanco", "Bradesco", "Nubank", "Santander Brasil", "Other"],
  Australia: ["Commonwealth Bank", "Westpac", "ANZ", "NAB (National Australia Bank)", "Other"],
  Nigeria: ["GTBank", "Access Bank", "Zenith Bank", "First Bank Nigeria", "UBA", "Opay", "Other"],
  Peru: ["BCP (Banco de Crédito del Perú)", "BBVA Perú", "Interbank", "Scotiabank Perú", "Other"],
  Pakistan: ["Habib Bank Limited", "United Bank Limited", "MCB Bank", "Allied Bank", "Meezan Bank", "Other"],
  Kenya: ["KCB Bank", "Equity Bank", "Co-operative Bank", "Stanbic Kenya", "Other"],
  Ukraine: ["PrivatBank", "Monobank", "Oschadbank", "Raiffeisen Bank", "Other"],
  Venezuela: ["Banco de Venezuela", "Banesco", "Mercantil", "BBVA Provincial", "Other"],
};

function DynamicBankingEdit({ payMethod, country, employee }: { payMethod: "cadana" | "wise" | "" | null; country: string; employee: EmployeeWithRelations }) {
  const [bankNameSelect, setBankNameSelect] = useState(employee.bankName ?? "");
  const [bankOther, setBankOther] = useState("");

  const isChile = country === "Chile";
  const isColombia = country === "Colombia";
  const isUS = country === "United States";
  const isUK = country === "United Kingdom";
  const isAustralia = country === "Australia";
  const isIndia = country === "India";
  const isMexico = country === "Mexico";
  const isPhilippines = country === "Philippines";

  const usesIBAN = ["United Kingdom", "Ukraine"].includes(country);
  const showRouting = isUS || isUK || isAustralia || isIndia;
  const showAccountType = isChile || isColombia || isUS;
  const showRut = isChile;
  const showNationalId = isColombia;
  const showPhone = isChile || isColombia;
  const showSwift = !isChile && !isColombia && !isPhilippines && !isMexico && !isUS;

  const accountLabel = isMexico ? "CLABE (18 digits)" : usesIBAN ? "IBAN" : "Account Number";
  const routingLabel = isIndia ? "IFSC Code" : (isUK || isAustralia) ? "Sort Code / BSB" : "Routing Number (ABA)";

  const availableBanks = ADMIN_COUNTRY_BANKS[country] ?? [];
  const hasBankDropdown = availableBanks.length > 0 && (payMethod === "cadana" || payMethod === "wise");

  const extraData = (employee as any).bankExtraData as Record<string, string> | null | undefined;

  // No payment method or no country → show generic fields
  if (!payMethod || !country) {
    return (
      <>
        <EditField name="bankName" label="Bank Name" value={employee.bankName} />
        <EditField name="bankAccountName" label="Account Name" value={employee.bankAccountName} />
        <EditField name="bankAccountNumber" label="Account Number" value={employee.bankAccountNumber} />
        <EditField name="bankRoutingNumber" label="Routing Number" value={employee.bankRoutingNumber} />
        <EditField name="bankSwiftCode" label="SWIFT / BIC Code" value={employee.bankSwiftCode} />
        <EditField name="bankAddress" label="Bank Address" value={employee.bankAddress} />
        <EditField name="debitCardNumber" label="Debit Card Number" value={(employee as any).debitCardNumber} />
      </>
    );
  }

  return (
    <>
      {/* Payment method badge */}
      <div className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-medium mb-2 ${payMethod === "cadana" ? "bg-orange-100 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400" : "bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400"}`}>
        Showing fields for {payMethod === "cadana" ? "Cadana" : "Wise"} · {country}
      </div>

      {/* Bank Name — dropdown or freetext */}
      {hasBankDropdown ? (
        <div className="flex items-center justify-between py-1">
          <label className="text-sm text-muted-foreground">Bank Name</label>
          <div className="w-48">
            <SearchableSelect
              value={bankNameSelect}
              onValueChange={setBankNameSelect}
              placeholder="Select bank..."
              triggerClassName="h-8 w-full"
              options={availableBanks.map((b) => ({ value: b, label: b }))}
            />
            {bankNameSelect === "Other" && (
              <input value={bankOther} onChange={(e) => setBankOther(e.target.value)} placeholder="Enter bank name" className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-sm" />
            )}
            <input type="hidden" name="bankName" value={bankNameSelect === "Other" ? bankOther : bankNameSelect} />
          </div>
        </div>
      ) : (
        <EditField name="bankName" label="Bank Name" value={employee.bankName} />
      )}

      {/* Account Holder */}
      <EditField name="bankAccountName" label="Account Holder" value={employee.bankAccountName} />

      {/* Account Number / IBAN / CLABE */}
      <EditField name="bankAccountNumber" label={accountLabel} value={employee.bankAccountNumber} />

      {/* Account Type — Chile, Colombia, US */}
      {showAccountType && (
        <div className="flex items-center justify-between py-1">
          <label className="text-sm text-muted-foreground">Account Type</label>
          <div className="w-48">
            <CustomSelect
              name="bankExtraAccountType"
              defaultValue={extraData?.accountType ?? ""}
              placeholder="Select type..."
              triggerClassName="h-8 w-full"
              options={[
                { value: "checking", label: "Checking / Cuenta Corriente" },
                { value: "savings", label: "Savings / Cuenta de Ahorro" },
                ...(isChile ? [{ value: "vista", label: "Cuenta Vista / RUT" }] : []),
              ]}
            />
          </div>
        </div>
      )}

      {/* RUT — Chile */}
      {showRut && (
        <EditField name="bankExtraRut" label="RUT (Tax ID)" value={extraData?.rut} />
      )}

      {/* National ID — Colombia */}
      {showNationalId && (
        <>
          <div className="flex items-center justify-between py-1">
            <label className="text-sm text-muted-foreground">ID Type</label>
            <div className="w-48">
              <CustomSelect
                name="bankExtraIdType"
                defaultValue={extraData?.idType ?? "CC"}
                triggerClassName="h-8 w-full"
                options={[
                  { value: "CC", label: "Cédula de Ciudadanía" },
                  { value: "CE", label: "Cédula de Extranjería" },
                  { value: "PASSPORT", label: "Passport" },
                  { value: "NIT", label: "NIT" },
                ]}
              />
            </div>
          </div>
          <EditField name="bankExtraIdNumber" label="ID Number" value={extraData?.idNumber} />
        </>
      )}

      {/* Phone — Chile / Colombia */}
      {showPhone && (
        <EditField name="bankExtraPhone" label="Mobile Number" value={extraData?.phone} />
      )}

      {/* Routing / Sort Code / IFSC */}
      {showRouting && (
        <EditField name="bankRoutingNumber" label={routingLabel} value={employee.bankRoutingNumber} />
      )}

      {/* SWIFT / BIC */}
      {showSwift && (
        <EditField name="bankSwiftCode" label="SWIFT / BIC" value={employee.bankSwiftCode} />
      )}

      {/* Bank Address */}
      <EditField name="bankAddress" label="Bank Address" value={employee.bankAddress} />

      {/* Debit Card */}
      <EditField name="debitCardNumber" label="Debit Card Number" value={(employee as any).debitCardNumber} />
    </>
  );
}

function Card({ title, children }: { title: string; children?: React.ReactNode }) {
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

