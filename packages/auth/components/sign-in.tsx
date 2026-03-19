"use client";

import { createClient } from "../client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

type Step = "credentials" | "otp";

export const SignIn = () => {
  const [step, setStep] = useState<Step>("credentials");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [resolvedEmail, setResolvedEmail] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const router = useRouter();
  const supabase = createClient();

  /** Resolve the user's org slug and navigate directly — avoids the /  /{slug} flash */
  const navigateAfterLogin = async () => {
    // Safety: if navigation takes >10s, stop the spinner so UI isn't frozen
    const safetyTimer = setTimeout(() => setLoading(false), 10000);
    try {
      const res = await fetch("/api/auth/resolve-redirect", { method: "POST" });
      const data = await res.json();
      router.push(data.redirect || "/");
    } catch {
      router.push("/");
    }
    clearTimeout(safetyTimer);
    router.refresh();
  };

  // Check for OAuth error in URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authError = params.get("error");
    if (authError === "unauthorized_email") {
      setError("This Google account is not authorized. Your administrator must add your email before you can sign in.");
      // Clean up the URL
      window.history.replaceState({}, "", window.location.pathname);
    } else if (authError === "sso_not_allowed") {
      setError("Google sign-in is only available for Remote Leverage team members. Please use your email and password to sign in.");
      window.history.replaceState({}, "", window.location.pathname);
    } else if (authError === "auth_callback_error") {
      setError("Sign-in failed. Please try again.");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // Countdown timer for resend
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const resolveEmail = async (input: string): Promise<{ email: string | null; masked: string | null; error: string | null }> => {
    const value = input.trim().toLowerCase();
    if (!value) return { email: null, masked: null, error: "Please enter your email or username." };

    // If input looks like an email, use it directly
    if (value.includes("@")) {
      // Mask the email for display: j***@gmail.com
      const [local, domain] = value.split("@");
      const masked = local.length <= 2 ? `${local}@${domain}` : `${local[0]}***@${domain}`;
      return { email: value, masked, error: null };
    }

    // Otherwise resolve username to email via API
    try {
      const res = await fetch("/api/auth/resolve-username", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: value }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { email: null, masked: null, error: data.error || "Username not found." };
      }
      return { email: data.email, masked: data.maskedEmail || data.email, error: null };
    } catch {
      return { email: null, masked: null, error: "Could not verify credentials. Please try again." };
    }
  };

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await resolveEmail(identifier);
    if (!result.email) {
      setError(result.error || "Please enter a valid email or username.");
      setLoading(false);
      return;
    }
    const email = result.email;

    // Verify password
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      const msg = signInError.message.toLowerCase();
      if (msg.includes("invalid") || msg.includes("credentials")) {
        setError("Incorrect password. Please check your credentials email for the correct password, or contact your administrator.");
      } else if (msg.includes("email not confirmed")) {
        setError("Your email has not been confirmed yet. Please contact your administrator.");
      } else {
        setError(signInError.message);
      }
      setLoading(false);
      return;
    }

    // Password correct — check if this device is trusted (skip OTP)
    try {
      const trustRes = await fetch("/api/auth/check-device-trust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const trustData = await trustRes.json();
      if (trustData.trusted) {
        // Device trusted — already signed in from signInWithPassword above, go straight through
        const { data: { user } } = await supabase.auth.getUser();
        if (user && !user.user_metadata?.activeOrganizationId) {
          try {
            const { data: { session: currentSession } } = await supabase.auth.getSession();
            await fetch("/api/auth/post-signup", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(currentSession?.access_token ? { Authorization: `Bearer ${currentSession.access_token}` } : {}),
              },
              body: JSON.stringify({ userId: user.id, email: user.email }),
            });
          } catch {}
        }
        await navigateAfterLogin();
        return;
      }
    } catch {
      // Trust check failed — fall through to OTP (safe default)
    }

    // Not trusted — sign out, we need OTP first
    await supabase.auth.signOut();

    // Send verification code
    try {
      const res = await fetch("/api/auth/send-login-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const serverMsg = data.detail || data.error || "";
        if (res.status === 500) {
          setError("Unable to send verification code right now. This is a server issue — please contact your administrator or try again later.");
        } else if (res.status === 429) {
          setError(serverMsg || "Too many attempts. Please wait a few minutes before trying again.");
        } else if (res.status === 403) {
          setError(serverMsg || "Your account has been deactivated. Please contact your administrator.");
        } else {
          throw new Error(serverMsg || "Failed to send code");
        }
        setLoading(false);
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send verification code. Please try again.");
      setLoading(false);
      return;
    }

    setResolvedEmail(email);
    setMaskedEmail(result.masked || email);
    setStep("otp");
    setCountdown(60);
    setLoading(false);
    setTimeout(() => otpRefs.current[0]?.focus(), 100);
  };

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newDigits = [...otpDigits];
    newDigits[index] = value.slice(-1);
    setOtpDigits(newDigits);

    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }

    const fullCode = newDigits.join("");
    if (fullCode.length === 6) {
      verifyOtp(fullCode);
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      setOtpDigits(pasted.split(""));
      verifyOtp(pasted);
    }
  };

  const verifyOtp = async (code: string) => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/verify-login-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resolvedEmail, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        const errMsg = data.error || "Invalid code";
        if (errMsg.includes("expired")) {
          setError("Your verification code has expired. Please request a new one.");
        } else if (errMsg.includes("Too many")) {
          setError("Too many verification attempts. Please wait a few minutes and request a new code.");
        } else {
          setError(`Verification failed: ${errMsg}. Please try again or request a new code.`);
        }
        setOtpDigits(["", "", "", "", "", ""]);
        otpRefs.current[0]?.focus();
        setLoading(false);
        return;
      }

      // OTP verified — now sign in for real
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: resolvedEmail,
        password,
      });
      if (signInError) {
        setError("Sign-in failed. Please try again.");
        setStep("credentials");
        setLoading(false);
        return;
      }

      // Auto-link org if needed
      const { data: { user } } = await supabase.auth.getUser();
      if (user && !user.user_metadata?.activeOrganizationId) {
        try {
          const { data: { session: currentSession } } = await supabase.auth.getSession();
          await fetch("/api/auth/post-signup", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(currentSession?.access_token ? { Authorization: `Bearer ${currentSession.access_token}` } : {}),
            },
            body: JSON.stringify({ userId: user.id, email: user.email }),
          });
        } catch {}
      }

      await navigateAfterLogin();
    } catch {
      setError("Verification failed. Please try again.");
      setLoading(false);
    }
  };

  const resendCode = async () => {
    if (countdown > 0) return;
    setLoading(true);
    setError(null);
    try {
      await fetch("/api/auth/send-login-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resolvedEmail }),
      });
      setCountdown(60);
      setOtpDigits(["", "", "", "", "", ""]);
      otpRefs.current[0]?.focus();
    } catch {
      setError("Failed to resend code.");
    }
    setLoading(false);
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/api/auth/callback` },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-bold">
          {step === "credentials" ? "Welcome back" : "Verify your identity"}
        </h1>
        <p className="text-balance text-sm text-muted-foreground">
          {step === "credentials"
            ? "Enter your email to sign in"
            : `We sent a 6-digit code to ${maskedEmail || resolvedEmail}`}
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <div className="flex gap-2">
            <svg className="h-5 w-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <div>
              <p className="font-medium">{error}</p>
              {error.includes("server issue") && (
                <p className="mt-1 text-xs opacity-75">Error code: EMAIL_SERVICE_UNAVAILABLE</p>
              )}
            </div>
          </div>
        </div>
      )}

      {step === "credentials" && (
        <>
          <form onSubmit={handleCredentials} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="identifier" className="text-sm font-medium">Email or Username</label>
              <input
                id="identifier"
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="password" className="text-sm font-medium">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
            >
              {loading ? "Verifying..." : "Continue"}
            </button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Google
          </button>
          <p className="text-center text-[11px] text-muted-foreground/70">
            Google sign-in is available for Remote Leverage team members only
          </p>
          <p className="text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <a href="/sign-up" className="underline underline-offset-4 hover:text-primary">Sign up</a>
          </p>
          <div className="rounded-lg border border-dashed p-4 text-center">
            <p className="text-sm font-medium text-muted-foreground">Contractor?</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Sign in with the email and password from your credentials email.
            </p>
          </div>
        </>
      )}

      {step === "otp" && (
        <div className="flex flex-col gap-6">
          <div className="flex justify-center gap-2" onPaste={handleOtpPaste}>
            {otpDigits.map((digit, i) => (
              <input
                key={i}
                ref={(el) => { otpRefs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleOtpChange(i, e.target.value)}
                onKeyDown={(e) => handleOtpKeyDown(i, e)}
                disabled={loading}
                className="h-12 w-10 rounded-lg border-2 border-input bg-background text-center text-lg font-bold ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-primary transition-colors disabled:opacity-50"
              />
            ))}
          </div>

          {loading && (
            <p className="text-center text-sm text-muted-foreground animate-pulse">Verifying...</p>
          )}

          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={resendCode}
              disabled={countdown > 0 || loading}
              className="text-sm text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
            >
              {countdown > 0 ? `Resend code in ${countdown}s` : "Resend code"}
            </button>
            <button
              type="button"
              onClick={() => { setStep("credentials"); setError(null); setOtpDigits(["", "", "", "", "", ""]); }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
               Back to sign in
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
