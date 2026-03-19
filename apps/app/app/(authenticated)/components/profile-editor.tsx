"use client";



import { useErrorDialog } from "@/app/(authenticated)/components/error-dialog";
import { updateMyProfile } from "@/app/actions/hriq/contractor-self-service";
import { DatePicker } from "@/app/(authenticated)/components/date-picker";

import { CustomSelectWithOther } from "@/app/(authenticated)/components/custom-select-with-other";
import { CustomSelect } from "@/app/(authenticated)/components/custom-select";
import { SearchableSelect } from "@/app/(authenticated)/components/searchable-select";
import { JOB_TITLE_OPTIONS, DEPARTMENT_OPTIONS } from "@/lib/hriq/role-department-options";
import { COUNTRY_OPTIONS } from "@/lib/hriq/country-options";
import { useState, useRef, useEffect } from "react";

type Profile = {
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
  bankRoutingNumber: string | null;
  debitCardNumber: string | null;
  bankAddress: string | null;
  paymentPlatform: string | null;
  paymentAccountInfo: string | null;
  preferredPaymentMethod: string | null;
  compensationType: string | null;
  monthlySalary: unknown;
  bankExtraData: Record<string, string> | null;
  bankSwiftCode: string | null;
  paymentMethodVerified: boolean;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelation: string | null;
  photoUrl: string | null;
  jobTitle: string | null;
  department: string | null;
  employmentType: string;
  employmentStatus: string;
  hourlyRate: unknown;
  currency: string;
  timezone: string | null;
  startDate: Date | null;
  employeeNumber: string;
  dailyHoursTarget: string;
};

function Field({ label, value, name, type = "text", placeholder, disabled }: {
  label: string; value: string; name: string; type?: string; placeholder?: string; disabled?: boolean;
}) {
  if (type === "date") {
    return (
      <div>
        <label htmlFor={name} className="block text-xs font-medium text-muted-foreground mb-1.5">{label}</label>
        <DatePicker name={name} defaultValue={value} />
      </div>
    );
  }
  return (
    <div>
      <label htmlFor={name} className="block text-xs font-medium text-muted-foreground mb-1.5">{label}</label>
      <input
        id={name} name={name} type={type} defaultValue={value} placeholder={placeholder}
        disabled={disabled}
        className="flex h-11 sm:h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm disabled:bg-muted disabled:cursor-not-allowed touch-manipulation"
      />
    </div>
  );
}

function Section({ title, description, icon, children, defaultOpen = true }: {
  title: string; description?: string; icon?: string; children?: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 sm:px-5 border-b text-left hover:bg-muted/30 transition-colors touch-manipulation"
      >
        {icon && <span className="text-lg">{icon}</span>}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm">{title}</h3>
          {description && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{description}</p>}
        </div>
        <svg
          className={`h-4 w-4 text-muted-foreground transition-transform shrink-0 ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open && (
        <div className="p-4 sm:p-5 grid gap-4 grid-cols-1 sm:grid-cols-2">{children}</div>
      )}
    </div>
  );
}

export function ProfileEditor({ profile, role = "member" }: { profile: Profile; role?: string }) {
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const { showError, showSuccess } = useErrorDialog();
  const isSuper = role === "super_admin";
  const [editCountry, setEditCountry] = useState(profile.country ?? "");
  const payMethod = profile.preferredPaymentMethod as "cadana" | "wise" | null;

  // Track form changes
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
      // Collect bankExtra* fields into JSON
      const bankExtra: Record<string, string> = {};
      for (const [key, value] of (fd as any).entries()) {
        if (typeof value === "string" && key.startsWith("bankExtra") && value.trim()) {
          const shortKey = key.replace("bankExtra", "");
          bankExtra[shortKey.charAt(0).toLowerCase() + shortKey.slice(1)] = value.trim();
        }
      }

      await updateMyProfile({
        preferredName: fd.get("preferredName") as string,
        secondName: fd.get("secondName") as string,
        secondLastName: fd.get("secondLastName") as string,
        phoneNumber: fd.get("phoneNumber") as string,
        mobileNumber: fd.get("mobileNumber") as string,
        dateOfBirth: fd.get("dateOfBirth") as string,
        streetAddress: fd.get("streetAddress") as string,
        city: fd.get("city") as string,
        stateProvince: fd.get("stateProvince") as string,
        postalCode: fd.get("postalCode") as string,
        country: fd.get("country") as string,
        timezone: fd.get("timezone") as string,
        emergencyContactName: fd.get("emergencyContactName") as string,
        emergencyContactPhone: fd.get("emergencyContactPhone") as string,
        emergencyContactRelation: fd.get("emergencyContactRelation") as string,
        bankName: fd.get("bankName") as string,
        bankAccountName: fd.get("bankAccountName") as string,
        bankAccountNumber: fd.get("bankAccountNumber") as string,
        bankSwiftCode: (fd.get("bankSwiftCode") as string) || "",
        bankRoutingNumber: (fd.get("bankRoutingNumber") as string) || "",
        debitCardNumber: (fd.get("debitCardNumber") as string) || "",
        bankAddress: (fd.get("bankAddress") as string) || "",
        ...(Object.keys(bankExtra).length > 0 ? { bankExtraData: bankExtra } : {}),
        // Super admin can edit all fields
        ...(isSuper ? {
          legalFirstName: fd.get("legalFirstName") as string,
          legalLastName: fd.get("legalLastName") as string,
          personalEmail: fd.get("personalEmail") as string,
          jobTitle: fd.get("jobTitle") as string,
          department: fd.get("department") as string,
          startDate: fd.get("startDate") as string,
          hourlyRate: fd.get("hourlyRate") as string,
          currency: fd.get("currency") as string,
          employeeNumber: fd.get("employeeNumber") as string,
          employmentStatus: fd.get("employmentStatus") as string,
          employmentType: fd.get("employmentType") as string,
        } : {}),
      });
      setDirty(false);
      showSuccess("Profile updated.");
    } catch (err) {
      showError({ title: "Error", message: err instanceof Error ? err.message : "Failed to update profile." });
    } finally {
      setSaving(false);
    }
  };

  const dob = profile.dateOfBirth ? new Date(profile.dateOfBirth as any).toISOString().split("T")[0] : "";

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 pb-20 sm:pb-4">
      {/* Header card */}
      <div className="rounded-xl border bg-card p-4 sm:p-5">
        <div className="flex items-center gap-3 sm:gap-4">
          {profile.photoUrl && !profile.photoUrl.endsWith("/logo.png") ? (
            <img src={profile.photoUrl} alt="" className="h-14 w-14 sm:h-16 sm:w-16 rounded-full object-cover border-2 border-primary/20" />
          ) : (
            <div className="flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-lg bg-white dark:bg-white/90 p-1 border border-border shrink-0">
              <img src="/logo.png" alt="RL" className="h-full w-full object-contain" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-lg sm:text-xl font-bold truncate">{profile.preferredName ?? profile.legalFirstName} {profile.legalLastName}</h2>
            <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5 text-xs sm:text-sm text-muted-foreground">
              <span>{profile.jobTitle ?? profile.employmentType}</span>
              <span className="hidden sm:inline">·</span>
              <span>{profile.employeeNumber}</span>
              {profile.hourlyRate != null && <><span className="hidden sm:inline">·</span><span>{String(profile.hourlyRate)} {profile.currency}/hr</span></>}
            </div>
          </div>
          <span className={`hidden sm:inline-block rounded-full px-3 py-1 text-xs font-medium capitalize ${
            profile.employmentStatus === "active" ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" :
            "bg-muted text-muted-foreground"
          }`}>
            {profile.employmentStatus.replace(/_/g, " ")}
          </span>
        </div>
      </div>

      {/* Personal Info */}
      <Section title="Personal Information" description="Your basic contact details"  defaultOpen={true}>
        <Field label="Legal First Name" name="legalFirstName" value={profile.legalFirstName} disabled={!isSuper} />
        <Field label="Second Name (Middle)" name="secondName" value={profile.secondName ?? ""} placeholder="Middle / second name" />
        <Field label="Legal Last Name" name="legalLastName" value={profile.legalLastName} disabled={!isSuper} />
        <Field label="Second Last Name" name="secondLastName" value={profile.secondLastName ?? ""} placeholder="Second last name" />
        <Field label="Preferred Name" name="preferredName" value={profile.preferredName ?? ""} placeholder="How you'd like to be called" />
        <Field label="Phone Number" name="phoneNumber" value={profile.phoneNumber ?? ""} type="tel" placeholder="+1 (555) 123-4567" />
        <Field label="Mobile Number" name="mobileNumber" value={profile.mobileNumber ?? ""} type="tel" />
        <Field label="Date of Birth" name="dateOfBirth" value={dob} type="date" />
        <Field label="Personal Email" name="personalEmail" value={profile.personalEmail ?? ""} disabled={!isSuper} />
        <Field label="Timezone" name="timezone" value={profile.timezone ?? ""} placeholder="e.g., America/New_York" />
      </Section>

      {/* Employment Details */}
      <Section title="Employment Details" description={isSuper ? "All fields editable as Super Admin" : "Managed by your administrator"} defaultOpen={false}>
        <div>
          <label htmlFor="jobTitle" className="block text-xs font-medium text-muted-foreground mb-1.5">Role / Job Title</label>
          {isSuper ? (
            <CustomSelectWithOther name="jobTitle" defaultValue={profile.jobTitle ?? ""} placeholder="Select role..." triggerClassName="h-11 sm:h-9 w-full" baseOptions={[...JOB_TITLE_OPTIONS]} category="job_title" />
          ) : (
            <input id="jobTitle" name="jobTitle" defaultValue={profile.jobTitle ?? ""} disabled placeholder="e.g., Virtual Assistant" className="flex h-11 sm:h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm disabled:bg-muted disabled:cursor-not-allowed touch-manipulation" />
          )}
        </div>
        <div>
          <label htmlFor="department" className="block text-xs font-medium text-muted-foreground mb-1.5">Department</label>
          {isSuper ? (
            <CustomSelectWithOther name="department" defaultValue={profile.department ?? ""} placeholder="Select department..." triggerClassName="h-11 sm:h-9 w-full" baseOptions={[...DEPARTMENT_OPTIONS]} category="department" />
          ) : (
            <input id="department" name="department" defaultValue={profile.department ?? ""} disabled className="flex h-11 sm:h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm disabled:bg-muted disabled:cursor-not-allowed touch-manipulation" />
          )}
        </div>
        <Field label="Employment Type" name="employmentType" value={profile.employmentType} disabled={!isSuper} />
        <Field label="Start Date" name="startDate" value={profile.startDate ? new Date(profile.startDate as any).toISOString().split("T")[0] : ""} type={isSuper ? "date" : "text"} disabled={!isSuper} />
        <Field label="Pay Rate (hourly)" name="hourlyRate" value={profile.hourlyRate ? String(profile.hourlyRate) : ""} disabled={!isSuper} placeholder="e.g., 15" />
        <Field label="Currency" name="currency" value={profile.currency} disabled={!isSuper} placeholder="e.g., USD" />
        <Field label="Employee Number" name="employeeNumber" value={profile.employeeNumber} disabled={!isSuper} />
        <Field label="Employment Status" name="employmentStatus" value={profile.employmentStatus.replace(/_/g, " ")} disabled={!isSuper} />
      </Section>

      {/* Address */}
      <Section title="Address"  defaultOpen={false}>
        <Field label="Street Address" name="streetAddress" value={profile.streetAddress ?? ""} />
        <Field label="City" name="city" value={profile.city ?? ""} />
        <Field label="State / Province" name="stateProvince" value={profile.stateProvince ?? ""} />
        <Field label="Postal Code" name="postalCode" value={profile.postalCode ?? ""} />
        <div className="sm:col-span-2">
          <label htmlFor="country" className="block text-xs font-medium text-muted-foreground mb-1.5">Country</label>
          <SearchableSelect name="country" value={editCountry} onValueChange={setEditCountry} placeholder="Select country..." triggerClassName="h-11 sm:h-9 w-full" options={[...COUNTRY_OPTIONS]} />
        </div>
      </Section>

      {/* Banking */}
      <Section title="Banking & Payment" description="Used for processing your payments"  defaultOpen={false}>
        {/* Payment method indicator (read-only) */}
        {payMethod && (
          <div className={`sm:col-span-2 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium mb-2 ${payMethod === "cadana" ? "bg-orange-100 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400" : "bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400"}`}>
            {profile.paymentMethodVerified && (
              <svg className="h-4 w-4 text-orange-500 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.31-8.86c-1.77-.45-2.34-.94-2.34-1.67 0-.84.79-1.43 2.1-1.43 1.38 0 1.9.66 1.94 1.64h1.71c-.05-1.34-.87-2.57-2.49-2.97V5H11.1v1.69c-1.51.32-2.72 1.3-2.72 2.81 0 1.79 1.49 2.69 3.66 3.21 1.95.46 2.34 1.15 2.34 1.87 0 .53-.39 1.39-2.1 1.39-1.6 0-2.23-.72-2.32-1.64H8.25c.1 1.71 1.38 2.66 2.85 2.97V19h2.34v-1.67c1.52-.29 2.72-1.16 2.73-2.77-.01-2.2-1.9-2.96-3.86-3.42z"/></svg>
            )}
            Payments via {payMethod === "cadana" ? "Cadana" : "Wise"}{profile.paymentMethodVerified ? " — verified" : ""}
          </div>
        )}
        <ProfileBankingFields payMethod={payMethod} country={editCountry} profile={profile} />
      </Section>

      {/* Emergency Contact */}
      <Section title="Emergency Contact" defaultOpen={false}>
        <Field label="Contact Name" name="emergencyContactName" value={profile.emergencyContactName ?? ""} />
        <Field label="Contact Phone" name="emergencyContactPhone" value={profile.emergencyContactPhone ?? ""} type="tel" />
        <div className="sm:col-span-2">
          <Field label="Relationship" name="emergencyContactRelation" value={profile.emergencyContactRelation ?? ""} placeholder="e.g., Spouse, Parent, Sibling" />
        </div>
      </Section>

      {/* Desktop save */}
      <div className="hidden sm:flex justify-end pt-2">
        <button
          type="submit"
          disabled={saving}
          className="h-10 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>

      {/* Mobile sticky save bar */}
      <div className={`fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur p-3 sm:hidden transition-transform ${dirty || saving ? "translate-y-0" : "translate-y-full"}`}>
        <button
          type="submit"
          disabled={saving}
          className="w-full h-12 rounded-xl bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 touch-manipulation"
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </form>
  );
}

// ─── Country-Specific Bank Lists ────────────────────────────────────────
const PROFILE_COUNTRY_BANKS: Record<string, string[]> = {
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
};

function ProfileBankingFields({ payMethod, country, profile }: { payMethod: "cadana" | "wise" | null; country: string; profile: Profile }) {
  const [bankNameSelect, setBankNameSelect] = useState(profile.bankName ?? "");
  const [bankOther, setBankOther] = useState("");
  const existingIsWiseTag = profile.bankAccountNumber?.startsWith("@");
  const [useWiseTag, setUseWiseTag] = useState(existingIsWiseTag ?? false);

  const isChile = country === "Chile";
  const isColombia = country === "Colombia";
  const isUS = country === "United States";
  const isUK = country === "United Kingdom";
  const isAustralia = country === "Australia";
  const isIndia = country === "India";
  const isMexico = country === "Mexico";
  const isPhilippines = country === "Philippines";

  const usesIBAN = ["United Kingdom", "Ukraine"].includes(country);
  const showRouting = isUS || isUK || isAustralia || isIndia;
  const showAccountType = isChile || isColombia || isUS;
  const showRut = isChile;
  const showNationalId = isColombia;
  const showSwift = !isChile && !isColombia && !isPhilippines && !isMexico && !isUS;

  const accountLabel = isMexico ? "CLABE (18 digits)" : usesIBAN ? "IBAN" : "Account Number";
  const routingLabel = isIndia ? "IFSC Code" : (isUK || isAustralia) ? "Sort Code / BSB" : "Routing Number";

  const availableBanks = PROFILE_COUNTRY_BANKS[country] ?? [];
  const hasBankDropdown = availableBanks.length > 0 && (payMethod === "cadana" || payMethod === "wise");
  const extraData = profile.bankExtraData;

  if (!payMethod || !country) {
    return (
      <>
        <Field label="Bank Name" name="bankName" value={profile.bankName ?? ""} />
        <Field label="Account Holder Name" name="bankAccountName" value={profile.bankAccountName ?? ""} />
        <Field label="Account Number" name="bankAccountNumber" value={profile.bankAccountNumber ?? ""} />
        <Field label="Routing Number" name="bankRoutingNumber" value={profile.bankRoutingNumber ?? ""} />
        <Field label="SWIFT / BIC Code" name="bankSwiftCode" value={profile.bankSwiftCode ?? ""} />
        <div className="sm:col-span-2">
          <Field label="Bank Address" name="bankAddress" value={profile.bankAddress ?? ""} />
        </div>
      </>
    );
  }

  return (
    <>
      {/* Wise tag toggle — only for Wise payment method */}
      {payMethod === "wise" && (
        <div className="sm:col-span-2">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={useWiseTag}
              onChange={(e) => setUseWiseTag(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            <span className="text-muted-foreground">I use a Wise tag (@username) instead of bank details</span>
          </label>
        </div>
      )}

      {useWiseTag && payMethod === "wise" ? (
        <>
          <Field label="Wise Tag" name="bankAccountNumber" value={profile.bankAccountNumber ?? ""} placeholder="@yourusername" />
          <Field label="Account Holder Name" name="bankAccountName" value={profile.bankAccountName ?? ""} />
          <input type="hidden" name="bankName" value="Wise" />
        </>
      ) : (
      <>
      {hasBankDropdown ? (
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Bank Name</label>
          <SearchableSelect value={bankNameSelect} onValueChange={setBankNameSelect} placeholder="Select bank..." triggerClassName="h-11 sm:h-9 w-full" options={availableBanks.map((b) => ({ value: b, label: b }))} />
          {bankNameSelect === "Other" && (
            <input value={bankOther} onChange={(e) => setBankOther(e.target.value)} placeholder="Enter bank name" className="mt-1.5 flex h-11 sm:h-9 w-full rounded-md border border-input bg-background px-3 text-sm" />
          )}
          <input type="hidden" name="bankName" value={bankNameSelect === "Other" ? bankOther : bankNameSelect} />
        </div>
      ) : (
        <Field label="Bank Name" name="bankName" value={profile.bankName ?? ""} />
      )}
      <Field label="Account Holder Name" name="bankAccountName" value={profile.bankAccountName ?? ""} />
      <Field label={accountLabel} name="bankAccountNumber" value={profile.bankAccountNumber ?? ""} />
      {showAccountType && (
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Account Type</label>
          <CustomSelect name="bankExtraAccountType" defaultValue={extraData?.accountType ?? ""} placeholder="Select type..." triggerClassName="h-11 sm:h-9 w-full" options={[
            { value: "checking", label: "Checking / Cuenta Corriente" },
            { value: "savings", label: "Savings / Cuenta de Ahorro" },
            ...(isChile ? [{ value: "vista", label: "Cuenta Vista / RUT" }] : []),
          ]} />
        </div>
      )}
      {showRut && <Field label="RUT (Tax ID)" name="bankExtraRut" value={extraData?.rut ?? ""} />}
      {showNationalId && (
        <>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">ID Type</label>
            <CustomSelect name="bankExtraIdType" defaultValue={extraData?.idType ?? "CC"} triggerClassName="h-11 sm:h-9 w-full" options={[
              { value: "CC", label: "Cédula de Ciudadanía" },
              { value: "CE", label: "Cédula de Extranjería" },
              { value: "PASSPORT", label: "Passport" },
              { value: "NIT", label: "NIT" },
            ]} />
          </div>
          <Field label="ID Number" name="bankExtraIdNumber" value={extraData?.idNumber ?? ""} />
        </>
      )}
      {showRouting && <Field label={routingLabel} name="bankRoutingNumber" value={profile.bankRoutingNumber ?? ""} />}
      {showSwift && <Field label="SWIFT / BIC Code" name="bankSwiftCode" value={profile.bankSwiftCode ?? ""} />}
      <div className="sm:col-span-2">
        <Field label="Bank Address" name="bankAddress" value={profile.bankAddress ?? ""} />
      </div>
      </>
      )}
    </>
  );
}
