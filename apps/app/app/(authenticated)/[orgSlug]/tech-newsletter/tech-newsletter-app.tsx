"use client";

import { useState, useEffect, useCallback } from "react";
import { CustomSelect } from "@/app/(authenticated)/components/custom-select";
import { shortDate } from "@/lib/hriq/format";
import {
  NewspaperIcon, LoaderIcon, PlusIcon, SearchIcon, SendIcon, RefreshCwIcon,
  SettingsIcon, CheckIcon, XIcon, FileTextIcon, CalendarIcon, UsersIcon,
  Trash2Icon, PencilIcon, ClockIcon, MailIcon, ZapIcon, ImageIcon,
  ChevronDownIcon, ChevronUpIcon, EyeIcon, SaveIcon, AlertTriangleIcon,
  MessageSquareIcon, BellIcon, ImportIcon,
} from "lucide-react";

/* ═══ Types ═══ */
type Newsletter = { id: number; subject?: string; status?: string; created_at?: string; sent_at?: string; article_count?: number; open_rate?: number };
type Article = { id: number; newsletter_id?: number; title?: string; url?: string; summary?: string; source?: string; category?: string; sort_order?: number; is_included?: boolean };
type CompanyUpdate = { id: number; title?: string; content?: string; department?: string; author?: string; status?: string; created_at?: string };
type Recipient = { id: number; name?: string; email?: string; department?: string; active?: boolean; source?: string };
type Toast = { message: string; type: "success" | "error" | "info" } | null;

const API = "/api/tech-newsletter";

async function call<T = any>(path: string, method = "GET", body?: any, params?: Record<string, string>): Promise<T> {
  let url = `${API}${path}`;
  if (params) {
    const qs = new URLSearchParams(Object.entries(params).filter(([,v]) => !!v)).toString();
    if (qs) url += "?" + qs;
  }
  const opts: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body && method !== "GET") opts.body = JSON.stringify(body);
  const resp = await fetch(url, opts);
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || `API error ${resp.status}`);
  return data;
}

const DEPARTMENTS = ["General", "Tech", "Hiring", "Sales", "Marketing", "Recruiting", "Rev Ops"];

export function TechNewsletterApp() {
  const [tab, setTab] = useState<"newsletter" | "snap" | "updates" | "settings">("newsletter");
  const [toast, setToast] = useState<Toast>(null);
  function flash(message: string, type: "success" | "error" | "info" = "success") {
    setToast({ message, type }); setTimeout(() => setToast(null), 4000);
  }

  /* ═══ Newsletter Tab State ═══ */
  const [newsletters, setNewsletters] = useState<Newsletter[]>([]);
  const [currentDraft, setCurrentDraft] = useState<Newsletter | null>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [updates, setUpdates] = useState<CompanyUpdate[]>([]);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [aiQuery, setAiQuery] = useState("");
  const [aiSearching, setAiSearching] = useState(false);
  const [aiResults, setAiResults] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  /* ═══ Snap Tab State ═══ */
  const [snapSubject, setSnapSubject] = useState("");
  const [snapContent, setSnapContent] = useState("");
  const [snapAuthor, setSnapAuthor] = useState("");
  const [snapDept, setSnapDept] = useState("General");
  const [snapSending, setSnapSending] = useState(false);

  /* ═══ Submissions Tab State ═══ */
  const [submissions, setSubmissions] = useState<CompanyUpdate[]>([]);
  const [subDeptFilter, setSubDeptFilter] = useState("all");
  const [subStatusFilter, setSubStatusFilter] = useState("all");
  const [loadingSubs, setLoadingSubs] = useState(false);

  /* ═══ Settings Tab State ═══ */
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [recipientSearch, setRecipientSearch] = useState("");
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleDay, setScheduleDay] = useState("friday");
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [showAddRecipient, setShowAddRecipient] = useState(false);
  const [newRecName, setNewRecName] = useState("");
  const [newRecEmail, setNewRecEmail] = useState("");
  const [loadingSettings, setLoadingSettings] = useState(false);

  /* ═══ Newsletter Actions ═══ */
  async function loadNewsletterTab() {
    try {
      const [nlData, updData] = await Promise.allSettled([
        call("/newsletters"),
        call("/company-updates", "GET", undefined, { status: "approved" }),
      ]);
      if (nlData.status === "fulfilled") setNewsletters(nlData.value.newsletters || nlData.value.data || []);
      if (updData.status === "fulfilled") setUpdates(updData.value.updates || updData.value.data || []);
    } catch {}
  }

  async function createDraft() {
    setLoadingDraft(true);
    try {
      const data = await call("/newsletters", "POST", { days_back: 7, max_articles: 15 });
      const nl = data.newsletter || data;
      setCurrentDraft(nl);
      if (nl.id) await loadDraftDetail(nl.id);
      flash("Draft created");
    } catch (e: any) { flash(e.message, "error"); }
    finally { setLoadingDraft(false); }
  }

  async function loadDraftDetail(id: number) {
    try {
      const data = await call("/newsletter-detail", "GET", undefined, { id: String(id) });
      setArticles(data.articles || []);
      if (data.newsletter) setCurrentDraft(data.newsletter);
    } catch {}
  }

  async function saveDraft() {
    if (!currentDraft?.id) return;
    setSaving(true);
    try {
      const articleUpdates = articles.map(a => ({ id: a.id, is_included: a.is_included, sort_order: a.sort_order, title: a.title, summary: a.summary }));
      await call("/newsletter-detail", "PUT", { id: currentDraft.id, articles: articleUpdates });
      flash("Draft saved");
    } catch (e: any) { flash(e.message, "error"); }
    finally { setSaving(false); }
  }

  async function sendNewsletter() {
    if (!currentDraft?.id) return;
    if (!confirm("Send this newsletter to all active recipients?")) return;
    setSending(true);
    try {
      await call("/send-newsletter", "POST", { newsletter_id: currentDraft.id });
      flash("Newsletter sent!");
      setCurrentDraft(null); setArticles([]);
      loadNewsletterTab();
    } catch (e: any) { flash(e.message, "error"); }
    finally { setSending(false); }
  }

  async function doAiSearch() {
    if (!aiQuery.trim()) return;
    setAiSearching(true); setAiResults([]);
    try {
      const data = await call("/ai-search", "POST", { query: aiQuery });
      setAiResults(data.articles || data.results || []);
      if ((data.articles || data.results || []).length === 0) flash("No results found", "info");
    } catch (e: any) { flash(e.message, "error"); }
    finally { setAiSearching(false); }
  }

  function toggleArticle(idx: number) {
    setArticles(prev => prev.map((a, i) => i === idx ? { ...a, is_included: !a.is_included } : a));
  }

  function removeArticle(idx: number) {
    setArticles(prev => prev.filter((_, i) => i !== idx));
  }

  /* ═══ Snap Actions ═══ */
  async function sendSnap() {
    if (!snapSubject.trim() || !snapContent.trim()) { flash("Subject and content required", "error"); return; }
    setSnapSending(true);
    try {
      await call("/snap-update", "POST", { subject: snapSubject, content: snapContent, author: snapAuthor, department: snapDept });
      flash("Snap update sent!");
      setSnapSubject(""); setSnapContent(""); setSnapAuthor("");
    } catch (e: any) { flash(e.message, "error"); }
    finally { setSnapSending(false); }
  }

  /* ═══ Submissions Actions ═══ */
  async function loadSubmissions() {
    setLoadingSubs(true);
    try {
      const params: Record<string, string> = {};
      if (subDeptFilter !== "all") params.department = subDeptFilter;
      if (subStatusFilter !== "all") params.status = subStatusFilter;
      const data = await call("/company-updates", "GET", undefined, params);
      setSubmissions(data.updates || data.data || []);
    } catch {}
    finally { setLoadingSubs(false); }
  }

  async function patchUpdate(id: number, status: string) {
    try {
      await call("/company-updates", "PATCH", { id, status });
      flash(`Update ${status}`);
      loadSubmissions();
    } catch (e: any) { flash(e.message, "error"); }
  }

  async function deleteUpdate(id: number) {
    if (!confirm("Delete this update?")) return;
    try {
      await call("/company-updates", "DELETE", { id });
      flash("Deleted");
      loadSubmissions();
    } catch (e: any) { flash(e.message, "error"); }
  }

  /* ═══ Settings Actions ═══ */
  async function loadSettingsTab() {
    setLoadingSettings(true);
    try {
      const [recData, schedData] = await Promise.allSettled([
        call("/recipients"),
        call("/schedule"),
      ]);
      if (recData.status === "fulfilled") setRecipients(recData.value.recipients || recData.value.data || []);
      if (schedData.status === "fulfilled") {
        const sched = schedData.value.schedule || schedData.value;
        if (sched) {
          setScheduleEnabled(sched.enabled || false);
          setScheduleDay(sched.day || "friday");
          setScheduleTime(sched.time || "09:00");
        }
      }
    } catch {}
    finally { setLoadingSettings(false); }
  }

  async function addRecipient() {
    if (!newRecName.trim() || !newRecEmail.trim()) { flash("Name and email required", "error"); return; }
    try {
      await call("/recipients", "POST", { name: newRecName, email: newRecEmail });
      flash("Recipient added"); setNewRecName(""); setNewRecEmail(""); setShowAddRecipient(false);
      loadSettingsTab();
    } catch (e: any) { flash(e.message, "error"); }
  }

  async function deleteRecipient(id: number) {
    if (!confirm("Remove this recipient?")) return;
    try { await call("/recipients", "DELETE", { id }); flash("Removed"); loadSettingsTab(); }
    catch (e: any) { flash(e.message, "error"); }
  }

  async function saveSchedule() {
    try {
      await call("/schedule", "PUT", { enabled: scheduleEnabled, day: scheduleDay, time: scheduleTime });
      flash("Schedule saved");
    } catch (e: any) { flash(e.message, "error"); }
  }

  async function sendReminders() {
    try { await call("/send-reminders", "POST"); flash("Reminders sent"); }
    catch (e: any) { flash(e.message, "error"); }
  }

  async function importWorkspace() {
    if (!confirm("Import all workspace members as recipients?")) return;
    try {
      const data = await call("/import-workspace", "POST");
      flash(`Imported ${data.imported || 0} members`);
      loadSettingsTab();
    } catch (e: any) { flash(e.message, "error"); }
  }

  /* ═══ Tab loading ═══ */
  useEffect(() => {
    if (tab === "newsletter") loadNewsletterTab();
    else if (tab === "updates") loadSubmissions();
    else if (tab === "settings") loadSettingsTab();
  }, [tab]);

  const includedArticles = articles.filter(a => a.is_included !== false);
  const filteredRecipients = recipientSearch ? recipients.filter(r => r.name?.toLowerCase().includes(recipientSearch.toLowerCase()) || r.email?.toLowerCase().includes(recipientSearch.toLowerCase())) : recipients;

  /* ═══ RENDER ═══ */
  return (
    <div className="flex flex-1 flex-col p-4 sm:p-6">
      <div className="mx-auto w-full max-w-5xl space-y-4">
        {/* Toast */}
        {toast && (
          <div className={"fixed right-4 top-4 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm shadow-lg " + (toast.type === "success" ? "bg-emerald-600 text-white" : toast.type === "error" ? "bg-red-600 text-white" : "bg-primary text-primary-foreground")}>
            {toast.type === "success" ? <CheckIcon className="h-4 w-4" /> : <AlertTriangleIcon className="h-4 w-4" />} {toast.message}
          </div>
        )}

        {/* Tab nav */}
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          {[
            { id: "newsletter" as const, label: "Create Newsletter", icon: NewspaperIcon },
            { id: "snap" as const, label: "Snap Update", icon: ZapIcon },
            { id: "updates" as const, label: "Submissions", icon: FileTextIcon },
            { id: "settings" as const, label: "Settings", icon: SettingsIcon },
          ].map(t => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)} className={"flex items-center gap-1.5 rounded-md px-4 py-2 text-xs font-semibold transition-colors " + (tab === t.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              <t.icon className="h-3.5 w-3.5" /> {t.label}
            </button>
          ))}
        </div>

        {/* ═══ CREATE NEWSLETTER TAB ═══ */}
        {tab === "newsletter" && (
          <div className="space-y-4">
            {/* Team Updates */}
            <div className="rounded-xl border bg-card p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold">Team Updates <span className="text-xs text-muted-foreground">({updates.length})</span></h3>
                <button type="button" onClick={loadNewsletterTab} className="text-xs text-muted-foreground hover:text-foreground"><RefreshCwIcon className="mr-1 inline h-3 w-3" /> Refresh</button>
              </div>
              {updates.length === 0 ? <p className="py-4 text-center text-xs text-muted-foreground">No approved updates yet</p> : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {updates.map(u => (
                    <div key={u.id} className="rounded-lg border px-3 py-2 text-xs">
                      <div className="flex items-center justify-between"><span className="font-semibold">{u.title}</span><span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">{u.department}</span></div>
                      <p className="text-muted-foreground line-clamp-1 mt-0.5">{u.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Articles + AI Search */}
            <div className="rounded-xl border bg-card p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold">Articles <span className="text-xs text-muted-foreground">({includedArticles.length} included)</span></h3>
                <button type="button" onClick={createDraft} disabled={loadingDraft} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                  {loadingDraft ? <LoaderIcon className="h-3 w-3 animate-spin" /> : <><PlusIcon className="mr-1 inline h-3 w-3" /> New Draft</>}
                </button>
              </div>

              {/* AI Search */}
              <div className="flex gap-2 mb-3">
                <div className="relative flex-1"><SearchIcon className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" /><input type="text" value={aiQuery} onChange={e => setAiQuery(e.target.value)} placeholder="AI Search: type a topic to find articles..." className="w-full rounded-lg border bg-background py-2 pl-8 pr-3 text-xs" onKeyDown={e => e.key === "Enter" && doAiSearch()} /></div>
                <button type="button" onClick={doAiSearch} disabled={aiSearching} className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50">{aiSearching ? <LoaderIcon className="h-3 w-3 animate-spin" /> : "Search"}</button>
              </div>

              {/* AI Results */}
              {aiResults.length > 0 && (
                <div className="mb-3 space-y-1.5 rounded-lg border border-primary/20 bg-primary/5 p-3">
                  <p className="text-[10px] font-semibold text-primary">{aiResults.length} AI Results</p>
                  {aiResults.map((r: any, i: number) => (
                    <div key={i} className="flex items-center justify-between rounded border bg-card px-3 py-1.5 text-xs">
                      <div className="min-w-0 flex-1"><p className="font-semibold truncate">{r.title}</p><p className="text-[10px] text-muted-foreground truncate">{r.source || r.url}</p></div>
                      <button type="button" onClick={() => { setArticles(prev => [...prev, { ...r, id: Date.now() + i, is_included: true, sort_order: prev.length }]); setAiResults(prev => prev.filter((_, j) => j !== i)); }} className="ml-2 shrink-0 rounded bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground"><PlusIcon className="mr-0.5 inline h-2.5 w-2.5" /> Add</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Article list */}
              {articles.length === 0 ? <p className="py-6 text-center text-xs text-muted-foreground">Click "+ New Draft" to pull in articles, or use AI Search.</p> : (
                <div className="space-y-1.5 max-h-80 overflow-y-auto">
                  {articles.map((a, i) => (
                    <div key={a.id} className={"flex items-start gap-2 rounded-lg border px-3 py-2 text-xs transition " + (a.is_included === false ? "opacity-40" : "")}>
                      <input type="checkbox" checked={a.is_included !== false} onChange={() => toggleArticle(i)} className="mt-1 rounded" />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{a.title}</p>
                        <p className="text-[10px] text-muted-foreground line-clamp-2">{a.summary}</p>
                        {a.source && <span className="text-[10px] text-primary">{a.source}</span>}
                      </div>
                      <button type="button" onClick={() => removeArticle(i)} className="shrink-0 text-muted-foreground hover:text-destructive"><Trash2Icon className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Action bar */}
            {currentDraft && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card px-5 py-3">
                <span className="text-xs text-muted-foreground">Draft: {currentDraft.subject || `#${currentDraft.id}`}</span>
                <span className="text-[10px] text-muted-foreground">{includedArticles.length} articles, {updates.length} updates</span>
                <div className="ml-auto flex gap-2">
                  <button type="button" onClick={saveDraft} disabled={saving} className="rounded-lg border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent disabled:opacity-50">{saving ? <LoaderIcon className="h-3 w-3 animate-spin" /> : <><SaveIcon className="mr-1 inline h-3 w-3" /> Save</>}</button>
                  <button type="button" onClick={sendNewsletter} disabled={sending} className="rounded-lg bg-emerald-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-50">{sending ? <LoaderIcon className="h-3 w-3 animate-spin" /> : <><SendIcon className="mr-1 inline h-3 w-3" /> Send Newsletter</>}</button>
                </div>
              </div>
            )}

            {/* History */}
            <div className="rounded-xl border bg-card p-5">
              <button type="button" onClick={() => { setShowHistory(!showHistory); if (!showHistory && newsletters.length === 0) loadNewsletterTab(); }} className="flex w-full items-center justify-between text-sm font-bold">
                <span>Newsletter History</span>
                {showHistory ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
              </button>
              {showHistory && (
                <div className="mt-3 space-y-1.5 max-h-64 overflow-y-auto">
                  {newsletters.length === 0 ? <p className="py-4 text-center text-xs text-muted-foreground">No newsletters yet</p> : newsletters.map(nl => (
                    <div key={nl.id} className="flex items-center justify-between rounded-lg border px-4 py-2.5 text-xs">
                      <div><span className="font-semibold">{nl.subject || `Newsletter #${nl.id}`}</span><span className="ml-2 text-muted-foreground">{nl.article_count || 0} articles</span></div>
                      <div className="flex items-center gap-2">
                        {nl.sent_at ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">Sent {shortDate(nl.sent_at)}</span> : <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">Draft</span>}
                        <button type="button" onClick={() => { setCurrentDraft(nl); if (nl.id) loadDraftDetail(nl.id); }} className="text-primary hover:underline">View</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ SNAP UPDATE TAB ═══ */}
        {tab === "snap" && (
          <div className="rounded-xl border bg-card p-5 space-y-4">
            <h3 className="text-sm font-bold">Snap Update</h3>
            <p className="text-xs text-muted-foreground">Send a quick update to the team via email and/or Slack.</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div><label className="mb-1 block text-xs font-semibold">Subject</label><input type="text" value={snapSubject} onChange={e => setSnapSubject(e.target.value)} placeholder="e.g. Important: New PTO Policy" className="w-full rounded-lg border bg-background px-3 py-2 text-xs" /></div>
              <div><label className="mb-1 block text-xs font-semibold">Author</label><input type="text" value={snapAuthor} onChange={e => setSnapAuthor(e.target.value)} placeholder="Your name" className="w-full rounded-lg border bg-background px-3 py-2 text-xs" /></div>
            </div>
            <div><label className="mb-1 block text-xs font-semibold">Department</label>
              <CustomSelect value={snapDept} onValueChange={setSnapDept} triggerClassName="w-full h-9 text-xs" placeholder="Select..." options={DEPARTMENTS.map(d => ({ value: d, label: d }))} />
            </div>
            <div><label className="mb-1 block text-xs font-semibold">Content</label><textarea value={snapContent} onChange={e => setSnapContent(e.target.value)} rows={4} placeholder="Write your update here..." className="w-full rounded-lg border bg-background px-3 py-2 text-xs" /></div>
            <div className="flex justify-end">
              <button type="button" onClick={sendSnap} disabled={snapSending || !snapSubject.trim() || !snapContent.trim()} className="rounded-lg bg-primary px-5 py-2.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">{snapSending ? <LoaderIcon className="h-3 w-3 animate-spin" /> : <><SendIcon className="mr-1.5 inline h-3.5 w-3.5" /> Send Snap</>}</button>
            </div>
          </div>
        )}

        {/* ═══ SUBMISSIONS TAB ═══ */}
        {tab === "updates" && (
          <div className="space-y-4">
            <div className="rounded-xl border bg-card p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold">Department Submissions</h3>
                <button type="button" onClick={loadSubmissions} disabled={loadingSubs} className="text-xs text-muted-foreground hover:text-foreground"><RefreshCwIcon className={"mr-1 inline h-3 w-3 " + (loadingSubs ? "animate-spin" : "")} /> Refresh</button>
              </div>
              <div className="flex gap-2 mb-3">
                <CustomSelect value={subDeptFilter} onValueChange={(v) => { setSubDeptFilter(v); }} triggerClassName="h-8 min-w-[130px] text-xs" placeholder="All Depts" options={[{ value: "all", label: "All Depts" }, ...DEPARTMENTS.map(d => ({ value: d, label: d }))]} />
                <CustomSelect value={subStatusFilter} onValueChange={(v) => { setSubStatusFilter(v); }} triggerClassName="h-8 min-w-[110px] text-xs" placeholder="All" options={[{ value: "all", label: "All" }, { value: "active", label: "Active" }, { value: "unsubscribed", label: "Unsubscribed" }]} />
              </div>
              {loadingSubs ? <div className="flex items-center justify-center py-8"><LoaderIcon className="h-6 w-6 animate-spin text-muted-foreground" /></div> : submissions.length === 0 ? <p className="py-8 text-center text-xs text-muted-foreground">No submissions found</p> : (
                <div className="space-y-2">
                  {submissions.map(s => (
                    <div key={s.id} className="rounded-lg border p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2"><h4 className="text-xs font-bold">{s.title}</h4><span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold">{s.department}</span>
                            <span className={"rounded-full px-2 py-0.5 text-[10px] font-semibold " + (s.status === "approved" ? "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300" : s.status === "rejected" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300")}>{s.status || "pending"}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{s.content}</p>
                          <p className="text-[10px] text-muted-foreground mt-1">By {s.author} -- {s.created_at ? shortDate(s.created_at) : ""}</p>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          {s.status !== "approved" && <button type="button" onClick={() => patchUpdate(s.id, "approved")} className="rounded bg-green-600 px-2 py-1 text-[10px] font-semibold text-white"><CheckIcon className="h-3 w-3" /></button>}
                          {s.status !== "rejected" && <button type="button" onClick={() => patchUpdate(s.id, "rejected")} className="rounded bg-red-500 px-2 py-1 text-[10px] font-semibold text-white"><XIcon className="h-3 w-3" /></button>}
                          <button type="button" onClick={() => deleteUpdate(s.id)} className="rounded border px-2 py-1 text-[10px] text-muted-foreground hover:text-destructive"><Trash2Icon className="h-3 w-3" /></button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add company update */}
            <AddUpdateForm onSubmit={async (title, content, dept, author) => {
              try { await call("/company-updates", "POST", { title, content, department: dept, author }); flash("Update submitted"); loadSubmissions(); }
              catch (e: any) { flash(e.message, "error"); }
            }} />
          </div>
        )}

        {/* ═══ SETTINGS TAB ═══ */}
        {tab === "settings" && (
          <div className="space-y-4">
            {/* Schedule */}
            <div className="rounded-xl border bg-card p-5 space-y-3">
              <h3 className="text-sm font-bold">Weekly Auto-Send</h3>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={scheduleEnabled} onChange={e => setScheduleEnabled(e.target.checked)} className="rounded" /> Enable weekly auto-send</label>
              </div>
              {scheduleEnabled && (
                <div className="flex gap-3">
                  <div><label className="mb-1 block text-[10px] font-semibold text-muted-foreground">Day</label>
                    <CustomSelect value={scheduleDay} onValueChange={setScheduleDay} triggerClassName="h-8 min-w-[110px] text-xs" placeholder="Day" options={["monday","tuesday","wednesday","thursday","friday"].map(d => ({ value: d, label: d.charAt(0).toUpperCase() + d.slice(1) }))} />
                  </div>
                  <div><label className="mb-1 block text-[10px] font-semibold text-muted-foreground">Time</label><input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} className="rounded-lg border bg-background px-3 py-1.5 text-xs" /></div>
                </div>
              )}
              <button type="button" onClick={saveSchedule} className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"><SaveIcon className="mr-1 inline h-3 w-3" /> Save Schedule</button>
            </div>

            {/* Reminders */}
            <div className="rounded-xl border bg-card p-5">
              <div className="flex items-center justify-between">
                <div><h3 className="text-sm font-bold">Newsletter Reminders</h3><p className="text-xs text-muted-foreground">Send Slack reminders to department heads to submit updates</p></div>
                <button type="button" onClick={sendReminders} className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-600"><BellIcon className="mr-1 inline h-3.5 w-3.5" /> Send Reminders</button>
              </div>
            </div>

            {/* Recipients */}
            <div className="rounded-xl border bg-card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold">Recipients ({recipients.length})</h3>
                <div className="flex gap-2">
                  <button type="button" onClick={importWorkspace} className="rounded-lg border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent"><ImportIcon className="mr-1 inline h-3 w-3" /> Import Workspace</button>
                  <button type="button" onClick={() => setShowAddRecipient(!showAddRecipient)} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"><PlusIcon className="mr-1 inline h-3 w-3" /> Add</button>
                </div>
              </div>

              {showAddRecipient && (
                <div className="flex gap-2 rounded-lg border bg-accent/30 p-3">
                  <input type="text" value={newRecName} onChange={e => setNewRecName(e.target.value)} placeholder="John Doe" className="flex-1 rounded-lg border bg-background px-3 py-2 text-xs" />
                  <input type="email" value={newRecEmail} onChange={e => setNewRecEmail(e.target.value)} placeholder="john@remoteleverage.com" className="flex-1 rounded-lg border bg-background px-3 py-2 text-xs" />
                  <button type="button" onClick={addRecipient} className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">Add</button>
                  <button type="button" onClick={() => setShowAddRecipient(false)} className="rounded-lg border px-3 py-2 text-xs text-muted-foreground">Cancel</button>
                </div>
              )}

              <input type="text" value={recipientSearch} onChange={e => setRecipientSearch(e.target.value)} placeholder="Search recipients by name or email..." className="w-full rounded-lg border bg-background px-3 py-2 text-xs" />

              <div className="max-h-72 overflow-y-auto space-y-1">
                {filteredRecipients.map(r => (
                  <div key={r.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{r.name}</span>
                      <span className="text-muted-foreground">{r.email}</span>
                      {r.source && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px]">{r.source}</span>}
                    </div>
                    <button type="button" onClick={() => deleteRecipient(r.id)} className="text-muted-foreground hover:text-destructive"><Trash2Icon className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══ Add Update Form ═══ */
function AddUpdateForm({ onSubmit }: { onSubmit: (title: string, content: string, dept: string, author: string) => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [dept, setDept] = useState("General");
  const [author, setAuthor] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [open, setOpen] = useState(false);

  async function handleSubmit() {
    if (!title.trim() || !content.trim()) return;
    setSubmitting(true);
    try { await onSubmit(title, content, dept, author); setTitle(""); setContent(""); setAuthor(""); setOpen(false); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="rounded-xl border bg-card p-5">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between text-sm font-bold">
        <span><PlusIcon className="mr-1.5 inline h-4 w-4" /> Add Update</span>
        {open ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><label className="mb-1 block text-xs font-semibold">Title</label><input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. New Zapier Automation" className="w-full rounded-lg border bg-background px-3 py-2 text-xs" /></div>
            <div><label className="mb-1 block text-xs font-semibold">Author</label><input type="text" value={author} onChange={e => setAuthor(e.target.value)} placeholder="Your name" className="w-full rounded-lg border bg-background px-3 py-2 text-xs" /></div>
          </div>
          <div><label className="mb-1 block text-xs font-semibold">Department</label><CustomSelect value={dept} onValueChange={setDept} triggerClassName="w-full h-9 text-xs" placeholder="Select..." options={DEPARTMENTS.map(d => ({ value: d, label: d }))} /></div>
          <div><label className="mb-1 block text-xs font-semibold">Content</label><textarea value={content} onChange={e => setContent(e.target.value)} rows={3} placeholder="Describe the update..." className="w-full rounded-lg border bg-background px-3 py-2 text-xs" /></div>
          <div className="flex justify-end"><button type="button" onClick={handleSubmit} disabled={submitting || !title.trim() || !content.trim()} className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50">{submitting ? <LoaderIcon className="h-3 w-3 animate-spin" /> : "Submit Update"}</button></div>
        </div>
      )}
    </div>
  );
}
