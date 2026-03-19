"use server";

import { database } from "@repo/database";
import { getSessionContext } from "@repo/auth/session";
import { revalidatePath } from "next/cache";
import type { EmailTemplate, TemplateBlock, TemplateVariable } from "./email-template-engine";
import { renderTemplate } from "./email-template-engine";

// ─── List Templates ─────────────────────────────────────────────────────────

export async function listEmailTemplates(category?: string): Promise<EmailTemplate[]> {
  const ctx = await getSessionContext();
  if (!ctx || ctx.orgRole !== "super_admin") return [];

  const rows = await database.$queryRaw<any[]>`
    SELECT id, slug, name, category, description, subject, blocks, footer_text,
           available_variables, is_active, is_system, updated_by, updated_at
    FROM hriq_email_templates
    ORDER BY category, name
  `.catch(() => []);

  return (rows as any[])
    .filter((r) => !category || r.category === category)
    .map(mapRow);
}

// ─── Get Single Template ────────────────────────────────────────────────────

export async function getEmailTemplate(id: string): Promise<EmailTemplate | null> {
  const ctx = await getSessionContext();
  if (!ctx || ctx.orgRole !== "super_admin") return null;

  const rows = await database.$queryRaw<any[]>`
    SELECT id, slug, name, category, description, subject, blocks, footer_text,
           available_variables, is_active, is_system, updated_by, updated_at
    FROM hriq_email_templates
    WHERE id = ${id}::uuid
    LIMIT 1
  `.catch(() => []);

  return rows.length > 0 ? mapRow(rows[0]) : null;
}

// ─── Update Template ────────────────────────────────────────────────────────

export async function updateEmailTemplate(
  id: string,
  data: {
    name?: string;
    subject?: string;
    blocks?: TemplateBlock[];
    footerText?: string | null;
    description?: string | null;
    availableVariables?: TemplateVariable[];
    isActive?: boolean;
  }
): Promise<{ success: boolean; error?: string }> {
  const ctx = await getSessionContext();
  if (!ctx || ctx.orgRole !== "super_admin") {
    return { success: false, error: "Unauthorized" };
  }

  try {
    // Save version history before updating
    const current = await database.$queryRaw<any[]>`
      SELECT subject, blocks, footer_text FROM hriq_email_templates WHERE id = ${id}::uuid
    `;
    if (current.length > 0) {
      const blocksJson = JSON.stringify(current[0].blocks);
      await database.$executeRaw`
        INSERT INTO hriq_email_template_versions (template_id, subject, blocks, footer_text, edited_by)
        VALUES (${id}::uuid, ${current[0].subject}, ${blocksJson}::jsonb, ${current[0].footer_text}, ${ctx.userId})
      `;
    }

    // Use a single parameterized UPDATE that handles all fields
    const blocksJson = data.blocks !== undefined ? JSON.stringify(data.blocks) : null;
    const varsJson = data.availableVariables !== undefined ? JSON.stringify(data.availableVariables) : null;

    await database.$executeRaw`
      UPDATE hriq_email_templates SET
        updated_at = NOW(),
        updated_by = ${ctx.userId},
        name = COALESCE(${data.name ?? null}, name),
        subject = COALESCE(${data.subject ?? null}, subject),
        blocks = CASE WHEN ${blocksJson}::text IS NOT NULL THEN ${blocksJson}::jsonb ELSE blocks END,
        footer_text = CASE WHEN ${data.footerText === undefined ? false : true} THEN ${data.footerText ?? null} ELSE footer_text END,
        description = CASE WHEN ${data.description === undefined ? false : true} THEN ${data.description ?? null} ELSE description END,
        available_variables = CASE WHEN ${varsJson}::text IS NOT NULL THEN ${varsJson}::jsonb ELSE available_variables END,
        is_active = COALESCE(${data.isActive ?? null}, is_active)
      WHERE id = ${id}::uuid
    `;

    // Audit log
    try {
      await database.auditLog.create({
        data: {
          actorType: "user",
          actorUserId: ctx.userId,
          action: "email_template.updated",
          objectType: "email_template",
          objectId: id,
          newValue: { name: data.name, subject: data.subject },
        },
      }).catch(() => {});
    } catch {}

    revalidatePath("/[orgSlug]/settings/email-templates");
    return { success: true };
  } catch (err) {
    console.error("[email-templates-crud] Update failed:", err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Create Custom Template ─────────────────────────────────────────────────

export async function createEmailTemplate(data: {
  slug: string;
  name: string;
  category: string;
  subject: string;
  blocks: TemplateBlock[];
  description?: string;
  footerText?: string;
  availableVariables?: TemplateVariable[];
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const ctx = await getSessionContext();
  if (!ctx || ctx.orgRole !== "super_admin") {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const rows = await database.$queryRaw<any[]>`
      INSERT INTO hriq_email_templates (slug, name, category, subject, blocks, description, footer_text, available_variables, is_system, updated_by)
      VALUES (
        ${data.slug}, ${data.name}, ${data.category}, ${data.subject},
        ${JSON.stringify(data.blocks)}::jsonb,
        ${data.description ?? null}, ${data.footerText ?? null},
        ${JSON.stringify(data.availableVariables ?? [])}::jsonb,
        false, ${ctx.userId}
      )
      RETURNING id
    `;

    revalidatePath("/[orgSlug]/settings/email-templates");
    return { success: true, id: rows[0]?.id };
  } catch (err: any) {
    if (err.message?.includes("unique") || err.message?.includes("duplicate")) {
      return { success: false, error: "A template with this slug already exists" };
    }
    return { success: false, error: err.message };
  }
}

// ─── Delete (non-system only) ───────────────────────────────────────────────

export async function deleteEmailTemplate(id: string): Promise<{ success: boolean; error?: string }> {
  const ctx = await getSessionContext();
  if (!ctx || ctx.orgRole !== "super_admin") {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const result = await database.$executeRaw`
      DELETE FROM hriq_email_templates WHERE id = ${id}::uuid AND is_system = false
    `;
    if (result === 0) {
      return { success: false, error: "Cannot delete system templates. You can deactivate them instead." };
    }
    revalidatePath("/[orgSlug]/settings/email-templates");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Preview ────────────────────────────────────────────────────────────────

/**
 * Render a preview of a template with example variables.
 * Used by the editor for live preview.
 */
export async function previewEmailTemplate(
  subject: string,
  blocks: TemplateBlock[],
  footerText: string | null,
  variables: TemplateVariable[]
): Promise<{ subject: string; html: string }> {
  const ctx = await getSessionContext();
  if (!ctx || ctx.orgRole !== "super_admin") {
    return { subject: "", html: "" };
  }

  // Build example variables from the template's variable definitions
  const exampleVars: Record<string, string> = {};
  for (const v of variables) {
    exampleVars[v.key] = v.example;
  }

  return renderTemplate({ subject, blocks, footerText }, exampleVars);
}

// ─── Version History ────────────────────────────────────────────────────────

export async function getTemplateVersions(templateId: string): Promise<Array<{
  id: string;
  subject: string;
  editedBy: string | null;
  createdAt: string;
}>> {
  const ctx = await getSessionContext();
  if (!ctx || ctx.orgRole !== "super_admin") return [];

  const rows = await database.$queryRaw<any[]>`
    SELECT id, subject, edited_by, created_at
    FROM hriq_email_template_versions
    WHERE template_id = ${templateId}::uuid
    ORDER BY created_at DESC
    LIMIT 20
  `.catch(() => []);

  return (rows as any[]).map((r) => ({
    id: r.id,
    subject: r.subject,
    editedBy: r.edited_by,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  }));
}

/**
 * Restore a template to a previous version.
 */
export async function restoreTemplateVersion(templateId: string, versionId: string): Promise<{ success: boolean; error?: string }> {
  const ctx = await getSessionContext();
  if (!ctx || ctx.orgRole !== "super_admin") {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const versions = await database.$queryRaw<any[]>`
      SELECT subject, blocks, footer_text FROM hriq_email_template_versions
      WHERE id = ${versionId}::uuid AND template_id = ${templateId}::uuid
    `;
    if (versions.length === 0) return { success: false, error: "Version not found" };

    const v = versions[0];
    return updateEmailTemplate(templateId, {
      subject: v.subject,
      blocks: typeof v.blocks === "string" ? JSON.parse(v.blocks) : v.blocks,
      footerText: v.footer_text,
    });
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function mapRow(r: any): EmailTemplate {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    category: r.category,
    description: r.description,
    subject: r.subject,
    blocks: (typeof r.blocks === "string" ? JSON.parse(r.blocks) : r.blocks) as TemplateBlock[],
    footerText: r.footer_text,
    availableVariables: (typeof r.available_variables === "string" ? JSON.parse(r.available_variables) : r.available_variables) as TemplateVariable[],
    isActive: r.is_active,
    isSystem: r.is_system,
    updatedBy: r.updated_by,
    updatedAt: r.updated_at,
  };
}
