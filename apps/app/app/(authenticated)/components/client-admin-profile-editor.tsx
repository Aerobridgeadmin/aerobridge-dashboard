"use client";

import { useState, useRef, useEffect } from "react";
import { useErrorDialog } from "@/app/(authenticated)/components/error-dialog";
import { updateClientAdminProfile } from "@/app/actions/hriq/contractor-self-service";
import { COUNTRY_OPTIONS } from "@/lib/hriq/country-options";
import { SearchableSelect } from "@/app/(authenticated)/components/searchable-select";

type Props = {
  adminName: string | null;
  adminEmail: string | null;
  adminPhone: string | null;
  adminTitle: string | null;
  country: string | null;
  address: string | null;
  orgName: string;
  orgLogoUrl: string | null;
  role: string;
};

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin", admin: "Admin", manager: "Manager", member: "Member",
};

function Field({ label, name, value, type = "text", placeholder, disabled, note }: {
  label: string; name: string; value: string; type?: string;
  placeholder?: string; disabled?: boolean; note?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-xs font-medium text-muted-foreground mb-1.5">
        {label}
        {disabled && <span className="ml-1.5 text-[10px] bg-muted text-muted-foreground rounded px-1 py-0.5">Read-only</span>}
      </label>
      <input
        id={name} name={name} type={type}
        defaultValue={value} placeholder={placeholder}
        disabled={disabled}
        className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm disabled:bg-muted disabled:cursor-not-allowed disabled:opacity-70"
      />
      {note && <p className="mt-1 text-[11px] text-muted-foreground">{note}</p>}
    </div>
  );
}

function Section({ title, description, children, defaultOpen = true }: {
  title: string; description?: string; children?: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-3.5 border-b text-left hover:bg-muted/30 transition-colors"
      >
        <div>
          <p className="font-semibold text-sm">{title}</p>
          {description && <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>}
        </div>
        <svg
          className={`h-4 w-4 text-muted-foreground transition-transform shrink-0 ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open && (
        <div className="p-5 grid gap-4 grid-cols-1 sm:grid-cols-2">{children}</div>
      )}
    </div>
  );
}

export function ClientAdminProfileEditor({
  adminName, adminEmail, adminPhone, adminTitle,
  country, address, orgName, orgLogoUrl, role,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const { showError, showSuccess } = useErrorDialog();

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const handler = () => setDirty(true);
    form.addEventListener("input", handler);
    return () => form.removeEventListener("input", handler);
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    try {
      await updateClientAdminProfile({
        displayName: fd.get("adminName") as string,
        adminPhone: fd.get("adminPhone") as string,
        adminTitle: fd.get("adminTitle") as string,
        country: fd.get("country") as string,
        address: fd.get("address") as string,
      });
      setDirty(false);
      showSuccess("Profile updated.");
    } catch (err) {
      showError({ title: "Error", message: err instanceof Error ? err.message : "Failed to update profile." });
    } finally {
      setSaving(false);
    }
  };

  const initials = (adminName ?? adminEmail ?? "?")
    .split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 pb-20 sm:pb-4 w-full">
      {/* Header card */}
      <div className="rounded-xl border bg-card p-5">
        <div className="flex items-center gap-4">
          {orgLogoUrl ? (
            <img src={orgLogoUrl} alt={orgName} className="h-14 w-14 rounded-full object-cover border-2 border-primary/20" />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-xl font-bold text-primary-foreground shrink-0">
              {initials}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold truncate">{adminName || adminEmail || "—"}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">{adminEmail}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-xs font-medium">
                {ROLE_LABELS[role] ?? role}
              </span>
              <span className="text-xs text-muted-foreground">{orgName}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Contact Info */}
      <Section title="Contact Information" description="Your name and contact details" defaultOpen={true}>
        <Field
          label="Full Name" name="adminName"
          value={adminName ?? ""} placeholder="Your full name"
        />
        <Field
          label="Email" name="adminEmail"
          value={adminEmail ?? ""} disabled
          note="Contact support to change your email address"
        />
        <Field
          label="Phone Number" name="adminPhone"
          value={adminPhone ?? ""} type="tel" placeholder="+1 (555) 123-4567"
        />
        <Field
          label="Job Title" name="adminTitle"
          value={adminTitle ?? ""} placeholder="e.g., Operations Manager"
        />
      </Section>

      {/* Account */}
      <Section title="Account" description="Your login and role information" defaultOpen={false}>
        <Field label="Role" name="role" value={ROLE_LABELS[role] ?? role} disabled />
        <Field label="Organization" name="orgName" value={orgName} disabled />
      </Section>

      {/* Address */}
      <Section title="Address" description="Your business or contact address" defaultOpen={false}>
        <div className="sm:col-span-2">
          <Field label="Street Address" name="address" value={address ?? ""} placeholder="123 Main St" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Country</label>
          <SearchableSelect name="country" value={country ?? ""} onValueChange={() => {}} placeholder="Select country..." triggerClassName="h-10 w-full" options={[...COUNTRY_OPTIONS]} />
        </div>
      </Section>

      {/* Desktop save */}
      <div className="hidden sm:flex justify-end pt-2">
        <button
          type="submit" disabled={saving}
          className="h-10 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>

      {/* Mobile sticky save */}
      <div className={`fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur p-3 sm:hidden transition-transform ${dirty || saving ? "translate-y-0" : "translate-y-full"}`}>
        <button
          type="submit" disabled={saving}
          className="w-full h-12 rounded-xl bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </form>
  );
}
