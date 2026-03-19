"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useCallback, useRef } from "react";
import { createBrowserClient } from "@supabase/ssr";

/* ─── Types ──────────────────────────────────────────────────────────────── */

type TourStep = {
 id: string;
 /** CSS selector for the target element to spotlight */
 target: string;
 title: string;
 description: string;
 href: string;
 tip: string;
};

type Props = {
 userName?: string;
 role?: string;
 orgName?: string;
 orgLogoUrl?: string | null;
};

type Rect = { top: number; left: number; width: number; height: number };

/* ─── Steps ───────────────────────────────────────────────────────────────── */

function getSteps(role: string, slug: string): TourStep[] {
 if (role === "super_admin") {
 return [
 { id: "dashboard", target: "[data-tour='dashboard']", title: "Command Center", description: "Your global overview — contractor counts, payroll totals, pending approvals, and real-time stats across all client organizations.", href: `/${slug}`, tip: "The globe shows every country where you have active contractors."},
 { id: "contractors", target: "[data-tour='contractors']", title: "All Contractors", description: "Browse every contractor across all clients. View profiles, employment status, onboarding progress, and compensation details.", href: `/${slug}/employees`, tip: "Click any contractor to see their full profile and edit their details."},
 { id: "payroll", target: "[data-tour='payroll']", title: "Payroll", description: "Review and approve timesheets, process payroll runs, and track payment status across all organizations.", href: `/${slug}/payroll`, tip: "Approved timesheets automatically queue up for payment processing."},
 { id: "hiring", target: "[data-tour='hiring-pipeline']", title: "Hiring Pipeline", description: "Onboard new contractors here. Track candidates through each stage, send onboarding emails, and manage document collection.", href: `/${slug}/hiring`, tip: "You can batch-onboard multiple contractors at once."},
 { id: "clients", target: "[data-tour='all-clients']", title: "Client Organizations", description: "Manage all client organizations. View their teams, billing, KYC status, and switch between org contexts.", href: `/${slug}/organizations`, tip: "Use the org switcher in the sidebar to quickly jump between clients."},
 { id: "customize", target: "[data-tour='customize']", title: "Customize Your Dashboard", description: "Drag and drop widgets to rearrange your dashboard. Toggle widgets on/off and make it your own.", href: `/${slug}`, tip: "Your layout is saved automatically and persists across sessions."},
 ];
 }
 if (role === "member") {
 return [
 { id: "dashboard", target: "[data-tour='dashboard']", title: "Your Dashboard", description: "This is your home base. See your tasks, upcoming deadlines, and quick actions.", href: `/${slug}`, tip: "Click the logo anytime to come back here."},
 { id: "timesheet", target: "[data-tour='timesheets']", title: "Submit Timesheets", description: "Log your hours each week. Fill in daily hours and submit before the deadline for your manager's approval.", href: `/${slug}/timesheets`, tip: "You'll get email reminders if a timesheet is missing."},
 { id: "tasks", target: "[data-tour='tasks']", title: "Your Tasks", description: "See assigned tasks, their deadlines, and mark them complete as you go.", href: `/${slug}/tasks`, tip: "Tasks are assigned by your manager or during onboarding."},
 { id: "payments", target: "[data-tour='payroll']", title: "Track Payments", description: "See your payment history, upcoming payouts, and estimated earnings.", href: `/${slug}/payroll`, tip: "Payments are processed after your timesheet is approved."},
 { id: "documents", target: "[data-tour='documents']", title: "Your Documents", description: "View and sign contracts, NDAs, and other onboarding documents. Upload files directly from here.", href: `/${slug}/documents`, tip: "Signed documents are verified automatically."},
 { id: "customize", target: "[data-tour='customize']", title: "Customize Your Dashboard", description: "Personalize your view. Drag widgets to reorder them, or toggle sections on/off to focus on what matters.", href: `/${slug}`, tip: "Your layout is saved automatically and persists across sessions."},
 ];
 }
 // admin, manager, client
 if (role === "admin") {
 return [
 { id: "dashboard", target: "[data-tour='dashboard']", title: "Your Dashboard", description: "Your overview of team activity — contractor stats, pending timesheets, and payment summaries at a glance.", href: `/${slug}`, tip: "The dashboard updates in real-time as your team submits timesheets."},
 { id: "contractors", target: "[data-tour='contractors']", title: "Your Contractors", description: "View everyone on your team — their roles, status, and performance. Click any contractor to see their full profile.", href: `/${slug}/employees`, tip: "Contact your account manager to onboard new team members."},
 { id: "payroll", target: "[data-tour='payroll']", title: "Review Timesheets", description: "Approve or reject contractor timesheets each week. You'll see hours, daily breakdowns, and can add notes.", href: `/${slug}/payroll`, tip: "Approved timesheets trigger automatic payment processing."},
 { id: "payments", target: "[data-tour='payroll']", title: "Payments", description: "Track all payments and invoices for your team. See payment status and download receipts.", href: `/${slug}/payroll`, tip: "You'll receive email notifications for each processed payment."},
 { id: "customize", target: "[data-tour='customize']", title: "Customize Your Dashboard", description: "Rearrange your dashboard to suit your workflow. Drag widgets around or hide sections you don't need.", href: `/${slug}`, tip: "Click Customize in the top-right corner anytime to reorganize."},
 ];
 }
 return [
 { id: "dashboard", target: "[data-tour='dashboard']", title: "Your Dashboard", description: "Your command center — team stats, pending timesheets, payment summaries, and quick actions all in one place.", href: `/${slug}`, tip: "The dashboard updates in real-time as your team submits timesheets."},
 { id: "contractors", target: "[data-tour='contractors']", title: "Manage Contractors", description: "View everyone on your team — their roles, status, and performance. Click any contractor to see their full profile.", href: `/${slug}/employees`, tip: "Use the Hiring Pipeline to onboard new team members."},
 { id: "timesheets", target: "[data-tour='payroll']", title: "Review Timesheets", description: "Approve or reject contractor timesheets each week. You'll see hours, daily breakdowns, and can add notes.", href: `/${slug}/payroll`, tip: "Approved timesheets trigger automatic payment processing."},
 { id: "payments", target: "[data-tour='payroll']", title: "Payments & Invoicing", description: "Track all payments, view invoices, and see payment status for your entire team.", href: `/${slug}/payroll`, tip: "You'll receive email notifications for each processed payment."},
 { id: "settings", target: "[data-tour='settings']", title: "Organization Settings", description: "Customize your organization preferences, manage team members, and configure integrations.", href: `/${slug}/settings`, tip: "Add more admins from the Members section."},
 { id: "customize", target: "[data-tour='customize']", title: "Customize Your Dashboard", description: "Rearrange your dashboard to suit your workflow. Drag widgets around or hide sections you don't need.", href: `/${slug}`, tip: "Click Customize in the top-right corner anytime to reorganize."},
 ];
}

/* ─── Welcome Modal ──────────────────────────────────────────────────────── */

function WelcomeModal({ userName, orgName, orgLogoUrl, onStart, onSkip }: {
 userName?: string; orgName?: string; orgLogoUrl?: string | null; onStart: () => void; onSkip: () => void;
}) {
 const display = orgName || "Remote Leverage";
 return (
 <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
 <div className="relative w-full max-w-lg rounded-2xl border border-sidebar-border bg-card shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
 <div className="px-8 pt-8 pb-5 text-center border-b border-sidebar-border bg-gradient-to-b from-primary/5 to-transparent">
 <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-500 text-white shadow-lg overflow-hidden">
 {orgLogoUrl
 ? <img src={orgLogoUrl} alt={display} className="h-full w-full object-cover"/>
 : <span className="text-xl font-bold">{display.charAt(0)}</span>}
 </div>
 <h1 className="text-xl font-bold text-foreground">
 Welcome{userName ? `, ${userName}` : ""}!
 </h1>
 <p className="mt-1.5 text-sm text-muted-foreground">
 You&apos;re all set up on <strong className="text-foreground">{display}</strong>. Let&apos;s show you around.
 </p>
 </div>
 <div className="px-8 py-5 space-y-3">
 <p className="text-sm text-muted-foreground text-center">Take a quick tour to learn your way around?</p>
 <button type="button"onClick={onStart} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-lg transition hover:bg-primary/90">
 Start Tour
 <svg className="h-4 w-4"fill="none"viewBox="0 0 24 24"stroke="currentColor"><path strokeLinecap="round"strokeLinejoin="round"strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>
 </button>
 <button type="button"onClick={onSkip} className="flex w-full items-center justify-center text-xs text-muted-foreground hover:text-foreground transition">Skip for now</button>
 </div>
 </div>
 </div>
 );
}

/* ─── Spotlight Tour ─────────────────────────────────────────────────────── */

function SpotlightTour({ steps, currentStep, onNext, onPrev, onGo, onFinish }: {
 steps: TourStep[]; currentStep: number;
 onNext: () => void; onPrev: () => void; onGo: (step: TourStep) => void; onFinish: () => void;
}) {
 const step = steps[currentStep];
 const [targetRect, setTargetRect] = useState<Rect | null>(null);
 const [cardStyle, setCardStyle] = useState<React.CSSProperties>({});
 const [arrowSide, setArrowSide] = useState<"left"| "right"| "top">("left");
 const cardRef = useRef<HTMLDivElement>(null);
 const CARD_W = 340;

 // Measure target element
 const measure = useCallback(() => {
 if (!step) return;
 const el = document.querySelector(step.target);
 if (!el) { setTargetRect(null); return; }
 const r = el.getBoundingClientRect();
 const pad = 6;
 setTargetRect({ top: r.top - pad, left: r.left - pad, width: r.width + pad * 2, height: r.height + pad * 2 });
 }, [step]);

 // Position card relative to target
 useEffect(() => {
 if (!targetRect) {
 setCardStyle({ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)"});
 return;
 }
 const vh = window.innerHeight;
 const vw = window.innerWidth;
 const cardH = cardRef.current?.offsetHeight ?? 220;

 // Place to the right of target
 const rightX = targetRect.left + targetRect.width + 24;
 const centerY = targetRect.top + targetRect.height / 2 - cardH / 2;
 const clampedY = Math.max(16, Math.min(centerY, vh - cardH - 16));

 if (rightX + CARD_W < vw - 20) {
 setArrowSide("left");
 setCardStyle({ position: "fixed", top: clampedY, left: rightX });
 } else if (targetRect.left - CARD_W - 24 > 16) {
 // Place to the left of target (for elements near right edge)
 setArrowSide("right");
 setCardStyle({ position: "fixed", top: clampedY, left: targetRect.left - CARD_W - 24 });
 } else {
 // Below target — clamp both left AND right edges
 setArrowSide("top");
 const belowY = targetRect.top + targetRect.height + 20;
 const centerX = targetRect.left + targetRect.width / 2 - CARD_W / 2;
 const clampedX = Math.max(16, Math.min(centerX, vw - CARD_W - 16));
 setCardStyle({ position: "fixed", top: Math.min(belowY, vh - cardH - 16), left: clampedX });
 }
 }, [targetRect]);

 useEffect(() => {
 measure();
 const handler = () => measure();
 window.addEventListener("resize", handler);
 window.addEventListener("scroll", handler, true);
 return () => { window.removeEventListener("resize", handler); window.removeEventListener("scroll", handler, true); };
 }, [measure, currentStep]);

 // Re-measure after sidebar transitions
 useEffect(() => { const t = setTimeout(measure, 120); return () => clearTimeout(t); }, [measure, currentStep]);

  // Elevate the target element above the overlay (fixes asset layering during tour)
  useEffect(() => {
    if (!step) return;
    const el = document.querySelector(step.target) as HTMLElement | null;
    if (!el) return;
    const prevPos = el.style.position;
    const prevZ = el.style.zIndex;
    if (!prevPos) el.style.position = "relative";
    el.style.zIndex = "10002";
    return () => { el.style.position = prevPos; el.style.zIndex = prevZ; };
  }, [step, currentStep]);

 if (!step) return null;
 const isLast = currentStep === steps.length - 1;
 const isFirst = currentStep === 0;

 // SVG arrow from target to card
 const renderArrow = () => {
 if (!targetRect) return null;
 const cs = cardStyle as { top?: number; left?: number };
 if (typeof cs.top !== "number"|| typeof cs.left !== "number") return null;

 let d: string;
 if (arrowSide === "left") {
 const x1 = targetRect.left + targetRect.width + 2;
 const y1 = targetRect.top + targetRect.height / 2;
 const x2 = cs.left - 2;
 const y2 = cs.top + 36;
 const mx = x1 + (x2 - x1) * 0.45;
 d = `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
 } else if (arrowSide === "right") {
 const x1 = targetRect.left - 2;
 const y1 = targetRect.top + targetRect.height / 2;
 const x2 = cs.left + CARD_W + 2;
 const y2 = cs.top + 36;
 const mx = x1 + (x2 - x1) * 0.45;
 d = `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
 } else {
 const x1 = targetRect.left + targetRect.width / 2;
 const y1 = targetRect.top + targetRect.height + 2;
 const x2 = cs.left + CARD_W / 2;
 const y2 = cs.top - 2;
 const my = y1 + (y2 - y1) * 0.45;
 d = `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`;
 }
 return (
 <svg className="fixed inset-0 w-full h-full pointer-events-none"style={{ zIndex: 10000 }}>
 <defs>
 <marker id="ah"markerWidth="8"markerHeight="6"refX="7"refY="3"orient="auto">
 <polygon points="0 0, 8 3, 0 6"fill="rgba(255,255,255,0.5)"/>
 </marker>
 </defs>
 <path d={d} fill="none"stroke="rgba(255,255,255,0.35)"strokeWidth="1.5"strokeDasharray="5 4"markerEnd="url(#ah)"/>
 </svg>
 );
 };

 return (
 <>
 {/* Overlay with cutout */}
 <svg className="fixed inset-0 w-full h-full"style={{ zIndex: 9999, pointerEvents: "auto"}} onClick={onFinish}>
 <defs>
 <mask id="spot">
 <rect width="100%"height="100%"fill="white"/>
 {targetRect && (
 <rect x={targetRect.left} y={targetRect.top} width={targetRect.width} height={targetRect.height} rx="8"fill="black"/>
 )}
 </mask>
 </defs>
 <rect width="100%"height="100%"fill="rgba(0,0,0,0.78)"mask="url(#spot)"/>
 </svg>

 {/* Glowing ring around target */}
 {targetRect && (
 <div
 className="fixed rounded-lg pointer-events-none"
 style={{
 zIndex: 10000,
 top: targetRect.top, left: targetRect.left,
 width: targetRect.width, height: targetRect.height,
 boxShadow: "0 0 0 2px hsl(var(--primary)), 0 0 20px 4px hsl(var(--primary) / 0.2)",
 transition: "all 0.3s ease",
 }}
 />
 )}

 {/* Arrow */}
 {renderArrow()}

 {/* Tooltip */}
 <div
 ref={cardRef}
 className="animate-in fade-in slide-in-from-left-2 duration-200"
 style={{ zIndex: 10001, width: CARD_W, pointerEvents: "auto", ...cardStyle }}
 onClick={(e) => e.stopPropagation()}
 >
 {/* Progress dots */}
 <div className="flex gap-1 mb-2 justify-center">
 {steps.map((_, i) => (
 <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === currentStep ? "w-6 bg-primary": i < currentStep ? "w-3 bg-primary/50": "w-3 bg-white/20"}`} />
 ))}
 </div>

 <div className="rounded-xl border border-white/10 bg-zinc-900/95 backdrop-blur-xl shadow-2xl overflow-hidden">
 <div className="px-5 pt-4 pb-3">
 <span className="text-[10px] font-bold uppercase tracking-wider text-primary/70">
 Step {currentStep + 1} of {steps.length}
 </span>
 <h2 className="mt-1 text-base font-bold text-white">{step.title}</h2>
 <p className="mt-1.5 text-[13px] text-white/60 leading-relaxed">{step.description}</p>
 <div className="mt-3 flex items-start gap-2 rounded-lg bg-white/5 border border-white/10 px-3 py-2">
 <svg className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary/70"fill="none"viewBox="0 0 24 24"stroke="currentColor"strokeWidth={2}>
 <path strokeLinecap="round"strokeLinejoin="round"d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
 </svg>
 <span className="text-[11px] text-white/40">{step.tip}</span>
 </div>
 </div>
 <div className="flex items-center justify-between border-t border-white/10 px-5 py-2.5">
 <div>{!isFirst && <button onClick={onPrev} className="text-xs text-white/40 hover:text-white/70 transition">← Back</button>}</div>
 <div className="flex items-center gap-1.5">
 <button onClick={() => onGo(step)} className="h-7 rounded-md border border-white/10 px-2.5 text-[11px] font-medium text-white/60 hover:text-white hover:bg-white/5 transition">Open</button>
 {isLast
 ? <button onClick={onFinish} className="h-7 rounded-md bg-primary px-3 text-[11px] font-bold text-primary-foreground hover:bg-primary/90 transition">Done </button>
 : <button onClick={onNext} className="h-7 rounded-md bg-primary px-3 text-[11px] font-bold text-primary-foreground hover:bg-primary/90 transition">Next →</button>
 }
 </div>
 </div>
 </div>
 <div className="mt-2 text-center">
 <button onClick={onFinish} className="text-[11px] text-white/25 hover:text-white/50 transition">Skip tour</button>
 </div>
 </div>
 </>
 );
}

/* ─── Main Export ─────────────────────────────────────────────────────────── */

export function WelcomeBanner({ userName, role, orgName, orgLogoUrl }: Props) {
 const { orgSlug } = useParams<{ orgSlug: string }>();
 const router = useRouter();

 const [modal, setModal] = useState(false);
 const [touring, setTouring] = useState(false);
 const [currentStep, setCurrentStep] = useState(0);
 const [ready, setReady] = useState(false);

 const steps = getSteps(role || "admin", orgSlug);

 useEffect(() => {
 // Check localStorage first — most reliable dismissal check
 try { if (localStorage.getItem("hriq_tour_dismissed") === "true") { setReady(true); return; } } catch {}

 const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
 sb.auth.getUser().then(({ data }) => {
 const m = data.user?.user_metadata || {};
 const provider = data.user?.app_metadata?.provider;
 const isGoogleUser = provider === "google";
 // Don't show tour if the password change modal is about to show
 const needsPasswordChange = m.isFirstLogin && !m.passwordChanged && !isGoogleUser;
 if ((m.isFirstLogin || m.kycJustApproved) && !m.onboardingDismissed && !needsPasswordChange) {
 setModal(true);
 // Only clear kycJustApproved — isFirstLogin stays true until the tour is dismissed
        sb.auth.updateUser({ data: { kycJustApproved: false } }).catch(() => {});
 }
 setReady(true);
 });
 }, []);

 const dismiss = useCallback(() => {
 setModal(false);
 setTouring(false);
 try { localStorage.setItem("hriq_tour_dismissed", "true"); } catch {}
 const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
 sb.auth.updateUser({ data: { onboardingDismissed: true, isFirstLogin: false } }).catch(() => {});
 }, []);

 const startTour = useCallback(() => { setModal(false); setCurrentStep(0); setTouring(true); }, []);

 const goToStep = useCallback((step: TourStep) => { dismiss(); router.push(step.href); }, [router, dismiss]);

 if (!ready) return null;

 return (
 <>
 {modal && <WelcomeModal userName={userName} orgName={orgName} orgLogoUrl={orgLogoUrl} onStart={startTour} onSkip={dismiss} />}
 {touring && !modal && (
 <SpotlightTour
 steps={steps}
 currentStep={currentStep}
 onNext={() => setCurrentStep((p) => Math.min(p + 1, steps.length - 1))}
 onPrev={() => setCurrentStep((p) => Math.max(p - 1, 0))}
 onGo={goToStep}
 onFinish={dismiss}
 />
 )}
 </>
 );
}
