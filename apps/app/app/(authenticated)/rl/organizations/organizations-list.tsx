"use client";

import { createClientOrganization } from "@/app/actions/hriq/invitations";
import { uploadOrgDocument } from "@/app/actions/hriq/upload";
import type { Organization } from "@repo/database";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

function DocUploadField({ name, label, desc, accept, orgId, onUploaded }: { name: string; label: string; desc: string; accept: string; orgId?: string; onUploaded?: (docType: string, url: string) => void }) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    if (orgId) {
      setUploading(true);
      try {
        const fd = new FormData();
        fd.set("file", file);
        fd.set("orgId", orgId);
        fd.set("docType", name.replace("doc_", ""));
        const result = await uploadOrgDocument(fd);
        setUploaded(true);
        onUploaded?.(name.replace("doc_", ""), result.url);
      } catch {
        setUploaded(false);
      } finally {
        setUploading(false);
      }
    }
  };

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="text-sm font-medium">{label}</div>
          <div className="text-xs text-muted-foreground">{desc}</div>
        </div>
        <div className="flex items-center gap-2">
          {uploading ? (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800">Uploading...</span>
          ) : uploaded ? (
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">Uploaded</span>
              <span className="max-w-[120px] truncate text-xs text-muted-foreground">{fileName}</span>
              <button type="button" onClick={() => { setFileName(null); setUploaded(false); if (inputRef.current) inputRef.current.value = ""; }} className="text-xs text-red-500 hover:underline">Remove</button>
            </div>
          ) : fileName ? (
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-800">Selected</span>
              <span className="max-w-[120px] truncate text-xs text-muted-foreground">{fileName}</span>
              <button type="button" onClick={() => { setFileName(null); if (inputRef.current) inputRef.current.value = ""; }} className="text-xs text-red-500 hover:underline">Remove</button>
            </div>
          ) : (
            <label className="cursor-pointer rounded-md border border-dashed px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary">
              Choose File
              <input ref={inputRef} type="file" name={name} accept={accept} className="hidden" onChange={handleFile} />
            </label>
          )}
        </div>
      </div>
    </div>
  );
}

type OrgWithCounts = Organization & {
  _count: { members: number; employees: number };
};

type OrgFormData = {
  name: string; industry: string; companySize: string; website: string; country: string; address: string;
  adminName: string; adminEmail: string; adminPhone: string; adminTitle: string; billingEmail: string; paymentTerms: string;
};

const emptyForm: OrgFormData = {
  name: "", industry: "", companySize: "", website: "", country: "", address: "",
  adminName: "", adminEmail: "", adminPhone: "", adminTitle: "", billingEmail: "", paymentTerms: "net_30",
};

export function OrganizationsList({ organizations }: { organizations: OrgWithCounts[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showCreate, setShowCreate] = useState(false);
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<OrgFormData>(emptyForm);
  const [docUploads, setDocUploads] = useState<Record<string, boolean>>({});

  const updateForm = (field: keyof OrgFormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleNextStep = () => {
    if (step === 1 && !form.name.trim()) { setError("Organization name is required"); return; }
    if (step === 2 && !form.adminEmail.trim()) { setError("Admin email is required"); return; }
    setError(null);
    setStep(step + 1);
  };

  const handleCreate = () => {
    startTransition(async () => {
      try {
        await createClientOrganization({
          name: form.name,
          adminEmail: form.adminEmail,
          adminName: form.adminName || undefined,
          industry: form.industry || undefined,
          companySize: form.companySize || undefined,
          website: form.website || undefined,
          country: form.country || undefined,
          address: form.address || undefined,
          adminPhone: form.adminPhone || undefined,
          adminTitle: form.adminTitle || undefined,
          billingEmail: form.billingEmail || undefined,
          paymentTerms: form.paymentTerms || undefined,
          docChecklist: docUploads,
        });
        setShowCreate(false);
        setStep(1);
        setForm(emptyForm);
        setDocUploads({});
        setError(null);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create organization");
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Client Organizations ({organizations.length})</h2>
        <button type="button" onClick={() => { setShowCreate(true); setStep(1); }} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          + New Organization
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {organizations.map((org) => (
          <Link key={org.id} href={`/rl/organizations/${org.id}`} className="rounded-xl border bg-card p-5 transition-colors hover:bg-muted/50">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
                {org.name.charAt(0)}
              </div>
              <div>
                <h3 className="font-semibold">{org.name}</h3>
                <p className="text-xs text-muted-foreground">{org.slug}</p>
              </div>
            </div>
            <div className="mt-3 flex gap-4 text-sm">
              <span><strong>{org._count.members}</strong> members</span>
              <span><strong>{org._count.employees}</strong> contractors</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Created {new Date(org.createdAt).toLocaleDateString()}
            </p>
          </Link>
        ))}
      </div>

      {organizations.length === 0 && (
        <div className="py-12 text-center text-muted-foreground">No organizations yet. Create one to get started.</div>
      )}

      {/* Multi-step Create Organization Dialog */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-2xl rounded-xl border bg-card p-6 shadow-lg max-h-[90vh] overflow-y-auto">
            {/* Progress Steps */}
            <div className="mb-6">
              <div className="flex items-center justify-between">
                {[
                  { n: 1, label: "Company Info" },
                  { n: 2, label: "Contact & Admin" },
                  { n: 3, label: "Documents Checklist" },
                ].map((s) => (
                  <div key={s.n} className="flex flex-1 items-center">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${step >= s.n ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                      {step > s.n ? "✓" : s.n}
                    </div>
                    <span className={`ml-2 text-sm ${step >= s.n ? "font-medium" : "text-muted-foreground"}`}>{s.label}</span>
                    {s.n < 3 && <div className={`mx-3 h-0.5 flex-1 ${step > s.n ? "bg-primary" : "bg-muted"}`} />}
                  </div>
                ))}
              </div>
            </div>

            <div>
              {error && <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

              {/* Step 1: Company Information */}
              {step === 1 && (
                <div className="space-y-4">
                  <h2 className="text-lg font-semibold">Company Information</h2>
                  <p className="text-sm text-muted-foreground">Basic details about the client organization.</p>
                  <div>
                    <label className="text-sm font-medium">Company Name *</label>
                    <input value={form.name} onChange={(e) => updateForm("name", e.target.value)} placeholder="Acme Corporation" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium">Industry</label>
                      <select value={form.industry} onChange={(e) => updateForm("industry", e.target.value)} className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                        <option value="">Select...</option>
                        <option value="technology">Technology</option>
                        <option value="healthcare">Healthcare</option>
                        <option value="finance">Finance</option>
                        <option value="ecommerce">E-Commerce</option>
                        <option value="real_estate">Real Estate</option>
                        <option value="marketing">Marketing</option>
                        <option value="consulting">Consulting</option>
                        <option value="education">Education</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Company Size</label>
                      <select value={form.companySize} onChange={(e) => updateForm("companySize", e.target.value)} className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                        <option value="">Select...</option>
                        <option value="1-10">1-10 employees</option>
                        <option value="11-50">11-50 employees</option>
                        <option value="51-200">51-200 employees</option>
                        <option value="201-500">201-500 employees</option>
                        <option value="500+">500+ employees</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium">Website</label>
                      <input value={form.website} onChange={(e) => updateForm("website", e.target.value)} placeholder="https://acme.com" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Country</label>
                      <input value={form.country} onChange={(e) => updateForm("country", e.target.value)} placeholder="United States" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Business Address</label>
                    <input value={form.address} onChange={(e) => updateForm("address", e.target.value)} placeholder="123 Main St, Suite 100, City, State, ZIP" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
                  </div>
                </div>
              )}

              {/* Step 2: Contact & Admin */}
              {step === 2 && (
                <div className="space-y-4">
                  <h2 className="text-lg font-semibold">Primary Contact & Admin</h2>
                  <p className="text-sm text-muted-foreground">Who will manage this organization on the platform?</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium">Admin Name *</label>
                      <input value={form.adminName} onChange={(e) => updateForm("adminName", e.target.value)} placeholder="John Smith" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Admin Email *</label>
                      <input value={form.adminEmail} onChange={(e) => updateForm("adminEmail", e.target.value)} type="email" placeholder="john@acme.com" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium">Admin Phone</label>
                      <input value={form.adminPhone} onChange={(e) => updateForm("adminPhone", e.target.value)} placeholder="+1 (555) 123-4567" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Admin Title</label>
                      <input value={form.adminTitle} onChange={(e) => updateForm("adminTitle", e.target.value)} placeholder="HR Director" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
                    </div>
                  </div>
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950">
                    <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100">Billing Contact</h4>
                    <p className="text-xs text-blue-700 dark:text-blue-300">Same as admin unless specified otherwise.</p>
                    <div className="mt-3 grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-medium">Billing Email</label>
                        <input value={form.billingEmail} onChange={(e) => updateForm("billingEmail", e.target.value)} type="email" placeholder="billing@acme.com" className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" />
                      </div>
                      <div>
                        <label className="text-xs font-medium">Payment Terms</label>
                        <select value={form.paymentTerms} onChange={(e) => updateForm("paymentTerms", e.target.value)} className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                          <option value="net_15">Net 15</option>
                          <option value="net_30">Net 30</option>
                          <option value="net_45">Net 45</option>
                          <option value="prepaid">Prepaid</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Document Uploads */}
              {step === 3 && (
                <div className="space-y-4">
                  <h2 className="text-lg font-semibold">Upload Client Documents</h2>
                  <p className="text-sm text-muted-foreground">Upload required documents for this client. All fields are optional — you can add missing documents later from the org settings.</p>

                  <div className="space-y-4">
                    <h3 className="text-sm font-medium text-muted-foreground uppercase">Tax & Legal Documents</h3>
                    <DocUploadField name="doc_ein" label="EIN (Employer Identification Number)" desc="Federal tax ID for the business" accept=".pdf,.png,.jpg,.jpeg" />
                    <DocUploadField name="doc_w9" label="W-9 Form" desc="Request for Taxpayer ID and Certification" accept=".pdf" />
                    <DocUploadField name="doc_business_license" label="Business License / Registration" desc="State or local business license" accept=".pdf,.png,.jpg,.jpeg" />
                    <DocUploadField name="doc_articles" label="Articles of Incorporation / Operating Agreement" desc="Legal formation documents" accept=".pdf" />

                    <h3 className="text-sm font-medium text-muted-foreground uppercase pt-2">Insurance & Compliance</h3>
                    <DocUploadField name="doc_insurance_coi" label="Certificate of Insurance (COI)" desc="General liability and/or professional liability" accept=".pdf" />
                    <DocUploadField name="doc_workers_comp" label="Workers' Compensation Certificate" desc="If applicable in their state" accept=".pdf" />
                    <DocUploadField name="doc_nda" label="NDA / Confidentiality Agreement" desc="Mutual non-disclosure agreement" accept=".pdf,.docx" />
                    <DocUploadField name="doc_msa" label="Master Service Agreement (MSA)" desc="Signed service agreement with Remote Leverage" accept=".pdf,.docx" />

                    <h3 className="text-sm font-medium text-muted-foreground uppercase pt-2">Branding & Setup</h3>
                    <DocUploadField name="doc_logo" label="Company Logo" desc="SVG or PNG for platform branding and documents" accept=".svg,.png,.jpg,.jpeg,.webp" />
                    <DocUploadField name="doc_brand_guidelines" label="Brand Guidelines" desc="Colors, fonts, usage rules (optional)" accept=".pdf,.png,.jpg,.jpeg" />
                    <DocUploadField name="doc_org_chart" label="Organization Chart" desc="Reporting structure and departments" accept=".pdf,.png,.jpg,.jpeg,.xlsx,.csv" />
                  </div>

                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950">
                    <p className="text-xs text-blue-700 dark:text-blue-300">
                      All uploads are optional during setup. Missing documents will be tracked in the organization&apos;s settings and can be uploaded later. Accepted formats: PDF, images, DOCX.
                    </p>
                  </div>
                </div>
              )}

              {/* Navigation Buttons */}
              <div className="mt-6 flex justify-between">
                <div>
                  {step > 1 && (
                    <button type="button" onClick={() => { setError(null); setStep(step - 1); }} className="h-10 rounded-md border px-4 text-sm font-medium hover:bg-accent">
                      Back
                    </button>
                  )}
                </div>
                <div className="flex gap-3">
                  <button type="button" onClick={() => { setShowCreate(false); setStep(1); setForm(emptyForm); setError(null); }} className="h-10 rounded-md border px-4 text-sm font-medium hover:bg-accent">
                    Cancel
                  </button>
                  {step < 3 ? (
                    <button type="button" onClick={handleNextStep} className="h-10 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                      Next
                    </button>
                  ) : (
                    <button type="button" onClick={handleCreate} disabled={isPending} className="h-10 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                      {isPending ? "Creating..." : "Create Organization"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
