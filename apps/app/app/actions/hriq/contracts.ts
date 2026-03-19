"use server";

import { requireOrg } from "@repo/auth/session";
import { database } from "@repo/database";
import { revalidatePath } from "next/cache";
import { HriqError } from "@/lib/hriq/errors";
import { serialize } from "@/lib/hriq/serialize";

//  Contract Templates 

export async function getContractTemplates() {
  const session = await requireOrg();

  return database.contractTemplate.findMany({
    where: { organizationId: session.orgId, isActive: true },
    include: { _count: { select: { signingRequests: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function createContractTemplate(data: {
  name: string;
  description?: string;
  category?: string;
  docusealTemplateId?: string;
}) {
  const session = await requireOrg();

  const template = await database.contractTemplate.create({
    data: {
      organizationId: session.orgId,
      name: data.name,
      description: data.description,
      category: data.category ?? "general",
      docusealTemplateId: data.docusealTemplateId,
      createdByUserId: session.userId,
    },
  });

  revalidatePath("/[orgSlug]/contracts", "page");

  return template;
}

export async function updateContractTemplate(
  id: string,
  data: { name?: string; description?: string; category?: string; isActive?: boolean; docusealTemplateId?: string }
) {
  const session = await requireOrg();
  const template = await database.contractTemplate.findFirst({
    where: { id, organizationId: session.orgId },
  });
  if (!template) throw new HriqError("HRIQ-0401");

  const updated = await database.contractTemplate.update({ where: { id }, data });

  revalidatePath("/[orgSlug]/contracts", "page");

  return updated;
}

//  Signing Requests 

export async function getSigningRequests(filters?: { employeeId?: string; status?: string }) {
  const session = await requireOrg();

  return database.contractSigningRequest.findMany({
    where: {
      employee: { organizationId: session.orgId },
      ...(filters?.employeeId ? { employeeId: filters.employeeId } : {}),
      ...(filters?.status ? { status: filters.status } : {}),
    },
    include: {
      employee: { select: { id: true, legalFirstName: true, legalLastName: true, employeeNumber: true } },
      template: { select: { id: true, name: true, category: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function createSigningRequest(data: {
  employeeId: string;
  templateId: string;
  signerEmail?: string;
  expiresInDays?: number;
}) {
  const session = await requireOrg();

  const employee = await database.employee.findFirst({
    where: { id: data.employeeId, organizationId: session.orgId },
  });
  if (!employee) throw new HriqError("HRIQ-0201");

  const template = await database.contractTemplate.findFirst({
    where: { id: data.templateId, organizationId: session.orgId },
  });
  if (!template) throw new HriqError("HRIQ-0401");

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + (data.expiresInDays ?? 14));

  const request = await database.contractSigningRequest.create({
    data: {
      employeeId: data.employeeId,
      templateId: data.templateId,
      signerEmail: data.signerEmail ?? employee.personalEmail ?? employee.workEmail,
      signerName: `${employee.legalFirstName} ${employee.legalLastName}`,
      expiresAt,
      createdByUserId: session.userId,
    },
  });

  try {
    await database.auditLog.create({
      data: {
        organizationId: session.orgId,
        actorType: "user",
        actorUserId: session.userId,
        action: "contract.signing_requested",
        objectType: "employee",
        objectId: data.employeeId,
        newValue: serialize({ templateName: template.name, requestId: request.id }),
      },
    });
  } catch (auditErr) {
    console.error("[HRIQ] Audit log write failed (non-blocking):", auditErr);
  }

  revalidatePath("/[orgSlug]/contracts", "page");

  return request;
}

export async function updateSigningRequestStatus(
  requestId: string,
  status: string,
  signedDocumentUrl?: string
) {
  try {
    const session = await requireOrg();

    const ALLOWED_SIGNING_STATUSES = ["pending", "sent", "viewed", "signed", "declined", "expired", "cancelled"];
    if (!ALLOWED_SIGNING_STATUSES.includes(status)) {
      throw new HriqError("HRIQ-0403", `Invalid signing status: ${status}`);
    }

    const request = await database.contractSigningRequest.findFirst({
      where: { id: requestId, employee: { organizationId: session.orgId } },
      include: {
        template: { select: { name: true, category: true } },
        employee: { select: { id: true } },
      },
    });
    if (!request) throw new HriqError("HRIQ-0402");

    const now = new Date();
    const updated = await database.contractSigningRequest.update({
      where: { id: requestId },
      data: {
        status,
        signedDocumentUrl,
        ...(status === "signed" ? { signedAt: now } : {}),
        ...(status === "viewed" ? { viewedAt: now } : {}),
        ...(status === "declined" ? { declinedAt: now } : {}),
        ...(status === "sent" ? { sentAt: now } : {}),
      },
    });

    // Only push to Documents once the contract is actually signed.
    if (status === "signed" && signedDocumentUrl) {
      const existing = await database.document.findFirst({
        where: {
          employeeId: request.employee.id,
          fileUrl: signedDocumentUrl,
        },
        select: { id: true },
      });

      if (!existing) {
        const documentType =
          request.template.category === "w8_ben" || request.template.category === "w9"
            ? "tax_form"
            : request.template.category === "offer_letter"
              ? "offer_letter"
              : "contract";

        await database.document.create({
          data: {
            employeeId: request.employee.id,
            documentType,
            documentName: request.template.name,
            description: `Signed via contract workflow (${requestId})`,
            fileUrl: signedDocumentUrl,
            status: "verified",
            verifiedAt: now,
            verifiedByUserId: session.userId,
            uploadedByUserId: session.userId,
            uploadedByName: session.name ?? undefined,
          },
        });
      }
    }

    revalidatePath("/[orgSlug]/contracts", "page");

    return updated;

  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[contracts.ts:updateSigningRequestStatus]", _msg);
    return { error: _msg };
  }
}
