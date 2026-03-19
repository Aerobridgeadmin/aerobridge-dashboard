"use client";

import { useState, useEffect, useCallback } from "react";
import { Check, X } from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";

/**
 * ForcePasswordChange — a blocking modal shown on first login for accounts
 * provisioned with the default password. Google SSO users are exempt since
 * they authenticated through Google and never use a platform password.
 *
 * The user MUST set a new password before accessing any part of the dashboard.
 */
export function ForcePasswordChange() {
 const [show, setShow] = useState(false);
 const [password, setPassword] = useState("");
 const [confirm, setConfirm] = useState("");
 const [loading, setLoading] = useState(false);
 const [error, setError] = useState<string | null>(null);
 const [success, setSuccess] = useState(false);

 useEffect(() => {
 const sb = createBrowserClient(
 process.env.NEXT_PUBLIC_SUPABASE_URL!,
 process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
 );
 sb.auth.getUser().then(({ data }) => {
 const meta = data.user?.user_metadata || {};
 const provider = data.user?.app_metadata?.provider;
 const isGoogleUser = provider === "google";
 // Show the modal if:
 // 1. It's a first login (isFirstLogin flag)
 // 2. They haven't already completed the password change (passwordChanged flag)
 // 3. They're NOT a Google SSO user
 if (meta.isFirstLogin && !meta.passwordChanged && !isGoogleUser) {
 setShow(true);
 }
 });
 }, []);

 const handleSubmit = useCallback(async () => {
 setError(null);

 if (password.length < 8) {
 setError("Password must be at least 8 characters.");
 return;
 }
 if (password !== confirm) {
 setError("Passwords do not match.");
 return;
 }
 // Basic strength check
 const hasUpper = /[A-Z]/.test(password);
 const hasLower = /[a-z]/.test(password);
 const hasNumber = /[0-9]/.test(password);
 if (!hasUpper || !hasLower || !hasNumber) {
 setError("Password must include uppercase, lowercase, and a number.");
 return;
 }

 setLoading(true);
 try {
 // Try client-side first
 const sb = createBrowserClient(
 process.env.NEXT_PUBLIC_SUPABASE_URL!,
 process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
 );
 const { data: sessionData } = await sb.auth.getSession();
 if (sessionData?.session) {
 const { error: updateErr } = await sb.auth.updateUser({
 password,
 data: { passwordChanged: true },
 });
 if (!updateErr) {
 setSuccess(true);
 setTimeout(() => { window.location.reload(); }, 1500);
 return;
 }
 console.warn("[ForcePasswordChange] Client-side failed, using server action:", updateErr.message);
 }
 // Fallback: server action (works even without browser session)
 const { changeMyPassword } = await import("@/app/actions/hriq/auth-actions");
 const result = await changeMyPassword(password);
 if ("error" in result) {
 setError(result.error);
 return;
 }
 setSuccess(true);
      // Full page reload so the server re-evaluates KYC/payment gates with fresh session
      setTimeout(() => { window.location.reload(); }, 1500);
    } catch {
      setError("Failed to update password. Please try again.");
    } finally {
      setLoading(false);
    }
 }, [password, confirm]);

 if (!show) return null;

 return (
 <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
 <div className="mx-4 w-full max-w-md rounded-xl border bg-background p-6 shadow-2xl">
 {/* Header */}
 <div className="mb-1 flex items-center gap-3">
 <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/10">
 <svg className="h-5 w-5 text-orange-500"fill="none"viewBox="0 0 24 24"stroke="currentColor"strokeWidth={2}>
 <path strokeLinecap="round"strokeLinejoin="round"d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
 </svg>
 </div>
 <div>
 <h2 className="text-lg font-bold">Change Your Password</h2>
 <p className="text-xs text-muted-foreground">Required before you can continue</p>
 </div>
 </div>

 <p className="mb-5 mt-3 text-sm text-muted-foreground">
 For your security, you must set a new password before accessing the dashboard.
 Your temporary password can only be used once.
 </p>

 {error && (
 <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
 {error}
 </div>
 )}

 {success ? (
 <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-4 text-center">
 <div className="text-lg font-bold text-green-600">Password Updated</div>
 <p className="mt-1 text-sm text-green-700">Redirecting to your dashboard…</p>
 </div>
 ) : (
 <div className="flex flex-col gap-4">
 <div className="flex flex-col gap-1.5">
 <label htmlFor="fp-new"className="text-sm font-medium">New Password</label>
 <input
 id="fp-new"
 type="password"
 value={password}
 onChange={(e) => setPassword(e.target.value)}
 placeholder="At least 8 characters"
 autoFocus
 className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
 />
 </div>
 <div className="flex flex-col gap-1.5">
 <label htmlFor="fp-confirm"className="text-sm font-medium">Confirm Password</label>
 <input
 id="fp-confirm"
 type="password"
 value={confirm}
 onChange={(e) => setConfirm(e.target.value)}
 placeholder="Re-enter your new password"
 onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
 className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
 />
 </div>

 {/* Live validation rules */}
 <div className="space-y-1.5">
 <div className="flex items-center gap-2">
 <div className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${password.length >= 8 ? "bg-green-500 text-white": "bg-muted text-muted-foreground"}`}>
 {password.length >= 8 ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
 </div>
 <span className={`text-xs ${password.length >= 8 ? "text-green-600 dark:text-green-400": "text-muted-foreground"}`}>At least 8 characters</span>
 </div>
 <div className="flex items-center gap-2">
 <div className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${/[A-Z]/.test(password) ? "bg-green-500 text-white": "bg-muted text-muted-foreground"}`}>
 {/[A-Z]/.test(password) ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
 </div>
 <span className={`text-xs ${/[A-Z]/.test(password) ? "text-green-600 dark:text-green-400": "text-muted-foreground"}`}>Uppercase letter</span>
 </div>
 <div className="flex items-center gap-2">
 <div className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${/[a-z]/.test(password) ? "bg-green-500 text-white": "bg-muted text-muted-foreground"}`}>
 {/[a-z]/.test(password) ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
 </div>
 <span className={`text-xs ${/[a-z]/.test(password) ? "text-green-600 dark:text-green-400": "text-muted-foreground"}`}>Lowercase letter</span>
 </div>
 <div className="flex items-center gap-2">
 <div className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${/[0-9]/.test(password) ? "bg-green-500 text-white": "bg-muted text-muted-foreground"}`}>
 {/[0-9]/.test(password) ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
 </div>
 <span className={`text-xs ${/[0-9]/.test(password) ? "text-green-600 dark:text-green-400": "text-muted-foreground"}`}>Number</span>
 </div>
 {confirm.length > 0 && (
 <div className="flex items-center gap-2">
 <div className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${password === confirm ? "bg-green-500 text-white": "bg-red-500 text-white"}`}>
 {password === confirm ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
 </div>
 <span className={`text-xs ${password === confirm ? "text-green-600 dark:text-green-400": "text-red-500"}`}>
 {password === confirm ? "Passwords match": "Passwords don't match"}
 </span>
 </div>
 )}
 {/* Strength meter */}
 {password.length > 0 && (
 <div className="mt-2">
 {(() => {
 const checks = [password.length >= 8, /[A-Z]/.test(password), /[a-z]/.test(password), /[0-9]/.test(password)].filter(Boolean).length;
 const label = checks <= 1 ? "Weak": checks <= 2 ? "Fair": checks <= 3 ? "Good": "Strong";
 const color = checks <= 1 ? "bg-red-500": checks <= 2 ? "bg-orange-500": checks <= 3 ? "bg-amber-500": "bg-green-500";
 return (
 <div className="flex items-center gap-2">
 <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
 <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${checks * 25}%` }} />
 </div>
 <span className="text-[10px] font-medium text-muted-foreground w-10">{label}</span>
 </div>
 );
 })()}
 </div>
 )}
 </div>

 <button
 type="button"
 onClick={handleSubmit}
 disabled={loading || password.length < 8 || password !== confirm}
 className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
 >
 {loading ? "Updating…": "Set New Password"}
 </button>
 </div>
 )}
 </div>
 </div>
 );
}
