"use client";

import React from "react";
import { CustomSelect } from "@/app/(authenticated)/components/custom-select";
import { useErrorDialog } from "@/app/(authenticated)/components/error-dialog";
import { DestructiveConfirmDialog } from "@/app/(authenticated)/components/destructive-confirm-dialog";
import { createContact, updateContact, deleteContact } from "@/app/actions/hriq/contacts";
import { useParams, useRouter } from "next/navigation";
import { useState, useTransition} from "react";

type ContactData = {
  id: string;
  organizationId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  role: string | null;
  notes: string | null;
  isActive: boolean;
  organization: { id: string; name: string; slug: string };
};

type OrgOption = { id: string; name: string; slug: string };

const ROLE_OPTIONS = [
  { value: "primary", label: "Primary Contact" },
  { value: "billing", label: "Billing" },
  { value: "technical", label: "Technical" },
  { value: "hr", label: "HR / People" },
  { value: "other", label: "Other" },
];

const ROLE_COLORS: Record<string, string> = {
  primary: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  billing: "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  technical: "bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  hr: "bg-pink-50 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
  other: "bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

function getWarningMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  return fallback;
}

export function ContactsPanel({
  contacts: initialContacts,
  organizations,
}: {
  contacts: ContactData[];
  organizations: OrgOption[];
}) {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { showError } = useErrorDialog();
  const [search, setSearch] = useState("");
  const [filterOrg, setFilterOrg] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingContact, setEditingContact] = useState<ContactData | null>(null);
  const [selectedContact, setSelectedContact] = useState<ContactData | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ContactData | null>(null);

  // Form state
  const emptyForm = { fullName: "", email: "", phone: "", jobTitle: "", role: "primary", notes: "", organizationId: "" };
  const [form, setForm] = useState(emptyForm);

  const filtered = initialContacts.filter((c) => {
    if (filterOrg && c.organizationId !== filterOrg) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        c.fullName.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.organization.name.toLowerCase().includes(q) ||
        c.jobTitle?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Group by org
  const grouped: { org: OrgOption; contacts: ContactData[] }[] = [];
  const orgMap = new Map<string, ContactData[]>();
  for (const c of filtered) {
    const arr = orgMap.get(c.organizationId) ?? [];
    arr.push(c);
    orgMap.set(c.organizationId, arr);
  }
  for (const [orgId, cts] of orgMap) {
    grouped.push({ org: cts[0]!.organization, contacts: cts });
  }
  grouped.sort((a, b) => a.org.name.localeCompare(b.org.name));

  function openCreate() {
    setEditingContact(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(contact: ContactData) {
    setEditingContact(contact);
    setForm({
      fullName: contact.fullName,
      email: contact.email ?? "",
      phone: contact.phone ?? "",
      jobTitle: contact.jobTitle ?? "",
      role: contact.role ?? "primary",
      notes: contact.notes ?? "",
      organizationId: contact.organizationId,
    });
    setShowForm(true);
  }

  function handleSubmit() {
    if (!form.fullName.trim()) {
      showError({ title: "Missing Name", message: "Contact name is required." });
      return;
    }

    startTransition(async () => {
      try {
        if (editingContact) {
          await updateContact(editingContact.id, {
            fullName: form.fullName,
            email: form.email || undefined,
            phone: form.phone || undefined,
            jobTitle: form.jobTitle || undefined,
            role: form.role,
            notes: form.notes || undefined,
          });
        } else {
          if (!form.organizationId) {
            showError({ title: "Missing Org", message: "Select an organization." });
            return;
          }
          await createContact({
            organizationId: form.organizationId,
            fullName: form.fullName,
            email: form.email || undefined,
            phone: form.phone || undefined,
            jobTitle: form.jobTitle || undefined,
            role: form.role,
            notes: form.notes || undefined,
          });
        }
        setShowForm(false);
        setForm(emptyForm);
        setEditingContact(null);
        router.refresh();
      } catch (err) {
        showError({ title: "Error", message: getWarningMessage(err, "Failed to save contact.") });
      }
    });
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  function handleDelete(contact: ContactData) {
    setDeleteTarget(contact);
  }

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Search contacts..."
            value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setSearch(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <CustomSelect
          value={filterOrg}
          onValueChange={setFilterOrg}
          triggerClassName="h-9 min-w-[170px]"
          placeholder="All Organizations"
          options={[
            { value: "", label: "All Organizations" },
            ...organizations.map((o) => ({ value: o.id, label: o.name })),
          ]}
        />
        <button
          onClick={openCreate}
          disabled={isPending}
          className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          + Add Contact
        </button>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>{filtered.length} contact{filtered.length !== 1 ? "s" : ""}</span>
        <span>{grouped.length} organization{grouped.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Contact cards grouped by org */}
      {grouped.length === 0 && (
        <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">
          {search || filterOrg ? "No contacts match your filters." : "No contacts yet. Add your first contact above."}
        </div>
      )}

      {grouped.map(({ org, contacts }) => (
        <div key={org.id} className="rounded-xl border bg-card overflow-hidden">
          <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2.5">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
              {org.name.charAt(0).toUpperCase()}
            </span>
            <span className="text-sm font-semibold">{org.name}</span>
            <span className="text-xs text-muted-foreground">({contacts.length})</span>
          </div>
          <div className="divide-y">
            {contacts.map((c) => (
              <div
                key={c.id}
                onClick={() => setSelectedContact(c)}
                className="flex items-center gap-4 px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {c.fullName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{c.fullName}</span>
                    {c.role && (
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${ROLE_COLORS[c.role] ?? ROLE_COLORS.other}`}>
                        {ROLE_OPTIONS.find((r) => r.value === c.role)?.label ?? c.role}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                    {c.jobTitle && <span>{c.jobTitle}</span>}
                    {c.email && <span className="truncate">{c.email}</span>}
                    {c.phone && <span>{c.phone}</span>}
                  </div>
                </div>
                <svg className="h-4 w-4 text-muted-foreground/40 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Contact Detail Drawer */}
      {selectedContact && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelectedContact(null)}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />
          <div
            className="relative flex h-full w-full max-w-sm flex-col bg-card shadow-2xl border-l"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-base font-bold text-primary">
                  {selectedContact.fullName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="font-semibold text-sm leading-tight">{selectedContact.fullName}</div>
                  {selectedContact.role && (
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium mt-0.5 ${ROLE_COLORS[selectedContact.role] ?? ROLE_COLORS.other}`}>
                      {ROLE_OPTIONS.find((r) => r.value === selectedContact.role)?.label ?? selectedContact.role}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setSelectedContact(null)}
                className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-muted text-muted-foreground"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Contact info */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                {selectedContact.jobTitle && (
                  <div className="flex items-start gap-3">
                    <svg className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <span className="text-sm">{selectedContact.jobTitle}</span>
                  </div>
                )}
                {selectedContact.email && (
                  <div className="flex items-center gap-3">
                    <svg className="h-4 w-4 shrink-0 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <span className="text-sm truncate">{selectedContact.email}</span>
                  </div>
                )}
                {selectedContact.phone && (
                  <div className="flex items-center gap-3">
                    <svg className="h-4 w-4 shrink-0 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    <span className="text-sm">{selectedContact.phone}</span>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <svg className="h-4 w-4 shrink-0 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  <span className="text-sm">{selectedContact.organization.name}</span>
                </div>
              </div>

              {selectedContact.notes && (
                <div className="rounded-lg border bg-muted/30 p-4">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm">{selectedContact.notes}</p>
                </div>
              )}

              {/* Quick actions */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Quick Actions</p>
                <div className="grid grid-cols-2 gap-2">
                  {selectedContact.email && (
                    <a
                      href={`mailto:${selectedContact.email}`}
                      className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2.5 text-sm hover:bg-muted transition-colors"
                    >
                      <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      Send Email
                    </a>
                  )}
                  {selectedContact.phone && (
                    <a
                      href={`tel:${selectedContact.phone}`}
                      className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2.5 text-sm hover:bg-muted transition-colors"
                    >
                      <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      Call
                    </a>
                  )}
                  {selectedContact.email && (
                    <button
                      onClick={() => copyToClipboard(selectedContact.email!, "email")}
                      className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2.5 text-sm hover:bg-muted transition-colors"
                    >
                      <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      {copied === "email" ? "Copied!" : "Copy Email"}
                    </button>
                  )}
                  {selectedContact.phone && (
                    <button
                      onClick={() => copyToClipboard(selectedContact.phone!, "phone")}
                      className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2.5 text-sm hover:bg-muted transition-colors"
                    >
                      <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      {copied === "phone" ? "Copied!" : "Copy Phone"}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Footer actions */}
            <div className="border-t px-5 py-4 flex items-center gap-2">
              <button
                onClick={() => { setSelectedContact(null); openEdit(selectedContact); }}
                disabled={isPending}
                className="flex-1 h-9 rounded-md border px-4 text-sm font-medium hover:bg-muted disabled:opacity-50 transition-colors"
              >
                Edit Contact
              </button>
              <button
                onClick={() => { handleDelete(selectedContact); setSelectedContact(null); }}
                disabled={isPending}
                className="h-9 rounded-md border border-red-200 px-4 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/30 disabled:opacity-50 transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-200" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
            <h3 className="text-base font-semibold mb-4">
              {editingContact ? `Edit ${editingContact.fullName}` : "Add Contact"}
            </h3>
            <div className="space-y-3">
              {!editingContact && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Organization</label>
                  <CustomSelect
                    value={form.organizationId}
                    onValueChange={(v) => setForm({ ...form, organizationId: v })}
                    triggerClassName="h-9 w-full"
                    placeholder="Select organization..."
                    options={[
                      { value: "", label: "Select organization..." },
                      ...organizations.map((o) => ({ value: o.id, label: o.name })),
                    ]}
                  />
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Full Name *</label>
                <input
                  type="text"
                  value={form.fullName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm({ ...form, fullName: e.target.value })}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  placeholder="John Smith"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm({ ...form, email: e.target.value })}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    placeholder="john@company.com"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Phone</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm({ ...form, phone: e.target.value })}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    placeholder="+1 555-0123"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Job Title</label>
                  <input
                    type="text"
                    value={form.jobTitle}
                    onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm({ ...form, jobTitle: e.target.value })}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    placeholder="CEO"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Contact Role</label>
                  <CustomSelect
                    value={form.role}
                    onValueChange={(v) => setForm({ ...form, role: v })}
                    triggerClassName="h-9 w-full"
                    placeholder="Select role..."
                    options={ROLE_OPTIONS}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                  placeholder="Any additional notes..."
                />
              </div>
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={() => { setShowForm(false); setEditingContact(null); }}
                className="h-9 rounded-md border px-4 text-sm hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={isPending}
                className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {isPending ? "Saving..." : editingContact ? "Update" : "Add Contact"}
              </button>
            </div>
          </div>
        </div>
      )}

      <DestructiveConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          try {
            await deleteContact(deleteTarget.id);
            setDeleteTarget(null);
            router.refresh();
          } catch (err) {
            showError({ title: "Error", message: err instanceof Error ? err.message : "Failed to delete contact." });
          }
        }}
        title="Remove Contact"
        description={deleteTarget ? `Remove ${deleteTarget.fullName} from ${deleteTarget.organization?.name ?? "contacts"}?` : ""}
        impactLines={[
          { label: "Contact record permanently deleted", count: 1, severity: "warn" },
        ]}
        confirmLabel="Remove Contact"
      />
    </div>
  );
}
