/**
 * Email Template Engine
 * 
 * Renders block-based templates stored in the DB into HTML emails
 * using the same dark/stars theme as the hardcoded templates.
 * 
 * Block types: heading, greeting, paragraph, button, highlight, 
 * data_row, card, credentials, divider, numbered_step, image
 */

import { database } from "@repo/database";

// ─── Types ──────────────────────────────────────────────────────────────────

export type BlockType =
  | "heading"
  | "greeting"
  | "paragraph"
  | "button"
  | "highlight"
  | "data_row"
  | "card"
  | "credentials"
  | "divider"
  | "numbered_step"
  | "spacer";

export interface TemplateBlock {
  type: BlockType;
  // Content varies by type — all optional, checked per-type
  text?: string;
  html?: string;
  label?: string;
  url?: string;
  value?: string;
  color?: string;
  title?: string;
  email?: string;
  password?: string;
  username?: string;
  loginUrl?: string;
  num?: number;
  body?: string;
}

export interface TemplateVariable {
  key: string;
  label: string;
  example: string;
}

export interface EmailTemplate {
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string | null;
  subject: string;
  blocks: TemplateBlock[];
  footerText: string | null;
  availableVariables: TemplateVariable[];
  isActive: boolean;
  isSystem: boolean;
  updatedBy: string | null;
  updatedAt: Date;
}

// ─── Design Tokens (same as email-templates.ts) ────────────────────────────

const D = {
  bg:           "#080b18",
  card:         "#0e1120",
  cardBorder:   "#1a1f3a",
  section:      "#12162b",
  sectionBorder:"#1e2444",
  text:         "#dde2f0",
  textMuted:    "#7c87b0",
  textHeading:  "#f0f4ff",
  textStrong:   "#ffffff",
  orange:       "#f97316",
  purple:       "#9333ea",
  teal:         "#00b0bb",
  divider:      "#1a1f3a",
};

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "https://hriq.remoteleverage.com").replace(/\/$/, "");
}

// ─── Header / Footer (same as email-templates.ts) ──────────────────────────

function starsBg(): string {
  const pts = [
    [14,8],[52,22],[88,6],[120,31],[167,12],[210,25],[248,8],[290,19],[330,5],[375,28],
    [412,14],[450,7],[490,24],[530,11],[565,30],[580,6],[22,46],[70,58],[110,42],[150,67],
    [195,50],[240,72],[285,55],[320,40],[360,63],[405,48],[445,70],[480,38],[520,54],[558,44],
    [8,78],[45,85],[92,75],[138,83],[180,77],[225,88],[268,80],[305,74],[350,86],[390,79],
    [432,84],[468,76],[510,88],[545,72],[575,82],[30,36],[75,15],[130,52],[220,40],[315,28],
    [410,62],[500,45],[560,22],[18,62],[96,30],[188,68],[280,16],[370,50],[460,34],[540,58],
  ];
  const circles = pts.map(([cx, cy], i) => {
    const r = i % 5 === 0 ? 1.2 : i % 3 === 0 ? 1.5 : 0.9;
    const op = (0.4 + (i % 7) * 0.08).toFixed(2);
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="white" opacity="${op}"/>`;
  }).join("");
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='600' height='90'>${circles}</svg>`;
  return `url("data:image/svg+xml,${svg.replace(/#/g, "%23").replace(/'/g, "%27").replace(/</g, "%3C").replace(/>/g, "%3E")}")`;
}

function headerHtml(): string {
  const stars = starsBg();
  return `
  <div style="position:relative;padding:22px 24px 20px;background:linear-gradient(135deg,#1a0a2e 0%,#0e0b28 40%,#081424 100%);background-image:${stars},linear-gradient(135deg,#1a0a2e 0%,#0e0b28 40%,#081424 100%);background-size:cover,cover;background-repeat:no-repeat,no-repeat;">
    <table cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
      <td style="vertical-align:middle;width:44px;">
        <img src="${appUrl()}/logo.png" alt="RL" width="44" height="44" style="display:block;border-radius:10px;width:44px;height:44px;max-width:44px;box-shadow:0 0 16px rgba(249,115,22,0.4);"/>
      </td>
      <td style="vertical-align:middle;padding-left:12px;">
        <div style="font-size:17px;font-weight:700;letter-spacing:0.3px;background:linear-gradient(90deg,#f97316,#9333ea);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;color:#f97316;">Remote Leverage</div>
        <div style="font-size:10px;color:rgba(255,255,255,0.4);margin-top:1px;letter-spacing:0.8px;text-transform:uppercase;">HRIQ Platform</div>
      </td>
    </tr></table>
  </div>`;
}

function footerHtml(extra?: string | null): string {
  return `
  <div style="padding:20px 24px;border-top:1px solid ${D.divider};background:${D.card};">
    ${extra ? `<div style="font-size:12px;color:${D.textMuted};line-height:1.5;margin-bottom:12px;">${extra}</div>` : ""}
    <div style="font-size:11px;color:${D.textMuted};line-height:1.6;margin-top:12px;opacity:0.7;">
      © ${new Date().getFullYear()} Remote Leverage LLC · 1900 Camden Ave, San Jose, CA 95124<br/>
      <a href="https://www.remoteleverage.com" style="color:${D.textMuted};text-decoration:underline;">remoteleverage.com</a>
    </div>
  </div>`;
}

// ─── Block Renderers ───────────────────────────────────────────────────────

function renderBlock(block: TemplateBlock): string {
  switch (block.type) {
    case "heading":
      return `<div style="font-size:22px;font-weight:700;color:${D.textHeading};margin:0 0 16px;line-height:1.3;">${block.text ?? ""}</div>`;

    case "greeting":
      return `<div style="font-size:14px;color:${D.text};margin-bottom:16px;line-height:1.6;">Hi ${block.text ?? "{{name}}"},</div>`;

    case "paragraph":
      return `<div style="font-size:14px;color:${D.text};line-height:1.65;margin-bottom:16px;">${block.html ?? block.text ?? ""}</div>`;

    case "button":
      return `
      <div style="text-align:center;margin:24px 0;">
        <a href="${block.url ?? "#"}" style="display:inline-block;background:linear-gradient(135deg,#f97316 0%,#9333ea 100%);color:#ffffff;padding:14px 40px;border-radius:10px;text-decoration:none;font-size:15px;font-weight:700;letter-spacing:0.3px;box-shadow:0 4px 20px rgba(249,115,22,0.35);">${block.label ?? "Click Here"}</a>
      </div>`;

    case "highlight": {
      const styles: Record<string, { bg: string; border: string; text: string }> = {
        orange: { bg: "#1c1008", border: "#7c3410", text: "#fb923c" },
        green:  { bg: "#0a1c0e", border: "#14532d", text: "#4ade80" },
        red:    { bg: "#1c0808", border: "#7f1d1d", text: "#f87171" },
        yellow: { bg: "#1c1808", border: "#713f12", text: "#facc15" },
        blue:   { bg: "#081020", border: "#1e3a5f", text: "#60a5fa" },
      };
      const s = styles[block.color ?? "yellow"] ?? styles.yellow;
      return `<div style="margin:16px 0;padding:14px 16px;border-radius:10px;background:${s.bg};border:1px solid ${s.border};font-size:13px;color:${s.text};line-height:1.6;">${block.html ?? block.text ?? ""}</div>`;
    }

    case "data_row":
      return `
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:6px;">
        <tr>
          <td style="font-size:13px;color:${D.textMuted};padding:6px 0;width:40%;">${block.label ?? ""}</td>
          <td style="font-size:13px;color:${D.textStrong};font-weight:600;padding:6px 0;text-align:right;">${block.value ?? ""}</td>
        </tr>
      </table>`;

    case "card":
      return `
      <div style="margin-bottom:16px;border:1px solid ${D.sectionBorder};border-radius:12px;background:${D.section};padding:16px;">
        <div style="font-size:14px;font-weight:700;color:${D.textHeading};margin-bottom:10px;">${block.title ?? ""}</div>
        <div style="font-size:13px;color:${D.text};line-height:1.65;">${block.html ?? block.text ?? ""}</div>
      </div>`;

    case "credentials":
      return `
      <div style="margin:20px 0;border:1px solid ${D.sectionBorder};border-radius:12px;background:${D.section};padding:20px;">
        <div style="font-size:14px;font-weight:700;color:${D.textHeading};margin-bottom:14px;">Your Login Credentials</div>
        <table cellpadding="0" cellspacing="0" border="0" width="100%">
          ${block.email ? `<tr><td style="font-size:12px;color:${D.textMuted};padding:4px 0;">Email</td><td style="font-size:13px;color:${D.textStrong};font-weight:600;padding:4px 0;text-align:right;font-family:monospace;">${block.email}</td></tr>` : ""}
          ${block.username ? `<tr><td style="font-size:12px;color:${D.textMuted};padding:4px 0;">Username</td><td style="font-size:13px;color:${D.textStrong};font-weight:600;padding:4px 0;text-align:right;font-family:monospace;">${block.username}</td></tr>` : ""}
          ${block.password ? `<tr><td style="font-size:12px;color:${D.textMuted};padding:4px 0;">Password</td><td style="font-size:13px;color:#f97316;font-weight:600;padding:4px 0;text-align:right;font-family:monospace;">${block.password}</td></tr>` : ""}
        </table>
        ${block.loginUrl ? `<div style="text-align:center;margin-top:14px;"><a href="${block.loginUrl}" style="display:inline-block;background:${D.section};color:${D.text};padding:10px 20px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600;border:1px solid ${D.sectionBorder};">Log In →</a></div>` : ""}
      </div>`;

    case "numbered_step":
      return `
      <div style="display:flex;gap:12px;margin-bottom:14px;">
        <div style="flex-shrink:0;width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#f97316,#9333ea);color:#fff;font-size:13px;font-weight:700;text-align:center;line-height:28px;">${block.num ?? 1}</div>
        <div>
          <div style="font-size:14px;font-weight:700;color:${D.textHeading};margin-bottom:4px;">${block.title ?? ""}</div>
          <div style="font-size:13px;color:${D.text};line-height:1.6;">${block.body ?? block.html ?? ""}</div>
        </div>
      </div>`;

    case "divider":
      return `<div style="height:1px;background:${D.divider};margin:20px 0;"></div>`;

    case "spacer":
      return `<div style="height:16px;"></div>`;

    default:
      return "";
  }
}

// ─── Template Renderer ─────────────────────────────────────────────────────

/**
 * Replace {{variable}} placeholders in text with actual values.
 */
function interpolate(text: string, variables: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key) => variables[key] ?? match);
}

/**
 * Render a full email from a template and variables.
 * Returns { subject, html } ready for sendViaGmail.
 */
export function renderTemplate(
  template: { subject: string; blocks: TemplateBlock[]; footerText?: string | null },
  variables: Record<string, string> = {}
): { subject: string; html: string } {
  const subject = interpolate(template.subject, variables);

  // Render each block with variable interpolation
  const bodyHtml = template.blocks.map((block) => {
    // Deep-interpolate all string values in the block
    const interpolated = { ...block };
    for (const [k, v] of Object.entries(interpolated)) {
      if (typeof v === "string") {
        (interpolated as any)[k] = interpolate(v, variables);
      }
    }
    return renderBlock(interpolated);
  }).join("");

  const footerText = template.footerText ? interpolate(template.footerText, variables) : undefined;

  const html = `
  <div style="margin:0;padding:0;background:${D.bg};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
    <div style="max-width:600px;margin:24px auto;background:${D.card};border:1px solid ${D.cardBorder};border-radius:14px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.6);">
      ${headerHtml()}
      <div style="padding:28px 24px;background:${D.card};">
        ${bodyHtml}
      </div>
      ${footerHtml(footerText)}
    </div>
  </div>`;

  return { subject, html };
}

// ─── DB Lookups ────────────────────────────────────────────────────────────

/**
 * Get a template by slug. Returns null if not found or inactive.
 */
export async function getTemplateBySlug(slug: string): Promise<EmailTemplate | null> {
  try {
    const rows = await database.$queryRaw<any[]>`
      SELECT id, slug, name, category, description, subject, blocks, footer_text,
             available_variables, is_active, is_system, updated_by, updated_at
      FROM hriq_email_templates
      WHERE slug = ${slug} AND is_active = true
      LIMIT 1
    `;
    if (!rows || rows.length === 0) return null;
    const r = rows[0];
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
  } catch (err) {
    console.error(`[email-template-engine] Failed to load template '${slug}':`, err);
    return null;
  }
}

/**
 * Try to render an email from a DB template. If the template doesn't exist
 * or is inactive, returns null so the caller can fall back to the hardcoded version.
 */
export async function tryRenderFromDb(
  slug: string,
  variables: Record<string, string> = {}
): Promise<{ subject: string; html: string } | null> {
  const template = await getTemplateBySlug(slug);
  if (!template) return null;
  return renderTemplate(template, variables);
}

/**
 * Try DB template first, fall back to hardcoded. Safe to call from anywhere.
 * If the DB template is missing/inactive/errors, returns the fallback seamlessly.
 */
export async function buildEmail(
  slug: string,
  variables: Record<string, string>,
  fallbackHtml: string,
  fallbackSubject: string,
): Promise<{ subject: string; html: string }> {
  try {
    const dbResult = await tryRenderFromDb(slug, variables);
    if (dbResult) return dbResult;
  } catch (e) {
    console.warn(`[email-template-engine] DB template '${slug}' failed, using hardcoded:`, e);
  }
  return { html: fallbackHtml, subject: fallbackSubject };
}
