"use server";
import { getContractorEmail } from "@/lib/hriq/utils";

import { requireOrg } from "@repo/auth/session";
import { database } from "@repo/database";
import { revalidatePath } from "next/cache";
import { HriqError } from "@/lib/hriq/errors";

export async function createDocument(data: {
  employeeId: string;
  documentType: string;
  documentName: string;
  description?: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  filePath?: string;
  isConfidential?: boolean;
  folder?: string;
}) {
  const session = await requireOrg();

  const employee = await database.employee.findFirst({
    where: { id: data.employeeId, organizationId: session.orgId },
  });
  if (!employee) throw new HriqError("HRIQ-0201");

  // Auto-assign folder from document type if not explicitly set
  const folder = data.folder ?? docTypeToFolder(data.documentType);

  const doc = await database.document.create({
    data: {
      employeeId: data.employeeId,
      documentType: data.documentType,
      documentName: data.documentName,
      description: data.description,
      fileUrl: data.fileUrl,
      fileName: data.fileName,
      fileSize: data.fileSize,
      mimeType: data.mimeType,
      filePath: data.filePath,
      isConfidential: data.isConfidential ?? false,
      uploadedByUserId: session.userId,
      uploadedByName: session.name ?? undefined,
      folder,
    },
  });

  revalidatePath(`/[orgSlug]/employees/${data.employeeId}`, "page");

  return doc;
}

/** Map document_type → folder */
function docTypeToFolder(docType: string): string {
  switch (docType) {
    case "contract": case "offer_letter": case "nda": return "contracts";
    case "paystub": case "invoice": case "time_doctor_report": return "pay";
    case "id_document": case "passport": case "visa": return "identity";
    case "tax_form": return "tax";
    case "bank_details": return "banking";
    default: return "other";
  }
}

export async function updateDocument(
  documentId: string,
  data: { status?: string; verifiedByUserId?: string; description?: string; rejectionReason?: string }
) {
  const session = await requireOrg();

  if (data.status) {
    const ALLOWED_DOC_STATUSES = ["pending", "uploaded", "verified", "rejected", "expired"];
    if (!ALLOWED_DOC_STATUSES.includes(data.status)) {
      throw new HriqError("HRIQ-0302", `Invalid document status: ${data.status}`);
    }
  }

  const doc = await database.document.findFirst({
    where: { id: documentId, employee: { organizationId: session.orgId } },
    include: {
      employee: {
        select: { personalEmail: true, workEmail: true, legalFirstName: true, legalLastName: true },
      },
    },
  });
  if (!doc) throw new HriqError("HRIQ-0301");

  const updated = await database.document.update({
    where: { id: documentId },
    data: {
      status: data.status,
      description: data.description,
      rejectionReason: data.rejectionReason,
      verifiedAt: data.status === "verified" ? new Date() : undefined,
      verifiedByUserId: data.status === "verified" ? session.userId : data.verifiedByUserId,
    },
  });

  // Send email notification to contractor on verify/reject (fire-and-forget)
  if (data.status === "verified" || data.status === "rejected") {
    try {
      const contractorEmail = getContractorEmail(doc.employee);
      if (contractorEmail) {
        const contractorName = `${doc.employee.legalFirstName ?? ""} ${doc.employee.legalLastName ?? ""}`.trim() || "there";
        if (data.status === "verified") {
          const { sendDocumentVerifiedEmail } = await import("./send-email");
          try {
            await sendDocumentVerifiedEmail(contractorEmail, contractorName, doc.documentName);
          } catch (emailErr) {
            console.error("[HRIQ] Email send failed (non-blocking):", emailErr);
          }
        } else {
          const { sendDocumentRejectedEmail } = await import("./send-email");
          try {
            await sendDocumentRejectedEmail(contractorEmail, contractorName, doc.documentName, data.rejectionReason);
          } catch (emailErr) {
            console.error("[HRIQ] Email send failed (non-blocking):", emailErr);
          }
        }
      }
    } catch (e) {
      console.error("[Documents] Failed to send status notification:", e);
    }
  }

  revalidatePath(`/[orgSlug]/employees/${doc.employeeId}`, "page");

  return updated;
}

export async function deleteDocument(documentId: string) {
  try {
    const session = await requireOrg();

    // Only admins and super_admins can delete documents
    if (!["super_admin", "admin"].includes(session.orgRole)) {
      throw new HriqError("HRIQ-0105", "Only admins can delete documents");
    }

    const doc = await database.document.findFirst({
      where: { id: documentId, employee: { organizationId: session.orgId } },
    });
    if (!doc) throw new HriqError("HRIQ-0301");

    // Audit log before deletion — record what was deleted
    try {
      await database.auditLog.create({
        data: {
          organizationId: session.orgId,
          actorType: "user",
          actorUserId: session.userId,
          action: "document.deleted",
          objectType: "document",
          objectId: documentId,
          oldValue: {
            documentName: doc.documentName,
            documentType: doc.documentType,
            employeeId: doc.employeeId,
            status: doc.status,
          },
        },
      });
    } catch (auditErr) {
      console.error("[Documents] Audit log creation failed for delete:", auditErr);
    }

    await database.document.delete({ where: { id: documentId } });

    revalidatePath(`/[orgSlug]/employees/${doc.employeeId}`, "page");

    return { success: true };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[documents.ts:deleteDocument]", _msg);
    return { error: _msg };
  }
}

export async function refetchJotformPdf(documentId: string): Promise<{ success: boolean; fileUrl?: string; error?: string }> {
  try {
    await requireOrg();

    const doc = await database.document.findFirst({
      where: { id: documentId },
      select: { id: true, description: true, documentName: true, employeeId: true, filePath: true },
    });
    if (!doc) throw new Error("Document not found");

    // Extract submission ID from description
    const match = doc.description?.match(/submission (\d+)/i);
    if (!match) throw new Error("No JotForm submission ID found in description");
    const submissionId = match[1]!;

    const apiKey = process.env.JOTFORM_API_KEY;
    if (!apiKey) throw new Error("JOTFORM_API_KEY not configured");

    const { getSupabaseAdmin } = await import("./constants");
    const supabase = getSupabaseAdmin();

    let pdfBuffer: ArrayBuffer | null = null;
    let fileName = `${doc.documentName.replace(/[^a-zA-Z0-9_-]/g, "_")}_${submissionId}.pdf`;

    // Approach 1: Try JotForm submission PDF endpoint
    try {
      const res = await fetch(`https://api.jotform.com/submission/${submissionId}/pdf?apiKey=${apiKey}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const ct = res.headers.get("content-type") ?? "";
        if (ct.includes("pdf") || ct.includes("octet-stream")) {
          const buf = await res.arrayBuffer();
          // Validate: reject HTML error pages
          const firstBytes = new Uint8Array(buf.slice(0, 4));
          const isHtml = buf.byteLength > 4 && ((firstBytes[0] === 0x3C && firstBytes[1] === 0x21) || (firstBytes[0] === 0x3C && firstBytes[1] === 0x68));
          if (!isHtml && buf.byteLength > 500) pdfBuffer = buf;
        }
      }
    } catch (err) { console.warn("[documents:refetchJotformPdf] Approach 1 (submission/pdf) failed:", err); }

    // Approach 2: server.php getSubmissionPDF — works for JotForm Sign docs
    if (!pdfBuffer) {
      try {
        const res = await fetch(
          `https://www.jotform.com/server.php?action=getSubmissionPDF&sid=${submissionId}&apiKey=${apiKey}`,
          { signal: AbortSignal.timeout(15000) },
        );
        if (res.ok) {
          const buf = await res.arrayBuffer();
          const firstBytes = new Uint8Array(buf.slice(0, 4));
          const isHtml = buf.byteLength > 4 && ((firstBytes[0] === 0x3C && firstBytes[1] === 0x21) || (firstBytes[0] === 0x3C && firstBytes[1] === 0x68));
          if (!isHtml && buf.byteLength > 500) {
            pdfBuffer = buf;
            console.info(`[documents:refetchJotformPdf] Downloaded via server.php (${buf.byteLength} bytes)`);
          }
        }
      } catch (err) { console.warn("[documents:refetchJotformPdf] Approach 2 (server.php) failed:", err); }
    }

    // Approach 3: Extract file URLs from submission answers
    if (!pdfBuffer) {
      try {
        const res = await fetch(`https://api.jotform.com/submission/${submissionId}?apiKey=${apiKey}`, {
          signal: AbortSignal.timeout(8000),
        });
        if (res.ok) {
          const data = await res.json();
          const answers = data?.content?.answers ?? data?.answers ?? {};
          const fileUrls: string[] = [];
          for (const a of Object.values(answers) as any[]) {
            if (Array.isArray(a?.answer)) {
              for (const item of a.answer) {
                if (typeof item === "string" && item.includes("http")) fileUrls.push(item);
              }
            }
            if (typeof a?.answer === "string" && a.answer.includes("jotform.com") && a.answer.includes("/uploads/")) {
              fileUrls.push(a.answer);
            }
          }
          for (const url of fileUrls) {
            try {
              const fileRes = await fetch(url, { signal: AbortSignal.timeout(15000) });
              if (fileRes.ok) {
                const buf = await fileRes.arrayBuffer();
                // Validate: reject HTML error pages
                const firstBytes = new Uint8Array(buf.slice(0, 4));
                const isHtml = buf.byteLength > 4 && ((firstBytes[0] === 0x3C && firstBytes[1] === 0x21) || (firstBytes[0] === 0x3C && firstBytes[1] === 0x68));
                if (!isHtml && buf.byteLength > 500) {
                  pdfBuffer = buf;
                  const ext = url.split(".").pop()?.split("?")[0] ?? "pdf";
                  fileName = `${doc.documentName.replace(/[^a-zA-Z0-9_-]/g, "_")}_${submissionId}.${ext}`;
                  break;
                }
              }
            } catch (err) { console.warn("[documents:refetchJotformPdf] try next:", err); }
          }
        }
      } catch (err) { console.warn("[documents:refetchJotformPdf] give up:", err); }
    }

    if (!pdfBuffer) throw new Error("Could not download document from JotForm. The submission may have expired or the API key may not have access.");

    // Detect content type from filename extension
    const ext = fileName.split(".").pop()?.toLowerCase() ?? "pdf";
    const MIME_MAP: Record<string, string> = {
      pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
      gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
      doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };
    const detectedMime = MIME_MAP[ext] ?? "application/octet-stream";

    // Upload to Supabase Storage
    const storagePath = `signed-documents/${doc.employeeId}/${fileName}`;
    const { error: uploadError } = await supabase.storage
      .from("org-documents")
      .upload(storagePath, Buffer.from(pdfBuffer), { contentType: detectedMime, upsert: true });

    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

    // Generate fresh 1-year signed URL
    const { data: signedData, error: signError } = await supabase.storage
      .from("org-documents")
      .createSignedUrl(storagePath, 60 * 60 * 24 * 365);

    if (signError || !signedData?.signedUrl) throw new Error("Failed to generate signed URL");

    await database.document.update({
      where: { id: documentId },
      data: { fileUrl: signedData.signedUrl, filePath: storagePath, mimeType: detectedMime, fileName },
    });

    revalidatePath(`/[orgSlug]/employees/${doc.employeeId}`, "page");
    return { success: true, fileUrl: signedData.signedUrl };

  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to fetch document" };
  }
}

export async function refreshDocumentSignedUrl(documentId: string): Promise<{ fileUrl?: string; error?: string }> {
  try {
    await requireOrg();

    const doc = await database.document.findFirst({
      where: { id: documentId },
      select: { id: true, filePath: true, employeeId: true },
    });
    if (!doc?.filePath) throw new Error("No storage path on record");

    const { getSupabaseAdmin } = await import("./constants");
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase.storage
      .from("org-documents")
      .createSignedUrl(doc.filePath, 60 * 60 * 24 * 365);

    if (error || !data?.signedUrl) throw new Error("Failed to create signed URL");

    await database.document.update({ where: { id: documentId }, data: { fileUrl: data.signedUrl } });
    revalidatePath(`/[orgSlug]/employees/${doc.employeeId}`, "page");
    return { fileUrl: data.signedUrl };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to refresh URL" };
  }
}

// ─── JotForm Contract Search (for Already Paid org creation) ─────────────────

export type JotFormContractSubmission = {
  submissionId: string;
  formId: string;
  formTitle: string;
  submittedAt: string;
  signerName: string | null;
  companyName: string | null;
  pdfUrl: string | null;
};

/**
 * Search JotForm sign/form submissions for a client contract by company name.
 * Searches all configured JOTFORM_SIGN_TEMPLATE_LINKS forms for a name match.
 * Used in the "Already Paid" org creation flow.
 */
export async function searchJotFormContracts(searchTerm: string): Promise<{
  submissions: JotFormContractSubmission[];
  error?: string;
}> {
  try {
    const { requireRole } = await import("@repo/auth/session");
    await requireRole("super_admin");

    const { JotFormService, getConfiguredJotFormLinks } = await import("@repo/integrations/jotform");

    const apiKey = process.env.JOTFORM_API_KEY?.trim();
    if (!apiKey) return { submissions: [], error: "JotForm API key not configured." };

    const links = getConfiguredJotFormLinks();
    if (links.length === 0) return { submissions: [], error: "No JotForm forms configured." };

    const term = searchTerm.toLowerCase().trim();
    const results: JotFormContractSubmission[] = [];

    // Search each configured form for submissions matching the company name
    await Promise.allSettled(
      links.map(async (link) => {
        try {
          const subs = await JotFormService.getFormSubmissions(link.id, 500);
          for (const sub of subs) {
            if (sub.status === "DELETED") continue;
            const answers = sub.answers as Record<string, { answer?: unknown; prettyFormat?: string }> | null;
            if (!answers) continue;

            // Collect all answer text for matching
            const allText = Object.values(answers)
              .flatMap((a) => [
                typeof a.answer === "string" ? a.answer : "",
                a.prettyFormat ?? "",
                typeof a.answer === "object" && a.answer !== null
                  ? Object.values(a.answer as Record<string, string>).join(" ")
                  : "",
              ])
              .join(" ")
              .toLowerCase();

            if (!term || allText.includes(term)) {
              // Extract signer name and company name heuristically
              let signerName: string | null = null;
              let companyName: string | null = null;

              for (const a of Object.values(answers)) {
                const txt = typeof a.answer === "string" ? a.answer.trim() : "";
                const pf = a.prettyFormat?.trim() ?? "";
                const val = txt || pf;
                if (!signerName && val && val.split(" ").length >= 2 && val.length < 60) {
                  signerName = val;
                }
                if (!companyName && val && val.toLowerCase().includes(term) && term.length > 2) {
                  companyName = val;
                }
              }

              results.push({
                submissionId: sub.id,
                formId: link.id,
                formTitle: link.title,
                submittedAt: sub.created_at ?? "",
                signerName,
                companyName: companyName ?? searchTerm,
                pdfUrl: null, // fetched on demand
              });
            }
          }
        } catch (err) {
          console.warn("[Documents:searchJotFormContracts] Form search error (non-blocking):", err);
        }
      })
    );

    // Sort newest first
    results.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

    return { submissions: results.slice(0, 20) };
  } catch (err) {
    return { submissions: [], error: err instanceof Error ? err.message : "Search failed." };
  }
}

/**
 * Download a JotForm submission PDF as base64.
 */
export async function downloadJotFormSubmissionPdf(submissionId: string): Promise<{
  base64: string;
  fileName: string;
  error?: never;
} | { error: string; base64?: never; fileName?: never }> {
  try {
    const { requireRole } = await import("@repo/auth/session");
    await requireRole("super_admin");

    const { JotFormService } = await import("@repo/integrations/jotform");
    const buf = await JotFormService.downloadSubmissionPdf(submissionId);
    if (!buf) return { error: "Could not download PDF from JotForm." };
    const base64 = Buffer.from(buf).toString("base64");
    return { base64, fileName: `contract-${submissionId}.pdf` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to download contract PDF." };
  }
}
