"use client";

import { useState, useCallback, useEffect } from "react";
import { Check, X } from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";

/**
 * ChangePassword — handles both regular password changes AND
 * lets Google SSO users set a password so they can also log in with username/password.
 * Also includes username editing.
 */
export function ChangePassword({ currentUsername }: { currentUsername?: string | null }) {
  const [pwOpen, setPwOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isGoogleUser, setIsGoogleUser] = useState(false);
  const [hasPassword, setHasPassword] = useState(true);
  const [checked, setChecked] = useState(false);

  // Username state
  const [unOpen, setUnOpen] = useState(false);
  const [username, setUsername] = useState(currentUsername ?? "");
  const [unLoading, setUnLoading] = useState(false);
  const [unError, setUnError] = useState<string | null>(null);
  const [unSuccess, setUnSuccess] = useState(false);

  useEffect(() => {
    const sb = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    sb.auth.getUser().then(({ data }) => {
      const provider = data.user?.app_metadata?.provider;
      const providers: string[] = data.user?.app_metadata?.providers ?? [];
      setIsGoogleUser(provider === "google");
      setHasPassword(providers.includes("email") && !!data.user?.user_metadata?.passwordChanged);
      setChecked(true);
    });
  }, []);

  const resetPw = () => {
    setCurrentPassword("");
    setPassword("");
    setConfirm("");
    setError(null);
    setSuccess(false);
  };

  const validPw = password.length >= 8 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /[0-9]/.test(password) && password === confirm;

  const handlePasswordSubmit = useCallback(async () => {
    setError(null);

    if (!isGoogleUser && !currentPassword.trim()) {
      setError("Please enter your current password.");
      return;
    }
    if (password.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      setError("Password must include uppercase, lowercase, and a number.");
      return;
    }

    setLoading(true);
    try {
      if (isGoogleUser && !hasPassword) {
        const { setMyPassword } = await import("@/app/actions/hriq/auth-actions");
        const result = await setMyPassword(password);
        if ("error" in result) {
          setError(result.error);
          return;
        }
        setHasPassword(true);
      } else {
        const sb = createBrowserClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );

        const { data: { user } } = await sb.auth.getUser();
        if (!user?.email) {
          setError("Could not verify your account. Please try again.");
          return;
        }

        const { error: signInErr } = await sb.auth.signInWithPassword({
          email: user.email,
          password: currentPassword,
        });
        if (signInErr) {
          setError("Current password is incorrect.");
          return;
        }

        const { error: updateErr } = await sb.auth.updateUser({
          password,
          data: { passwordChanged: true },
        });
        if (updateErr) {
          setError(updateErr.message);
          return;
        }
      }

      setSuccess(true);
      setTimeout(() => {
        setPwOpen(false);
        resetPw();
      }, 2000);
    } catch {
      setError("Failed to update password. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [currentPassword, password, confirm, isGoogleUser, hasPassword]);

  const handleUsernameSubmit = useCallback(async () => {
    setUnError(null);
    const trimmed = username.trim().toLowerCase();
    if (trimmed.length < 3 || trimmed.length > 30) {
      setUnError("Username must be 3\u201330 characters.");
      return;
    }
    if (!/^[a-z0-9_-]+$/.test(trimmed)) {
      setUnError("Only letters, numbers, underscores, and hyphens.");
      return;
    }
    if (trimmed === (currentUsername ?? "").toLowerCase()) {
      setUnOpen(false);
      return;
    }

    setUnLoading(true);
    try {
      const { changeMyUsername } = await import("@/app/actions/hriq/auth-actions");
      const result = await changeMyUsername(trimmed);
      if ("error" in result) {
        setUnError(result.error);
        return;
      }
      setUnSuccess(true);
      setTimeout(() => {
        setUnOpen(false);
        setUnSuccess(false);
      }, 2000);
    } catch {
      setUnError("Failed to update username.");
    } finally {
      setUnLoading(false);
    }
  }, [username, currentUsername]);

  if (!checked) return null;

  const isSettingFirst = isGoogleUser && !hasPassword;

  return (
    <div className="space-y-4">
      {/* Username */}
      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <svg className="h-5 w-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <h3 className="font-semibold">Username</h3>
          </div>
          {!unOpen && (
            <button
              type="button"
              onClick={() => { setUnError(null); setUnSuccess(false); setUsername(currentUsername ?? ""); setUnOpen(true); }}
              className="h-8 rounded-md border px-3 text-xs font-medium hover:bg-accent transition-colors"
            >
              {currentUsername ? "Change Username" : "Set Username"}
            </button>
          )}
        </div>

        {!unOpen && (
          <p className="text-sm text-muted-foreground">
            {currentUsername
              ? <>Your login username is <span className="font-medium text-foreground">{currentUsername}</span></>
              : "No username set. Set one to log in with username instead of email."}
          </p>
        )}

        {unOpen && (
          <div className="mt-4 space-y-4">
            {unError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {unError}
              </div>
            )}
            {unSuccess ? (
              <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-4 text-center">
                <div className="text-sm font-bold text-green-600">Username Updated</div>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="un-new" className="text-xs font-medium text-muted-foreground">New Username</label>
                  <input
                    id="un-new"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.replace(/\s/g, ""))}
                    placeholder="e.g. jsmith"
                    autoFocus
                    maxLength={30}
                    onKeyDown={(e) => { if (e.key === "Enter") handleUsernameSubmit(); }}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <p className="text-[11px] text-muted-foreground">3-30 characters. Letters, numbers, underscores, hyphens only.</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleUsernameSubmit}
                    disabled={unLoading || username.trim().length < 3}
                    className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {unLoading ? "Saving\u2026" : "Save Username"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setUnOpen(false); setUnError(null); }}
                    disabled={unLoading}
                    className="h-9 rounded-md border px-4 text-sm font-medium hover:bg-accent transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Password */}
      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <svg className="h-5 w-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <h3 className="font-semibold">Password</h3>
          </div>
          {!pwOpen && (
            <button
              type="button"
              onClick={() => { resetPw(); setPwOpen(true); }}
              className="h-8 rounded-md border px-3 text-xs font-medium hover:bg-accent transition-colors"
            >
              {isSettingFirst ? "Set Password" : "Change Password"}
            </button>
          )}
        </div>

        {!pwOpen && (
          <p className="text-sm text-muted-foreground">
            {isSettingFirst
              ? "You signed in with Google. Set a password to also log in with your username."
              : "Update your login password."}
          </p>
        )}

        {pwOpen && (
          <div className="mt-4 space-y-4">
            {isSettingFirst && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 px-4 py-3 text-sm text-blue-800 dark:text-blue-300">
                You signed in with Google. Setting a password lets you also log in with your username and password.
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {success ? (
              <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-4 text-center">
                <div className="text-sm font-bold text-green-600">{isSettingFirst ? "Password Set" : "Password Updated"}</div>
              </div>
            ) : (
              <>
                {!isSettingFirst && (
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="cp-current" className="text-xs font-medium text-muted-foreground">Current Password</label>
                    <input
                      id="cp-current"
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter your current password"
                      autoFocus
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="cp-new" className="text-xs font-medium text-muted-foreground">{isSettingFirst ? "Password" : "New Password"}</label>
                  <input
                    id="cp-new"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    autoFocus={isSettingFirst}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="cp-confirm" className="text-xs font-medium text-muted-foreground">Confirm Password</label>
                  <input
                    id="cp-confirm"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Re-enter your password"
                    onKeyDown={(e) => { if (e.key === "Enter" && validPw) handlePasswordSubmit(); }}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>

                {password.length > 0 && (
                  <div className="space-y-1">
                    {[
                      { ok: password.length >= 8, label: "At least 8 characters" },
                      { ok: /[A-Z]/.test(password), label: "Uppercase letter" },
                      { ok: /[a-z]/.test(password), label: "Lowercase letter" },
                      { ok: /[0-9]/.test(password), label: "Number" },
                    ].map(({ ok, label }) => (
                      <div key={label} className="flex items-center gap-2">
                        <div className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${ok ? "bg-green-500 text-white" : "bg-muted text-muted-foreground"}`}>
                          {ok ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
                        </div>
                        <span className={`text-xs ${ok ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>{label}</span>
                      </div>
                    ))}
                    {confirm.length > 0 && (
                      <div className="flex items-center gap-2">
                        <div className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${password === confirm ? "bg-green-500 text-white" : "bg-red-500 text-white"}`}>
                          {password === confirm ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
                        </div>
                        <span className={`text-xs ${password === confirm ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
                          {password === confirm ? "Passwords match" : "Passwords don't match"}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handlePasswordSubmit}
                    disabled={loading || !validPw || (!isSettingFirst && !currentPassword.trim())}
                    className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {loading ? "Updating\u2026" : isSettingFirst ? "Set Password" : "Update Password"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPwOpen(false); resetPw(); }}
                    disabled={loading}
                    className="h-9 rounded-md border px-4 text-sm font-medium hover:bg-accent transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
