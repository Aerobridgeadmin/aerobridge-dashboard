"use client";

import { createDocument } from "@/app/actions/hriq/documents";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Contractor = { id: string; legalFirstName: string; legalLastName: string; employeeNumber: string };

export function DocumentActions({ contractors }: { contractors: Contractor[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showCreate, setShowCreate] = useState(false);

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await createDocument({
        employeeId: fd.get("employeeId") as string,
        documentType: fd.get("documentType") as string,
        documentName: fd.get("documentName") as string,
        description: (fd.get("description") as string) || undefined,
      });
      setShowCreate(false);
      router.refresh();
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
              <select name="employeeId" required defaultValue="" className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="" disabled>Select contractor...</option>
                {contractors.map((c) => (
                  <option key={c.id} value={c.id}>{c.legalFirstName} {c.legalLastName} ({c.employeeNumber})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Document Type *</label>
              <select name="documentType" required defaultValue="" className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="" disabled>Select type...</option>
                <option value="id_document">Government ID</option>
                <option value="contract">Contract</option>
                <option value="tax_form">Tax Form (W-8/W-9)</option>
                <option value="bank_details">Bank Details</option>
                <option value="resume">Resume</option>
                <option value="nda">NDA</option>
                <option value="other">Other</option>
              </select>
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
