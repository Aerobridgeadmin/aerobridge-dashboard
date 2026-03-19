"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useErrorDialog } from "@/app/(authenticated)/components/error-dialog";
import { initiateClientKyc, resendClientKycEmail, manualKycApproval, resetClientKyc } from "@/app/actions/hriq/client-kyc";

type KycStatus = {
 status: string;
 provider: string | null;
 sessionId: string | null;
 verifiedAt: Date | null;
 verifiedName: string | null;
 documentType: string | null;
 documentCountry: string | null;
 rejectionReason: string | null;
 sessionUrl: string | null;
 initiatedAt: Date | null;
 adminEmail: string | null;
 adminName: string | null;
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
 pending: { label: "Not Started", color: "text-gray-600", bg: "bg-gray-100 dark:bg-gray-800", icon: "○"},
 created: { label: "Awaiting Verification", color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/30", icon: "◔"},
 started: { label: "In Progress", color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/30", icon: "◑"},
 submitted: { label: "Under Review", color: "text-yellow-600", bg: "bg-yellow-50 dark:bg-yellow-900/30", icon: "◕"},
 approved: { label: "Verified", color: "text-green-600", bg: "bg-green-50 dark:bg-green-900/30", icon: "OK"},
 declined: { label: "Declined", color: "text-red-600", bg: "bg-red-50 dark:bg-red-900/30", icon: "X"},
 resubmission_requested: { label: "Resubmission Needed", color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-900/30", icon: "↻"},
 expired: { label: "Expired", color: "text-gray-500", bg: "bg-gray-50 dark:bg-gray-800", icon: "--"},
 abandoned: { label: "Abandoned", color: "text-gray-500", bg: "bg-gray-50 dark:bg-gray-800", icon: "—"},
};

export function KycStatusCard({
 organizationId,
 kyc,
}: {
 organizationId: string;
 kyc: KycStatus | null;
}) {
 const router = useRouter();
 const [isPending, startTransition] = useTransition();
 const { showError } = useErrorDialog();
 const [showManualApproval, setShowManualApproval] = useState(false);
 const [manualName, setManualName] = useState("");
 const [successMsg, setSuccessMsg] = useState<string | null>(null);

 const status = kyc?.status || "pending";
 const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;

 const handleInitiateKyc = () => {
 startTransition(async () => {
 try {
 const result = await initiateClientKyc(organizationId);
 if ("error" in result) { showError({ title: "KYC Error", message: (result as any).error ?? "Failed" }); return; }
 setSuccessMsg("Verification email sent! Link: "+ (result as any).verificationUrl);
 router.refresh();
 } catch (err) {
 showError({ title: "KYC initiation failed", message: err instanceof Error ? err.message : "Something went wrong."});
 }
 });
 };

 const handleResend = () => {
 startTransition(async () => {
 try {
 await resendClientKycEmail(organizationId);
 setSuccessMsg("Verification email resent successfully.");
 router.refresh();
 } catch (err) {
 showError({ title: "Resend failed", message: err instanceof Error ? err.message : "Something went wrong."});
 }
 });
 };

 const handleManualApproval = () => {
 if (!manualName.trim()) return;
 startTransition(async () => {
 try {
 await manualKycApproval(organizationId, { verifiedName: manualName.trim() });
 setShowManualApproval(false);
 setManualName("");
 setSuccessMsg("Manually approved.");
 router.refresh();
 } catch (err) {
 showError({ title: "Manual approval failed", message: err instanceof Error ? err.message : "Something went wrong."});
 }
 });
 };

 const handleReset = () => {
 if (!confirm("Reset KYC status? This will require re-verification.")) return;
 startTransition(async () => {
 try {
 await resetClientKyc(organizationId);
 setSuccessMsg(null);
 router.refresh();
 } catch (err) {
 showError({ title: "Reset failed", message: err instanceof Error ? err.message : "Something went wrong."});
 }
 });
 };

 return (
 <div className="rounded-xl border bg-card p-6">
 <div className="flex items-center justify-between">
 <h3 className="font-semibold">Identity Verification (KYC)</h3>
 <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${config.bg} ${config.color}`}>
 <span className="text-sm">{config.icon}</span>
 {config.label}
 </span>
 </div>

 {/* Success message */}
 {successMsg && (
 <div className="mt-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3 text-sm text-green-800 dark:text-green-200">
 {successMsg}
 <button onClick={() => setSuccessMsg(null)} className="ml-2 text-green-600 hover:text-green-800 font-medium"></button>
 </div>
 )}

 {/* Status details */}
 <div className="mt-4 space-y-2">
 {kyc?.verifiedAt && status === "approved"&& (
 <>
 <div className="flex justify-between text-sm">
 <span className="text-muted-foreground">Verified Name</span>
 <span className="font-medium">{kyc.verifiedName || "—"}</span>
 </div>
 <div className="flex justify-between text-sm">
 <span className="text-muted-foreground">Document</span>
 <span className="font-medium">{[kyc.documentType, kyc.documentCountry].filter(Boolean).join("· ") || "—"}</span>
 </div>
 <div className="flex justify-between text-sm">
 <span className="text-muted-foreground">Verified At</span>
 <span className="font-medium">{new Date(kyc.verifiedAt as any).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric"})}</span>
 </div>
 <div className="flex justify-between text-sm">
 <span className="text-muted-foreground">Provider</span>
 <span className="font-medium capitalize">{kyc.provider || "—"}</span>
 </div>
 </>
 )}

 {kyc?.rejectionReason && (status === "declined"|| status === "resubmission_requested") && (
 <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-300">
 <span className="font-medium">Reason:</span> {kyc.rejectionReason}
 </div>
 )}

 {kyc?.initiatedAt && status !== "pending"&& status !== "approved"&& (
 <div className="flex justify-between text-sm">
 <span className="text-muted-foreground">Initiated</span>
 <span className="font-medium">{new Date(kyc.initiatedAt as any).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit"})}</span>
 </div>
 )}

 {kyc?.adminEmail && (
 <div className="flex justify-between text-sm">
 <span className="text-muted-foreground">Admin Email</span>
 <span className="font-medium truncate max-w-[60%]">{kyc.adminEmail}</span>
 </div>
 )}
 </div>

 {/* Actions */}
 <div className="mt-4 flex flex-wrap gap-2">
 {status === "pending"&& (
 <button
 onClick={handleInitiateKyc}
 disabled={isPending}
 className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
 >
 {isPending ? "Sending…": "Send Verification Email"}
 </button>
 )}

 {(status === "created"|| status === "started"|| status === "expired"|| status === "resubmission_requested"|| status === "declined") && (
 <button
 onClick={handleResend}
 disabled={isPending}
 className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
 >
 {isPending ? "Sending…": status === "expired"|| status === "declined"? "Send New Verification": "Resend Email"}
 </button>
 )}

 {status !== "approved"&& (
 <button
 onClick={() => setShowManualApproval(!showManualApproval)}
 className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
 >
 Manual Approve
 </button>
 )}

 {status === "approved"&& (
 <button
 onClick={handleReset}
 disabled={isPending}
 className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20 disabled:opacity-50"
 >
 Reset Verification
 </button>
 )}

 {kyc?.sessionId && status !== "approved"&& status !== "pending"&& (
 <a
 href={`/verify/${kyc.sessionId}`}
 target="_blank"
 rel="noopener noreferrer"
 className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted"
 >
 Open Verification Page ↗
 </a>
 )}
 </div>

 {/* Manual approval form */}
 {showManualApproval && (
 <div className="mt-3 rounded-lg border bg-muted/30 p-4">
 <label className="text-sm font-medium">Verified Name (as on ID)</label>
 <input
 type="text"
 value={manualName}
 onChange={(e) => setManualName(e.target.value)}
 placeholder="e.g. John Smith"
 className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
 />
 <div className="mt-2 flex gap-2">
 <button
 onClick={handleManualApproval}
 disabled={isPending || !manualName.trim()}
 className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
 >
 {isPending ? "Saving…": "Confirm Approval"}
 </button>
 <button onClick={() => setShowManualApproval(false)} className="rounded-lg border px-4 py-2 text-sm">
 Cancel
 </button>
 </div>
 </div>
 )}
 </div>
 );
}
