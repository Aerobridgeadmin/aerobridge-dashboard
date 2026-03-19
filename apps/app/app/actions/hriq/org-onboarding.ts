"use server";

import { requireRole } from "@repo/auth/session";
import { database } from "@repo/database";
import { normalizeEmail } from "@/lib/hriq/utils";
import { revalidatePath } from "next/cache";

// Create external onboarding session (RL admin action)
export async function createExternalOnboardingSession(data: {
  companyName?: string;
  contactEmail?: string;
  contactName?: string;
  expiresInDays?: number;
  prepaid?: boolean;
  vaCount?: number;
  plan?: "ppp" | "cor" | "both";
}) {
  const session = await requireRole("super_admin");
  const expiresAt = new Date(Date.now() + (data.expiresInDays ?? 14) * 24 * 60 * 60 * 1000);

  const preferences: Record<string, unknown> = {};
  if (data.prepaid) preferences.prepaid = true;
  if (data.vaCount) preferences.vaCount = data.vaCount;
  if (data.plan) preferences.plan = data.plan;

  // Pre-fill payment method based on plan selection
  const paymentMethod = data.plan === "ppp" ? "ppp" : data.plan === "cor" ? "cor" : data.plan === "both" ? "both" : null;

  const onboardingSession = await database.orgOnboardingSession.create({
    data: {
      companyName: data.companyName || null,
      contactEmail: data.contactEmail ? normalizeEmail(data.contactEmail) : null,
      contactName: data.contactName || null,
      status: "draft",
      currentStep: 1,
      totalSteps: data.prepaid ? 6 : 7,
      expiresAt,
      createdByUserId: session.userId,
      createdByName: session.name ?? "Admin",
      paymentMethod,
      preferences: preferences as any,
    },
  });

  revalidatePath("/", "layout");

  const url = `${process.env.NEXT_PUBLIC_APP_URL || ""}/org-onboard/${onboardingSession.token}`;

  // Auto-send onboarding link email if contact email is provided
  let emailSent = false;
  if (data.contactEmail) {
    try {
      const { sendExternalOnboardingLinkEmailSystem } = await import("./send-email");
      await sendExternalOnboardingLinkEmailSystem(
        normalizeEmail(data.contactEmail),
        data.contactName || "",
        data.companyName || "",
        url,
        expiresAt,
      );
      emailSent = true;
    } catch (emailErr) {
      console.error("[HRIQ] Failed to send onboarding link email:", emailErr);
    }
  }

  return {
    id: onboardingSession.id,
    token: onboardingSession.token,
    url,
    expiresAt,
    emailSent,
    emailTo: data.contactEmail || null,
  };
}

// Get all external onboarding sessions (RL admin)
export async function getExternalOnboardingSessions() {
  await requireRole("super_admin");
  return database.orgOnboardingSession.findMany({
    where: { status: { not: "expired" } },
    include: { organization: { select: { id: true, name: true, slug: true } } },
    orderBy: { updatedAt: "desc" },
  });
}

// Public: load onboarding session by token
export async function getOnboardingByToken(token: string) {
  if (!token) return null;
  const session = await database.orgOnboardingSession.findUnique({
    where: { token },
    select: {
      id: true, token: true, status: true, currentStep: true, totalSteps: true,
      companyName: true, industry: true, companySize: true, website: true, country: true, address: true,
      contactName: true, contactEmail: true, contactPhone: true, contactTitle: true, billingEmail: true,
      paymentMethod: true, notes: true, preferences: true, completedAt: true, expiresAt: true, organizationId: true,
    },
  });
  if (!session) return null;
  if (session.expiresAt < new Date() && session.status !== "completed") return null;
  return session;
}

// Public: save step data (no auth — token is the auth)
export async function saveOnboardingStep(token: string, step: number, data: Record<string, unknown>) {
  if (!token) return { error: "Invalid token" };
  const session = await database.orgOnboardingSession.findUnique({ where: { token } });
  if (!session) return { error: "Session not found" };
  if (session.status === "completed") return { error: "Already completed" };
  if (session.expiresAt < new Date()) return { error: "Session expired" };

  const updateData: Record<string, unknown> = {
    currentStep: Math.max(session.currentStep, step + 1),
    status: "in_progress",
    updatedAt: new Date(),
  };

  if (step === 1) {
    updateData.companyName = (data.companyName as string) || session.companyName;
    updateData.industry = (data.industry as string) || null;
    updateData.companySize = (data.companySize as string) || null;
    updateData.website = (data.website as string) || null;
    updateData.country = (data.country as string) || null;
    updateData.address = (data.address as string) || null;
    // Merge preferences (logo, etc.) - preserve existing preferences from other steps
    if (data.preferences && typeof data.preferences === "object") {
      const existingPrefs = (session.preferences as Record<string, unknown>) ?? {};
      updateData.preferences = { ...existingPrefs, ...(data.preferences as Record<string, unknown>) };
    }
  } else if (step === 2) {
    updateData.contactName = (data.contactName as string) || null;
    updateData.contactEmail = data.contactEmail ? normalizeEmail(data.contactEmail as string) : null;
    updateData.contactPhone = (data.contactPhone as string) || null;
    updateData.contactTitle = (data.contactTitle as string) || null;
    updateData.billingEmail = (data.billingEmail as string) || null;
  } else if (step === 3) {
    updateData.paymentMethod = (data.paymentMethod as string) || null;
  } else if (step === 4) {
    updateData.notes = (data.notes as string) || null;
    // Merge preferences to preserve logo from step 1
    const existingPrefs4 = (session.preferences as Record<string, unknown>) ?? {};
    updateData.preferences = { ...existingPrefs4, ...((data.preferences as Record<string, unknown>) ?? {}) };
  }

  await database.orgOnboardingSession.update({ where: { id: session.id }, data: updateData });
  return { success: true, nextStep: step + 1 };
}

// Public: complete onboarding (final submission)
export async function completeExternalOnboarding(token: string) {
  if (!token) return { error: "Invalid token" };
  const session = await database.orgOnboardingSession.findUnique({ where: { token } });
  if (!session) return { error: "Session not found" };
  if (session.status === "completed") return { error: "Already completed" };
  if (session.expiresAt < new Date()) return { error: "Session expired" };
  if (!session.companyName?.trim()) return { error: "Company name is required" };
  if (!session.contactEmail?.trim()) return { error: "Contact email is required" };

  await database.orgOnboardingSession.update({
    where: { id: session.id },
    data: { status: "completed", currentStep: session.totalSteps, completedAt: new Date() },
  });

  // For paymentOnly sessions: the org already exists — payment just completed,
  // so auto-send the welcome email with login credentials now.
  const prefs = (session.preferences as Record<string, unknown>) ?? {};
  if (prefs.paymentOnly && session.organizationId) {
    try {
      const org = await database.organization.findUnique({
        where: { id: session.organizationId },
        select: {
          profile: { select: { adminEmail: true, adminName: true } },
        },
      });
      const adminEmail = org?.profile?.adminEmail ?? session.contactEmail;
      const adminName  = org?.profile?.adminName  ?? session.contactName ?? "";
      if (adminEmail) {
        const { sendOrgAdminInviteEmailSystem } = await import("./send-email");
        try {
          await sendOrgAdminInviteEmailSystem(adminEmail, session.companyName!, adminName);
        } catch (emailErr) {
          console.error("[HRIQ] Email send failed (non-blocking):", emailErr);
        }
      }
    } catch (emailErr) {
      console.error("[org-onboarding.ts:completeExternalOnboarding] Failed to send welcome email:", emailErr);
      // Non-fatal — session is still marked complete
    }
  }

  return { success: true };
}

// RL Admin: convert completed onboarding into a real org
export async function convertOnboardingToOrg(sessionId: string) {
  try {
    const authSession = await requireRole("super_admin");
    const onboarding = await database.orgOnboardingSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true, companyName: true, contactEmail: true, contactName: true,
        contactPhone: true, contactTitle: true, billingEmail: true,
        industry: true, companySize: true, website: true, country: true, address: true,
        paymentMethod: true, notes: true, preferences: true, status: true,
      },
    });
    if (!onboarding) return { error: "Onboarding session not found" };
    if (!onboarding.companyName?.trim()) return { error: "Company name is missing" };

    const { createClientOrganization } = await import("./invitations");
    const prefs = (onboarding.preferences as Record<string, any>) || {};
    const result = await createClientOrganization({
      name: onboarding.companyName,
      adminEmail: onboarding.contactEmail || "",
      adminName: onboarding.contactName || undefined,
      industry: onboarding.industry || undefined,
      companySize: onboarding.companySize || undefined,
      website: onboarding.website || undefined,
      country: onboarding.country || undefined,
      address: onboarding.address || undefined,
      adminPhone: onboarding.contactPhone || undefined,
      adminTitle: onboarding.contactTitle || undefined,
      billingEmail: onboarding.billingEmail || undefined,
      paymentMethod: onboarding.paymentMethod || "ppp",
      vaSeats: typeof prefs.vaCount === "number" ? prefs.vaCount : undefined,
      planType: typeof prefs.plan === "string" ? prefs.plan : undefined,
    });

    if (result && "error" in result) return { error: (result as any).error };

    await database.orgOnboardingSession.update({
      where: { id: sessionId },
      data: { organizationId: result.organization.id },
    });

    // Auto-create Contact record from onboarding data so it shows in Contacts sidebar
    if (onboarding.contactName || onboarding.contactEmail) {
      try {
        await database.contact.create({
          data: {
            organizationId: result.organization.id,
            fullName: onboarding.contactName || (onboarding.contactEmail || "").split("@")[0],
            email: onboarding.contactEmail || null,
            phone: onboarding.contactPhone || null,
            jobTitle: onboarding.contactTitle || null,
            role: "primary",
            createdByUserId: authSession.userId,
            createdByName: "System (external onboarding)",
          },
        });
      } catch (contactErr) {
        console.error("[HRIQ] Failed to create contact from external onboarding:", contactErr);
      }
    }

    // Upload logo from preferences if present
    const logoPrefs = (onboarding as any).preferences as Record<string, unknown> | null;
    if (logoPrefs && typeof logoPrefs.logoBase64 === "string" && logoPrefs.logoBase64.startsWith("data:image")) {
      try {
        const { getSupabaseAdmin, getSignedStorageUrl } = await import("./constants");
        const base64Data = (logoPrefs.logoBase64 as string).split(",")[1];
        if (base64Data) {
          const mimeMatch = (logoPrefs.logoBase64 as string).match(/^data:(image\/\w+);/);
          const mime = mimeMatch ? mimeMatch[1] : "image/png";
          const ext = mime.split("/")[1] || "png";
          const buffer = Buffer.from(base64Data, "base64");
          const storagePath = `logos/${result.organization.id}/logo.${ext}`;
          const supabase = getSupabaseAdmin();
          const { error: uploadErr } = await supabase.storage
            .from("org-documents")
            .upload(storagePath, buffer, { contentType: mime, upsert: true });
          if (!uploadErr) {
            const signedUrl = await getSignedStorageUrl("org-documents", storagePath, 60 * 60 * 24 * 365 * 10);
            await database.organization.update({
              where: { id: result.organization.id },
              data: { logoUrl: signedUrl },
            });
          } else {
            console.error("[HRIQ] Logo upload from onboarding failed:", uploadErr.message);
          }
        }
      } catch (logoErr) {
        console.error("[HRIQ] Failed to process logo from external onboarding:", logoErr);
      }
    }

    revalidatePath("/", "layout");
    return { success: true, organization: result.organization };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[org-onboarding.ts:convertOnboardingToOrg]", _msg);
    return { error: _msg };
  }
}

// RL Admin: expire a session
export async function expireOnboardingSession(sessionId: string) {
  try {
    await requireRole("super_admin");
    await database.orgOnboardingSession.update({ where: { id: sessionId }, data: { status: "expired" } });
    revalidatePath("/", "layout");
    return { success: true };

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[org-onboarding.ts:expireOnboardingSession]", _msg);
    return { error: _msg };
  }
}

// RL Admin: resend onboarding link email
export async function resendOnboardingLinkEmail(sessionId: string) {
  try {
    await requireRole("super_admin");
    const session = await database.orgOnboardingSession.findUnique({
      where: { id: sessionId },
      select: { token: true, contactEmail: true, contactName: true, companyName: true, expiresAt: true, status: true },
    });
    if (!session) return { error: "Session not found" };
    if (session.status === "expired") return { error: "Session is expired" };
    if (!session.contactEmail) return { error: "No contact email on this session" };

    try {
      const url = `${process.env.NEXT_PUBLIC_APP_URL || ""}/org-onboard/${session.token}`;
      const { sendExternalOnboardingLinkEmailSystem } = await import("./send-email");
      await sendExternalOnboardingLinkEmailSystem(
        session.contactEmail,
        session.contactName || "",
        session.companyName || "",
        url,
        session.expiresAt,
      );
      return { success: true };
    } catch (err) {
      console.error("[HRIQ] Failed to resend onboarding email:", err);
      return { error: "Failed to send email" };
    }

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[org-onboarding.ts:resendOnboardingLinkEmail]", _msg);
    return { error: _msg };
  }
}

// Public: create QuickBooks invoice checkout for external onboarding (no auth — token is auth)
// paymentType: "ach" (default, no fee) | "cc" (credit card, adds 3% surcharge)
export async function createOnboardingCheckout(token: string, paymentType: "ach" | "cc" = "ach") {
  if (!token) return { error: "Invalid token" };
  const session = await database.orgOnboardingSession.findUnique({ where: { token } });
  if (!session) return { error: "Session not found" };
  if (session.status === "completed") return { error: "Already completed" };
  if (session.expiresAt < new Date()) return { error: "Session expired" };

  const prefs = (session.preferences as Record<string, unknown>) ?? {};
  if (prefs.prepaid) return { error: "Payment already collected" };

  if (!session.paymentMethod) return { error: "No service plan selected" };
  if (!session.companyName) return { error: "Company name is required" };

  const isPPP = session.paymentMethod === "ppp" || session.paymentMethod === "both";
  const isCOR = session.paymentMethod === "cor" || session.paymentMethod === "both";

  const vaCount = typeof prefs.vaCount === "number" ? Math.max(prefs.vaCount, 1) : 1;

  // Build line items
  const lineItems: { description: string; amount: number; quantity: number; unitPrice: number }[] = [];
  if (isPPP) lineItems.push({ description: `Performance & Payroll (PPP) — Annual per VA`, amount: 3000 * vaCount, quantity: vaCount, unitPrice: 3000 });
  if (isCOR) lineItems.push({ description: `Contractor of Record (COR) — Annual per VA`, amount: 4200 * vaCount, quantity: vaCount, unitPrice: 4200 });

  // Add credit card processing fee (3%) if paying by card
  if (paymentType === "cc") {
    const baseTotal = lineItems.reduce((sum, li) => sum + li.amount, 0);
    const ccFee = Math.round(baseTotal * 0.03 * 100) / 100;
    lineItems.push({
      description: "Credit Card Processing Fee (3%)",
      amount: ccFee,
      quantity: 1,
      unitPrice: ccFee,
    });
  }

  // Try QuickBooks invoice first
  try {
    const { getQBAccessToken } = await import("./quickbooks");
    const accessToken = await getQBAccessToken();

    if (accessToken) {
      const qb = await import("@repo/integrations/quickbooks");

      // Find or create QB Customer for this onboarding
      const billingEmail = session.billingEmail || session.contactEmail || undefined;
      const customer = await qb.findOrCreateCustomer(
        {
          displayName: session.companyName,
          companyName: session.companyName,
          email: billingEmail,
          currencyCode: "USD",
        },
        accessToken,
      );

      // Calculate due date (net 15)
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 15);

      // Create the invoice
      const invoice = await qb.createInvoice(
        {
          customerId: customer.Id,
          invoiceDate: new Date().toISOString().split("T")[0],
          dueDate: dueDate.toISOString().split("T")[0],
          lineItems,
          memo: `HRIQ Onboarding — ${session.companyName} — ${session.paymentMethod === "both" ? "PPP + COR" : isPPP ? "PPP" : "COR"} — ${vaCount} VA${vaCount !== 1 ? "s" : ""}`,
          currencyCode: "USD",
          billEmail: billingEmail,
          allowOnlinePayment: true,
        },
        accessToken,
      );

      // Get the payment link
      const paymentLink = await qb.getInvoicePaymentLink(invoice.Id, accessToken);

      // Also send the invoice via email (non-blocking)
      if (billingEmail) {
        qb.sendInvoiceEmail(invoice.Id, billingEmail, accessToken).catch((err: any) => {
          console.warn("[HRIQ] Failed to send QB invoice email:", err);
        });
      }

      // Store QB invoice ID on the onboarding session
      await database.orgOnboardingSession.update({
        where: { id: session.id },
        data: {
          preferences: { ...prefs, qbInvoiceId: invoice.Id, qbCustomerId: customer.Id },
        },
      });

      if (paymentLink) {
        return { url: paymentLink };
      }

      // If no payment link (QB Payments not enabled), fall through to Stripe
      console.warn(
        `[HRIQ] QB invoice ${invoice.Id} created but no payment link — ` +
        `AllowOnlineCreditCardPayment was set to ${(invoice as any).AllowOnlineCreditCardPayment ?? "unset"}, ` +
        `AllowOnlineACHPayment was set to ${(invoice as any).AllowOnlineACHPayment ?? "unset"}. ` +
        `BillEmail=${billingEmail ?? "none"}. ` +
        `To fix: enable QB Payments in QB Settings > Payments, or check that the sandbox has payments enabled. ` +
        `Falling back to Stripe.`
      );
    }
  } catch (err) {
    console.warn("[HRIQ] QB invoice creation failed, falling back to Stripe:", err);
  }

  // Fallback: Stripe Checkout
  try {
    const stripe = (await import("stripe")).default;
    const stripeClient = new stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-12-18.acacia" as any });

    const stripeLineItems = [];
    if (isPPP) stripeLineItems.push({ name: "Performance & Payroll (PPP) — Annual per VA", amount: 3000_00, qty: vaCount });
    if (isCOR) stripeLineItems.push({ name: "Contractor of Record (COR) — Annual per VA", amount: 4200_00, qty: vaCount });

    const checkoutSession = await stripeClient.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card", "us_bank_account"],
      customer_email: session.billingEmail || session.contactEmail || undefined,
      line_items: stripeLineItems.map((li) => ({
        price_data: {
          currency: "usd",
          product_data: { name: li.name, description: `Service for ${session.companyName}` },
          unit_amount: li.amount,
        },
        quantity: li.qty,
      })),
      metadata: {
        hriq_type: "onboarding_payment",
        hriq_onboarding_token: session.token,
        hriq_company: session.companyName || "",
        hriq_plan: session.paymentMethod || "",
      },
      success_url: `${process.env.NEXT_PUBLIC_APP_URL || ""}/org-onboard/${session.token}?payment=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || ""}/org-onboard/${session.token}?payment=cancelled`,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    });

    return { url: checkoutSession.url! };
  } catch (err) {
    console.error("[HRIQ] Onboarding checkout error:", err);
    return { error: "Failed to create payment session" };
  }
}

// ─── Splitit 2-step financing flow ───────────────────────────────────────────
// Step 1: QB invoice for the 10% financing fee → RL collects this
// Step 2: Splitit installment plan for the BASE amount only

// Public: Step 1 — QB invoice for 10% financing fee (no auth — token is auth)

// Public: Step 2 — Splitit installment plan for BASE amount only (no auth — token is auth)
// Called after the 10% fee invoice has been paid via QB/Stripe.
export async function createSplititCheckout(token: string, numberOfInstallments?: number) {
  if (!token) return { error: "Invalid token" };
  const session = await database.orgOnboardingSession.findUnique({ where: { token } });
  if (!session) return { error: "Session not found" };
  if (session.status === "completed") return { error: "Already completed" };
  if (session.expiresAt < new Date()) return { error: "Session expired" };

  const prefs = (session.preferences as Record<string, unknown>) ?? {};
  if (prefs.prepaid) return { error: "Payment already collected" };
  if (!session.paymentMethod) return { error: "No service plan selected" };
  if (!session.companyName) return { error: "Company name is required" };

  const isPPP = session.paymentMethod === "ppp" || session.paymentMethod === "both";
  const isCOR = session.paymentMethod === "cor" || session.paymentMethod === "both";
  const vaCount = typeof prefs.vaCount === "number" ? Math.max(prefs.vaCount, 1) : 1;

  const baseTotal = typeof prefs.splititBaseTotal === "number"
    ? prefs.splititBaseTotal
    : (isPPP ? 3000 * vaCount : 0) + (isCOR ? 4200 * vaCount : 0);

  const installments = numberOfInstallments
    ?? (typeof prefs.splititInstallments === "number" ? prefs.splititInstallments : 3);

  // Customer finances the full amount including the 10% fee — nothing due today
  const { applyFinancingFee, createSplititInstallmentPlan } = await import("@repo/integrations/splitit");
  const totalWithFee = applyFinancingFee(baseTotal, 10);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  const successUrl = `${appUrl}/org-onboard/${session.token}?payment=success`;
  const cancelUrl = `${appUrl}/org-onboard/${session.token}?payment=cancelled`;

  try {
    const result = await createSplititInstallmentPlan({
      totalAmount: totalWithFee,
      currency: "USD",
      numberOfInstallments: installments,
      refOrderNumber: session.id,
      customerEmail: session.billingEmail || session.contactEmail || undefined,
      customerName: session.contactName || session.companyName || undefined,
      billingAddress: session.address ? { addressLine1: session.address, country: session.country || "USA" } : undefined,
      successUrl,
      cancelUrl,
    });

    await database.orgOnboardingSession.update({
      where: { id: session.id },
      data: {
        preferences: {
          ...prefs,
          splititPlanNumber: result.installmentPlanNumber,
          splititInstallments: installments,
          splititTotal: totalWithFee,
          paymentProcessor: "splitit",
        },
      },
    });

    return { url: result.checkoutUrl, planNumber: result.installmentPlanNumber };
  } catch (err) {
    console.error("[HRIQ] Splitit checkout error:", err);
    return { error: err instanceof Error ? err.message : "Failed to create Splitit financing plan" };
  }
}

// RL Admin: create a payment + contract link for an already-created org
export async function createPaymentContractLinkForOrg(data: {
  orgId: string;
  orgName: string;
  adminEmail: string;
  adminName?: string;
  plan: "ppp" | "cor" | "both";
  vaCount: number;
}) {
  await requireRole("super_admin");

  const paymentMethod = data.plan === "ppp" ? "ppp" : data.plan === "cor" ? "cor" : "both";
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  const session = await database.orgOnboardingSession.create({
    data: {
      organizationId: data.orgId,
      companyName: data.orgName,
      contactEmail: data.adminEmail ? normalizeEmail(data.adminEmail) : null,
      contactName: data.adminName || null,
      status: "in_progress",
      currentStep: 6,
      totalSteps: 7,
      expiresAt,
      paymentMethod,
      preferences: {
        vaCount: data.vaCount,
        plan: data.plan,
        prepaid: false,
        paymentOnly: true,
      } as any,
    },
  });

  const url = `${process.env.NEXT_PUBLIC_APP_URL || ""}/org-onboard/${session.token}`;

  let emailSent = false;
  if (data.adminEmail) {
    try {
      const { sendInternalPaymentLinkEmail } = await import("./send-email");
      const planRates: Record<string, number> = { ppp: 3000, cor: 4200, both: 7200 };
      const annualTotal = (planRates[data.plan] ?? 3000) * data.vaCount;
      await sendInternalPaymentLinkEmail(
        normalizeEmail(data.adminEmail),
        data.adminName || "",
        data.orgName,
        url,
        data.plan,
        data.vaCount,
        annualTotal,
        expiresAt,
      );
      emailSent = true;
      console.log("[HRIQ] Payment link email sent successfully to:", normalizeEmail(data.adminEmail), "for org:", data.orgName);
    } catch (emailErr) {
      console.error("[HRIQ] Failed to send internal payment link email to:", data.adminEmail, "error:", emailErr);
    }
  }

  return { url, emailSent, token: session.token };
}

// ─── Document Signing (JotForm Client Account) ──────────────────────────────

/**
 * Public: get the pre-filled JotForm agreement URL for an onboarding session.
 * No auth — token is the auth.
 */
export async function getOnboardingDocumentUrl(token: string) {
  if (!token) return { error: "Invalid token" };
  const session = await database.orgOnboardingSession.findUnique({ where: { token } });
  if (!session) return { error: "Session not found" };
  if (session.status === "completed") return { error: "Already completed" };
  if (session.expiresAt < new Date()) return { error: "Session expired" };

  try {
    const { JotFormClientService, isClientJotFormConfigured } = await import("@repo/integrations");
    if (!isClientJotFormConfigured()) {
      return { error: "Document signing is not configured" };
    }

    const prefs = (session.preferences as Record<string, unknown>) ?? {};
    const vaCount = typeof prefs.vaCount === "number" ? Math.max(prefs.vaCount, 1) : 1;

    const url = JotFormClientService.buildPrefillUrl({
      contactName: session.contactName,
      contactEmail: session.contactEmail,
      contactPhone: session.contactPhone,
      contactTitle: session.contactTitle,
      companyName: session.companyName,
      address: session.address,
      country: session.country,
      paymentMethod: session.paymentMethod,
      vaCount,
    });

    return { url, formId: JotFormClientService.getOnboardingFormId() };
  } catch (err) {
    console.error("[org-onboarding.ts:getOnboardingDocumentUrl]", err);
    return { error: "Failed to generate document URL" };
  }
}

/**
 * Public: check if the onboarding agreement has been signed (submitted) on JotForm.
 * Searches by email or company name. No auth — token is the auth.
 */
export async function checkOnboardingDocumentSigned(token: string) {
  if (!token) return { signed: false, error: "Invalid token" };
  const session = await database.orgOnboardingSession.findUnique({ where: { token } });
  if (!session) return { signed: false, error: "Session not found" };

  // If already marked as signed in preferences, skip API call
  const prefs = (session.preferences as Record<string, unknown>) ?? {};
  if (prefs.agreementSigned === true) {
    return { signed: true };
  }

  try {
    const { JotFormClientService, isClientJotFormConfigured } = await import("@repo/integrations");
    if (!isClientJotFormConfigured()) {
      // If not configured, don't block the flow — just skip the check
      return { signed: true };
    }

    // Try matching by email first, then by company name
    let submission = null;
    if (session.contactEmail) {
      submission = await JotFormClientService.checkSubmissionByEmail(session.contactEmail);
    }
    if (!submission && session.companyName) {
      submission = await JotFormClientService.checkSubmissionByCompanyName(session.companyName);
    }

    if (submission) {
      // Mark as signed in preferences to avoid repeated API calls
      await database.orgOnboardingSession.update({
        where: { id: session.id },
        data: {
          preferences: { ...prefs, agreementSigned: true, agreementSubmissionId: String(submission.id ?? "") },
        },
      });
      return { signed: true };
    }

    return { signed: false };
  } catch (err) {
    console.error("[org-onboarding.ts:checkOnboardingDocumentSigned]", err);
    // Don't block the flow on errors — just report not signed
    return { signed: false, error: "Failed to check document status" };
  }
}

// ─── Client Pipeline ──────────────────────────────────────────────────────────

export type PipelineStage = "link_sent" | "agreement_signed" | "paid" | "org_created" | "active";

export type PipelineItem = {
  id: string;
  stage: PipelineStage;
  companyName: string;
  contactName: string | null;
  contactEmail: string | null;
  contactTitle: string | null;
  paymentMethod: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  // Onboarding session data
  sessionId: string | null;
  sessionToken: string | null;
  sessionStatus: string | null;
  agreementSigned: boolean;
  // Organization data (if created)
  orgId: string | null;
  orgSlug: string | null;
  kycStatus: string | null;
  memberCount: number;
  contractorCount: number;
  vaSeats: number | null;
  planType: string | null;
};

function computePipelineStage(
  session: {
    status: string;
    preferences: Record<string, unknown> | null;
    organizationId: string | null;
  } | null,
  org: { kycStatus: string | null } | null
): PipelineStage {
  if (!session && org) {
    // Org created without onboarding session (manual)
    return org.kycStatus === "approved" ? "active" : "org_created";
  }
  if (!session) return "link_sent";
  const prefs = (session.preferences as Record<string, unknown>) ?? {};

  if (session.organizationId && org) {
    return org.kycStatus === "approved" ? "active" : "org_created";
  }
  if (session.status === "completed") return "paid";
  if (prefs.agreementSigned === true) return "agreement_signed";
  // draft or in_progress with link generated
  return "link_sent";
}

/** RL Admin: get all pipeline items */
export async function getClientPipeline(): Promise<PipelineItem[]> {
  const authSession = await requireRole("super_admin");

  // Fetch all onboarding sessions (not expired)
  const sessions = await database.orgOnboardingSession.findMany({
    where: { status: { notIn: ["expired", "lead"] } },
    include: {
      organization: {
        select: {
          id: true, slug: true,
          profile: { select: { kycStatus: true, vaSeats: true, planType: true } },
          _count: { select: { members: true, employees: true } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  // Fetch all orgs that DON'T have an onboarding session (created manually)
  // Exclude RL internal org — it's not a client
  const sessionOrgIds = sessions.filter((s) => s.organizationId).map((s) => s.organizationId!);
  const excludeOrgIds = [...sessionOrgIds];
  // Find the super admin's home org to exclude it
  const homeOrgMembership = await database.organizationMember.findFirst({
    where: { userId: authSession.userId, role: "super_admin" },
    select: { organizationId: true },
  });
  if (homeOrgMembership) excludeOrgIds.push(homeOrgMembership.organizationId);

  const standaloneOrgs = await database.organization.findMany({
    where: excludeOrgIds.length > 0 ? { id: { notIn: excludeOrgIds } } : {},
    select: {
      id: true, name: true, slug: true, createdAt: true, updatedAt: true,
      profile: {
        select: {
          kycStatus: true, adminName: true, adminEmail: true, adminTitle: true,
          paymentMethod: true, vaSeats: true, planType: true,
        },
      },
      _count: { select: { members: true, employees: true } },
    },
  });

  const items: PipelineItem[] = [];

  // Pipeline items from onboarding sessions
  const homeOrgId = homeOrgMembership?.organizationId ?? null;

  for (const s of sessions) {
    // Skip sessions linked to the RL internal org
    if (homeOrgId && s.organizationId === homeOrgId) continue;
    const orgProfile = s.organization?.profile;
    const stage = computePipelineStage(
      { status: s.status, preferences: s.preferences as Record<string, unknown> | null, organizationId: s.organizationId },
      orgProfile ? { kycStatus: orgProfile.kycStatus } : null
    );
    const prefs = (s.preferences as Record<string, unknown>) ?? {};
    items.push({
      id: `session-${s.id}`,
      stage,
      companyName: s.companyName || "Unnamed",
      contactName: s.contactName,
      contactEmail: s.contactEmail,
      contactTitle: s.contactTitle,
      paymentMethod: s.paymentMethod,
      notes: s.notes,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      sessionId: s.id,
      sessionToken: s.token,
      sessionStatus: s.status,
      agreementSigned: prefs.agreementSigned === true,
      orgId: s.organizationId,
      orgSlug: s.organization?.slug ?? null,
      kycStatus: orgProfile?.kycStatus ?? null,
      memberCount: s.organization?._count?.members ?? 0,
      contractorCount: s.organization?._count?.employees ?? 0,
      vaSeats: orgProfile?.vaSeats ?? null,
      planType: orgProfile?.planType ?? null,
    });
  }

  // Pipeline items from standalone orgs
  for (const o of standaloneOrgs) {
    const stage = computePipelineStage(null, { kycStatus: o.profile?.kycStatus ?? null });
    items.push({
      id: `org-${o.id}`,
      stage,
      companyName: o.name,
      contactName: o.profile?.adminName ?? null,
      contactEmail: o.profile?.adminEmail ?? null,
      contactTitle: o.profile?.adminTitle ?? null,
      paymentMethod: o.profile?.paymentMethod ?? null,
      notes: null,
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
      expiresAt: null,
      sessionId: null,
      sessionToken: null,
      sessionStatus: null,
      agreementSigned: false, // unknown for standalone orgs
      orgId: o.id,
      orgSlug: o.slug,
      kycStatus: o.profile?.kycStatus ?? null,
      memberCount: o._count.members,
      contractorCount: o._count.employees,
      vaSeats: o.profile?.vaSeats ?? null,
      planType: o.profile?.planType ?? null,
    });
  }

  return items;
}

/** RL Admin: build a pre-filled JotForm agreement URL from form data (no session needed) */
export async function buildAgreementUrl(data: {
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  contactTitle?: string;
  companyName?: string;
  address?: string;
  country?: string;
  paymentMethod?: string;
  vaCount?: number;
}) {
  await requireRole("super_admin");
  try {
    const { JotFormClientService, isClientJotFormConfigured } = await import("@repo/integrations");
    if (!isClientJotFormConfigured()) {
      return { error: "JotForm client not configured. Set JOTFORM_CLIENT_API_KEY and JOTFORM_CLIENT_ONBOARDING_FORM_ID." };
    }
    const url = JotFormClientService.buildPrefillUrl(data);
    return { url };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to generate agreement URL" };
  }
}

/** RL Admin: check if a JotForm agreement was submitted for a given email/company */
export async function checkAgreementSubmission(email?: string, companyName?: string) {
  await requireRole("super_admin");
  try {
    const { JotFormClientService, isClientJotFormConfigured } = await import("@repo/integrations");
    if (!isClientJotFormConfigured()) return { signed: true }; // don't block if not configured
    let found = null;
    if (email) found = await JotFormClientService.checkSubmissionByEmail(email);
    if (!found && companyName) found = await JotFormClientService.checkSubmissionByCompanyName(companyName);
    return { signed: !!found };
  } catch {
    return { signed: false, error: "Failed to check" };
  }
}
