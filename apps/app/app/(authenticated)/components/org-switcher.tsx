"use client";

import {
  switchOrganization,
  clearOrganization,
  getAllOrganizations,
} from "@/app/actions/hriq/switch-org";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState, useTransition, useRef } from "react";
import { useErrorDialog } from "@/app/(authenticated)/components/error-dialog";

type Org = { id: string; name: string; slug: string; logoUrl: string | null };

// Deterministic color based on org name
const ORG_COLORS = [
  "bg-blue-600",
  "bg-emerald-600",
  "bg-orange-500",
  "bg-pink-600",
  "bg-cyan-600",
  "bg-indigo-600",
  "bg-rose-600",
  "bg-teal-600",
  "bg-amber-600",
  "bg-violet-600",
];

function orgColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return ORG_COLORS[Math.abs(hash) % ORG_COLORS.length];
}

type OrgSwitcherProps = {
  currentOrgId: string | null;
  isSuperAdmin: boolean;
  onSwitch?: (orgId: string | null, orgName: string | null) => void;
};

export function OrgSwitcher({ currentOrgId, isSuperAdmin, onSwitch }: OrgSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { showError } = useErrorDialog();
  const [isPending, startTransition] = useTransition();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Re-fetch orgs on mount and when pathname changes (picks up new logos, new orgs)
  useEffect(() => {
    if (isSuperAdmin) {
      getAllOrganizations()
        .then((data) => {
          setOrgs(data.filter((o: any) => o.slug !== "rl"));
          setLoaded(true);
        })
        .catch(() => setLoaded(true));
    }
  }, [isSuperAdmin, pathname]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  if (!isSuperAdmin || (!loaded && orgs.length === 0)) return null;

  // If no client orgs to switch to, just show a static RL badge (no dropdown)
  if (loaded && orgs.length === 0 && !currentOrgId) {
    return (
      <div className="px-2 py-1">
        <div className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-purple-600 overflow-hidden">
            <img src="/logo.png" alt="RL" className="h-full w-full object-cover" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium leading-tight">Remote Leverage</div>
            <div className="truncate text-[11px] leading-tight text-muted-foreground">Platform</div>
          </div>
        </div>
      </div>
    );
  }

  const currentOrg = orgs.find((o) => o.id === currentOrgId);
  const isViewingClient = Boolean(currentOrgId && currentOrg);

  const handleSwitchToOrg = (org: Org) => {
    if (org.id === currentOrgId) {
      setOpen(false);
      return;
    }
    startTransition(async () => {
      try {
        await switchOrganization(org.id);
        setOpen(false);
        onSwitch?.(org.id, org.name);
        router.push(`/${org.slug}`);
        router.refresh();
      } catch (err) {
        showError({ title: "Switch Failed", message: err instanceof Error ? err.message : "Failed to switch organization." });
      }
    });
  };

  const handleSwitchToInternal = () => {
    if (!currentOrgId) {
      setOpen(false);
      return;
    }
    startTransition(async () => {
      try {
        await clearOrganization();
        setOpen(false);
        onSwitch?.(null, null);
        router.push("/rl");
        router.refresh();
      } catch (err) {
        showError({ title: "Switch Failed", message: err instanceof Error ? err.message : "Failed to switch to internal org." });
      }
    });
  };

  return (
    <div className="relative px-2 py-1" ref={dropdownRef}>
      {/* Label */}
      <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Switch Workspace</div>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={isPending}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex w-full items-center gap-2.5 rounded-lg border border-sidebar-border px-3 py-2 text-left text-sm transition-colors hover:bg-sidebar-accent disabled:opacity-50"
      >
        <div
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[11px] font-bold text-white overflow-hidden ${
            isViewingClient ? orgColor(currentOrg!.name) : "bg-purple-600"
          }`}
        >
          {isViewingClient && currentOrg!.logoUrl
            ? <img src={currentOrg!.logoUrl} alt="" className="h-full w-full object-cover" />
            : isViewingClient ? currentOrg!.name.charAt(0).toUpperCase()
            : <img src="/logo.png" alt="RL" className="h-full w-full object-cover" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium leading-tight">
            {isViewingClient ? currentOrg!.name : "Remote Leverage"}
          </div>
          <div className="truncate text-[11px] leading-tight text-muted-foreground">
            {isViewingClient ? "Viewing as admin" : "Platform view"}
          </div>
        </div>
        <svg
          className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform ${open ? "" : "rotate-180"}`}
          fill="none"
          viewBox="0 0 10 6"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path d="M1 1l4 4 4-4" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            role="listbox"
            aria-label="Switch organization"
            className="absolute left-2 right-2 bottom-full z-50 mb-1 max-h-72 overflow-y-auto rounded-lg border border-sidebar-border bg-popover shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-150"
          >
            {/* RL Internal */}
            <div className="p-1">
              <button
                type="button"
                role="option"
                aria-selected={!currentOrgId}
                onClick={handleSwitchToInternal}
                disabled={isPending}
                className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors hover:bg-accent disabled:opacity-50 ${
                  !currentOrgId ? "bg-accent" : ""
                }`}
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-purple-600 overflow-hidden">
                  <img src="/logo.png" alt="RL" className="h-full w-full object-cover" />
                </div>
                <span className="truncate font-medium">Remote Leverage (Internal)</span>
                {!currentOrgId && (
                  <span className="ml-auto flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-primary">
                    <span className="h-2 w-2 rounded-full bg-primary" />
                  </span>
                )}
              </button>
            </div>

            {/* Divider + Section Header */}
            <div className="border-t border-sidebar-border" />
            <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Organizations
            </div>

            {/* Org List */}
            <div className="p-1">
              {orgs.length === 0 && loaded && (
                <div className="px-2.5 py-3 text-center text-xs text-muted-foreground">
                  No organizations found
                </div>
              )}
              {orgs.map((org) => {
                const isActive = currentOrgId === org.id;
                return (
                  <button
                    type="button"
                    key={org.id}
                    role="option"
                    aria-selected={isActive}
                    onClick={() => handleSwitchToOrg(org)}
                    disabled={isPending}
                    className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors hover:bg-accent disabled:opacity-50 ${
                      isActive ? "bg-accent" : ""
                    }`}
                  >
                    <div
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[11px] font-bold text-white overflow-hidden ${orgColor(org.name)}`}
                    >
                      {org.logoUrl
                        ? <img src={org.logoUrl} alt="" className="h-full w-full object-cover" />
                        : org.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="truncate">{org.name}</span>
                    {isActive && (
                      <span className="ml-auto flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-primary">
                        <span className="h-2 w-2 rounded-full bg-primary" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Loading indicator */}
            {isPending && (
              <div className="border-t border-sidebar-border px-3 py-2 text-center text-[11px] text-muted-foreground">
                Switching…
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
