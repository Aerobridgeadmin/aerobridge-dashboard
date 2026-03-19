import { NextResponse } from "next/server";
import { database } from "@repo/database";

const EXT_MIME: Record<string, string> = {
  pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", bmp: "image/bmp",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain", csv: "text/csv",
};

function detectMimeFromBytes(buf: Uint8Array): string | null {
  if (buf.length < 4) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return "image/png";
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return "image/jpeg";
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "image/gif";
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return "application/pdf";
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return "image/webp";
  return null;
}

/** Extract bucket + path from a Supabase storage URL */
function parseSupabaseUrl(url: string): { bucket: string; path: string } | null {
  // Public: /storage/v1/object/public/{bucket}/{path}
  const pubMatch = url.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+?)(?:\?|$)/);
  if (pubMatch) return { bucket: pubMatch[1], path: decodeURIComponent(pubMatch[2]) };

  // Signed: /storage/v1/object/sign/{bucket}/{path}?token=...
  const signMatch = url.match(/\/storage\/v1\/object\/sign\/([^/]+)\/(.+?)(?:\?|$)/);
  if (signMatch) return { bucket: signMatch[1], path: decodeURIComponent(signMatch[2]) };

  return null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const docId = url.searchParams.get("id");
  const submissionId = url.searchParams.get("submissionId");
  const employeeId = url.searchParams.get("employeeId");
  if (!docId && !submissionId) return NextResponse.json({ error: "Missing id or submissionId" }, { status: 400 });

  // Auth
  const { getSessionContext } = await import("@repo/auth/session");
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Lookup by docId or by submissionId
  const doc = docId
    ? await database.document.findFirst({
        where: { id: docId! },
        select: {
          id: true, filePath: true, fileUrl: true, fileName: true, mimeType: true,
          documentName: true, description: true, employeeId: true,
          employee: { select: { organizationId: true } },
        },
      })
    : submissionId
      ? await database.document.findFirst({
          where: {
            description: { contains: submissionId },
            ...(employeeId ? { employeeId } : {}),
          },
          select: {
            id: true, filePath: true, fileUrl: true, fileName: true, mimeType: true,
            documentName: true, description: true, employeeId: true,
            employee: { select: { organizationId: true } },
          },
          orderBy: { createdAt: "desc" },
        })
      : null;
  if (!doc) {
    // If no document record exists but we have a submissionId, try to fetch directly from JotForm
    if (submissionId) {
      const apiKey = process.env.JOTFORM_API_KEY;
      if (apiKey) {
        // Try standard PDF API
        try {
          const res = await fetch(`https://api.jotform.com/submission/${submissionId}/pdf?apiKey=${apiKey}`, {
            signal: AbortSignal.timeout(15000),
          });
          if (res.ok) {
            const buf = await res.arrayBuffer();
            if (buf.byteLength > 500) {
              return new NextResponse(Buffer.from(buf), {
                headers: {
                  "Content-Type": "application/pdf",
                  "Content-Disposition": `inline; filename="submission-${submissionId}.pdf"`,
                  "Cache-Control": "private, max-age=3600",
                },
              });
            }
          }
        } catch (err) { console.warn("[view/route:GET] Suppressed error:", err); }
        // Fallback: server.php getSubmissionPDF
        try {
          const res = await fetch(`https://www.jotform.com/server.php?action=getSubmissionPDF&sid=${submissionId}&apiKey=${apiKey}`, {
            signal: AbortSignal.timeout(15000),
          });
          if (res.ok) {
            const buf = await res.arrayBuffer();
            if (buf.byteLength > 500 && new Uint8Array(buf)[0] !== 0x3C) {
              return new NextResponse(Buffer.from(buf), {
                headers: {
                  "Content-Type": "application/pdf",
                  "Content-Disposition": `inline; filename="submission-${submissionId}.pdf"`,
                  "Cache-Control": "private, max-age=3600",
                },
              });
            }
          }
        } catch (err) { console.warn("[view/route:GET] Suppressed error:", err); }
      }
    }
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  // Scope check
  if (session.orgRole !== "super_admin" && doc.employee.organizationId !== session.orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { getSupabaseAdmin } = await import("@/app/actions/hriq/constants");
    const supabase = getSupabaseAdmin();
    let buffer: Uint8Array | null = null;
    let sourceInfo = "";

    // Strategy 1: Download from filePath (most reliable)
    if (doc.filePath) {
      const bucket = doc.filePath.startsWith("signed-documents/") ? "org-documents" : "org-documents";
      const { data, error } = await supabase.storage.from(bucket).download(doc.filePath);
      if (!error && data) {
        const bytes = new Uint8Array(await data.arrayBuffer());
        // Validate: reject if the "file" is actually an HTML error page from JotForm
        const isHtml = bytes.length > 4 && ((bytes[0] === 0x3C && bytes[1] === 0x21) || (bytes[0] === 0x3C && bytes[1] === 0x68));
        if (!isHtml && bytes.length > 100) {
          buffer = bytes;
          sourceInfo = `filePath:${bucket}/${doc.filePath}`;
        }
      }
    }

    // Strategy 2: Parse storage URL from fileUrl and download directly
    if (!buffer && doc.fileUrl) {
      const parsed = parseSupabaseUrl(doc.fileUrl);
      if (parsed) {
        const { data, error } = await supabase.storage.from(parsed.bucket).download(parsed.path);
        if (!error && data) {
          const bytes = new Uint8Array(await data.arrayBuffer());
          // Validate: reject if the "file" is actually an HTML error page
          const isHtml = bytes.length > 4 && ((bytes[0] === 0x3C && bytes[1] === 0x21) || (bytes[0] === 0x3C && bytes[1] === 0x68));
          if (!isHtml && bytes.length > 100) {
            buffer = bytes;
            sourceInfo = `parsed:${parsed.bucket}/${parsed.path}`;
            // Save the filePath for next time
            await database.document.update({
              where: { id: doc.id },
              data: { filePath: parsed.path },
            }).catch(() => {});
          }
        }
      }
    }

    // Strategy 3: fileUrl is a public URL that's still accessible — proxy it
    if (!buffer && doc.fileUrl && doc.fileUrl.includes("/public/")) {
      try {
        const res = await fetch(doc.fileUrl, { signal: AbortSignal.timeout(10000) });
        if (res.ok) {
          const bytes = new Uint8Array(await res.arrayBuffer());
          // Validate: reject HTML error pages
          const isHtml = bytes.length > 4 && ((bytes[0] === 0x3C && bytes[1] === 0x21) || (bytes[0] === 0x3C && bytes[1] === 0x68));
          if (!isHtml && bytes.length > 100) {
            buffer = bytes;
            sourceInfo = `publicUrl`;
          }
        }
      } catch (err) { console.warn("[view/route:GET] Suppressed error:", err); }
    }

    // Strategy 4: Try re-fetching from JotForm if we have a submission ID
    if (!buffer && doc.description) {
      const subMatch = doc.description.match(/submission\s+(\d+)/i);
      if (subMatch) {
        const submissionId = subMatch[1];
        const apiKey = process.env.JOTFORM_API_KEY;
        if (apiKey) {
          // Try PDF endpoint
          try {
            const res = await fetch(`https://api.jotform.com/submission/${submissionId}/pdf?apiKey=${apiKey}`, {
              signal: AbortSignal.timeout(15000),
            });
            if (res.ok) {
              const buf = await res.arrayBuffer();
              const bytes = new Uint8Array(buf);
              const isHtml = bytes.length > 4 && ((bytes[0] === 0x3C && bytes[1] === 0x21) || (bytes[0] === 0x3C && bytes[1] === 0x68));
              if (!isHtml && buf.byteLength > 500) {
                buffer = bytes;
                sourceInfo = `jotform:pdf:${submissionId}`;
              }
            }
          } catch (err) { console.warn("[view/route:GET] Suppressed error:", err); }

          // Fallback: server.php getSubmissionPDF
          if (!buffer) {
            try {
              const res = await fetch(`https://www.jotform.com/server.php?action=getSubmissionPDF&sid=${submissionId}&apiKey=${apiKey}`, {
                signal: AbortSignal.timeout(15000),
              });
              if (res.ok) {
                const buf = await res.arrayBuffer();
                if (buf.byteLength > 500) {
                  const bytes = new Uint8Array(buf);
                  if (bytes[0] !== 0x3C) { // Not HTML error
                    buffer = bytes;
                    sourceInfo = `jotform:serverpdf:${submissionId}`;
                  }
                }
              }
            } catch (err) { console.warn("[view/route:GET] Suppressed error:", err); }
          }

          // Try file uploads from submission
          if (!buffer) {
            try {
              const res = await fetch(`https://api.jotform.com/submission/${submissionId}?apiKey=${apiKey}`, {
                signal: AbortSignal.timeout(10000),
              });
              if (res.ok) {
                const data = await res.json();
                const answers = data?.content?.answers ?? {};
                for (const a of Object.values(answers) as any[]) {
                  if (buffer) break;
                  const urls: string[] = [];
                  if (Array.isArray(a?.answer)) {
                    for (const item of a.answer) {
                      if (typeof item === "string" && item.includes("http")) urls.push(item);
                    }
                  }
                  if (typeof a?.answer === "string" && a.answer.includes("http") && a.answer.includes("/uploads/")) {
                    urls.push(a.answer);
                  }
                  for (const fileUrl of urls) {
                    try {
                      const fileRes = await fetch(fileUrl, { signal: AbortSignal.timeout(10000) });
                      if (fileRes.ok) {
                        const buf = await fileRes.arrayBuffer();
                        const bytes = new Uint8Array(buf);
                        const isHtml = bytes.length > 4 && ((bytes[0] === 0x3C && bytes[1] === 0x21) || (bytes[0] === 0x3C && bytes[1] === 0x68));
                        if (!isHtml && buf.byteLength > 500) {
                          buffer = bytes;
                          sourceInfo = `jotform:file:${submissionId}`;

                          // Save to storage for next time
                          const ext = fileUrl.split(".").pop()?.split("?")[0] ?? "pdf";
                          const storagePath = `signed-documents/${doc.employeeId}/${doc.documentName.replace(/[^a-zA-Z0-9_-]/g, "_")}_${submissionId}.${ext}`;
                          const mime = EXT_MIME[ext] ?? "application/octet-stream";
                          await supabase.storage.from("org-documents")
                            .upload(storagePath, Buffer.from(buf), { contentType: mime, upsert: true })
                            .catch(() => {});
                          await database.document.update({
                            where: { id: doc.id },
                            data: { filePath: storagePath, mimeType: mime },
                          }).catch(() => {});
                          break;
                        }
                      }
                    } catch (err) { console.warn("[view/route:GET] Suppressed error:", err); }
                  }
                }
              }
            } catch (err) { console.warn("[view/route:GET] Suppressed error:", err); }
          }
        }
      }
    }

    if (!buffer) {
      return NextResponse.json({
        error: "File not available",
        detail: "This document has no stored file. It may need to be re-uploaded or the original source has expired.",
      }, { status: 404 });
    }

    // Detect content type
    let contentType = detectMimeFromBytes(buffer);
    if (!contentType) {
      const ext = (doc.filePath || doc.fileName || doc.fileUrl || doc.documentName || "").split(".").pop()?.split("?")[0]?.toLowerCase() ?? "";
      contentType = doc.mimeType || EXT_MIME[ext] || "application/octet-stream";
    }

    const displayName = doc.fileName || doc.documentName || "document";

    return new NextResponse(Buffer.from(buffer), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${displayName}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    console.error("[documents/view] Error:", err);
    return NextResponse.json({ error: "Failed to load document" }, { status: 500 });
  }
}
