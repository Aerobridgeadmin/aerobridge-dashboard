"use client";

import { saveOnboardingStep, completeExternalOnboarding, createOnboardingCheckout, createSplititCheckout, getOnboardingDocumentUrl, checkOnboardingDocumentSigned } from "@/app/actions/hriq/org-onboarding";
import React, { useState, useTransition, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { COUNTRY_OPTIONS } from "@/lib/hriq/country-options";

type Session = {
  id: string; token: string; status: string; currentStep: number; totalSteps: number;
  companyName: string | null; industry: string | null; companySize: string | null;
  website: string | null; country: string | null; address: string | null;
  contactName: string | null; contactEmail: string | null; contactPhone: string | null;
  contactTitle: string | null; billingEmail: string | null; paymentMethod: string | null;
  notes: string | null; preferences: Record<string, unknown> | null;
};

const STEP_LABELS_6 = ["Company", "Contact", "Plan", "Notes", "Agreement", "Review"];
const STEP_LABELS_7 = ["Company", "Contact", "Plan", "Notes", "Agreement", "Review", "Pay"];
const INDUSTRY_OPTIONS = [
  { value: "technology", label: "Technology" }, { value: "healthcare", label: "Healthcare" },
  { value: "finance", label: "Finance" }, { value: "ecommerce", label: "E-Commerce" },
  { value: "real_estate", label: "Real Estate" }, { value: "marketing", label: "Marketing" },
  { value: "consulting", label: "Consulting" }, { value: "education", label: "Education" },
  { value: "legal", label: "Legal" }, { value: "manufacturing", label: "Manufacturing" },
  { value: "nonprofit", label: "Non-Profit" }, { value: "media", label: "Media" },
  { value: "other", label: "Other" },
];
const SIZE_OPTIONS = [
  { value: "1-10", label: "1\u201310" }, { value: "11-50", label: "11\u201350" },
  { value: "51-200", label: "51\u2013200" }, { value: "201-500", label: "201\u2013500" },
  { value: "500+", label: "500+" },
];
const TITLE_OPTIONS = [
  { value: "CEO", label: "CEO" }, { value: "COO", label: "COO" }, { value: "CTO", label: "CTO" },
  { value: "CFO", label: "CFO" }, { value: "VP of Operations", label: "VP of Operations" },
  { value: "HR Director", label: "HR Director" }, { value: "Founder", label: "Founder" },
  { value: "Co-Founder", label: "Co-Founder" }, { value: "Managing Director", label: "Managing Director" },
  { value: "Operations Manager", label: "Ops Manager" }, { value: "Project Manager", label: "PM" },
  { value: "Head of People", label: "Head of People" }, { value: "Other", label: "Other" },
];

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&display=swap');
.ob{font-family:'DM Sans',system-ui,sans-serif}
@keyframes fu{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
@keyframes sl{from{opacity:0;transform:translateX(32px)}to{opacity:1;transform:translateX(0)}}
@keyframes si{from{opacity:0;transform:scale(.93)}to{opacity:1;transform:scale(1)}}
@keyframes cd{from{stroke-dashoffset:24}to{stroke-dashoffset:0}}
@keyframes cf{0%{transform:translateY(-10vh) rotate(0);opacity:1}100%{transform:translateY(100vh) rotate(720deg);opacity:0}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes dropdownIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
.fu{animation:fu .5s cubic-bezier(.22,1,.36,1) both}
.sl{animation:sl .45s cubic-bezier(.22,1,.36,1) both}
.si{animation:si .35s cubic-bezier(.22,1,.36,1) both}
.d1{animation-delay:.06s;opacity:0}.d2{animation-delay:.12s;opacity:0}.d3{animation-delay:.18s;opacity:0}
.d4{animation-delay:.24s;opacity:0}.d5{animation-delay:.3s;opacity:0}.d6{animation-delay:.36s;opacity:0}
.inp{width:100%;height:48px;border-radius:12px;border:1.5px solid #e2e5ea;padding:0 16px;font-size:15px;background:#fff;color:#1a1a2e;outline:none;transition:border .2s,box-shadow .2s;font-family:inherit}
.inp:focus{border-color:#00B0BB;box-shadow:0 0 0 3px rgba(0,176,187,.15)}
.inp::placeholder{color:#a0a4b0}
.sel{width:100%;height:48px;border-radius:12px;border:1.5px solid #e2e5ea;padding:0 16px;font-size:15px;background:#fff;color:#1a1a2e;outline:none;transition:border .2s,box-shadow .2s;display:flex;align-items:center;justify-content:space-between;cursor:pointer;font-family:inherit}
.sel:focus,.sel[data-open="true"]{border-color:#00B0BB;box-shadow:0 0 0 3px rgba(0,176,187,.15)}
.bp{height:52px;border-radius:14px;background:linear-gradient(135deg,#00B0BB,#00DB65);color:#fff;font-weight:600;font-size:15px;border:none;cursor:pointer;transition:transform .15s,box-shadow .15s;width:100%;display:flex;align-items:center;justify-content:center;gap:8px;font-family:inherit}
.bp:hover{transform:translateY(-1px);box-shadow:0 8px 24px rgba(0,176,187,.3)}
.bp:active{transform:translateY(0)}
.bp:disabled{opacity:.55;cursor:not-allowed;transform:none;box-shadow:none}
.bs{height:48px;border-radius:12px;background:#f4f5f7;color:#374151;font-weight:500;font-size:14px;border:none;cursor:pointer;transition:background .15s;display:flex;align-items:center;justify-content:center;gap:6px;font-family:inherit}
.bs:hover{background:#e9eaee}.bs:disabled{opacity:.5;cursor:not-allowed}
`;

export function OrgOnboardForm({ session }: { session: Session }) {
  const prefs = (session.preferences as Record<string, unknown>) ?? {};
  const isPrepaid = prefs.prepaid === true;
  const estimatedVAs = typeof prefs.vaCount === "number" ? Math.max(prefs.vaCount, 1) : 1;
  const isPaymentOnly = prefs.paymentOnly === true;
  const totalSteps = isPrepaid ? 6 : 7;
  const STEP_LABELS = isPrepaid ? STEP_LABELS_6 : STEP_LABELS_7;

  const [isPending, startTransition] = useTransition();
  const [step, setStep] = useState(Math.min(session.currentStep, totalSteps));
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [dir, setDir] = useState<"f"|"b">("f");
  const [payStatus, setPayStatus] = useState<"pending"|"splitit_processing"|"done">("pending");
  // paymentType: "ach" = QuickBooks ACH/Debit (no fee), "cc" = QuickBooks Credit Card (+3%), "finance" = Splitit (total + 10% fee, nothing due today)
  const [paymentType, setPaymentType] = useState<"ach" | "cc" | "finance">("ach");
  const [installments, setInstallments] = useState<3 | 6>(6);
  // Document signing state
  const [docUrl, setDocUrl] = useState<string | null>(null);
  const [docSigned, setDocSigned] = useState(prefs.agreementSigned === true);
  const [docChecking, setDocChecking] = useState(false);
  const [docLoading, setDocLoading] = useState(false);

  // Detect payment return from Stripe
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);

    if ((params.get("payment") === "success" || params.get("financing_paid") === "true") && !isPrepaid) {
      window.history.replaceState({}, "", window.location.pathname);

      if (isPaymentOnly) {
        // paymentOnly: org already exists, just complete + auto-send welcome email
        startTransition(async () => {
          await completeExternalOnboarding(session.token);
          setDone(true);
        });
      } else {
        setStep(7);
        setPayStatus("done");
        if (params.get("financing_paid") === "true") setPaymentType("finance");
      }
    }
  }, [isPrepaid]); // eslint-disable-line react-hooks/exhaustive-deps

  const [companyName, setCompanyName] = useState(session.companyName || "");
  const [industry, setIndustry] = useState(session.industry || "");
  const [companySize, setCompanySize] = useState(session.companySize || "");
  const [website, setWebsite] = useState(session.website || "");
  const [country, setCountry] = useState(session.country || "");
  const [address, setAddress] = useState(session.address || "");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const logoRef = useRef<HTMLInputElement>(null);
  const [contractAgreed, setContractAgreed] = useState(false);
  const [contactName, setContactName] = useState(session.contactName || "");
  const [contactEmail, setContactEmail] = useState(session.contactEmail || "");
  const [contactPhone, setContactPhone] = useState(session.contactPhone || "");
  const [contactTitle, setContactTitle] = useState(session.contactTitle || "");
  const [billingEmail, setBillingEmail] = useState(session.billingEmail || "");
  const initD = session.paymentMethod === "ppp" || session.paymentMethod === "both";
  const initI = session.paymentMethod === "cor" || session.paymentMethod === "both";
  const [payDirect, setPayDirect] = useState(initD || (!initD && !initI));
  const [payIndirect, setPayIndirect] = useState(initI);
  const [notes, setNotes] = useState(session.notes || "");
  const paymentMethod = payDirect && payIndirect ? "both" : payDirect ? "ppp" : payIndirect ? "cor" : "ppp";

  const go = useCallback((t: number, d: "f"|"b") => { setDir(d); setStep(t); setError(""); window.scrollTo({ top: 0, behavior: "smooth" }); }, []);

  const save = (sn: number, data: Record<string, unknown>, t: number) => {
    setError("");
    startTransition(async () => {
      const r = await saveOnboardingStep(session.token, sn, data);
      if ("error" in r) { setError((r as any).error ?? "An error occurred"); return; }
      go(t, "f");
    });
  };

  const next = () => {
    if (step === 1) {
      if (!companyName.trim()) return setError("What\u2019s your company called?");
      if (!industry) return setError("Pick your industry.");
      if (!companySize) return setError("Roughly how big is your team?");
      if (!country) return setError("Which country are you based in?");
      if (!address.trim()) return setError("Business address is required.");
      const prefs: Record<string, unknown> = {};
      if (logoPreview) prefs.logoBase64 = logoPreview;
      save(1, { companyName, industry, companySize, website, country, address, preferences: prefs }, 2);
    } else if (step === 2) {
      if (!contactName.trim()) return setError("We need your name.");
      if (!contactEmail.trim()) return setError("We\u2019ll send login credentials here.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim())) return setError("That doesn\u2019t look like a valid email address.");
      if (!contactPhone.trim()) return setError("A phone number helps us reach you.");
      if (!contactTitle) return setError("What\u2019s your role?");
      save(2, { contactName, contactEmail, contactPhone, contactTitle, billingEmail }, 3);
    } else if (step === 3) {
      if (!payDirect && !payIndirect) return setError("Choose at least one.");
      save(3, { paymentMethod }, 4);
    } else if (step === 4) {
      save(4, { notes, preferences: {} }, 5);
    }
  };

  // Load document URL when entering step 5
  const loadDocUrl = useCallback(() => {
    if (docUrl) return;
    setDocLoading(true);
    startTransition(async () => {
      try {
        const result = await getOnboardingDocumentUrl(session.token);
        if ("url" in result && result.url) {
          setDocUrl(result.url);
        } else {
          // If doc signing not configured, auto-skip to review
          setDocSigned(true);
        }
      } catch {
        setDocSigned(true); // Don't block flow on errors
      } finally {
        setDocLoading(false);
      }
    });
  }, [docUrl, session.token]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (step === 5) loadDocUrl();
  }, [step, loadDocUrl]);

  // Auto-accept service agreement when JotForm document is signed
  useEffect(() => {
    if (docSigned) setContractAgreed(true);
  }, [docSigned]);

  const checkDocSigned = useCallback(() => {
    setDocChecking(true);
    startTransition(async () => {
      try {
        const result = await checkOnboardingDocumentSigned(session.token);
        if (result.signed) {
          setDocSigned(true);
          go(6, "f");
        } else {
          setError("We haven't received your signed agreement yet. Please complete and submit the form, then check again.");
        }
      } catch {
        setError("Failed to verify document. Please try again.");
      } finally {
        setDocChecking(false);
      }
    });
  }, [session.token, go]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = () => {
    if (!contractAgreed) { setError("Please read and accept the Service Agreement to continue."); return; }
    setError("");
    startTransition(async () => {
      const r = await completeExternalOnboarding(session.token);
      if ("error" in r) { setError((r as any).error ?? "An error occurred"); return; }
      setDone(true);
    });
  };

  const handleLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const validTypes = ["image/png", "image/jpeg", "image/jpg", "image/svg+xml", "image/webp", "image/gif", "image/bmp", "image/x-icon", "image/vnd.microsoft.icon"];
    if (!validTypes.includes(f.type) && !f.name.match(/\.(png|jpe?g|svg|webp|gif|bmp|ico)$/i)) {
      setError("Unsupported format. Use PNG, JPG, SVG, WEBP, or GIF."); return;
    }
    if (f.size > 10 * 1024 * 1024) { setError("Logo must be under 10 MB."); return; }
    setLogoFile(f); const r = new FileReader(); r.onload = () => setLogoPreview(r.result as string); r.readAsDataURL(f);
  };

  const ac = dir === "f" ? "sl" : "fu";

  if (done) return (
    <Shell>
      <Confetti />
      <div className="text-center si" style={{ animationDelay: ".1s", opacity: 0 }}>
        <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-green-400 to-emerald-500 shadow-lg" style={{ boxShadow: "0 12px 32px rgba(16,185,129,.25)" }}>
          <svg className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" style={{ strokeDasharray: 24, strokeDashoffset: 0, animation: "cd .6s ease .3s backwards" }} />
          </svg>
        </div>
        <h2 style={{ fontSize: 28, fontWeight: 700, color: "#111" }}>You&apos;re all set!</h2>
        <p style={{ color: "#6b7280", marginTop: 8, maxWidth: 340, marginLeft: "auto", marginRight: "auto", lineHeight: 1.6, fontSize: 15 }}>
          Thanks{companyName ? `, ${companyName}` : ""}! We have everything we need.
        </p>
      </div>
      <div style={{ marginTop: 32 }} className="space-y-3">
        {[
          { n: "1", t: "Setting up your workspace", d: "Dashboard, branding, and tools \u2014 usually within 1 business day." },
          { n: "2", t: "Login credentials incoming", d: "Check your email. First login includes a quick ID check (~2 min)." },
          { n: "3", t: "Start managing your team", d: "Add contractors, review timesheets, approve payroll." },
        ].map((item, i) => (
          <div key={item.n} className={`flex items-start gap-4 rounded-2xl border border-gray-100 bg-white p-4 fu d${i + 3}`}>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600 text-sm font-bold">{item.n}</div>
            <div><div className="font-semibold text-gray-900 text-sm">{item.t}</div><div className="text-gray-500 text-xs mt-0.5">{item.d}</div></div>
          </div>
        ))}
      </div>
      <p className="text-center text-xs text-gray-400 mt-6 fu d6">Questions? Reply to the email you received.</p>
    </Shell>
  );

  return (
    <Shell>
      {/* Progress */}
      <div style={{ marginBottom: 32 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
          {STEP_LABELS.map((l, i) => (
            <button key={l} type="button" onClick={() => i + 1 < step && go(i + 1, "b")} disabled={i + 1 > step}
              style={{ background: "none", border: "none", padding: 0, fontSize: 12, fontWeight: i + 1 === step ? 600 : 500, color: i + 1 === step ? "#00B0BB" : i + 1 < step ? "#111" : "#ccc", cursor: i + 1 < step ? "pointer" : "default", fontFamily: "inherit", transition: "color .2s" }}>
              {l}
            </button>
          ))}
        </div>
        <div style={{ height: 6, borderRadius: 99, background: "#f1f2f4", overflow: "hidden" }}>
          <div style={{ height: "100%", borderRadius: 99, background: "linear-gradient(90deg,#00B0BB,#00DB65)", width: `${(step / totalSteps) * 100}%`, transition: "width .5s cubic-bezier(.22,1,.36,1)" }} />
        </div>
      </div>

      {error && (
        <div className="si" style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 12, borderRadius: 14, background: "#fef2f2", border: "1px solid #fee2e2", padding: "12px 16px" }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: "#fee2e2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg style={{ width: 16, height: 16, color: "#ef4444" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01" /><circle cx="12" cy="12" r="10" /></svg>
          </div>
          <p style={{ fontSize: 14, color: "#b91c1c", fontWeight: 500 }}>{error}</p>
        </div>
      )}

      {/* Step 1 */}
      {step === 1 && (
        <div key="s1" className={ac}>
          <div className="fu" style={{ borderRadius: 20, background: "linear-gradient(135deg,#e6fafb,#f0fdf4,#e6fafb)", border: "1px solid #b2f0e8", padding: 24, marginBottom: 24 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: "#111", marginBottom: 4 }}>Welcome aboard</h2>
            <p style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.6 }}>Let&apos;s set up your organization. Takes about 5 minutes.</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 16 }}>
              {[
                { label: "Time tracking", icon: "clock" },
                { label: "Payroll processing", icon: "dollar" },
                { label: "HR & documents", icon: "doc" },
                { label: "Reporting", icon: "chart" },
              ].map((b, i) => (
                <div key={b.label} className={`fu d${i + 1}`} style={{ display: "flex", alignItems: "center", gap: 8, borderRadius: 12, background: "rgba(255,255,255,.8)", border: "1px solid #f1f2f4", padding: "10px 12px" }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: "#e6fafb", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {b.icon === "clock" && <svg style={{ width: 14, height: 14, color: "#00B0BB" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>}
                    {b.icon === "dollar" && <svg style={{ width: 14, height: 14, color: "#00B0BB" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8V7m0 10v1m9-9a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                    {b.icon === "doc" && <svg style={{ width: 14, height: 14, color: "#00B0BB" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
                    {b.icon === "chart" && <svg style={{ width: 14, height: 14, color: "#00B0BB" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 500, color: "#374151" }}>{b.label}</span>
                </div>
              ))}
            </div>
          </div>
          <Fieldset>
            <div className="fu d2"><Lbl>Company Name</Lbl><input className="inp" value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Acme Corporation" /></div>
            <div className="fu d3">
              <Lbl>Logo <span style={{ color: "#9ca3af", fontWeight: 400 }}>(optional)</span></Lbl>
              <button type="button" onClick={() => logoRef.current?.click()} style={{ width: "100%", borderRadius: 14, border: "2px dashed #e5e7eb", padding: 16, display: "flex", alignItems: "center", gap: 16, background: "none", cursor: "pointer", transition: "border-color .2s", fontFamily: "inherit" }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = "#a5b4fc")} onMouseLeave={e => (e.currentTarget.style.borderColor = "#e5e7eb")}>
                <div style={{ width: 56, height: 56, borderRadius: 14, background: "#f9fafb", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
                  {logoPreview ? <img src={logoPreview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <svg style={{ width: 24, height: 24, color: "#d1d5db" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>}
                </div>
                <div style={{ textAlign: "left" }}><div style={{ fontSize: 14, fontWeight: 500, color: "#374151" }}>{logoFile ? logoFile.name : "Upload your logo"}</div><div style={{ fontSize: 11, color: "#9ca3af" }}>PNG, JPG, SVG, WEBP, GIF &middot; Max 10 MB</div></div>
              </button>
              <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif,.png,.jpg,.jpeg,.svg,.webp,.gif" style={{ display: "none" }} onChange={handleLogo} />
            </div>
            <Row className="fu d4">
              <div><Lbl>Industry</Lbl><Select value={industry} onChange={setIndustry} options={INDUSTRY_OPTIONS} placeholder="Select..." /></div>
              <div><Lbl>Team Size</Lbl><Select value={companySize} onChange={setCompanySize} options={SIZE_OPTIONS} placeholder="Select..." /></div>
            </Row>
            <Row className="fu d5">
              <div><Lbl>Website <O /></Lbl><input className="inp" value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://acme.com" /></div>
              <div><Lbl>Country</Lbl><SearchSelect value={country} onChange={setCountry} options={[...COUNTRY_OPTIONS]} placeholder="Search..." /></div>
            </Row>
            <div className="fu d6"><Lbl>Business Address <span style={{ color: "#ef4444", fontWeight: 600 }}>*</span></Lbl><input className="inp" value={address} onChange={e => setAddress(e.target.value)} placeholder="123 Main St, City, State, ZIP" /></div>
          </Fieldset>
        </div>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <div key="s2" className={ac}>
          <div className="fu" style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: "#111" }}>Who should we work with?</h2>
            <p style={{ fontSize: 14, color: "#6b7280", marginTop: 4 }}>This person becomes the primary admin.</p>
          </div>
          <Fieldset>
            <Row className="fu d1">
              <div><Lbl>Full Name</Lbl><input className="inp" value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Jane Smith" /></div>
              <div><Lbl>Work Email</Lbl><input className="inp" type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="jane@acme.com" /></div>
            </Row>
            <Row className="fu d2">
              <div><Lbl>Phone</Lbl><input className="inp" value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="+1 (555) 123-4567" /></div>
              <div><Lbl>Title</Lbl><Select value={contactTitle} onChange={setContactTitle} options={TITLE_OPTIONS} placeholder="Select..." /></div>
            </Row>
            <div className="fu d3" style={{ borderRadius: 16, background: "#e6fafb", border: "1px solid #b2f0e8", padding: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#1e1b4b", marginBottom: 4 }}>Billing email</div>
              <p style={{ fontSize: 12, color: "#00B0BB", marginBottom: 8 }}>Only if invoices should go to a different address.</p>
              <input className="inp" type="email" value={billingEmail} onChange={e => setBillingEmail(e.target.value)} placeholder="billing@acme.com (optional)" style={{ background: "#fff" }} />
            </div>
          </Fieldset>
        </div>
      )}

      {/* Step 3 */}
      {step === 3 && (
        <div key="s3" className={ac}>
          <div className="fu" style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: "#111" }}>Choose your plan</h2>
            <p style={{ fontSize: 14, color: "#6b7280", marginTop: 4 }}>This determines who is legally responsible for your contractors and how they get paid.</p>
          </div>
          {estimatedVAs > 0 && (
            <div className="fu d1" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderRadius: 12, background: "#f9fafb", border: "1px solid #e5e7eb", padding: "10px 14px", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: "#e6fafb", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg style={{ width: 14, height: 14, color: "#00B0BB" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                </div>
                <span style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}>Pricing for <strong>{estimatedVAs} VA{estimatedVAs !== 1 ? "s" : ""}</strong></span>
              </div>
              <span style={{ fontSize: 12, color: "#9ca3af" }}>Billed annually</span>
            </div>
          )}
          <Fieldset>
            <ProductCard className="fu d1" active={payDirect && !payIndirect} onClick={() => { setPayDirect(true); setPayIndirect(false); }}
              color="#00B0BB" badge="PPP" badgeColor="#e6fafb" badgeText="#007A82"
              title="Performance & Payroll"
              price="$3,000" priceSuffix="/VA/year"
              totalPrice={estimatedVAs > 1 ? `$${(3000 * estimatedVAs).toLocaleString()}/yr total` : undefined}
              headline="Your contractor, your team. We handle the rest."
              bullets={[
                "The contractor works under your company",
                "You pay them directly through Stripe",
                "We track their hours, process payroll, and manage HR paperwork",
                "You keep full control over the working relationship",
              ]}
              flowItems={["You", "arr", "Stripe", "arr", "Contractor"]} flowColor="#00B0BB" />
            <ProductCard className="fu d2" active={payIndirect && !payDirect} onClick={() => { setPayDirect(false); setPayIndirect(true); }}
              color="#059669" badge="COR" badgeColor="#d1fae5" badgeText="#065f46"
              title="Contractor of Record"
              price="$4,200" priceSuffix="/VA/year"
              totalPrice={estimatedVAs > 1 ? `$${(4200 * estimatedVAs).toLocaleString()}/yr total` : undefined}
              headline="We take on the contractor. You just pay us."
              bullets={[
                "The contractor works under Remote Leverage",
                "We handle all legal liability and compliance",
                "You get one simple invoice from us each pay period",
                "We handle all international payments",
              ]}
              flowItems={["You", "arr", "Invoice", "arr", "RL", "arr", "Contractor"]} flowColor="#059669" />
            <label className="fu d3" style={{ display: "flex", alignItems: "center", gap: 10, borderRadius: 14, border: `2px solid ${payDirect && payIndirect ? "#00B0BB" : "#e5e7eb"}`, padding: "14px 16px", cursor: "pointer", transition: "border-color .2s, background .2s", background: payDirect && payIndirect ? "#e6fafb" : "#fff" }}>
              <input type="checkbox" checked={payDirect && payIndirect} onChange={e => { if (e.target.checked) { setPayDirect(true); setPayIndirect(true); } else { setPayDirect(true); setPayIndirect(false); } }} style={{ accentColor: "#00B0BB", width: 18, height: 18 }} />
              <div>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#111" }}>Both plans</span>
                <span style={{ fontSize: 12, color: "#6b7280", marginLeft: 8 }}>Use PPP for some contractors and COR for others</span>
                {payDirect && payIndirect && estimatedVAs > 1 && (
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#00B0BB", marginTop: 2 }}>${(7200 * estimatedVAs).toLocaleString()}/yr total for {estimatedVAs} VAs</div>
                )}
              </div>
            </label>
          </Fieldset>
        </div>
      )}

      {/* Step 4 */}
      {step === 4 && (
        <div key="s4" className={ac}>
          <div className="fu" style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: "#111" }}>Anything else?</h2>
            <p style={{ fontSize: 14, color: "#6b7280", marginTop: 4 }}>Totally optional. Questions, preferences, anything at all.</p>
          </div>
          <div className="fu d1">
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={5} placeholder="e.g. We have 5 contractors in the Philippines and 2 in Colombia..."
              style={{ width: "100%", borderRadius: 14, border: "1.5px solid #e2e5ea", padding: 16, fontSize: 15, resize: "vertical", outline: "none", fontFamily: "inherit", transition: "border .2s, box-shadow .2s", background: "#fff", color: "#1a1a2e" }}
              onFocus={e => { e.currentTarget.style.borderColor = "#00B0BB"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(0,176,187,.15)"; }}
              onBlur={e => { e.currentTarget.style.borderColor = "#e2e5ea"; e.currentTarget.style.boxShadow = "none"; }}
            />
          </div>
        </div>
      )}

      {/* Step 5: Sign Agreement */}
      {step === 5 && (
        <div key="s5" className={ac}>
          <div className="fu" style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: "#111" }}>Sign your agreement</h2>
            <p style={{ fontSize: 14, color: "#6b7280", marginTop: 4 }}>
              Review and sign the service agreement to continue. Your information has been pre-filled.
            </p>
          </div>

          {docLoading && (
            <div className="fu d1" style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
              <Spin />
              <span style={{ marginLeft: 12, fontSize: 14, color: "#6b7280" }}>Preparing your agreement...</span>
            </div>
          )}

          {docSigned && (
            <div className="fu d1" style={{ display: "flex", alignItems: "center", gap: 12, borderRadius: 14, background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "16px 20px" }}>
              <div style={{ width: 32, height: 32, borderRadius: 99, background: "#10b981", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg style={{ width: 16, height: 16, color: "#fff" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#065f46" }}>Agreement signed</div>
                <div style={{ fontSize: 13, color: "#059669" }}>Your signed agreement is on file. Click Continue to proceed.</div>
              </div>
            </div>
          )}

          {!docLoading && !docSigned && docUrl && (
            <Fieldset>
              {/* Info card */}
              <div className="fu d1" style={{ borderRadius: 16, background: "#e6fafb", border: "1px solid #b2f0e8", padding: 16 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: "#00B0BB", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <svg style={{ width: 18, height: 18, color: "#fff" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#1e1b4b" }}>
                      {payDirect && !payIndirect && "Performance & Payroll Services Agreement"}
                      {payIndirect && !payDirect && "Contractor of Record Services Agreement"}
                      {payDirect && payIndirect && "Services Agreement (PPP + COR)"}
                      {!payDirect && !payIndirect && "Services Agreement"}
                    </div>
                    <p style={{ fontSize: 12, color: "#007A82", marginTop: 4, lineHeight: 1.5 }}>
                      This agreement outlines the terms between {companyName || "your company"} and Remote Leverage.
                      Your details have been pre-filled. Please review carefully, then sign and submit.
                    </p>
                  </div>
                </div>
              </div>

              {/* Open form button */}
              <div className="fu d2">
                <a
                  href={docUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                    height: 52, borderRadius: 14, background: "linear-gradient(135deg,#00B0BB,#00DB65)",
                    color: "#fff", fontWeight: 600, fontSize: 15, textDecoration: "none",
                    transition: "transform .15s, box-shadow .15s", fontFamily: "inherit",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,176,187,.3)"; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
                >
                  <svg style={{ width: 18, height: 18 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                  Open Agreement to Review & Sign
                </a>
              </div>

              {/* Steps instructions */}
              <div className="fu d3" style={{ borderRadius: 14, background: "#f9fafb", border: "1px solid #f1f2f4", padding: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 10 }}>How it works</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[
                    { n: "1", t: "Open the agreement", d: "A new tab will open with your pre-filled agreement." },
                    { n: "2", t: "Review and sign", d: "Read through the terms, then draw your signature at the bottom." },
                    { n: "3", t: "Submit the form", d: "Click Submit on the form, then come back here." },
                    { n: "4", t: "Verify and continue", d: "Click the button below to verify your signature and proceed." },
                  ].map((item) => (
                    <div key={item.n} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <div style={{ width: 24, height: 24, borderRadius: 8, background: "#e6fafb", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 12, fontWeight: 700, color: "#00B0BB" }}>{item.n}</div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{item.t}</div>
                        <div style={{ fontSize: 12, color: "#9ca3af" }}>{item.d}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Verify signature button */}
              <div className="fu d4">
                <button type="button"
                  onClick={checkDocSigned}
                  disabled={isPending || docChecking}
                  style={{
                    width: "100%", height: 48, borderRadius: 12,
                    background: "#fff", border: "2px solid #00B0BB", color: "#00B0BB",
                    fontWeight: 600, fontSize: 14, cursor: isPending || docChecking ? "not-allowed" : "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    fontFamily: "inherit", transition: "background .15s, color .15s",
                    opacity: isPending || docChecking ? 0.6 : 1,
                  }}
                  onMouseEnter={e => { if (!isPending && !docChecking) { e.currentTarget.style.background = "#e6fafb"; } }}
                  onMouseLeave={e => { e.currentTarget.style.background = "#fff"; }}
                >
                  {(isPending || docChecking) ? <Spin /> : (
                    <svg style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  )}
                  I&apos;ve signed — verify my agreement
                </button>
              </div>
            </Fieldset>
          )}
        </div>
      )}

      {/* Step 6: Review */}
      {step === 6 && (
        <div key="s6" className={ac}>
          <div className="fu" style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: "#111" }}>{isPrepaid ? "Review & submit" : "Review"}</h2>
            <p style={{ fontSize: 14, color: "#6b7280", marginTop: 4 }}>Make sure everything looks good.</p>
          </div>
          <Fieldset>
            <ReviewCard className="fu d1" title="Company" onEdit={() => go(1, "b")}>
              {logoPreview && <img src={logoPreview} alt="" style={{ width: 40, height: 40, borderRadius: 10, objectFit: "cover", border: "1px solid #e5e7eb", marginBottom: 8 }} />}
              <RR l="Name" v={companyName} /><RR l="Industry" v={INDUSTRY_OPTIONS.find(o => o.value === industry)?.label || industry} />
              <RR l="Size" v={SIZE_OPTIONS.find(o => o.value === companySize)?.label || companySize} />
              {website && <RR l="Website" v={website} />}<RR l="Country" v={country} />{address && <RR l="Address" v={address} />}
            </ReviewCard>
            <ReviewCard className="fu d2" title="Contact" onEdit={() => go(2, "b")}>
              <RR l="Name" v={contactName} /><RR l="Email" v={contactEmail} />
              {contactPhone && <RR l="Phone" v={contactPhone} />}
              {contactTitle && <RR l="Title" v={TITLE_OPTIONS.find(o => o.value === contactTitle)?.label || contactTitle} />}
              {billingEmail && <RR l="Billing" v={billingEmail} />}
            </ReviewCard>
            <ReviewCard className="fu d3" title="Service" onEdit={() => go(3, "b")}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {payDirect && <span style={{ borderRadius: 99, background: "#e6fafb", color: "#007A82", padding: "4px 10px", fontSize: 12, fontWeight: 500 }}>PPP - Performance & Payroll</span>}
                {payIndirect && <span style={{ borderRadius: 99, background: "#d1fae5", color: "#065f46", padding: "4px 10px", fontSize: 12, fontWeight: 500 }}>COR - Contractor of Record</span>}
              </div>
            </ReviewCard>
            {notes && <ReviewCard className="fu d4" title="Notes" onEdit={() => go(4, "b")}><p style={{ fontSize: 14, color: "#4b5563", whiteSpace: "pre-wrap" }}>{notes}</p></ReviewCard>}
            <ReviewCard className="fu d5" title="Agreement" onEdit={() => go(5, "b")}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {docSigned ? (
                  <>
                    <div style={{ width: 20, height: 20, borderRadius: 99, background: "#10b981", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg style={{ width: 12, height: 12, color: "#fff" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 500, color: "#065f46" }}>Agreement signed</span>
                  </>
                ) : (
                  <>
                    <div style={{ width: 20, height: 20, borderRadius: 99, background: "#fbbf24", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg style={{ width: 12, height: 12, color: "#fff" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01" /></svg>
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 500, color: "#92400e" }}>Pending signature</span>
                  </>
                )}
              </div>
            </ReviewCard>
          </Fieldset>

          {/* Contract Agreement — only show if doc was NOT signed in step 5 */}
          {!docSigned && (
          <div className="fu d5" style={{ borderRadius: 16, border: "1.5px solid #e2e5ea", background: "#fff", padding: 16, marginTop: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#111", marginBottom: 8 }}>Service Agreement</div>
            <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.6, marginBottom: 12 }}>
              By proceeding, you agree to Remote Leverage&apos;s{" "}
              <a href="https://remoteleverage.com/terms" target="_blank" rel="noopener noreferrer" style={{ color: "#00B0BB", fontWeight: 500, textDecoration: "underline" }}>Terms of Service</a>
              {" "}and{" "}
              <a href="https://remoteleverage.com/privacy" target="_blank" rel="noopener noreferrer" style={{ color: "#00B0BB", fontWeight: 500, textDecoration: "underline" }}>Privacy Policy</a>.
              Your selected plan includes contractor management, payroll processing, time tracking, HR support, and compliance tools.
            </p>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer" }}>
              <div style={{ position: "relative", flexShrink: 0, marginTop: 2 }}>
                <input
                  type="checkbox"
                  checked={contractAgreed}
                  onChange={e => setContractAgreed(e.target.checked)}
                  style={{ position: "absolute", opacity: 0, width: "100%", height: "100%", cursor: "pointer", margin: 0 }}
                />
                <div style={{
                  width: 20, height: 20, borderRadius: 6,
                  border: `2px solid ${contractAgreed ? "#00B0BB" : "#d1d5db"}`,
                  background: contractAgreed ? "#00B0BB" : "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all .15s",
                }}>
                  {contractAgreed && (
                    <svg style={{ width: 11, height: 11, color: "#fff" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              </div>
              <span style={{ fontSize: 13, color: "#374151", lineHeight: 1.5 }}>
                I agree to the Remote Leverage Service Agreement and authorize the processing of payments as described in my selected plan.
              </span>
            </label>
          </div>
          )}

          <div className="fu d6" style={{ borderRadius: 14, background: "#f9fafb", padding: 12, textAlign: "center", marginTop: 12 }}>
            <p style={{ fontSize: 12, color: "#9ca3af" }}>By submitting, our team begins setting up your workspace. You&apos;ll receive login credentials by email.</p>
          </div>
        </div>
      )}

      {/* Step 7: Payment (only if not prepaid) */}
      {step === 7 && !isPrepaid && (() => {
        const baseTotal = (payDirect && !payIndirect ? 3000 : payIndirect && !payDirect ? 4200 : 7200) * estimatedVAs;
        const ccFee = Math.round(baseTotal * 0.03 * 100) / 100;
        const financingFee = Math.round(baseTotal * 0.10 * 100) / 100;
        const totalForCc = baseTotal + ccFee;
        const totalForFinancing = baseTotal + financingFee;
        // Finance: first installment due today (1/6 for 6mo, 1/3 for 3mo)
        const firstInstallment = Math.round(totalForFinancing / installments * 100) / 100;
        const displayTotal = paymentType === "cc" ? totalForCc : paymentType === "finance" ? firstInstallment : baseTotal;

        return (
          <div key="s7" className={ac}>
            <div className="fu" style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: "#111" }}>Payment</h2>
              <p style={{ fontSize: 14, color: "#6b7280", marginTop: 4 }}>Choose how you'd like to pay to activate your account.</p>
            </div>
            <Fieldset>
              {/* Payment type selector */}
              <div className="fu d1">
                <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 10 }}>How would you like to pay?</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {/* ACH / Debit */}
                  <label style={{ display: "flex", alignItems: "flex-start", gap: 12, borderRadius: 14, border: `2px solid ${paymentType === "ach" ? "#00B0BB" : "#e5e7eb"}`, padding: "14px 16px", cursor: "pointer", background: paymentType === "ach" ? "#e6fafb" : "#fff", transition: "border-color .2s, background .2s" }}>
                    <input type="radio" name="paymentType" value="ach" checked={paymentType === "ach"} onChange={() => setPaymentType("ach")} style={{ marginTop: 2, accentColor: "#00B0BB", width: 16, height: 16, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: "#111" }}>ACH / Debit (Bank Transfer)</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#00B0BB" }}>${baseTotal.toLocaleString()}</span>
                      </div>
                      <p style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>ACH typically takes 3–5 business days.</p>
                    </div>
                  </label>
                  {/* Credit Card */}
                  <label style={{ display: "flex", alignItems: "flex-start", gap: 12, borderRadius: 14, border: `2px solid ${paymentType === "cc" ? "#f59e0b" : "#e5e7eb"}`, padding: "14px 16px", cursor: "pointer", background: paymentType === "cc" ? "#fffbeb" : "#fff", transition: "border-color .2s, background .2s" }}>
                    <input type="radio" name="paymentType" value="cc" checked={paymentType === "cc"} onChange={() => setPaymentType("cc")} style={{ marginTop: 2, accentColor: "#f59e0b", width: 16, height: 16, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: "#111" }}>Credit Card</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#92400e" }}>${totalForCc.toLocaleString()}</span>
                      </div>
                      <p style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>Includes a 3% card processing fee (+${ccFee.toLocaleString()}).</p>
                    </div>
                  </label>
                  {/* Splitit Finance */}
                  <label style={{ display: "flex", alignItems: "flex-start", gap: 12, borderRadius: 14, border: `2px solid ${paymentType === "finance" ? "#7c3aed" : "#e5e7eb"}`, padding: "14px 16px", cursor: "pointer", background: paymentType === "finance" ? "#f5f3ff" : "#fff", transition: "border-color .2s, background .2s" }}>
                    <input type="radio" name="paymentType" value="finance" checked={paymentType === "finance"} onChange={() => setPaymentType("finance")} style={{ marginTop: 2, accentColor: "#7c3aed", width: 16, height: 16, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: "#111" }}>Finance with Splitit</span>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#7c3aed" }}>${totalForFinancing.toLocaleString()}</div>
                          <div style={{ fontSize: 11, color: "#7c3aed" }}>total (incl. 10% fee)</div>
                        </div>
                      </div>
                      <p style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>First installment of ~${Math.round(totalForFinancing / installments).toLocaleString()} due today. Total (${totalForFinancing.toLocaleString()}) split into {installments} payments. Includes a 10% financing fee (+${financingFee.toLocaleString()}).</p>
                      {paymentType === "finance" && (
                        <div style={{ marginTop: 10 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Number of installments</div>
                          <div style={{ display: "flex", gap: 8 }}>
                            {([3, 6] as const).map((n) => (
                              <button key={n} type="button" onClick={() => setInstallments(n as 3 | 6)}
                                style={{ flex: 1, borderRadius: 10, border: `2px solid ${installments === n ? "#7c3aed" : "#e5e7eb"}`, padding: "8px 0", fontSize: 13, fontWeight: 600, background: installments === n ? "#f5f3ff" : "#fff", color: installments === n ? "#7c3aed" : "#374151", cursor: "pointer", fontFamily: "inherit" }}>
                                {n} months
                                <div style={{ fontSize: 11, fontWeight: 400, color: "#9ca3af" }}>~${Math.round(totalForFinancing / n).toLocaleString()}/mo</div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </label>
                </div>
              </div>

              {/* Order summary */}
              <div className="fu d2" style={{ borderRadius: 16, background: "#f9fafb", border: "1px solid #f1f2f4", padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 8 }}>
                  <span style={{ color: "#6b7280" }}>Plan</span>
                  <span style={{ fontWeight: 600, color: "#111" }}>
                    {payDirect && !payIndirect && "PPP - Performance & Payroll"}
                    {payIndirect && !payDirect && "COR - Contractor of Record"}
                    {payDirect && payIndirect && "PPP + COR"}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 8 }}>
                  <span style={{ color: "#6b7280" }}>VAs</span>
                  <span style={{ fontWeight: 600, color: "#111" }}>{estimatedVAs}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 8 }}>
                  <span style={{ color: "#6b7280" }}>Subtotal</span>
                  <span style={{ fontWeight: 600, color: "#111" }}>${baseTotal.toLocaleString()}</span>
                </div>
                {paymentType === "cc" && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 8 }}>
                    <span style={{ color: "#6b7280" }}>Credit card fee (3%)</span>
                    <span style={{ fontWeight: 600, color: "#92400e" }}>+${ccFee.toLocaleString()}</span>
                  </div>
                )}
                {paymentType === "finance" && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 8 }}>
                    <span style={{ color: "#6b7280" }}>Financing fee (10%)</span>
                    <span style={{ fontWeight: 600, color: "#7c3aed" }}>+${financingFee.toLocaleString()}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, paddingTop: 8, borderTop: "1px solid #e5e7eb" }}>
                  <span style={{ fontWeight: 700, color: "#111" }}>Due today</span>
                  <span style={{ fontWeight: 700, color: "#111" }}>${displayTotal.toLocaleString()}</span>
                </div>
                {paymentType === "finance" && (
                  <div style={{ marginTop: 8, borderRadius: 10, background: "#f5f3ff", border: "1px solid #ddd6fe", padding: "8px 12px" }}>
                    <div style={{ fontSize: 12, color: "#7c3aed", fontWeight: 600 }}>
                      1st of {installments} payments -- ${Math.round(totalForFinancing / installments).toLocaleString()}/month via Splitit
                    </div>
                    <div style={{ fontSize: 11, color: "#8b5cf6", marginTop: 4 }}>
                      Total: ${totalForFinancing.toLocaleString()} (incl. 10% fee of ${financingFee.toLocaleString()})
                    </div>
                  </div>
                )}

              </div>

              {/* Pay buttons */}
              {error && (
                <div style={{ marginBottom: 12, borderRadius: 12, background: "#fef2f2", border: "1px solid #fee2e2", padding: "10px 14px" }}>
                  <p style={{ fontSize: 13, color: "#b91c1c", fontWeight: 500, margin: 0 }}>{error}</p>
                </div>
              )}

              {payStatus === "pending" && (
                <div className="fu d3">
                  {(paymentType === "ach" || paymentType === "cc") ? (
                    <button type="button" className="bp" disabled={isPending} onClick={() => {
                      startTransition(async () => {
                        try {
                          const result = await createOnboardingCheckout(session.token, paymentType);
                          if ("error" in result) { setError(result.error || "Payment failed"); return; }
                          window.location.href = result.url;
                        } catch (err) {
                          setError(err instanceof Error ? err.message : "Payment failed");
                        }
                      });
                    }}>
                      {isPending ? <Spin /> : null}
                      {paymentType === "cc" ? "Pay by Credit Card" : "Pay by ACH / Debit"}
                    </button>
                  ) : (
                    <button type="button" style={{ height: 52, borderRadius: 14, background: "linear-gradient(135deg,#7c3aed,#6d28d9)", color: "#fff", fontWeight: 600, fontSize: 15, border: "none", cursor: isPending ? "not-allowed" : "pointer", width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "inherit", opacity: isPending ? 0.6 : 1 }}
                      disabled={isPending}
                      onClick={() => {
                        startTransition(async () => {
                          try {
                            const result = await createSplititCheckout(session.token);
                            if ("error" in result) { setError(result.error || "Splitit setup failed"); return; }
                            window.location.href = result.url;
                          } catch (err) {
                            setError(err instanceof Error ? err.message : "Financing failed");
                          }
                        });
                      }}>
                      {isPending ? <Spin /> : null}
                      Finance with Splitit — 1st Payment Due Today
                    </button>
                  )}
                </div>
              )}


              {payStatus === "done" && (
                <div className="fu d3" style={{ display: "flex", alignItems: "center", gap: 10, borderRadius: 14, background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "14px 16px" }}>
                  <div style={{ width: 28, height: 28, borderRadius: 99, background: "#10b981", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <svg style={{ width: 14, height: 14, color: "#fff" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#065f46" }}>Payment confirmed</div>
                    <div style={{ fontSize: 12, color: "#059669" }}>Click "Complete Onboarding" below to finish.</div>
                  </div>
                </div>
              )}
            </Fieldset>
          </div>
        );
      })()}

      {/* Navigation */}
      <div style={{ marginTop: 32, display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid #f1f2f4", paddingTop: 20 }}>
        {step > 1 ? (
          <button type="button" className="bs" style={{ paddingLeft: 20, paddingRight: 20 }} disabled={isPending} onClick={() => go(step - 1, "b")}>
            <svg style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            Back
          </button>
        ) : <div />}
        {step < 5 ? (
          <button type="button" className="bp" style={{ maxWidth: 200 }} disabled={isPending} onClick={next}>
            {isPending ? <Spin /> : null}
            Continue
            <svg style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
          </button>
        ) : step === 5 && docSigned ? (
          <button type="button" className="bp" style={{ maxWidth: 200 }} disabled={isPending} onClick={() => go(6, "f")}>
            Continue
            <svg style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
          </button>
        ) : step === 5 ? (
          <div />
        ) : step === 6 && !isPrepaid ? (
          <button type="button" className="bp" style={{ maxWidth: 200 }} disabled={isPending} onClick={() => {
            if (!contractAgreed) { setError("Please read and accept the Service Agreement to continue."); return; }
            go(7, "f");
          }}>
            Continue to Payment
            <svg style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
          </button>
        ) : step === 6 && isPrepaid ? (
          <button type="button" className="bp" style={{ maxWidth: 200, background: "linear-gradient(135deg,#00DB65,#00B0BB)" }} disabled={isPending} onClick={submit}>
            {isPending ? <Spin /> : null}
            Submit
          </button>
        ) : step === 7 && payStatus === "done" ? (
          <button type="button" className="bp" style={{ maxWidth: 200, background: "linear-gradient(135deg,#00DB65,#00B0BB)" }} disabled={isPending} onClick={submit}>
            {isPending ? <Spin /> : null}
            Complete Onboarding
          </button>
        ) : (
          <div />
        )}
      </div>
    </Shell>
  );
}

/* ───────────────── Sub-components ───────────────── */

function Aurora() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    let raf = 0;
    const resize = () => { c.width = window.innerWidth; c.height = window.innerHeight; };
    resize(); window.addEventListener("resize", resize);

    // Generate stars once
    const stars = Array.from({ length: 120 }, () => ({
      x: Math.random(), y: Math.random(),
      r: Math.random() * 1.5 + 0.3,
      a: Math.random() * 0.6 + 0.2,
      twinkleSpeed: Math.random() * 0.002 + 0.001,
      twinkleOffset: Math.random() * Math.PI * 2,
    }));

    // Aurora wave parameters — RL brand: orange, purple, teal, green
    const bands = [
      { y: 0.28, amp: 80, freq: 0.0015, speed: 0.0004, h1: 24, h2: 35, alpha: 0.06 },
      { y: 0.35, amp: 100, freq: 0.001, speed: -0.0003, h1: 275, h2: 300, alpha: 0.055 },
      { y: 0.3, amp: 60, freq: 0.002, speed: 0.0005, h1: 175, h2: 185, alpha: 0.05 },
      { y: 0.22, amp: 90, freq: 0.0012, speed: -0.0002, h1: 145, h2: 160, alpha: 0.04 },
    ];

    const draw = (t: number) => {
      ctx.clearRect(0, 0, c.width, c.height);

      // Draw stars
      for (const s of stars) {
        const twinkle = Math.sin(t * s.twinkleSpeed + s.twinkleOffset) * 0.3 + 0.7;
        const alpha = s.a * twinkle;
        ctx.beginPath();
        ctx.arc(s.x * c.width, s.y * c.height, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.fill();
      }

      // Draw aurora bands
      for (const b of bands) {
        const baseY = c.height * b.y;
        ctx.beginPath();
        ctx.moveTo(0, c.height);

        for (let x = 0; x <= c.width; x += 3) {
          const n1 = Math.sin(x * b.freq + t * b.speed) * b.amp;
          const n2 = Math.sin(x * b.freq * 1.8 + t * b.speed * 1.3 + 2) * b.amp * 0.5;
          const n3 = Math.sin(x * b.freq * 0.5 + t * b.speed * 0.7 + 5) * b.amp * 0.3;
          ctx.lineTo(x, baseY + n1 + n2 + n3);
        }

        ctx.lineTo(c.width, c.height);
        ctx.closePath();

        const hue = b.h1 + Math.sin(t * 0.0001) * (b.h2 - b.h1);
        const grad = ctx.createLinearGradient(0, baseY - b.amp, 0, baseY + b.amp * 2);
        grad.addColorStop(0, `hsla(${hue}, 80%, 65%, 0)`);
        grad.addColorStop(0.3, `hsla(${hue}, 80%, 65%, ${b.alpha})`);
        grad.addColorStop(0.6, `hsla(${hue + 20}, 70%, 55%, ${b.alpha * 1.2})`);
        grad.addColorStop(1, `hsla(${hue + 40}, 60%, 50%, 0)`);
        ctx.fillStyle = grad;
        ctx.fill();
      }

      // Soft glow spots — orange + purple + teal
      const spots = [
        { x: 0.2, y: 0.3, r: 300, h: 25, a: 0.035 },
        { x: 0.7, y: 0.25, r: 250, h: 280, a: 0.03 },
        { x: 0.5, y: 0.4, r: 350, h: 175, a: 0.025 },
        { x: 0.85, y: 0.35, r: 200, h: 30, a: 0.02 },
      ];
      for (const s of spots) {
        const sx = c.width * s.x + Math.sin(t * 0.0002) * 50;
        const sy = c.height * s.y + Math.cos(t * 0.00015) * 30;
        const rg = ctx.createRadialGradient(sx, sy, 0, sx, sy, s.r);
        rg.addColorStop(0, `hsla(${s.h + Math.sin(t * 0.0001) * 20}, 70%, 60%, ${s.a})`);
        rg.addColorStop(1, `hsla(${s.h}, 70%, 60%, 0)`);
        ctx.fillStyle = rg;
        ctx.fillRect(sx - s.r, sy - s.r, s.r * 2, s.r * 2);
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);

  return <canvas ref={canvasRef} style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }} />;
}

function Shell({ children }: { children?: React.ReactNode }) {
  return (
    <div className="ob" style={{ minHeight: "100vh", background: "#0a0a1a", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "32px 16px", position: "relative" }}>
      <style>{CSS}</style>
      <Aurora />
      <div style={{ width: "100%", maxWidth: 600, position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 24 }}>
          <img src="/logo.png" alt="Remote Leverage" style={{ height: 36, width: 36, borderRadius: 10, boxShadow: "0 2px 12px rgba(0,176,187,.25)" }} />
          <span style={{ fontSize: 17, fontWeight: 700, color: "rgba(255,255,255,.9)" }}>Remote Leverage</span>
        </div>
        <div style={{ borderRadius: 24, background: "rgba(255,255,255,.92)", backdropFilter: "blur(20px) saturate(1.8)", WebkitBackdropFilter: "blur(20px) saturate(1.8)", boxShadow: "0 8px 40px rgba(0,0,0,.12), 0 1px 3px rgba(0,0,0,.06), inset 0 1px 0 rgba(255,255,255,.5)", border: "1px solid rgba(255,255,255,.4)", padding: "32px 28px" }}>
          {children}
        </div>
        <p style={{ textAlign: "center", fontSize: 11, color: "rgba(255,255,255,.35)", marginTop: 16 }}>Powered by Remote Leverage &middot; Your data is encrypted and secure</p>
      </div>
    </div>
  );
}

function Confetti() {
  const colors = ["#00B0BB", "#00DB65", "#10b981", "#00E5C3", "#00B0BB", "#00DB65"];
  const pieces = React.useMemo(() => Array.from({ length: 40 }).map((_, i) => ({
    left: `${Math.random() * 100}%`,
    w: Math.random() * 8 + 4,
    h: Math.random() * 8 + 4,
    br: Math.random() > 0.5 ? "50%" : "2px",
    bg: colors[i % colors.length],
    dur: Math.random() * 2 + 2,
    delay: Math.random() * .8,
  })), []);
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 999, overflow: "hidden" }}>
      {pieces.map((p, i) => (
        <div key={i} style={{
          position: "absolute", left: p.left, top: -10,
          width: p.w, height: p.h, borderRadius: p.br, background: p.bg,
          animation: `cf ${p.dur}s linear ${p.delay}s forwards`, opacity: 0,
        }} />
      ))}
    </div>
  );
}

function Lbl({ children }: { children?: React.ReactNode }) {
  return <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>{children}</div>;
}
function O() { return <span style={{ color: "#9ca3af", fontWeight: 400 }}>(optional)</span>; }
function Fieldset({ children }: { children?: React.ReactNode }) { return <div style={{ display: "flex", flexDirection: "column", gap: 16, position: "relative" }}>{children}</div>; }
function Row({ children, className }: { children?: React.ReactNode; className?: string }) { return <div className={className} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, overflow: "visible" }}>{children}</div>; }

function Select({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const sel = options.find(o => o.value === value)?.label;
  useEffect(() => {
    const h = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || dropRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  useEffect(() => {
    if (!open) return;
    const h = (e: Event) => {
      // Don't close if scrolling inside the dropdown itself
      if (dropRef.current?.contains(e.target as Node)) return;
      // Recalculate position on page scroll
      if (btnRef.current) {
        const r = btnRef.current.getBoundingClientRect();
        setPos({ top: r.bottom + 4, left: r.left, width: r.width });
      }
    };
    window.addEventListener("scroll", h, true);
    return () => window.removeEventListener("scroll", h, true);
  }, [open]);
  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left, width: r.width });
    }
    setOpen(!open);
  };
  return (
    <div ref={ref}>
      <button ref={btnRef} type="button" className="sel" data-open={open} onClick={toggle} style={{ color: sel ? "#1a1a2e" : "#a0a4b0" }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sel || placeholder}</span>
        <svg style={{ width: 16, height: 16, flexShrink: 0, color: "#9ca3af", transition: "transform .2s", transform: open ? "rotate(180deg)" : "none" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && createPortal(
        <div ref={dropRef} style={{ position: "fixed", zIndex: 99999, top: pos.top, left: pos.left, width: pos.width, borderRadius: 14, border: "1px solid #e5e7eb", background: "#fff", boxShadow: "0 12px 32px rgba(0,0,0,.15)", maxHeight: 240, overflowY: "auto", opacity: 1, animation: "dropdownIn .15s ease-out" }}>
          {options.map(o => (
            <button key={o.value} type="button" onClick={() => { onChange(o.value); setOpen(false); }}
              style={{ width: "100%", textAlign: "left", padding: "10px 16px", fontSize: 14, border: "none", background: o.value === value ? "#e6fafb" : "transparent", color: o.value === value ? "#007A82" : "#374151", fontWeight: o.value === value ? 600 : 400, cursor: "pointer", fontFamily: "inherit", transition: "background .1s" }}
              onMouseEnter={e => { if (o.value !== value) e.currentTarget.style.background = "#f9fafb"; }}
              onMouseLeave={e => { if (o.value !== value) e.currentTarget.style.background = "transparent"; }}>
              {o.value === value && <svg style={{ width: 12, height: 12, marginRight: 6, display: "inline" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}{o.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

function SearchSelect({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const inRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const sel = options.find(o => o.value === value)?.label;
  const filtered = options.filter(o => o.label.toLowerCase().includes(q.toLowerCase()));
  useEffect(() => {
    const h = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || dropRef.current?.contains(t)) return;
      setOpen(false); setQ("");
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  useEffect(() => { if (open && inRef.current) inRef.current.focus(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const h = (e: Event) => {
      if (dropRef.current?.contains(e.target as Node)) return;
      if (btnRef.current) {
        const r = btnRef.current.getBoundingClientRect();
        setPos({ top: r.bottom + 4, left: r.left, width: r.width });
      }
    };
    window.addEventListener("scroll", h, true);
    return () => window.removeEventListener("scroll", h, true);
  }, [open]);
  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left, width: r.width });
    }
    setOpen(!open); setQ("");
  };
  return (
    <div ref={ref}>
      <button ref={btnRef} type="button" className="sel" data-open={open} onClick={toggle} style={{ color: sel ? "#1a1a2e" : "#a0a4b0" }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sel || placeholder}</span>
        <svg style={{ width: 16, height: 16, flexShrink: 0, color: "#9ca3af", transition: "transform .2s", transform: open ? "rotate(180deg)" : "none" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && createPortal(
        <div ref={dropRef} style={{ position: "fixed", zIndex: 99999, top: pos.top, left: pos.left, width: pos.width, borderRadius: 14, border: "1px solid #e5e7eb", background: "#fff", boxShadow: "0 12px 32px rgba(0,0,0,.15)", overflow: "hidden", opacity: 1, animation: "dropdownIn .15s ease-out" }}>
          <div style={{ padding: 8, borderBottom: "1px solid #f1f2f4" }}>
            <input ref={inRef} type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="Type to search..." className="inp" style={{ height: 36, borderRadius: 8, fontSize: 13 }} />
          </div>
          <div style={{ maxHeight: 200, overflowY: "auto" }}>
            {filtered.length === 0 ? <p style={{ padding: 12, fontSize: 13, color: "#9ca3af", textAlign: "center" }}>No results</p> :
              filtered.map(o => (
                <button key={o.value} type="button" onClick={() => { onChange(o.value); setOpen(false); setQ(""); }}
                  style={{ width: "100%", textAlign: "left", padding: "8px 16px", fontSize: 13, border: "none", background: o.value === value ? "#e6fafb" : "transparent", color: o.value === value ? "#007A82" : "#374151", fontWeight: o.value === value ? 600 : 400, cursor: "pointer", fontFamily: "inherit" }}
                  onMouseEnter={e => { if (o.value !== value) e.currentTarget.style.background = "#f9fafb"; }}
                  onMouseLeave={e => { if (o.value !== value) e.currentTarget.style.background = "transparent"; }}>
                  {o.value === value && <svg style={{ width: 10, height: 10, marginRight: 6, display: "inline" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}{o.label}
                </button>
              ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function ProductCard({ active, onClick, color, title, badge, badgeColor, badgeText, price, priceSuffix, totalPrice, headline, bullets, flowItems, flowColor, className }: {
  active: boolean; onClick: () => void; color: string; title: string; badge: string; badgeColor: string; badgeText: string; price: string; priceSuffix: string; totalPrice?: string; headline: string; bullets: string[]; flowItems: string[]; flowColor: string; className?: string;
}) {
  return (
    <div className={className} onClick={onClick} role="button" tabIndex={0} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") onClick(); }}
      style={{ borderRadius: 18, border: `2px solid ${active ? color : "#e5e7eb"}`, padding: 20, cursor: "pointer", transition: "border-color .2s, background .2s, box-shadow .2s", background: active ? `${badgeColor}` : "#fff", boxShadow: active ? `0 0 0 3px ${color}15` : "none" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: active ? color : "#f4f5f7", color: active ? "#fff" : "#6b7280", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, transition: "background .2s, color .2s" }}>{badge[0]}</div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: "#111" }}>{title}</span>
            <span style={{ borderRadius: 99, background: badgeColor, color: badgeText, padding: "2px 8px", fontSize: 10, fontWeight: 600 }}>{badge}</span>
          </div>
        </div>
        {active && (
          <div style={{ width: 24, height: 24, borderRadius: 99, background: color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg style={{ width: 14, height: 14, color: "#fff" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
          </div>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: totalPrice ? 4 : 10 }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: "#111" }}>{price}</span>
        <span style={{ fontSize: 13, color: "#6b7280" }}>{priceSuffix}</span>
      </div>
      {totalPrice && <div style={{ fontSize: 13, fontWeight: 600, color, marginBottom: 10 }}>{totalPrice}</div>}
      <p style={{ fontSize: 14, fontWeight: 600, color: "#374151", lineHeight: 1.5, marginBottom: 12 }}>{headline}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
        {bullets.map(b => (
          <div key={b} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <svg style={{ width: 16, height: 16, flexShrink: 0, marginTop: 1, color: "#10b981" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            <span style={{ fontSize: 13, color: "#4b5563", lineHeight: 1.4 }}>{b}</span>
          </div>
        ))}
      </div>
      <div style={{ borderRadius: 10, background: active ? "rgba(255,255,255,.6)" : "#f9fafb", padding: "10px 12px" }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>How payments work</div>
        <FlowRow items={flowItems} color={flowColor} />
      </div>
    </div>
  );
}

function FlowRow({ items, color }: { items: string[]; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
      {items.map((item, i) => item === "arr" ? (
        <svg key={i} style={{ width: 14, height: 14, color: "#9ca3af" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
      ) : (
        <span key={i} style={{ borderRadius: 8, padding: "4px 10px", fontSize: 12, fontWeight: 500, background: `${color}15`, color }}>{item}</span>
      ))}
    </div>
  );
}

function ReviewCard({ title, onEdit, children, className }: { title: string; onEdit: () => void; children?: React.ReactNode; className?: string }) {
  return (
    <div className={className} style={{ borderRadius: 16, border: "1px solid #e5e7eb", padding: 16, transition: "box-shadow .2s" }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,.04)")}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>{title}</h3>
        <button type="button" onClick={onEdit} style={{ fontSize: 12, color: "#00B0BB", fontWeight: 600, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>Edit</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{children}</div>
    </div>
  );
}

function RR({ l, v }: { l: string; v: string }) {
  if (!v) return null;
  return <div style={{ display: "flex", fontSize: 14 }}><span style={{ width: 80, flexShrink: 0, color: "#9ca3af" }}>{l}</span><span style={{ color: "#374151" }}>{v}</span></div>;
}

function Spin() {
  return <svg style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} viewBox="0 0 24 24" fill="none"><circle style={{ opacity: .25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path style={{ opacity: .75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>;
}