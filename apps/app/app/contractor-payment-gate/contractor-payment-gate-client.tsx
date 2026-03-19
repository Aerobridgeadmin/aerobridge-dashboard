"use client";

import { COUNTRY_OPTIONS } from "@/lib/hriq/country-options";

import { useCallback, useEffect, useRef, useState } from "react";

/* ── Custom dropdown for the payment gate (dark-themed, no native select) ─── */
function GateSelect({
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
  const searchRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSearch(""); }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    if (open && searchable && searchRef.current) {
      searchRef.current.focus();
    }
    if (open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
  }, [open, searchable]);

  const filtered = searchable && search
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  return (
    <div ref={ref} className="relative mt-1">
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setSearch(""); }}
        className="flex h-10 w-full items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white focus:border-emerald-500/50 focus:outline-none hover:border-white/20 transition-colors"
      >
        <span className={selected ? "text-white" : "text-white/30"}>
          {selected ? selected.label : placeholder}
        </span>
        <svg className={`h-4 w-4 text-white/40 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[70]" onClick={() => { setOpen(false); setSearch(""); }} />
          <div className="fixed z-[71] rounded-lg border border-white/10 bg-gray-900 shadow-xl overflow-hidden" style={{ top: pos.top, left: pos.left, width: pos.width }}>
            {searchable && (
              <div className="border-b border-white/10 p-2">
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Type to search..."
                  className="w-full rounded-md bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                />
              </div>
            )}
            <div className="max-h-60 overflow-y-auto overscroll-contain">
              {filtered.length === 0 && (
                <div className="px-3 py-3 text-sm text-white/40">No matches</div>
              )}
              {filtered.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => { onChange(o.value); setOpen(false); setSearch(""); }}
                  className={`flex w-full items-center justify-between px-3 py-2.5 text-sm transition-colors hover:bg-white/10 ${
                    o.value === value ? "text-emerald-400 bg-white/5" : "text-white"
                  }`}
                >
                  {o.label}
                  {o.value === value && (
                    <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

type Props = {
  employeeId: string;
  contractorName: string;
  orgName: string;
  orgSlug: string;
  paymentMethod: string;
  needsStripe: boolean;
  needsWise: boolean;
  needsCadana: boolean;
  hasStripeAccount: boolean;
  stripeStatus: string;
  hasWiseRecipient: boolean;
  hasCadanaSetup: boolean;
  wisePrefill?: {
    accountHolderName?: string;
    country?: string;
    currency?: string;
    bankName?: string;
    accountNumber?: string;
    swiftCode?: string;
    routingNumber?: string;
    streetAddress?: string;
    city?: string;
    state?: string;
    postalCode?: string;
  };
};

type Phase = "overview" | "stripe_setup" | "stripe_waiting" | "stripe_done" | "wise_setup" | "wise_saving" | "wise_done" | "cadana_setup" | "cadana_saving" | "cadana_done" | "all_done" | "error";

export function ContractorPaymentGateClient({
  employeeId,
  contractorName,
  orgName,
  orgSlug,
  paymentMethod,
  needsStripe,
  needsWise,
  needsCadana,
  hasStripeAccount,
  stripeStatus,
  hasWiseRecipient,
  hasCadanaSetup,
  wisePrefill,
}: Props) {
  // Country → bank lookup
  const COUNTRY_BANKS: Record<string, string[]> = {
    Philippines: ["BDO Unibank", "BPI (Bank of the Philippine Islands)", "Metrobank", "UnionBank", "Security Bank", "Landbank of the Philippines", "PNB (Philippine National Bank)", "China Banking Corporation", "EastWest Bank", "RCBC", "Maybank Philippines", "Other"],
    Chile: ["Banco de Chile", "Banco Santander Chile", "BCI (Banco de Crédito e Inversiones)", "Banco Estado", "Itaú Chile", "BBVA Chile", "Scotiabank Chile", "Banco Falabella", "Banco Ripley", "Tanner", "Other"],
    Colombia: ["Bancolombia", "Banco Davivienda", "Banco de Bogotá", "BBVA Colombia", "Banco Popular", "Banco Caja Social", "Scotiabank Colpatria", "Nequi", "Daviplata", "Other"],
    Mexico: ["BBVA México", "Banamex (Citibanamex)", "Banco Santander México", "HSBC México", "Banorte", "Inbursa", "Scotiabank México", "Banregio", "Other"],
    Brazil: ["Banco do Brasil", "Caixa Econômica Federal", "Itaú Unibanco", "Bradesco", "Nubank", "Santander Brasil", "Inter", "Other"],
    India: ["State Bank of India", "HDFC Bank", "ICICI Bank", "Axis Bank", "Kotak Mahindra Bank", "Punjab National Bank", "Bank of Baroda", "Canara Bank", "Other"],
    Nicaragua: ["Banco LAFISE Bancentro", "BAC Credomatic", "Banpro (Banco de la Producción)", "Banco Ficohsa Nicaragua", "Banco Avanz", "Other"],
    Venezuela: ["Banco de Venezuela", "Banesco", "Mercantil", "BBVA Provincial", "BNC", "Other"],
    Argentina: ["Banco Nación", "Banco Provincia", "Santander Argentina", "BBVA Argentina", "Galicia", "HSBC Argentina", "Macro", "Other"],
    Peru: ["BCP (Banco de Crédito del Perú)", "BBVA Perú", "Interbank", "Scotiabank Perú", "Banco Pichincha", "Other"],
    Pakistan: ["Habib Bank Limited", "United Bank Limited", "MCB Bank", "Allied Bank", "National Bank of Pakistan", "Meezan Bank", "Bank Alfalah", "Other"],
    Nigeria: ["GTBank", "Access Bank", "Zenith Bank", "First Bank Nigeria", "UBA", "Stanbic IBTC", "Opay", "Kuda Bank", "Other"],
    Kenya: ["KCB Bank", "Equity Bank", "Co-operative Bank", "Stanbic Kenya", "NCBA Bank", "Absa Kenya", "Other"],
    "United States": ["Chase Bank", "Bank of America", "Wells Fargo", "Citibank", "US Bank", "Capital One", "TD Bank", "PNC Bank", "Other"],
    Canada: ["RBC (Royal Bank of Canada)", "TD Canada Trust", "BMO (Bank of Montreal)", "Scotiabank", "CIBC", "National Bank", "Other"],
    "United Kingdom": ["Barclays", "HSBC UK", "Lloyds Bank", "NatWest", "Santander UK", "Monzo", "Revolut", "Other"],
    Australia: ["Commonwealth Bank", "Westpac", "ANZ", "NAB (National Australia Bank)", "Other"],
    Ukraine: ["PrivatBank", "Monobank", "Oschadbank", "Ukrsibbank", "Raiffeisen Bank", "Other"],
  };

  const COUNTRY_CURRENCY: Record<string, string> = {
    Philippines: "PHP", Chile: "CLP", Colombia: "COP", Mexico: "MXN",
    Brazil: "BRL", India: "INR", Venezuela: "USD", Argentina: "ARS",
    Peru: "PEN", Pakistan: "PKR", Nigeria: "NGN", Kenya: "KES",
    Nicaragua: "NIO", "Costa Rica": "CRC", Guatemala: "GTQ",
    Honduras: "HNL", "El Salvador": "USD", "Dominican Republic": "DOP",
    Ecuador: "USD", Panama: "USD", Jamaica: "JMD",
    "United States": "USD", Canada: "CAD", "United Kingdom": "GBP",
    Australia: "AUD", Ukraine: "UAH",
  };

  const ALL_COUNTRIES = [
    "Argentina", "Australia", "Brazil", "Canada", "Chile", "Colombia",
    "Costa Rica", "Dominican Republic", "Ecuador", "El Salvador",
    "Guatemala", "Honduras", "India", "Jamaica", "Kenya", "Mexico",
    "Nicaragua", "Nigeria", "Pakistan", "Panama", "Peru", "Philippines",
    "Ukraine", "United Kingdom", "United States", "Venezuela", "Other",
  ];

  const [phase, setPhase] = useState<Phase>("overview");
  const [error, setError] = useState<string | null>(null);
  const [onboardingUrl, setOnboardingUrl] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [pollTimeout, setPollTimeout] = useState(false);

  // Wise form state — pre-filled from contractor info
  const [wiseMode, setWiseMode] = useState<"bank_account" | "wise_tag">(
    wisePrefill?.accountNumber?.startsWith("@") ? "wise_tag" : "bank_account"
  );
  const [wiseTag, setWiseTag] = useState(
    wisePrefill?.accountNumber?.startsWith("@") ? wisePrefill.accountNumber : ""
  );
  const [wiseForm, setWiseForm] = useState({
    currency: wisePrefill?.currency ?? "",
    accountHolderName: wisePrefill?.accountHolderName ?? "",
    bankName: wisePrefill?.bankName ?? "",
    accountNumber: wisePrefill?.accountNumber ?? "",
    routingNumber: wisePrefill?.routingNumber ?? "",
    swiftCode: wisePrefill?.swiftCode ?? "",
    country: wisePrefill?.country ?? "",
    // Address fields (required by Wise for recipient creation)
    streetAddress: wisePrefill?.streetAddress ?? "",
    city: wisePrefill?.city ?? "",
    state: wisePrefill?.state ?? "",
    postalCode: wisePrefill?.postalCode ?? "",
    // Country-specific extra fields
    accountType: "",       // CL/CO/US: CHECKING/SAVINGS/CUENTA_VISTA/CUENTA_RUT
    rut: "",               // CL: Chilean tax ID (e.g. 12.345.678-9)
    idType: "CC",          // CO: CC | CE | PASSPORT | NIT
    idNumber: "",          // CO: national ID number
    phoneNumber: "",       // CL/CO: mobile number
  });

  // Country-specific banks (or free-text if "Other" or unknown country)
  const availableBanks = COUNTRY_BANKS[wiseForm.country] ?? [];
  const bankIsDropdown = availableBanks.length > 0;
  const showBankOther = bankIsDropdown && wiseForm.bankName === "Other";
  const [bankOther, setBankOther] = useState("");

  // Derive which extra fields to show based on country
  const countryKey = wiseForm.country;
  const isChile = countryKey === "Chile";
  const isColombia = countryKey === "Colombia";
  const isPhilippines = countryKey === "Philippines";
  const isMexico = countryKey === "Mexico";
  const isIndia = countryKey === "India";
  const isUS = countryKey === "United States";
  const isUK = countryKey === "United Kingdom";
  const isAustralia = countryKey === "Australia";
  // Countries using IBAN (most European + some others)
  const usesIBAN = ["United Kingdom", "Ukraine"].includes(countryKey);
  // Countries where routing/sort code makes sense
  const showRoutingField = isUS || isUK || isAustralia || isIndia;
  // Countries that use account type (Checking/Savings)
  const showAccountType = isChile || isColombia || isUS;
  // Countries that need RUT
  const showRut = isChile;
  // Countries that need national ID
  const showNationalId = isColombia;
  // Countries needing phone (for Wise recipient)
  const showPhone = isChile || isColombia;
  // Label for account number field
  const accountNumberLabel = isMexico ? "CLABE (18 digits) *" : usesIBAN ? "IBAN *" : "Account Number *";
  const accountNumberPlaceholder = isMexico ? "18-digit CLABE number" : usesIBAN ? "e.g. GB29NWBK..." : "Account number";
  // Label for routing field
  const routingLabel = isIndia ? "IFSC Code" : isUK || isAustralia ? "Sort Code / BSB" : "Routing Number (ABA)";
  const routingPlaceholder = isIndia ? "e.g. SBIN0001234" : isUK ? "e.g. 20-00-00" : isAustralia ? "e.g. 062-000" : "e.g. 021000021";
  // Account type options
  const accountTypeOptions: { value: string; label: string }[] = isChile
    ? [
        { value: "CHECKING", label: "Cuenta Corriente" },
        { value: "SAVINGS", label: "Cuenta de Ahorro" },
        { value: "CUENTA_VISTA", label: "Cuenta Vista" },
        { value: "CUENTA_RUT", label: "Cuenta RUT" },
      ]
    : isColombia
    ? [
        { value: "SAVINGS", label: "Cuenta de Ahorros" },
        { value: "CHECKING", label: "Cuenta Corriente" },
      ]
    : [
        { value: "CHECKING", label: "Checking" },
        { value: "SAVINGS", label: "Savings" },
      ];

  const effectiveBankName = showBankOther ? bankOther : wiseForm.bankName;

  const totalSteps = (needsStripe ? 1 : 0) + (needsWise ? 1 : 0) + (needsCadana ? 1 : 0);
  const currentStepNum = phase.startsWith("stripe") ? 1
    : phase.startsWith("wise") ? (needsStripe ? 2 : 1)
    : phase.startsWith("cadana") ? ((needsStripe ? 1 : 0) + (needsWise ? 1 : 0) + 1)
    : 1;

  // ─── Stripe Setup ─────────────────────────────────────────────────────
  const startStripeSetup = useCallback(async () => {
    setPhase("stripe_setup");
    setError(null);

    const popup = window.open("about:blank", "_blank");

    try {
      const { initContractorStripeSetup } = await import("@/app/actions/hriq/stripe");
      const result = await initContractorStripeSetup();
      if ("error" in result) {
        popup?.close();
        setError(result.error);
        setPhase("error");
        return;
      }
      setOnboardingUrl(result.onboardingUrl);
      if (popup && !popup.closed) {
        popup.location.href = result.onboardingUrl;
      } else {
        window.open(result.onboardingUrl, "_blank");
      }
      setPhase("stripe_waiting");
    } catch (err) {
      popup?.close();
      setError(err instanceof Error ? err.message : "Failed to start Stripe setup");
      setPhase("error");
    }
  }, []);

  // Poll for Stripe account activation
  useEffect(() => {
    if (phase !== "stripe_waiting") return;

    const poll = async () => {
      try {
        const { refreshContractorStripeStatus } = await import("@/app/actions/hriq/stripe");
        const result = await refreshContractorStripeStatus();
        if (!("error" in result)) {
          if (["verified", "restricted"].includes(result.status)) {
            if (pollRef.current) clearInterval(pollRef.current);
            setPhase("stripe_done");
            // After a brief pause, move to next step or complete
            setTimeout(() => {
              if (needsWise) {
                setPhase("wise_setup");
              } else if (needsCadana) {
                setPhase("cadana_setup");
              } else {
                setPhase("all_done");
                setTimeout(() => (window.location.href = "/" + orgSlug), 2000);
              }
            }, 2000);
          }
        }
      } catch {}
    };

    pollRef.current = setInterval(poll, 4000);
    poll();

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [phase, orgSlug, needsWise, needsCadana]);

  // Polling timeout
  useEffect(() => {
    if (phase !== "stripe_waiting") return;
    const timer = setTimeout(() => setPollTimeout(true), 120_000);
    return () => clearTimeout(timer);
  }, [phase]);

  // ─── Wise Setup ───────────────────────────────────────────────────────
  const handleWiseSave = useCallback(async () => {
    setPhase("wise_saving");
    setError(null);

    try {
      const { saveContractorWiseInfo } = await import("@/app/actions/hriq/wise-setup");

      if (wiseMode === "wise_tag") {
        const result = await saveContractorWiseInfo({
          currency: wiseForm.currency || "USD",
          accountHolderName: wiseForm.accountHolderName,
          bankName: "Wise",
          accountNumber: wiseTag,
          country: wiseForm.country || "",
          wiseTag: wiseTag,
        });
        if ("error" in result) {
          setError(result.error);
          setPhase("wise_setup");
          return;
        }
      } else {
        const finalBankName = wiseForm.bankName === "Other" ? bankOther : wiseForm.bankName;
        const result = await saveContractorWiseInfo({
          currency: wiseForm.currency,
          accountHolderName: wiseForm.accountHolderName,
          bankName: finalBankName,
          accountNumber: wiseForm.accountNumber,
          routingNumber: wiseForm.routingNumber || undefined,
          swiftCode: wiseForm.swiftCode || undefined,
          country: wiseForm.country,
          address: {
            streetAddress: wiseForm.streetAddress,
            city: wiseForm.city,
            state: wiseForm.state || undefined,
            postalCode: wiseForm.postalCode,
          },
          extraData: {
            ...(wiseForm.accountType ? { accountType: wiseForm.accountType } : {}),
            ...(wiseForm.rut ? { rut: wiseForm.rut } : {}),
            ...(wiseForm.idType ? { idType: wiseForm.idType } : {}),
            ...(wiseForm.idNumber ? { idNumber: wiseForm.idNumber } : {}),
            ...(wiseForm.phoneNumber ? { phoneNumber: wiseForm.phoneNumber } : {}),
          },
        });
        if ("error" in result) {
          setError(result.error);
          setPhase("wise_setup");
          return;
        }
      }

      setPhase("wise_done");
      setTimeout(() => {
        if (needsCadana) {
          setPhase("cadana_setup");
        } else {
          setPhase("all_done");
          setTimeout(() => (window.location.href = "/" + orgSlug), 2000);
        }
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save payment info");
      setPhase("wise_setup");
    }
  }, [wiseForm, wiseMode, wiseTag, orgSlug]);

  const updateWise = (field: string, value: string) => {
    setWiseForm((prev) => {
      const next = { ...prev, [field]: value };
      // Auto-set currency when country changes
      if (field === "country" && COUNTRY_CURRENCY[value]) {
        next.currency = COUNTRY_CURRENCY[value];
      }
      // Reset bank when country changes
      if (field === "country") {
        next.bankName = "";
        setBankOther("");
      }
      return next;
    });
  };

  // ─── Cadana Setup ─────────────────────────────────────────────────────
  // Reuses the same wiseForm state since Cadana needs the same banking fields
  const handleCadanaSave = useCallback(async () => {
    setPhase("cadana_saving");
    setError(null);

    try {
      const { saveContractorCadanaInfo } = await import("@/app/actions/hriq/cadana-setup");
      const finalBankName = wiseForm.bankName === "Other" ? bankOther : wiseForm.bankName;
      const result = await saveContractorCadanaInfo({
        currency: wiseForm.currency,
        accountHolderName: wiseForm.accountHolderName,
        bankName: finalBankName,
        accountNumber: wiseForm.accountNumber,
        routingNumber: wiseForm.routingNumber || undefined,
        swiftCode: wiseForm.swiftCode || undefined,
        country: wiseForm.country,
        address: {
          streetAddress: wiseForm.streetAddress,
          city: wiseForm.city,
          state: wiseForm.state || undefined,
          postalCode: wiseForm.postalCode,
        },
      });
      if ("error" in result) {
        setError(result.error);
        setPhase("cadana_setup");
        return;
      }
      setPhase("cadana_done");
      setTimeout(() => {
        setPhase("all_done");
        setTimeout(() => (window.location.href = "/" + orgSlug), 2000);
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save payment info");
      setPhase("cadana_setup");
    }
  }, [wiseForm, bankOther, orgSlug]);

  // ─── Render ───────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
      {/* Header */}
      <header
        className="w-full"
        style={{
          background:
            paymentMethod === "cor"
              ? "linear-gradient(135deg, #059669 0%, #047857 100%)"
              : paymentMethod === "both"
                ? "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)"
                : "linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)",
        }}
      >
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-6 py-5">
          <img src="/logo.png" alt="Remote Leverage" className="h-11 w-11 rounded-xl" />
          <div>
            <div className="text-[17px] font-bold tracking-wide text-white">Remote Leverage</div>
            <div className="text-xs font-medium text-white/70">Contractor Payment Setup</div>
          </div>
          {totalSteps > 1 && (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-white/50">Step {currentStepNum} of {totalSteps}</span>
            </div>
          )}
        </div>
      </header>

      {/* Main */}
      <main className="flex flex-1 items-start justify-center px-4 py-10">
        <div className="w-full max-w-xl">

          {/* ─── Overview ─── */}
          {phase === "overview" && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-white">
                  Welcome, {contractorName}!
                </h1>
                <p className="mt-2 text-sm text-white/50">
                  Before you can access the <strong className="text-white/80">{orgName}</strong> dashboard,
                  we need to set up how you'll receive payments.
                </p>
              </div>

              {/* Setup steps overview */}
              <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl p-5 shadow-lg space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-white/80">
                  Setup Steps
                </h2>
                <div className="space-y-3">
                  {needsStripe && (
                    <div className="flex items-start gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-xs font-bold text-violet-300">1</span>
                      <div>
                        <div className="text-sm font-medium text-white/80">Stripe Express Account</div>
                        <p className="text-xs text-white/50 mt-0.5">
                          Set up your Stripe account to receive direct payments. You'll need a government ID and bank details.
                        </p>
                      </div>
                    </div>
                  )}
                  {needsWise && (
                    <div className="flex items-start gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-300">
                        {needsStripe ? "2" : "1"}
                      </span>
                      <div>
                        <div className="text-sm font-medium text-white/80">Bank Details for Wise</div>
                        <p className="text-xs text-white/50 mt-0.5">
                          Provide your banking information so Remote Leverage can send you international payments via Wise.
                        </p>
                      </div>
                    </div>
                  )}
                  {needsCadana && (
                    <div className="flex items-start gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-500/20 text-xs font-bold text-orange-300">
                        {(needsStripe ? 1 : 0) + (needsWise ? 1 : 0) + 1}
                      </span>
                      <div>
                        <div className="text-sm font-medium text-white/80">Bank Details for Cadana</div>
                        <p className="text-xs text-white/50 mt-0.5">
                          Provide your banking information so Remote Leverage can send you international payroll via Cadana.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (needsStripe) {
                    startStripeSetup();
                  } else if (needsWise) {
                    setPhase("wise_setup");
                  } else if (needsCadana) {
                    setPhase("cadana_setup");
                  }
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl px-6 py-4 text-base font-bold text-white shadow-lg transition hover:shadow-xl"
                style={{
                  background: needsStripe
                    ? "linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)"
                    : needsCadana && !needsWise
                      ? "linear-gradient(135deg, #ea580c 0%, #c2410c 100%)"
                      : "linear-gradient(135deg, #059669 0%, #047857 100%)",
                }}
              >
                Get Started
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </button>

              <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 shadow-lg">
                <div className="flex items-start gap-3">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-blue-400 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <div>
                    <div className="text-sm font-medium text-white/80">Secure & Private</div>
                    <p className="mt-0.5 text-xs text-white/40">
                      {needsStripe
                        ? "Stripe handles your banking details directly — Remote Leverage never sees your account numbers."
                        : "Your payment information is encrypted and securely transmitted to our banking partner."
                      }
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ─── Stripe Setup (opening) ─── */}
          {phase === "stripe_setup" && (
            <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 text-center shadow-lg">
              <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-violet-400" />
              <h2 className="text-lg font-semibold text-white">Creating Your Stripe Account…</h2>
              <p className="mt-2 text-sm text-white/50">Setting up your payment account. A new tab will open shortly.</p>
            </div>
          )}

          {/* ─── Stripe Waiting (polling) ─── */}
          {phase === "stripe_waiting" && (
            <div className="space-y-6">
              <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 text-center shadow-lg">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-violet-500/15">
                  <svg className="h-8 w-8 animate-pulse text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-white">Complete Your Stripe Setup</h2>
                <p className="mt-2 text-sm text-white/50">
                  A Stripe setup window has been opened. Complete the onboarding there, then return here.
                </p>
                <div className="mt-6 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div className="h-full animate-pulse rounded-full" style={{ width: "50%", background: "linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)" }} />
                </div>

                <div className="mt-6 flex justify-center gap-3">
                  {onboardingUrl && (
                    <button type="button" onClick={() => window.open(onboardingUrl, "_blank")} className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-4 py-2 text-sm font-medium text-white/80 hover:bg-white/5">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                      Reopen Stripe Setup
                    </button>
                  )}
                  <button type="button" onClick={() => { setPhase("overview"); setOnboardingUrl(null); }} className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-4 py-2 text-sm font-medium text-white/80 hover:bg-white/5">
                    Start Over
                  </button>
                </div>

                {pollTimeout && (
                  <div className="mt-6 space-y-3">
                    <p className="text-xs text-white/40">
                      Taking longer than expected? If you've completed Stripe setup, try refreshing.
                    </p>
                    <button type="button" onClick={() => window.location.reload()} className="inline-flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-semibold text-white" style={{ background: "linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)" }}>
                      Refresh Page
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── Stripe Done ─── */}
          {phase === "stripe_done" && (
            <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 text-center shadow-lg">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15">
                <svg className="h-8 w-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-white">Stripe Account Ready!</h2>
              <p className="mt-2 text-sm text-white/60">
                {needsWise ? "Moving to Wise payment setup next..." : needsCadana ? "Moving to Cadana payment setup next..." : "Taking you to your dashboard..."}
              </p>
              <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full animate-pulse" style={{ width: "100%", background: "linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)" }} />
              </div>
            </div>
          )}

          {/* ─── Wise Setup (form) ─── */}
          {(phase === "wise_setup" || phase === "wise_saving") && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-white">Bank Details for Wise</h1>
                <p className="mt-2 text-sm text-white/50">
                  Provide your banking information so Remote Leverage can send you payments via Wise international transfers.
                </p>
              </div>

              {error && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
                  <p className="text-sm text-red-300">{error}</p>
                </div>
              )}

              {/* Pre-fill notice */}
              {(wisePrefill?.accountHolderName || wisePrefill?.bankName || wisePrefill?.accountNumber) && (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-300">
                  <strong>We pre-filled this form</strong> with information from your contractor profile. Please review and confirm everything is correct before saving.
                </div>
              )}

              {/* Mode toggle: Bank Account vs Wise Tag */}
              <div className="flex rounded-lg border border-white/10 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setWiseMode("bank_account")}
                  className={`flex-1 py-2.5 text-sm font-medium transition-colors ${wiseMode === "bank_account" ? "bg-emerald-600 text-white" : "bg-white/5 text-white/50 hover:text-white/80"}`}
                >
                  Bank Account
                </button>
                <button
                  type="button"
                  onClick={() => setWiseMode("wise_tag")}
                  className={`flex-1 py-2.5 text-sm font-medium transition-colors ${wiseMode === "wise_tag" ? "bg-emerald-600 text-white" : "bg-white/5 text-white/50 hover:text-white/80"}`}
                >
                  Wise Tag / Email
                </button>
              </div>

              {/* ── Wise Tag Mode (simple) ── */}
              {wiseMode === "wise_tag" && (
                <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl p-5 shadow-lg space-y-4">
                  <div>
                    <label className="text-xs font-medium text-white/60">Your Name *</label>
                    <input
                      value={wiseForm.accountHolderName}
                      onChange={(e) => updateWise("accountHolderName", e.target.value)}
                      placeholder="Gabriel Rocha"
                      className="mt-1 flex h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/30 focus:border-emerald-500/50 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-white/60">Wise Tag (starts with @) *</label>
                    <input
                      value={wiseTag}
                      onChange={(e) => setWiseTag(e.target.value)}
                      placeholder="@yourusername"
                      className="mt-1 flex h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/30 focus:border-emerald-500/50 focus:outline-none"
                    />
                    <p className="mt-1 text-xs text-white/30">Find your Wise tag in the Wise app under your profile. It looks like @yourusername</p>
                  </div>
                </div>
              )}

              {/* ── Bank Account Mode (full form) ── */}
              {wiseMode === "bank_account" && (
              <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl p-5 shadow-lg space-y-4">
                {/* Row 1: Name + Currency */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-white/60">Full Name (as on bank account) *</label>
                    <input
                      value={wiseForm.accountHolderName}
                      onChange={(e) => updateWise("accountHolderName", e.target.value)}
                      placeholder="John Doe"
                      className="mt-1 flex h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/30 focus:border-emerald-500/50 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-white/60">Preferred Currency *</label>
                    <GateSelect
                      value={wiseForm.currency}
                      onChange={(v) => updateWise("currency", v)}
                      placeholder="Select currency..."
                      options={[
                        { value: "USD", label: "USD — US Dollar" },
                        { value: "PHP", label: "PHP — Philippine Peso" },
                        { value: "CLP", label: "CLP — Chilean Peso" },
                        { value: "COP", label: "COP — Colombian Peso" },
                        { value: "MXN", label: "MXN — Mexican Peso" },
                        { value: "BRL", label: "BRL — Brazilian Real" },
                        { value: "EUR", label: "EUR — Euro" },
                        { value: "GBP", label: "GBP — British Pound" },
                        { value: "CAD", label: "CAD — Canadian Dollar" },
                        { value: "AUD", label: "AUD — Australian Dollar" },
                        { value: "INR", label: "INR — Indian Rupee" },
                        { value: "NGN", label: "NGN — Nigerian Naira" },
                        { value: "KES", label: "KES — Kenyan Shilling" },
                        { value: "PEN", label: "PEN — Peruvian Sol" },
                        { value: "PKR", label: "PKR — Pakistani Rupee" },
                        { value: "UAH", label: "UAH — Ukrainian Hryvnia" },
                      ]}
                    />
                  </div>
                </div>

                {/* Row 2: Country (dropdown) + Bank (dropdown or text) */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-white/60">Country *</label>
                    <GateSelect
                      value={wiseForm.country}
                      onChange={(v) => updateWise("country", v)}
                      placeholder="Select country..."
                      options={COUNTRY_OPTIONS.map((c) => ({ value: c.value, label: c.label }))}
                      searchable
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-white/60">Bank Name *</label>
                    {bankIsDropdown ? (
                      <>
                        <GateSelect
                          value={wiseForm.bankName}
                          onChange={(v) => updateWise("bankName", v)}
                          placeholder="Select bank..."
                          options={availableBanks.map((b) => ({ value: b, label: b }))}
                          searchable
                        />
                        {showBankOther && (
                          <input
                            value={bankOther}
                            onChange={(e) => setBankOther(e.target.value)}
                            placeholder="Enter bank name"
                            className="mt-2 flex h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/30 focus:border-emerald-500/50 focus:outline-none"
                          />
                        )}
                      </>
                    ) : (
                      <input
                        value={wiseForm.bankName}
                        onChange={(e) => updateWise("bankName", e.target.value)}
                        placeholder="e.g. BDO Unibank"
                        className="mt-1 flex h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/30 focus:border-emerald-500/50 focus:outline-none"
                      />
                    )}
                  </div>
                </div>

                {/* Account Number / IBAN / CLABE */}
                <div>
                  <label className="text-xs font-medium text-white/60">{accountNumberLabel}</label>
                  <input
                    value={wiseForm.accountNumber}
                    onChange={(e) => updateWise("accountNumber", e.target.value)}
                    placeholder={accountNumberPlaceholder}
                    className="mt-1 flex h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/30 focus:border-emerald-500/50 focus:outline-none"
                  />
                  {isMexico && (
                    <p className="mt-1 text-[11px] text-white/40">Your CLABE is an 18-digit number provided by your bank — not your card number.</p>
                  )}
                </div>

                {/* Account Type — Chile / Colombia / US */}
                {showAccountType && (
                  <div>
                    <label className="text-xs font-medium text-white/60">Account Type *</label>
                    <GateSelect
                      value={wiseForm.accountType}
                      onChange={(v) => updateWise("accountType", v)}
                      placeholder="Select type..."
                      options={accountTypeOptions}
                    />
                  </div>
                )}

                {/* RUT — Chile only */}
                {showRut && (
                  <div>
                    <label className="text-xs font-medium text-white/60">RUT (Chilean Tax ID) *</label>
                    <input
                      value={wiseForm.rut}
                      onChange={(e) => updateWise("rut", e.target.value)}
                      placeholder="e.g. 12.345.678-9"
                      className="mt-1 flex h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/30 focus:border-emerald-500/50 focus:outline-none"
                    />
                    <p className="mt-1 text-[11px] text-white/40">Your RUT is your Chilean national tax ID (Rol Único Tributario). Do not enter your card number here.</p>
                  </div>
                )}

                {/* National ID — Colombia */}
                {showNationalId && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-medium text-white/60">ID Type *</label>
                      <GateSelect
                        value={wiseForm.idType}
                        onChange={(v) => updateWise("idType", v)}
                        options={[
                          { value: "CC", label: "Cédula de Ciudadanía (CC)" },
                          { value: "CE", label: "Cédula de Extranjería (CE)" },
                          { value: "PASSPORT", label: "Passport" },
                          { value: "NIT", label: "NIT" },
                        ]}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-white/60">ID Number *</label>
                      <input
                        value={wiseForm.idNumber}
                        onChange={(e) => updateWise("idNumber", e.target.value)}
                        placeholder="ID number"
                        className="mt-1 flex h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/30 focus:border-emerald-500/50 focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                {/* Phone — Chile / Colombia */}
                {showPhone && (
                  <div>
                    <label className="text-xs font-medium text-white/60">Mobile Number *</label>
                    <input
                      value={wiseForm.phoneNumber}
                      onChange={(e) => updateWise("phoneNumber", e.target.value)}
                      placeholder={isChile ? "+56 9 1234 5678" : "+57 300 123 4567"}
                      className="mt-1 flex h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/30 focus:border-emerald-500/50 focus:outline-none"
                    />
                  </div>
                )}

                {/* Routing / Sort Code / IFSC — US / UK / AU / IN */}
                {showRoutingField && (
                  <div>
                    <label className="text-xs font-medium text-white/60">{routingLabel}</label>
                    <input
                      value={wiseForm.routingNumber}
                      onChange={(e) => updateWise("routingNumber", e.target.value)}
                      placeholder={routingPlaceholder}
                      className="mt-1 flex h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/30 focus:border-emerald-500/50 focus:outline-none"
                    />
                  </div>
                )}

                {/* SWIFT / BIC — shown for countries that use it (not CL/CO/PH/MX/US) */}
                {!isChile && !isColombia && !isPhilippines && !isMexico && !isUS && (
                  <div>
                    <label className="text-xs font-medium text-white/60">SWIFT / BIC Code {usesIBAN ? "*" : "(optional)"}</label>
                    <input
                      value={wiseForm.swiftCode}
                      onChange={(e) => updateWise("swiftCode", e.target.value)}
                      placeholder="e.g. BCHICLRM"
                      className="mt-1 flex h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/30 focus:border-emerald-500/50 focus:outline-none"
                    />
                  </div>
                )}

                {/* Address — required by Wise for all recipient types */}
                <div className="mt-2 border-t border-white/10 pt-4">
                  <p className="mb-3 text-xs font-medium text-white/60">Recipient Address (required by Wise)</p>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium text-white/60">Street Address *</label>
                      <input
                        value={wiseForm.streetAddress}
                        onChange={(e) => updateWise("streetAddress", e.target.value)}
                        placeholder="e.g. 123 Main Street, Apt 4B"
                        className="mt-1 flex h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/30 focus:border-emerald-500/50 focus:outline-none"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-medium text-white/60">City *</label>
                        <input
                          value={wiseForm.city}
                          onChange={(e) => updateWise("city", e.target.value)}
                          placeholder="City"
                          className="mt-1 flex h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/30 focus:border-emerald-500/50 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-white/60">{isUS ? "State *" : "State / Province"}</label>
                        <input
                          value={wiseForm.state}
                          onChange={(e) => updateWise("state", e.target.value)}
                          placeholder={isUS ? "e.g. NY" : "State or province"}
                          className="mt-1 flex h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/30 focus:border-emerald-500/50 focus:outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-white/60">Postal / ZIP Code *</label>
                      <input
                        value={wiseForm.postalCode}
                        onChange={(e) => updateWise("postalCode", e.target.value)}
                        placeholder="e.g. 10001"
                        className="mt-1 flex h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/30 focus:border-emerald-500/50 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>
              )}

              <button
                type="button"
                onClick={handleWiseSave}
                disabled={
                  phase === "wise_saving" ||
                  !wiseForm.accountHolderName ||
                  (wiseMode === "wise_tag"
                    ? !wiseTag?.trim().startsWith("@")
                    : (
                      !wiseForm.currency ||
                      !(wiseForm.bankName === "Other" ? bankOther : wiseForm.bankName) ||
                      !wiseForm.accountNumber ||
                      !wiseForm.country ||
                      !wiseForm.streetAddress ||
                      !wiseForm.city ||
                      !wiseForm.postalCode ||
                      (isUS && !wiseForm.state) ||
                      (showAccountType && !wiseForm.accountType) ||
                      (showRut && !wiseForm.rut) ||
                      (showNationalId && !wiseForm.idNumber) ||
                      (showPhone && !wiseForm.phoneNumber)
                    ))
                }
                className="flex w-full items-center justify-center gap-2 rounded-xl px-6 py-4 text-base font-bold text-white shadow-lg transition hover:shadow-xl disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #059669 0%, #047857 100%)" }}
              >
                {phase === "wise_saving" ? (
                  <>
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Saving...
                  </>
                ) : (
                  <>
                    Save Payment Details
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </>
                )}
              </button>

              <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 shadow-lg">
                <div className="flex items-start gap-3">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-emerald-400 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <div>
                    <div className="text-sm font-medium text-white/80">Powered by Wise</div>
                    <p className="mt-0.5 text-xs text-white/40">
                      Wise handles international transfers with low fees and real exchange rates. Your details are encrypted and securely stored.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ─── Wise Done ─── */}
          {phase === "wise_done" && (
            <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 text-center shadow-lg">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15">
                <svg className="h-8 w-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-white">Wise Payment Details Saved!</h2>
              <p className="mt-2 text-sm text-white/60">{needsCadana ? "Moving to Cadana payment setup next..." : "Setting up your dashboard..."}</p>
            </div>
          )}

          {/* ─── Cadana Setup (form) ─── */}
          {(phase === "cadana_setup" || phase === "cadana_saving") && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-white">Cadana Payment Setup</h2>
                <p className="text-sm text-white/60 mt-1">
                  Enter your banking information to receive international payroll payments via Cadana.
                </p>
              </div>

              {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
                  <p className="text-sm text-red-300">{error}</p>
                </div>
              )}

              <div className="space-y-4 rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl p-6">
                <div>
                  <label className="mb-1 block text-xs font-medium text-white/60">Country *</label>
                  <GateSelect
                    value={wiseForm.country}
                    onChange={(v) => updateWise("country", v)}
                    options={COUNTRY_OPTIONS.map((c) => ({ value: c.value, label: c.label }))}
                    placeholder="Select your country..."
                    searchable
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-white/60">Currency *</label>
                  <input value={wiseForm.currency} onChange={(e) => updateWise("currency", e.target.value)} className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/30 focus:border-orange-500/50 focus:outline-none" placeholder="USD" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-white/60">Account Holder Name *</label>
                  <input value={wiseForm.accountHolderName} onChange={(e) => updateWise("accountHolderName", e.target.value)} className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/30 focus:border-orange-500/50 focus:outline-none" placeholder="Full legal name" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-white/60">Bank Name *</label>
                  {availableBanks.length > 0 ? (
                    <>
                      <GateSelect value={wiseForm.bankName} onChange={(v) => updateWise("bankName", v)} options={availableBanks.map((b) => ({ value: b, label: b }))} placeholder="Select bank..." />
                      {showBankOther && <input value={bankOther} onChange={(e) => setBankOther(e.target.value)} className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/30 focus:border-orange-500/50 focus:outline-none" placeholder="Enter bank name" />}
                    </>
                  ) : (
                    <input value={wiseForm.bankName} onChange={(e) => updateWise("bankName", e.target.value)} className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/30 focus:border-orange-500/50 focus:outline-none" placeholder="e.g. HSBC, Standard Chartered" />
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-white/60">Account Number *</label>
                  <input value={wiseForm.accountNumber} onChange={(e) => updateWise("accountNumber", e.target.value)} className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/30 focus:border-orange-500/50 focus:outline-none" placeholder="Account number or IBAN" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-white/60">Routing Number</label>
                    <input value={wiseForm.routingNumber} onChange={(e) => updateWise("routingNumber", e.target.value)} className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/30 focus:border-orange-500/50 focus:outline-none" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-white/60">SWIFT / BIC</label>
                    <input value={wiseForm.swiftCode} onChange={(e) => updateWise("swiftCode", e.target.value)} className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/30 focus:border-orange-500/50 focus:outline-none" />
                  </div>
                </div>

                {/* Address section */}
                <div className="mt-4 border-t border-white/10 pt-4 space-y-3">
                  <p className="mb-3 text-xs font-medium text-white/60">Recipient Address</p>
                  <input value={wiseForm.streetAddress} onChange={(e) => updateWise("streetAddress", e.target.value)} className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/30 focus:border-orange-500/50 focus:outline-none" placeholder="Street address" />
                  <div className="grid grid-cols-2 gap-3">
                    <input value={wiseForm.city} onChange={(e) => updateWise("city", e.target.value)} className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/30 focus:border-orange-500/50 focus:outline-none" placeholder="City" />
                    <input value={wiseForm.state} onChange={(e) => updateWise("state", e.target.value)} className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/30 focus:border-orange-500/50 focus:outline-none" placeholder="State / Province" />
                  </div>
                  <input value={wiseForm.postalCode} onChange={(e) => updateWise("postalCode", e.target.value)} className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/30 focus:border-orange-500/50 focus:outline-none" placeholder="Postal / ZIP code" />
                </div>
              </div>

              <button
                type="button"
                onClick={handleCadanaSave}
                disabled={phase === "cadana_saving" || !wiseForm.country || !wiseForm.currency || !wiseForm.accountHolderName || !effectiveBankName || !wiseForm.accountNumber}
                className="flex w-full items-center justify-center gap-2 rounded-xl px-6 py-4 text-base font-bold text-white shadow-lg transition hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: "linear-gradient(135deg, #ea580c 0%, #c2410c 100%)" }}
              >
                {phase === "cadana_saving" ? (
                  <>
                    <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    Saving...
                  </>
                ) : "Save Cadana Payment Details"}
              </button>
            </div>
          )}

          {/* ─── Cadana Done ─── */}
          {phase === "cadana_done" && (
            <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 text-center shadow-lg">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-500/15">
                <svg className="h-8 w-8 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-white">Cadana Payment Details Saved!</h2>
              <p className="mt-2 text-sm text-white/60">Setting up your dashboard...</p>
            </div>
          )}

          {/* ─── All Done ─── */}
          {phase === "all_done" && (
            <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 text-center shadow-lg">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15">
                <svg className="h-8 w-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-white">All Set!</h2>
              <p className="mt-2 text-sm text-white/60">
                Your payment setup is complete. Taking you to the <strong className="text-white/80">{orgName}</strong> dashboard...
              </p>
              <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full animate-pulse" style={{ width: "100%", background: "linear-gradient(135deg, #059669 0%, #047857 100%)" }} />
              </div>
            </div>
          )}

          {/* ─── Error ─── */}
          {phase === "error" && (
            <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 text-center shadow-lg">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/15">
                <svg className="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-white">Setup Issue</h2>
              <p className="mt-2 text-sm text-white/50">{error || "Something went wrong."}</p>
              <div className="mt-4 flex justify-center gap-3">
                <button type="button" onClick={() => { setError(null); setPhase("overview"); }} className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-white shadow" style={{ background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)" }}>
                  Try Again
                </button>
              </div>
              <p className="mt-4 text-xs text-white/40">
                If the issue persists, contact your Remote Leverage coordinator for assistance.
              </p>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-transparent px-6 py-4">
        <div className="mx-auto max-w-2xl text-center text-[11px] text-white/40">
          &copy; {new Date().getFullYear()} Remote Leverage LLC &middot; Payments powered by{" "}
          {needsStripe && <a href="https://stripe.com" target="_blank" rel="noopener noreferrer" className="underline">Stripe</a>}
          {needsStripe && (needsWise || needsCadana) && " & "}
          {needsWise && <a href="https://wise.com" target="_blank" rel="noopener noreferrer" className="underline">Wise</a>}
          {needsWise && needsCadana && " & "}
          {needsCadana && <a href="https://cadana.com" target="_blank" rel="noopener noreferrer" className="underline">Cadana</a>}
        </div>
      </footer>
    </div>
  );
}
