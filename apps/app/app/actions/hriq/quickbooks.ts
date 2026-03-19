"use server";

import { revalidatePath } from "next/cache";

import { database } from "@repo/database";
import { requireRole } from "@repo/auth/session";

// ─── Token Management ───────────────────────────────────────────────────────────

/**
 * Get a valid QuickBooks access token, refreshing if expired.
 * Returns null if QB is not connected.
 */
export async function getQBAccessToken(): Promise<string | null> {
  const companyId = process.env.QB_COMPANY_ID;
  if (!companyId) return null;

  const tokenRow = await database.qbToken.findUnique({
    where: { companyId },
  });

  if (!tokenRow) return null;

  // If access token is still valid (with 5-min buffer), use it
  const now = new Date();
  if (tokenRow.accessTokenExpiresAt > new Date(now.getTime() + 5 * 60 * 1000)) {
    return tokenRow.accessToken;
  }

  // Refresh the token
  try {
    const qb = await import("@repo/integrations/quickbooks");
    const newTokens = await qb.refreshAccessToken(tokenRow.refreshToken);

    await database.qbToken.update({
      where: { companyId },
      data: {
        accessToken: newTokens.accessToken,
        refreshToken: newTokens.refreshToken, // Always store latest!
        accessTokenExpiresAt: newTokens.accessTokenExpiresAt,
        refreshTokenExpiresAt: newTokens.refreshTokenExpiresAt,
        updatedAt: now,
      },
    });

    return newTokens.accessToken;
  } catch (err) {
    console.error("[QB] Token refresh failed:", err);
    return null;
  }
}

/**
 * Check if QuickBooks is connected
 */
export async function getQBConnectionStatus(): Promise<{
  connected: boolean;
  companyId?: string;
  connectedAt?: string;
  refreshTokenExpiresAt?: string;
}> {
  await requireRole("super_admin");
  const companyId = process.env.QB_COMPANY_ID;
  if (!companyId) return { connected: false };

  const tokenRow = await database.qbToken.findUnique({
    where: { companyId },
    select: {
      connectedAt: true,
      refreshTokenExpiresAt: true,
    },
  });

  if (!tokenRow) return { connected: false };

  return {
    connected: true,
    companyId,
    connectedAt: tokenRow.connectedAt.toISOString(),
    refreshTokenExpiresAt: tokenRow.refreshTokenExpiresAt.toISOString(),
  };
}

// ─── Recording Payouts ──────────────────────────────────────────────────────────

/**
 * Record a completed payment in QuickBooks.
 * Creates a Vendor + Bill + BillPayment for clean accounting.
 *
 * Called automatically after a payout is confirmed (Wise or manual).
 */
export async function syncPaymentToQuickBooks(paymentId: string): Promise<{
  success: boolean;
  qbBillId?: string;
  qbBillPaymentId?: string;
  qbVendorId?: string;
  error?: string;
}> {
  try {
    const accessToken = await getQBAccessToken();
    if (!accessToken) {
      console.warn("[QB] Not connected — skipping sync for payment", paymentId);
      return { success: false, error: "QuickBooks not connected" };
    }

    const qb = await import("@repo/integrations/quickbooks");

    // Load payment + employee
    const payment = await database.payment.findUnique({
      where: { id: paymentId },
      include: {
        employee: true,
      },
    });

    if (!payment) return { success: false, error: "Payment not found" };
    if (!payment.employee) return { success: false, error: "No employee linked" };

    const emp = payment.employee;
    const amount = Number(payment.amount);
    const paymentDate = payment.paymentDate
      ? payment.paymentDate.toISOString().split("T")[0]!
      : new Date().toISOString().split("T")[0]!;

    // Get or find the expense account + bank account
    // Use env vars or find defaults
    const expenseAccountId = process.env.QB_EXPENSE_ACCOUNT_ID ?? await findDefaultExpenseAccount(accessToken);
    const bankAccountId = process.env.QB_BANK_ACCOUNT_ID ?? await findDefaultBankAccount(accessToken);

    if (!expenseAccountId || !bankAccountId) {
      return {
        success: false,
        error: "QuickBooks expense or bank account not configured. Set QB_EXPENSE_ACCOUNT_ID and QB_BANK_ACCOUNT_ID.",
      };
    }

    // Build contractor name
    const contractorName = `${emp.legalFirstName ?? ""} ${emp.legalLastName ?? ""}`.trim()
      || "Unknown Contractor";

    // Record in QuickBooks
    const result = await qb.recordContractorPayout(
      {
        contractorName,
        contractorFirstName: emp.legalFirstName ?? undefined,
        contractorLastName: emp.legalLastName ?? undefined,
        contractorEmail: emp.personalEmail ?? emp.workEmail ?? undefined,
        contractorCountry: emp.country ?? undefined,
        amount,
        description: payment.description ?? `Contractor payment — ${contractorName}`,
        paymentDate,
        paymentReference: payment.wiseTransferId
          ? `Wise #${payment.wiseTransferId}`
          : (payment.transactionId ?? undefined),
        expenseAccountId,
        bankAccountId,
        docNumber: payment.id.slice(-8).toUpperCase(),
        currencyCode: "USD",
      },
      accessToken,
    );

    // Update payment with QB IDs
    await database.payment.update({
      where: { id: paymentId },
      data: {
        qbBillId: result.bill.Id,
        qbBillPaymentId: result.billPayment.Id,
        qbVendorId: result.vendor.Id,
        qbSyncedAt: new Date(),
      },
    });

    // Cache vendor ID on employee for future payments
    if (!emp.qbVendorId) {
      await database.employee.update({
        where: { id: emp.id },
        data: { qbVendorId: result.vendor.Id },
      }).catch(() => {}); // Non-critical
    }

    console.info(`[QB] Payment ${paymentId} synced — Bill: ${result.bill.Id}, Payment: ${result.billPayment.Id}`);

    revalidatePath("/payments");
    revalidatePath("/payroll");
    revalidatePath("/", "layout");

    return {
      success: true,
      qbBillId: result.bill.Id,
      qbBillPaymentId: result.billPayment.Id,
      qbVendorId: result.vendor.Id,
    };
  } catch (err: any) {
    console.error(`[QB] Sync failed for payment ${paymentId}:`, err);
    return { success: false, error: err.message };
  }
}

/**
 * Sync all completed but unsynced payments to QuickBooks
 */
export async function syncUnsyncedPaymentsToQB(): Promise<{
  total: number;
  synced: number;
  failed: number;
  errors: { paymentId: string; error: string }[];
}> {
  await requireRole("super_admin");
  const accessToken = await getQBAccessToken();
  if (!accessToken) {
    return { total: 0, synced: 0, failed: 0, errors: [{ paymentId: "", error: "QB not connected" }] };
  }

  const unsynced = await database.payment.findMany({
    where: {
      status: "completed",
      qbSyncedAt: null,
    },
    select: { id: true },
    take: 50,
  });

  const errors: { paymentId: string; error: string }[] = [];
  let synced = 0;

  for (const p of unsynced) {
    const result = await syncPaymentToQuickBooks(p.id);
    if (result.success) {
      synced++;
    } else {
      errors.push({ paymentId: p.id, error: result.error ?? "Unknown error" });
    }
  }

  return {
    total: unsynced.length,
    synced,
    failed: errors.length,
    errors,
  };
}

/**
 * Test the QuickBooks connection by fetching company info
 */
export async function testQBConnection(): Promise<{
  connected: boolean;
  companyName?: string;
  error?: string;
}> {
  await requireRole("super_admin");
  try {
    const accessToken = await getQBAccessToken();
    if (!accessToken) return { connected: false, error: "No access token" };

    const qb = await import("@repo/integrations/quickbooks");
    const info = await qb.getCompanyInfo(accessToken);
    const companyInfo = info?.CompanyInfo;

    return {
      connected: true,
      companyName: companyInfo?.CompanyName ?? "Unknown",
    };
  } catch (err: any) {
    return { connected: false, error: err.message };
  }
}

/**
 * List QB expense accounts for configuration
 */
export async function listQBExpenseAccounts(): Promise<{
  accounts: { id: string; name: string; balance?: number }[];
  error?: string;
}> {
  await requireRole("super_admin");
  try {
    const accessToken = await getQBAccessToken();
    if (!accessToken) return { accounts: [], error: "QB not connected" };

    const qb = await import("@repo/integrations/quickbooks");
    const accounts = await qb.getExpenseAccounts(accessToken);

    return {
      accounts: accounts.map((a) => ({
        id: a.Id,
        name: a.Name,
        balance: a.CurrentBalance ?? undefined,
      })),
    };
  } catch (err: any) {
    return { accounts: [], error: err.message };
  }
}

/**
 * List QB bank accounts for configuration
 */
export async function listQBBankAccounts(): Promise<{
  accounts: { id: string; name: string; balance?: number }[];
  error?: string;
}> {
  await requireRole("super_admin");
  try {
    const accessToken = await getQBAccessToken();
    if (!accessToken) return { accounts: [], error: "QB not connected" };

    const qb = await import("@repo/integrations/quickbooks");
    const accounts = await qb.getBankAccounts(accessToken);

    return {
      accounts: accounts.map((a) => ({
        id: a.Id,
        name: a.Name,
        balance: a.CurrentBalance ?? undefined,
      })),
    };
  } catch (err: any) {
    return { accounts: [], error: err.message };
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

async function findDefaultExpenseAccount(accessToken: string): Promise<string | null> {
  try {
    const qb = await import("@repo/integrations/quickbooks");
    // Look for common contractor expense account names
    for (const name of ["Contractor Expenses", "Contractor Payments", "Contract Labor", "Subcontractors", "Outside Services"]) {
      const account = await qb.findAccount(name, accessToken);
      if (account) return account.Id;
    }
    // Fall back to first expense account
    const accounts = await qb.getExpenseAccounts(accessToken);
    return accounts[0]?.Id ?? null;
  } catch {
    return null;
  }
}

async function findDefaultBankAccount(accessToken: string): Promise<string | null> {
  try {
    const qb = await import("@repo/integrations/quickbooks");
    // Look for Wise or checking account
    for (const name of ["Wise", "Wise USD", "Checking", "Business Checking"]) {
      const account = await qb.findAccount(name, accessToken);
      if (account) return account.Id;
    }
    // Fall back to first bank account
    const accounts = await qb.getBankAccounts(accessToken);
    return accounts[0]?.Id ?? null;
  } catch {
    return null;
  }
}

// ─── Client Invoice → QuickBooks Sync ───────────────────────────────────────────

/**
 * Sync a HRIQ ClientInvoice to QuickBooks as an Invoice (accounts receivable).
 *
 * Creates a QB Customer for the client org and a QB Invoice with line items
 * for each contractor's hours in the period.
 */
export async function syncClientInvoiceToQuickBooks(invoiceId: string): Promise<{
  success: boolean;
  qbInvoiceId?: string;
  qbCustomerId?: string;
  error?: string;
}> {
  try {
    const accessToken = await getQBAccessToken();
    if (!accessToken) {
      console.warn("[QB] Not connected — skipping client invoice sync for", invoiceId);
      return { success: false, error: "QuickBooks not connected" };
    }

    const qb = await import("@repo/integrations/quickbooks");

    const invoice = await database.clientInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        organization: { select: { id: true, name: true, profile: { select: { adminEmail: true, billingEmail: true } } } },
        lineItems: {
          include: {
            employee: { select: { legalFirstName: true, legalLastName: true } },
          },
        },
      },
    });

    if (!invoice) return { success: false, error: "Invoice not found" };
    if ((invoice as any).qbInvoiceId) return { success: true, qbInvoiceId: (invoice as any).qbInvoiceId };

    const org = invoice.organization;
    if (!org) return { success: false, error: "Organization not found" };

    // Find or create QB Customer for the client
    const email = org.profile?.billingEmail ?? org.profile?.adminEmail ?? undefined;
    const customer = await qb.findOrCreateCustomer(
      { displayName: org.name, companyName: org.name, email, currencyCode: invoice.currency ?? "USD" },
      accessToken,
    );

    // Cache QB customer ID on the org
    if (!((org as any).qbCustomerId)) {
      await database.organization.update({
        where: { id: org.id },
        data: { qbCustomerId: customer.Id },
      }).catch(() => {}); // Non-critical
    }

    // Build QB invoice line items
    const lineItems = invoice.lineItems.map((li: any) => ({
      description: li.description ?? `${li.employee?.legalFirstName ?? ""} ${li.employee?.legalLastName ?? ""} — ${li.hoursWorked}h`,
      amount: Number(li.amount),
      quantity: Number(li.hoursWorked) || 1,
      unitPrice: Number(li.hourlyRate) || Number(li.amount),
    }));

    // Calculate due date (net 30 from invoice creation)
    const dueDate = new Date(invoice.createdAt as any);
    dueDate.setDate(dueDate.getDate() + 30);

    const qbInvoice = await qb.createInvoice(
      {
        customerId: customer.Id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.createdAt.toISOString().split("T")[0],
        dueDate: dueDate.toISOString().split("T")[0],
        lineItems,
        rlFeeDescription: invoice.rlFeeType ? `Remote Leverage — Management Fee (${invoice.rlFeeType})` : undefined,
        rlFeeAmount: invoice.rlFeeTotal ? Number(invoice.rlFeeTotal) : undefined,
        memo: `HRIQ Invoice ${invoice.invoiceNumber} — ${invoice.periodName ?? ""}`,
        currencyCode: invoice.currency ?? "USD",
      },
      accessToken,
    );

    // Store QB invoice ID on the client invoice
    await database.clientInvoice.update({
      where: { id: invoiceId },
      data: {
        qbInvoiceId: qbInvoice.Id,
        qbSyncedAt: new Date(),
      },
    });

    console.info(`[QB] Client invoice ${invoiceId} synced — QB Invoice: ${qbInvoice.Id}`);

    revalidatePath("/invoices");
    revalidatePath("/", "layout");

    return {
      success: true,
      qbInvoiceId: qbInvoice.Id,
      qbCustomerId: customer.Id,
    };
  } catch (err: any) {
    console.error(`[QB] Client invoice sync failed for ${invoiceId}:`, err);
    return { success: false, error: err.message };
  }
}

// ─── QB Invoice Search (for org creation payment verification) ──────────────────

export type QBInvoiceSearchResult = {
  id: string;
  docNumber: string | null;
  txnDate: string;
  dueDate: string | null;
  totalAmount: number;
  balance: number;
  customerName: string | null;
  status: "paid" | "unpaid" | "partial" | "overdue";
  memo: string | null;
};

/**
 * Search QuickBooks invoices by keyword (doc number, customer name, or memo).
 * Used in the org creation wizard to verify PPP invoice payment.
 */
export async function searchQBInvoices(searchTerm: string): Promise<{
  invoices: QBInvoiceSearchResult[];
  error?: string;
}> {
  try {
    const { requireRole } = await import("@repo/auth/session");
    await requireRole("super_admin");
    const accessToken = await getQBAccessToken();
    if (!accessToken) {
      return { invoices: [], error: "QuickBooks is not connected. Connect QB first in Settings." };
    }

    const qb = await import("@repo/integrations/quickbooks");
    const escaped = searchTerm.replace(/'/g, "\\'").trim();

    // Search by DocNumber, CustomerRef name, or PrivateNote
    // QB SQL doesn't support OR across different fields well, so we do multiple queries
    let results: any[] = [];

    // Try by doc number first (exact or LIKE)
    if (escaped) {
      try {
        const byDocNum = await qb.query(
          `SELECT * FROM Invoice WHERE DocNumber LIKE '%${escaped}%' MAXRESULTS 20`,
          accessToken,
        );
        results.push(...((byDocNum) as any[]));
      } catch (err) { console.warn("[quickbooks:searchQBInvoices] Suppressed error:", err); }

      // Also search by customer name
      try {
        const byCustomer = await qb.query(
          `SELECT * FROM Invoice WHERE CustomerRef IN (SELECT Id FROM Customer WHERE DisplayName LIKE '%${escaped}%') MAXRESULTS 20`,
          accessToken,
        );
        // This query syntax may not work in QB — fallback below
        results.push(...((byCustomer) as any[]));
      } catch {
        // QB doesn't support subqueries — search customers separately then filter
        try {
          const customers = await qb.query(
            `SELECT Id, DisplayName FROM Customer WHERE DisplayName LIKE '%${escaped}%'`,
            accessToken,
          );
          for (const cust of (customers as any[]).slice(0, 5)) {
            const custInvoices = await qb.query(
              `SELECT * FROM Invoice WHERE CustomerRef = '${cust.Id}' MAXRESULTS 10`,
              accessToken,
            );
            results.push(...((custInvoices) as any[]));
          }
        } catch (err) { console.warn("[quickbooks:searchQBInvoices] Suppressed error:", err); }
      }
    } else {
      // No search term — return recent invoices
      try {
        const recent = await qb.query(
          "SELECT * FROM Invoice ORDERBY TxnDate DESC MAXRESULTS 20",
          accessToken,
        );
        results.push(...((recent) as any[]));
      } catch (err) { console.warn("[quickbooks:searchQBInvoices] Suppressed error:", err); }
    }

    // Deduplicate by Id
    const seen = new Set<string>();
    const unique = results.filter((inv: any) => {
      if (seen.has(inv.Id)) return false;
      seen.add(inv.Id);
      return true;
    });

    const now = new Date();
    const invoices: QBInvoiceSearchResult[] = unique.map((inv: any) => {
      const balance = Number(inv.Balance ?? 0);
      const total = Number(inv.TotalAmt ?? 0);
      const dueDate = inv.DueDate ? new Date(inv.DueDate) : null;
      let status: QBInvoiceSearchResult["status"] = "unpaid";
      if (balance === 0 && total > 0) status = "paid";
      else if (balance > 0 && balance < total) status = "partial";
      else if (dueDate && dueDate < now && balance > 0) status = "overdue";

      return {
        id: inv.Id,
        docNumber: inv.DocNumber ?? null,
        txnDate: inv.TxnDate ?? "",
        dueDate: inv.DueDate ?? null,
        totalAmount: total,
        balance,
        customerName: inv.CustomerRef?.name ?? null,
        status,
        memo: inv.PrivateNote ?? null,
      };
    });

    // Only return PAID invoices - this search is for Payment Verification
    // (confirming the client has paid the PPP). Unpaid/partial/overdue
    // invoices should not be attachable as proof of payment.
    const paidInvoices = invoices.filter((inv) => inv.status === "paid");

    // Sort by date desc (most recent first)
    paidInvoices.sort((a, b) => b.txnDate.localeCompare(a.txnDate));

    return { invoices: paidInvoices };
  } catch (err: any) {
    console.error("[QB] Invoice search failed:", err);
    return { invoices: [], error: err.message ?? "Failed to search invoices" };
  }
}

// ─── Invoice Paid → Wise Payout Trigger ─────────────────────────────────────────

/**
 * When a client invoice is marked as "paid", trigger Wise payouts for all
 * pending contractor payments linked to that invoice's period and org.
 *
 * Flow: Timesheet approved → Payment record created → Client invoice generated →
 *       Client pays invoice → This function triggers Wise payouts to contractors.
 */
export async function triggerWisePayoutsForPaidInvoice(invoiceId: string): Promise<{
  triggered: number;
  failed: number;
  errors: { paymentId: string; error: string }[];
}> {
  const invoice = await database.clientInvoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      organizationId: true,
      periodStart: true,
      periodEnd: true,
      status: true,
    },
  });

  if (!invoice) throw new Error("Invoice not found");
  if (invoice.status !== "paid") throw new Error("Invoice is not yet paid");

  // Find all pending payments for this org's contractors in this period
  const payments = await database.payment.findMany({
    where: {
      status: "pending",
      periodStart: invoice.periodStart,
      periodEnd: invoice.periodEnd,
      employee: { organizationId: invoice.organizationId },
    },
    select: { id: true },
  });

  if (payments.length === 0) {
    return { triggered: 0, failed: 0, errors: [] };
  }

  // Trigger Wise payouts
  const { executeWisePayout } = await import("./wise-payouts");
  const errors: { paymentId: string; error: string }[] = [];
  let triggered = 0;

  for (const payment of payments) {
    try {
      const result = await executeWisePayout({ paymentId: payment.id });
      if ("error" in result) {
        errors.push({ paymentId: payment.id, error: (result as any).error });
      } else {
        triggered++;
      }
    } catch (err: any) {
      errors.push({ paymentId: payment.id, error: err.message ?? String(err) });
    }
  }

  // Sync completed payouts to QB (non-blocking)
  for (const payment of payments) {
    syncPaymentToQuickBooks(payment.id).catch(() => {});
  }

  return {
    triggered,
    failed: errors.length,
    errors,
  };
}

// ─── Invoice PDF Download ─────────────────────────────────────────────────────

/**
 * Download a QuickBooks invoice as a PDF and return it as a base64 string.
 * Used when "Already Paid" is selected in org creation — attaches the invoice PDF.
 */
export async function downloadQBInvoicePdf(invoiceId: string): Promise<{
  base64: string;
  fileName: string;
  error?: never;
} | { error: string; base64?: never; fileName?: never }> {
  try {
    const { requireRole } = await import("@repo/auth/session");
    await requireRole("super_admin");
    const accessToken = await getQBAccessToken();
    if (!accessToken) return { error: "QuickBooks is not connected." };

    const companyId = process.env.QB_COMPANY_ID;
    if (!companyId) return { error: "QB_COMPANY_ID not configured." };

    const url = `https://quickbooks.api.intuit.com/v3/company/${companyId}/invoice/${invoiceId}/pdf`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/pdf",
      },
    });

    if (!res.ok) {
      return { error: `QB API returned ${res.status} fetching invoice PDF.` };
    }

    const buf = await res.arrayBuffer();
    const base64 = Buffer.from(buf).toString("base64");
    return { base64, fileName: `invoice-${invoiceId}.pdf` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to download invoice PDF." };
  }
}
