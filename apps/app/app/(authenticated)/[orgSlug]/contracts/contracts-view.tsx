"use client";

import { createContractTemplate, createSigningRequest } from "@/app/actions/hriq/contracts";
import { shortDate } from "@/lib/hriq/format";
import { CustomSelect } from "@/app/(authenticated)/components/custom-select";
import { useErrorDialog } from "@/app/(authenticated)/components/error-dialog";
import type { ContractTemplate, ContractSigningRequest, Employee } from "@repo/database";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, useTransition } from "react";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  sent: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300",
  viewed: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300",
  signed: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
  declined: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300",
  expired: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

const CATEGORY_LABELS: Record<string, string> = {
  ica: "Independent Contractor Agreement",
  w8_ben: "W-8 BEN",
  w9: "W-9",
  nda: "NDA",
  offer_letter: "Offer Letter",
  general: "General",
};

type TemplateWithCount = ContractTemplate & { _count: { signingRequests: number } };
type RequestWithRelations = ContractSigningRequest & {
  employee: { id: string; legalFirstName: string; legalLastName: string; employeeNumber: string };
  template: { id: string; name: string; category: string };
};

type Contractor = { id: string; legalFirstName: string; legalLastName: string; employeeNumber: string; personalEmail: string | null; workEmail: string | null };

export function ContractsView({
  templates,
  requests,
  contractors,
}: {
  templates: TemplateWithCount[];
  requests: RequestWithRelations[];
  contractors: Contractor[];
}) {
  const [tab, setTab] = useState<"requests" | "templates">("requests");
  const [showCreateTemplate, setShowCreateTemplate] = useState(false);
  const [showSendContract, setShowSendContract] = useState(false);
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const [isPending, startTransition] = useTransition();
  const { showError } = useErrorDialog();

  const handleSendContract = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (!fd.get("templateId") || !fd.get("employeeId")) {
      showError("Please select both a template and a contractor.");
      return;
    }
    startTransition(async () => {
      try {
        await createSigningRequest({
          templateId: fd.get("templateId") as string,
          employeeId: fd.get("employeeId") as string,
          signerEmail: fd.get("signerEmail") as string,
        });
        setShowSendContract(false);
      } catch (err) {
        showError({ title: "Contract error", message: err instanceof Error ? err.message : "Failed to send contract." });
      }
    });
  };

  const handleCreateTemplate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await createContractTemplate({
          name: fd.get("name") as string,
          description: fd.get("description") as string,
          category: fd.get("category") as string,
          docusealTemplateId: fd.get("docusealTemplateId") as string,
        });
        setShowCreateTemplate(false);
      } catch (err) {
        showError({ title: "Template error", message: err instanceof Error ? err.message : "Failed to create template." });
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Tab Switcher */}
      <div className="flex items-center justify-between">
        <div className="flex gap-4 border-b">
          {(["requests", "templates"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`pb-2 text-sm font-medium capitalize transition-colors ${
                tab === t
                  ? "border-b-2 border-primary text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "requests" ? `Signing Requests (${requests.length})` : `Templates (${templates.length})`}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {tab === "requests" && (
            <button type="button" onClick={() => setShowSendContract(!showSendContract)} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              {showSendContract ? "Cancel" : "+ Send Contract"}
            </button>
          )}
          {tab === "templates" && (
            <button type="button" onClick={() => setShowCreateTemplate(true)} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              + New Template
            </button>
          )}
        </div>
      </div>

      {/* Send Contract Form */}
      {tab === "requests" && showSendContract && (
        <form onSubmit={handleSendContract} className="rounded-xl border bg-card p-5 space-y-3">
          <h3 className="font-semibold">Send Contract for Signing</h3>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-medium">Template *</label>
              <CustomSelect
                name="templateId"
                placeholder="Select template..."
                triggerClassName="mt-1 h-9 w-full"
                options={templates.map((t) => ({ value: t.id, label: t.name }))}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Contractor *</label>
              <CustomSelect
                name="employeeId"
                placeholder="Select contractor..."
                triggerClassName="mt-1 h-9 w-full"
                options={contractors.map((c) => ({ value: c.id, label: `${c.legalFirstName} ${c.legalLastName}` }))}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Signer Email *</label>
              <input name="signerEmail" type="email" required placeholder="contractor@email.com" className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" />
            </div>
          </div>
          <button type="submit" disabled={isPending} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {isPending ? "Sending..." : "Send for Signing"}
          </button>
        </form>
      )}

      {/* Signing Requests */}
      {tab === "requests" && (
        <div className="space-y-3">
          {requests.map((req) => (
            <div key={req.id} className="flex items-center justify-between rounded-xl border bg-card p-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{req.template.name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_COLORS[req.status] ?? ""}`}>
                    {req.status}
                  </span>
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  <Link href={`/${orgSlug}/employees/${req.employee.id}`} className="hover:underline">
                    {req.employee.legalFirstName} {req.employee.legalLastName}
                  </Link>
                  {" "}&middot; {req.signerEmail}
                  {req.signedAt && ` &middot; Signed ${shortDate(req.signedAt as any)}`}
                </div>
              </div>
              {req.signedDocumentUrl && (
                <a href={req.signedDocumentUrl} target="_blank" rel="noopener noreferrer" className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent">
                  View Document
                </a>
              )}
            </div>
          ))}
          {requests.length === 0 && (
            <div className="py-12 text-center text-muted-foreground">
              No signing requests yet.
            </div>
          )}
        </div>
      )}

      {/* Templates */}
      {tab === "templates" && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((tmpl) => (
            <div key={tmpl.id} className="rounded-xl border bg-card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold">{tmpl.name}</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {CATEGORY_LABELS[tmpl.category] ?? tmpl.category}
                  </p>
                </div>
                <span className="rounded bg-muted px-2 py-0.5 text-xs">{tmpl._count.signingRequests} sent</span>
              </div>
              {tmpl.description && <p className="mt-2 text-sm text-muted-foreground">{tmpl.description}</p>}
              {tmpl.docusealTemplateId && (
                <p className="mt-2 text-xs text-muted-foreground">DocuSeal ID: {tmpl.docusealTemplateId}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Template Dialog */}
      {showCreateTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in duration-150">
          <div className="w-full max-w-lg rounded-xl border bg-card p-6 shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-200" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold">New Contract Template</h2>
            <form onSubmit={handleCreateTemplate} className="mt-4 space-y-4">
              <div>
                <label className="text-sm font-medium">Name *</label>
                <input name="name" required className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium">Description</label>
                <textarea name="description" rows={2} className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium">Category</label>
                <CustomSelect
                  name="category"
                  defaultValue="ica"
                  triggerClassName="mt-1 h-10 w-full"
                  options={[
                    { value: "ica", label: "Independent Contractor Agreement" },
                    { value: "w8_ben", label: "W-8 BEN" },
                    { value: "w9", label: "W-9" },
                    { value: "nda", label: "NDA" },
                    { value: "offer_letter", label: "Offer Letter" },
                    { value: "general", label: "General" },
                  ]}
                />
              </div>
              <div>
                <label className="text-sm font-medium">DocuSeal Template ID</label>
                <input name="docusealTemplateId" placeholder="From DocuSeal dashboard" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowCreateTemplate(false)} className="h-10 rounded-md border px-4 text-sm hover:bg-accent">Cancel</button>
                <button type="submit" disabled={isPending} className="h-10 rounded-md bg-primary px-4 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                  {isPending ? "Creating..." : "Create Template"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
