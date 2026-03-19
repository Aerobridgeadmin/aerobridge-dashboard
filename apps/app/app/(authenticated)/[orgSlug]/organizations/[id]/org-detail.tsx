"use client";

/** Compress and resize an image file client-side before upload.
 * Resizes to max 800x800, outputs as JPEG at 88% quality. */
async function compressImage(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 800;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round((height * MAX) / width); width = MAX; }
        else { width = Math.round((width * MAX) / height); height = MAX; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) { reject(new Error("Image compression failed")); return; }
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
        },
        "image/jpeg", 0.88
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not load image")); };
    img.src = url;
  });
}

import { useErrorDialog } from "@/app/(authenticated)/components/error-dialog";
import { shortDate } from "@/lib/hriq/format";
import { ActivityFeedFull } from "@/app/(authenticated)/components/activity-feed";

import { revokeInvitation } from "@/app/actions/hriq/invitations";
import { deleteClientOrganization, updateOrganizationProfile, previewDeleteOrganization } from "@/app/actions/hriq/invitations";
import { uploadOrgLogo } from "@/app/actions/hriq/upload";
import { BillingTab } from "./billing-tab";
import { KycStatusCard } from "./kyc-status-card";
import { DestructiveConfirmDialog } from "@/app/(authenticated)/components/destructive-confirm-dialog";
import type { ImpactLine } from "@/app/(authenticated)/components/destructive-confirm-dialog";
import { CustomSelect } from "@/app/(authenticated)/components/custom-select";
import { CustomSelectWithOther } from "@/app/(authenticated)/components/custom-select-with-other";
import { SearchableSelect } from "@/app/(authenticated)/components/searchable-select";
import { COUNTRY_OPTIONS } from "@/lib/hriq/country-options";
import { CURRENCY_OPTIONS } from "@/lib/hriq/currency-options";
import { JOB_TITLE_OPTIONS, DEPARTMENT_OPTIONS } from "@/lib/hriq/role-department-options";
import { DatePicker } from "@/app/(authenticated)/components/date-picker";
import { updateUserRole } from "@/app/actions/hriq/users";
import { addContractorToOrg, recordPaymentForOrg, updatePaymentStatusForOrg, createTaskForOrg, completeTaskForOrg, addDocumentForOrg, verifyDocumentForOrg, inviteMemberToOrg } from "@/app/actions/hriq/org-management";
import Link from "next/link";
import { useRouter , useParams} from "next/navigation";
import { useState, useTransition, useRef } from "react";

const ROLE_LABELS: Record<string, string> = { super_admin: "Super Admin", admin: "Admin", client: "Client", manager: "Manager",
 va: "VA", member: "Member", owner: "Owner" };
const ROLE_COLORS: Record<string, string> = { super_admin: "bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300", admin: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300", client: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300", manager: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
 va: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200", member: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" };
const STATUS_COLORS: Record<string, string> = { active: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300", pre_hire: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300", onboarding_in_progress: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300", onboarding_scheduled: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300", offboarded: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400", completed: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300", pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300", processing: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300", failed: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300", verified: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300" };
const ROLES = ["super_admin", "admin", "manager", "member"];

type PaymentRecord = { id: string; amount: unknown; currency: string; status: string; paymentType: string; paymentMethod: string | null; periodStart: Date | null; periodEnd: Date | null; createdAt: Date; employee: { legalFirstName: string; legalLastName: string } };
type TaskRecord = { id: string; title: string; status: string; dueDate: Date | null; createdAt: Date; employee: { legalFirstName: string; legalLastName: string } };
type DocumentRecord = { id: string; documentType: string; fileName: string | null; status: string; createdAt: Date; employee: { legalFirstName: string; legalLastName: string } };
type EmployeeRecord = { id: string; legalFirstName: string; legalLastName: string; employeeNumber: string; jobTitle: string | null; department: string | null; employmentStatus: string; employmentType: string; hourlyRate: unknown; currency: string; createdAt: Date };

type Props = {
  org: { id: string; name: string; slug: string; logoUrl: string | null; stripeConnectAccountId: string | null; stripeConnectStatus: string | null; createdAt: Date; updatedAt: Date; _count: { members: number; employees: number; batchSessions: number } };
  members: Array<{ id: string; userId: string; role: string; createdAt: Date; displayName?: string; email?: string }>;
  employees: EmployeeRecord[];
  invitations: Array<{ id: string; email: string; role: string; expiresAt: Date; createdAt: Date }>;
  recentAudit: Array<{ id: string; action: string; objectType: string; timestamp: Date; objectId?: string | null; actorDescription?: string | null; newValue?: Record<string, unknown> | null }>;
  payments: PaymentRecord[];
  tasks: TaskRecord[];
  documents: DocumentRecord[];
  employeesByStatus: Record<string, number>;
  employeesByDept: Record<string, number>;
  agreements: Array<{ id: string; name: string; feeType: string; feeAmount: string; billingCycle: string; status: string; startDate: string; endDate: string | null; notes: string | null }>;
  profile: {
    industry: string | null;
    companySize: string | null;
    website: string | null;
    country: string | null;
    address: string | null;
    adminName: string | null;
    adminEmail: string | null;
    adminPhone: string | null;
    adminTitle: string | null;
    billingEmail: string | null;
    paymentTerms: string | null;
    docChecklist: Record<string, boolean> | null;
    kycStatus: string | null;
    kycProvider: string | null;
    veriffSessionId: string | null;
    kycVerifiedAt: Date | null;
    kycVerifiedName: string | null;
    kycDocumentType: string | null;
    kycDocumentCountry: string | null;
    kycRejectionReason: string | null;
    kycSessionUrl: string | null;
    kycInitiatedAt: Date | null;
    paymentMethod: string | null;
    pppInvoice: { id: string; docNumber: string | null; txnDate: string; totalAmount: number; customerName: string | null; status: string } | null;
  } | null;
};

export function OrgDetail({ org, members, employees, invitations, recentAudit, payments, tasks, documents, employeesByStatus, employeesByDept, agreements, profile }: Props) {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [tab, setTab] = useState<"overview" | "members" | "contractors" | "payments" | "tasks" | "documents" | "activity" | "billing" | "security">("overview");
  const [showDialog, setShowDialog] = useState<string | null>(null);
  const [contractorForm, setContractorForm] = useState({
    firstName: "", lastName: "", email: "", workEmail: "",
    employmentType: "full_time", department: "", jobTitle: "",
    compensationType: "hourly" as "hourly" | "monthly",
    hourlyRate: "", currency: "USD", startDate: "",
    timezone: "", preferredName: "", country: "", phone: "",
  });
  const [confirmDeleteOrgOpen, setConfirmDeleteOrgOpen] = useState(false);
  const [deletePreview, setDeletePreview] = useState<{ loading: boolean; error: string | null; lines: ImpactLine[] }>({ loading: false, error: null, lines: [] });
  const [logoUrl, setLogoUrl] = useState<string | null>(org.logoUrl);
  const [logoUploading, setLogoUploading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const { showError } = useErrorDialog();

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.files?.[0];
    if (!raw) return;
    if (!raw.type.startsWith("image/")) {
      showError({ title: "Invalid file", message: "Logo must be an image file." });
      return;
    }
    setLogoUploading(true);
    try {
      const file = await compressImage(raw);
      const fd = new FormData();
      fd.append("file", file);
      fd.append("orgId", org.id);
      const result = await uploadOrgLogo(fd);
      if (result.error) {
        showError({ title: "Logo upload failed", message: result.error ?? "An error occurred" });
      } else {
        setLogoUrl(result.url);
        router.refresh();
      }
    } catch (err: any) {
      showError({ title: "Logo upload failed", message: err instanceof Error ? err.message : "Something went wrong." });
    } finally {
      setLogoUploading(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  }

  const refresh = () => { setShowDialog(null); };

  const handleAction = (fn: () => Promise<unknown>) => {
    startTransition(async () => {
      try {
        const result = await fn();
        if (result && typeof result === "object" && "error" in (result as any)) {
          showError({ title: "Action failed", message: (result as any).error ?? "Something went wrong." });
          return;
        }
        refresh();
      } catch (err) { showError({ title: "Action failed", message: err instanceof Error ? err.message : "Something went wrong." }); }
    });
  };

  const openDeleteConfirm = async () => {
    setConfirmDeleteOrgOpen(true);
    setDeletePreview({ loading: true, error: null, lines: [] });
    try {
      const result = await previewDeleteOrganization(org.id);
      if ("error" in result) {
        setDeletePreview({ loading: false, error: result.error ?? "Failed to load preview", lines: [] });
        return;
      }
      setDeletePreview({
        loading: false,
        error: null,
        lines: [
          { label: "Contractors", count: result.employees, severity: result.employees > 0 ? "critical" : "normal" },
          { label: "User accounts deleted", count: result.authAccountsDeleted, severity: result.authAccountsDeleted > 0 ? "critical" : "normal" },
          { label: "Members", count: result.members },
          { label: "Payments", count: result.payments, severity: result.payments > 0 ? "warn" : "normal" },
          { label: "Timesheets", count: result.timesheets },
          { label: "Documents", count: result.documents },
          { label: "Invoices", count: result.invoices },
          { label: "Tasks", count: result.tasks },
          { label: "Service agreements", count: result.agreements },
          { label: "Invitations", count: result.invites },
          { label: "Onboarding sessions", count: result.onboardingSessions },
        ],
      });
    } catch {
      setDeletePreview({ loading: false, error: "Failed to load preview", lines: [] });
    }
  };

  const handleDeleteOrganization = async () => {
    try {
      await deleteClientOrganization(org.id);
      router.push(`/${orgSlug}/organizations`);
    } catch (err) {
      showError({ title: "Delete failed", message: err instanceof Error ? err.message : "Failed to delete organization." });
    }
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
    { key: "billing" as const, label: "Billing" },
    { key: "security" as const, label: "Security" }];

  return (
    <div className="space-y-6">
      {/* Back button — respects browser history so user returns to the page they came from */}
      <button
        type="button"
        onClick={() => {
          if (window.history.length > 1) {
            router.back();
          } else {
            router.push(`/${orgSlug}/organizations`);
          }
        }}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
        Back
      </button>
      {/* Header */}
      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Clickable logo — click to upload */}
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              disabled={logoUploading}
              className="relative flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-xl font-bold text-primary-foreground overflow-hidden group hover:ring-2 hover:ring-primary/50 transition disabled:opacity-50"
              title="Click to upload logo"
            >
              {logoUploading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
              ) : logoUrl ? (
                <img src={logoUrl} alt={org.name} className="h-full w-full object-cover" />
              ) : (
                <span>{org.name.charAt(0)}</span>
              )}
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition">
                <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
            </button>
            <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
            <div>
              <h2 className="text-2xl font-bold">{org.name}</h2>
              <p className="text-sm text-muted-foreground">Created {shortDate(org.createdAt as any)}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowDialog("invite")} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">+ Invite</button>
            <button
              onClick={openDeleteConfirm}
              disabled={isPending}
              className="h-9 rounded-md border border-red-200 px-4 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/30"
            >
              Delete Org
            </button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-6 gap-3">
          {[
            { v: org._count.members, l: "Members" }, { v: org._count.employees, l: "Contractors" },
            { v: `$${totalPaid.toLocaleString()}`, l: "Paid" }, { v: `$${totalPending.toLocaleString()}`, l: "Pending" },
            { v: openTasks, l: "Open Tasks" }, { v: invitations.length, l: "Invites" }].map((s) => (
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


      <DestructiveConfirmDialog
        open={confirmDeleteOrgOpen}
        onClose={() => setConfirmDeleteOrgOpen(false)}
        onConfirm={handleDeleteOrganization}
        title="Delete Organization"
        description={`Permanently delete "${org.name}" and all associated data. This action cannot be undone.`}
        loading={deletePreview.loading}
        error={deletePreview.error}
        impactLines={deletePreview.lines}
        confirmText={org.name}
        confirmLabel="Delete Organization"
      />

      {/* Overview */}
      {tab === "overview" && (
        <div className="space-y-4">
          {/* Company Info + Contact row */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border bg-card p-6">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Company Info</h3>
                <button onClick={() => setShowDialog("editProfile")} className="text-xs text-primary hover:underline">Edit</button>
              </div>
              <div className="mt-4 space-y-2">
                {[
                  { label: "Industry", value: profile?.industry },
                  { label: "Company Size", value: profile?.companySize?.replace(/_/g, " ") },
                  { label: "Website", value: profile?.website },
                  { label: "Country", value: profile?.country },
                  { label: "Address", value: profile?.address },
                  { label: "Slug", value: org.slug },
                ].map((row) => (
                  <div key={row.label} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{row.label}</span>
                    <span className="font-medium text-right max-w-[60%] truncate">{row.value || "—"}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border bg-card p-6">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Contact & Billing</h3>
                <button onClick={() => setShowDialog("editProfile")} className="text-xs text-primary hover:underline">Edit</button>
              </div>
              <div className="mt-4 space-y-2">
                {[
                  { label: "Admin Name", value: profile?.adminName },
                  { label: "Admin Email", value: profile?.adminEmail },
                  { label: "Admin Phone", value: profile?.adminPhone },
                  { label: "Admin Title", value: profile?.adminTitle },
                  { label: "Billing Email", value: profile?.billingEmail },
                  { label: "Payment Terms", value: profile?.paymentTerms?.replace(/_/g, " ")?.toUpperCase() },
                ].map((row) => (
                  <div key={row.label} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{row.label}</span>
                    <span className="font-medium text-right max-w-[60%] truncate">{row.value || "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Payment Method */}
          <div className="rounded-xl border bg-card p-6">
            <h3 className="font-semibold">Payment Method</h3>
            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap gap-2">
                {(profile?.paymentMethod === "ppp" || profile?.paymentMethod === "both") && (
                  <span className="inline-flex items-center rounded-full bg-violet-100 dark:bg-violet-900/40 px-3 py-1 text-xs font-medium text-violet-700 dark:text-violet-300">
                    PPP — Stripe Connect
                  </span>
                )}
                {(profile?.paymentMethod === "cor" || profile?.paymentMethod === "both") && (
                  <span className="inline-flex items-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                    COR — QuickBooks + Wise
                  </span>
                )}
                {!profile?.paymentMethod && (
                  <span className="text-sm text-muted-foreground">Not configured</span>
                )}
              </div>

              {/* Stripe Connect status for PPP orgs */}
              {(profile?.paymentMethod === "ppp" || profile?.paymentMethod === "both") && (
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">Stripe Connect</div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      org.stripeConnectStatus === "verified" || org.stripeConnectStatus === "restricted"
                        ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                        : org.stripeConnectAccountId
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                        : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                    }`}>
                      {org.stripeConnectStatus === "verified" || org.stripeConnectStatus === "restricted"
                        ? "Active"
                        : org.stripeConnectAccountId
                        ? "Pending setup"
                        : "Not started"}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => {
                        startTransition(async () => {
                          try {
                            const { initOrgConnectAccount } = await import("@/app/actions/hriq/stripe");
                            const result = await initOrgConnectAccount(org.id);
                            if ("error" in result) {
                              showError({ title: "Error", message: result.error });
                              return;
                            }
                            // Copy to clipboard + open
                            await navigator.clipboard.writeText(result.onboardingUrl).catch(() => {});
                            window.open(result.onboardingUrl, "_blank");
                            router.refresh();
                          } catch (err) {
                            showError({ title: "Error", message: err instanceof Error ? err.message : "Failed" });
                          }
                        });
                      }}
                      className="h-8 rounded-md border px-3 text-xs font-medium hover:bg-accent disabled:opacity-50"
                    >
                      {isPending ? "..." : org.stripeConnectAccountId ? "Get Setup Link" : "Create Connect Account"}
                    </button>
                    {profile?.adminEmail && (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => {
                          startTransition(async () => {
                            try {
                              const { sendOrgConnectSetupEmail } = await import("@/app/actions/hriq/stripe");
                              const result = await sendOrgConnectSetupEmail(org.id);
                              if ("error" in result) {
                                showError({ title: "Error", message: result.error });
                                return;
                              }
                              showError({ title: "Sent", message: `Stripe Connect setup link emailed to ${profile.adminEmail}` });
                              router.refresh();
                            } catch (err) {
                              showError({ title: "Error", message: err instanceof Error ? err.message : "Failed to send" });
                            }
                          });
                        }}
                        className="h-8 rounded-md bg-violet-600 px-3 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50"
                      >
                        {isPending ? "Sending..." : "Email Setup Link"}
                      </button>
                    )}
                    {org.stripeConnectAccountId && (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => {
                          startTransition(async () => {
                            try {
                              const { refreshOrgConnectStatus } = await import("@/app/actions/hriq/stripe");
                              const result = await refreshOrgConnectStatus(org.id);
                              if ("error" in result) {
                                showError({ title: "Error", message: result.error });
                                return;
                              }
                              router.refresh();
                            } catch (err) {
                              showError({ title: "Error", message: err instanceof Error ? err.message : "Failed" });
                            }
                          });
                        }}
                        className="h-8 rounded-md border px-3 text-xs font-medium hover:bg-accent disabled:opacity-50"
                      >
                        Refresh Status
                      </button>
                    )}
                    {org.stripeConnectAccountId && (org.stripeConnectStatus === "verified" || org.stripeConnectStatus === "restricted") && (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => {
                          startTransition(async () => {
                            try {
                              const { getOrgConnectDashboardLink } = await import("@/app/actions/hriq/stripe");
                              const result = await getOrgConnectDashboardLink(org.id);
                              if ("error" in result) {
                                showError({ title: "Error", message: result.error });
                                return;
                              }
                              window.open(result.url, "_blank");
                            } catch (err) {
                              showError({ title: "Error", message: err instanceof Error ? err.message : "Failed" });
                            }
                          });
                        }}
                        className="h-8 rounded-md bg-indigo-600 px-3 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                      >
                        Open Stripe Dashboard
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Document Checklist (legacy, if any exist) */}
          {profile?.docChecklist && Object.keys(profile.docChecklist).length > 0 && (
            <div className="rounded-xl border bg-card p-6">
              <h3 className="font-semibold">Document Checklist</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {Object.entries(profile.docChecklist as Record<string, boolean>).filter(([, v]) => v).map(([key]) => (
                  <span key={key} className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800 dark:bg-green-900/50 dark:text-green-300 capitalize">{key.replace(/_/g, " ")}</span>
                ))}
              </div>
            </div>
          )}

          {/* PPP Invoice */}
          {profile?.pppInvoice && (
            <div className="rounded-xl border bg-card p-6">
              <h3 className="font-semibold">PPP Invoice</h3>
              <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                <span className="text-muted-foreground">Invoice #</span>
                <span className="font-medium">{(profile.pppInvoice as any).docNumber ?? "N/A"}</span>
                <span className="text-muted-foreground">Customer</span>
                <span className="font-medium">{(profile.pppInvoice as any).customerName ?? "N/A"}</span>
                <span className="text-muted-foreground">Amount</span>
                <span className="font-medium">${Number((profile.pppInvoice as any).totalAmount ?? 0).toLocaleString()}</span>
                <span className="text-muted-foreground">Date</span>
                <span className="font-medium">{(profile.pppInvoice as any).txnDate ? shortDate((profile.pppInvoice as any).txnDate) : "N/A"}</span>
                <span className="text-muted-foreground">Status</span>
                <span className="inline-flex w-fit items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold uppercase text-green-800 dark:bg-green-900/50 dark:text-green-300">
                  {(profile.pppInvoice as any).status}
                </span>
              </div>
            </div>
          )}

          {/* Stats row */}
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
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{(m.displayName || m.email || m.userId).charAt(0).toUpperCase()}</div>
                    <div>
                      <div className="text-sm font-medium">{m.displayName || m.email || `${m.userId.slice(0, 8)}...`}</div>
                      {m.email && m.displayName && <div className="text-xs text-muted-foreground">{m.email}</div>}
                      <div className="text-xs text-muted-foreground">Joined {shortDate(m.createdAt as any)}</div>
                    </div>
                  </div>
                  <div className={`rounded-md ${ROLE_COLORS[m.role] ?? "bg-gray-100"}`}>
                    <CustomSelect
                      value={m.role}
                      onValueChange={(value) => handleAction(() => updateUserRole(m.id, value))}
                      disabled={isPending}
                      triggerClassName="h-7 border-0 bg-transparent px-2 text-xs font-medium"
                      options={ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
                    />
                  </div>
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
                <td className="px-4 py-3"><Link href={`/${orgSlug}/employees/${e.id}`} className="text-sm font-medium hover:underline">{e.legalFirstName} {e.legalLastName}</Link></td>
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
                <td className="px-4 py-3 text-xs text-muted-foreground">{p.periodStart ? `${shortDate(p.periodStart as any)} – ${p.periodEnd ? shortDate(p.periodEnd as any) : ""}` : shortDate(p.createdAt as any)}</td>
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
                <td className="px-4 py-3 text-sm text-muted-foreground">{t.dueDate ? shortDate(t.dueDate as any) : "—"}</td>
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
        <div className="rounded-xl border bg-card p-6">
          <h3 className="font-semibold mb-4">Recent Activity</h3>
          <ActivityFeedFull entries={recentAudit} />
        </div>
      )}

      {/* Billing / Service Agreement */}
      {tab === "billing" && (
        <BillingTab orgId={org.id} agreements={agreements} onRefresh={refresh} isPending={isPending} onAction={handleAction} showError={showError} />
      )}

      {/* Security Tab */}
      {tab === "security" && (
        <div className="space-y-6">
          {/* KYC / Identity Verification */}
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Identity Verification (KYC)</h3>
            <KycStatusCard
              organizationId={org.id}
              kyc={profile ? {
                status: profile.kycStatus || "pending",
                provider: profile.kycProvider || null,
                sessionId: profile.veriffSessionId || null,
                verifiedAt: profile.kycVerifiedAt || null,
                verifiedName: profile.kycVerifiedName || null,
                documentType: profile.kycDocumentType || null,
                documentCountry: profile.kycDocumentCountry || null,
                rejectionReason: profile.kycRejectionReason || null,
                sessionUrl: profile.kycSessionUrl || null,
                initiatedAt: profile.kycInitiatedAt || null,
                adminEmail: profile.adminEmail || null,
                adminName: profile.adminName || null,
              } : null}
            />
          </div>

          {/* Org Danger Zone */}
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Danger Zone</h3>
            <div className="rounded-xl border border-red-200 dark:border-red-900 bg-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Delete Organization</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Permanently remove this organization and all its data.</p>
                </div>
                <button
                  onClick={openDeleteConfirm}
                  disabled={isPending}
                  className="rounded-lg border border-red-300 dark:border-red-800 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                >
                  Delete Organization
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* === DIALOGS === */}

      {/* Add Contractor Dialog */}
      {showDialog === "contractor" && (
        <Dialog title="Add Contractor" onClose={() => { setShowDialog(null); setContractorForm({ firstName: "", lastName: "", email: "", workEmail: "", employmentType: "full_time", department: "", jobTitle: "", compensationType: "hourly", hourlyRate: "", currency: "USD", startDate: "", timezone: "", preferredName: "", country: "", phone: "" }); }}>
          <div className="space-y-4 pb-2">
            {/* Name row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">First Name *</label>
                <input required value={contractorForm.firstName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setContractorForm((prev) => ({...prev, firstName: e.target.value}))}
                  className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" placeholder="Jane" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Last Name *</label>
                <input required value={contractorForm.lastName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setContractorForm((prev) => ({...prev, lastName: e.target.value}))}
                  className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" placeholder="Smith" />
              </div>
            </div>
            {/* Preferred name */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Preferred Name</label>
              <input value={contractorForm.preferredName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setContractorForm((prev) => ({...prev, preferredName: e.target.value}))}
                className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" placeholder="Optional display name" />
            </div>
            {/* Emails */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Personal Email</label>
                <input type="email" value={contractorForm.email} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setContractorForm((prev) => ({...prev, email: e.target.value}))}
                  className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" placeholder="jane@personal.com" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Work Email</label>
                <input type="email" value={contractorForm.workEmail} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setContractorForm((prev) => ({...prev, workEmail: e.target.value}))}
                  className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" placeholder="jane@company.com" />
              </div>
            </div>
            {/* Type + Department */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Employment Type</label>
                <CustomSelect
                  value={contractorForm.employmentType}
                  onValueChange={(v: string) => setContractorForm((prev) => ({...prev, employmentType: v}))}
                  options={[
                    { value: "full_time", label: "Full Time" },
                    { value: "part_time", label: "Part Time" },
                  ]}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Department</label>
                <CustomSelectWithOther
                  value={contractorForm.department}
                  onValueChange={(v: string) => setContractorForm((prev) => ({...prev, department: v}))}
                  placeholder="Select department..."
                  triggerClassName="h-9 w-full"
                  baseOptions={[...DEPARTMENT_OPTIONS]}
                  category="department"
                />
              </div>
            </div>
            {/* Job Title */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Job Title</label>
              <CustomSelectWithOther
                value={contractorForm.jobTitle}
                onValueChange={(v: string) => setContractorForm((prev) => ({...prev, jobTitle: v}))}
                placeholder="Select role..."
                triggerClassName="h-9 w-full"
                baseOptions={[...JOB_TITLE_OPTIONS]}
                category="job_title"
              />
            </div>
            {/* Country + Phone */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Country</label>
                <SearchableSelect
                  value={contractorForm.country}
                  onValueChange={(v: string) => setContractorForm((prev) => ({...prev, country: v}))}
                  options={[...COUNTRY_OPTIONS]}
                  placeholder="Select country..."
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Phone</label>
                <input type="tel" value={contractorForm.phone} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setContractorForm((prev) => ({...prev, phone: e.target.value}))}
                  className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" placeholder="+1 555-0100" />
              </div>
            </div>
            {/* Compensation Type + Rate + Currency */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Type</label>
                <div className="flex h-9 rounded-lg border border-input overflow-hidden">
                  <button type="button" onClick={() => setContractorForm((prev) => ({...prev, compensationType: "hourly", hourlyRate: ""}))} className={`flex-1 text-xs font-medium transition-colors ${contractorForm.compensationType === "hourly" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent"}`}>Hourly</button>
                  <button type="button" onClick={() => setContractorForm((prev) => ({...prev, compensationType: "monthly", hourlyRate: ""}))} className={`flex-1 text-xs font-medium transition-colors ${contractorForm.compensationType === "monthly" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent"}`}>Monthly</button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">{contractorForm.compensationType === "monthly" ? "Monthly Salary" : "Hourly Rate"}</label>
                <input type="number" min="0" step="0.01" value={contractorForm.hourlyRate} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setContractorForm((prev) => ({...prev, hourlyRate: e.target.value}))}
                  className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" placeholder={contractorForm.compensationType === "monthly" ? "2500.00" : "0.00"} />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Currency</label>
                <SearchableSelect
                  value={contractorForm.currency}
                  onValueChange={(v: string) => setContractorForm((prev) => ({...prev, currency: v}))}
                  options={CURRENCY_OPTIONS}
                  placeholder="Select currency..."
                />
              </div>
            </div>
            {/* Start Date + Timezone */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Start Date</label>
                <DatePicker
                  value={contractorForm.startDate}
                  onChange={(v: string) => setContractorForm((prev) => ({...prev, startDate: v}))}
                  placeholder="Select date..."
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Timezone</label>
                <CustomSelect
                  value={contractorForm.timezone}
                  onValueChange={(v: string) => setContractorForm((prev) => ({...prev, timezone: v}))}
                  options={[
                    { value: "America/New_York", label: "Eastern (ET)" },
                    { value: "America/Chicago", label: "Central (CT)" },
                    { value: "America/Denver", label: "Mountain (MT)" },
                    { value: "America/Los_Angeles", label: "Pacific (PT)" },
                    { value: "America/Bogota", label: "Colombia (COT)" },
                    { value: "America/Lima", label: "Peru (PET)" },
                    { value: "America/Santiago", label: "Chile (CLT)" },
                    { value: "America/Sao_Paulo", label: "Brazil (BRT)" },
                    { value: "America/Mexico_City", label: "Mexico (CST)" },
                    { value: "Europe/London", label: "London (GMT/BST)" },
                    { value: "Europe/Paris", label: "Central Europe (CET)" },
                    { value: "Asia/Manila", label: "Philippines (PHT)" },
                    { value: "Asia/Kolkata", label: "India (IST)" },
                    { value: "Asia/Jakarta", label: "Indonesia (WIB)" },
                    { value: "Australia/Sydney", label: "Sydney (AEST)" },
                  ]}
                />
              </div>
            </div>
            {/* Submit */}
            <div className="flex justify-end gap-2 pt-2 border-t">
              <button type="button" onClick={() => { setShowDialog(null); setContractorForm({ firstName: "", lastName: "", email: "", workEmail: "", employmentType: "full_time", department: "", jobTitle: "", compensationType: "hourly", hourlyRate: "", currency: "USD", startDate: "", timezone: "", preferredName: "", country: "", phone: "" }); }}
                className="rounded-lg border px-4 py-2 text-sm hover:bg-muted">Cancel</button>
              <button
                type="button"
                disabled={isPending || !contractorForm.firstName.trim() || !contractorForm.lastName.trim()}
                onClick={() => {
                  if (!contractorForm.firstName.trim() || !contractorForm.lastName.trim()) return;
                  handleAction(() => addContractorToOrg(org.id, {
                    legalFirstName: contractorForm.firstName,
                    legalLastName: contractorForm.lastName,
                    employmentType: contractorForm.employmentType,
                    personalEmail: contractorForm.email || undefined,
                    workEmail: contractorForm.workEmail || undefined,
                    preferredName: contractorForm.preferredName || undefined,
                    department: contractorForm.department || undefined,
                    jobTitle: contractorForm.jobTitle || undefined,
                    country: contractorForm.country || undefined,
                    phone: contractorForm.phone || undefined,
                    compensationType: contractorForm.compensationType,
                    hourlyRate: contractorForm.compensationType === "hourly" ? (contractorForm.hourlyRate || undefined) : undefined,
                    monthlySalary: contractorForm.compensationType === "monthly" ? (contractorForm.hourlyRate || undefined) : undefined,
                    currency: contractorForm.currency || "USD",
                    startDate: contractorForm.startDate || undefined,
                    timezone: contractorForm.timezone || undefined,
                  }));
                }}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {isPending ? "Adding…" : "Add Contractor"}
              </button>
            </div>
          </div>
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
          <FormHandler onSubmit={(fd) => handleAction(() => recordPaymentForOrg(org.id, { employeeId: fd.get("empId") as string, amount: fd.get("amount") as string, currency: fd.get("currency") as string || "USD", paymentType: fd.get("payType") as string, paymentMethod: fd.get("method") as string, periodStart: fd.get("pStart") as string, periodEnd: fd.get("pEnd") as string, notes: fd.get("notes") as string }))} isPending={isPending}>
            <Select name="empId" label="Contractor *" required options={employees.map((e) => [e.id, `${e.legalFirstName} ${e.legalLastName} (${e.employeeNumber})`])} />
            <div className="grid grid-cols-3 gap-3">
              <Input name="amount" label="Amount *" type="number" required />
              <Select name="currency" label="Currency" options={[["USD","USD"],["EUR","EUR"],["GBP","GBP"],["PHP","PHP"],["COP","COP"],["BRL","BRL"],["CLP","CLP"],["MXN","MXN"],["CAD","CAD"],["AUD","AUD"],["INR","INR"]]} />
              <Select name="payType" label="Type *" required options={[["salary","Salary"],["bonus","Bonus"],["reimbursement","Reimbursement"],["commission","Commission"]]} />
            </div>
            <Select name="method" label="Payment Method" options={[["bank_transfer","Bank Transfer"],["wise","Wise"],["paypal","PayPal"],["check","Check"]]} />
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

      {/* Edit Profile Dialog */}
      {showDialog === "editProfile" && (
        <Dialog title="Edit Organization Profile" onClose={() => setShowDialog(null)}>
          <FormHandler onSubmit={(fd) => handleAction(() => updateOrganizationProfile(org.id, {
            industry: fd.get("industry") as string || null,
            companySize: fd.get("companySize") as string || null,
            website: fd.get("website") as string || null,
            country: fd.get("country") as string || null,
            address: fd.get("address") as string || null,
            adminName: fd.get("adminName") as string || null,
            adminEmail: fd.get("adminEmail") as string || null,
            adminPhone: fd.get("adminPhone") as string || null,
            adminTitle: fd.get("adminTitle") as string || null,
            billingEmail: fd.get("billingEmail") as string || null,
            paymentTerms: fd.get("paymentTerms") as string || null,
            paymentMethod: fd.get("paymentMethod") as string || null,
          }))} isPending={isPending}>
            <h4 className="text-sm font-medium text-muted-foreground">Payment Method</h4>
            <Select name="paymentMethod" label="Payment Method" defaultValue={profile?.paymentMethod ?? "ppp"} options={[
              ["ppp", "PPP (Stripe Connect)"],
              ["cor", "COR (QuickBooks + Wise)"],
              ["both", "Both (Stripe Connect + QuickBooks/Wise)"],
            ]} />
            <div className="mt-2 border-t pt-3" />
            <h4 className="text-sm font-medium text-muted-foreground">Company Details</h4>
            <div className="grid grid-cols-2 gap-3">
              <Select name="industry" label="Industry" defaultValue={profile?.industry ?? undefined} options={[
                ["technology","Technology"],["healthcare","Healthcare"],["finance","Finance"],
                ["ecommerce","E-Commerce"],["real_estate","Real Estate"],["marketing","Marketing"],
                ["consulting","Consulting"],["education","Education"],["other","Other"],
              ]} />
              <Select name="companySize" label="Company Size" defaultValue={profile?.companySize ?? undefined} options={[
                ["1-10","1-10"],["11-50","11-50"],["51-200","51-200"],["201-500","201-500"],["500+","500+"],
              ]} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input name="website" label="Website" defaultValue={profile?.website ?? ""} />
              <div><label className="text-sm font-medium">Country</label><SearchableSelect name="country" defaultValue={profile?.country ?? ""} placeholder="Select country..." triggerClassName="mt-1 h-9 w-full" options={[...COUNTRY_OPTIONS]} /></div>
            </div>
            <Input name="address" label="Address" defaultValue={profile?.address ?? ""} />
            <div className="mt-2 border-t pt-3" />
            <h4 className="text-sm font-medium text-muted-foreground">Contact & Billing</h4>
            <div className="grid grid-cols-2 gap-3">
              <Input name="adminName" label="Admin Name" defaultValue={profile?.adminName ?? ""} />
              <Input name="adminEmail" label="Admin Email" defaultValue={profile?.adminEmail ?? ""} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input name="adminPhone" label="Admin Phone" defaultValue={profile?.adminPhone ?? ""} />
              <Input name="adminTitle" label="Admin Title" defaultValue={profile?.adminTitle ?? ""} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input name="billingEmail" label="Billing Email" defaultValue={profile?.billingEmail ?? ""} />
              <Select name="paymentTerms" label="Payment Terms" defaultValue={profile?.paymentTerms ?? "net_30"} options={[
                ["net_15","Net 15"],["net_30","Net 30"],["net_45","Net 45"],["prepaid","Prepaid"],
              ]} />
            </div>
          </FormHandler>
        </Dialog>
      )}
    </div>
  );
}

//  Reusable UI Components 

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children?: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in duration-150">
      <div className="w-full max-w-lg rounded-xl border bg-card p-6 shadow-lg max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-semibold">{title}</h2><button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg"></button></div>
        {children}
      </div>
    </div>
  );
}

function FormHandler({ onSubmit, isPending, children, error }: { onSubmit: (fd: FormData) => void; isPending: boolean; children?: React.ReactNode; error?: string | null }) {
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(new FormData(e.currentTarget)); }} className="space-y-3">
      {children}
      <button type="submit" disabled={isPending} className="mt-2 h-10 w-full rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
        {isPending ? "Saving..." : "Save"}
      </button>
    </form>
  );
}

function Input({ name, label, type, required, placeholder, defaultValue }: { name: string; label: string; type?: string; required?: boolean; placeholder?: string; defaultValue?: string }) {
  if (type === "date") {
    return (
      <div><label className="text-sm font-medium">{label}</label><DatePicker name={name} required={required} className="mt-1" value={defaultValue} /></div>
    );
  }
  return (
    <div><label className="text-sm font-medium">{label}</label><input name={name} type={type ?? "text"} required={required} placeholder={placeholder} defaultValue={defaultValue} step={type === "number" ? "0.01" : undefined} className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" /></div>
  );
}

function Select({ name, label, options, required, defaultValue }: { name: string; label: string; options: string[][]; required?: boolean; defaultValue?: string }) {
  return (
    <div>
      <label className="text-sm font-medium">{label}</label>
      <CustomSelect
        name={name}
        required={required}
        placeholder="Select..."
        triggerClassName="mt-1 h-9 w-full"
        defaultValue={defaultValue}
        options={options
          .filter(([value]) => value !== "")
          .map(([value, label]) => ({ value, label }))}
      />
    </div>
  );
}
