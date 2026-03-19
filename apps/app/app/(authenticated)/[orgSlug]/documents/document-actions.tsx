"use client";

import { createDocument } from "@/app/actions/hriq/documents";
import { CustomSelect } from "@/app/(authenticated)/components/custom-select";
import { useErrorDialog } from "@/app/(authenticated)/components/error-dialog";
import { useState, useTransition } from "react";

type Contractor = { id: string; legalFirstName: string; legalLastName: string; employeeNumber: string };

export function DocumentActions({ contractors }: { contractors: Contractor[] }) {
  const [isPending, startTransition] = useTransition();
  const [showCreate, setShowCreate] = useState(false);
  const { showError } = useErrorDialog();

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (!fd.get("employeeId") || !fd.get("documentType")) {
      showError("Please select a contractor and document type.");
      return;
    }
    startTransition(async () => {
      try {
        await createDocument({
          employeeId: fd.get("employeeId") as string,
          documentType: fd.get("documentType") as string,
          documentName: fd.get("documentName") as string,
          description: (fd.get("description") as string) || undefined,
        });
        setShowCreate(false);
      } catch (err) {
        showError({ title: "Document error", message: err instanceof Error ? err.message : "Failed to add document." });
      }
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Documents</h2>
        <button onClick={() => setShowCreate(!showCreate)} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          {showCreate ? "Cancel" : "+ Add Document"}
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="mt-4 rounded-xl border bg-card p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Contractor *</label>
              <CustomSelect
                name="employeeId"
                placeholder="Select contractor..."
                triggerClassName="mt-1 h-9 w-full"
                options={contractors.map((c) => ({
                  value: c.id,
                  label: `${c.legalFirstName} ${c.legalLastName} (${c.employeeNumber})`,
                }))}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Document Type *</label>
              <CustomSelect
                name="documentType"
                placeholder="Select type..."
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
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Document Name *</label>
              <input name="documentName" required placeholder="e.g. W-8 BEN Form" className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <input name="description" placeholder="Optional notes" className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" />
            </div>
          </div>
          <button type="submit" disabled={isPending} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {isPending ? "Adding..." : "Add Document"}
          </button>
        </form>
      )}
    </div>
  );
}
