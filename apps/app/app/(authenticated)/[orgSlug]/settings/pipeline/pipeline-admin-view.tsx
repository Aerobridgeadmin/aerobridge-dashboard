"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useErrorDialog } from "@/app/(authenticated)/components/error-dialog";
import { HiringPipeline } from "../../hiring/hiring-pipeline";
import { ClientHiringPipeline } from "../../hiring/client-hiring-pipeline";
import { getHiringPipelineForOrg } from "@/app/actions/hriq/hiring";
import { getAvailableSenders } from "@/app/actions/hriq/send-email";
import {
  BuildingIcon,
  NetworkIcon,
  ChevronDownIcon,
  UsersIcon,
  RefreshCwIcon,
} from "lucide-react";
import { serialize } from "@/lib/hriq/serialize";

type ClientOrg = {
  id: string;
  name: string;
  slug: string;
  paymentMethod: string | null;
  vaSeats: number | null;
  adminEmail: string | null;
  employeeCount: number;
};

type InternalPipelineProps = {
  entries: any[];
  organizations: { id: string; name: string }[];
  jotformForms: any[];
  jotformStatus: { configured: boolean; connected: boolean; message: string };
  senders: string[];
  zoomSessions: any[];
  batchSessions: any[];
  zoomHosts: string[];
  zoomHostByOrg: Record<string, string>;
  onboardingEmployees: any[];
  offboardingEntries: any[];
  orgPaymentMethods: Record<string, string>;
  orgSeatData: Record<string, { vaSeats: number; taken: number }>;
  rlOrgId: string;
};

function MethodPill({ method }: { method: string | null }) {
  if (!method) return <span className="text-xs text-muted-foreground">—</span>;
  const cfg: Record<string, string> = {
    ppp:  "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
    cor:  "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    both: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${cfg[method] ?? "bg-zinc-100 text-zinc-600"}`}>
      {method}
    </span>
  );
}

export function PipelineAdminView({
  clientOrgs,
  internalPipelineProps,
}: {
  clientOrgs: ClientOrg[];
  internalPipelineProps: InternalPipelineProps;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"internal" | "external">("internal");
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [orgDropdownOpen, setOrgDropdownOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { showError } = useErrorDialog();

  // External org pipeline data
  const [extEntries, setExtEntries] = useState<any[] | null>(null);
  const [extSenders, setExtSenders] = useState<string[]>([]);
  const [extLoading, setExtLoading] = useState(false);

  const selectedOrg = clientOrgs.find((o) => o.id === selectedOrgId);

  const loadExternalOrg = useCallback((orgId: string) => {
    if (!orgId) return;
    setExtLoading(true);
    setExtEntries(null);
    startTransition(async () => {
      try {
        const [entries, senders] = await Promise.all([
          getHiringPipelineForOrg(orgId),
          getAvailableSenders(),
        ]);
        setExtEntries(serialize(entries));
        setExtSenders(senders);
      } catch (err) {
        showError({ title: "Load failed", message: err instanceof Error ? err.message : "Error loading pipeline" });
        setExtEntries([]);
      } finally {
        setExtLoading(false);
      }
    });
  }, [showError]);

  // Auto-load when org selected
  useEffect(() => {
    if (selectedOrgId) loadExternalOrg(selectedOrgId);
    else setExtEntries(null);
  }, [selectedOrgId, loadExternalOrg]);

  const activeCounts = internalPipelineProps.entries.filter((e: any) =>
    ["pre_hire", "onboarding_scheduled", "onboarding_in_progress"].includes(e.employmentStatus)
  ).length;

  const extActiveCounts = selectedOrg
    ? (extEntries ?? []).filter((e: any) =>
        ["pre_hire", "onboarding_scheduled", "onboarding_in_progress"].includes(e.employmentStatus)
      ).length
    : 0;

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div className="flex items-center gap-2 rounded-xl border bg-card p-1 w-fit">
        <button
          onClick={() => setMode("internal")}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            mode === "internal"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <NetworkIcon className="h-4 w-4" />
          Internal Pipeline
          {activeCounts > 0 && (
            <span className={`rounded-full px-1.5 py-0.5 text-xs ${mode === "internal" ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {activeCounts}
            </span>
          )}
        </button>
        <button
          onClick={() => setMode("external")}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            mode === "external"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <BuildingIcon className="h-4 w-4" />
          External Pipeline
        </button>
      </div>

      {/* ── INTERNAL ── */}
      {mode === "internal" && (
        <HiringPipeline
          entries={internalPipelineProps.entries}
          organizations={internalPipelineProps.organizations}
          jotformForms={internalPipelineProps.jotformForms}
          jotformStatus={internalPipelineProps.jotformStatus}
          senders={internalPipelineProps.senders}
          zoomSessions={internalPipelineProps.zoomSessions}
          batchSessions={internalPipelineProps.batchSessions}
          zoomHosts={internalPipelineProps.zoomHosts}
          zoomHostByOrg={internalPipelineProps.zoomHostByOrg}
          onboardingEmployees={internalPipelineProps.onboardingEmployees}
          offboardingEntries={internalPipelineProps.offboardingEntries}
          orgPaymentMethods={internalPipelineProps.orgPaymentMethods}
          orgSeatData={internalPipelineProps.orgSeatData}
          fixedOrgId={internalPipelineProps.rlOrgId}
        />
      )}

      {/* ── EXTERNAL ── */}
      {mode === "external" && (
        <div className="space-y-4">

          {/* Org selector — styled like payments tab accordion headers */}
          <div className="rounded-xl border bg-card">
            <div className="px-5 py-4 border-b">
              <h3 className="text-sm font-semibold">Select Client Organization</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Choose an org to view and manage their hiring pipeline</p>
            </div>

            {/* Dropdown trigger */}
            <div className="p-4">
              <div className="relative">
                <button
                  onClick={() => setOrgDropdownOpen((v: boolean) => !v)}
                  className="flex h-10 w-full items-center justify-between rounded-lg border bg-background px-3 text-sm hover:bg-accent transition-colors"
                >
                  {selectedOrg ? (
                    <div className="flex items-center gap-2">
                      <BuildingIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="font-medium">{selectedOrg.name}</span>
                      <MethodPill method={selectedOrg.paymentMethod} />
                      <span className="text-xs text-muted-foreground">
                        {selectedOrg.employeeCount} contractor{selectedOrg.employeeCount !== 1 ? "s" : ""}
                      </span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">Select an organization…</span>
                  )}
                  <ChevronDownIcon className={`h-4 w-4 text-muted-foreground flex-shrink-0 transition-transform ${orgDropdownOpen ? "rotate-180" : ""}`} />
                </button>

                {orgDropdownOpen && (
                  <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-lg border bg-popover shadow-lg animate-in fade-in slide-in-from-top-1 duration-150">
                    {clientOrgs.length === 0 ? (
                      <div className="px-3 py-6 text-center text-sm text-muted-foreground">No client organizations found</div>
                    ) : (
                      clientOrgs.map((org) => {
                        const active = ["pre_hire", "onboarding_scheduled", "onboarding_in_progress"];
                        const isSelected = org.id === selectedOrgId;
                        return (
                          <button
                            key={org.id}
                            onClick={() => { setSelectedOrgId(org.id); setOrgDropdownOpen(false); }}
                            className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm transition-colors hover:bg-accent ${isSelected ? "bg-accent" : ""}`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <BuildingIcon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                              <span className="font-medium truncate">{org.name}</span>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                              <MethodPill method={org.paymentMethod} />
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <UsersIcon className="h-3 w-3" />
                                {org.employeeCount}
                              </span>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Selected org summary strip */}
            {selectedOrg && (
              <div className="border-t bg-muted/30 px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  {selectedOrg.adminEmail && (
                    <span>Admin: <span className="text-foreground font-medium">{selectedOrg.adminEmail}</span></span>
                  )}
                  {selectedOrg.vaSeats != null && (
                    <span>
                      Seats: <span className="text-foreground font-medium">
                        {extActiveCounts} / {selectedOrg.vaSeats}
                      </span>
                    </span>
                  )}
                </div>
                <button
                  onClick={() => loadExternalOrg(selectedOrgId)}
                  disabled={extLoading}
                  className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50 bg-background"
                >
                  <RefreshCwIcon className={`h-3.5 w-3.5 ${extLoading ? "animate-spin" : ""}`} />
                  Refresh
                </button>
              </div>
            )}
          </div>

          {/* Pipeline for selected org */}
          {!selectedOrgId && (
            <div className="rounded-xl border bg-card px-6 py-16 text-center">
              <BuildingIcon className="mx-auto h-8 w-8 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">Select a client organization above</p>
              <p className="text-xs text-muted-foreground mt-1">to view and manage their hiring pipeline</p>
            </div>
          )}

          {selectedOrgId && extLoading && (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-xl border bg-card" />
              ))}
            </div>
          )}

          {selectedOrgId && !extLoading && extEntries !== null && selectedOrg && (
            <ClientHiringPipeline
              entries={extEntries}
              orgId={selectedOrg.id}
              orgName={selectedOrg.name}
              senders={extSenders}
              paymentMethod={selectedOrg.paymentMethod}
              vaSeats={selectedOrg.vaSeats}
              seatsTaken={extActiveCounts}
              onSuccess={() => loadExternalOrg(selectedOrg.id)}
            />
          )}
        </div>
      )}
    </div>
  );
}
