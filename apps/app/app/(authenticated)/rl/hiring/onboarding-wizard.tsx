"use client";

import { startOnboardingWithConfig } from "@/app/actions/hriq/hiring";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Employee = {
  id: string;
  legalFirstName: string;
  legalLastName: string;
  personalEmail: string | null;
  organizationName: string | null;
  hourlyRate?: string | null;
  currency?: string | null;
  startDate?: string | null;
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
  onClose,
}: {
  employees: Employee[];
  jotformForms: JotForm[];
  jotformStatus: { configured: boolean; connected: boolean; message: string };
  senders: string[];
  zoomSessions: ZoomSession[];
  zoomHosts: string[];
  zoomHostByOrg: Record<string, string>;
  onClose: () => void;
}) {
  const formatPacificDateTime = (value: string): string => {
    const parsed = new Date(value);
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

  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [zoomEnabled, setZoomEnabled] = useState(false);
  const [useExistingZoom, setUseExistingZoom] = useState(false);
  const availableZoomSessions = zoomSessions.filter((s) => !!s.zoomJoinUrl);
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
  const [payRate, setPayRate] = useState(() => {
    const unique = Array.from(new Set(employees.map((e) => e.hourlyRate ?? "").filter(Boolean)));
    return unique.length === 1 ? unique[0] : "";
  });
  const [payCurrency, setPayCurrency] = useState(() => {
    const unique = Array.from(new Set(employees.map((e) => e.currency ?? "USD").filter(Boolean)));
    return unique.length === 1 ? unique[0] : "USD";
  });
  const [startDatePrefill, setStartDatePrefill] = useState(() => {
    const unique = Array.from(new Set(employees.map((e) => e.startDate ?? "").filter(Boolean)));
    return unique.length === 1 ? unique[0] : "";
  });

  const toggleForm = (id: string) => {
    setSelectedForms((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleLaunch = () => {
    setError(null);
    if (zoomEnabled && useExistingZoom && !selectedExistingZoomId) {
      setError("Select an existing Zoom session before launching.");
      return;
    }
    startTransition(async () => {
      try {
        const result = await startOnboardingWithConfig({
          employeeIds: employees.map((e) => e.id),
          existingBatchSessionId:
            useExistingZoom && selectedExistingZoomId ? selectedExistingZoomId : undefined,
          zoomMeetingDate: zoomEnabled && !useExistingZoom && zoomDate ? zoomDate : undefined,
          zoomDuration: zoomEnabled && !useExistingZoom ? zoomDuration : undefined,
          zoomHost: zoomEnabled && !useExistingZoom ? (zoomHost || undefined) : undefined,
          onboardingData: {
            payRate: payRate || undefined,
            currency: payCurrency || undefined,
            startDate: startDatePrefill || undefined,
          },
          formIds: Array.from(selectedForms),
          senderEmail: senderEmail || undefined,
          batchTitle:
            employees.length > 1
              ? `Batch Onboarding — ${new Date().toLocaleDateString()}`
              : undefined,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.refresh();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to launch onboarding");
      }
    });
  };

  const titles = ["Zoom Setup", "Forms & Data", "Review & Launch"];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isPending) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-xl border bg-card shadow-lg">
        {/* Header */}
        <div className="border-b px-6 py-4">
          <h2 className="text-lg font-semibold">
            Start Onboarding
            {employees.length > 1
              ? ` — ${employees.length} Contractors`
              : ` — ${employees[0].legalFirstName} ${employees[0].legalLastName}`}
          </h2>
          <div className="mt-3 flex gap-1">
            {titles.map((title, i) => (
              <button
                key={title}
                type="button"
                onClick={() => setStep(i)}
                className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                  step === i
                    ? "bg-primary text-primary-foreground"
                    : i < step
                      ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {i < step ? "✓ " : ""}
                {title}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5" style={{ minHeight: 220 }}>
          {error && (
            <div className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

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
                    if (!next) setUseExistingZoom(false);
                  }}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <span className="text-sm font-medium">Schedule a Zoom orientation meeting</span>
              </label>

              {zoomEnabled && (
                <div className="ml-7 space-y-3 rounded-lg border p-4">
                  {availableZoomSessions.length > 0 && (
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={useExistingZoom}
                        onChange={() => setUseExistingZoom((prev) => !prev)}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      Use an existing Zoom session
                    </label>
                  )}
                  {useExistingZoom && availableZoomSessions.length > 0 && (
                    <div>
                      <label className="text-sm font-medium">Existing Sessions</label>
                      <select
                        value={selectedExistingZoomId}
                        onChange={(e) => setSelectedExistingZoomId(e.target.value)}
                        className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        {availableZoomSessions.map((session) => (
                          <option key={session.id} value={session.id}>
                            {session.title} —{" "}
                            {session.zoomMeetingDate
                              ? formatPacificDateTime(String(session.zoomMeetingDate))
                              : "No date"}{" "}
                            ({session.zoomDuration}m)
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Contractor(s) will be added to this session and invite email will be sent.
                      </p>
                    </div>
                  )}
                  {!useExistingZoom && (
                    <>
                  <div>
                    <label className="text-sm font-medium">Meeting Date & Time (PT)</label>
                    <input
                      type="datetime-local"
                      value={zoomDate}
                      onChange={(e) => setZoomDate(e.target.value)}
                      className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Duration (minutes)</label>
                    <select
                      value={zoomDuration}
                      onChange={(e) => setZoomDuration(Number(e.target.value))}
                      className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value={30}>30 min</option>
                      <option value={45}>45 min</option>
                      <option value={60}>60 min</option>
                      <option value={90}>90 min</option>
                      <option value={120}>120 min</option>
                    </select>
                  </div>
                  {zoomHosts.length > 0 && (
                    <div>
                      <label className="text-sm font-medium">Host Account</label>
                      <select
                        value={zoomHost}
                        onChange={(e) => setZoomHost(e.target.value)}
                        className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        {hostOptions.map((host) => (
                          <option key={host} value={host}>
                            {host}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    A Zoom meeting will be created and the invite link sent to{" "}
                    {employees.length === 1 ? "the contractor" : `all ${employees.length} contractors`}.
                  </p>
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

              <div className="rounded-lg border p-4 space-y-3">
                <div className="text-sm font-semibold">Onboarding Data Prefill</div>
                <p className="text-xs text-muted-foreground">
                  Set pay/start-date data from the dashboard for this onboarding launch. This is included in onboarding emails and checklist context.
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-1">
                    <label className="text-xs font-medium text-muted-foreground">Pay Rate</label>
                    <input
                      value={payRate}
                      onChange={(e) => setPayRate(e.target.value)}
                      placeholder="e.g. 8.50"
                      className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Currency</label>
                    <select
                      value={payCurrency}
                      onChange={(e) => setPayCurrency(e.target.value)}
                      className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="USD">USD</option>
                      <option value="PHP">PHP</option>
                      <option value="EUR">EUR</option>
                      <option value="GBP">GBP</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Start Date</label>
                    <input
                      type="date"
                      value={startDatePrefill}
                      onChange={(e) => setStartDatePrefill(e.target.value)}
                      className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    />
                  </div>
                </div>
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
                  <span className="text-sm">
                    {zoomEnabled && zoomDate
                      ? `${formatPacificDateTime(zoomDate)} (${zoomDuration}m)`
                      : "Not scheduled"}
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm font-medium">Forms to Send</span>
                  <span className="text-sm">
                    {selectedForms.size > 0
                      ? `${selectedForms.size} form${selectedForms.size !== 1 ? "s" : ""}`
                      : "None"}
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm font-medium">Onboarding Data</span>
                  <span className="text-sm">
                    {payRate || startDatePrefill
                      ? `${payRate ? `${payRate} ${payCurrency}` : "Pay n/a"}${startDatePrefill ? ` • ${startDatePrefill}` : ""}`
                      : "Not set"}
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm font-medium">Welcome Email</span>
                  <span className="text-sm text-green-600">Will be sent</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                You can still manually send forms or Zoom invites later from the onboarding checklist actions.
              </p>

              {senders.length > 1 && (
                <div>
                  <label className="text-sm font-medium">Send from</label>
                  <select
                    value={senderEmail}
                    onChange={(e) => setSenderEmail(e.target.value)}
                    className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {senders.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t px-6 py-4">
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
                onClick={() => setStep(step + 1)}
                className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Continue
              </button>
            ) : (
              <button
                type="button"
                onClick={handleLaunch}
                disabled={isPending}
                className="h-9 rounded-md bg-green-600 px-5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {isPending ? "Launching..." : "Launch Onboarding"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
