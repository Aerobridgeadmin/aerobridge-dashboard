"use client";

import { fullDate } from "@/lib/hriq/format";
import { useErrorDialog } from "@/app/(authenticated)/components/error-dialog";
import { CustomSelect } from "@/app/(authenticated)/components/custom-select";
import { uploadMyDocument } from "@/app/actions/hriq/contractor-self-service";
import { uploadMyDocumentFile } from "@/app/actions/hriq/upload";
import { useRef, useState } from "react";

type Doc = {
  id: string;
  documentName: string;
  documentType: string;
  fileUrl: string | null;
  status: string;
  description: string | null;
  rejectionReason: string | null;
  createdAt: Date;
};

const DOC_TYPE_OPTIONS = [
  { value: "id_document", label: "Government ID" },
  { value: "bank_details", label: "Bank Details" },
  { value: "contract", label: "Contract / Agreement" },
  { value: "tax_form", label: "Tax Form" },
  { value: "certificate", label: "Certificate" },
  { value: "other", label: "Other" },
];

const STATUS_COLORS: Record<string, string> = {
  verified: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300",
};

const TYPE_ICONS: Record<string, string> = {
  id_document: "ID",
  bank_details: "BK",
  contract: "CT",
  tax_form: "TX",
  certificate: "CR",
  other: "DC",
};

export function MyDocuments({ documents, hasProfile }: { documents: Doc[]; hasProfile: boolean }) {
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [docType, setDocType] = useState("other");
  const [docName, setDocName] = useState("");
  const [docDesc, setDocDesc] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showError, showSuccess } = useErrorDialog();

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (!docName) setDocName(file.name.replace(/\.[^/.]+$/, ""));
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (!docName) setDocName(file.name.replace(/\.[^/.]+$/, ""));
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !docName.trim()) {
      showError("Please select a file and enter a document name");
      return;
    }

    setUploading(true);
    try {
      // Upload file via server action
      const fd = new FormData();
      fd.append("file", selectedFile);
      fd.append("docType", docType);
      const { url } = await uploadMyDocumentFile(fd);

      // Create document record
      await uploadMyDocument({
        documentName: docName.trim(),
        documentType: docType,
        fileUrl: url,
        description: docDesc.trim() || undefined,
      });

      showSuccess("Document uploaded and submitted for review.");
      setShowUpload(false);
      setSelectedFile(null);
      setDocName("");
      setDocDesc("");
      setDocType("other");
    } catch (err) {
      showError({ title: "Upload Error", message: err instanceof Error ? err.message : "Failed to upload." });
    } finally {
      setUploading(false);
    }
  };

  if (!hasProfile) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        No employee profile linked to your account. Please contact your administrator.
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-3xl">
      {/* Upload Button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">My Documents</h2>
          <p className="text-xs text-muted-foreground">{documents.length} document{documents.length !== 1 ? "s" : ""} on file</p>
        </div>
        <button
          type="button"
          onClick={() => setShowUpload(!showUpload)}
          className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {showUpload ? "Cancel" : "+ Upload Document"}
        </button>
      </div>

      {/* Upload Form */}
      {showUpload && (
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <h3 className="font-semibold">Upload New Document</h3>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`rounded-lg border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${
              dragActive ? "border-primary bg-primary/5" : selectedFile ? "border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950" : "border-muted-foreground/20 hover:border-primary/40"
            }`}
          >
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" />
            {selectedFile ? (
              <div>
                
                <div className="mt-1 text-sm font-medium">{selectedFile.name}</div>
                <div className="text-xs text-muted-foreground">{(selectedFile.size / 1024).toFixed(0)} KB · Click to change</div>
              </div>
            ) : (
              <div>
                
                <div className="mt-1 text-sm font-medium">Drag & drop a file here</div>
                <div className="text-xs text-muted-foreground">or click to browse · PDF, JPG, PNG, DOC</div>
              </div>
            )}
          </div>

          {/* Details */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Document Name *</label>
              <input
                value={docName}
                onChange={(e) => setDocName(e.target.value)}
                placeholder="e.g., Government ID"
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Document Type</label>
              <CustomSelect
                value={docType}
                onValueChange={setDocType}
                triggerClassName="mt-1 h-9 w-full"
                placeholder="Select type..."
                options={DOC_TYPE_OPTIONS}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Description (optional)</label>
            <input
              value={docDesc}
              onChange={(e) => setDocDesc(e.target.value)}
              placeholder="Brief description..."
              className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
            />
          </div>

          <button
            type="button"
            onClick={handleUpload}
            disabled={uploading || !selectedFile || !docName.trim()}
            className="h-10 w-full rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {uploading ? "Uploading…" : "Upload Document"}
          </button>
        </div>
      )}

      {/* Document List */}
      <div className="space-y-2">
        {documents.map((doc) => (
          <div key={doc.id} className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xl">{TYPE_ICONS[doc.documentType] ?? "DC"}</span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{doc.documentName}</span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] capitalize">{doc.documentType.replace(/_/g, " ")}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] capitalize ${STATUS_COLORS[doc.status] ?? ""}`}>{doc.status}</span>
                  </div>
                  {doc.description && <p className="text-xs text-muted-foreground mt-0.5">{doc.description}</p>}
                  {doc.status === "rejected" && doc.rejectionReason && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">Reason: {doc.rejectionReason}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Uploaded {fullDate(doc.createdAt)}
                  </p>
                </div>
              </div>
              {doc.fileUrl && (
                <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer"
                  className="shrink-0 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent">
                  View
                </a>
              )}
            </div>
          </div>
        ))}
        {documents.length === 0 && (
          <div className="rounded-xl border bg-card py-10 text-center text-muted-foreground">
            No documents on file. Click &ldquo;Upload Document&rdquo; to add one.
          </div>
        )}
      </div>
    </div>
  );
}
