import { database } from "@repo/database";
import { NextResponse } from "next/server";
import { recomputeSessionProgress } from "@/lib/hriq/utils";

/** Strip diacritics/accents for fuzzy name comparison (e.g., "Martínez" → "martinez") */
function normalizeAccents(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Map of backing form ID  Sign document ID.
 * When a Sign document is completed, the webhook fires with the backing form ID,
 * but the onboarding step's formUrl contains the Sign doc ID.
 */
function getBackingFormToSignDocMap(): Map<string, string> {
  const map = new Map<string, string>();
  // Hardcoded known mappings
  map.set("260527710805050", "260528345360051"); // W8-Ben backing  sign doc
  map.set("260527519357059", "260528134585056"); // W9 backing  sign doc
  // Override / extend from env
  const envMap = process.env.JOTFORM_SIGN_FORM_MAP?.trim();
  if (envMap) {
    for (const pair of envMap.split(",")) {
      const [signId, backingId] = pair.split(":").map((s) => s.trim());
      if (signId && backingId) map.set(backingId, signId);
    }
  }
  return map;
}

export async function POST(request: Request) {
  try {
    const webhookSecret = process.env.JOTFORM_WEBHOOK_SECRET;
    if (!webhookSecret && process.env.NODE_ENV === "production") {
      console.error("[JotForm Webhook] JOTFORM_WEBHOOK_SECRET not set in production");
      return NextResponse.json({ ok: false, error: "Not configured" }, { status: 500 });
    }
    if (webhookSecret) {
      const { searchParams } = new URL(request.url);
      const token = searchParams.get("secret") ?? request.headers.get("x-jotform-secret") ?? "";
      // Use timing-safe comparison to prevent timing attacks
      const { timingSafeEqual } = await import("node:crypto");
      const a = Buffer.from(token);
      const b = Buffer.from(webhookSecret);
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 });
      }
    }

    const contentType = request.headers.get("content-type") ?? "";
    let rawPayload: Record<string, unknown>;

    if (contentType.includes("application/json")) {
      rawPayload = await request.json();
    } else {
      const formData = await request.formData();
      rawPayload = Object.fromEntries((formData as any).entries()) as Record<string, unknown>;
      if (typeof rawPayload.rawRequest === "string") {
        try {
          rawPayload = JSON.parse(rawPayload.rawRequest) as Record<string, unknown>;
        } catch {
          // keep formData as-is
        }
      }
    }

    const formID = String(rawPayload.formID ?? rawPayload.formId ?? "");
    const submissionID = String(rawPayload.submissionID ?? rawPayload.submissionId ?? "");
    if (!formID || !submissionID) {
      return NextResponse.json({ ok: true, message: "Missing formID or submissionID" });
    }

    // Idempotency: skip if this submission was already processed
    const alreadyProcessed = await database.onboardingStep.findFirst({
      where: { formSubmissionId: submissionID, status: "completed" },
      select: { id: true },
    });
    if (alreadyProcessed) {
      return NextResponse.json({ ok: true, message: `Submission ${submissionID} already processed, skipping` });
    }

    const rawEmails = extractEmails(rawPayload);
    const names = extractNames(rawPayload);

    // Filter out admin/sender emails that are not the contractor's
    const adminEmails = [
      (process.env.GOOGLE_SENDER_EMAIL ?? "").toLowerCase().trim(),
      "admin@remoteleverage.com",
      "noreply@jotform.com",
    ].filter(Boolean);
    const emails = rawEmails.filter((e) => !adminEmails.includes(e.toLowerCase()));

    // JotForm Sign webhooks often lack signer email/name in the payload.
    // If we have no identity signals, fetch submission details from JotForm API.
    if (emails.length === 0 && names.length === 0) {
      const jotformApiKey = process.env.JOTFORM_API_KEY;
      if (jotformApiKey) {
        try {
          const subRes = await fetch(
            `https://api.jotform.com/submission/${submissionID}?apiKey=${jotformApiKey}`,
            { signal: AbortSignal.timeout(8000) }
          );
          if (subRes.ok) {
            const subData = await subRes.json();
            const content = subData?.content ?? subData;
            const fallbackEmails = extractEmails(content).filter((e) => !adminEmails.includes(e.toLowerCase()));
            const fallbackNames = extractNames(content);
            emails.push(...fallbackEmails);
            names.push(...fallbackNames);
            if (fallbackEmails.length > 0 || fallbackNames.length > 0) {
              console.info(`[JotForm Webhook] API lookup recovered identity: emails=[${fallbackEmails.join(",")}] names=[${fallbackNames.join(",")}]`);
            }
          }
        } catch (e) {
          console.warn("[JotForm Webhook] API submission lookup failed:", (e as Error).message);
        }
      }
    }

    // Check if this formID is a backing form for a Sign document
    const signDocId = getBackingFormToSignDocMap().get(formID);
    const formIdsToMatch = [formID, ...(signDocId ? [signDocId] : [])];

    // First try matching by formUrl containing the form ID or the corresponding Sign doc ID
    let steps = await database.onboardingStep.findMany({
      where: {
        stepType: "jotform",
        status: { not: "completed" },
        OR: formIdsToMatch.map((id) => ({ formUrl: { contains: id } })),
        session: { status: { notIn: ["cancelled", "completed"] } },
      },
      include: {
        session: {
          include: {
            employee: {
              select: { id: true, personalEmail: true, workEmail: true, legalFirstName: true, legalLastName: true },
            },
          },
        },
      },
    });

    // Fallback: if no steps matched by formUrl, try matching by email or name directly in DB
    if (steps.length === 0 && (emails.length > 0 || names.length > 0)) {
      const emailConditions = emails.map((e) => e.toLowerCase());
      const nameConditions: { firstName: string; lastNameParts: string[] }[] = [];
      for (const n of names) {
        const parts = normalizeAccents(n.trim()).split(/\s+/).map((p) => p.toLowerCase());
        if (parts.length >= 2) {
          nameConditions.push({ firstName: parts[0]!, lastNameParts: parts.slice(1) });
        }
      }

      // Build OR conditions for employee matching
      const employeeOr: any[] = [];
      if (emailConditions.length > 0) {
        employeeOr.push({ personalEmail: { in: emailConditions, mode: "insensitive" } });
        employeeOr.push({ workEmail: { in: emailConditions, mode: "insensitive" } });
      }
      for (const nc of nameConditions) {
        // Try exact first+last word match
        const lastWord = nc.lastNameParts[nc.lastNameParts.length - 1]!;
        employeeOr.push({
          legalFirstName: { equals: nc.firstName, mode: "insensitive" },
          legalLastName: { equals: lastWord, mode: "insensitive" },
        });
        // Also try: first name + any of the other words as last name (for multi-word names)
        for (const part of nc.lastNameParts) {
          if (part !== lastWord) {
            employeeOr.push({
              legalFirstName: { equals: nc.firstName, mode: "insensitive" },
              legalLastName: { equals: part, mode: "insensitive" },
            });
          }
        }
      }

      if (employeeOr.length > 0) {
        steps = await database.onboardingStep.findMany({
          where: {
            stepType: "jotform",
            status: { not: "completed" },
            session: {
              status: { notIn: ["cancelled", "completed"] },
              employee: { OR: employeeOr },
            },
          },
          include: {
            session: {
              include: {
                employee: {
                  select: { id: true, personalEmail: true, workEmail: true, legalFirstName: true, legalLastName: true },
                },
              },
            },
          },
        });
      }
    }

    if (steps.length === 0) {
      console.warn(`[JotForm Webhook] No matching steps for formID=${formID} submissionID=${submissionID}. Emails extracted: ${emails.join(", ") || "none"}. Names extracted: ${names.join(", ") || "none"}.`);
      return NextResponse.json({ ok: true, message: "No matching steps found" });
    }

    // Group steps by employee to detect unambiguous matches
    const employeeStepMap = new Map<string, typeof steps>();
    for (const step of steps) {
      const empId = step.session.employee.id;
      const existing = employeeStepMap.get(empId) ?? [];
      existing.push(step);
      employeeStepMap.set(empId, existing);
    }

    let matched = false;
    const processedSessionIds = new Set<string>();

    for (const step of steps) {
      const emp = step.session.employee;
      const empEmails = [emp.personalEmail, emp.workEmail]
        .filter(Boolean)
        .map((e) => e!.toLowerCase());

      // Match by email
      const emailMatch = emails.some((email) => empEmails.includes(email.toLowerCase()));

      // Match by name — support partial matches (first+last ignoring middle names)
      const empFirst = normalizeAccents((emp.legalFirstName ?? "").toLowerCase().trim());
      const empLast = normalizeAccents((emp.legalLastName ?? "").toLowerCase().trim());
      const empLastParts = empLast.split(/\s+/).filter(Boolean);
      const empFullName = `${empFirst} ${empLast}`.trim();
      const nameMatch = empFullName ? names.some((n) => {
        const nl = normalizeAccents(n.toLowerCase().trim());
        // Exact full name match
        if (nl === empFullName) return true;
        // First + last name match (ignoring middle names in either direction)
        const parts = nl.split(/\s+/);
        if (parts.length >= 2) {
          const nFirst = parts[0]!;
          const nLast = parts[parts.length - 1]!;
          if (nFirst === empFirst && nLast === empLast) return true;
          // Check if DB first name AND all parts of DB last name are CONTAINED in submitted name
          // (handles "Jorge Samour" vs "Jorge Eduardo Samour Miguel" and
          //  "Caio Martins Franco" vs "Caio Vinicius Martins Franco")
          if (empFirst && empLastParts.length > 0 && parts.includes(empFirst) && empLastParts.every((p) => parts.includes(p))) return true;
        }
        return false;
      }) : false;

      // Match by formUrl containing the formID or Sign doc ID
      const urlMatch = step.formUrl ? formIdsToMatch.some((id) => step.formUrl!.includes(id)) : false;

      // Match by pre-filled URL params (email embedded in the step's form link)
      let urlParamMatch = false;
      if (step.formUrl) {
        try {
          const u = new URL(step.formUrl);
          // Check if submission name matches the pre-filled name in step URL
          const prefillFirst = (u.searchParams.get("firstName") ?? u.searchParams.get("firstname") ?? u.searchParams.get("first_name") ?? "").toLowerCase().trim();
          const prefillLast = (u.searchParams.get("lastName") ?? u.searchParams.get("lastname") ?? u.searchParams.get("last_name") ?? "").toLowerCase().trim();
          const prefillEmail = (u.searchParams.get("email") ?? u.searchParams.get("Email") ?? "").toLowerCase().trim();

          // Match: submission name matches the step's pre-filled contractor name
          if (prefillFirst && prefillLast && names.length > 0) {
            const prefillFull = `${prefillFirst} ${prefillLast}`;
            for (const n of names) {
              const nl = n.toLowerCase().trim();
              const parts = nl.split(/\s+/);
              const nFirst = parts[0] ?? "";
              const nLast = parts[parts.length - 1] ?? "";
              if (nFirst === prefillFirst && nLast === prefillLast) { urlParamMatch = true; break; }
              if (nl === prefillFull) { urlParamMatch = true; break; }
            }
          }

          // Match: submission email matches the step's pre-filled email
          if (!urlParamMatch && prefillEmail && emails.length > 0) {
            if (emails.some((e) => e.toLowerCase() === prefillEmail)) urlParamMatch = true;
          }
        } catch (err) { console.warn("[jotform/route:POST] not a valid URL — skip:", err); }
      }

      // Accept if: (email or name match) OR (URL param match) OR (url match when unambiguous)
      const unambiguousUrlMatch = urlMatch && employeeStepMap.size === 1;
      const isMatch = emailMatch || nameMatch || urlParamMatch || unambiguousUrlMatch;
      if (!isMatch) {
        if (urlMatch && !emailMatch && !nameMatch && !urlParamMatch) {
          console.warn(`[JotForm Webhook] URL matched step "${step.stepName}" for ${emp.legalFirstName} ${emp.legalLastName} (${emp.personalEmail}) but no identity match. Extracted emails=[${emails.join(",")}], names=[${names.join(",")}]. Candidates=${employeeStepMap.size} employees. Skipping ambiguous match.`);
        }
        continue;
      }

      matched = true;
      const matchMethod = emailMatch ? "email" : nameMatch ? "name" : urlParamMatch ? "urlParam" : "unambiguousUrl";
      console.info(`[JotForm Webhook] MATCHED step "${step.stepName}" for ${emp.legalFirstName} ${emp.legalLastName} (${emp.personalEmail}) via ${matchMethod}. submissionID=${submissionID}`);

      await database.onboardingStep.update({
        where: { id: step.id },
        data: {
          status: "completed",
          formSubmissionId: submissionID,
          completedAt: new Date(),
          notes: `Auto-completed via JotForm webhook (submission ${submissionID})`,
        },
      });

      // Create a document record for the signed form (idempotent)
      try {
        const docName = `${step.stepName} (Signed)`;
        const existing = await database.document.findFirst({
          where: { employeeId: emp.id, documentName: docName },
          select: { id: true },
        });
        if (!existing) {
          const docType = inferDocType(step.stepName);

          // Try to fetch the signed PDF from JotForm and upload to Supabase Storage
          let fileUrl: string | undefined;
          try {
            fileUrl = await fetchAndStoreSignedPdf(submissionID, formID, emp.id, docName);
          } catch (pdfErr) {
            console.error("[JotForm Webhook] Failed to fetch/store signed PDF:", pdfErr);
          }

          await database.document.create({
            data: {
              employeeId: emp.id,
              documentType: docType,
              documentName: docName,
              description: `Auto-imported via JotForm webhook (submission ${submissionID})`,
              fileUrl,
              filePath: fileUrl ? `signed-documents/${emp.id}/${docName.replace(/[^a-zA-Z0-9_-]/g, "_")}_${submissionID}.pdf` : undefined,
              status: "verified",
              verifiedAt: new Date(),
              uploadedByName: `${emp.personalEmail ?? emp.workEmail ?? "Contractor"} (webhook)`,
            },
          });
        }
      } catch (docErr) {
        console.error("[JotForm Webhook] Failed to create document record:", docErr);
      }

      processedSessionIds.add(step.sessionId);
    }

    // Send admin notifications for signed documents (fire-and-forget)
    if (matched) {
      try {
        const adminEmail = (process.env.GOOGLE_SENDER_EMAIL ?? "").trim();
        if (adminEmail) {
          const { sendDocumentSignedAdminEmailSystem, sendAllFormsSignedAdminEmailSystem } = await import("@/app/actions/hriq/send-email");
          
          // Notify for each signed document (only for steps whose session was processed)
          for (const step of steps) {
            if (!processedSessionIds.has(step.sessionId)) continue;
            const emp = step.session.employee;
            
            const contractorName = `${(emp as any).legalFirstName ?? ""} ${(emp as any).legalLastName ?? ""}`.trim() || emp.personalEmail || "Contractor";
            await sendDocumentSignedAdminEmailSystem(adminEmail, contractorName, step.stepName).catch((e: any) =>
              console.error("[JotForm Webhook] Failed to send admin notification:", e)
            );
          }

          // Notify if ALL forms are now complete for any session
          for (const sessionId of processedSessionIds) {
            const session = await database.onboardingSession.findUnique({
              where: { id: sessionId },
              select: { jotformsCompleted: true, employee: { select: { legalFirstName: true, legalLastName: true, personalEmail: true } } },
            });
            if (session?.jotformsCompleted) {
              const name = `${session.employee.legalFirstName ?? ""} ${session.employee.legalLastName ?? ""}`.trim() || session.employee.personalEmail || "Contractor";
              const formCount = (await database.onboardingStep.count({ where: { sessionId, stepType: "jotform" } }));
              await sendAllFormsSignedAdminEmailSystem(adminEmail, name, formCount).catch((e: any) =>
                console.error("[JotForm Webhook] Failed to send all-forms-signed notification:", e)
              );
            }
          }
        }
      } catch (notifyErr) {
        console.error("[JotForm Webhook] Notification error:", notifyErr);
      }
    }

    for (const sessionId of processedSessionIds) {
      const allJotformSteps = await database.onboardingStep.findMany({
        where: { sessionId, stepType: "jotform" },
      });
      const allJotformDone = allJotformSteps.length > 0 && allJotformSteps.every((s: any) => s.status === "completed");

      if (allJotformDone) {
        await database.onboardingSession.update({
          where: { id: sessionId },
          data: {
            jotformsCompleted: true,
            jotformsCompletedAt: new Date(),
          },
        });
      }

      await recomputeSessionProgress(sessionId);
    }

    return NextResponse.json({
      ok: true,
      matched,
      sessionsUpdated: processedSessionIds.size,
    });
  } catch (error) {
    console.error("[JotForm Webhook] Error:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

function inferDocType(name: string): string {
  const lower = (name ?? "").toLowerCase();
  if (lower.includes("w-8") || lower.includes("w8") || lower.includes("w-9") || lower.includes("w9") || lower.includes("tax")) return "tax_form";
  if (lower.includes("contract") || lower.includes("agreement") || lower.includes("offer")) return "contract";
  if (lower.includes("terms") || lower.includes("condition")) return "contract";
  return "onboarding_form";
}

/**
 * Fetch the signed PDF for a JotForm submission and upload to Supabase Storage.
 * Tries two approaches:
 * 1. JotForm submission PDF endpoint
 * 2. Extract file URLs from submission answers
 */
async function fetchAndStoreSignedPdf(
  submissionId: string,
  formId: string,
  employeeId: string,
  docName: string,
): Promise<string | undefined> {
  const apiKey = process.env.JOTFORM_API_KEY;
  if (!apiKey) {
    console.warn("[JotForm PDF] JOTFORM_API_KEY not set, skipping PDF fetch");
    return undefined;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) return undefined;

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createClient } = require("@supabase/supabase-js") as typeof import("@supabase/supabase-js");
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let pdfBuffer: ArrayBuffer | null = null;
  let fileName = `${docName.replace(/[^a-zA-Z0-9_-]/g, "_")}_${submissionId}.pdf`;

  // Approach 1: Try JotForm submission PDF endpoint
  try {
    const pdfUrl = `https://api.jotform.com/submission/${submissionId}/pdf?apiKey=${apiKey}`;
    const res = await fetch(pdfUrl, { signal: AbortSignal.timeout(15000) });
    if (res.ok) {
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("pdf") || contentType.includes("octet-stream")) {
        const buf = await res.arrayBuffer();
        // Validate: reject HTML error pages disguised as PDF responses
        const firstBytes = new Uint8Array(buf.slice(0, 4));
        const isHtml = buf.byteLength > 4 && ((firstBytes[0] === 0x3C && firstBytes[1] === 0x21) || (firstBytes[0] === 0x3C && firstBytes[1] === 0x68));
        if (!isHtml && buf.byteLength > 500) {
          pdfBuffer = buf;
          console.info(`[JotForm PDF] Downloaded PDF via submission endpoint (${buf.byteLength} bytes)`);
        } else if (isHtml) {
          console.warn(`[JotForm PDF] Submission PDF endpoint returned HTML error page (${buf.byteLength} bytes), skipping`);
        }
      }
    }
  } catch (e) {
    console.warn("[JotForm PDF] Submission PDF endpoint failed:", (e as Error).message);
  }

  // Approach 1.5: server.php getSubmissionPDF — works for JotForm Sign docs
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
          console.info(`[JotForm PDF] Downloaded via server.php (${buf.byteLength} bytes)`);
        }
      }
    } catch (e) {
      console.warn("[JotForm PDF] server.php endpoint failed:", (e as Error).message);
    }
  }

  // Approach 2: Extract file URLs from submission answers
  if (!pdfBuffer) {
    try {
      const subUrl = `https://api.jotform.com/submission/${submissionId}?apiKey=${apiKey}`;
      const res = await fetch(subUrl, { signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        const data = await res.json();
        const answers = data?.content?.answers ?? data?.answers ?? {};
        const fileUrls: string[] = [];

        for (const a of Object.values(answers) as any[]) {
          // File upload answers
          if (Array.isArray(a?.answer)) {
            for (const item of a.answer) {
              if (typeof item === "string" && (item.includes("jotform.com") || item.includes("http"))) {
                fileUrls.push(item);
              }
            }
          }
          // Single file URL
          if (typeof a?.answer === "string" && a.answer.includes("jotform.com") && a.answer.includes("/uploads/")) {
            fileUrls.push(a.answer);
          }
        }

        // Download the first valid file (reject HTML error pages)
        for (const url of fileUrls) {
          try {
            const fileRes = await fetch(url, { signal: AbortSignal.timeout(15000) });
            if (fileRes.ok) {
              const buf = await fileRes.arrayBuffer();
              const firstBytes = new Uint8Array(buf.slice(0, 4));
              const isHtml = buf.byteLength > 4 && ((firstBytes[0] === 0x3C && firstBytes[1] === 0x21) || (firstBytes[0] === 0x3C && firstBytes[1] === 0x68));
              if (!isHtml && buf.byteLength > 500) {
                pdfBuffer = buf;
                // Try to preserve original extension
                const ext = url.split(".").pop()?.split("?")[0] ?? "pdf";
                fileName = `${docName.replace(/[^a-zA-Z0-9_-]/g, "_")}_${submissionId}.${ext}`;
                console.info(`[JotForm PDF] Downloaded file from submission answers (${buf.byteLength} bytes)`);
                break;
              } else if (isHtml) {
                console.warn(`[JotForm PDF] File URL returned HTML error page, skipping: ${url.slice(0, 80)}`);
              }
            }
          } catch (err) { console.warn("[jotform/route:fetchAndStoreSignedPdf] try next URL:", err); }
        }
      }
    } catch (e) {
      console.warn("[JotForm PDF] Submission answers extraction failed:", (e as Error).message);
    }
  }

  if (!pdfBuffer) {
    console.warn(`[JotForm PDF] Could not fetch PDF for submission ${submissionId}`);
    return undefined;
  }

  // Upload to Supabase Storage
  const storagePath = `signed-documents/${employeeId}/${fileName}`;
  // Detect content type from filename instead of hardcoding PDF
  const uploadExt = fileName.split(".").pop()?.toLowerCase() ?? "pdf";
  const UPLOAD_MIME: Record<string, string> = {
    pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
    gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
    doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
  const uploadMime = UPLOAD_MIME[uploadExt] ?? "application/octet-stream";
  const { error: uploadError } = await supabase.storage
    .from("org-documents")
    .upload(storagePath, Buffer.from(pdfBuffer), {
      contentType: uploadMime,
      upsert: true,
    });

  if (uploadError) {
    console.error("[JotForm PDF] Supabase upload failed:", uploadError.message);
    return undefined;
  }

  // Generate signed URL (1 year)
  const { data: signedData, error: signError } = await supabase.storage
    .from("org-documents")
    .createSignedUrl(storagePath, 60 * 60 * 24 * 365);

  if (signError || !signedData?.signedUrl) {
    console.error("[JotForm PDF] Failed to create signed URL:", signError?.message);
    return `${supabaseUrl}/storage/v1/object/sign/org-documents/${storagePath}`;
  }

  console.info(`[JotForm PDF] Stored signed PDF for submission ${submissionId} at ${storagePath}`);
  return signedData.signedUrl;
}

function extractEmails(payload: Record<string, unknown>): string[] {
  const emails: string[] = [];
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

  const scan = (value: unknown) => {
    if (typeof value === "string") {
      const matches = value.match(emailRegex);
      if (matches) emails.push(...matches);
    } else if (Array.isArray(value)) {
      for (const item of value) scan(item);
    } else if (value && typeof value === "object") {
      for (const v of Object.values(value)) scan(v);
    }
  };

  scan(payload);
  return [...new Set(emails)];
}

/**
 * Extract full names from JotForm submission payload.
 * Looks for compound name fields (first+last) and signature fields.
 */
function extractNames(payload: Record<string, unknown>): string[] {
  const names: string[] = [];
  const answers = payload.answers as Record<string, Record<string, unknown>> | undefined;
  if (!answers) return names;

  for (const a of Object.values(answers)) {
    // Compound name objects: {first: "...", last: "..."}
    if (a.answer && typeof a.answer === "object" && !Array.isArray(a.answer)) {
      const nameObj = a.answer as Record<string, string>;
      const first = (nameObj.first ?? nameObj.firstName ?? "").trim();
      const last = (nameObj.last ?? nameObj.lastName ?? "").trim();
      if (first && last) names.push(`${first} ${last}`);
    }
    // prettyFormat often has "First Last" for name/signature fields
    if (typeof a.prettyFormat === "string") {
      const pf = a.prettyFormat.trim();
      if (pf.includes(" ") && pf.length > 3 && pf.length < 80 && !pf.includes("@")) {
        names.push(pf);
      }
    }
    // Signature fields often contain the full name as a string
    const type = String(a.type ?? "");
    if ((type === "control_signature" || type === "control_fullname") && typeof a.answer === "string") {
      const ans = a.answer.trim();
      // Skip if it looks like a URL (e.g., signature image upload)
      if (ans.includes(" ") && ans.length > 3 && ans.length < 80 && !ans.startsWith("http")) {
        names.push(ans);
      }
    }
    // Textbox fields with name-related labels (common in W8/W9 sign documents)
    if (type === "control_textbox" && typeof a.answer === "string") {
      const label = String(a.text ?? a.name ?? "").toLowerCase();
      if (label.includes("name") && !label.includes("user") && !label.includes("company") && !label.includes("mailing")) {
        const ans = a.answer.trim();
        if (ans.includes(" ") && ans.length > 3 && ans.length < 80 && !ans.includes("@") && !ans.startsWith("http")) {
          names.push(ans);
        }
      }
    }
  }

  return [...new Set(names)];
}
