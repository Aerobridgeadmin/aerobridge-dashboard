"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { StarBackground } from "@/components/star-background";
import { SecurityTrustStrip } from "@/components/security-trust-strip";

declare global {
 interface Window {
 veriffSDK?: {
 createVeriffFrame: (opts: {
 url: string;
 onEvent?: (msg: string) => void;
 onReload?: () => void;
 lang?: string;
 }) => { close: () => void };
 };
 }
}

type Props = {
 sessionUrl: string;
 adminName: string;
 orgName: string;
 kycStatus: string;
};

export function VerifyClient({
 sessionUrl,
 adminName,
 orgName,
 kycStatus,
}: Props) {
 const [phase, setPhase] = useState<
 "intro"| "verifying"| "submitted"| "done"| "canceled"
 >(kycStatus === "submitted"? "submitted": kycStatus === "started"? "intro": "intro");
 const [sdkReady, setSdkReady] = useState(false);
 const frameRef = useRef<{ close: () => void } | null>(null);

 const launchVeriff = useCallback(() => {
 if (!window.veriffSDK || !sessionUrl) return;
 setPhase("verifying");

 frameRef.current = window.veriffSDK.createVeriffFrame({
 url: sessionUrl,
 onEvent: (msg: string) => {
 switch (msg) {
 case "STARTED":
 break;
 case "SUBMITTED":
 setPhase("submitted");
 break;
 case "FINISHED":
 setPhase("done");
 break;
 case "CANCELED":
 setPhase("canceled");
 break;
 }
 },
 });
 }, [sessionUrl]);

 // Auto-close modal reference on unmount
 useEffect(() => {
 return () => {
 frameRef.current?.close();
 };
 }, []);

 return (
 <>
 <Script
 src="https://cdn.veriff.me/incontext/js/v2.5.0/veriff.js"
 onLoad={() => setSdkReady(true)}
 />

 <StarBackground />

 <div className="flex min-h-screen flex-col relative z-10 bg-transparent">
 {/* Header */}
 <header
 className="w-full"
 style={{
 background: "linear-gradient(135deg, #00B0BB 0%, #00DB65 100%)",
 }}
 >
 <div className="mx-auto flex max-w-2xl items-center gap-3 px-6 py-5">
 <img
 src="/logo.png"
 alt="Remote Leverage"
 className="h-11 w-11 rounded-xl"
 />
 <div>
 <div className="text-[17px] font-bold tracking-wide text-white">
 Remote Leverage
 </div>
 <div className="text-xs font-medium text-white/70">
 Identity Verification
 </div>
 </div>
 </div>
 </header>

 {/* Main */}
 <main className="flex flex-1 items-start justify-center px-4 py-10">
 <div className="w-full max-w-xl">
 {phase === "intro"&& (
 <IntroView
 adminName={adminName}
 orgName={orgName}
 sdkReady={sdkReady}
 onStart={launchVeriff}
 isReturning={kycStatus === "started"}
 />
 )}
 {phase === "verifying"&& <VerifyingView />}
 {phase === "submitted"&& <SubmittedView orgName={orgName} />}
 {phase === "done"&& <DoneView orgName={orgName} />}
 {phase === "canceled"&& (
 <CanceledView sdkReady={sdkReady} onRetry={launchVeriff} />
 )}
 </div>
 </main>

 {/* Footer */}
 <footer className="border-t border-white/10 bg-transparent px-6 py-4">
 <div className="mx-auto max-w-2xl text-center text-[11px] text-white/40">
 © {new Date().getFullYear()} Remote Leverage LLC · 1900 Camden Ave,
 San Jose, CA 95124
 <br />
 Identity verification is handled by{" "}
 <a
 href="https://www.veriff.com"
 target="_blank"
 rel="noopener noreferrer"
 className="underline"
 >
 Veriff
 </a>
 , a certified identity verification provider. Your documents are
 processed in compliance with GDPR and SOC 2 standards.
 </div>
 </footer>
 </div>
 </>
 );
}

/* ─── Sub-views ─────────────────────────────────────────────────────────── */

function IntroView({
 adminName,
 orgName,
 sdkReady,
 onStart,
 isReturning,
}: {
 adminName: string;
 orgName: string;
 sdkReady: boolean;
 onStart: () => void;
 isReturning?: boolean;
}) {
 return (
 <div className="space-y-6">
 <div>
 <h1 className="text-2xl font-bold text-white">
 {isReturning ? "Continue Your Verification": "Verify Your Identity"}
 </h1>
 <p className="mt-2 text-sm text-white/50">
 {isReturning ? (
 <>
 Welcome back, {adminName}! It looks like you started the
 verification for{" "}
 <strong className="text-white/80">{orgName}</strong> but didn't
 finish. Click below to pick up where you left off.
 </>
 ) : (
 <>
 Hi {adminName}, welcome to Remote Leverage! As part of onboarding{" "}
 <strong className="text-white/80">{orgName}</strong>, we need to
 verify the identity of the primary account administrator. This is a
 quick, secure process.
 </>
 )}
 </p>
 </div>

 {/* What you'll need */}
 <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl p-5 shadow-lg">
 <h2 className="mb-3 text-sm font-semibold text-white/80 uppercase tracking-wide">
 What You'll Need
 </h2>
 <div className="space-y-3">
 {[
 {
 icon: "ID",
 text: "A government-issued photo ID (passport, driver's license, or national ID)",
 },
 {
 icon: "Cam",
 text: "A device with a camera (phone or laptop with webcam)",
 },
 {
 icon: "Lit",
 text: "Good lighting for the selfie step",
 },
 ].map((item) => (
 <div key={item.text} className="flex items-start gap-3">
 <span className="text-lg">{item.icon}</span>
 <span className="text-sm text-white/60">{item.text}</span>
 </div>
 ))}
 </div>
 </div>

 {/* Steps */}
 <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl p-5 shadow-lg">
 <h2 className="mb-4 text-sm font-semibold text-white/80 uppercase tracking-wide">
 How It Works
 </h2>
 <div className="space-y-4">
 {[
 {
 n: 1,
 title: "Scan Your ID",
 desc: "Take a clear photo of the front (and back if applicable) of your government-issued ID.",
 },
 {
 n: 2,
 title: "Take a Selfie",
 desc: "A quick selfie to match your face to your ID photo, ensuring no one else is using your identity.",
 },
 {
 n: 3,
 title: "Automatic Review",
 desc: "Your submission is reviewed automatically. Most verifications are approved within minutes.",
 },
 ].map((step) => (
 <div key={step.n} className="flex items-start gap-3">
 <div
 className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
 style={{
 background:
 "linear-gradient(135deg, #00B0BB 0%, #00DB65 100%)",
 }}
 >
 {step.n}
 </div>
 <div>
 <div className="text-sm font-semibold text-white">
 {step.title}
 </div>
 <div className="text-xs text-white/50">{step.desc}</div>
 </div>
 </div>
 ))}
 </div>
 </div>

 {/* CTA */}
 <button
 type="button"
 onClick={onStart}
 disabled={!sdkReady}
 className="flex w-full items-center justify-center gap-2 rounded-xl px-6 py-4 text-base font-bold text-white shadow-lg transition hover:shadow-xl disabled:opacity-50"
 style={{
 background: "linear-gradient(135deg, #00B0BB 0%, #00DB65 100%)",
 }}
 >
 {sdkReady ? (
 <>
 {isReturning ? "Resume Verification": "Start Identity Verification"}
 <svg
 className="h-5 w-5"
 fill="none"
 viewBox="0 0 24 24"
 stroke="currentColor"
 >
 <path
 strokeLinecap="round"
 strokeLinejoin="round"
 strokeWidth={2}
 d="M13 7l5 5m0 0l-5 5m5-5H6"
 />
 </svg>
 </>
 ) : (
 "Loading…"
 )}
 </button>

 {/* Security Trust Badges */}
 <SecurityTrustStrip className="mt-2"/>

 {/* Privacy note */}
 <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3">
 <p className="text-xs text-emerald-300">
 <strong>Your privacy is protected.</strong> Identity verification is
 handled by Veriff, a certified identity verification provider. Remote
 Leverage does not store your ID documents. Your data is processed in
 compliance with GDPR and SOC 2 standards.
 </p>
 </div>

 <div className="rounded-lg border border-sky-500/20 bg-sky-500/10 p-3">
 <p className="text-xs text-sky-300">
 <strong>This link expires in 7 days.</strong> If it expires, your
 Remote Leverage coordinator can resend it.
 </p>
 </div>
 </div>
 );
}

function VerifyingView() {
 return (
 <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 text-center shadow-lg">
 <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-teal-400"/>
 <h2 className="text-lg font-semibold text-white">
 Verification In Progress
 </h2>
 <p className="mt-2 text-sm text-white/50">
 The verification window should be open. If you don't see it, please
 check for a popup blocker.
 </p>
 </div>
 );
}

function SubmittedView({ orgName }: { orgName: string }) {
 return (
 <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 text-center shadow-lg">
 <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-yellow-500/15">
 <svg
 className="h-8 w-8 text-yellow-400"
 fill="none"
 viewBox="0 0 24 24"
 stroke="currentColor"
 >
 <path
 strokeLinecap="round"
 strokeLinejoin="round"
 strokeWidth={2}
 d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
 />
 </svg>
 </div>
 <h2 className="text-lg font-semibold text-white">Under Review</h2>
 <p className="mt-2 text-sm text-white/50">
 Your identity documents for <strong>{orgName}</strong> have been
 submitted and are being reviewed. Most verifications are approved within
 minutes. You'll receive an email once the review is complete.
 </p>
 </div>
 );
}

function DoneView({ orgName }: { orgName: string }) {
 return (
 <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 text-center shadow-lg">
 <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15">
 <svg
 className="h-8 w-8 text-emerald-400"
 fill="none"
 viewBox="0 0 24 24"
 stroke="currentColor"
 >
 <path
 strokeLinecap="round"
 strokeLinejoin="round"
 strokeWidth={2}
 d="M5 13l4 4L19 7"
 />
 </svg>
 </div>
 <h2 className="text-lg font-semibold text-white">
 Verification Complete!
 </h2>
 <p className="mt-2 text-sm text-white/50">
 Thank you! Your identity verification for <strong>{orgName}</strong> has
 been submitted successfully. You'll receive an email confirmation once
 the review is finalized — this usually takes just a few minutes.
 </p>
 <div className="mt-6 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3">
 <p className="text-xs text-emerald-300">
 You can safely close this page. Your Remote Leverage coordinator will
 follow up with next steps.
 </p>
 </div>
 </div>
 );
}

function CanceledView({
 sdkReady,
 onRetry,
}: {
 sdkReady: boolean;
 onRetry: () => void;
}) {
 return (
 <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 text-center shadow-lg">
 <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/10">
 <svg
 className="h-8 w-8 text-white/50"
 fill="none"
 viewBox="0 0 24 24"
 stroke="currentColor"
 >
 <path
 strokeLinecap="round"
 strokeLinejoin="round"
 strokeWidth={2}
 d="M6 18L18 6M6 6l12 12"
 />
 </svg>
 </div>
 <h2 className="text-lg font-semibold text-white">
 Verification Closed
 </h2>
 <p className="mt-2 text-sm text-white/50">
 It looks like the verification was closed before completing. No worries —
 you can try again whenever you're ready.
 </p>
 <button
 type="button"
 onClick={onRetry}
 disabled={!sdkReady}
 className="mt-6 inline-flex items-center gap-2 rounded-xl px-8 py-3 text-sm font-bold text-white shadow transition hover:shadow-lg disabled:opacity-50"
 style={{
 background: "linear-gradient(135deg, #00B0BB 0%, #00DB65 100%)",
 }}
 >
 Try Again
 </button>
 </div>
 );
}
