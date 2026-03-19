"use client";

import { COUNTRY_OPTIONS } from "@/lib/hriq/country-options";

import { useCallback, useEffect, useRef, useState } from "react";

/* ── Custom dropdown (dark-themed) ─── */
function Select({
  value, onChange, options, placeholder = "Select...", searchable = false,
}: {
  value: string;
  onChange: (val: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);
  const filtered = searchable && search ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase())) : options;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSearch(""); }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative mt-1">
      <button
        type="button"
        onClick={() => { setOpen(!open); setSearch(""); }}
        className="flex h-10 w-full items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white"
      >
        <span className={selected ? "" : "text-white/30"}>{selected?.label ?? placeholder}</span>
        <svg className="h-4 w-4 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (
        <div className="absolute left-0 right-0 z-[71] mt-1 max-h-56 overflow-auto rounded-lg border border-white/10 bg-gray-900 shadow-xl">
          {searchable && (
            <div className="sticky top-0 bg-gray-900 p-1.5">
              <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="h-8 w-full rounded border border-white/10 bg-white/5 px-2 text-sm text-white placeholder:text-white/30 focus:outline-none" />
            </div>
          )}
          {filtered.map((o) => (
            <button key={o.value} type="button" onClick={() => { onChange(o.value); setOpen(false); }} className={`flex w-full px-3 py-2 text-sm hover:bg-white/10 ${o.value === value ? "bg-emerald-900/30 text-emerald-400" : "text-white"}`}>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Constants ─── */
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

const COUNTRY_CURRENCY: Record<string, string> = {
  Philippines: "PHP", Chile: "CLP", Colombia: "COP", Mexico: "MXN",
  Brazil: "BRL", India: "INR", Venezuela: "USD", Argentina: "ARS",
  Peru: "PEN", Pakistan: "PKR", Nigeria: "NGN", Kenya: "KES",
  "United States": "USD", Canada: "CAD", "United Kingdom": "GBP",
  Australia: "AUD", Ukraine: "UAH",
};

const ALL_COUNTRIES = [
  "Philippines", "Chile", "Colombia", "Mexico", "Brazil", "India",
  "Venezuela", "Argentina", "Peru", "Pakistan", "Nigeria", "Kenya",
  "United States", "Canada", "United Kingdom", "Australia", "Ukraine", "Other",
];

const CURRENCIES = [
  { value: "USD", label: "USD — US Dollar" }, { value: "PHP", label: "PHP — Philippine Peso" },
  { value: "CLP", label: "CLP — Chilean Peso" }, { value: "COP", label: "COP — Colombian Peso" },
  { value: "MXN", label: "MXN — Mexican Peso" }, { value: "BRL", label: "BRL — Brazilian Real" },
  { value: "EUR", label: "EUR — Euro" }, { value: "GBP", label: "GBP — British Pound" },
  { value: "CAD", label: "CAD — Canadian Dollar" }, { value: "AUD", label: "AUD — Australian Dollar" },
  { value: "INR", label: "INR — Indian Rupee" }, { value: "NGN", label: "NGN — Nigerian Naira" },
  { value: "KES", label: "KES — Kenyan Shilling" }, { value: "PEN", label: "PEN — Peruvian Sol" },
  { value: "PKR", label: "PKR — Pakistani Rupee" }, { value: "UAH", label: "UAH — Ukrainian Hryvnia" },
  { value: "ARS", label: "ARS — Argentine Peso" },
];

/* ── Component ─── */
type Props = {
  token: string;
  contractorName: string;
  prefill: {
    accountHolderName?: string; country?: string; currency?: string;
    bankName?: string; accountNumber?: string; swiftCode?: string; routingNumber?: string;
    streetAddress?: string; city?: string; state?: string; postalCode?: string;
  };
};

export function CadanaSetupForm({ token, contractorName, prefill }: Props) {
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    currency: prefill.currency ?? "",
    accountHolderName: prefill.accountHolderName ?? "",
    bankName: prefill.bankName ?? "",
    accountNumber: prefill.accountNumber ?? "",
    routingNumber: prefill.routingNumber ?? "",
    swiftCode: prefill.swiftCode ?? "",
    country: prefill.country ?? "",
    streetAddress: prefill.streetAddress ?? "",
    city: prefill.city ?? "",
    state: prefill.state ?? "",
    postalCode: prefill.postalCode ?? "",
    accountType: "",
    rut: "",
    idType: "CC",
    idNumber: "",
    phoneNumber: "",
  });
  const [bankOther, setBankOther] = useState("");

  const update = (field: string, value: string) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "country" && COUNTRY_CURRENCY[value]) {
        next.currency = COUNTRY_CURRENCY[value];
      }
      return next;
    });
  };

  // Country-derived flags
  const isChile = form.country === "Chile";
  const isColombia = form.country === "Colombia";
  const isUS = form.country === "United States";
  const isUK = form.country === "United Kingdom";
  const isAustralia = form.country === "Australia";
  const isIndia = form.country === "India";
  const isMexico = form.country === "Mexico";
  const isPhilippines = form.country === "Philippines";
  const showRoutingField = isUS || isUK || isAustralia || isIndia;
  const showAccountType = isChile || isColombia || isUS;
  const showRut = isChile;
  const showNationalId = isColombia;
  const showPhone = isChile || isColombia;
  const usesIBAN = ["United Kingdom", "Ukraine"].includes(form.country);
  const accountNumberLabel = isMexico ? "CLABE (18 digits) *" : usesIBAN ? "IBAN *" : "Account Number *";
  const routingLabel = isIndia ? "IFSC Code" : isUK || isAustralia ? "Sort Code / BSB" : "Routing Number (ABA)";
  const availableBanks = COUNTRY_BANKS[form.country] ?? [];
  const bankIsDropdown = availableBanks.length > 0;
  const showBankOther = bankIsDropdown && form.bankName === "Other";
  const accountTypeOptions = isChile
    ? [{ value: "CHECKING", label: "Cuenta Corriente" }, { value: "SAVINGS", label: "Cuenta de Ahorro" }, { value: "CUENTA_VISTA", label: "Cuenta Vista" }, { value: "CUENTA_RUT", label: "Cuenta RUT" }]
    : isColombia
    ? [{ value: "SAVINGS", label: "Cuenta de Ahorros" }, { value: "CHECKING", label: "Cuenta Corriente" }]
    : [{ value: "CHECKING", label: "Checking" }, { value: "SAVINGS", label: "Savings" }];

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const { submitCadanaSetup } = await import("@/app/actions/hriq/cadana-setup");
      const finalBankName = form.bankName === "Other" ? bankOther : form.bankName;
      const result = await submitCadanaSetup(token, {
        currency: form.currency,
        accountHolderName: form.accountHolderName,
        bankName: finalBankName,
        accountNumber: form.accountNumber,
        routingNumber: form.routingNumber || undefined,
        swiftCode: form.swiftCode || undefined,
        country: form.country,
        address: {
          streetAddress: form.streetAddress,
          city: form.city,
          state: form.state || undefined,
          postalCode: form.postalCode,
        },
        extraData: {
          ...(form.accountType ? { accountType: form.accountType } : {}),
          ...(form.rut ? { rut: form.rut } : {}),
          ...(form.idType ? { idType: form.idType } : {}),
          ...(form.idNumber ? { idNumber: form.idNumber } : {}),
          ...(form.phoneNumber ? { phoneNumber: form.phoneNumber } : {}),
        },
      });
      if ("error" in result) {
        setError(result.error);
        setSaving(false);
        return;
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setSaving(false);
    }
  }, [form, bankOther, token]);

  if (done) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-900/50 text-emerald-400">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          </div>
          <h1 className="text-xl font-bold text-white">Payment Details Saved!</h1>
          <p className="mt-2 text-sm text-gray-400">
            Thank you, {contractorName}! Your banking information has been securely saved. You&apos;re all set to receive payments.
          </p>
        </div>
      </div>
    );
  }

  const inputCls = "mt-1 flex h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/30 focus:border-emerald-500/50 focus:outline-none";
  const labelCls = "text-xs font-medium text-white/60";

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="mb-6 text-center">
          <img src="/logo.png" alt="Remote Leverage" className="mx-auto mb-3 h-12 w-12 rounded-lg" />
          <h1 className="text-xl font-bold text-white">Set Up Your Payment Details</h1>
          <p className="mt-1 text-sm text-gray-400">
            Hi {contractorName}! Please fill in your banking information below so we can pay you via Cadana.
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>
        )}

        <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl p-5 shadow-lg space-y-4">
          {/* Name + Currency */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Full Name (as on bank account) *</label>
              <input value={form.accountHolderName} onChange={(e) => update("accountHolderName", e.target.value)} placeholder="John Doe" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Preferred Currency *</label>
              <Select value={form.currency} onChange={(v) => update("currency", v)} options={CURRENCIES} placeholder="Select currency..." />
            </div>
          </div>

          {/* Country + Bank */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Country *</label>
              <Select value={form.country} onChange={(v) => update("country", v)} options={COUNTRY_OPTIONS.map((c) => ({ value: c.value, label: c.label }))} placeholder="Select country..." searchable />
            </div>
            <div>
              <label className={labelCls}>Bank Name *</label>
              {bankIsDropdown ? (
                <>
                  <Select value={form.bankName} onChange={(v) => update("bankName", v)} options={availableBanks.map((b) => ({ value: b, label: b }))} placeholder="Select bank..." searchable />
                  {showBankOther && <input value={bankOther} onChange={(e) => setBankOther(e.target.value)} placeholder="Enter bank name" className={"mt-2 " + inputCls} />}
                </>
              ) : (
                <input value={form.bankName} onChange={(e) => update("bankName", e.target.value)} placeholder="e.g. BDO Unibank" className={inputCls} />
              )}
            </div>
          </div>

          {/* Account Number */}
          <div>
            <label className={labelCls}>{accountNumberLabel}</label>
            <input value={form.accountNumber} onChange={(e) => update("accountNumber", e.target.value)} placeholder="Account number" className={inputCls} />
          </div>

          {/* Account Type */}
          {showAccountType && (
            <div>
              <label className={labelCls}>Account Type *</label>
              <Select value={form.accountType} onChange={(v) => update("accountType", v)} options={accountTypeOptions} placeholder="Select type..." />
            </div>
          )}

          {/* RUT — Chile */}
          {showRut && (
            <div>
              <label className={labelCls}>RUT (Chilean Tax ID) *</label>
              <input value={form.rut} onChange={(e) => update("rut", e.target.value)} placeholder="e.g. 12.345.678-9" className={inputCls} />
            </div>
          )}

          {/* National ID — Colombia */}
          {showNationalId && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>ID Type *</label>
                <Select value={form.idType} onChange={(v) => update("idType", v)} options={[
                  { value: "CC", label: "Cédula de Ciudadanía" }, { value: "CE", label: "Cédula de Extranjería" },
                  { value: "PASSPORT", label: "Passport" }, { value: "NIT", label: "NIT" },
                ]} />
              </div>
              <div>
                <label className={labelCls}>ID Number *</label>
                <input value={form.idNumber} onChange={(e) => update("idNumber", e.target.value)} placeholder="ID number" className={inputCls} />
              </div>
            </div>
          )}

          {/* Phone — Chile / Colombia */}
          {showPhone && (
            <div>
              <label className={labelCls}>Mobile Number *</label>
              <input value={form.phoneNumber} onChange={(e) => update("phoneNumber", e.target.value)} placeholder={isChile ? "+56 9 1234 5678" : "+57 300 123 4567"} className={inputCls} />
            </div>
          )}

          {/* Routing / Sort Code */}
          {showRoutingField && (
            <div>
              <label className={labelCls}>{routingLabel}</label>
              <input value={form.routingNumber} onChange={(e) => update("routingNumber", e.target.value)} placeholder="e.g. 021000021" className={inputCls} />
            </div>
          )}

          {/* SWIFT */}
          {!isChile && !isColombia && !isPhilippines && !isMexico && !isUS && (
            <div>
              <label className={labelCls}>SWIFT / BIC Code {usesIBAN ? "*" : "(optional)"}</label>
              <input value={form.swiftCode} onChange={(e) => update("swiftCode", e.target.value)} placeholder="e.g. BCHICLRM" className={inputCls} />
            </div>
          )}

          {/* Address */}
          <div className="mt-2 border-t border-white/10 pt-4">
            <p className="mb-3 text-xs font-medium text-white/60">Recipient Address (required for Cadana)</p>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Street Address *</label>
                <input value={form.streetAddress} onChange={(e) => update("streetAddress", e.target.value)} placeholder="e.g. 123 Main Street, Apt 4B" className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>City *</label>
                  <input value={form.city} onChange={(e) => update("city", e.target.value)} placeholder="City" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>{isUS ? "State *" : "State / Province"}</label>
                  <input value={form.state} onChange={(e) => update("state", e.target.value)} placeholder={isUS ? "e.g. NY" : "State or province"} className={inputCls} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Postal / ZIP Code *</label>
                <input value={form.postalCode} onChange={(e) => update("postalCode", e.target.value)} placeholder="e.g. 10001" className={inputCls} />
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={
            saving ||
            !form.accountHolderName || !form.currency || !form.country ||
            !(form.bankName === "Other" ? bankOther : form.bankName) ||
            !form.accountNumber || !form.streetAddress || !form.city || !form.postalCode ||
            (isUS && !form.state) ||
            (showAccountType && !form.accountType) ||
            (showRut && !form.rut) ||
            (showNationalId && !form.idNumber) ||
            (showPhone && !form.phoneNumber)
          }
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-6 py-4 text-base font-bold text-white shadow-lg transition hover:shadow-xl disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #059669 0%, #047857 100%)" }}
        >
          {saving ? (
            <><div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Saving...</>
          ) : (
            "Save Payment Details"
          )}
        </button>

        <p className="mt-4 text-center text-[11px] text-gray-600">
          Your information is encrypted and securely stored. Remote Leverage uses Cadana for safe international payroll.
        </p>
      </div>
    </div>
  );
}
