"use client";
import { useErrorDialog } from "@/app/(authenticated)/components/error-dialog";

import { startOnboardingWithConfig } from "@/app/actions/hriq/hiring";
import { CustomSelect } from "@/app/(authenticated)/components/custom-select";
import { CustomSelectWithOther } from "@/app/(authenticated)/components/custom-select-with-other";
import { JOB_TITLE_OPTIONS, DEPARTMENT_OPTIONS } from "@/lib/hriq/role-department-options";
import { DatePicker, DateTimePicker } from "@/app/(authenticated)/components/date-picker";
import { useEffect, useRef, useState, useTransition } from "react";

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
  department?: string | null;
};

type JotForm = { id: string; title: string; url: string; embeddable?: boolean };
type ZoomSession = {
  id: string;
  title: string;
  zoomJoinUrl: string | null;
  zoomMeetingDate: Date | null;
  zoomDuration: number;
  _count: { onboardingSessions: number };
};

export function OnboardingWizard({
  employees,
  jotformForms,
  jotformStatus,
  senders,
  zoomSessions,
  zoomHosts,
  zoomHostByOrg,
  orgPaymentMethod,
  seatInfo,
  onSuccess,
  onClose,
}: {
  employees: Employee[];
  jotformForms: JotForm[];
  jotformStatus: { configured: boolean; connected: boolean; message: string };
  senders: string[];
  zoomSessions: ZoomSession[];
  zoomHosts: string[];
  zoomHostByOrg: Record<string, string>;
  orgPaymentMethod?: string | null;
  seatInfo?: { vaSeats: number; taken: number } | null;
  onSuccess?: (message: string) => void;
  onClose: () => void;
}) {
  /** Parse a bare datetime string (from DateTimePicker) as Pacific Time  UTC Date */
  const parsePacificBare = (value: string): Date => {
    const bareMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (bareMatch && !/Z$|[+-]\d{2}:\d{2}$/.test(value)) {
      const [, yr, mo, dy, hr, mi] = bareMatch;
      const y = +yr!, m = +mo! - 1, d = +dy!, h = +hr!, mn = +mi!;
      const pstUtc = new Date(Date.UTC(y, m, d, h + 8, mn));
      const checkHour = +new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Los_Angeles", hour: "numeric", hour12: false,
      }).format(pstUtc);
      return checkHour === h ? pstUtc : new Date(Date.UTC(y, m, d, h + 7, mn));
    }
    return new Date(value as any);
  };

  const formatPacificDateTime = (value: string): string => {
    const parsed = parsePacificBare(value);
    if (Number.isNaN(parsed.getTime())) return "Invalid date";
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(parsed);
  };
  const [isPending, startTransition] = useTransition();
  const [step, setStep] = useState(0);
  const { showError } = useErrorDialog();
  const getWarningMessage = (err: unknown, fallback: string) => {
    const raw = err instanceof Error ? err.message : typeof err === "string" && err.length > 0 ? err : fallback;
    const msg = String(raw || fallback).trim();
    if (!msg) return fallback;
    if (
      msg.includes("Server Components render") ||
      msg.includes("digest") ||
      msg.toLowerCase().includes("failed to fetch") ||
      msg.toLowerCase().includes("internal server error")
    ) {
      return "Warning: Something failed in the background. Please retry. If this keeps happening, refresh and try again.";
    }
    return `Warning: ${msg}`;
  };

  const [zoomEnabled, setZoomEnabled] = useState(false);
  const availableZoomSessions = zoomSessions.filter((s) => !!s.zoomJoinUrl);
  const hasExistingZoomSessions = availableZoomSessions.length > 0;
  const [useExistingZoom, setUseExistingZoom] = useState(hasExistingZoomSessions);
  const [selectedExistingZoomId, setSelectedExistingZoomId] = useState<string>(
    availableZoomSessions[0]?.id ?? ""
  );
  const [zoomDate, setZoomDate] = useState("");
  const [zoomDuration, setZoomDuration] = useState(60);
  const preferredZoomHost = (() => {
    const orgNames = Array.from(new Set(employees.map((e) => e.organizationName?.trim().toLowerCase()).filter(Boolean)));
    if (orgNames.length === 1) {
      const mapped = zoomHostByOrg[orgNames[0] as string];
      if (mapped) return mapped;
    }
    return zoomHosts[0] ?? "";
  })();
  const hostOptions = Array.from(new Set([...zoomHosts, preferredZoomHost].filter(Boolean)));
  const [zoomHost, setZoomHost] = useState(preferredZoomHost);
  const [selectedForms, setSelectedForms] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const f of jotformForms) {
      const t = f.title.toLowerCase();
      if (t.includes("contractor") || t.includes("w-8") || t.includes("w-9") || t.includes("w8") || t.includes("w9")) {
        initial.add(f.id);
      }
    }
    return initial;
  });
  const [senderEmail, setSenderEmail] = useState(senders[0] ?? "");
  const [sendWelcomeEmail, setSendWelcomeEmail] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<string>(() => {
    if (orgPaymentMethod === "both") return "both";
    if (orgPaymentMethod === "cor") return "wise";
    if (orgPaymentMethod === "ppp") return "stripe_connect";
    return "none";
  });
  const [compType, setCompType] = useState<"hourly" | "monthly">(() => {
    const unique = Array.from(new Set(employees.map((e) => e.compensationType ?? "").filter(Boolean)));
    if (unique.length === 1 && unique[0] === "monthly") return "monthly";
    // If any employee has monthlySalary but no hourlyRate, default to monthly
    if (employees.some((e) => e.monthlySalary && !e.hourlyRate)) return "monthly";
    return "hourly";
  });
  const [payRate, setPayRate] = useState(() => {
    if (employees.some((e) => e.compensationType === "monthly" || (e.monthlySalary && !e.hourlyRate))) {
      const unique = Array.from(new Set(employees.map((e) => e.monthlySalary ?? "").filter(Boolean)));
      return unique.length === 1 ? unique[0] : "";
    }
    const unique = Array.from(new Set(employees.map((e) => e.hourlyRate ?? "").filter(Boolean)));
    return unique.length === 1 ? unique[0] : "";
  });
  const payRateLocked = compType === "monthly"
    ? employees.every((e) => Boolean(e.monthlySalary))
    : employees.every((e) => Boolean(e.hourlyRate));
  const [jobTitle, setJobTitle] = useState(() => {
    const unique = Array.from(new Set(employees.map((e) => e.jobTitle ?? "").filter(Boolean)));
    return unique.length === 1 ? unique[0] : "";
  });
  const [department, setDepartment] = useState(() => {
    const unique = Array.from(new Set(employees.map((e) => e.department ?? "").filter(Boolean)));
    return unique.length === 1 ? unique[0] : "";
  });
  const [payCurrency, setPayCurrency] = useState(() => {
    const unique = Array.from(new Set(employees.map((e) => e.currency ?? "USD").filter(Boolean)));
    return unique.length === 1 ? unique[0] : "USD";
  });
  const currencyLocked = employees.every((e) => Boolean(e.currency));
  const [startDatePrefill, setStartDatePrefill] = useState(() => {
    const unique = Array.from(new Set(employees.map((e) => e.startDate ?? "").filter(Boolean)));
    return unique.length === 1 ? unique[0] : "";
  });
  const startDateLocked = employees.every((e) => Boolean(e.startDate));
  const uniqueEmails = Array.from(new Set(employees.map((e) => e.personalEmail ?? "").filter(Boolean)));
  const prefillPreview = [
    {
      label: "First name",
      value:
        employees.length === 1
          ? employees[0]?.legalFirstName ?? "-"
          : `${employees.length} values (per contractor)`,
    },
    {
      label: "Last name",
      value:
        employees.length === 1
          ? employees[0]?.legalLastName ?? "-"
          : `${employees.length} values (per contractor)`,
    },
    {
      label: "Email",
      value:
        uniqueEmails.length === 0
          ? "Not set"
          : uniqueEmails.length === 1
            ? uniqueEmails[0]
            : `${uniqueEmails.length} values (per contractor)`,
    },
    {
      label: compType === "monthly" ? "Monthly salary" : "Hourly rate",
      value: payRate ? `${payRate} ${payCurrency}` : "Not set",
    },
    {
      label: "Job title",
      value: jobTitle || "Not set",
    },
    {
      label: "Department",
      value: department || "Not set",
    },
    {
      label: "Start date",
      value: startDatePrefill || "Not set",
    },
  ];

  const toggleForm = (id: string) => {
    setSelectedForms((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Close wizard on Escape key (unless a launch is in progress)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isPending) onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isPending, onClose]);

  const selectedExistingZoomSession = availableZoomSessions.find(
    (session) => session.id === selectedExistingZoomId
  );

  const handleContinue = () => {
    
    if (step === 0 && zoomEnabled) {
      if (useExistingZoom) {
        if (!selectedExistingZoomId) {
          showError("Select an existing Zoom session before continuing.");
          return;
        }
      } else {
        if (!zoomDate) {
          showError("Select a Zoom meeting date and time before continuing.");
          return;
        }
        const parsed = parsePacificBare(zoomDate);
        if (Number.isNaN(parsed.getTime())) {
          showError("Zoom meeting date/time is invalid.");
          return;
        }
        if (parsed.getTime() < Date.now()) {
          showError("Zoom meeting date must be in the future.");
          return;
        }
      }
    }
    // Step 2 (Forms & Data): require pay rate or monthly salary
    if (step === 1 && !payRate.trim()) {
      showError(compType === "monthly" ? "Monthly salary is required before continuing." : "Hourly rate is required before continuing.");
      return;
    }
    setStep(step + 1);
  };

  const handleLaunch = () => {
    
    if (!payRate.trim()) {
      showError(compType === "monthly" ? "Monthly salary is required." : "Hourly rate is required. Set it on the contractor profile before launching.");
      return;
    }
    if (zoomEnabled && useExistingZoom && !selectedExistingZoomId) {
      showError("Select an existing Zoom session before launching.");
      return;
    }
    if (zoomEnabled && !useExistingZoom && !zoomDate) {
      showError("Select a Zoom meeting date and time before launching.");
      return;
    }
    startTransition(async () => {
      try {
        const result = await startOnboardingWithConfig({
          employeeIds: employees.map((e) => e.id),
          existingBatchSessionId:
            zoomEnabled && useExistingZoom && selectedExistingZoomId ? selectedExistingZoomId : undefined,
          zoomMeetingDate: zoomEnabled && !useExistingZoom && zoomDate ? zoomDate : undefined,
          zoomDuration: zoomEnabled && !useExistingZoom ? zoomDuration : undefined,
          zoomHost: zoomEnabled && !useExistingZoom ? (zoomHost || undefined) : undefined,
          onboardingData: {
            payRate: compType === "hourly" ? (payRate || undefined) : undefined,
            monthlySalary: compType === "monthly" ? (payRate || undefined) : undefined,
            compensationType: compType,
            currency: payCurrency || undefined,
            startDate: startDatePrefill || undefined,
            jobTitle: jobTitle || undefined,
            department: department || undefined,
          },
          formIds: Array.from(selectedForms),
          senderEmail: senderEmail || undefined,
          includePaymentSetup: paymentMethod === "stripe_connect" || paymentMethod === "both",
          includeWiseSetup: paymentMethod === "wise" || paymentMethod === "both",
          includeCadanaSetup: paymentMethod === "cadana",
          batchTitle:
            employees.length > 1
              ? "Remote Leverage Onboarding"
              : undefined,
          skipEmail: !sendWelcomeEmail,
        });
        if (!result.ok) {
          showError({ title: "Error", message: getWarningMessage((result as any).error, "Unable to launch onboarding right now.") });
          return;
        }
        const launchedCount = employees.length;
        const formCount = selectedForms.size;
        const zoomSummary = zoomEnabled
          ? useExistingZoom
            ? "existing Zoom session assigned"
            : "new Zoom session scheduled"
          : "Zoom skipped";
        onSuccess?.(
          `Approved: Onboarding launched for ${launchedCount} contractor${launchedCount === 1 ? "" : "s"}. ${formCount} form${formCount === 1 ? "" : "s"} sent, ${zoomSummary}.`
        );
        onClose();
      } catch (err) {
        showError({ title: "Error", message: getWarningMessage(err, "Unable to launch onboarding right now.") });
      }
    });
  };

  const titles = ["Zoom Setup", "Forms & Data", "Review & Launch"];

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4 sm:p-6"
    >
      <div className="mx-auto flex min-h-full w-full max-w-xl items-center">
      <div className="w-full max-h-[90vh] flex flex-col rounded-xl border bg-card shadow-lg" role="dialog" aria-modal="true" aria-label="Start Onboarding Wizard">
        {/* Header */}
        <div className="shrink-0 border-b px-6 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              Start Onboarding
              {employees.length > 1
                ? ` — ${employees.length} Contractors`
                : ` — ${employees[0].legalFirstName} ${employees[0].legalLastName}`}
            </h2>
            {seatInfo && (
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                seatInfo.taken >= seatInfo.vaSeats
                  ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                  : seatInfo.taken >= seatInfo.vaSeats - 1
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                  : "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
              }`}>
                {seatInfo.taken}/{seatInfo.vaSeats} VA seats taken
              </span>
            )}
          </div>
          <div className="mt-3 flex gap-1">
            {titles.map((title, i) => (
              <button
                key={title}
                type="button"
                onClick={() => i <= step && setStep(i)}
                disabled={i > step}
                className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                  step === i
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : i < step
                      ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 cursor-pointer hover:bg-green-200 dark:hover:bg-green-900/60"
                      : "bg-muted text-muted-foreground cursor-not-allowed opacity-60"
                }`}
              >
                {i < step ? "\u2713 " : `${i + 1}. `}
                {title}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5" style={{ minHeight: 220 }}>

          {/* Step 1: Zoom */}
          {step === 0 && (
            <div className="space-y-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={zoomEnabled}
                  onChange={() => {
                    const next = !zoomEnabled;
                    setZoomEnabled(next);
                    if (!next) {
                      setUseExistingZoom(false);
                    } else if (hasExistingZoomSessions) {
                      setUseExistingZoom(true);
                      if (!selectedExistingZoomId) {
                        setSelectedExistingZoomId(availableZoomSessions[0]?.id ?? "");
                      }
                    }
                  }}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <span className="text-sm font-medium">Schedule a Zoom orientation meeting</span>
              </label>

              {zoomEnabled && (
                <div className="ml-7 space-y-3 rounded-lg border p-4">
                  {hasExistingZoomSessions && (
                    <div>
                      <label className="text-sm font-medium">Zoom Session Mode</label>
                      <CustomSelect
                        value={useExistingZoom ? "existing" : "new"}
                        onValueChange={(value) => {
                          const nextUseExisting = value === "existing";
                          setUseExistingZoom(nextUseExisting);
                          if (nextUseExisting && !selectedExistingZoomId) {
                            setSelectedExistingZoomId(availableZoomSessions[0]?.id ?? "");
                          }
                        }}
                        triggerClassName="mt-1 h-9 w-full"
                        options={[
                          { value: "existing", label: "Use existing Zoom session" },
                          { value: "new", label: "Create new Zoom session" },
                        ]}
                      />
                    </div>
                  )}
                  {useExistingZoom && hasExistingZoomSessions && (
                    <div>
                      <label className="text-sm font-medium">Existing Sessions</label>
                      <CustomSelect
                        value={selectedExistingZoomId}
                        onValueChange={setSelectedExistingZoomId}
                        triggerClassName="mt-1 h-9 w-full"
                        options={availableZoomSessions.map((session) => ({
                          value: session.id,
                          label: `${session.title} — ${
                            session.zoomMeetingDate
                              ? formatPacificDateTime(String(session.zoomMeetingDate))
                              : "No date"
                          } (${session.zoomDuration}m)`,
                        }))}
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        Contractor(s) will be added to this session and invite email will be sent.
                      </p>
                    </div>
                  )}
                  {useExistingZoom && !hasExistingZoomSessions && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      No existing Zoom sessions with join links were found. Create a new session below.
                    </p>
                  )}
                  {!useExistingZoom && (
                    <>
                  <div>
                    <label className="text-sm font-medium">Meeting Date & Time (PT)</label>
                    <DateTimePicker
                      value={zoomDate}
                      onChange={(v) => setZoomDate(v)}
                      min={new Date().toISOString().slice(0, 16)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Duration (minutes)</label>
                    <CustomSelect
                      value={String(zoomDuration)}
                      onValueChange={(value) => setZoomDuration(Number(value))}
                      triggerClassName="mt-1 h-9 w-full"
                      options={[
                        { value: "30", label: "30 min" },
                        { value: "45", label: "45 min" },
                        { value: "60", label: "60 min" },
                        { value: "90", label: "90 min" },
                        { value: "120", label: "120 min" },
                      ]}
                    />
                  </div>
                  {zoomHosts.length > 0 && (
                    <div>
                      <label className="text-sm font-medium">Host Account</label>
                      <HostSearchInput
                        value={zoomHost}
                        onChange={setZoomHost}
                        options={hostOptions}
                      />
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    A Zoom meeting will be created and the invite link sent to{" "}
                    {employees.length === 1 ? "the contractor" : `all ${employees.length} contractors`}.
                  </p>
                  {zoomHost && zoomHost !== "me" && (
                    <div className="rounded-lg border border-blue-200 bg-blue-50/50 px-3 py-2 dark:border-blue-800/50 dark:bg-blue-950/20">
                      <p className="text-xs text-blue-700 dark:text-blue-300">
                        <strong>{zoomHost}</strong> will be set as the meeting host and notified via email with the start link and calendar invite.
                      </p>
                    </div>
                  )}
                  {!zoomDate && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      Meeting date/time is required to create a new Zoom session.
                    </p>
                  )}
                    </>
                  )}
                </div>
              )}

              {!zoomEnabled && (
                <p className="ml-7 text-xs text-muted-foreground">
                  You can still send a Zoom invite later from the onboarding tracker.
                </p>
              )}
            </div>
          )}

          {/* Step 2: Forms + Onboarding Data */}
          {step === 1 && (
            <div className="space-y-3">
              {jotformForms.length > 0 ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Select forms to send to{" "}
                    {employees.length === 1
                      ? `${employees[0].legalFirstName}`
                      : `${employees.length} contractors`}
                    . Pre-filled links will be emailed.
                  </p>
                  <div className="space-y-1.5 max-h-52 overflow-y-auto">
                    {jotformForms.map((f) => (
                      <label
                        key={f.id}
                        className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                          selectedForms.has(f.id)
                            ? "border-primary bg-primary/5"
                            : "border-border hover:bg-muted/50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedForms.has(f.id)}
                          onChange={() => toggleForm(f.id)}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                        <span className="text-sm">{f.title}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {selectedForms.size} form{selectedForms.size !== 1 ? "s" : ""} selected
                  </p>
                </>
              ) : (
                <div className="rounded-lg border border-dashed p-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    {jotformStatus.connected
                      ? "No JotForm forms available in this account. Add/publish forms in JotForm first."
                      : `JotForm is not ready: ${jotformStatus.message}`}
                  </p>
                </div>
              )}

              {/* Payment Setup Method */}
              <div className="rounded-lg border p-4 space-y-2">
                <label className="text-sm font-medium">Payment Setup</label>
                <p className="text-xs text-muted-foreground">
                  Choose how contractors will receive payments. Payment setup is completed when the contractor logs in.
                </p>
                <CustomSelect
                  value={paymentMethod}
                  onValueChange={(v) => setPaymentMethod(v)}
                  triggerClassName="mt-1 h-9 w-full text-sm"
                  placeholder="None — skip payment setup"
                  options={[
                    { value: "none", label: "None — skip payment setup" },
                    ...((orgPaymentMethod === "ppp" || orgPaymentMethod === "both") ? [
                      { value: "stripe_connect", label: "Stripe Connect (direct pay)" },
                    ] : []),
                    ...((orgPaymentMethod === "cor" || orgPaymentMethod === "both") ? [
                      { value: "wise", label: "Wise (international payout via RL)" },
                    ] : []),
                    { value: "cadana", label: "Cadana (international payroll via RL)" },
                    ...((orgPaymentMethod === "both") ? [
                      { value: "both", label: "Both — Stripe Connect + Wise" },
                    ] : []),
                  ]}
                />
              </div>

              <div className="rounded-lg border p-4 space-y-3">
                <div className="text-sm font-semibold">Onboarding Data Prefill</div>
                <p className="text-xs text-muted-foreground">
                  {payRateLocked || startDateLocked
                    ? "Pre-filled from the contractor record. Edit the contractor profile to change these values."
                    : "Set pay/start-date data for this onboarding launch. This is included in onboarding emails and checklist context."}
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Job Title</label>
                    <CustomSelectWithOther
                      value={jobTitle}
                      onValueChange={setJobTitle}
                      placeholder="Select role..."
                      triggerClassName="mt-1 h-9 w-full"
                      baseOptions={[...JOB_TITLE_OPTIONS]}
                      category="job_title"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Department</label>
                    <CustomSelectWithOther
                      value={department}
                      onValueChange={setDepartment}
                      placeholder="Select dept..."
                      triggerClassName="mt-1 h-9 w-full"
                      baseOptions={[...DEPARTMENT_OPTIONS]}
                      category="department"
                    />
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Type</label>
                    <div className="mt-1 flex h-9 rounded-md border border-input overflow-hidden">
                      <button type="button" onClick={() => { setCompType("hourly"); setPayRate(""); }} className={`flex-1 text-xs font-medium transition-colors ${compType === "hourly" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent"}`}>Hourly</button>
                      <button type="button" onClick={() => { setCompType("monthly"); setPayRate(""); }} className={`flex-1 text-xs font-medium transition-colors ${compType === "monthly" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent"}`}>Monthly</button>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">{compType === "monthly" ? "Salary" : "Rate"}</label>
                    <input
                      value={payRate}
                      onChange={payRateLocked ? undefined : (e) => setPayRate(e.target.value)}
                      readOnly={payRateLocked}
                      placeholder={compType === "monthly" ? "e.g. 2500" : "e.g. 8.50"}
                      className={`mt-1 flex h-9 w-full rounded-md border border-input px-3 text-sm ${payRateLocked ? "bg-muted text-muted-foreground cursor-not-allowed" : "bg-background"}`}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Currency</label>
                    {currencyLocked ? (
                      <div className="mt-1 flex h-9 w-full items-center rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground cursor-not-allowed">
                        {payCurrency}
                      </div>
                    ) : (
                      <CustomSelect
                        value={payCurrency}
                        onValueChange={setPayCurrency}
                        triggerClassName="mt-1 h-9 w-full"
                        options={[
                          { value: "USD", label: "USD" },
                          { value: "PHP", label: "PHP" },
                          { value: "EUR", label: "EUR" },
                          { value: "GBP", label: "GBP" },
                        ]}
                      />
                    )}
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Start Date</label>
                    <DatePicker
                      value={startDatePrefill}
                      onChange={startDateLocked ? undefined : (v) => setStartDatePrefill(v)}
                      className={`mt-1 ${startDateLocked ? "pointer-events-none opacity-60" : ""}`}
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-dashed p-4">
                <div className="text-sm font-semibold">Data sent to selected forms</div>
                <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                  {prefillPreview.map((row) => (
                    <div key={row.label} className="rounded-md border bg-muted/30 px-3 py-2">
                      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        {row.label}
                      </div>
                      <div className="mt-0.5 text-sm">{row.value}</div>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Phone, address, city, state/province, postal code, and country are also auto-mapped from each contractor profile when those fields exist on the selected form.
                </p>
              </div>
            </div>
          )}

          {/* Step 3: Review */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="rounded-lg border divide-y">
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm font-medium">Contractors</span>
                  <span className="text-sm">{employees.length}</span>
                </div>
                {employees.length <= 5 && (
                  <div className="px-4 py-2">
                    {employees.map((e) => (
                      <div key={e.id} className="flex items-center gap-2 py-1">
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                          {e.legalFirstName[0]}
                          {e.legalLastName[0]}
                        </div>
                        <span className="text-xs">
                          {e.legalFirstName} {e.legalLastName}
                        </span>
                        <span className="text-xs text-muted-foreground">{e.personalEmail}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm font-medium">Zoom Meeting</span>
                  <span className="text-sm text-right max-w-[280px]">
                    {!zoomEnabled
                      ? "Not scheduled"
                      : useExistingZoom && selectedExistingZoomSession
                        ? `Existing: ${selectedExistingZoomSession.title} — ${
                            selectedExistingZoomSession.zoomMeetingDate
                              ? formatPacificDateTime(String(selectedExistingZoomSession.zoomMeetingDate))
                              : "No date"
                          } (${selectedExistingZoomSession.zoomDuration}m)`
                        : zoomDate
                          ? `New: ${formatPacificDateTime(zoomDate)} (${zoomDuration}m)`
                          : "Not scheduled"}
                  </span>
                </div>
                {zoomEnabled && !useExistingZoom && zoomHost && zoomHost !== "me" && (
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm font-medium">Zoom Host</span>
                    <span className="text-sm text-blue-600 dark:text-blue-400">{zoomHost}</span>
                  </div>
                )}
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm font-medium">Forms to Send</span>
                  <span className="text-sm">
                    {selectedForms.size > 0
                      ? `${selectedForms.size} form${selectedForms.size !== 1 ? "s" : ""}`
                      : "None"}
                  </span>
                </div>
                {selectedForms.size > 0 && (
                  <div className="px-4 py-2">
                    <div className="flex flex-wrap gap-1">
                      {jotformForms.filter((f) => selectedForms.has(f.id)).map((f) => (
                        <span key={f.id} className="rounded bg-orange-100 px-2 py-0.5 text-[11px] font-medium text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">
                          {f.title}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm font-medium">Payment Setup</span>
                  <span className={`text-sm ${paymentMethod !== "none" ? "text-violet-600 dark:text-violet-400" : "text-muted-foreground"}`}>
                    {paymentMethod === "stripe_connect" ? "Stripe Connect" : paymentMethod === "wise" ? "Wise" : paymentMethod === "cadana" ? "Cadana" : paymentMethod === "both" ? "Stripe + Wise" : "None"}
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm font-medium">Onboarding Data</span>
                  <span className="text-sm">
                    {payRate || startDatePrefill
                      ? `${payRate ? `${compType === "monthly" ? "Monthly" : "Hourly"}: ${payRate} ${payCurrency}` : "Pay n/a"}${startDatePrefill ? ` \u2022 ${startDatePrefill}` : ""}`
                      : "Not set"}
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm font-medium">Welcome Email</span>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <span className={`text-sm ${sendWelcomeEmail ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                      {sendWelcomeEmail ? "Will be sent" : "Skipped"}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={sendWelcomeEmail}
                      onClick={() => setSendWelcomeEmail(!sendWelcomeEmail)}
                      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${sendWelcomeEmail ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600"}`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${sendWelcomeEmail ? "translate-x-[18px]" : "translate-x-[3px]"}`} />
                    </button>
                  </label>
                </div>
              </div>

              {/* Summary of what will happen */}
              <div className="rounded-lg border border-blue-200 bg-blue-50/50 px-4 py-3 dark:border-blue-800/50 dark:bg-blue-950/20">
                <div className="text-xs font-semibold text-blue-800 dark:text-blue-200 mb-1.5">What happens when you launch:</div>
                <ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1 list-disc pl-4">
                  <li>Onboarding checklist created for {employees.length === 1 ? "contractor" : `each of ${employees.length} contractors`}</li>
                  {zoomEnabled && !useExistingZoom && <li>New Zoom meeting created{zoomHost && zoomHost !== "me" ? ` under ${zoomHost} (host notified via email)` : ""}</li>}
                  {zoomEnabled && useExistingZoom && <li>Contractor(s) added to existing Zoom session</li>}
                  {zoomEnabled && <li>Zoom invite emailed to contractor(s) with calendar attachment</li>}
                  {selectedForms.size > 0 && <li>{selectedForms.size} pre-filled form link{selectedForms.size !== 1 ? "s" : ""} emailed to contractor(s)</li>}
                  {paymentMethod === "stripe_connect" && <li>Stripe Connect payment setup step added to contractor onboarding checklist</li>}
                  {paymentMethod === "wise" && <li>Wise payout setup step added to contractor onboarding checklist</li>}
                  {paymentMethod === "cadana" && <li>Cadana payroll setup step added to contractor onboarding checklist — contractor must complete banking setup before accessing dashboard</li>}
                  {paymentMethod === "both" && <li>Stripe Connect + Wise payout setup steps added to contractor onboarding checklist</li>}
                  {sendWelcomeEmail ? <li>Welcome onboarding email sent with setup instructions</li> : <li className="text-amber-600 dark:text-amber-400">Welcome email will NOT be sent</li>}
                </ul>
              </div>

              <p className="text-xs text-muted-foreground">
                You can still manually send forms or Zoom invites later from the onboarding checklist actions.
              </p>

              {senders.length > 0 && (
                <div>
                  <label className="text-sm font-medium">Send from</label>
                  <CustomSelect
                    value={senderEmail}
                    onValueChange={setSenderEmail}
                    triggerClassName="mt-1 h-9 w-full"
                    options={senders.map((s) => ({ value: s, label: s }))}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t px-6 py-4">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={step === 0 ? onClose : () => setStep(step - 1)}
              disabled={isPending}
              className="h-9 rounded-md border px-4 text-sm hover:bg-accent disabled:opacity-50"
            >
              {step === 0 ? "Cancel" : "Back"}
            </button>
            <div className="flex gap-2">
              {step < 2 ? (
                <button
                  type="button"
                  onClick={handleContinue}
                  className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Continue
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleLaunch}
                  disabled={isPending || !!(seatInfo && seatInfo.taken >= seatInfo.vaSeats)}
                  className="h-9 rounded-md bg-green-600 px-5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isPending ? "Launching..." : `Launch Onboarding (${employees.length})`}
                </button>
              )}
            </div>
          </div>
          {seatInfo && seatInfo.taken >= seatInfo.vaSeats && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400 text-right">
              All {seatInfo.vaSeats} VA seats are taken. The client must purchase additional seats before onboarding more contractors.
            </p>
          )}
        </div>
      </div>
    </div>
      </div>
  );
} 
function HostSearchInput({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = options.filter((o) => o.toLowerCase().includes(query.toLowerCase()));

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const select = (v: string) => {
    setQuery(v);
    onChange(v);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative mt-1">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search host email..."
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-popover shadow-lg animate-in fade-in slide-in-from-top-1 duration-150">
          {filtered.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => select(opt)}
              className={`flex w-full items-center px-3 py-2 text-left text-sm hover:bg-accent ${opt === value ? "bg-accent font-medium" : ""}`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
