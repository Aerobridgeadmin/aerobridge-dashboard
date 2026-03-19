"use server";
import { getContractorEmail } from "@/lib/hriq/utils";

import { revalidatePath } from "next/cache";

import { database } from "@repo/database";
import { APP_URL, normalizeAppUrl } from "./constants";

/**
 * Admin action: require a contractor to complete Cadana payment setup on next login.
 * Sets a flag on the employee record that the authenticated layout gate checks.
 * When the contractor next logs in, they'll be redirected to the payment gate
 * and must complete Cadana setup before accessing the dashboard.
 */
export async function setCadanaGateRequired(
  employeeId: string,
  required: boolean = true
): Promise<{ success: true } | { error: string }> {
  const { requireOrg } = await import("@repo/auth/session");
  const session = await requireOrg();

  if (!["super_admin", "admin"].includes(session.orgRole)) {
    return { error: "Only admins can manage Cadana login gates" };
  }

  const employee = await database.employee.findFirst({
    where: { id: employeeId },
    select: { id: true, legalFirstName: true, legalLastName: true, organizationId: true },
  });
  if (!employee) return { error: "Employee not found" };

  await database.employee.update({
    where: { id: employeeId },
    data: { cadanaGateRequired: required },
  });

  try {
    await database.auditLog.create({
      data: {
        organizationId: employee.organizationId ?? undefined,
        actorType: "user",
        actorUserId: session.userId,
        action: required ? "admin.cadana_gate_enabled" : "admin.cadana_gate_disabled",
        objectType: "employee",
        objectId: employeeId,
        newValue: { cadanaGateRequired: required },
        reason: required
          ? `Admin required ${employee.legalFirstName} ${employee.legalLastName} to set up Cadana on next login`
          : `Admin removed Cadana setup requirement for ${employee.legalFirstName} ${employee.legalLastName}`,
      },
    }).catch(() => {});
  } catch (err) { console.warn("[cadana-setup:setCadanaGateRequired] Suppressed error:", err); }

  revalidatePath("/[orgSlug]/employees/[id]", "page");
  return { success: true };
}

/**
 * Contractor self-service: save banking information for Cadana global payroll.
 * Stores the details on the employee record and marks the onboarding step complete.
 */
export async function saveContractorCadanaInfo(data: {
  currency: string;
  accountHolderName: string;
  bankName: string;
  accountNumber: string;
  routingNumber?: string;
  swiftCode?: string;
  country: string;
  address?: {
    streetAddress?: string;
    city?: string;
    state?: string;
    postalCode?: string;
  };
}): Promise<{ ok: true } | { error: string }> {
  const { requireSession } = await import("@repo/auth/session");
  const session = await requireSession();

  const employee = await database.employee.findFirst({
    where: {
      linkedUserId: session.userId,
      ...(session.orgId ? { organizationId: session.orgId } : {}),
    },
    select: {
      id: true,
      organizationId: true,
      cadanaPersonId: true,
    },
  });

  if (!employee) return { error: "No linked employee record found" };

  if (!data.currency?.trim()) return { error: "Currency is required" };
  if (!data.accountHolderName?.trim()) return { error: "Account holder name is required" };
  if (!data.bankName?.trim()) return { error: "Bank name is required" };
  if (!data.accountNumber?.trim()) return { error: "Account number is required" };
  if (!data.country?.trim()) return { error: "Country is required" };

  try {
    await database.employee.update({
      where: { id: employee.id },
      data: {
        bankName: data.bankName.trim(),
        bankAccountNumber: data.accountNumber.trim(),
        bankAccountName: data.accountHolderName.trim(),
        bankSwiftCode: data.swiftCode?.trim() || null,
        bankRoutingNumber: data.routingNumber?.trim() || null,
        country: data.country.trim(),
        currency: data.currency.trim(),
        cadanaSyncedAt: new Date(),
        preferredPaymentMethod: "cadana",
        // Clear the Cadana login gate flag now that setup is complete
        cadanaGateRequired: false,
        // Store address fields
        ...(data.address?.streetAddress ? { streetAddress: data.address.streetAddress.trim() } : {}),
        ...(data.address?.city ? { city: data.address.city.trim() } : {}),
        ...(data.address?.state ? { stateProvince: data.address.state.trim() } : {}),
        ...(data.address?.postalCode ? { postalCode: data.address.postalCode.trim() } : {}),
      },
    });

    // Run payment validation (same as token-based flow)
    try {
      const { validatePaymentMethod } = await import("@/app/actions/hriq/payment-validation");
      const result = await validatePaymentMethod("cadana", {
        bankName: data.bankName.trim(),
        bankAccountName: data.accountHolderName.trim(),
        bankAccountNumber: data.accountNumber.trim(),
        bankSwiftCode: data.swiftCode?.trim() || null,
        bankRoutingNumber: data.routingNumber?.trim() || null,
        bankAddress: null,
        country: data.country.trim(),
        currency: data.currency.trim(),
      });
      await database.employee.update({
        where: { id: employee.id },
        data: { paymentMethodVerified: result.valid },
      });
    } catch (err) { console.warn("[cadana-setup:saveContractorCadanaInfo] Suppressed error:", err); }

    // Auto-complete the Cadana payment onboarding step if one exists
    const cadanaStep = await database.onboardingStep.findFirst({
      where: {
        session: { employeeId: employee.id, status: { not: "cancelled" } },
        stepType: "payment_setup",
        stepName: { contains: "Cadana" },
        status: { not: "completed" },
      },
      select: { id: true },
    });

    if (cadanaStep) {
      await database.onboardingStep.update({
        where: { id: cadanaStep.id },
        data: { status: "completed", completedAt: new Date() },
      }).catch(() => {});
    }

    // Early Cadana onboarding (non-blocking)
    if (!employee.cadanaPersonId) {
      try {
        const cadana = await import("@repo/integrations/cadana");
        const emp = await database.employee.findUnique({
          where: { id: employee.id },
          select: {
            legalFirstName: true, legalLastName: true, personalEmail: true, workEmail: true,
            country: true, streetAddress: true, city: true, stateProvince: true, postalCode: true,
            department: true, hourlyRate: true, currency: true,
          },
        });
        if (emp) {
          let person;
          try {
            person = await cadana.onboardToCadana({
              firstName: emp.legalFirstName, lastName: emp.legalLastName,
              email: getContractorEmail(emp) ?? "",
              country: emp.country ?? data.country.trim(),
              streetAddress: emp.streetAddress ?? data.address?.streetAddress,
              city: emp.city ?? data.address?.city,
              state: emp.stateProvince ?? data.address?.state,
              postalCode: emp.postalCode ?? data.address?.postalCode,
              hourlyRate: emp.hourlyRate ? Number(emp.hourlyRate) : undefined,
              currency: emp.currency ?? data.currency.trim(),
            });
          } catch (createErr: any) {
            if (createErr?.message?.includes("already exists") || createErr?.message?.includes("400")) {
              person = await cadana.findCadanaPersonByEmail(getContractorEmail(emp) ?? "");
            }
          }
          if (person) {
            await database.employee.update({
              where: { id: employee.id },
              data: { cadanaPersonId: person.id, cadanaPersonStatus: person.status ?? "Active", cadanaSyncedAt: new Date() },
            });

            // Create Cadana user account so contractor gets login credentials
            try {
              const existingUser = await cadana.findCadanaUserByEmail(getContractorEmail(emp) ?? "");
              if (!existingUser) {
                await cadana.createCadanaUser(person.id);
                console.log(`[Cadana Setup] User account created for ${person.id}`);
              }
            } catch (userErr) {
              console.warn("[Cadana Setup] Failed to create Cadana user (non-critical):", userErr);
            }

            // Push bank payment info to Cadana so person is payable immediately
            if (data.accountNumber && data.bankName) {
              try {
                await cadana.updateCadanaPaymentInfo(person.id, {
                  preferredMethod: "bank",
                  bank: {
                    accountName: data.accountHolderName || `${emp.legalFirstName} ${emp.legalLastName}`,
                    accountNumber: data.accountNumber,
                    bankCode: data.routingNumber ?? data.swiftCode ?? "",
                    bankName: data.bankName,
                  },
                });
                console.log(`[Cadana Setup] Payment info pushed for ${person.id}`);
              } catch (payErr) {
                console.warn(`[Cadana Setup] Failed to push payment info (non-critical):`, payErr);
              }
            }
          }
        }
      } catch (e) {
        console.warn("[Cadana Setup] Early onboarding failed (non-critical):", e);
      }
    }

    try {
      await database.auditLog.create({
        data: {
          organizationId: employee.organizationId ?? undefined,
          actorType: "user",
          actorUserId: session.userId,
          action: "contractor.cadana_setup_completed",
          objectType: "employee",
          objectId: employee.id,
          newValue: {
            currency: data.currency,
            bankName: data.bankName,
            country: data.country,
          },
        },
      }).catch(() => {});
    } catch (err) { console.warn("[cadana-setup:saveContractorCadanaInfo] Suppressed error:", err); }

    revalidatePath("/contractor-payment-gate");
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    console.error("[Cadana Setup] saveContractorCadanaInfo failed:", err);
    return { error: err instanceof Error ? err.message : "Failed to save payment details" };
  }
}

// ─── Token-Based Cadana Setup (no auth — link sent via email) ──────────────────

/**
 * Fetch contractor data for the standalone Cadana setup form (accessed via secure token).
 */
export async function getEmployeeForCadanaSetup(token: string) {
  const employee = await database.employee.findFirst({
    where: { selfServiceToken: token },
    select: {
      id: true,
      legalFirstName: true,
      legalLastName: true,
      country: true,
      currency: true,
      bankName: true,
      bankAccountName: true,
      bankAccountNumber: true,
      bankSwiftCode: true,
      bankRoutingNumber: true,
      streetAddress: true,
      city: true,
      stateProvince: true,
      postalCode: true,
      cadanaPersonId: true,
      cadanaSyncedAt: true,
      employmentStatus: true,
    },
  });

  if (!employee) return null;
  const allowed = ["pre_hire", "onboarding_scheduled", "onboarding_in_progress", "active"];
  if (!allowed.includes(employee.employmentStatus)) return null;
  return employee;
}

/**
 * Save Cadana payment details from the standalone token-based form.
 */
export async function submitCadanaSetup(
  token: string,
  data: {
    currency: string;
    accountHolderName: string;
    bankName: string;
    accountNumber: string;
    routingNumber?: string;
    swiftCode?: string;
    country: string;
    address?: {
      streetAddress?: string;
      city?: string;
      state?: string;
      postalCode?: string;
    };
    extraData?: Record<string, string>;
  }
): Promise<{ ok: true } | { error: string }> {
  const employee = await database.employee.findFirst({
    where: { selfServiceToken: token },
    select: { id: true, organizationId: true, cadanaPersonId: true },
  });

  if (!employee) return { error: "Invalid or expired link" };

  if (!data.currency?.trim()) return { error: "Currency is required" };
  if (!data.accountHolderName?.trim()) return { error: "Account holder name is required" };
  if (!data.bankName?.trim()) return { error: "Bank name is required" };
  if (!data.accountNumber?.trim()) return { error: "Account number is required" };
  if (!data.country?.trim()) return { error: "Country is required" };

  try {
    await database.employee.update({
      where: { id: employee.id },
      data: {
        bankName: data.bankName.trim(),
        bankAccountNumber: data.accountNumber.trim(),
        bankAccountName: data.accountHolderName.trim(),
        bankSwiftCode: data.swiftCode?.trim() || null,
        bankRoutingNumber: data.routingNumber?.trim() || null,
        country: data.country.trim(),
        currency: data.currency.trim(),
        cadanaSyncedAt: new Date(),
        cadanaGateRequired: false,
        preferredPaymentMethod: "cadana",
        ...(data.address?.streetAddress ? { streetAddress: data.address.streetAddress.trim() } : {}),
        ...(data.address?.city ? { city: data.address.city.trim() } : {}),
        ...(data.address?.state ? { stateProvince: data.address.state.trim() } : {}),
        ...(data.address?.postalCode ? { postalCode: data.address.postalCode.trim() } : {}),
        ...(data.extraData && Object.keys(data.extraData).length > 0 ? { bankExtraData: data.extraData } : {}),
      },
    });

    // Run actual payment validation
    try {
      const { validatePaymentMethod } = await import("@/app/actions/hriq/payment-validation");
      const result = await validatePaymentMethod("cadana", {
        bankName: data.bankName.trim(),
        bankAccountName: data.accountHolderName.trim(),
        bankAccountNumber: data.accountNumber.trim(),
        bankSwiftCode: data.swiftCode?.trim() || null,
        bankRoutingNumber: data.routingNumber?.trim() || null,
        bankAddress: null,
        country: data.country.trim(),
        currency: data.currency.trim(),
      });
      await database.employee.update({
        where: { id: employee.id },
        data: { paymentMethodVerified: result.valid },
      });
    } catch (err) { console.warn("[cadana-setup:submitCadanaSetup] Suppressed error:", err); }

    // Auto-complete the Cadana onboarding step
    const cadanaStep = await database.onboardingStep.findFirst({
      where: {
        session: { employeeId: employee.id, status: { not: "cancelled" } },
        stepType: "payment_setup",
        stepName: { contains: "Cadana" },
        status: { not: "completed" },
      },
      select: { id: true },
    });
    if (cadanaStep) {
      await database.onboardingStep.update({
        where: { id: cadanaStep.id },
        data: { status: "completed", completedAt: new Date() },
      }).catch(() => {});
    }

    // Early Cadana onboarding: create person in Cadana now so they get wallet setup email
    // This way they're ready by the time admin needs to pay them
    if (!employee.cadanaPersonId) {
      try {
        const cadana = await import("@repo/integrations/cadana");
        const emp = await database.employee.findUnique({
          where: { id: employee.id },
          select: {
            legalFirstName: true, legalLastName: true, personalEmail: true, workEmail: true,
            country: true, streetAddress: true, city: true, stateProvince: true, postalCode: true,
            department: true, hourlyRate: true, currency: true,
          },
        });
        if (emp) {
          let person;
          try {
            person = await cadana.onboardToCadana({
              firstName: emp.legalFirstName,
              lastName: emp.legalLastName,
              email: getContractorEmail(emp) ?? "",
              country: emp.country ?? data.country.trim(),
              streetAddress: emp.streetAddress ?? data.address?.streetAddress,
              city: emp.city ?? data.address?.city,
              state: emp.stateProvince ?? data.address?.state,
              postalCode: emp.postalCode ?? data.address?.postalCode,
              hourlyRate: emp.hourlyRate ? Number(emp.hourlyRate) : undefined,
              currency: emp.currency ?? data.currency.trim(),
            });
          } catch (createErr: any) {
            // If already exists, find them
            if (createErr?.message?.includes("already exists") || createErr?.message?.includes("400")) {
              person = await cadana.findCadanaPersonByEmail(getContractorEmail(emp) ?? "");
            }
          }
          if (person) {
            await database.employee.update({
              where: { id: employee.id },
              data: { cadanaPersonId: person.id, cadanaPersonStatus: person.status ?? "Active", cadanaSyncedAt: new Date() },
            });

            // Create Cadana user account so contractor gets login credentials
            try {
              const existingUser = await cadana.findCadanaUserByEmail(getContractorEmail(emp) ?? "");
              if (!existingUser) {
                await cadana.createCadanaUser(person.id);
                console.log(`[Cadana Setup] User account created for ${person.id}`);
              }
            } catch (userErr) {
              console.warn("[Cadana Setup] Failed to create Cadana user (non-critical):", userErr);
            }

            // Push bank payment info to Cadana so person is payable immediately
            if (data.accountNumber && data.bankName) {
              try {
                await cadana.updateCadanaPaymentInfo(person.id, {
                  preferredMethod: "bank",
                  bank: {
                    accountName: data.accountHolderName || `${emp.legalFirstName} ${emp.legalLastName}`,
                    accountNumber: data.accountNumber,
                    bankCode: data.routingNumber ?? data.swiftCode ?? "",
                    bankName: data.bankName,
                  },
                });
                console.log(`[Cadana Setup] Payment info pushed for ${person.id}`);
              } catch (payErr) {
                console.warn(`[Cadana Setup] Failed to push payment info (non-critical):`, payErr);
              }
            }
          }
        }
      } catch (e) {
        console.warn("[Cadana Setup] Early onboarding failed (non-critical):", e);
      }
    }

    try {
      await database.auditLog.create({
        data: {
          organizationId: employee.organizationId ?? undefined,
          actorType: "system",
          action: "contractor.cadana_setup_via_link",
          objectType: "employee",
          objectId: employee.id,
          newValue: { currency: data.currency, bankName: data.bankName, country: data.country },
        },
      }).catch(() => {});
    } catch (err) { console.warn("[cadana-setup:submitCadanaSetup] Suppressed error:", err); }

    return { ok: true };
  } catch (err) {
    console.error("[Cadana Setup] submitCadanaSetup failed:", err);
    return { error: err instanceof Error ? err.message : "Failed to save payment details" };
  }
}

/**
 * Admin action: send the contractor a Cadana setup link via email.
 * Auto-generates a selfServiceToken if one doesn't exist yet.
 */
export async function sendCadanaSetupLink(
  employeeId: string
): Promise<{ success: boolean; message: string }> {
  const { requireRole } = await import("@repo/auth/session");
  const session = await requireRole("super_admin", "admin");

  const employee = await database.employee.findFirst({
    where: session.orgRole === "super_admin" ? { id: employeeId } : { id: employeeId, organizationId: session.orgId },
    select: {
      id: true,
      legalFirstName: true,
      legalLastName: true,
      preferredName: true,
      personalEmail: true,
      workEmail: true,
      selfServiceToken: true,
    },
  });

  if (!employee) return { success: false, message: "Employee not found." };

  const email = getContractorEmail(employee);
  if (!email) return { success: false, message: "No email address on file for this contractor." };

  // Generate token if missing
  let token = employee.selfServiceToken;
  if (!token) {
    token = crypto.randomUUID();
    await database.employee.update({
      where: { id: employeeId },
      data: { selfServiceToken: token },
    });
  }

  try {
    const { sendViaGmail } = await import("./send-email");
    const { layout, heading, greeting, paragraph, primaryButton } = await import("./email-templates");
    const appUrl = normalizeAppUrl(APP_URL);
    const name = employee.preferredName ?? employee.legalFirstName;

    const html = layout(
      heading("Set Up Your Payment Details") +
      greeting(name) +
      paragraph("To ensure you get paid on time, we need your banking information for international payroll via Cadana. It only takes a couple of minutes — please click the link below to set up your payment details.") +
      primaryButton("Set Up Cadana Payment", `${appUrl}/cadana-setup/${token}`)
    );

    try {
      await sendViaGmail(email, "Action Required — Set Up Your Payment Details (Cadana)", html);
    } catch (emailErr) {
      console.error("[HRIQ] Email send failed (non-blocking):", emailErr);
    }
  } catch (err) {
    console.error("[Cadana Setup] sendCadanaSetupLink — email failed:", err);
    return { success: false, message: "Failed to send email. Please try again." };
  }

  try {
    await database.auditLog.create({
      data: {
        organizationId: session.orgId,
        actorType: "user",
        actorUserId: session.userId,
        action: "employee.cadana_setup_link_sent",
        objectType: "employee",
        objectId: employeeId,
        newValue: { recipientEmail: email },
      },
    });
  } catch (err) { console.warn("[cadana-setup:sendCadanaSetupLink] Suppressed error:", err); }

  revalidatePath(`/[orgSlug]/employees/${employeeId}`, "page");

  const contractorName = `${employee.legalFirstName} ${employee.legalLastName}`;
  return { success: true, message: `Cadana setup link sent to ${contractorName} at ${email}.` };
}

/**
 * Admin action: invite a contractor to Cadana.
 * Creates the Person in Cadana (if not already there), then creates a User
 * account via /v1/users/invite (which triggers Cadana's own welcome email
 * with real login credentials), and finally sends our RL instructions email.
 */
export async function sendCadanaInvite(
  employeeId: string
): Promise<{ success: boolean; message: string }> {
  const { requireRole } = await import("@repo/auth/session");
  const session = await requireRole("super_admin", "admin");

  const employee = await database.employee.findFirst({
    where: session.orgRole === "super_admin" ? { id: employeeId } : { id: employeeId, organizationId: session.orgId },
    select: {
      id: true,
      legalFirstName: true,
      legalLastName: true,
      preferredName: true,
      personalEmail: true,
      workEmail: true,
      selfServiceToken: true,
      cadanaPersonId: true,
      cadanaPersonStatus: true,
      country: true,
      streetAddress: true,
      city: true,
      stateProvince: true,
      postalCode: true,
      department: true,
      hourlyRate: true,
      currency: true,
      jobTitle: true,
      startDate: true,
    },
  });

  if (!employee) return { success: false, message: "Employee not found." };

  const email = getContractorEmail(employee);
  if (!email) return { success: false, message: "No email address on file for this contractor." };

  // Step 1: Create person in Cadana if they don't already exist
  let cadanaPersonId = employee.cadanaPersonId;
  if (!cadanaPersonId) {
    try {
      const cadana = await import("@repo/integrations/cadana");
      let person;
      try {
        person = await cadana.onboardToCadana({
          firstName: employee.legalFirstName,
          lastName: employee.legalLastName,
          email,
          country: employee.country ?? "US",
          streetAddress: employee.streetAddress ?? undefined,
          city: employee.city ?? undefined,
          state: employee.stateProvince ?? undefined,
          postalCode: employee.postalCode ?? undefined,
          jobTitle: employee.jobTitle ?? undefined,
          department: employee.department ?? undefined,
          startDate: employee.startDate ? (employee.startDate as Date).toISOString().slice(0, 10) : undefined,
          hourlyRate: employee.hourlyRate ? Number(employee.hourlyRate) : undefined,
          currency: employee.currency ?? "USD",
        });
      } catch (createErr: any) {
        // If person already exists in Cadana, find them
        if (createErr?.message?.includes("already exists") || createErr?.message?.includes("400")) {
          person = await cadana.findCadanaPersonByEmail(email);
        } else {
          throw createErr;
        }
      }
      if (person) {
        cadanaPersonId = person.id;
        await database.employee.update({
          where: { id: employeeId },
          data: {
            cadanaPersonId: person.id,
            cadanaPersonStatus: person.status ?? "Active",
            cadanaSyncedAt: new Date(),
          },
        });
      }
    } catch (err) {
      console.error("[Cadana Invite] Failed to create person in Cadana:", err);
      return { success: false, message: `Failed to create person in Cadana: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  // Step 2: Create Cadana User (login account) via /v1/users/invite
  // This triggers Cadana's own welcome email with password setup.
  // Safe to call even if user already exists — returns null in that case.
  let cadanaUserCreated = false;
  if (cadanaPersonId) {
    try {
      const cadana = await import("@repo/integrations/cadana");
      const existingUser = await cadana.findCadanaUserByEmail(email);
      if (!existingUser) {
        const newUser = await cadana.createCadanaUser(cadanaPersonId);
        if (newUser) {
          cadanaUserCreated = true;
          console.log(`[Cadana Invite] Created user ${newUser.id} for person ${cadanaPersonId}`);
        }
      } else {
        console.log(`[Cadana Invite] User already exists (${existingUser.id}) for ${email} — skipping user creation`);
      }
    } catch (err) {
      // Non-fatal: person exists, user creation failed — log and continue with email
      console.error("[Cadana Invite] Failed to create Cadana user (non-fatal):", err);
    }
  }

  // Step 3: Send RL instructions email
  try {
    const { sendViaGmail } = await import("./send-email");
    const { layout, heading, greeting, paragraph, primaryButton, highlightBox } = await import("./email-templates");
    const name = employee.preferredName ?? employee.legalFirstName;

    const html = layout(
      heading("You've Been Invited to Cadana") +
      greeting(name) +
      paragraph("You've been added to <strong>Remote Leverage's</strong> organization on Cadana, our global payroll platform. To set up your account and start receiving payments, follow these steps:") +
      paragraph(
        '<strong style="font-size:14px;">Step 1:</strong> Check your inbox for a welcome email from <strong>Cadana</strong> with a link to set your password<br>' +
        '<strong style="font-size:14px;">Step 2:</strong> Click the link and create your password<br>' +
        '<strong style="font-size:14px;">Step 3:</strong> Log in at <a href="https://app.cadanapay.com" style="color:#FF5C21;">app.cadanapay.com</a> and set up your payment details'
      ) +
      paragraph('If you don\'t see the email from Cadana, check your spam/junk folder. If it\'s still missing, click <strong>"Forgot password?"</strong> on the Cadana login page and enter your email to request a new link.') +
      primaryButton("Go to Cadana", "https://app.cadanapay.com") +
      highlightBox("yellow", "<strong>Important:</strong> You must use the email <strong>" + email + "</strong> to log in — that's the email we registered you with. If you use a different email, you won't be connected to Remote Leverage."),
      "Once logged in, you can add your bank account, mobile money, or wallet. Contact your coordinator if you need help."
    );

    await sendViaGmail(email, "Action Required — Set Up Your Cadana Account", html);
  } catch (err) {
    console.error("[Cadana Invite] Email failed:", err);
    return { success: false, message: `Person ${cadanaUserCreated ? "and user " : ""}created in Cadana but failed to send RL instructions email.` };
  }

  // Step 4: Audit log
  try {
    await database.auditLog.create({
      data: {
        organizationId: session.orgId,
        actorType: "user",
        actorUserId: session.userId,
        action: "employee.cadana_invite_sent",
        objectType: "employee",
        objectId: employeeId,
        newValue: { recipientEmail: email, cadanaPersonId: cadanaPersonId ?? "pending", cadanaUserCreated },
      },
    });
  } catch (err) { console.warn("[cadana-setup:sendCadanaInvite] Suppressed error:", err); }

  revalidatePath(`/[orgSlug]/employees/${employeeId}`, "page");

  const contractorName = `${employee.legalFirstName} ${employee.legalLastName}`;
  return {
    success: true,
    message: `${contractorName} invited to Cadana org — email sent to ${email}.${cadanaPersonId ? ` Cadana ID: ${cadanaPersonId}` : ""}${cadanaUserCreated ? " (login credentials sent)" : ""}`,
  };
}
