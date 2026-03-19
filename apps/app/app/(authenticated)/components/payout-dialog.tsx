"use client";

import { useErrorDialog } from "@/app/(authenticated)/components/error-dialog";
import { CustomSelect } from "@/app/(authenticated)/components/custom-select";
import { getContractorPayoutInfo, processContractorPayout } from "@/app/actions/hriq/payouts";
import { previewWisePayout, executeWisePayout } from "@/app/actions/hriq/wise-payouts";
import { previewCadanaPayout, executeCadanaPayout } from "@/app/actions/hriq/cadana-payouts";
import { useEffect, useState, useTransition, useCallback, useMemo } from "react";

type PayoutInfoRaw = Awaited<ReturnType<typeof getContractorPayoutInfo>>;
type PayoutInfo = Exclude<PayoutInfoRaw, { error: string }>;
type WisePreview = Awaited<ReturnType<typeof previewWisePayout>> | null;
type CadanaPreview = Awaited<ReturnType<typeof previewCadanaPayout>> | null;

const LABEL: Record<string, string> = {
 stripe_connect: "Stripe Connect", wise: "Wise", cadana: "Cadana",
};

export function PayoutDialog({
 paymentId,
 onClose,
 managementToken = "",
}: {
 paymentId: string;
 onClose: () => void;
 managementToken?: string;
}) {
 const [isPending, startTransition] = useTransition();
 const { showError, showSuccess } = useErrorDialog();

 const [initializing, setInitializing] = useState(true);
 const [info, setInfo] = useState<PayoutInfo | null>(null);

 const [view, setView] = useState<"review" | "select" | "confirm">("review");
 const [provider, setProvider] = useState("wise");
 const [reference, setReference] = useState("");
 const [notes, setNotes] = useState("");

 const [wisePreview, setWisePreview] = useState<WisePreview>(null);
 const [wiseLoading, setWiseLoading] = useState(false);
 const [wiseCurrency, setWiseCurrency] = useState("");
 const [cadanaPreview, setCadanaPreview] = useState<CadanaPreview>(null);
 const [autoMode, setAutoMode] = useState(true);

 const emp = info?.employee;
 const amount = info ? Number(info.amount) : 0;
 const fmtMoney = (n: number | undefined | null) => `$${(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
 const safeFixed = (n: number | undefined | null, d: number) => (n ?? 0).toFixed(d);
 const safeFmtNum = (n: number | undefined | null) => (n ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 });

 const isStripe = provider === "stripe_connect" && !!emp?.stripeAccountId;
 const isWiseAuto = provider === "wise" && autoMode && !!wisePreview?.hasWiseRecipient;
 const isCadanaAuto = provider === "cadana" && autoMode && !!cadanaPreview && !("error" in cadanaPreview) && cadanaPreview.canAutomate;
 const isAutoProvider = isStripe || isWiseAuto || isCadanaAuto;

 // Is this a manual payment (user sends money externally and records ref)?
 const isManual = !isAutoProvider && view !== "select";

 // Provider was intended to be auto but can't
 const wiseIntendedAutoButCant = provider === "wise" && autoMode && wisePreview && !wisePreview.hasWiseRecipient;
 const cadanaIntendedAutoButCant = provider === "cadana" && autoMode && cadanaPreview && !("error" in cadanaPreview) && !cadanaPreview.canAutomate;
 const cadanaHasError = provider === "cadana" && cadanaPreview && "error" in cadanaPreview;

 // ─── Init: load info + auto-preview (no flash) ─────────────────────────────
 useEffect(() => {
  setInitializing(true);
  getContractorPayoutInfo(paymentId)
   .then(async (data) => {
    if ("error" in data) return;
    setInfo(data as PayoutInfo);
    const preferred: string | null = (data as any).employee?.preferredPaymentMethod;

    if (preferred === "cadana") {
     setProvider("cadana");
     try { setCadanaPreview(await previewCadanaPayout(paymentId)); } catch {}
     setView("review");
    } else if (preferred === "wise") {
     setProvider("wise");
     try { setWisePreview(await previewWisePayout(paymentId)); } catch {}
     setView("review");
    } else if ((data as any).employee?.stripeAccountId) {
     setProvider("stripe_connect");
     setView("review");
    } else {
     setView("select");
    }
   })
   .catch((err) => {
    showError({ title: "Error", message: err.message || "Failed to load payment details." });
    onClose();
   })
   .finally(() => setInitializing(false));
 }, [paymentId]);

 // ─── Confirm ───────────────────────────────────────────────────────────────
 const handleConfirm = useCallback(async () => {
  const tokenToUse = managementToken;

  startTransition(async () => {
   try {
    if (isStripe) {
     const { processStripeConnectPayout } = await import("@/app/actions/hriq/payouts");
     const result = await processStripeConnectPayout({ paymentId, notes: notes.trim() || undefined, managementPassword: tokenToUse });
     if ("error" in result) { showError({ title: "Payment Failed", message: result.error ?? "An unexpected error occurred" }); return; }
     showSuccess(`Payment sent via Stripe Connect! Transfer ${result.transferId} — ${fmtMoney(amount)} to ${emp?.legalFirstName} ${emp?.legalLastName}.`);
     onClose(); return;
    }
    if (isWiseAuto) {
     const result = await executeWisePayout({ paymentId, targetCurrency: wisePreview?.targetCurrency ?? "CLP", notes: notes.trim() || undefined, managementPassword: tokenToUse });
     if ("error" in result) { showError({ title: "Payment Failed", message: result.error ?? "An unexpected error occurred" }); return; }
     const fmtTarget = safeFmtNum(result?.targetAmount);
     if (result.dryRun) {
      showSuccess(`[DRY RUN] Wise test: ${fmtTarget} ${result.targetCurrency} at ${safeFixed(result?.exchangeRate, 4)}. Transfer #${result.wiseTransferId} (not funded).`);
     } else {
      showSuccess(`Payment sent via Wise! ${fmtTarget} ${result.targetCurrency} at ${safeFixed(result?.exchangeRate, 4)}. Transfer #${result.wiseTransferId}.`);
     }
     onClose(); return;
    }
    if (isCadanaAuto) {
     const result = await executeCadanaPayout({ paymentId, notes: notes.trim() || undefined, managementPassword: tokenToUse });
     if ("error" in result) { showError({ title: "Payment Failed", message: result.error ?? "An unexpected error occurred" }); return; }
     if (result.dryRun) {
      showSuccess(`[DRY RUN] Cadana test: ${fmtMoney(amount)} to ${emp?.legalFirstName} ${emp?.legalLastName}. Not sent.`);
     } else {
      showSuccess(`Payment sent via Cadana! Payroll ${(result as any).cadanaPayrollId} — ${fmtMoney(amount)} ${info?.currency} to ${emp?.legalFirstName} ${emp?.legalLastName}.`);
     }
     onClose(); return;
    }
    // Manual flow
    const result = await processContractorPayout({ paymentId, provider, reference: reference.trim(), notes: notes.trim() || undefined, managementPassword: tokenToUse });
    if ("error" in result) { showError({ title: "Payment Failed", message: result.error ?? "An unexpected error occurred" }); return; }
    showSuccess(`Payment recorded! Invoice ${result.invoiceNumber} generated and sent.`);
    onClose();
   } catch (err: any) {
    showError({ title: "Payment Failed", message: err.message || "Something went wrong." });
   }
  });
 }, [isStripe, isWiseAuto, isCadanaAuto, provider, reference, notes, paymentId, amount, wisePreview, info, managementToken]);

 const handleContinue = () => {
  if (isAutoProvider) { setView("confirm"); return; }
  if (provider === "stripe_connect" && !emp?.stripeAccountId) {
   showError({ title: "Not set up", message: "This contractor hasn't connected a Stripe account yet." }); return;
  }
  if (!reference.trim()) {
   showError({ title: "Reference required", message: `Enter the ${LABEL[provider] ?? "payment"} reference or transaction number from the transfer you sent.` }); return;
  }
  setView("confirm");
 };

 const handleChangeMethod = () => {
  setAutoMode(false);
  setView("select");
 };

 const bankDetails = useMemo(() => emp ? [
  emp.bankName && { label: "Bank", value: emp.bankName },
  emp.bankAccountName && { label: "Account Name", value: emp.bankAccountName },
  emp.bankAccountNumber && { label: "Account Number", value: maskLast4(emp.bankAccountNumber) },
  emp.bankRoutingNumber && { label: "Routing / Sort Code", value: emp.bankRoutingNumber },
  (emp as any).bankSwiftCode && { label: "SWIFT", value: (emp as any).bankSwiftCode },
  emp.country && { label: "Country", value: emp.country },
  emp.personalEmail && { label: "Email", value: emp.personalEmail },
 ].filter(Boolean) as { label: string; value: string }[] : [], [emp]);

 return (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in duration-150">
   <div className="w-full max-w-lg rounded-2xl border bg-card shadow-2xl max-h-[90vh] overflow-y-auto relative" onClick={(e) => e.stopPropagation()}>

    {/* Full-dialog processing overlay */}
    {isPending && view === "confirm" && (
     <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-background/90 backdrop-blur-sm rounded-2xl">
      <img src="/logo.png" alt="Processing" width={48} height={48} className="animate-spin-slow rounded-md" />
      <p className="mt-4 text-base font-semibold text-foreground">
       {isStripe ? "Sending via Stripe…" : isWiseAuto ? "Sending via Wise…" : isCadanaAuto ? "Sending via Cadana…" : "Recording payment…"}
      </p>
      <p className="text-sm text-muted-foreground mt-1">This may take a few seconds</p>
     </div>
    )}

    {/* Full-dialog loading overlay */}
    {wiseLoading && view === "review" && (
     <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-background/90 backdrop-blur-sm rounded-2xl">
      <img src="/logo.png" alt="Loading" width={40} height={40} className="animate-spin-slow rounded-md" />
      <p className="mt-3 text-sm font-medium text-muted-foreground">Getting payment details…</p>
     </div>
    )}

    {/* Header */}
    <div className="flex items-center justify-between border-b px-6 py-4">
     <div>
      <h2 className="text-lg font-semibold">Pay Contractor</h2>
      {emp && <p className="text-sm text-muted-foreground">{emp.legalFirstName} {emp.legalLastName} · {fmtMoney(amount)} {info?.currency}</p>}
     </div>
     <button onClick={onClose} className="h-8 w-8 rounded-full text-muted-foreground hover:bg-accent flex items-center justify-center text-lg">×</button>
    </div>

    {/* Loading */}
    {initializing && (
     <div className="flex items-center justify-center p-16">
      <img src="/logo.png" alt="Loading" width={28} height={28} className="animate-spin-slow rounded-md" />
     </div>
    )}

    {/* ─── Select Method ─────────────────────────────────────────────────── */}
    {!initializing && view === "select" && (() => {
     const hasWiseRecipient = !!(emp as any)?.wiseRecipientId;
     const hasWiseTag = !!(emp as any)?.wiseTag;
     const wiseReady = hasWiseRecipient || hasWiseTag;
     const hasCadana = !!(emp as any)?.cadanaPersonId;
     const hasBankInfo = !!(emp?.bankAccountNumber || emp?.bankName);
     const nothingConfigured = !wiseReady && !hasCadana && !hasBankInfo;

     return (
      <div className="space-y-3 p-6">
       <p className="text-sm text-muted-foreground">Choose how to pay this contractor:</p>

       {/* Stripe — only if connected */}
       {emp?.stripeAccountId && (
        <button onClick={() => { setProvider("stripe_connect"); setAutoMode(true); setView("review"); }}
         className="w-full flex items-center gap-3 rounded-xl border p-3.5 text-left hover:bg-violet-50/50 dark:hover:bg-violet-950/20 transition-colors">
         <div className="h-8 w-8 rounded-full bg-violet-100 dark:bg-violet-900 flex items-center justify-center text-violet-700 dark:text-violet-300 text-xs font-bold">S</div>
         <div><div className="text-sm font-medium">Stripe Connect</div><div className="text-xs text-muted-foreground">Direct transfer</div></div>
        </button>
       )}

       {/* Wise */}
       <button onClick={() => {
        setProvider("wise"); setAutoMode(true); setWiseLoading(true);
        previewWisePayout(paymentId).then(p => setWisePreview(p)).catch(() => {}).finally(() => { setWiseLoading(false); setView("review"); });
       }}
        className="w-full flex items-center gap-3 rounded-xl border p-3.5 text-left hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 transition-colors">
        <div className="h-8 w-8 rounded-full bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center text-emerald-700 dark:text-emerald-300 text-xs font-bold">W</div>
        <div className="flex-1">
         <div className="text-sm font-medium">Wise</div>
         <div className="text-xs text-muted-foreground">{wiseReady ? (hasWiseTag && !hasWiseRecipient ? `Wise tag: ${(emp as any).wiseTag} — auto-send` : "Recipient configured — auto-send") : "Send manually → enter reference"}</div>
        </div>
        {wiseReady && <span className="rounded-full bg-emerald-100 dark:bg-emerald-900 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">Auto</span>}
       </button>

       {/* Cadana */}
       <button onClick={() => {
        setProvider("cadana"); setAutoMode(true);
        previewCadanaPayout(paymentId).then(p => setCadanaPreview(p)).catch(() => {}).finally(() => setView("review"));
       }}
        className="w-full flex items-center gap-3 rounded-xl border p-3.5 text-left hover:bg-sky-50/50 dark:hover:bg-sky-950/20 transition-colors">
        <div className="h-8 w-8 rounded-full bg-sky-100 dark:bg-sky-900 flex items-center justify-center text-sky-700 dark:text-sky-300 text-xs font-bold">C</div>
        <div className="flex-1">
         <div className="text-sm font-medium">Cadana</div>
         <div className="text-xs text-muted-foreground">{hasCadana ? "Account linked — auto-send" : "Send manually → enter reference"}</div>
        </div>
        {hasCadana && <span className="rounded-full bg-sky-100 dark:bg-sky-900 px-2 py-0.5 text-[10px] font-medium text-sky-700 dark:text-sky-300">Auto</span>}
       </button>

       {/* Warning if no bank info at all */}
       {nothingConfigured && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-800 dark:bg-amber-950/30">
         <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">No payment info on file</p>
         <p className="text-xs text-amber-800 dark:text-amber-300 mt-1">
          No payment method configured. You can still pay them manually and record the reference here.
         </p>
        </div>
       )}
      </div>
     );
    })()}

    {/* ─── Review & Pay ──────────────────────────────────────────────────── */}
    {!initializing && view === "review" && (
     <div className="space-y-4 p-6">
      {/* Summary card */}
      <div className="rounded-xl border bg-muted/30 p-4 space-y-2">
       <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Amount</span>
        <span className="text-xl font-bold tabular-nums">{fmtMoney(amount)} {info?.currency}</span>
       </div>
       <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>Method</span>
        <span className="flex items-center gap-1.5">
         {LABEL[provider] ?? provider}
         {isAutoProvider && <span className="rounded-full bg-emerald-100 dark:bg-emerald-900 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700 dark:text-emerald-300 uppercase">Auto</span>}
         {isManual && !initializing && <span className="rounded-full bg-orange-100 dark:bg-orange-900 px-1.5 py-0.5 text-[9px] font-semibold text-orange-700 dark:text-orange-300 uppercase">Manual</span>}
         <button type="button" onClick={handleChangeMethod} className="text-[10px] underline text-muted-foreground hover:text-foreground">change</button>
        </span>
       </div>
       {info?.periodStart && info?.periodEnd && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
         <span>Period</span><span>{fmtDate(info.periodStart)} – {fmtDate(info.periodEnd)}</span>
        </div>
       )}
       {info?.hoursWorked && info?.hourlyRate && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
         <span>Hours × Rate</span><span>{info.hoursWorked}h × ${Number(info.hourlyRate).toFixed(2)}/hr</span>
        </div>
       )}
      </div>

      {/* ── Stripe ──────────────────────────────────────────────────────── */}
      {isStripe && (
       <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-4 space-y-2 dark:border-violet-800 dark:bg-violet-950/30">
        <span className="inline-flex rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-semibold text-violet-800 dark:bg-violet-900 dark:text-violet-200">Stripe Connect</span>
        <div className="flex justify-between text-sm"><span className="text-muted-foreground">Account</span><span className="font-mono text-xs">{emp?.stripeAccountId}</span></div>
       </div>
      )}

      {/* ── Wise Auto ───────────────────────────────────────────────────── */}
      {provider === "wise" && autoMode && wisePreview?.hasWiseRecipient && (
       <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-2 dark:border-emerald-800 dark:bg-emerald-950/30">
        <div className="flex items-center gap-2">
         <span className="text-xs text-muted-foreground">Send as</span>
         <CustomSelect value={wiseCurrency || ""} onValueChange={setWiseCurrency}
          triggerClassName="h-7 flex-1 text-xs"
          placeholder={`Default (${wisePreview?.targetCurrency})`}
          options={[
            { value: "", label: `Default (${wisePreview?.targetCurrency})` },
            ...["USD","CLP","COP","PHP","MXN","BRL","EUR","GBP","CAD","AUD","INR","NGN","KES","PEN","PKR","UAH"].map(c => ({ value: c, label: c })),
          ]}
         />
         <button type="button" disabled={wiseLoading}
          onClick={() => { setWiseLoading(true); previewWisePayout(paymentId, wiseCurrency || undefined).then(p => setWisePreview(p)).catch(() => {}).finally(() => setWiseLoading(false)); }}
          className="h-7 rounded-md bg-emerald-600 px-3 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50">
          {wiseLoading ? "..." : "Recalc"}
         </button>
        </div>
        {wisePreview?.targetCurrency !== "USD" && (
         <div className="flex justify-between text-sm"><span className="text-muted-foreground">Rate</span><span className="font-mono">1 USD = {safeFixed(wisePreview?.exchangeRate, 4)} {wisePreview?.targetCurrency}</span></div>
        )}
        <div className="flex justify-between text-sm"><span className="text-muted-foreground">Contractor Pay</span><span className="font-mono">{fmtMoney(amount)} USD</span></div>
        <div className="flex justify-between text-sm"><span className="text-muted-foreground">Wise Fee <span className="text-[10px] text-emerald-600 dark:text-emerald-400">(RL absorbs)</span></span><span className="font-mono">{fmtMoney(wisePreview?.fee)}</span></div>
        <div className="flex justify-between text-sm border-t pt-2"><span className="text-muted-foreground font-medium">Total from Balance</span><span className="font-mono font-bold">{fmtMoney(amount + (wisePreview?.fee ?? 0))} USD</span></div>
        {wisePreview?.estimatedDelivery && (
         <div className="flex justify-between text-sm"><span className="text-muted-foreground">Delivery</span><span>{new Date(wisePreview.estimatedDelivery as any).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span></div>
        )}
       </div>
      )}

      {/* ── Wise Manual — auto not available ─────────────────────────── */}
      {wiseIntendedAutoButCant && (
       <div className="rounded-xl border border-orange-200 bg-orange-50/50 p-4 dark:border-orange-800 dark:bg-orange-950/30">
        <div className="flex items-start gap-3">
         <div className="mt-0.5 h-7 w-7 shrink-0 rounded-full bg-orange-100 dark:bg-orange-900 flex items-center justify-center">
          <svg className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" /></svg>
         </div>
         <div>
          <p className="text-sm font-semibold text-orange-900 dark:text-orange-200">Send via Wise manually</p>
          <p className="text-xs text-orange-800/80 dark:text-orange-300/80 mt-0.5">
           Wise auto-send isn&apos;t configured for this contractor. Send {fmtMoney(amount)} through Wise yourself, then enter the transfer number below to record it.
          </p>
         </div>
        </div>
       </div>
      )}

      {/* ── Cadana Auto ─────────────────────────────────────────────────── */}
      {isCadanaAuto && cadanaPreview && !("error" in cadanaPreview) && (
       <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-4 space-y-2 dark:border-sky-800 dark:bg-sky-950/30">
        <span className="inline-flex rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-800 dark:bg-sky-900 dark:text-sky-200">Cadana</span>
        <div className="flex justify-between text-sm"><span className="text-muted-foreground">Contractor</span><span className="font-medium">{cadanaPreview.contractorName}</span></div>
        <div className="flex justify-between text-sm"><span className="text-muted-foreground">Country</span><span>{cadanaPreview.country}</span></div>
        {cadanaPreview.bankName ? <div className="flex justify-between text-sm"><span className="text-muted-foreground">Receiving Account</span><span>{cadanaPreview.bankName}</span></div> : <div className="flex justify-between text-sm"><span className="text-muted-foreground">Payment Method</span><span>Cadana Wallet</span></div>}
        <div className="flex justify-between text-sm"><span className="text-muted-foreground">Amount</span><span className="font-bold tabular-nums text-sky-700 dark:text-sky-300">{fmtMoney(cadanaPreview.amount)} {cadanaPreview.currency}</span></div>
       </div>
      )}

      {/* ── Cadana Manual — auto not available ───────────────────────── */}
      {(cadanaIntendedAutoButCant || cadanaHasError) && (
       <div className="rounded-xl border border-orange-200 bg-orange-50/50 p-4 dark:border-orange-800 dark:bg-orange-950/30">
        <div className="flex items-start gap-3">
         <div className="mt-0.5 h-7 w-7 shrink-0 rounded-full bg-orange-100 dark:bg-orange-900 flex items-center justify-center">
          <svg className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" /></svg>
         </div>
         <div>
          <p className="text-sm font-semibold text-orange-900 dark:text-orange-200">Send via Cadana manually</p>
          <p className="text-xs text-orange-800/80 dark:text-orange-300/80 mt-0.5">
           {cadanaHasError && cadanaPreview && "error" in cadanaPreview
             ? cadanaPreview.error + ". Send the payment through Cadana manually and enter the reference below."
             : `Cadana auto-send isn\u2019t available. Send ${fmtMoney(amount)} through Cadana yourself, then enter the payroll or reference number below.`
           }
          </p>
         </div>
        </div>
       </div>
      )}

      {/* ── Manual flow: bank details + reference input ──────────────── */}
      {isManual && (
       <>
        {bankDetails.length > 0 && (
         <div className="rounded-xl border p-4 space-y-1">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Contractor Payment Info</h4>
          {bankDetails.map((d, i) => (
           <div key={i} className="flex items-center justify-between text-sm py-1 border-b border-dashed last:border-0">
            <span className="text-muted-foreground">{d.label}</span>
            <span className="font-mono text-xs">{d.value}</span>
           </div>
          ))}
         </div>
        )}

        <div className="rounded-xl border border-blue-200 bg-blue-50/30 p-4 space-y-2 dark:border-blue-800 dark:bg-blue-950/20">
         <label className="block text-sm font-semibold text-foreground">
          Payment Reference <span className="text-red-500">*</span>
         </label>
         <p className="text-xs text-muted-foreground -mt-1">
          Enter the transfer ID from {LABEL[provider] ?? "your payment method"} after sending the money.
         </p>
         <input
          type="text"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder={provider === "wise" ? "e.g. TRANSFER-123456789" : provider === "cadana" ? "e.g. Cadana payroll ID" : "e.g. wire transfer ref #"}
          className="h-10 w-full rounded-lg border bg-background px-3 text-sm font-mono"
         />
        </div>
       </>
      )}

      {/* Notes (always shown) */}
      <div>
       <label className="mb-1.5 block text-sm font-medium">Notes <span className="text-muted-foreground">(optional)</span></label>
       <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal notes…" className="w-full rounded-lg border bg-background px-3 py-2 text-sm" rows={2} />
      </div>
     </div>
    )}

    {/* ─── Confirm ───────────────────────────────────────────────────────── */}
    {!initializing && view === "confirm" && (
     <div className="space-y-4 p-6">
      <div className={`rounded-xl border p-5 text-center ${
       isStripe ? "bg-violet-50/50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800"
       : isWiseAuto ? "bg-emerald-50/50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800"
       : isCadanaAuto ? "bg-sky-50/50 dark:bg-sky-950/30 border-sky-200 dark:border-sky-800"
       : "bg-orange-50/50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800"
      }`}>
       <h3 className="text-lg font-semibold">
        {isStripe ? "Confirm Stripe Transfer" : isWiseAuto ? "Confirm Wise Payment" : isCadanaAuto ? "Confirm Cadana Payment" : "Record Manual Payment"}
       </h3>
       {isManual && <p className="text-xs text-muted-foreground mt-1">Recording this payment as completed in the system.</p>}
      </div>
      <div className="rounded-xl border p-4 space-y-2 text-sm">
       <div className="flex justify-between"><span className="text-muted-foreground">Contractor</span><span className="font-medium">{emp?.legalFirstName} {emp?.legalLastName}</span></div>
       <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-bold tabular-nums">{fmtMoney(amount)} {info?.currency}</span></div>
       {isWiseAuto && wisePreview && (
        <>
         {wisePreview?.targetCurrency !== "USD" && (
          <div className="flex justify-between"><span className="text-muted-foreground">Receives</span><span className="font-bold tabular-nums text-emerald-700 dark:text-emerald-300">{safeFmtNum(wisePreview?.targetAmount)} {wisePreview?.targetCurrency}</span></div>
         )}
         <div className="flex justify-between"><span className="text-muted-foreground">Wise Fee <span className="text-[10px] text-emerald-600">(RL)</span></span><span className="font-mono">{fmtMoney(wisePreview?.fee)}</span></div>
         <div className="flex justify-between border-t pt-2"><span className="text-muted-foreground font-medium">Total from Balance</span><span className="font-mono font-bold">{fmtMoney(amount + (wisePreview?.fee ?? 0))}</span></div>
        </>
       )}
       <div className="flex justify-between"><span className="text-muted-foreground">Method</span><span>{LABEL[provider] ?? provider}{isManual ? " (manual)" : ""}</span></div>
       {reference && (
        <div className="flex justify-between items-center">
         <span className="text-muted-foreground">Reference</span>
         <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">{reference}</span>
        </div>
       )}
       {notes && <div className="flex justify-between"><span className="text-muted-foreground">Notes</span><span className="text-xs max-w-[200px] text-right">{notes}</span></div>}
      </div>

      {/* Session pre-authorized via Payments gate */}
      {managementToken && (
       <div className="rounded-xl border border-green-200 bg-green-50/50 dark:border-green-900/50 dark:bg-green-950/20 p-3">
        <div className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400">
         <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
         Authorized
        </div>
       </div>
      )}
     </div>
    )}

    {/* ─── Footer ────────────────────────────────────────────────────────── */}
    {!initializing && (
     <div className="flex items-center justify-between border-t px-6 py-4">
      <div>
       {view === "confirm" && <button onClick={() => setView("review")} className="h-9 rounded-lg border px-4 text-sm hover:bg-accent">Back</button>}
       {view === "review" && <button onClick={() => setView("select")} className="h-9 rounded-lg border px-4 text-sm hover:bg-accent">Back</button>}
      </div>
      <div className="flex gap-2">
       <button onClick={onClose} className="h-9 rounded-lg border px-4 text-sm hover:bg-accent">Cancel</button>
       {view === "confirm" ? (
        <button onClick={handleConfirm} disabled={isPending}
         className={`h-9 rounded-lg px-6 text-sm font-medium text-white disabled:opacity-50 ${
          isStripe ? "bg-violet-600 hover:bg-violet-700"
          : isWiseAuto ? "bg-emerald-600 hover:bg-emerald-700"
          : isCadanaAuto ? "bg-sky-600 hover:bg-sky-700"
          : "bg-orange-600 hover:bg-orange-700"
         }`}>
         {isPending
          ? (isStripe ? "Sending via Stripe…" : isWiseAuto ? "Sending via Wise…" : isCadanaAuto ? "Sending via Cadana…" : "Recording…")
          : (isStripe ? "Send via Stripe" : isWiseAuto ? "Send via Wise" : isCadanaAuto ? "Send via Cadana" : "Record Payment")}
        </button>
       ) : view === "review" ? (
        <button onClick={handleContinue} disabled={wiseLoading || (isManual && !reference.trim())}
         className={`h-9 rounded-lg px-6 text-sm font-medium text-white disabled:opacity-50 ${
          isAutoProvider ? "bg-primary hover:bg-primary/90" : "bg-orange-600 hover:bg-orange-700"
         }`}>
         {wiseLoading ? "Loading…" : "Continue"}
        </button>
       ) : null}
      </div>
     </div>
    )}
   </div>
  </div>
 );
}

function maskLast4(value: string): string {
 if (value.length <= 4) return value;
 return "••••" + value.slice(-4);
}

function fmtDate(d: Date | string): string {
 return new Date(d as any).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
