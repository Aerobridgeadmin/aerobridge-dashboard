import { database } from "@repo/database";
import { NextResponse } from "next/server";

export const maxDuration = 60;

/**
 * Daily cron: scrub PII from employees offboarded for 30+ days.
 * Retains: id, employeeNumber, employmentStatus, offboardingStatus, legalFirstName,
 *          legalLastName, organizationId, startDate, endDate, createdAt, updatedAt,
 *          department, jobTitle, employmentType, hourlyRate, currency.
 * Scrubs: personal contact info, banking details, addresses, emergency contacts,
 *         photos, external system IDs, self-service tokens.
 * Schedule: Daily at 4am UTC  vercel.json: "0 4 * * *"
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Find offboarded employees with endDate 30+ days ago that haven't been scrubbed yet
  // Also include those with null endDate but updatedAt 30+ days ago (legacy offboards without endDate)
  const candidates = await database.employee.findMany({
    where: {
      employmentStatus: "offboarded",
      OR: [
        { endDate: { lt: thirtyDaysAgo } },
        { endDate: null, updatedAt: { lt: thirtyDaysAgo } },
      ],
      // At least one PII field is still populated (not yet scrubbed)
      AND: {
        OR: [
          { personalEmail: { not: null } },
          { workEmail: { not: null } },
          { phoneNumber: { not: null } },
          { bankAccountNumber: { not: null } },
          { streetAddress: { not: null } },
          { dateOfBirth: { not: null } },
        ],
      },
    },
    select: {
      id: true,
      legalFirstName: true,
      legalLastName: true,
      personalEmail: true,
      endDate: true,
      organizationId: true,
    },
  });

  if (candidates.length === 0) {
    return NextResponse.json({
      ok: true,
      scrubbed: 0,
      message: "No offboarded employees eligible for PII cleanup.",
      timestamp: new Date().toISOString(),
    });
  }

  let scrubbed = 0;
  const errors: string[] = [];

  for (const emp of candidates) {
    try {
      await database.employee.update({
        where: { id: emp.id },
        data: {
          // Scrub personal contact info
          personalEmail: null,
          workEmail: null,
          phoneNumber: null,
          mobileNumber: null,
          homePhone: null,
          photoUrl: null,

          // Scrub addresses
          streetAddress: null,
          city: null,
          stateProvince: null,
          postalCode: null,

          // Scrub personal details
          dateOfBirth: null,

          // Scrub banking/payment info
          bankName: null,
          bankAccountNumber: null,
          bankAccountName: null,
          bankSwiftCode: null,
          bankRoutingNumber: null,
          debitCardNumber: null,
          bankAddress: null,
          paymentAccountInfo: null,

          // Scrub emergency contacts
          emergencyContactName: null,
          emergencyContactPhone: null,
          emergencyContactRelation: null,

          // Scrub external system links
          timeDoctorEmail: null,
          slackInviteToken: null,
          selfServiceToken: null,
          googleSheetId: null,

          // Scrub Stripe/Wise payment accounts
          stripeAccountId: null,
          stripeAccountStatus: null,
          wiseRecipientId: null,
          wiseRecipientCurrency: null,
          wiseRecipientType: null,
          wiseRecipientSyncedAt: null,

          // Scrub QuickBooks
          qbVendorId: null,

          // Scrub linked user
          linkedUserId: null,
        },
      });

      // Also delete associated documents (uploaded files)
      await database.document.deleteMany({
        where: { employeeId: emp.id },
      });

      // Audit the scrub
      await database.auditLog.create({
        data: {
          organizationId: emp.organizationId,
          actorType: "system",
          action: "employee.pii_scrubbed",
          objectType: "employee",
          objectId: emp.id,
          newValue: {
            reason: "30-day post-offboarding data retention policy",
            offboardedDate: emp.endDate?.toISOString(),
            scrubDate: new Date().toISOString(),
          },
        },
      });

      scrubbed++;
    } catch (err) {
      const name = `${emp.legalFirstName} ${emp.legalLastName}`;
      const msg = err instanceof Error ? err.message : "Unknown error";
      errors.push(`${name} (${emp.id}): ${msg}`);
      console.error(`[Offboarded Cleanup] Failed to scrub ${emp.id}:`, err);
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    scrubbed,
    total: candidates.length,
    errors: errors.length > 0 ? errors : undefined,
    timestamp: new Date().toISOString(),
  });
}
