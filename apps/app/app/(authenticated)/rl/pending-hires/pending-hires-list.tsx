"use client";

import { approvePendingHire, rejectPendingHire } from "@/app/actions/hriq/pending-hires";
import { syncFromRecruitCRM } from "@/app/actions/hriq/recruitcrm-sync";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type PendingHire = {
  id: string;
  recruit_crm_slug: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  position: string | null;
  city: string | null;
  country: string | null;
  current_salary: string | null;
  salary_expectation: string | null;
  linkedin: string | null;
  skills: string | null;
  status: string;
  rejection_reason: string | null;
  created_employee_id: string | null;
  created_at: Date;
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

export function PendingHiresList({ hires }: { hires: PendingHire[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const handleApprove = (id: string) => {
    startTransition(async () => {
      await approvePendingHire(id);
      router.refresh();
    });
  };

  const confirmReject = () => {
    if (!rejectingId || !rejectReason.trim()) return;
    startTransition(async () => {
      await rejectPendingHire(rejectingId, rejectReason);
      setRejectingId(null);
      setRejectReason("");
      router.refresh();
    });
  };

  const pending = hires.filter((h) => h.status === "pending");
  const processed = hires.filter((h) => h.status !== "pending");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Pending Hires from RecruitCRM</h2>
          <p className="text-sm text-muted-foreground">
            Candidates placed at &quot;Internal: Hired&quot; stage are sent here for approval.
            Approved candidates become contractors in Remote Leverage.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              startTransition(async () => {
                const result = await syncFromRecruitCRM();
                alert(`Synced ${result.synced} hired candidates from ${result.total} total`);
                router.refresh();
              });
            }}
            disabled={isPending}
            className="h-9 whitespace-nowrap rounded-md border px-4 text-sm font-medium hover:bg-accent disabled:opacity-50"
          >
            {isPending ? "Syncing..." : "Sync"}
          </button>
          {pending.length > 0 && (
            <span className="flex h-7 items-center whitespace-nowrap rounded-full bg-yellow-100 px-3 text-xs font-medium text-yellow-800">{pending.length} pending</span>
          )}
        </div>
      </div>

      {/* Pending */}
      {pending.length > 0 && (
        <div className="space-y-3">
          {pending.map((hire) => (
            <div key={hire.id} className="rounded-xl border bg-card p-5">
              <div className="flex items-center gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  {hire.first_name.charAt(0)}{hire.last_name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{hire.first_name} {hire.last_name}</span>
                    {hire.position && <span className="text-sm text-muted-foreground">· {hire.position}</span>}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-muted-foreground">
                    {hire.email && <span>{hire.email}</span>}
                    {hire.phone && <span>{hire.phone}</span>}
                    {hire.city && <span>{[hire.city, hire.country].filter(Boolean).join(", ")}</span>}
                  </div>
                  {hire.skills && <div className="mt-1 text-xs text-muted-foreground truncate max-w-lg">{hire.skills}</div>}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button onClick={() => handleApprove(hire.id)} disabled={isPending} className="h-9 whitespace-nowrap rounded-md bg-green-600 px-4 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
                    Approve
                  </button>
                  <button onClick={() => { setRejectingId(hire.id); setRejectReason(""); }} className="h-9 whitespace-nowrap rounded-md border border-red-300 px-4 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950">
                    Reject
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {pending.length === 0 && (
        <div className="rounded-xl border bg-card p-8 text-center">
          <div className="text-2xl">&#x2705;</div>
          <p className="mt-2 text-muted-foreground">No pending hires. Candidates placed at &quot;Internal: Hired&quot; in RecruitCRM will appear here.</p>
          <p className="mt-1 text-xs text-muted-foreground">Webhook URL: <code className="rounded bg-muted px-1.5 py-0.5">{typeof window !== "undefined" ? window.location.origin : "https://hriq-platform.vercel.app"}/api/webhooks/recruitcrm</code></p>
        </div>
      )}

      {/* Processed */}
      {processed.length > 0 && (
        <div>
          <h3 className="font-semibold text-muted-foreground">Previously Processed ({processed.length})</h3>
          <div className="mt-3 space-y-2">
            {processed.map((hire) => (
              <div key={hire.id} className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-3">
                  <div>
                    <span className="text-sm font-medium">{hire.first_name} {hire.last_name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{hire.position}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${STATUS_COLORS[hire.status] ?? "bg-gray-100"}`}>{hire.status}</span>
                  {hire.created_employee_id && (
                    <Link href={`/client/employees/${hire.created_employee_id}`} className="text-xs text-primary hover:underline">View Contractor</Link>
                  )}
                  {hire.rejection_reason && (
                    <span className="text-xs text-muted-foreground" title={hire.rejection_reason}>Reason: {hire.rejection_reason.slice(0, 30)}...</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reject Dialog */}
      {rejectingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setRejectingId(null)}>
          <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">Reject Candidate</h3>
            <div className="mt-3">
              <label className="text-sm font-medium">Reason *</label>
              <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} placeholder="Why is this candidate being rejected?" className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </div>
            <div className="mt-4 flex justify-end gap-3">
              <button onClick={() => setRejectingId(null)} className="h-9 rounded-md border px-4 text-sm">Cancel</button>
              <button onClick={confirmReject} disabled={isPending || !rejectReason.trim()} className="h-9 rounded-md bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">Reject</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
