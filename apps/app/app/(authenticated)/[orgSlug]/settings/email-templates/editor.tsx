"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  PlusIcon, TrashIcon, ArrowUpIcon, ArrowDownIcon, SaveIcon, EyeIcon, XIcon,
  MailIcon, TypeIcon, MessageSquareIcon, MousePointerClickIcon, AlertTriangleIcon,
  LayoutListIcon, KeyIcon, MinusIcon, HashIcon, SpaceIcon, CopyIcon, CheckIcon,
  ChevronLeftIcon, SearchIcon,
} from "lucide-react";
import { useToast } from "@/app/(authenticated)/components/toast-provider";

// ─── Types ──────────────────────────────────────────────────────────────────

type BlockType = "heading" | "greeting" | "paragraph" | "button" | "highlight" | "data_row" | "card" | "credentials" | "divider" | "numbered_step" | "spacer";

interface Block {
  type: BlockType;
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

interface Variable {
  key: string;
  label: string;
  example: string;
}

interface Template {
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string | null;
  subject: string;
  blocks: Block[];
  footerText: string | null;
  availableVariables: Variable[];
  isActive: boolean;
  isSystem: boolean;
}

const BLOCK_TYPES: Array<{ type: BlockType; label: string; icon: any; description: string }> = [
  { type: "heading", label: "Heading", icon: TypeIcon, description: "Large bold title" },
  { type: "greeting", label: "Greeting", icon: MessageSquareIcon, description: "Hi {{name}}," },
  { type: "paragraph", label: "Paragraph", icon: LayoutListIcon, description: "Body text (supports HTML)" },
  { type: "button", label: "Button", icon: MousePointerClickIcon, description: "Call-to-action button" },
  { type: "highlight", label: "Highlight Box", icon: AlertTriangleIcon, description: "Colored alert/info box" },
  { type: "data_row", label: "Data Row", icon: MinusIcon, description: "Label → Value pair" },
  { type: "card", label: "Card", icon: LayoutListIcon, description: "Titled content card" },
  { type: "credentials", label: "Credentials", icon: KeyIcon, description: "Login email/password box" },
  { type: "numbered_step", label: "Numbered Step", icon: HashIcon, description: "Step with number badge" },
  { type: "divider", label: "Divider", icon: MinusIcon, description: "Horizontal line" },
  { type: "spacer", label: "Spacer", icon: SpaceIcon, description: "Vertical space" },
];

const CATEGORY_LABELS: Record<string, string> = {
  internal: "Internal (Contractor)",
  external: "External (Client)",
  admin: "Admin Notification",
};

// ─── Main Component ─────────────────────────────────────────────────────────

export function EmailTemplateEditor() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Template | null>(null);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");

  useEffect(() => {
    (async () => {
      const { listEmailTemplates } = await import("@/app/actions/hriq/email-templates-crud");
      const data = await listEmailTemplates();
      setTemplates(data as Template[]);
      setLoading(false);
    })();
  }, []);

  const refresh = useCallback(async () => {
    const { listEmailTemplates } = await import("@/app/actions/hriq/email-templates-crud");
    const data = await listEmailTemplates();
    setTemplates(data as Template[]);
  }, []);

  const filtered = templates.filter((t) => {
    if (catFilter !== "all" && t.category !== catFilter) return false;
    if (search && !t.name.toLowerCase().includes(search.toLowerCase()) && !t.slug.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (selected) {
    return <TemplateEditorView template={selected} onBack={() => { setSelected(null); refresh(); }} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Email Templates</h2>
          <p className="text-sm text-muted-foreground">{templates.length} templates · Edit content, preview, and publish without code changes</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1 max-w-sm">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates..."
            className="h-9 w-full rounded-lg border bg-background pl-9 pr-3 text-sm"
          />
        </div>
        {["all", "internal", "external", "admin"].map((c) => (
          <button
            key={c}
            onClick={() => setCatFilter(c)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${catFilter === c ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
          >
            {c === "all" ? "All" : CATEGORY_LABELS[c] ?? c}
          </button>
        ))}
      </div>

      {/* Template List */}
      {loading ? (
        <div className="py-20 text-center text-muted-foreground">Loading templates...</div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground">No templates found</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelected(t)}
              className="w-full text-left rounded-xl border bg-card p-4 hover:bg-accent transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <MailIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-sm font-semibold truncate">{t.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      t.category === "internal" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" :
                      t.category === "external" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" :
                      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                    }`}>{t.category}</span>
                    {!t.isActive && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300">Inactive</span>}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground truncate">Subject: {t.subject}</p>
                  {t.description && <p className="text-xs text-muted-foreground/70 truncate">{t.description}</p>}
                </div>
                <div className="flex-shrink-0 ml-4 text-xs text-muted-foreground">
                  {t.blocks.length} blocks · {t.availableVariables.length} vars
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Editor View ────────────────────────────────────────────────────────────

function TemplateEditorView({ template, onBack }: { template: Template; onBack: () => void }) {
  const [subject, setSubject] = useState(template.subject);
  const [blocks, setBlocks] = useState<Block[]>(template.blocks);
  const [footerText, setFooterText] = useState(template.footerText ?? "");
  const [variables, setVariables] = useState<Variable[]>(template.availableVariables);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [showAddBlock, setShowAddBlock] = useState(false);
  const previewRef = useRef<HTMLIFrameElement>(null);
  const { addToast } = useToast();

  // Live preview
  const updatePreview = useCallback(async () => {
    try {
      const { previewEmailTemplate } = await import("@/app/actions/hriq/email-templates-crud");
      const result = await previewEmailTemplate(subject, blocks as any, footerText || null, variables as any);
      setPreviewHtml(result.html);
    } catch {}
  }, [subject, blocks, footerText, variables]);

  useEffect(() => { updatePreview(); }, [updatePreview]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { updateEmailTemplate } = await import("@/app/actions/hriq/email-templates-crud");
      const result = await updateEmailTemplate(template.id, { subject, blocks: blocks as any, footerText: footerText || null, availableVariables: variables as any });
      if (result.success) {
        setSaved(true);
        addToast({ title: "Template Saved", message: "Email template updated successfully.", variant: "success", icon: "✓" });
        setTimeout(() => setSaved(false), 2000);
      } else {
        addToast({ title: "Save Failed", message: result.error ?? "An error occurred while saving the template.", variant: "warning", icon: "!" });
      }
    } catch (err) {
      addToast({ title: "Save Failed", message: "An unexpected error occurred. Please try again.", variant: "warning", icon: "!" });
    } finally {
      setSaving(false);
    }
  };

  const addBlock = (type: BlockType) => {
    const newBlock: Block = { type };
    if (type === "heading") newBlock.text = "New Heading";
    if (type === "greeting") newBlock.text = "{{name}}";
    if (type === "paragraph") newBlock.html = "Enter your text here...";
    if (type === "button") { newBlock.label = "Click Here"; newBlock.url = "{{dashboard_url}}"; }
    if (type === "highlight") { newBlock.color = "yellow"; newBlock.html = "Important message here"; }
    if (type === "data_row") { newBlock.label = "Label"; newBlock.value = "Value"; }
    if (type === "card") { newBlock.title = "Card Title"; newBlock.html = "Card content"; }
    if (type === "credentials") { newBlock.email = "{{email}}"; newBlock.password = "{{password}}"; newBlock.loginUrl = "{{login_url}}"; }
    if (type === "numbered_step") { newBlock.num = blocks.filter(b => b.type === "numbered_step").length + 1; newBlock.title = "Step Title"; newBlock.body = "Step details"; }
    setBlocks([...blocks, newBlock]);
    setShowAddBlock(false);
  };

  const updateBlock = (index: number, updates: Partial<Block>) => {
    setBlocks(blocks.map((b, i) => i === index ? { ...b, ...updates } : b));
  };

  const removeBlock = (index: number) => setBlocks(blocks.filter((_, i) => i !== index));
  const moveBlock = (index: number, dir: -1 | 1) => {
    const newBlocks = [...blocks];
    const target = index + dir;
    if (target < 0 || target >= newBlocks.length) return;
    [newBlocks[index], newBlocks[target]] = [newBlocks[target], newBlocks[index]];
    setBlocks(newBlocks);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="rounded-lg border p-2 hover:bg-muted"><ChevronLeftIcon className="h-4 w-4" /></button>
          <div>
            <h2 className="text-lg font-semibold">{template.name}</h2>
            <p className="text-xs text-muted-foreground">slug: {template.slug} · {template.category}</p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saved ? <CheckIcon className="h-4 w-4" /> : <SaveIcon className="h-4 w-4" />}
          {saving ? "Saving..." : saved ? "Saved!" : "Save Changes"}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Left: Editor */}
        <div className="space-y-4">
          {/* Subject */}
          <div className="rounded-xl border bg-card p-4">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Subject Line</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-2 h-10 w-full rounded-lg border bg-background px-3 text-sm font-medium" />
          </div>

          {/* Blocks */}
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Content Blocks</label>
              <button onClick={() => setShowAddBlock(!showAddBlock)} className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground">
                <PlusIcon className="h-3.5 w-3.5" /> Add Block
              </button>
            </div>

            {showAddBlock && (
              <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/50 p-3">
                {BLOCK_TYPES.map((bt) => (
                  <button key={bt.type} onClick={() => addBlock(bt.type)} className="flex items-center gap-2 rounded-lg border bg-background p-2 text-left hover:bg-accent transition-colors">
                    <bt.icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div>
                      <div className="text-xs font-medium">{bt.label}</div>
                      <div className="text-[10px] text-muted-foreground">{bt.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {blocks.map((block, i) => (
              <BlockEditor key={i} block={block} index={i} total={blocks.length}
                onUpdate={(updates) => updateBlock(i, updates)}
                onRemove={() => removeBlock(i)}
                onMove={(dir) => moveBlock(i, dir)}
              />
            ))}
          </div>

          {/* Footer */}
          <div className="rounded-xl border bg-card p-4">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Footer Text</label>
            <input value={footerText} onChange={(e) => setFooterText(e.target.value)} placeholder="Optional footer message..." className="mt-2 h-9 w-full rounded-lg border bg-background px-3 text-sm" />
          </div>

          {/* Variables */}
          <div className="rounded-xl border bg-card p-4">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Available Variables</label>
            <p className="text-[10px] text-muted-foreground mt-1 mb-3">Use {"{{variable}}"} syntax in any text field</p>
            <div className="space-y-2">
              {variables.map((v, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <code className="bg-muted px-2 py-1 rounded text-xs font-mono flex-shrink-0">{`{{${v.key}}}`}</code>
                  <input value={v.label} onChange={(e) => { const nv = [...variables]; nv[i] = { ...nv[i], label: e.target.value }; setVariables(nv); }} className="h-7 flex-1 rounded border bg-background px-2 text-xs" placeholder="Label" />
                  <input value={v.example} onChange={(e) => { const nv = [...variables]; nv[i] = { ...nv[i], example: e.target.value }; setVariables(nv); }} className="h-7 w-28 rounded border bg-background px-2 text-xs" placeholder="Example" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Preview */}
        <div className="rounded-xl border bg-card overflow-hidden sticky top-4">
          <div className="flex items-center gap-2 border-b px-4 py-3">
            <EyeIcon className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Live Preview</span>
            <span className="ml-auto text-xs text-muted-foreground">Subject: {subject}</span>
          </div>
          <iframe
            ref={previewRef}
            srcDoc={previewHtml || "<div style='padding:40px;color:#888;text-align:center;font-family:sans-serif;'>Loading preview...</div>"}
            className="w-full border-0"
            style={{ height: "700px", background: "#080b18" }}
            sandbox="allow-same-origin"
          />
        </div>
      </div>
    </div>
  );
}

// ─── Block Editor ───────────────────────────────────────────────────────────

function BlockEditor({ block, index, total, onUpdate, onRemove, onMove }: {
  block: Block; index: number; total: number;
  onUpdate: (updates: Partial<Block>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const meta = BLOCK_TYPES.find((bt) => bt.type === block.type);
  const Icon = meta?.icon ?? LayoutListIcon;

  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold">{meta?.label ?? block.type}</span>
        <span className="text-[10px] text-muted-foreground">#{index + 1}</span>
        <div className="ml-auto flex gap-1">
          <button onClick={() => onMove(-1)} disabled={index === 0} className="p-1 rounded hover:bg-muted disabled:opacity-30"><ArrowUpIcon className="h-3 w-3" /></button>
          <button onClick={() => onMove(1)} disabled={index === total - 1} className="p-1 rounded hover:bg-muted disabled:opacity-30"><ArrowDownIcon className="h-3 w-3" /></button>
          <button onClick={onRemove} className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500"><TrashIcon className="h-3 w-3" /></button>
        </div>
      </div>

      {/* Block-specific fields */}
      {block.type === "heading" && (
        <input value={block.text ?? ""} onChange={(e) => onUpdate({ text: e.target.value })} placeholder="Heading text" className="h-8 w-full rounded border bg-muted/50 px-2 text-sm" />
      )}
      {block.type === "greeting" && (
        <input value={block.text ?? ""} onChange={(e) => onUpdate({ text: e.target.value })} placeholder="{{name}}" className="h-8 w-full rounded border bg-muted/50 px-2 text-sm" />
      )}
      {block.type === "paragraph" && (
        <textarea value={block.html ?? ""} onChange={(e) => onUpdate({ html: e.target.value })} placeholder="Paragraph text (HTML supported)" className="w-full rounded border bg-muted/50 px-2 py-1.5 text-sm min-h-[60px] resize-y" />
      )}
      {block.type === "button" && (
        <div className="flex gap-2">
          <input value={block.label ?? ""} onChange={(e) => onUpdate({ label: e.target.value })} placeholder="Button label" className="h-8 flex-1 rounded border bg-muted/50 px-2 text-sm" />
          <input value={block.url ?? ""} onChange={(e) => onUpdate({ url: e.target.value })} placeholder="URL or {{variable}}" className="h-8 flex-1 rounded border bg-muted/50 px-2 text-sm font-mono text-xs" />
        </div>
      )}
      {block.type === "highlight" && (
        <>
          <div className="flex gap-1 mb-2">
            {(["orange", "green", "red", "yellow", "blue"] as const).map((c) => (
              <button key={c} onClick={() => onUpdate({ color: c })} className={`w-6 h-6 rounded-full border-2 ${block.color === c ? "border-white" : "border-transparent"}`} style={{ backgroundColor: { orange: "#f97316", green: "#22c55e", red: "#ef4444", yellow: "#eab308", blue: "#3b82f6" }[c] }} />
            ))}
          </div>
          <textarea value={block.html ?? ""} onChange={(e) => onUpdate({ html: e.target.value })} placeholder="Highlight content (HTML)" className="w-full rounded border bg-muted/50 px-2 py-1.5 text-sm min-h-[40px] resize-y" />
        </>
      )}
      {block.type === "data_row" && (
        <div className="flex gap-2">
          <input value={block.label ?? ""} onChange={(e) => onUpdate({ label: e.target.value })} placeholder="Label" className="h-8 flex-1 rounded border bg-muted/50 px-2 text-sm" />
          <input value={block.value ?? ""} onChange={(e) => onUpdate({ value: e.target.value })} placeholder="Value or {{variable}}" className="h-8 flex-1 rounded border bg-muted/50 px-2 text-sm" />
        </div>
      )}
      {block.type === "card" && (
        <>
          <input value={block.title ?? ""} onChange={(e) => onUpdate({ title: e.target.value })} placeholder="Card title" className="h-8 w-full rounded border bg-muted/50 px-2 text-sm mb-2" />
          <textarea value={block.html ?? ""} onChange={(e) => onUpdate({ html: e.target.value })} placeholder="Card content" className="w-full rounded border bg-muted/50 px-2 py-1.5 text-sm min-h-[40px] resize-y" />
        </>
      )}
      {block.type === "credentials" && (
        <div className="grid grid-cols-2 gap-2">
          <input value={block.email ?? ""} onChange={(e) => onUpdate({ email: e.target.value })} placeholder="{{email}}" className="h-8 rounded border bg-muted/50 px-2 text-xs font-mono" />
          <input value={block.password ?? ""} onChange={(e) => onUpdate({ password: e.target.value })} placeholder="{{password}}" className="h-8 rounded border bg-muted/50 px-2 text-xs font-mono" />
          <input value={block.username ?? ""} onChange={(e) => onUpdate({ username: e.target.value })} placeholder="{{username}} (optional)" className="h-8 rounded border bg-muted/50 px-2 text-xs font-mono" />
          <input value={block.loginUrl ?? ""} onChange={(e) => onUpdate({ loginUrl: e.target.value })} placeholder="{{login_url}}" className="h-8 rounded border bg-muted/50 px-2 text-xs font-mono" />
        </div>
      )}
      {block.type === "numbered_step" && (
        <>
          <div className="flex gap-2 mb-2">
            <input type="number" value={block.num ?? 1} onChange={(e) => onUpdate({ num: parseInt(e.target.value) || 1 })} className="h-8 w-16 rounded border bg-muted/50 px-2 text-sm text-center" />
            <input value={block.title ?? ""} onChange={(e) => onUpdate({ title: e.target.value })} placeholder="Step title" className="h-8 flex-1 rounded border bg-muted/50 px-2 text-sm" />
          </div>
          <textarea value={block.body ?? ""} onChange={(e) => onUpdate({ body: e.target.value })} placeholder="Step details" className="w-full rounded border bg-muted/50 px-2 py-1.5 text-sm min-h-[40px] resize-y" />
        </>
      )}
    </div>
  );
}
