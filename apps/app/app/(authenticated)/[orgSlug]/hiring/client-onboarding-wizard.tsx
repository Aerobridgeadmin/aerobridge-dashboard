"use client";
import { useErrorDialog } from "@/app/(authenticated)/components/error-dialog";

import { startClientOnboarding, saveOnboardingDataPrefill } from "@/app/actions/hriq/hiring";
import { DatePicker } from "@/app/(authenticated)/components/date-picker";
import { CustomSelect } from "@/app/(authenticated)/components/custom-select";
import { CustomSelectWithOther } from "@/app/(authenticated)/components/custom-select-with-other";
import { JOB_TITLE_OPTIONS } from "@/lib/hriq/role-department-options";
import { useState, useTransition, useCallback, useRef } from "react";

type Employee = {
  id: string;
  legalFirstName: string;
  legalLastName: string;
  personalEmail: string | null;
  organizationName: string | null;
  hourlyRate?: string | null;
  monthlySalary?: string | null;
  compensationType?: string | null;
  currency?: string | null;
  startDate?: string | null;
  jobTitle?: string | null;
};

export function ClientOnboardingWizard({
  employees,
  orgName,
  senders,
  paymentMethod: orgPaymentMethod,
  onSuccess,
  onClose,
}: {
  employees: Employee[];
  orgName: string;
  senders: string[];
  paymentMethod?: string | null;
  onSuccess?: (message: string) => void;
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const { showError } = useErrorDialog();

  // Steps: 1 = Data prefill, 2 = Documents, 3 = Launch
  const [step, setStep] = useState(1);
  const [senderEmail, setSenderEmail] = useState(senders[0] ?? "");
  const [skipEmail, setSkipEmail] = useState(false);
  const [includeStripeSetup, setIncludeStripeSetup] = useState(
    orgPaymentMethod === "ppp" || orgPaymentMethod === "both"
  );
  const [includeWiseSetup, setIncludeWiseSetup] = useState(
    orgPaymentMethod === "cor" || orgPaymentMethod === "both"
  );

  // Prefill data
  const [compType, setCompType] = useState<"hourly" | "monthly">(() => {
    if (employees.length === 1) {
      const e = employees[0];
      if (e?.compensationType === "monthly" || (e?.monthlySalary && !e?.hourlyRate)) return "monthly";
    }
    return "hourly";
  });
  const [payRate, setPayRate] = useState(() => {
    if (employees.length !== 1) return "";
    const e = employees[0];
    if (e?.compensationType === "monthly" || (e?.monthlySalary && !e?.hourlyRate)) return e?.monthlySalary ?? "";
    return e?.hourlyRate ?? "";
  });
  const [currency, setCurrency] = useState(employees.length === 1 ? (employees[0]?.currency ?? "USD") : "USD");
  const [startDate, setStartDate] = useState(employees.length === 1 ? (employees[0]?.startDate ?? "") : "");
  const [jobTitle, setJobTitle] = useState(employees.length === 1 ? (employees[0]?.jobTitle ?? "") : "");

  // Document names for signing steps
  const [docNames, setDocNames] = useState<string[]>([]);
  const [newDocName, setNewDocName] = useState("");
  const [bodyText, setBodyText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addDocument = (name: string) => {
    const n = name.trim();
    if (n && !docNames.includes(n)) setDocNames([...docNames, n]);
  };

  const removeDocument = (idx: number) => {
    setDocNames(docNames.filter((_, i) => i !== idx));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files) as File[]) {
      const name = file.name.replace(/\.[^/.]+$/, "");
      addDocument(name);
    }
    e.target.value = "";
  };

  const [dragOver, setDragOver] = useState(false);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files;
    for (const file of Array.from(files) as File[]) {
      const name = file.name.replace(/\.[^/.]+$/, "");
      addDocument(name);
    }
  }, [docNames]);

  const handleSavePrefill = () => {
    startTransition(async () => {
      try {
        await saveOnboardingDataPrefill({
          employeeIds: employees.map((e) => e.id),
          payRate: compType === "hourly" ? (payRate || undefined) : undefined,
          monthlySalary: compType === "monthly" ? (payRate || undefined) : undefined,
          compensationType: compType,
          currency: currency || undefined,
          startDate: startDate || undefined,
        });
        setStep(2);
      } catch (err) {
        showError({ title: "Error", message: "Failed to save prefill data." });
      }
    });
  };

  const handleLaunch = () => {
    startTransition(async () => {
      try {
        const result = await startClientOnboarding({
          employeeIds: employees.map((e) => e.id),
          onboardingData: {
            payRate: compType === "hourly" ? payRate : undefined,
            monthlySalary: compType === "monthly" ? payRate : undefined,
            compensationType: compType,
            currency,
            startDate,
            jobTitle,
          },
          documentNames: docNames.length > 0 ? docNames : undefined,
          bodyText: bodyText.trim() || undefined,
          senderEmail: senderEmail || undefined,
          skipEmail,
          includePaymentSetup: includeStripeSetup,
          includeWiseSetup,
        });
        if ("ok" in result && result.ok) {
          onSuccess?.(result.message);
          onClose();
        } else if ("error" in result) {
          showError({ title: "Onboarding Error", message: result.error ?? "An error occurred" });
        }
      } catch (err) {
        showError({ title: "Error", message: err instanceof Error ? err.message : "Onboarding failed." });
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border bg-card p-6 shadow-xl">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">Contractor Onboarding</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{orgName} · Managed by Remote Leverage</p>
            </div>
            <button onClick={onClose} className="rounded-full p-1.5 hover:bg-muted" aria-label="Close">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          {/* Step indicator */}
          <div className="mt-4 flex items-center gap-2">
            {["Data", "Documents", "Launch"].map((label, idx) => (
              <div key={label} className="flex items-center gap-2">
                <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                  step > idx + 1 ? "bg-green-500 text-white" : step === idx + 1 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}>{step > idx + 1 ? "Done" : idx + 1}</div>
                <span className={`text-xs ${step === idx + 1 ? "font-medium" : "text-muted-foreground"}`}>{label}</span>
                {idx < 2 && <div className="h-px w-8 bg-border" />}
              </div>
            ))}
          </div>
        </div>

        {/* Employees list */}
        <div className="mb-4 rounded-lg border bg-muted/30 p-3">
          <div className="text-xs font-medium text-muted-foreground mb-1">
            {employees.length} contractor{employees.length > 1 ? "s" : ""}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {employees.map((e) => (
              <span key={e.id} className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-0.5 text-xs">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/10 text-[8px] font-bold text-primary">
                  {e.legalFirstName[0]}{e.legalLastName[0]}
                </span>
                {e.legalFirstName} {e.legalLastName}
              </span>
            ))}
          </div>
        </div>

        {/* Step 1: Data Prefill */}
        {step === 1 && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Onboarding Data Prefill</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium">Job Title</label>
                <CustomSelectWithOther value={jobTitle} onValueChange={setJobTitle} placeholder="Select role..." triggerClassName="mt-1 h-9 w-full" baseOptions={[...JOB_TITLE_OPTIONS]} category="job_title" />
              </div>
              <div>
                <label className="text-xs font-medium">Compensation Type</label>
                <div className="mt-1 flex h-9 rounded-md border border-input overflow-hidden">
                  <button type="button" onClick={() => { setCompType("hourly"); setPayRate(""); }} className={`flex-1 text-xs font-medium transition-colors ${compType === "hourly" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent"}`}>Hourly</button>
                  <button type="button" onClick={() => { setCompType("monthly"); setPayRate(""); }} className={`flex-1 text-xs font-medium transition-colors ${compType === "monthly" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent"}`}>Monthly</button>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium">{compType === "monthly" ? "Monthly Salary" : "Hourly Rate"}</label>
                <input value={payRate} onChange={(e) => setPayRate(e.target.value)} placeholder={compType === "monthly" ? "e.g. 2500" : "e.g. 15.00"} className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium">Currency</label>
                <CustomSelect
                  value={currency}
                  onValueChange={setCurrency}
                  triggerClassName="mt-1 h-9 w-full"
                  options={[
                    { value: "USD", label: "USD" }, { value: "EUR", label: "EUR" }, { value: "GBP", label: "GBP" },
                    { value: "PHP", label: "PHP" }, { value: "COP", label: "COP" }, { value: "BRL", label: "BRL" },
                    { value: "CLP", label: "CLP" }, { value: "MXN", label: "MXN" }, { value: "CAD", label: "CAD" },
                    { value: "AUD", label: "AUD" }, { value: "INR", label: "INR" },
                  ]}
                />
              </div>
              <div>
                <label className="text-xs font-medium">Start Date</label>
                <DatePicker name="startDate" value={startDate} onChange={setStartDate} className="mt-1" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="h-9 rounded-md border px-4 text-sm hover:bg-accent">Cancel</button>
              <button type="button" onClick={handleSavePrefill} disabled={isPending} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {isPending ? "Saving..." : "Next: Documents "}
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Documents */}
        {step === 2 && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Documents to Sign</h3>
            <p className="text-xs text-muted-foreground">
              Add the documents that contractors need to sign. You can drag &amp; drop files or type document names manually.
            </p>

            {/* Drag & drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex min-h-[120px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed transition-colors ${
                dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-muted-foreground/50"
              }`}
            >
              <svg className="h-8 w-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-sm text-muted-foreground">Drag &amp; drop files here or <span className="text-primary font-medium">browse</span></p>
              <p className="text-xs text-muted-foreground/60">PDF, DOCX, or any document type</p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.docx,.doc,.txt,.png,.jpg"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>

            {/* Manual add */}
            <div className="flex gap-2">
              <input
                value={newDocName}
                onChange={(e) => setNewDocName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addDocument(newDocName); setNewDocName(""); } }}
                placeholder="Add document name manually"
                className="flex h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm"
              />
              <button
                type="button"
                onClick={() => { addDocument(newDocName); setNewDocName(""); }}
                disabled={!newDocName.trim()}
                className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                Add
              </button>
            </div>

            {/* Document list */}
            {docNames.length > 0 && (
              <div className="space-y-1.5">
                {docNames.map((name, idx) => (
                  <div key={idx} className="flex items-center justify-between rounded-lg border bg-background px-3 py-2">
                    <div className="flex items-center gap-2">
                      <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span className="text-sm">{name}</span>
                    </div>
                    <button onClick={() => removeDocument(idx)} className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-between pt-2">
              <button type="button" onClick={() => setStep(1)} className="h-9 rounded-md border px-4 text-sm hover:bg-accent"> Back</button>
              <button type="button" onClick={() => setStep(3)} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                Next: Launch 
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Launch */}
        {step === 3 && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Review &amp; Launch</h3>

            <div className="rounded-lg border divide-y">
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="text-sm text-muted-foreground">Contractors</span>
                <span className="text-sm font-medium">{employees.length}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="text-sm text-muted-foreground">Documents to sign</span>
                <span className="text-sm font-medium">{docNames.length}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="text-sm text-muted-foreground">Payment setup</span>
                <div className="flex flex-wrap gap-1.5 justify-end">
                  {includeStripeSetup && (
                    <span className="text-xs font-medium text-violet-600 dark:text-violet-400">Stripe Connect</span>
                  )}
                  {includeStripeSetup && includeWiseSetup && <span className="text-xs text-muted-foreground">+</span>}
                  {includeWiseSetup && (
                    <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Wise</span>
                  )}
                  {!includeStripeSetup && !includeWiseSetup && (
                    <span className="text-xs text-muted-foreground">None</span>
                  )}
                </div>
              </div>
              {docNames.length > 0 && (
                <div className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1.5">
                    {docNames.map((name, idx) => (
                      <span key={idx} className="inline-flex items-center rounded-full border bg-muted/30 px-2 py-0.5 text-xs">{name}</span>
                    ))}
                  </div>
                </div>
              )}
              {payRate && (
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-sm text-muted-foreground">{compType === "monthly" ? "Monthly salary" : "Hourly rate"}</span>
                  <span className="text-sm font-medium">{currency} {payRate}{compType === "monthly" ? "/mo" : "/hr"}</span>
                </div>
              )}
              {startDate && (
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-sm text-muted-foreground">Start date</span>
                  <span className="text-sm font-medium">{startDate}</span>
                </div>
              )}
            </div>

            {/* Custom email body text */}
            <div className="rounded-lg border p-4 space-y-2">
              <label className="text-sm font-medium">Custom message for onboarding email</label>
              <p className="text-xs text-muted-foreground">This text will appear in the welcome email sent to contractors, below the greeting and above the document list.</p>
              <textarea
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                placeholder="e.g. Welcome to the team! Please complete all documents within 48 hours. If you have questions, contact your manager at..."
                rows={4}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>

            {/* Payment Setup — locked to org's payment method, choosable when "both" */}
            <div className="rounded-lg border p-4 space-y-3">
              <div className="text-sm font-medium">Payment Setup</div>

              {orgPaymentMethod === "both" ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    Your organization supports both payment methods. Choose which one to set up for these contractors.
                  </p>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="paymentChoice"
                      checked={includeStripeSetup && !includeWiseSetup}
                      onChange={() => { setIncludeStripeSetup(true); setIncludeWiseSetup(false); }}
                      className="mt-0.5 h-4 w-4 accent-violet-600"
                    />
                    <div>
                      <span className="text-sm font-medium">Stripe Connect (direct payments)</span>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Creates a Stripe Express account for each contractor so they can receive direct payouts.
                      </p>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="paymentChoice"
                      checked={includeWiseSetup && !includeStripeSetup}
                      onChange={() => { setIncludeWiseSetup(true); setIncludeStripeSetup(false); }}
                      className="mt-0.5 h-4 w-4 accent-emerald-600"
                    />
                    <div>
                      <span className="text-sm font-medium">Wise (international payouts via RL)</span>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Sets up Wise recipients for each contractor so they can receive international payouts from Remote Leverage.
                      </p>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="paymentChoice"
                      checked={includeStripeSetup && includeWiseSetup}
                      onChange={() => { setIncludeStripeSetup(true); setIncludeWiseSetup(true); }}
                      className="mt-0.5 h-4 w-4 accent-blue-600"
                    />
                    <div>
                      <span className="text-sm font-medium">Both</span>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Set up both Stripe Connect and Wise for these contractors.
                      </p>
                    </div>
                  </label>
                </>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    Payment method is set by your organization's configuration. Contractors will complete the relevant setup when they log in.
                  </p>
                  {includeStripeSetup && (
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-violet-500 text-white">
                        <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                      </div>
                      <div>
                        <span className="text-sm font-medium">Stripe Connect (direct payments)</span>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Creates a Stripe Express account for each contractor so they can receive direct payouts.
                        </p>
                      </div>
                    </div>
                  )}
                  {includeWiseSetup && (
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white">
                        <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                      </div>
                      <div>
                        <span className="text-sm font-medium">Wise (international payouts via RL)</span>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Sets up Wise recipients for each contractor so they can receive international payouts from Remote Leverage.
                        </p>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Email options */}
            <div className="rounded-lg border p-4 space-y-3">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={!skipEmail} onChange={(e) => setSkipEmail(!e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
                <span className="text-sm">Send onboarding email to contractors</span>
              </label>
              {!skipEmail && senders.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Send from</label>
                  <CustomSelect
                    value={senderEmail}
                    onValueChange={setSenderEmail}
                    triggerClassName="mt-1 h-9 w-full"
                    options={senders.map((s) => ({ value: s, label: s }))}
                  />
                </div>
              )}
            </div>

            <div className="flex justify-between pt-2">
              <button type="button" onClick={() => setStep(2)} className="h-9 rounded-md border px-4 text-sm hover:bg-accent"> Back</button>
              <button
                type="button"
                onClick={handleLaunch}
                disabled={isPending}
                className="h-9 rounded-md bg-green-600 px-6 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {isPending ? "Launching..." : `Launch Onboarding (${employees.length})`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
