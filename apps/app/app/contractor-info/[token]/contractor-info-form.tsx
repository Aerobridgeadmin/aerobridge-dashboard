"use client";

import { submitContractorInfo, uploadContractorGovId } from "@/app/actions/hriq/contractor-info";
import { compressImage } from "@/lib/hriq/compress-image";
import { SecurityTrustStripLight } from "@/components/security-trust-strip";
import { DatePicker } from "@/app/(authenticated)/components/date-picker";
import { COUNTRY_OPTIONS } from "@/lib/hriq/country-options";
import { useState, useTransition, useRef, useEffect } from "react";

type Employee = {
  id: string;
  legalFirstName: string;
  secondName: string | null;
  legalLastName: string;
  secondLastName: string | null;
  preferredName: string | null;
  personalEmail: string | null;
  workEmail: string | null;
  phoneNumber: string | null;
  mobileNumber: string | null;
  dateOfBirth: Date | null;
  streetAddress: string | null;
  city: string | null;
  stateProvince: string | null;
  postalCode: string | null;
  country: string | null;
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankSwiftCode: string | null;
  bankRoutingNumber: string | null;
  debitCardNumber: string | null;
  bankAddress: string | null;
  paymentPlatform: string | null;
  paymentAccountInfo: string | null;
  preferredPaymentMethod: string | null;
  compensationType: string | null;
  hourlyRate: any;
  monthlySalary: any;
  startDate: Date | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelation: string | null;
  infoApprovalStatus: string | null;
  photoUrl: string | null;
  hasGovId?: boolean;
  govIdDocName?: string | null;
};

/* ── Custom dropdown for contractor forms ─── */
function InfoSelect({
  name,
  value,
  defaultValue: dv,
  onValueChange,
  options,
  placeholder = "Select...",
  required,
  searchable,
}: {
  name?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  required?: boolean;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [internal, setInternal] = useState(dv ?? "");
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isControlled = value !== undefined;
  const current = isControlled ? value : internal;
  const selected = options.find((o) => o.value === current);

  const filtered = searchable && query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  useEffect(() => {
    if (open && searchable) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open, searchable]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setQuery(""); }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const pick = (v: string) => {
    if (!isControlled) setInternal(v);
    onValueChange?.(v);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={ref} className="relative mt-1">
      {name && <input type="hidden" name={name} value={current} required={required} />}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-10 w-full items-center justify-between rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 text-sm text-left"
      >
        <span className={selected ? "text-gray-900 dark:text-gray-100" : "text-gray-400 dark:text-gray-500"}>{selected?.label ?? placeholder}</span>
        <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg">
          {searchable && (
            <div className="sticky top-0 bg-white dark:bg-gray-900 p-1.5 border-b border-gray-100 dark:border-gray-800">
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search..."
                className="h-8 w-full rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 outline-none focus:border-orange-500"
              />
            </div>
          )}
          {filtered.length === 0 && <div className="px-3 py-2 text-xs text-gray-400">No results</div>}
          {filtered.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => pick(o.value)}
              className={`flex w-full px-3 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-800 ${o.value === current ? "bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400 font-medium" : "text-gray-900 dark:text-gray-100"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ContractorInfoForm({ employee, token }: { employee: Employee; token: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [govIdFile, setGovIdFile] = useState<File | null>(null);
  const [govIdUploaded, setGovIdUploaded] = useState(!!employee.hasGovId);
  const [uploadingId, setUploadingId] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedCountry, setSelectedCountry] = useState(employee.country ?? "");
  const compType = (employee.compensationType === "monthly") ? "monthly" : "hourly";

  const payMethod = employee.preferredPaymentMethod as "cadana" | "wise" | null;

  const handleGovIdUpload = async (file: File) => {
    setUploadingId(true);
    try {
      const compressed = await compressImage(file, 1200, 0.8);
      const fd = new FormData();
      fd.set("token", token);
      fd.set("file", compressed);
      await uploadContractorGovId(fd);
      setGovIdUploaded(true);
      setGovIdFile(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload ID. If file is large, try a smaller image.");
    } finally {
      setUploadingId(false);
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Require Gov ID upload
    if (!govIdUploaded) {
      setError("Please upload your Government ID before submitting.");
      return;
    }

    const fd = new FormData(e.currentTarget);

    startTransition(async () => {
      try {
        await submitContractorInfo(token, {
          preferredName: fd.get("preferredName") as string,
          secondName: fd.get("secondName") as string,
          secondLastName: fd.get("secondLastName") as string,
          dateOfBirth: fd.get("dateOfBirth") as string,
          phoneNumber: fd.get("phoneNumber") as string,
          mobileNumber: fd.get("mobileNumber") as string,
          streetAddress: fd.get("streetAddress") as string,
          city: fd.get("city") as string,
          stateProvince: fd.get("stateProvince") as string,
          postalCode: fd.get("postalCode") as string,
          country: fd.get("country") as string,
          bankName: fd.get("bankName") as string,
          bankAccountName: fd.get("bankAccountName") as string,
          bankAccountNumber: fd.get("bankAccountNumber") as string,
          bankSwiftCode: (fd.get("bankSwiftCode") as string) || "",
          bankRoutingNumber: (fd.get("bankRoutingNumber") as string) || "",
          debitCardNumber: (fd.get("debitCardNumber") as string) || "",
          bankAddress: (fd.get("bankAddress") as string) || "",
          bankExtraData: {
            accountType: (fd.get("bankExtraAccountType") as string) || undefined,
            rut: (fd.get("bankExtraRut") as string) || undefined,
            idType: (fd.get("bankExtraIdType") as string) || undefined,
            idNumber: (fd.get("bankExtraIdNumber") as string) || undefined,
            phone: (fd.get("bankExtraPhone") as string) || undefined,
          },
          emergencyContactName: fd.get("emergencyContactName") as string,
          emergencyContactPhone: fd.get("emergencyContactPhone") as string,
          emergencyContactRelation: fd.get("emergencyContactRelation") as string,
        });
        // Redirect to public thank-you page instead of showing inline success
        window.location.href = "/onboarding-complete";
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to submit");
      }
    });
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Information Submitted</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Thank you, {employee.preferredName ?? employee.legalFirstName}! Your information has been submitted and is pending review by our team. You&apos;ll be notified once everything is approved.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-8 px-4">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-6 text-center">
          <img src="/logo.png" alt="Remote Leverage" className="mx-auto mb-3 h-12 w-12 rounded-lg" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Complete Your Information</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Hi {employee.preferredName ?? employee.legalFirstName}! Please fill in your details below. This information is required for onboarding.
          </p>
          <SecurityTrustStripLight className="mt-4" />
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 dark:bg-red-950 dark:border-red-800 dark:text-red-300">
            {error}
          </div>
        )}

        {employee.infoApprovalStatus === "rejected" && (
          <div className="mb-4 rounded-lg bg-amber-50 border border-amber-300 p-4 dark:bg-amber-950 dark:border-amber-700">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">Update Required</p>
            <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
              Your previous submission was returned for updates. Please review and correct your information below, then resubmit.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Government ID Upload */}
          <Section title="Government ID *" description="Upload a clear photo or scan of your valid government-issued ID (passport, driver&apos;s license, or national ID). This is required.">
            <div className={`rounded-lg border-2 border-dashed p-6 text-center ${!govIdUploaded && error?.includes("Government ID") ? "border-red-400 bg-red-50 dark:bg-red-950/20" : "border-gray-300 dark:border-gray-700"}`}>
              {govIdUploaded ? (
                <div>
                  <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-green-600">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  </div>
                  <p className="text-sm font-medium text-green-700 dark:text-green-400">{govIdFile?.name ?? employee.govIdDocName ?? "Government ID"} — Uploaded</p>
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="mt-2 text-xs text-gray-500 hover:underline">
                    Replace file
                  </button>
                </div>
              ) : (
                <div>
                  <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                    {uploadingId ? "Uploading..." : "Click to upload your Government ID"}
                  </p>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingId}
                    className="mt-3 inline-flex h-9 items-center rounded-lg bg-orange-500 px-4 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
                  >
                    {uploadingId ? "Uploading..." : "Choose File"}
                  </button>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleGovIdUpload(file);
                  e.target.value = "";
                }}
              />
            </div>
          </Section>

          {/* Personal Info */}
          <Section title="Personal Information">
            <div className="grid gap-4 sm:grid-cols-2">
              <ReadonlyField label="Legal First Name" value={employee.legalFirstName} />
              <FormField name="secondName" label="Second Name (Middle Name)" defaultValue={employee.secondName} placeholder="Second / middle name (if applicable)" />
              <ReadonlyField label="Legal Last Name" value={employee.legalLastName} />
              <FormField name="secondLastName" label="Second Last Name" defaultValue={employee.secondLastName} placeholder="Second last name (if applicable)" />
              <FormField name="preferredName" label="Preferred Name" defaultValue={employee.preferredName} placeholder="How you'd like to be called" />
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Date of Birth</label>
                <DatePicker name="dateOfBirth" defaultValue={employee.dateOfBirth ? new Date(typeof employee.dateOfBirth === "string" ? employee.dateOfBirth : (employee.dateOfBirth as Date).getTime()).toISOString().split("T")[0] : ""} className="mt-1" minYear={1940} maxYear={new Date().getFullYear() - 16} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Start Date
                </label>
                <div className="mt-1 flex h-10 w-full items-center rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-3 text-sm text-gray-600 dark:text-gray-400 cursor-not-allowed">
                  {employee.startDate ? new Date(typeof employee.startDate === "string" ? employee.startDate : (employee.startDate as Date).getTime()).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "Set by admin"}
                </div>
              </div>
              <FormField name="phoneNumber" label="Phone Number" defaultValue={employee.phoneNumber} placeholder="+1 555-1234 or +63 XXX XXXX" />
              <FormField name="mobileNumber" label="Mobile Number" defaultValue={employee.mobileNumber} placeholder="+1 555-1234 or +63 XXX XXXX" />
            </div>
          </Section>

          {/* Address */}
          <Section title="Home Address">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <FormField name="streetAddress" label="Address Line 1" required defaultValue={employee.streetAddress} placeholder="Street address, P.O. box, or apartment" />
              </div>
              <FormField name="city" label="City / Municipality" required defaultValue={employee.city} placeholder="City, town, or municipality" />
              <FormField name="stateProvince" label="State / Province / Region" defaultValue={employee.stateProvince} placeholder="State, province, region, or department" />
              <FormField name="postalCode" label="Postal / ZIP Code" defaultValue={employee.postalCode} placeholder="Postal code or ZIP" />
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Country <span className="text-red-500">*</span>
                </label>
                <InfoSelect
                  name="country"
                  required
                  value={selectedCountry}
                  onValueChange={setSelectedCountry}
                  placeholder="Select country..."
                  searchable
                  options={COUNTRY_OPTIONS.map((c) => ({ value: c.value, label: c.label }))}
                />
              </div>
            </div>
          </Section>

          {/* Compensation — read-only, set by admin */}
          <Section title="Compensation" description="Your pay structure as set by your coordinator.">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Pay Type</label>
                <div className="mt-1 flex h-10 items-center rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-3 text-sm text-gray-700 dark:text-gray-300">
                  {compType === "hourly" ? "Hourly Rate" : "Monthly Salary"}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {compType === "hourly" ? "Hourly Rate (USD)" : "Monthly Salary (USD)"}
                </label>
                <div className="mt-1 flex h-10 items-center rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                  ${compType === "hourly"
                    ? (employee.hourlyRate ? String(employee.hourlyRate) : "—")
                    : (employee.monthlySalary ? String(employee.monthlySalary) : "—")}
                </div>
              </div>
            </div>
          </Section>

          {/* Banking — dynamic based on admin-set payment method + country */}
          <Section
            title="Banking & Payment"
            description={
              payMethod
                ? `Your payment will be processed via ${payMethod === "cadana" ? "Cadana" : "Wise"}. Please provide the information below for your country.`
                : "This information is needed to process your payments securely."
            }
          >
            {payMethod && selectedCountry && (
              <div className={`mb-4 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${payMethod === "cadana" ? "bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400 border border-orange-200 dark:border-orange-900" : "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400 border border-green-200 dark:border-green-900"}`}>
                <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
                Showing fields required by {payMethod === "cadana" ? "Cadana" : "Wise"} for {selectedCountry}
              </div>
            )}
            <DynamicBankingFields
              payMethod={payMethod}
              country={selectedCountry}
              employee={employee}
            />
          </Section>

          {/* Emergency Contact */}
          <Section title="Emergency Contact">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField name="emergencyContactName" label="Full Name" required defaultValue={employee.emergencyContactName} placeholder="Emergency contact name" />
              <FormField name="emergencyContactPhone" label="Phone Number" required defaultValue={employee.emergencyContactPhone} placeholder="Phone number" />
              <FormField name="emergencyContactRelation" label="Relationship" defaultValue={employee.emergencyContactRelation} placeholder="e.g. Spouse, Parent, Sibling" />
            </div>
          </Section>

          {/* Submit */}
          <div className="flex justify-end gap-3 border-t pt-6">
            <button
              type="submit"
              disabled={isPending}
              className="h-11 rounded-lg bg-orange-500 px-8 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50"
            >
              {isPending ? "Submitting..." : "Submit Information"}
            </button>
          </div>
        </form>

        <p className="mt-6 text-center text-xs text-gray-400 dark:text-gray-600">
          Your information is encrypted and securely stored. It will only be used for employment and payment processing purposes.
        </p>
      </div>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
      {description && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

function FormField({
  name,
  label,
  type,
  defaultValue,
  placeholder,
  required,
}: {
  name: string;
  label: string;
  type?: string;
  defaultValue?: string | null;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        name={name}
        type={type ?? "text"}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        required={required}
        className="mt-1 block h-10 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-600 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
      />
    </div>
  );
}

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
      <div className="mt-1 flex h-10 w-full items-center rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-3 text-sm text-gray-600 dark:text-gray-400">
        {value}
      </div>
    </div>
  );
}

/* ── Country-specific bank list (shared by Cadana & Wise) ─── */
const COUNTRY_BANKS: Record<string, string[]> = {
  Philippines: ["BDO Unibank", "BPI (Bank of the Philippine Islands)", "Metrobank", "UnionBank", "Security Bank", "Landbank of the Philippines", "PNB (Philippine National Bank)", "Other"],
  Chile: ["Banco de Chile", "Banco Santander Chile", "BCI (Banco de Crédito e Inversiones)", "Banco Estado", "Itaú Chile", "BBVA Chile", "Scotiabank Chile", "Banco Falabella", "Banco Ripley", "Tanner", "Other"],
  Colombia: ["Bancolombia", "Banco Davivienda", "Banco de Bogotá", "BBVA Colombia", "Banco Popular", "Scotiabank Colpatria", "Nequi", "Daviplata", "Other"],
  Mexico: ["BBVA México", "Banamex (Citibanamex)", "Banco Santander México", "Banorte", "Inbursa", "Other"],
  Argentina: ["Banco Nación", "Banco Provincia", "Santander Argentina", "BBVA Argentina", "Galicia", "HSBC Argentina", "Macro", "Other"],
  "United States": ["Chase Bank", "Bank of America", "Wells Fargo", "Citibank", "US Bank", "Capital One", "TD Bank", "PNC Bank", "Other"],
  Canada: ["RBC (Royal Bank of Canada)", "TD Canada Trust", "BMO (Bank of Montreal)", "Scotiabank", "CIBC", "Other"],
  "United Kingdom": ["Barclays", "HSBC UK", "Lloyds Bank", "NatWest", "Monzo", "Revolut", "Other"],
  India: ["State Bank of India", "HDFC Bank", "ICICI Bank", "Axis Bank", "Kotak Mahindra Bank", "Other"],
  Brazil: ["Banco do Brasil", "Itaú Unibanco", "Bradesco", "Nubank", "Santander Brasil", "Other"],
  Australia: ["Commonwealth Bank", "Westpac", "ANZ", "NAB (National Australia Bank)", "Other"],
  Nigeria: ["GTBank", "Access Bank", "Zenith Bank", "First Bank Nigeria", "UBA", "Opay", "Other"],
  Peru: ["BCP (Banco de Crédito del Perú)", "BBVA Perú", "Interbank", "Scotiabank Perú", "Other"],
  Pakistan: ["Habib Bank Limited", "United Bank Limited", "MCB Bank", "Allied Bank", "Meezan Bank", "Other"],
  Kenya: ["KCB Bank", "Equity Bank", "Co-operative Bank", "Stanbic Kenya", "Other"],
  Ukraine: ["PrivatBank", "Monobank", "Oschadbank", "Raiffeisen Bank", "Other"],
  Venezuela: ["Banco de Venezuela", "Banesco", "Mercantil", "BBVA Provincial", "Other"],
};

function DynamicBankingFields({
  payMethod,
  country,
  employee,
}: {
  payMethod: "cadana" | "wise" | null;
  country: string;
  employee: Employee;
}) {
  const [bankOther, setBankOther] = useState("");
  const [bankNameSelect, setBankNameSelect] = useState(employee.bankName ?? "");

  // Country-derived flags
  const isChile = country === "Chile";
  const isColombia = country === "Colombia";
  const isUS = country === "United States";
  const isUK = country === "United Kingdom";
  const isAustralia = country === "Australia";
  const isIndia = country === "India";
  const isMexico = country === "Mexico";
  const isPhilippines = country === "Philippines";

  const usesIBAN = ["United Kingdom", "Ukraine"].includes(country);
  const showRoutingField = isUS || isUK || isAustralia || isIndia;
  const showAccountType = isChile || isColombia || isUS;
  const showRut = isChile;
  const showNationalId = isColombia;
  const showPhone = isChile || isColombia;
  const showSwift = !isChile && !isColombia && !isPhilippines && !isMexico && !isUS;

  const accountNumberLabel = isMexico ? "CLABE (18 digits)" : usesIBAN ? "IBAN" : "Account Number";
  const routingLabel = isIndia ? "IFSC Code" : (isUK || isAustralia) ? "Sort Code / BSB" : "Routing Number (ABA)";

  const availableBanks = COUNTRY_BANKS[country] ?? [];
  const hasBankDropdown = availableBanks.length > 0 && (payMethod === "cadana" || payMethod === "wise");

  // If no payment method set by admin, show generic fields
  if (!payMethod) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField name="bankName" label="Bank Name" required defaultValue={employee.bankName} placeholder="Your bank name" />
        <FormField name="bankAccountName" label="Account Holder Name" required defaultValue={employee.bankAccountName} placeholder="Full name on the account" />
        <FormField name="bankAccountNumber" label="Account Number" required defaultValue={employee.bankAccountNumber} placeholder="Account or IBAN number" />
        <FormField name="debitCardNumber" label="Debit Card Number" defaultValue={employee.debitCardNumber} placeholder="Card number (if available)" />
        <FormField name="bankRoutingNumber" label="Routing Number" defaultValue={employee.bankRoutingNumber} placeholder="e.g. 021000021 (or N/A)" />
        <FormField name="bankSwiftCode" label="SWIFT / BIC Code" defaultValue={employee.bankSwiftCode} placeholder="e.g. BCHICLRM (or N/A)" />
        <div className="sm:col-span-2">
          <FormField name="bankAddress" label="Bank Branch Address" defaultValue={employee.bankAddress} placeholder="Branch name and address" />
        </div>
      </div>
    );
  }

  if (!country) {
    return (
      <p className="text-sm text-amber-600 dark:text-amber-400">Please select your country above first — the banking fields will appear based on your country.</p>
    );
  }


  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {/* Bank Name — dropdown if known country, freetext otherwise */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Bank Name <span className="text-red-500">*</span>
        </label>
        {hasBankDropdown ? (
          <>
            <InfoSelect
              value={bankNameSelect}
              onValueChange={setBankNameSelect}
              placeholder="Select bank..."
              searchable
              options={availableBanks.map((b) => ({ value: b, label: b }))}
            />
            {bankNameSelect === "Other" && (
              <input
                value={bankOther}
                onChange={(e) => setBankOther(e.target.value)}
                placeholder="Enter bank name"
                className="mt-2 block h-10 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                required
              />
            )}
            <input type="hidden" name="bankName" value={bankNameSelect === "Other" ? bankOther : bankNameSelect} />
          </>
        ) : (
          <input
            name="bankName"
            required
            defaultValue={employee.bankName ?? ""}
            placeholder="Your bank name"
            className="mt-1 block h-10 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-600 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
        )}
      </div>

      {/* Account Holder Name */}
      <FormField name="bankAccountName" label="Account Holder Name" required defaultValue={employee.bankAccountName} placeholder="Full name on the account" />

      {/* Account Number / IBAN / CLABE */}
      <FormField name="bankAccountNumber" label={accountNumberLabel} required defaultValue={employee.bankAccountNumber} placeholder={isMexico ? "18-digit CLABE" : usesIBAN ? "e.g. GB29 NWBK 6016 1331 9268 19" : "Account number"} />

      {/* Account Type — Chile, Colombia, US */}
      {showAccountType && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Account Type <span className="text-red-500">*</span>
          </label>
          <InfoSelect
            name="bankExtraAccountType"
            required
            placeholder="Select type..."
            options={[
              { value: "checking", label: "Checking / Cuenta Corriente" },
              { value: "savings", label: "Savings / Cuenta de Ahorro" },
              ...(isChile ? [{ value: "vista", label: "Cuenta Vista / RUT" }] : []),
            ]}
          />
        </div>
      )}

      {/* RUT — Chile */}
      {showRut && (
        <FormField name="bankExtraRut" label="RUT (Chilean Tax ID)" required placeholder="e.g. 12.345.678-9" />
      )}

      {/* National ID — Colombia */}
      {showNationalId && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              ID Type <span className="text-red-500">*</span>
            </label>
            <InfoSelect
              name="bankExtraIdType"
              required
              defaultValue="CC"
              options={[
                { value: "CC", label: "Cédula de Ciudadanía" },
                { value: "CE", label: "Cédula de Extranjería" },
                { value: "PASSPORT", label: "Passport" },
                { value: "NIT", label: "NIT" },
              ]}
            />
          </div>
          <FormField name="bankExtraIdNumber" label="ID Number" required placeholder="ID number" />
        </>
      )}

      {/* Phone — Chile / Colombia */}
      {showPhone && (
        <FormField name="bankExtraPhone" label="Mobile Number" required placeholder={isChile ? "+56 9 1234 5678" : "+57 300 123 4567"} />
      )}

      {/* Routing / Sort Code / IFSC / ABA */}
      {showRoutingField && (
        <FormField name="bankRoutingNumber" label={routingLabel} required defaultValue={employee.bankRoutingNumber} placeholder={isIndia ? "e.g. SBIN0001234" : isUK || isAustralia ? "e.g. 20-00-00" : "e.g. 021000021"} />
      )}

      {/* SWIFT / BIC — not needed for some countries */}
      {showSwift && (
        <FormField name="bankSwiftCode" label={`SWIFT / BIC Code${usesIBAN ? "" : " (if applicable)"}`} required={usesIBAN} defaultValue={employee.bankSwiftCode} placeholder="e.g. BCHICLRM" />
      )}

      {/* Bank Address */}
      <div className="sm:col-span-2">
        <FormField name="bankAddress" label="Bank Branch Address" required={payMethod === "wise"} defaultValue={employee.bankAddress} placeholder="Branch name and address" />
      </div>
    </div>
  );
}
