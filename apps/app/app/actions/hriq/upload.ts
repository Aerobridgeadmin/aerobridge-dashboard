"use server";

import { requireRole } from "@repo/auth/session";
import { getSupabaseAdmin, getSignedStorageUrl } from "./constants";
import { HriqError } from "@/lib/hriq/errors";

/** Strip path traversal characters and restrict to safe alphanumeric + dash/underscore */
function sanitizePath(segment: string): string {
  return segment.replace(/[^a-zA-Z0-9_\-\.]/g, "_").replace(/\.+/g, ".").slice(0, 100);
}

const ALLOWED_EXTENSIONS = new Set([
  "pdf", "doc", "docx", "xls", "xlsx", "csv", "txt", "rtf",
  "jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "tiff",
  "mp4", "mov", "avi", "zip", "rar",
]);

function sanitizeExtension(fileName: string): string {
  const ext = (fileName.split(".").pop() ?? "").toLowerCase();
  return ALLOWED_EXTENSIONS.has(ext) ? ext : "bin";
}

export async function uploadOrgDocument(formData: FormData): Promise<{ url: string; fileName: string; storagePath?: string }> {
  await requireRole("super_admin");

  const file = formData.get("file") as File;
  const orgId = formData.get("orgId") as string;
  const docType = formData.get("docType") as string;

  if (!file || file.size === 0) throw new HriqError("HRIQ-1801");
  if (!orgId) throw new HriqError("HRIQ-0102");
  if (!docType) throw new HriqError("HRIQ-0303");

  if (file.size > 10 * 1024 * 1024) throw new HriqError("HRIQ-1802");

  const supabase = getSupabaseAdmin();
  const ext = sanitizeExtension(file.name);
  const path = `${sanitizePath(orgId)}/${sanitizePath(docType)}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage
    .from("org-documents")
    .upload(path, buffer, {
      contentType: file.type,
      upsert: true,
    });

  if (error) throw new HriqError("HRIQ-1804", `Upload failed: ${error.message}`);

  const signedUrl = await getSignedStorageUrl("org-documents", path);

  return { url: signedUrl, fileName: file.name };
}

export async function uploadEmployeePhoto(formData: FormData): Promise<{ url: string }> {
  const session = await requireRole("super_admin", "admin", "manager");

  const file = formData.get("file") as File;
  const employeeId = formData.get("employeeId") as string;

  if (!file || file.size === 0) throw new HriqError("HRIQ-1801");
  if (!employeeId) throw new HriqError("HRIQ-9903", "No employee ID");
  if (file.size > 10 * 1024 * 1024) throw new HriqError("HRIQ-1802", "Photo too large");
  if (!file.type.startsWith("image/")) throw new HriqError("HRIQ-1803");

  // Verify employee belongs to caller's org (super_admin can access any)
  const { database } = await import("@repo/database");
  const isSuperAdmin = session.orgRole === "super_admin";
  if (!isSuperAdmin && !session.orgId) throw new HriqError("HRIQ-0102");
  const employee = await database.employee.findFirst({
    where: isSuperAdmin ? { id: employeeId } : { id: employeeId, organizationId: session.orgId! },
    select: { id: true },
  });
  if (!employee) throw new HriqError("HRIQ-0201");

  const supabase = getSupabaseAdmin();
  const ext = sanitizeExtension(file.name);
  const path = `employees/${sanitizePath(employeeId)}/photo.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage
    .from("org-documents")
    .upload(path, buffer, { contentType: file.type, upsert: true });

  if (error) throw new HriqError("HRIQ-1804", `Upload failed: ${error.message}`);

  const signedUrl = await getSignedStorageUrl("org-documents", path);

  // Update employee record with photo URL
  await database.employee.update({
    where: { id: employeeId },
    data: { photoUrl: signedUrl },
  });

  return { url: signedUrl };
}

export async function uploadEmployeeDocument(formData: FormData): Promise<{ url: string; fileName: string; storagePath?: string }> {
  const session = await requireRole("super_admin", "admin", "manager");

  const file = formData.get("file") as File;
  const employeeId = formData.get("employeeId") as string;
  const docType = formData.get("docType") as string;

  if (!file || file.size === 0) throw new HriqError("HRIQ-1801");
  if (!employeeId) throw new HriqError("HRIQ-9903", "No employee ID");

  if (file.size > 10 * 1024 * 1024) throw new HriqError("HRIQ-1802");

  // Verify employee belongs to caller's org (super_admin can access any)
  const { database } = await import("@repo/database");
  const isSuperAdmin = session.orgRole === "super_admin";
  if (!isSuperAdmin && !session.orgId) throw new HriqError("HRIQ-0102");
  const employee = await database.employee.findFirst({
    where: isSuperAdmin ? { id: employeeId } : { id: employeeId, organizationId: session.orgId! },
    select: { id: true },
  });
  if (!employee) throw new HriqError("HRIQ-0201");

  const supabase = getSupabaseAdmin();
  const ext = sanitizeExtension(file.name);
  const timestamp = Date.now();
  const path = `employees/${sanitizePath(employeeId)}/${sanitizePath(docType ?? "document")}_${timestamp}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage
    .from("org-documents")
    .upload(path, buffer, {
      contentType: file.type,
      upsert: true,
    });

  if (error) throw new HriqError("HRIQ-1804", `Upload failed: ${error.message}`);

  const signedUrl = await getSignedStorageUrl("org-documents", path);

  return { url: signedUrl, fileName: file.name, storagePath: path };
}

/**
 * Upload or update an organization's logo.
 * Stores in Supabase storage, updates the org record, and cascades
 * the logo as the default photo for all contractors that don't have
 * a custom photo (photoUrl IS NULL or still set to the old org logo).
 */
export async function uploadOrgLogo(formData: FormData): Promise<{ url: string; error?: string }> {
  try {
    await requireRole("super_admin");
  } catch (e) {
    console.error("[uploadOrgLogo] Role check failed:", e);
    return { url: "", error: "Insufficient permissions. Only super admins can upload logos." };
  }

  const file = formData.get("file") as File;
  const orgId = formData.get("orgId") as string;

  if (!file || file.size === 0) return { url: "", error: "No file provided." };
  if (!orgId) return { url: "", error: "Organization ID is required." };
  if (file.size > 4 * 1024 * 1024) return { url: "", error: "Logo must be under 4 MB. Large images are automatically compressed before upload." };
  if (!file.type.startsWith("image/")) return { url: "", error: `Logo must be an image. Got: ${file.type}` };

  try {
    const { database } = await import("@repo/database");

    // Get current logo URL so we can update employees still using the old one
    const org = await database.organization.findUnique({
      where: { id: orgId },
      select: { logoUrl: true },
    });
    const oldLogoUrl = org?.logoUrl;

    const supabase = getSupabaseAdmin();
    const ext = sanitizeExtension(file.name);
    const path = `logos/${sanitizePath(orgId)}/logo.${ext}`;

    console.info(`[uploadOrgLogo] Uploading to org-documents/${path} (${file.size} bytes, ${file.type})`);

    const buffer = Buffer.from(await file.arrayBuffer());

    const { error } = await supabase.storage
      .from("org-documents")
      .upload(path, buffer, { contentType: file.type, upsert: true });

    if (error) {
      console.error("[uploadOrgLogo] Storage upload failed:", error);
      return { url: "", error: `Upload failed: ${error.message}` };
    }

    const signedUrl = await getSignedStorageUrl("org-documents", path, 60 * 60 * 24 * 365 * 10); // 10 years for logos
    console.info(`[uploadOrgLogo] Signed URL generated, updating org ${orgId}`);

    // 1. Update the organization logo
    await database.organization.update({
      where: { id: orgId },
      data: { logoUrl: signedUrl },
    });

    // 2. Cascade: set logo as default photo for employees without a custom photo
    if (oldLogoUrl) {
      await database.$executeRaw`
        UPDATE hriq_employees
        SET photo_url = ${signedUrl}, updated_at = NOW()
        WHERE organization_id = ${orgId}
        AND (photo_url IS NULL OR photo_url = ${oldLogoUrl})
      `;
    } else {
      await database.$executeRaw`
        UPDATE hriq_employees
        SET photo_url = ${signedUrl}, updated_at = NOW()
        WHERE organization_id = ${orgId}
        AND photo_url IS NULL
      `;
    }

    // Revalidate pages
    const { revalidatePath } = await import("next/cache");
    revalidatePath("/", "layout");
    revalidatePath("/[orgSlug]/employees", "page");
    revalidatePath("/[orgSlug]", "page");

    console.info(`[uploadOrgLogo] Success for org ${orgId}`);
    return { url: signedUrl };
  } catch (err) {
    console.error("[uploadOrgLogo] Unexpected error:", err);
    return { url: "", error: err instanceof Error ? err.message : "An unexpected error occurred during upload." };
  }
}

/**
 * Upload a document as a contractor (self-service).
 * Only allows uploading to the caller's own employee record.
 */
export async function uploadMyDocumentFile(formData: FormData): Promise<{ url: string; fileName: string; storagePath?: string }> {
  const { requireSession } = await import("@repo/auth/session");
  const session = await requireSession();
  const { database } = await import("@repo/database");

  const employee = await database.employee.findFirst({
    where: { linkedUserId: session.userId, ...(session.orgId ? { organizationId: session.orgId } : {}) },
    select: { id: true },
  });
  if (!employee) throw new HriqError("HRIQ-2501");

  const file = formData.get("file") as File;
  const docType = (formData.get("docType") as string) || "document";

  if (!file || file.size === 0) throw new HriqError("HRIQ-1801");
  if (file.size > 10 * 1024 * 1024) throw new HriqError("HRIQ-1802");

  const supabase = getSupabaseAdmin();
  const ext = sanitizeExtension(file.name);
  const timestamp = Date.now();
  const path = `employees/${sanitizePath(employee.id)}/${sanitizePath(docType)}_${timestamp}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage
    .from("org-documents")
    .upload(path, buffer, {
      contentType: file.type,
      upsert: true,
    });

  if (error) throw new HriqError("HRIQ-1804", `Upload failed: ${error.message}`);

  const signedUrl = await getSignedStorageUrl("org-documents", path);

  return { url: signedUrl, fileName: file.name };
}
