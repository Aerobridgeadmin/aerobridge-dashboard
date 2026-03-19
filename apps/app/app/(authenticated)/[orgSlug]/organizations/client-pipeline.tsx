"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  getClientPipeline,
  resendOnboardingLinkEmail,
  convertOnboardingToOrg,
  expireOnboardingSession,
  type PipelineItem,
  type PipelineStage,
} from "@/app/actions/hriq/org-onboarding";
import Link from "next/link";

const STAGE_CONFIG: Record<PipelineStage, { label: string; dot: string; badge: string }> = {
  link_sent: { label: "Link Sent", dot: "bg-blue-500", badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  agreement_signed: { label: "Agreement Signed", dot: "bg-amber-500", badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  paid: { label: "Paid", dot: "bg-green-500", badge: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  org_created: { label: "Org Created", dot: "bg-purple-500", badge: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  active: { label: "Active", dot: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
};

const PLAN_LABELS: Record<string, string> = { ppp: "PPP", cor: "COR", both: "PPP + COR" };

export function ClientPipeline() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const router = useRouter();
  const [items, setItems] = useState<PipelineItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filterStage, setFilterStage] = useState<PipelineStage | "all">("all");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ id: string; type: "ok" | "err"; text: string } | null>(null);

  const loadPipeline = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getClientPipeline();
      setItems(data);
      setLoaded(true);
    } catch (err) {
      console.error("[ClientPipeline] load error:", err);
      setLoadError(err instanceof Error ? err.message : "Failed to load pipeline.");
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPipeline(); }, [loadPipeline]);

  const filtered = filterStage === "all" ? items : items.filter((i) => i.stage === filterStage);
  const stageCounts = items.reduce((acc, i) => { acc[i.stage] = (acc[i.stage] || 0) + 1; return acc; }, {} as Record<string, number>);

  const handleAction = async (itemId: string, action: string, sessionId: string | null) => {
    if (!sessionId) return;
    setActionLoading(itemId);
    setActionMsg(null);
    try {
      if (action === "resend") {
        const r = await resendOnboardingLinkEmail(sessionId);
        setActionMsg({ id: itemId, type: "error" in r ? "err" : "ok", text: "error" in r ? r.error! : "Email resent" });
      } else if (action === "convert") {
        const r = await convertOnboardingToOrg(sessionId);
        if ("error" in r) { setActionMsg({ id: itemId, type: "err", text: r.error! }); }
        else { setActionMsg({ id: itemId, type: "ok", text: "Org created" }); loadPipeline(); router.refresh(); }
      } else if (action === "expire") {
        const r = await expireOnboardingSession(sessionId);
        if ("error" in r) { setActionMsg({ id: itemId, type: "err", text: r.error! }); }
        else { loadPipeline(); }
      }
    } catch (err) {
      setActionMsg({ id: itemId, type: "err", text: err instanceof Error ? err.message : "Failed" });
    } finally {
      setActionLoading(null);
    }
  };

  if (loading && !loaded) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="ml-3 text-sm text-muted-foreground">Loading pipeline...</span>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
        <button type="button" onClick={loadPipeline} className="h-8 rounded-md border px-4 text-xs font-medium hover:bg-muted">Try Again</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stage filter pills */}
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" onClick={() => setFilterStage("all")}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${filterStage === "all" ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
          All ({items.length})
        </button>
        {(Object.keys(STAGE_CONFIG) as PipelineStage[]).map((key) => {
          const count = stageCounts[key] || 0;
          const cfg = STAGE_CONFIG[key];
          return (
            <button key={key} type="button" onClick={() => setFilterStage(key)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${filterStage === key ? cfg.badge : "bg-muted text-muted-foreground hover:text-foreground"}`}>
              {cfg.label} ({count})
            </button>
          );
        })}
        <button type="button" onClick={loadPipeline} disabled={loading}
          className="ml-auto h-7 rounded-md border px-2.5 text-[11px] font-medium hover:bg-muted disabled:opacity-50">
          {loading ? "..." : "Refresh"}
        </button>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground">No clients in this stage</div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Company</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Contact</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Stage</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Plan</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Updated</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const cfg = STAGE_CONFIG[item.stage] ?? STAGE_CONFIG.link_sent;
                const daysAgo = Math.floor((Date.now() - new Date(item.updatedAt).getTime()) / 86400000);
                const isExpiring = item.expiresAt && new Date(item.expiresAt).getTime() - Date.now() < 3 * 86400000;
                const msg = actionMsg?.id === item.id ? actionMsg : null;
                const busy = actionLoading === item.id;

                return (
                  <tr key={item.id} className="border-b last:border-b-0 hover:bg-muted/20 transition-colors">
                    {/* Company */}
                    <td className="px-4 py-3">
                      <div className="font-medium">{item.companyName}</div>
                      {item.vaSeats && <span className="text-xs text-muted-foreground">{item.vaSeats} VA{item.vaSeats !== 1 ? "s" : ""}</span>}
                    </td>
                    {/* Contact */}
                    <td className="px-4 py-3">
                      {item.contactName && <div className="text-sm">{item.contactName}</div>}
                      {item.contactEmail && <div className="text-xs text-muted-foreground">{item.contactEmail}</div>}
                    </td>
                    {/* Stage */}
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${cfg.badge}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                        {cfg.label}
                      </span>
                      {isExpiring && <span className="ml-1.5 text-[10px] text-red-500 font-medium">Expiring</span>}
                    </td>
                    {/* Plan */}
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {item.planType ? PLAN_LABELS[item.planType] ?? item.planType.toUpperCase() : "---"}
                    </td>
                    {/* Updated */}
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {daysAgo === 0 ? "Today" : `${daysAgo}d ago`}
                    </td>
                    {/* Actions */}
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {msg && <span className={`text-[10px] font-medium ${msg.type === "ok" ? "text-green-600" : "text-red-600"}`}>{msg.text}</span>}
                        {(item.stage === "link_sent" || item.stage === "agreement_signed") && (
                          <>
                            <button type="button" disabled={busy} onClick={() => handleAction(item.id, "resend", item.sessionId)}
                              className="rounded border px-2 py-1 text-[11px] hover:bg-muted disabled:opacity-50">Resend</button>
                            {item.sessionToken && (
                              <button type="button" onClick={() => navigator.clipboard.writeText(`${window.location.origin}/org-onboard/${item.sessionToken}`)}
                                className="rounded border px-2 py-1 text-[11px] hover:bg-muted">Copy</button>
                            )}
                          </>
                        )}
                        {item.stage === "paid" && !item.orgId && (
                          <button type="button" disabled={busy} onClick={() => handleAction(item.id, "convert", item.sessionId)}
                            className="rounded bg-purple-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-purple-700 disabled:opacity-50">
                            {busy ? "..." : "Create Org"}
                          </button>
                        )}
                        {(item.stage === "org_created" || item.stage === "active") && item.orgId && (
                          <Link href={`/${orgSlug}/organizations/${item.orgId}`} className="rounded border px-2 py-1 text-[11px] font-medium hover:bg-muted">View</Link>
                        )}
                        {item.sessionId && !["active", "org_created"].includes(item.stage) && (
                          <button type="button" disabled={busy} onClick={() => handleAction(item.id, "expire", item.sessionId)}
                            className="rounded border border-red-200 dark:border-red-800 px-2 py-1 text-[11px] text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50">
                            Remove
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
