"use client";
import { useErrorDialog } from "@/app/(authenticated)/components/error-dialog";
import { shortDate } from "@/lib/hriq/format";

/** Compress and resize an image file client-side before upload.
 * Resizes to max 800x800, outputs as JPEG at 88% quality.
 * Keeps file well under 500KB regardless of original size. */
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

import { createClientOrganization, updateOrgSeats, resendOrgAdminDashboardInvite } from "@/app/actions/hriq/invitations";
import { ClientPipeline } from "./client-pipeline";
import { initiateClientKyc, resendClientKycEmail, manualKycApproval} from "@/app/actions/hriq/client-kyc";
import { createExternalOnboardingSession, getExternalOnboardingSessions, convertOnboardingToOrg, expireOnboardingSession, resendOnboardingLinkEmail, createPaymentContractLinkForOrg, getOnboardingDocumentUrl, checkOnboardingDocumentSigned } from "@/app/actions/hriq/org-onboarding";
import { uploadOrgLogo } from "@/app/actions/hriq/upload";
import { searchQBInvoices, downloadQBInvoicePdf } from "@/app/actions/hriq/quickbooks";
import type { QBInvoiceSearchResult } from "@/app/actions/hriq/quickbooks";
import { searchJotFormContracts, downloadJotFormSubmissionPdf } from "@/app/actions/hriq/documents";
import type { JotFormContractSubmission } from "@/app/actions/hriq/documents";
import { uploadOrgDocument } from "@/app/actions/hriq/upload";
import { CustomSelect } from "@/app/(authenticated)/components/custom-select";
import { CustomSelectWithOther } from "@/app/(authenticated)/components/custom-select-with-other";
import { SearchableSelect } from "@/app/(authenticated)/components/searchable-select";
import { COUNTRY_OPTIONS } from "@/lib/hriq/country-options";
import type { Organization } from "@repo/database";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState, useTransition, useRef } from "react";
import { serialize } from "@/lib/hriq/serialize";

const ADMIN_TITLE_OPTIONS = [
  { value: "CEO", label: "CEO" },
  { value: "COO", label: "COO" },
  { value: "CTO", label: "CTO" },
  { value: "CFO", label: "CFO" },
  { value: "VP of Operations", label: "VP of Operations" },
  { value: "VP of Engineering", label: "VP of Engineering" },
  { value: "HR Director", label: "HR Director" },
  { value: "Head of People", label: "Head of People" },
  { value: "Director of Talent", label: "Director of Talent" },
  { value: "Operations Manager", label: "Operations Manager" },
  { value: "Founder", label: "Founder" },
  { value: "Co-Founder", label: "Co-Founder" },
  { value: "Managing Director", label: "Managing Director" },
  { value: "General Manager", label: "General Manager" },
  { value: "Project Manager", label: "Project Manager" },
];

type OrgWithCounts = Organization & {
  _count: { members: number; employees: number };
  logoUrl: string | null;
  profile?: {
    kycStatus: string | null;
    adminName: string | null;
    adminEmail: string | null;
    adminPhone: string | null;
    adminTitle: string | null;
    industry: string | null;
    vaSeats?: number | null;
    planType?: string | null;
    paymentMethod?: string | null;
  } | null;
};

type OrgFormData = {
  name: string; industry: string; companySize: string; website: string; country: string; address: string;
  adminName: string; adminEmail: string; adminPhone: string; adminTitle: string; billingEmail: string;
};

const emptyForm: OrgFormData = {
  name: "", industry: "", companySize: "", website: "", country: "", address: "",
  adminName: "", adminEmail: "", adminPhone: "", adminTitle: "", billingEmail: "",
};

const KYC_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending:     { label: "KYC Pending",   color: "text-gray-500",   bg: "bg-gray-100 dark:bg-gray-800" },
  created:     { label: "KYC Sent",      color: "text-blue-600",   bg: "bg-blue-50 dark:bg-blue-900/30" },
  started:     { label: "KYC Started",   color: "text-blue-600",   bg: "bg-blue-50 dark:bg-blue-900/30" },
  submitted:   { label: "KYC Review",    color: "text-yellow-600", bg: "bg-yellow-50 dark:bg-yellow-900/30" },
  approved:    { label: "KYC Verified",  color: "text-green-600",  bg: "bg-green-50 dark:bg-green-900/30" },
  declined:    { label: "KYC Declined",  color: "text-red-600",    bg: "bg-red-50 dark:bg-red-900/30" },
  resubmission_requested: { label: "KYC Resubmit", color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-900/30" },
};

export function OrganizationsList({ organizations }: { organizations: OrgWithCounts[] }) {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showCreate, setShowCreate] = useState(false);
  const [editingSeats, setEditingSeats] = useState<{ orgId: string; orgName: string; current: number | null; plan: string | null } | null>(null);
  const [editSeatCount, setEditSeatCount] = useState("");
  const [step, setStep] = useState(1);
  const { showError } = useErrorDialog();
  const [form, setForm] = useState<OrgFormData>(emptyForm);
  const [docChecklist, setDocChecklist] = useState<Record<string, boolean>>({});
  const [payDirect, setPayDirect] = useState(true);
  const [payIndirect, setPayIndirect] = useState(false);
  const paymentMethod = payDirect && payIndirect ? "both" : payDirect ? "ppp" : payIndirect ? "cor" : "ppp";
  const [createdOrgId, setCreatedOrgId] = useState<string | null>(null);
  const [createdEmailOk, setCreatedEmailOk] = useState<boolean | null>(null);
  const [createdEmailError, setCreatedEmailError] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [stripeSent, setStripeSent] = useState(false);
  const [stripeSending, setStripeSending] = useState(false);
  const [paymentLinkSent, setPaymentLinkSent] = useState(false);
  const [paymentLinkSending, setPaymentLinkSending] = useState(false);
  const [paymentLinkUrl, setPaymentLinkUrl] = useState<string | null>(null);
  const [suppressInviteEmail, setSuppressInviteEmail] = useState(false);
  const [requireVeriff, setRequireVeriff] = useState(true);
  const suppressKycEmail = true; // KYC email is pointless — admin is already on the Veriff screen
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Mode chooser: null = show chooser, "internal" = current wizard, "external" = generate link
  const [wizardMode, setWizardMode] = useState<null | "internal" | "external">(null);
  const [externalLink, setExternalLink] = useState("");
  const [externalName, setExternalName] = useState("");
  const [externalEmail, setExternalEmail] = useState("");
  const [externalContactName, setExternalContactName] = useState("");
  const [externalPrepaid, setExternalPrepaid] = useState(false);
  const [externalVACount, setExternalVACount] = useState(1);
  const [externalVAInput, setExternalVAInput] = useState("1");
  const [externalPlan, setExternalPlan] = useState<"ppp" | "cor" | "both">("ppp");
  const [emailSentTo, setEmailSentTo] = useState<string | null>(null);
  const [externalSessions, setExternalSessions] = useState<any[]>([]);
  const [showExternalTracker, setShowExternalTracker] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [prepaidInvoiceFile, setPrepaidInvoiceFile] = useState<File | null>(null);
  const [prepaidContractFile, setPrepaidContractFile] = useState<File | null>(null);
  const [prepaidInvoiceUrl, setPrepaidInvoiceUrl] = useState<string | null>(null);
  const [prepaidContractUrl, setPrepaidContractUrl] = useState<string | null>(null);
  const [prepaidUploading, setPrepaidUploading] = useState(false);
  // QB invoice lookup state
  const [prepaidQBSearch, setPrepaidQBSearch] = useState("");
  const [prepaidQBResults, setPrepaidQBResults] = useState<QBInvoiceSearchResult[]>([]);
  const [prepaidQBSearching, setPrepaidQBSearching] = useState(false);
  const [prepaidQBError, setPrepaidQBError] = useState<string | null>(null);
  const [prepaidQBSearched, setPrepaidQBSearched] = useState(false);
  const [selectedPrepaidInvoice, setSelectedPrepaidInvoice] = useState<QBInvoiceSearchResult | null>(null);
  // JotForm contract lookup state
  const [prepaidJFSearch, setPrepaidJFSearch] = useState("");
  const [prepaidJFResults, setPrepaidJFResults] = useState<JotFormContractSubmission[]>([]);
  const [prepaidJFSearching, setPrepaidJFSearching] = useState(false);
  const [prepaidJFError, setPrepaidJFError] = useState<string | null>(null);
  const [selectedPrepaidContract, setSelectedPrepaidContract] = useState<JotFormContractSubmission | null>(null);

  // Org actions panel state
  const [actionsOrg, setActionsOrg] = useState<typeof organizations[0] | null>(null);
  const [actionsLoading, setActionsLoading] = useState<string | null>(null); // which action is loading
  const [actionsMsg, setActionsMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [manualApproveOpen, setManualApproveOpen] = useState(false);
  const [manualApproveName, setManualApproveName] = useState("");
  const [payLinkSending, setPayLinkSending] = useState(false);
  const [payLinkUrl, setPayLinkUrl] = useState<string | null>(null);
  const [payLinkCopied, setPayLinkCopied] = useState(false);

  const updateForm = (field: keyof OrgFormData, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

  const TOTAL_STEPS = 4;

  // Tab state
  const [activeTab, setActiveTab] = useState<"orgs" | "pipeline">("orgs");

  // QB Invoice search state (Step 1: Payment Verification)
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoiceResults, setInvoiceResults] = useState<QBInvoiceSearchResult[]>([]);
  const [invoiceSearching, setInvoiceSearching] = useState(false);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<QBInvoiceSearchResult | null>(null);
  const [invoiceSkipped, setInvoiceSkipped] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleInvoiceSearch = async (term?: string) => {
    const q = (term ?? invoiceSearch).trim();
    setInvoiceSearching(true);
    setInvoiceError(null);
    try {
      const result = await searchQBInvoices(q);
      if (result.error) setInvoiceError(result.error ?? "An error occurred");
      setInvoiceResults(result.invoices);
    } catch (err) {
      setInvoiceError(err instanceof Error ? err.message : "Search failed");
    }
    setInvoiceSearching(false);
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { showError("Logo must be an image file."); return; }
    if (file.size > 20 * 1024 * 1024) { showError("Logo must be under 20 MB."); return; }
    // Compress immediately so preview and upload use the same file
    compressImage(file).then((compressed) => {
      setLogoFile(compressed);
      setLogoPreview(URL.createObjectURL(compressed));
    }).catch(() => {
      // Fallback: use original if compression fails
      setLogoFile(file);
      setLogoPreview(URL.createObjectURL(file));
    });
  };

  const handleNextStep = () => {
    if (step === 1) {
      if (!form.name.trim()) { showError("Company name is required."); return; }
      if (!form.industry) { showError("Industry is required."); return; }
      if (!form.companySize) { showError("Company size is required."); return; }
      if (!form.country.trim()) { showError("Country is required."); return; }
      if (!form.address.trim()) { showError("Business address is required."); return; }
      if (!logoFile) { showError("Company logo is required. Clients see this on their dashboard and in contractor communications."); return; }
    }
    if (step === 2) {
      if (!form.adminName.trim()) { showError("Admin name is required."); return; }
      if (!form.adminEmail.trim()) { showError("Admin email is required."); return; }
      if (!form.adminPhone.trim()) { showError("Admin phone is required for account recovery and urgent notifications."); return; }
      if (!form.adminTitle) { showError("Admin title is required."); return; }
    }
    if (step === 3) {
      if (!payDirect && !payIndirect) { showError("Please select at least one payment method."); return; }
    }
    setStep(step + 1);
  };

  const handleCreate = () => {
    if (!payDirect && !payIndirect) { showError("Please select at least one payment method."); return; }
    startTransition(async () => {
      try {
        // Capture logo bytes NOW before any server actions (File refs can go stale after async boundaries)
        let logoBuf: ArrayBuffer | null = null;
        let logoType = "image/png";
        let logoName = "logo.png";
        if (logoFile) {
          // File is already compressed from handleLogoChange, safe to upload directly
          logoBuf = await logoFile.arrayBuffer();
          logoType = logoFile.type;
          logoName = logoFile.name;
        }

        const result = await createClientOrganization({
          name: form.name, adminEmail: form.adminEmail,
          adminName: form.adminName || undefined, industry: form.industry || undefined,
          companySize: form.companySize || undefined, website: form.website || undefined,
          country: form.country || undefined, address: form.address || undefined,
          adminPhone: form.adminPhone || undefined, adminTitle: form.adminTitle || undefined,
          billingEmail: form.billingEmail || undefined,
          docChecklist: Object.fromEntries(Object.entries(docChecklist).filter(([, v]) => v)),
          paymentMethod,
          vaSeats: externalVACount,
          planType: externalPlan,
          suppressInviteEmail,
          suppressKycEmail,
          skipKyc: !requireVeriff,
          pppInvoice: selectedPrepaidInvoice ? {
            id: selectedPrepaidInvoice.id,
            docNumber: selectedPrepaidInvoice.docNumber,
            txnDate: selectedPrepaidInvoice.txnDate,
            totalAmount: selectedPrepaidInvoice.totalAmount,
            customerName: selectedPrepaidInvoice.customerName,
            status: selectedPrepaidInvoice.status,
          } : null,
        });
        if (result && typeof result === "object" && "error" in result) {
          showError({ title: "Creation failed", message: (result as any).error });
          return;
        }
        setCreatedOrgId(result.organization.id);

        // Track email result
        if (result.emailSent) {
          setCreatedEmailOk(true);
        } else if (result.emailError) {
          setCreatedEmailOk(false);
          setCreatedEmailError(result.emailError);
        }

        // Warn if the admin email is shared with other orgs
        if (result.sharedEmailWarning) {
          showError({ title: "Shared Email Detected", message: result.sharedEmailWarning });
        }

        // Upload logo using captured bytes (not stale File ref)
        if (logoBuf) {
          let uploaded = false;
          for (let attempt = 1; attempt <= 3 && !uploaded; attempt++) {
            try {
              if (attempt > 1) await new Promise((r) => setTimeout(r, 1000 * attempt));
              const freshFile = new File([logoBuf], logoName, { type: logoType });
              const fd = new FormData();
              fd.append("file", freshFile);
              fd.append("orgId", result.organization.id);
              const uploadResult = await uploadOrgLogo(fd);
              if (uploadResult.error) throw new Error(uploadResult.error);
              uploaded = true;
            } catch (logoErr) {
              console.error(`Logo upload attempt ${attempt}/3 failed:`, logoErr);
            }
          }
          if (!uploaded) {
            showError({ title: "Logo upload failed", message: "The organization was created but the logo could not be uploaded. You can add it later from the organization detail page." });
          }
        }

        // Auto-attach prepaid invoice + contract — from QB/JotForm API or manual file upload
        if (externalPrepaid && (selectedPrepaidInvoice || prepaidInvoiceFile || selectedPrepaidContract || prepaidContractFile)) {
          try {
            // Invoice — download from QB API if selected, else use uploaded file
            if (selectedPrepaidInvoice && !prepaidInvoiceUrl) {
              const pdfResult = await downloadQBInvoicePdf(selectedPrepaidInvoice.id);
              if (!("error" in pdfResult)) {
                const bytes = Uint8Array.from(atob(pdfResult.base64), c => c.charCodeAt(0));
                const file = new File([bytes], pdfResult.fileName, { type: "application/pdf" });
                const fd = new FormData(); fd.append("file", file); fd.append("orgId", result.organization.id); fd.append("docType", "paid-invoice");
                const r = await uploadOrgDocument(fd); if (!("error" in r)) setPrepaidInvoiceUrl(r.url);
              }
            } else if (prepaidInvoiceFile && !prepaidInvoiceUrl) {
              const fd = new FormData(); fd.append("file", prepaidInvoiceFile); fd.append("orgId", result.organization.id); fd.append("docType", "paid-invoice");
              const r = await uploadOrgDocument(fd); if (!("error" in r)) setPrepaidInvoiceUrl(r.url);
            }
            // Contract — download from JotForm API if selected, else use uploaded file
            if (selectedPrepaidContract && !prepaidContractUrl) {
              const pdfResult = await downloadJotFormSubmissionPdf(selectedPrepaidContract.submissionId);
              if (!("error" in pdfResult)) {
                const bytes = Uint8Array.from(atob(pdfResult.base64), c => c.charCodeAt(0));
                const file = new File([bytes], pdfResult.fileName, { type: "application/pdf" });
                const fd = new FormData(); fd.append("file", file); fd.append("orgId", result.organization.id); fd.append("docType", "signed-contract");
                const r = await uploadOrgDocument(fd); if (!("error" in r)) setPrepaidContractUrl(r.url);
              }
            } else if (prepaidContractFile && !prepaidContractUrl) {
              const fd = new FormData(); fd.append("file", prepaidContractFile); fd.append("orgId", result.organization.id); fd.append("docType", "signed-contract");
              const r = await uploadOrgDocument(fd); if (!("error" in r)) setPrepaidContractUrl(r.url);
            }
          } catch { /* non-fatal — can re-attach from org detail */ }
        }

        // Auto-send payment link to client after org creation (skip if already paid)
        if (!externalPrepaid && result?.organization?.id && form.adminEmail) {
          try {
            const plan = payDirect && payIndirect ? "both" : payDirect ? "ppp" : "cor";
            const payLinkResult = await createPaymentContractLinkForOrg({
              orgId: result.organization.id,
              orgName: form.name,
              adminEmail: form.adminEmail,
              adminName: form.adminName || undefined,
              plan,
              vaCount: externalVACount || 1,
            });
            if (payLinkResult.emailSent) {
              setCreatedEmailOk(true);
            } else {
              setCreatedEmailOk(false);
              setCreatedEmailError("Payment link created but email failed to send.");
            }
          } catch (err) {
            setCreatedEmailOk(false);
            setCreatedEmailError(err instanceof Error ? err.message : "Failed to create payment link");
          }
        }

        setStep(4);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to create organization.";
        const isMasked = msg.includes("Server Components render") || msg.includes("specific message is omitted");
        showError({
          title: "Creation failed",
          message: isMasked
            ? "Server error creating the organization. Check Vercel logs for details."
            : msg,
          detail: isMasked && err instanceof Error
            ? `Next.js masked the real error in production.\nDigest: ${(err as any).digest ?? "N/A"}\n\nCheck Vercel Runtime Logs for the actual error.`
            : err instanceof Error ? err.stack : undefined,
        });
      }
    });
  };

  const handleFinish = () => {
    const navToOrgId = createdOrgId;
    setShowCreate(false); setStep(1); setForm(emptyForm);
    setDocChecklist({}); setPayDirect(true); setPayIndirect(false); setCreatedOrgId(null);
    setCreatedEmailOk(null); setCreatedEmailError(null);
    setLogoFile(null); setLogoPreview(null);
    setStripeSent(false); setStripeSending(false);
    setSuppressInviteEmail(false);
    setSelectedInvoice(null); setInvoiceSkipped(false); setInvoiceSearch(""); setInvoiceResults([]); setInvoiceError(null);
    setPaymentLinkSent(false); setPaymentLinkSending(false); setPaymentLinkUrl(null);
    setWizardMode(null);
    router.refresh();
    // Navigate to the newly created org detail page
    if (navToOrgId) {
      router.push(`/${orgSlug}/organizations/${navToOrgId}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">Client Organizations</h2>
          <div className="flex rounded-lg border bg-muted/30 p-0.5">
            <button type="button" onClick={() => setActiveTab("orgs")} className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${activeTab === "orgs" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>Organizations ({organizations.length})</button>
            <button type="button" onClick={() => setActiveTab("pipeline")} className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${activeTab === "pipeline" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>Pipeline</button>
          </div>
        </div>
        <div className="flex items-center gap-2"><button type="button" onClick={() => { setShowExternalTracker(true); startTransition(async () => { try { const s = await getExternalOnboardingSessions(); if (!("error" in s)) setExternalSessions(serialize(s)); } catch {} }); }} className="h-9 rounded-md border px-3 text-sm font-medium hover:bg-muted">Onboarding Links</button><button type="button" onClick={() => { setShowCreate(true); setWizardMode(null); }} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">+ New Organization</button></div>
      </div>

      {activeTab === "pipeline" && <ClientPipeline />}

      {activeTab === "orgs" && (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {organizations.map((org) => {
          const kycStatus = org.profile?.kycStatus || "pending";
          const kycConfig = KYC_STATUS_CONFIG[kycStatus] || KYC_STATUS_CONFIG.pending;
          return (
            <div key={org.id} className="rounded-xl border bg-card p-5 transition-colors hover:bg-muted/50 relative group">
              <Link href={`/${orgSlug}/organizations/${org.id}`} className="block">
              <div className="flex items-center gap-3">
                {org.logoUrl ? (
                  <Image src={org.logoUrl} alt={org.name} width={40} height={40} className="h-10 w-10 rounded-lg object-cover" />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">{org.name.charAt(0)}</div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold">{org.name}</h3>
                  <p className="text-xs text-muted-foreground truncate">{org.profile?.industry || org.slug}</p>
                </div>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${kycConfig.bg} ${kycConfig.color}`}>{kycConfig.label}</span>
              </div>
              <div className="mt-3 flex gap-4 text-sm">
                <span><strong>{org._count.members}</strong> {org._count.members === 1 ? "member" : "members"}</span>
                <span><strong>{org._count.employees}</strong> {org._count.employees === 1 ? "contractor" : "contractors"}</span>
              </div>
              {org.profile?.vaSeats != null && (
                <div className="mt-2 flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    org._count.employees >= org.profile.vaSeats
                      ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                      : org._count.employees >= org.profile.vaSeats - 1
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                      : "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                  }`}>
                    {org._count.employees}/{org.profile.vaSeats} VA seats
                    {org.profile.planType ? ` · ${org.profile.planType.toUpperCase()}` : ""}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setEditingSeats({ orgId: org.id, orgName: org.name, current: org.profile?.vaSeats ?? null, plan: org.profile?.planType ?? null });
                      setEditSeatCount(String(org.profile?.vaSeats ?? ""));
                    }}
                    className="text-[10px] text-muted-foreground underline hover:text-foreground"
                  >
                    Edit
                  </button>
                </div>
              )}
              {org.profile?.vaSeats == null && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setEditingSeats({ orgId: org.id, orgName: org.name, current: null, plan: null });
                    setEditSeatCount("");
                  }}
                  className="mt-2 text-[10px] text-muted-foreground underline hover:text-foreground"
                >
                  + Set VA seats
                </button>
              )}
              <p className="mt-2 text-xs text-muted-foreground">Created {shortDate(org.createdAt as any)}</p>
              </Link>
              {/* Actions button */}
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setActionsOrg(org);
                  setActionsMsg(null);
                  setPayLinkUrl(null);
                  setPayLinkCopied(false);
                  setManualApproveOpen(false);
                  setManualApproveName(org.profile?.adminName || "");
                }}
                className="absolute top-4 right-4 flex h-7 w-7 items-center justify-center rounded-md border border-transparent bg-transparent text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted hover:border-border transition-all"
                title="Actions"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="5" r="1.5" fill="currentColor" stroke="none" />
                  <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
                  <circle cx="12" cy="19" r="1.5" fill="currentColor" stroke="none" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
      )}

      {/* ── Org Actions Panel ─────────────────────────────────────────── */}
      {actionsOrg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in duration-150">
          <div className="w-full max-w-sm rounded-xl border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div className="flex items-center gap-3">
                {actionsOrg.logoUrl ? (
                  <Image src={actionsOrg.logoUrl} alt={actionsOrg.name} width={32} height={32} className="h-8 w-8 rounded-lg object-cover" />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">{actionsOrg.name.charAt(0)}</div>
                )}
                <div>
                  <p className="font-semibold text-sm">{actionsOrg.name}</p>
                  <p className="text-xs text-muted-foreground">{actionsOrg.profile?.adminEmail || "No admin email"}</p>
                </div>
              </div>
              <button type="button" onClick={() => setActionsOrg(null)} className="rounded-md p-1 text-muted-foreground hover:bg-muted">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Feedback message */}
            {actionsMsg && (
              <div className={`mx-5 mt-4 rounded-lg px-3 py-2 text-sm ${actionsMsg.type === "ok" ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300" : "bg-destructive/10 text-destructive"}`}>
                {actionsMsg.text}
              </div>
            )}

            <div className="p-5 space-y-5">
              {/* Dashboard invite */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Dashboard Access</p>
                <button
                  type="button"
                  disabled={actionsLoading === "invite"}
                  onClick={() => {
                    setActionsLoading("invite");
                    setActionsMsg(null);
                    resendOrgAdminDashboardInvite(actionsOrg.id).then((r) => {
                      if ("error" in r && r.error) setActionsMsg({ type: "err", text: r.error });
                      else setActionsMsg({ type: "ok", text: "Dashboard invite email sent." });
                    }).catch(() => setActionsMsg({ type: "err", text: "Failed to send invite." }))
                    .finally(() => setActionsLoading(null));
                  }}
                  className="w-full flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
                >
                  <svg className="h-4 w-4 shrink-0 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                  {actionsLoading === "invite" ? "Sending…" : "Send Dashboard Invite Email"}
                </button>
              </div>

              {/* Payment link */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Billing</p>
                {payLinkUrl ? (
                  <div className="space-y-2">
                    <div className="rounded-lg border bg-muted/50 p-2">
                      <code className="text-[11px] break-all select-all">{payLinkUrl}</code>
                    </div>
                    <button
                      type="button"
                      onClick={() => { navigator.clipboard.writeText(payLinkUrl); setPayLinkCopied(true); setTimeout(() => setPayLinkCopied(false), 2000); }}
                      className="w-full rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted"
                    >
                      {payLinkCopied ? "Copied!" : "Copy Payment Link"}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={payLinkSending}
                    onClick={() => {
                      setPayLinkSending(true);
                      setActionsMsg(null);
                      const profile = actionsOrg.profile;
                      const plan = (profile?.paymentMethod || "ppp") as "ppp" | "cor" | "both";
                      createPaymentContractLinkForOrg({
                        orgId: actionsOrg.id,
                        orgName: actionsOrg.name,
                        adminEmail: profile?.adminEmail || "",
                        adminName: profile?.adminName || undefined,
                        plan,
                        vaCount: profile?.vaSeats || 1,
                      }).then((r) => {
                        if ("error" in r && (r as any).error) setActionsMsg({ type: "err", text: (r as any).error });
                        else { setPayLinkUrl((r as any).url || null); setActionsMsg({ type: "ok", text: (r as any).emailSent ? "Payment link created and emailed." : "Payment link created." }); }
                      }).catch(() => setActionsMsg({ type: "err", text: "Failed to create payment link." }))
                      .finally(() => setPayLinkSending(false));
                    }}
                    className="w-full flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
                  >
                    <svg className="h-4 w-4 shrink-0 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
                    {payLinkSending ? "Creating…" : "Send Payment Link"}
                  </button>
                )}
              </div>

              {/* Identity Verification (KYC) */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Identity Verification (KYC)</p>
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Status</span>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${(KYC_STATUS_CONFIG[actionsOrg.profile?.kycStatus || "pending"] || KYC_STATUS_CONFIG.pending).bg} ${(KYC_STATUS_CONFIG[actionsOrg.profile?.kycStatus || "pending"] || KYC_STATUS_CONFIG.pending).color}`}>
                      {(KYC_STATUS_CONFIG[actionsOrg.profile?.kycStatus || "pending"] || KYC_STATUS_CONFIG.pending).label}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Admin Email</span>
                    <span className="text-xs font-medium truncate max-w-[180px]">{actionsOrg.profile?.adminEmail || "—"}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={actionsLoading === "kyc-email"}
                    onClick={() => {
                      setActionsLoading("kyc-email");
                      setActionsMsg(null);
                      (actionsOrg.profile?.kycStatus && actionsOrg.profile.kycStatus !== "pending"
                        ? resendClientKycEmail(actionsOrg.id)
                        : initiateClientKyc(actionsOrg.id)
                      ).then((r: any) => {
                        if (r?.error) setActionsMsg({ type: "err", text: r.error });
                        else setActionsMsg({ type: "ok", text: "Verification email sent." });
                      }).catch(() => setActionsMsg({ type: "err", text: "Failed to send verification email." }))
                      .finally(() => setActionsLoading(null));
                    }}
                    className="flex-1 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                  >
                    {actionsLoading === "kyc-email" ? "Sending…" : "Send Verification Email"}
                  </button>
                  {!manualApproveOpen ? (
                    <button
                      type="button"
                      onClick={() => setManualApproveOpen(true)}
                      className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted"
                    >
                      Manual Approve
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={actionsLoading === "kyc-approve"}
                      onClick={() => {
                        setActionsLoading("kyc-approve");
                        setActionsMsg(null);
                        manualKycApproval(actionsOrg.id, { verifiedName: manualApproveName || actionsOrg.profile?.adminName || "Admin", notes: "Manually approved by super admin" })
                          .then((r: any) => {
                            if (r?.error) setActionsMsg({ type: "err", text: r.error });
                            else { setActionsMsg({ type: "ok", text: "KYC manually approved." }); setManualApproveOpen(false); router.refresh(); }
                          }).catch(() => setActionsMsg({ type: "err", text: "Approval failed." }))
                          .finally(() => setActionsLoading(null));
                      }}
                      className="rounded-lg border border-green-500 bg-green-50 px-3 py-2 text-sm font-medium text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-300 disabled:opacity-50"
                    >
                      {actionsLoading === "kyc-approve" ? "Approving…" : "Confirm Approve"}
                    </button>
                  )}
                </div>
                {manualApproveOpen && (
                  <input
                    type="text"
                    value={manualApproveName}
                    onChange={(e) => setManualApproveName(e.target.value)}
                    placeholder="Verified name (optional)"
                    className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {organizations.length === 0 && <div className="py-12 text-center text-muted-foreground">No organizations yet. Create one to get started.</div>}

      {showCreate && wizardMode === null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in duration-150">
          <div className="w-full max-w-lg rounded-xl border bg-card p-6 shadow-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-1">Add Client Organization</h2>
            <p className="text-sm text-muted-foreground mb-5">Choose your plan, payment status, and how you want to set up this client.</p>

            {/* Step 1: Plan & VAs */}
            <div className="space-y-3 mb-5">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Plan Details</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">How many VAs?</label>
                  <input type="text" inputMode="numeric" pattern="[0-9]*" value={externalVAInput} onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ""); setExternalVAInput(v); const n = parseInt(v); if (n > 0 && n <= 100) setExternalVACount(n); }} onBlur={() => { if (!externalVAInput || parseInt(externalVAInput) < 1) { setExternalVAInput("1"); setExternalVACount(1); } else if (parseInt(externalVAInput) > 100) { setExternalVAInput("100"); setExternalVACount(100); } }} className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Service plan</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(["ppp", "cor", "both"] as const).map((p) => (
                      <button key={p} type="button" onClick={() => setExternalPlan(p)}
                        className={`rounded-md border px-2 py-2 text-xs font-medium transition-colors ${externalPlan === p ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent"}`}>
                        {p === "ppp" ? "PPP" : p === "cor" ? "COR" : "Both"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="rounded-md bg-muted/50 border p-3 flex justify-between items-center">
                <span className="text-sm text-muted-foreground">{externalVACount} VA{externalVACount !== 1 ? "s" : ""} × {externalPlan === "ppp" ? "$3,000" : externalPlan === "cor" ? "$4,200" : "$7,200"}/yr</span>
                <span className="text-lg font-bold">${((externalPlan === "ppp" ? 3000 : externalPlan === "cor" ? 4200 : 7200) * externalVACount).toLocaleString()}/yr</span>
              </div>
            </div>

            {/* Step 2: Payment status */}
            <div className="space-y-2 mb-5">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Payment Status</div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => { setExternalPrepaid(true); setSuppressInviteEmail(false); }}
                  className={`text-left rounded-xl border-2 p-3 transition-all ${externalPrepaid ? "border-green-500 bg-green-50 dark:bg-green-950/20" : "border-transparent hover:border-muted-foreground/20 hover:bg-muted/50"}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <svg className={`h-4 w-4 ${externalPrepaid ? "text-green-600" : "text-muted-foreground"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <span className="text-sm font-semibold">Already Paid</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Invoice matched and contract signed. Skip payment in onboarding.</p>
                </button>
                <button type="button" onClick={() => { setExternalPrepaid(false); setSuppressInviteEmail(true); }}
                  className={`text-left rounded-xl border-2 p-3 transition-all ${!externalPrepaid ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20" : "border-transparent hover:border-muted-foreground/20 hover:bg-muted/50"}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <svg className={`h-4 w-4 ${!externalPrepaid ? "text-blue-600" : "text-muted-foreground"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" /></svg>
                    <span className="text-sm font-semibold">Not Yet Paid</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Payment will be collected during onboarding via Stripe.</p>
                </button>
              </div>
            </div>

            {/* QB Invoice + JotForm Contract lookup — shown when Already Paid is selected */}
            {externalPrepaid && (
              <div className="space-y-3 mb-5">
                {/* QB Invoice Search */}
                <div className="rounded-lg border border-violet-200 bg-violet-50 dark:border-violet-800 dark:bg-violet-950/20 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <svg className="h-4 w-4 text-violet-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <span className="text-sm font-semibold text-violet-900 dark:text-violet-100">Find Paid Invoice in QuickBooks</span>
                  </div>
                  {selectedPrepaidInvoice ? (
                    <div className="flex items-center justify-between rounded-md border bg-white dark:bg-background px-3 py-2">
                      <div>
                        <span className="text-sm font-medium">{selectedPrepaidInvoice.customerName ?? "Invoice"}</span>
                        <span className="ml-2 text-xs text-muted-foreground">#{selectedPrepaidInvoice.docNumber} · ${selectedPrepaidInvoice.totalAmount.toLocaleString()} · {selectedPrepaidInvoice.txnDate}</span>
                        <span className="ml-2 inline-flex items-center rounded-full bg-green-100 dark:bg-green-900/40 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:text-green-300">Paid</span>
                      </div>
                      <button type="button" onClick={() => { setSelectedPrepaidInvoice(null); setPrepaidInvoiceFile(null); }} className="text-xs text-muted-foreground hover:text-destructive">Change</button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input
                          value={prepaidQBSearch}
                          onChange={(e) => setPrepaidQBSearch(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setPrepaidQBSearching(true); setPrepaidQBError(null); setPrepaidQBSearched(false); searchQBInvoices(prepaidQBSearch).then(r => { setPrepaidQBResults(r.invoices); setPrepaidQBSearched(true); if (r.error) setPrepaidQBError(r.error); }).finally(() => setPrepaidQBSearching(false)); } }}
                          placeholder="Search by QB customer name or invoice #..."
                          className="flex-1 h-8 rounded-md border border-input bg-background px-3 text-sm"
                        />
                        <button
                          type="button"
                          disabled={prepaidQBSearching}
                          onClick={() => { setPrepaidQBSearching(true); setPrepaidQBError(null); setPrepaidQBSearched(false); searchQBInvoices(prepaidQBSearch).then(r => { setPrepaidQBResults(r.invoices); setPrepaidQBSearched(true); if (r.error) setPrepaidQBError(r.error); }).finally(() => setPrepaidQBSearching(false)); }}
                          className="h-8 rounded-md bg-violet-600 px-3 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50"
                        >
                          {prepaidQBSearching ? <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg> : "Search"}
                        </button>
                        <button
                          type="button"
                          disabled={prepaidQBSearching}
                          onClick={() => { setPrepaidQBSearching(true); setPrepaidQBError(null); setPrepaidQBSearch(""); setPrepaidQBSearched(false); searchQBInvoices("").then(r => { setPrepaidQBResults(r.invoices); setPrepaidQBSearched(true); if (r.error) setPrepaidQBError(r.error); }).finally(() => setPrepaidQBSearching(false)); }}
                          className="h-8 rounded-md border border-violet-300 px-3 text-xs font-medium text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/30 disabled:opacity-50"
                        >
                          Browse recent
                        </button>
                      </div>
                      <p className="text-[11px] text-muted-foreground">Search uses the QB customer display name, e.g. "David Choi" or "Acme Corp"</p>
                      {prepaidQBError && <p className="text-xs text-destructive">{prepaidQBError}</p>}
                      {prepaidQBSearched && !prepaidQBSearching && prepaidQBResults.length === 0 && !prepaidQBError && (
                        <p className="text-xs text-muted-foreground italic">No invoices found{prepaidQBSearch ? ` for "${prepaidQBSearch}"` : ""}. Try a different name or use "Browse recent".</p>
                      )}
                      {prepaidQBResults.length > 0 && (
                        <div className="max-h-48 overflow-y-auto rounded-md border divide-y bg-white dark:bg-background">
                          {prepaidQBResults.map((inv) => (
                            <button key={inv.id} type="button"
                              onClick={() => { setSelectedPrepaidInvoice(inv); setPrepaidQBResults([]); setPrepaidQBSearched(false); }}
                              className="w-full text-left px-3 py-2 hover:bg-muted/50 flex items-center justify-between gap-2"
                            >
                              <div>
                                <span className="text-sm font-medium">{inv.customerName ?? "—"}</span>
                                <span className="ml-2 text-xs text-muted-foreground">#{inv.docNumber} · ${inv.totalAmount.toLocaleString()} · {inv.txnDate}</span>
                              </div>
                              <span className={`shrink-0 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${inv.status === "paid" ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"}`}>{inv.status}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      <p className="text-[11px] text-violet-600 dark:text-violet-400">Or upload PDF manually:</p>
                      {prepaidInvoiceFile ? (
                        <div className="flex items-center gap-1.5 rounded-md border bg-white dark:bg-background px-2.5 py-2">
                          <svg className="h-3.5 w-3.5 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                          <span className="text-[11px] truncate">{prepaidInvoiceFile.name}</span>
                          <button type="button" onClick={() => setPrepaidInvoiceFile(null)} className="ml-auto text-[10px] text-muted-foreground hover:text-destructive">✕</button>
                        </div>
                      ) : (
                        <label className="flex items-center gap-2 rounded-md border-2 border-dashed p-2 cursor-pointer hover:border-violet-400 transition-colors">
                          <svg className="h-4 w-4 text-muted-foreground shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                          <span className="text-[11px] text-muted-foreground">Upload invoice PDF</span>
                          <input type="file" accept=".pdf,application/pdf" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setPrepaidInvoiceFile(f); setSelectedPrepaidInvoice(null); } }} />
                        </label>
                      )}
                    </div>
                  )}
                </div>

                {/* JotForm Contract Search */}
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <svg className="h-4 w-4 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                    <span className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">Find Signed Contract in JotForm</span>
                  </div>
                  {selectedPrepaidContract ? (
                    <div className="flex items-center justify-between rounded-md border bg-white dark:bg-background px-3 py-2">
                      <div>
                        <span className="text-sm font-medium">{selectedPrepaidContract.signerName ?? selectedPrepaidContract.companyName ?? "Contract"}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{selectedPrepaidContract.formTitle} · {selectedPrepaidContract.submittedAt ? shortDate(selectedPrepaidContract.submittedAt) : ""}</span>
                        <span className="ml-2 inline-flex items-center rounded-full bg-green-100 dark:bg-green-900/40 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:text-green-300">Signed</span>
                      </div>
                      <button type="button" onClick={() => { setSelectedPrepaidContract(null); setPrepaidContractFile(null); }} className="text-xs text-muted-foreground hover:text-destructive">Change</button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input
                          value={prepaidJFSearch}
                          onChange={(e) => setPrepaidJFSearch(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setPrepaidJFSearching(true); setPrepaidJFError(null); searchJotFormContracts(prepaidJFSearch).then(r => { setPrepaidJFResults(r.submissions); if (r.error) setPrepaidJFError(r.error); }).finally(() => setPrepaidJFSearching(false)); } }}
                          placeholder="Search by company or signer name..."
                          className="flex-1 h-8 rounded-md border border-input bg-background px-3 text-sm"
                        />
                        <button
                          type="button"
                          disabled={prepaidJFSearching}
                          onClick={() => { setPrepaidJFSearching(true); setPrepaidJFError(null); searchJotFormContracts(prepaidJFSearch).then(r => { setPrepaidJFResults(r.submissions); if (r.error) setPrepaidJFError(r.error); }).finally(() => setPrepaidJFSearching(false)); }}
                          className="h-8 rounded-md bg-emerald-600 px-3 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {prepaidJFSearching ? "..." : "Search"}
                        </button>
                      </div>
                      {prepaidJFError && <p className="text-xs text-destructive">{prepaidJFError}</p>}
                      {prepaidJFResults.length > 0 && (
                        <div className="max-h-40 overflow-y-auto rounded-md border divide-y bg-white dark:bg-background">
                          {prepaidJFResults.map((sub) => (
                            <button key={sub.submissionId} type="button"
                              onClick={() => { setSelectedPrepaidContract(sub); setPrepaidJFResults([]); }}
                              className="w-full text-left px-3 py-2 hover:bg-muted/50"
                            >
                              <span className="text-sm font-medium">{sub.signerName ?? sub.companyName ?? "Submission"}</span>
                              <span className="ml-2 text-xs text-muted-foreground">{sub.formTitle} · {sub.submittedAt ? shortDate(sub.submittedAt) : ""}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-400">Or upload PDF manually:</p>
                      {prepaidContractFile ? (
                        <div className="flex items-center gap-1.5 rounded-md border bg-white dark:bg-background px-2.5 py-2">
                          <svg className="h-3.5 w-3.5 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                          <span className="text-[11px] truncate">{prepaidContractFile.name}</span>
                          <button type="button" onClick={() => setPrepaidContractFile(null)} className="ml-auto text-[10px] text-muted-foreground hover:text-destructive">✕</button>
                        </div>
                      ) : (
                        <label className="flex items-center gap-2 rounded-md border-2 border-dashed p-2 cursor-pointer hover:border-emerald-400 transition-colors">
                          <svg className="h-4 w-4 text-muted-foreground shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                          <span className="text-[11px] text-muted-foreground">Upload contract PDF</span>
                          <input type="file" accept=".pdf,application/pdf" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setPrepaidContractFile(f); setSelectedPrepaidContract(null); } }} />
                        </label>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Step 3: Setup method */}
            <div className="space-y-2 mb-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Setup Method</div>
              <div className="space-y-2">
                <button type="button" onClick={() => { setWizardMode("internal"); setStep(1); }} className="w-full text-left rounded-xl border-2 border-transparent hover:border-primary p-3 transition-all hover:bg-muted/50">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    </div>
                    <div>
                      <span className="font-semibold text-sm">Manual Setup</span>
                      <p className="text-xs text-muted-foreground mt-0.5">{externalPrepaid ? "Fill in client details and complete setup now." : "Enter client details yourself, then send them a payment and contract link."}</p>
                    </div>
                  </div>
                </button>
                <button type="button" onClick={() => { setWizardMode("external"); setExternalLink(""); setExternalName(""); setExternalEmail(""); setExternalContactName(""); setEmailSentTo(null); }} className="w-full text-left rounded-xl border-2 border-transparent hover:border-primary p-3 transition-all hover:bg-muted/50">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" /></svg>
                    </div>
                    <div>
                      <span className="font-semibold text-sm">Send Onboarding Link</span>
                      <p className="text-xs text-muted-foreground mt-0.5">{externalPrepaid ? "Client fills in their info. Payment step is skipped." : "Client fills in their info and pays via Stripe at the end."}</p>
                    </div>
                  </div>
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <button type="button" onClick={() => { setShowCreate(false); setWizardMode(null); }} className="text-sm text-muted-foreground hover:text-foreground">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* External link generator */}
      {showCreate && wizardMode === "external" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-200" onClick={(e) => e.stopPropagation()}>
            {!externalLink ? (
              <>
                <h2 className="text-lg font-semibold mb-1">Generate Onboarding Link</h2>
                <p className="text-sm text-muted-foreground mb-2">
                  {externalPlan === "ppp" ? "PPP" : externalPlan === "cor" ? "COR" : "PPP + COR"} plan, {externalVACount} VA{externalVACount !== 1 ? "s" : ""} — {externalPrepaid ? "payment already collected" : "client pays via Stripe during onboarding"}
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Company Name</label>
                    <input type="text" value={externalName} onChange={(e) => setExternalName(e.target.value)} placeholder="Acme Corp" className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Contact Name</label>
                    <input type="text" value={externalContactName} onChange={(e) => setExternalContactName(e.target.value)} placeholder="Jane Smith" className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Contact Email</label>
                    <input type="email" value={externalEmail} onChange={(e) => setExternalEmail(e.target.value)} placeholder="admin@acme.com" className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary" />
                    <p className="mt-1 text-xs text-muted-foreground">If provided, we'll email the onboarding link directly.</p>
                  </div>
                </div>
                <div className="mt-5 flex justify-end gap-2">
                  <button type="button" onClick={() => { setShowCreate(false); setWizardMode(null); }} className="rounded-md border px-4 py-2 text-sm">Cancel</button>
                  <button type="button" disabled={isPending} onClick={() => { startTransition(async () => { try { const result = await createExternalOnboardingSession({ companyName: externalName || undefined, contactEmail: externalEmail || undefined, contactName: externalContactName || undefined, prepaid: externalPrepaid, vaCount: externalVACount, plan: externalPlan }); if ("error" in result) { showError((result as any).error ?? "Failed to create link"); return; } setExternalLink((result as any).url); setEmailSentTo((result as any).emailSent ? (result as any).emailTo : null); } catch (e) { showError(e instanceof Error ? e.message : "Failed to create link"); } }); }} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                    {isPending ? "Creating..." : "Generate Link"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30 text-green-600">
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" /></svg>
                  </div>
                  <h2 className="text-lg font-semibold mb-1">Link Ready!</h2>
                  <p className="text-sm text-muted-foreground mb-3">Share this link with the client. They'll complete the onboarding form at their own pace.</p>
                  {emailSentTo && (
                    <div className="mb-4 rounded-lg border border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800 px-3 py-2 text-xs text-green-700 dark:text-green-300 flex items-center gap-2">
                      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                      <span>Email sent to <strong>{emailSentTo}</strong></span>
                    </div>
                  )}
                </div>
                <div className="rounded-lg border bg-muted/50 p-3">
                  <code className="text-xs break-all select-all">{externalLink}</code>
                </div>
                <div className="mt-3 flex justify-center gap-2">
                  <button type="button" onClick={() => { navigator.clipboard.writeText(externalLink); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); }} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                    {linkCopied ? "Copied!" : "Copy Link"}
                  </button>
                </div>
                <div className="mt-4 flex justify-end">
                  <button type="button" onClick={() => { setShowCreate(false); setWizardMode(null); setExternalLink(""); setExternalContactName(""); setEmailSentTo(null); router.refresh(); }} className="text-sm text-muted-foreground hover:text-foreground">Done</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* External sessions tracker dialog */}
      {showExternalTracker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in duration-150">
          <div className="w-full max-w-2xl rounded-xl border bg-card p-6 shadow-lg max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Client Onboarding Links</h2>
              <button type="button" onClick={() => setShowExternalTracker(false)} className="text-muted-foreground hover:text-foreground text-sm">Close</button>
            </div>
            {externalSessions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No external onboarding links created yet.</p>
            ) : (
              <div className="space-y-3">
                {externalSessions.map((s: any) => {
                  const progress = Math.round(((s.currentStep - 1) / s.totalSteps) * 100);
                  const statusColors: Record<string, string> = {
                    draft: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
                    in_progress: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
                    completed: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
                  };
                  const stepLabels = ["", "Company Info", "Contact Details", "Payment Method", "Extra Info", "Agreement", "Review & Submit", "Payment"];
                  const currentLabel = stepLabels[Math.min(s.currentStep, s.totalSteps)] || "";
                  return (
                    <div key={s.id} className="rounded-lg border p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <span className="font-semibold">{s.companyName || "Unnamed"}</span>
                          {s.contactEmail && <span className="text-xs text-muted-foreground ml-2">{s.contactEmail}</span>}
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${statusColors[s.status] || statusColors.draft}`}>{s.status.replace("_", " ")}</span>
                      </div>
                      {/* Step-by-step progress dots */}
                      <div className="flex items-center gap-1.5 mb-2">
                        {stepLabels.slice(1).map((label, i) => {
                          const stepNum = i + 1;
                          const done = s.currentStep > stepNum || s.status === "completed";
                          const active = s.currentStep === stepNum && s.status !== "completed";
                          return (
                            <div key={label} className="flex-1" title={label}>
                              <div className={`h-1.5 rounded-full transition-all ${done ? "bg-green-500" : active ? "bg-blue-500" : "bg-muted"}`} />
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          {s.status === "completed" ? (
                            <span className="text-green-600 dark:text-green-400 font-medium">Completed</span>
                          ) : s.status === "draft" ? (
                            "Not started yet"
                          ) : (
                            <>Step {s.currentStep} of {s.totalSteps} &mdash; <span className="font-medium text-foreground">{currentLabel}</span></>
                          )}
                        </span>
                        <span>Expires {shortDate(s.expiresAt as any)}</span>
                      </div>
                      {/* Filled data preview */}
                      {s.status !== "draft" && s.status !== "completed" && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {s.companyName && <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px]">Company: {s.companyName}</span>}
                          {s.contactName && <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px]">Contact: {s.contactName}</span>}
                          {s.paymentMethod && <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px]">Pay: {s.paymentMethod.replace("_", " ")}</span>}
                        </div>
                      )}
                      {/* Action buttons */}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {s.status === "completed" && !s.organizationId && (
                          <>
                            <button type="button" disabled={isPending} onClick={() => { startTransition(async () => { try { const result = await convertOnboardingToOrg(s.id); if (result.error) { showError(result.error ?? "An error occurred"); return; } const refreshed = await getExternalOnboardingSessions(); if (!("error" in refreshed)) setExternalSessions(serialize(refreshed)); router.refresh(); } catch (e) { showError(e instanceof Error ? e.message : "Failed"); } }); }} className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50">
                              {isPending ? "Creating..." : "Create Organization"}
                            </button>
                            <button type="button" disabled={isPending} onClick={() => { startTransition(async () => { await expireOnboardingSession(s.id); const refreshed = await getExternalOnboardingSessions(); if (!("error" in refreshed)) setExternalSessions(serialize(refreshed)); }); }} className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted">Dismiss</button>
                          </>
                        )}
                        {s.contactEmail && s.status !== "completed" && !s.organizationId && (
                          <button type="button" disabled={isPending} onClick={() => { startTransition(async () => { try { const r = await resendOnboardingLinkEmail(s.id); if (r.error) { showError(r.error); } } catch (e) { showError(e instanceof Error ? e.message : "Failed to resend"); } }); }} className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted flex items-center gap-1">
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                            Resend Email
                          </button>
                        )}
                        {s.status !== "completed" && !s.organizationId && (
                          <button type="button" disabled={isPending} onClick={() => { startTransition(async () => { await expireOnboardingSession(s.id); const refreshed = await getExternalOnboardingSessions(); if (!("error" in refreshed)) setExternalSessions(serialize(refreshed)); }); }} className="rounded-md border border-red-200 dark:border-red-800 px-3 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20">Expire</button>
                        )}
                      </div>
                      {s.organizationId && s.organization && (
                        <div className="mt-2 text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-1">
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                          Organization created: {s.organization.name}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {showCreate && (wizardMode === "internal") && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in duration-150">
          <div className="w-full max-w-2xl rounded-xl border bg-card p-6 shadow-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="mb-6">
              <div className="flex items-center justify-between">
                {[{ n: 1, label: "Company" }, { n: 2, label: "Contact" }, { n: 3, label: "Pay Method" }, { n: 4, label: "Done" }].map((s) => (
                  <div key={s.n} className="flex flex-1 items-center">
                    <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${step > s.n ? "bg-primary text-primary-foreground" : step === s.n ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{step > s.n ? "✓" : s.n}</div>
                    <span className={`ml-1.5 text-xs hidden sm:block ${step >= s.n ? "font-medium" : "text-muted-foreground"}`}>{s.label}</span>
                    {s.n < TOTAL_STEPS && <div className={`mx-2 h-px flex-1 ${step > s.n ? "bg-primary" : "bg-muted"}`} />}
                  </div>
                ))}
              </div>
            </div>

            <div>
              {step === 1 && (
                <div className="space-y-4">
                  <h2 className="text-lg font-semibold">Company Information</h2>

                  {/* Logo Upload */}
                  <div>
                    <label className="text-sm font-medium">Company Logo *</label>
                    <div className="mt-1 flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => logoInputRef.current?.click()}
                        className="flex h-12 w-12 items-center justify-center rounded-lg border-2 border-dashed hover:border-primary hover:bg-muted/30 transition-colors overflow-hidden shrink-0"
                      >
                        {logoPreview ? (
                          <img src={logoPreview} alt="Logo preview" className="h-full w-full object-cover" />
                        ) : (
                          <svg className="h-5 w-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                        )}
                      </button>
                      <div>
                        {logoFile ? (
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-green-600">{logoFile.name}</span>
                            <button type="button" onClick={() => { setLogoFile(null); setLogoPreview(null); if (logoInputRef.current) logoInputRef.current.value = ""; }} className="text-xs text-red-500 hover:underline">Remove</button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">PNG, SVG, JPG, or WEBP -- max 5 MB</span>
                        )}
                      </div>
                    </div>
                    <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
                  </div>

                  <div>
                    <label className="text-sm font-medium">Company Name *</label>
                    <input value={form.name} onChange={(e) => updateForm("name", e.target.value)} placeholder="Acme Corporation" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium">Industry *</label>
                      <CustomSelect value={form.industry} onValueChange={(v) => updateForm("industry", v)} placeholder="Select..." triggerClassName="mt-1 h-10 w-full" options={[
                        { value: "technology", label: "Technology" }, { value: "healthcare", label: "Healthcare" }, { value: "finance", label: "Finance" },
                        { value: "ecommerce", label: "E-Commerce" }, { value: "real_estate", label: "Real Estate" }, { value: "marketing", label: "Marketing" },
                        { value: "consulting", label: "Consulting" }, { value: "education", label: "Education" }, { value: "legal", label: "Legal" },
                        { value: "manufacturing", label: "Manufacturing" }, { value: "nonprofit", label: "Non-Profit" }, { value: "other", label: "Other" },
                      ]} />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Company Size *</label>
                      <CustomSelect value={form.companySize} onValueChange={(v) => updateForm("companySize", v)} placeholder="Select..." triggerClassName="mt-1 h-10 w-full" options={[
                        { value: "1-10", label: "1-10 employees" }, { value: "11-50", label: "11-50 employees" }, { value: "51-200", label: "51-200 employees" },
                        { value: "201-500", label: "201-500 employees" }, { value: "500+", label: "500+ employees" },
                      ]} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="text-sm font-medium">Website</label><input value={form.website} onChange={(e) => updateForm("website", e.target.value)} placeholder="https://acme.com" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" /></div>
                    <div>
                      <label className="text-sm font-medium">Country *</label>
                      <SearchableSelect value={form.country} onValueChange={(v) => updateForm("country", v)} placeholder="Select country..." triggerClassName="mt-1 h-10 w-full" options={[...COUNTRY_OPTIONS]} />
                    </div>
                  </div>
                  <div><label className="text-sm font-medium">Business Address <span className="text-destructive">*</span></label><input value={form.address} onChange={(e) => updateForm("address", e.target.value)} placeholder="123 Main St, Suite 100, City, State, ZIP" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" /></div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <h2 className="text-lg font-semibold">Primary Contact & Admin</h2>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="text-sm font-medium">Admin Name *</label><input value={form.adminName} onChange={(e) => updateForm("adminName", e.target.value)} placeholder="John Smith" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" /></div>
                    <div><label className="text-sm font-medium">Admin Email *</label><input value={form.adminEmail} onChange={(e) => updateForm("adminEmail", e.target.value)} type="email" placeholder="john@acme.com" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="text-sm font-medium">Admin Phone *</label><input value={form.adminPhone} onChange={(e) => updateForm("adminPhone", e.target.value)} placeholder="+1 (555) 123-4567" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" /></div>
                    <div>
                      <label className="text-sm font-medium">Admin Title *</label>
                      <CustomSelectWithOther value={form.adminTitle} onValueChange={(v) => updateForm("adminTitle", v)} placeholder="Select title..." triggerClassName="mt-1 h-10 w-full" baseOptions={ADMIN_TITLE_OPTIONS} category="job_title" />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Billing Email</label>
                    <p className="text-xs text-muted-foreground">Only if invoices should go to a different address than the admin.</p>
                    <input value={form.billingEmail} onChange={(e) => updateForm("billingEmail", e.target.value)} type="email" placeholder="billing@acme.com (optional)" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-lg font-semibold">Payment Method</h2>
                    <p className="text-sm text-muted-foreground mt-0.5">How will this client pay their contractors?</p>
                  </div>

                  <div className="space-y-2">
                    {/* PPP */}
                    <label className={`flex items-center gap-3 rounded-lg border-2 px-4 py-3 cursor-pointer transition-colors ${payDirect && !payIndirect ? "border-[#00B0BB] bg-[#00B0BB]/5" : "border-border hover:bg-muted/30"}`}>
                      <input type="radio" name="payMethod" checked={payDirect && !payIndirect} onChange={() => { setPayDirect(true); setPayIndirect(false); }} className="h-4 w-4" style={{ accentColor: "#00B0BB" }} />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">Performance & Payroll</span>
                          <span className="rounded-full bg-[#e6fafb] px-2 py-0.5 text-[10px] font-semibold text-[#007A82]">PPP</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">Client pays contractors directly via Stripe. Client &rarr; Stripe &rarr; Contractor</p>
                      </div>
                    </label>

                    {/* COR */}
                    <label className={`flex items-center gap-3 rounded-lg border-2 px-4 py-3 cursor-pointer transition-colors ${payIndirect && !payDirect ? "border-[#059669] bg-[#059669]/5" : "border-border hover:bg-muted/30"}`}>
                      <input type="radio" name="payMethod" checked={payIndirect && !payDirect} onChange={() => { setPayDirect(false); setPayIndirect(true); }} className="h-4 w-4" style={{ accentColor: "#059669" }} />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">Contractor of Record</span>
                          <span className="rounded-full bg-[#d1fae5] px-2 py-0.5 text-[10px] font-semibold text-[#065f46]">COR</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">RL invoices client, pays contractors via Wise. Client &rarr; RL &rarr; Contractor</p>
                      </div>
                    </label>

                    {/* Both */}
                    <label className={`flex items-center gap-3 rounded-lg border-2 px-4 py-3 cursor-pointer transition-colors ${payDirect && payIndirect ? "border-[#00B0BB] bg-[#00B0BB]/5" : "border-border hover:bg-muted/30"}`}>
                      <input type="radio" name="payMethod" checked={payDirect && payIndirect} onChange={() => { setPayDirect(true); setPayIndirect(true); }} className="h-4 w-4" style={{ accentColor: "#00B0BB" }} />
                      <div className="flex-1">
                        <span className="text-sm font-semibold">Both</span>
                        <p className="text-xs text-muted-foreground mt-0.5">PPP for some contractors, COR for others</p>
                      </div>
                    </label>
                  </div>

                  {/* Email toggle */}
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Dashboard invite email</p>
                        <p className="text-xs text-muted-foreground">
                          {externalPrepaid
                            ? <>Credentials to <strong>{form.adminEmail || "admin"}</strong> on create</>
                            : <>Credentials to <strong>{form.adminEmail || "admin"}</strong> after payment</>}
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={!suppressInviteEmail}
                        onClick={() => setSuppressInviteEmail(!suppressInviteEmail)}
                        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${!suppressInviteEmail ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600"}`}
                      >
                        <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${!suppressInviteEmail ? "translate-x-[18px]" : "translate-x-[3px]"}`} />
                      </button>
                    </div>
                  </div>

                  {/* Veriff toggle */}
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Require identity verification</p>
                        <p className="text-xs text-muted-foreground">Client admin must complete Veriff ID check before accessing dashboard</p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={requireVeriff}
                        onClick={() => setRequireVeriff(!requireVeriff)}
                        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${requireVeriff ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600"}`}
                      >
                        <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${requireVeriff ? "translate-x-[18px]" : "translate-x-[3px]"}`} />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="space-y-5 py-2">
                  {/* Success */}
                  <div className="flex flex-col items-center text-center gap-3 pb-2">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                      <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold">{form.name} is live</h2>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {createdEmailOk === true && !externalPrepaid && <>Payment link sent to <strong>{form.adminEmail}</strong></>}
                        {createdEmailOk === true && externalPrepaid && <>Dashboard invite sent to <strong>{form.adminEmail}</strong></>}
                        {createdEmailOk === false && <>Organization created but email failed to send</>}
                        {createdEmailOk === null && <>Organization created</>}
                      </p>
                    </div>
                  </div>

                  {/* Email error warning */}
                  {createdEmailOk === false && createdEmailError && (
                    <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3">
                      <div className="text-sm font-medium text-red-800 dark:text-red-200">Email failed to send</div>
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">{createdEmailError}</p>
                      <p className="text-xs text-muted-foreground mt-1">You can resend the invite from the organization detail page.</p>
                    </div>
                  )}

                  {/* What happens next — 2 clean steps */}
                  <div className="space-y-2">
                    {!externalPrepaid && (
                    <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">1</div>
                      <p className="text-sm text-muted-foreground">Client pays via the link → <strong>welcome email with credentials sent automatically</strong></p>
                    </div>
                    )}
                    <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">2</div>
                      <p className="text-sm text-muted-foreground">On first login they {requireVeriff ? <>complete <strong>Veriff ID verification</strong>, then get</> : <>get immediate</>} access to their dashboard</p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3 pt-1">
                    {createdOrgId && (
                      <button type="button" onClick={() => { handleFinish(); router.push(`/${orgSlug}/organizations/${createdOrgId}`); }} className="h-10 flex-1 rounded-md border text-sm font-medium hover:bg-accent">
                        View Organization
                      </button>
                    )}
                    <button type="button" onClick={handleFinish} className="h-10 flex-1 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90">Done</button>
                  </div>
                </div>
              )}

                            {step < 4 && (
                <div className="mt-6 flex justify-between">
                  <div>{step > 1 && <button type="button" onClick={() => setStep(step - 1)} className="h-10 rounded-md border px-4 text-sm font-medium hover:bg-accent">Back</button>}</div>
                  <div className="flex gap-3">
                    <button type="button" onClick={() => { setShowCreate(false); setStep(1); setForm(emptyForm); setWizardMode(null); }} className="h-10 rounded-md border px-4 text-sm font-medium hover:bg-accent">Cancel</button>
                    {step < 3 ? (
                      <button type="button" onClick={handleNextStep} className="h-10 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90">Next</button>
                    ) : step === 3 ? (
                      <button type="button" onClick={handleCreate} disabled={isPending} className="inline-flex items-center gap-2 h-10 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                        {isPending && <Image src="/logo.png" alt="" width={16} height={16} className="animate-spin rounded-sm" />}
                        {isPending ? "Creating…" : "Create Organization"}
                      </button>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Seat Edit Modal */}
      {editingSeats && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in duration-150">
          <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-200" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-1">VA Seats — {editingSeats.orgName}</h2>
            <p className="text-sm text-muted-foreground mb-5">Set the number of VA seats this client has purchased. This limits how many contractors can be onboarded.</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Number of VA seats</label>
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={editSeatCount}
                  onChange={(e) => setEditSeatCount(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                  placeholder="e.g. 5"
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setEditingSeats(null)} className="h-9 rounded-md border px-4 text-sm hover:bg-accent">Cancel</button>
                <button
                  type="button"
                  disabled={isPending || !editSeatCount || parseInt(editSeatCount) < 1}
                  onClick={() => {
                    const seats = parseInt(editSeatCount);
                    if (!seats || seats < 1) return;
                    startTransition(async () => {
                      try {
                        await updateOrgSeats(editingSeats.orgId, seats, editingSeats.plan ?? undefined);
                        setEditingSeats(null);
                        router.refresh();
                      } catch (e) {
                        showError({ title: "Error", message: e instanceof Error ? e.message : "Failed to update seats" });
                      }
                    });
                  }}
                  className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {isPending ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
