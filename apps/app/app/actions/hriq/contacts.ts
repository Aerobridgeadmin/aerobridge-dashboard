"use server";

import { revalidatePath } from "next/cache";

import { database } from "@repo/database";
import { HriqError } from "@/lib/hriq/errors";

async function requireSuperAdmin() {
  const { getSessionContext } = await import("@repo/auth/session");
  const session = await getSessionContext();
  if (!session) throw new HriqError("HRIQ-0101", "Not authenticated");
  if (session.orgRole !== "super_admin") throw new HriqError("HRIQ-0105", "Super admin access required");
  return session;
}

export async function getContacts(filters?: { organizationId?: string; search?: string; activeOnly?: boolean }) {
  try {
    const session = await requireSuperAdmin();

  const where: Record<string, unknown> = {};
  if (filters?.organizationId) where.organizationId = filters.organizationId;
  if (filters?.activeOnly !== false) where.isActive = true;
  if (filters?.search) {
    where.OR = [
      { fullName: { contains: filters.search, mode: "insensitive" } },
      { email: { contains: filters.search, mode: "insensitive" } },
      { organization: { name: { contains: filters.search, mode: "insensitive" } } },
    ];
  }

  return database.contact.findMany({
    where,
    include: { organization: { select: { id: true, name: true, slug: true } } },
    orderBy: [{ organization: { name: "asc" } }, { fullName: "asc" }],
  });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[contacts.ts:getContacts]", msg);
    return { error: msg };
  }

}


export async function createContact(data: {
  organizationId: string;
  fullName: string;
  email?: string;
  phone?: string;
  jobTitle?: string;
  role?: string;
  notes?: string;
}) {
  try {
    const session = await requireSuperAdmin();

  if (!data.fullName?.trim()) throw new HriqError("HRIQ-9903", "Name is required");
  if (!data.organizationId?.trim()) throw new HriqError("HRIQ-9903", "Organization is required");

  // Verify org exists
  const org = await database.organization.findUnique({
    where: { id: data.organizationId },
    select: { id: true },
  });
  if (!org) throw new HriqError("HRIQ-0201", "Organization not found");

  const contact = await database.contact.create({
    data: {
      organizationId: data.organizationId,
      fullName: data.fullName.trim(),
      email: data.email?.trim() || null,
      phone: data.phone?.trim() || null,
      jobTitle: data.jobTitle?.trim() || null,
      role: data.role || "primary",
      notes: data.notes?.trim() || null,
      createdByUserId: session.userId,
      createdByName: session.name ?? undefined,
    },
  });

  revalidatePath("/[orgSlug]/contacts", "page");
  return contact;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[contacts.ts:createContact]", msg);
    return { error: msg };
  }

}


export async function updateContact(
  contactId: string,
  data: {
    fullName?: string;
    email?: string;
    phone?: string;
    jobTitle?: string;
    role?: string;
    notes?: string;
    isActive?: boolean;
  }
) {
  try {
    const session = await requireSuperAdmin();

  const existing = await database.contact.findUnique({
    where: { id: contactId },
    select: { id: true },
  });
  if (!existing) throw new HriqError("HRIQ-0201", "Contact not found");

  const updateData: Record<string, unknown> = {};
  if (data.fullName !== undefined) updateData.fullName = data.fullName.trim();
  if (data.email !== undefined) updateData.email = data.email?.trim() || null;
  if (data.phone !== undefined) updateData.phone = data.phone?.trim() || null;
  if (data.jobTitle !== undefined) updateData.jobTitle = data.jobTitle?.trim() || null;
  if (data.role !== undefined) updateData.role = data.role;
  if (data.notes !== undefined) updateData.notes = data.notes?.trim() || null;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;

  const updated = await database.contact.update({
    where: { id: contactId },
    data: updateData,
  });

  revalidatePath("/[orgSlug]/contacts", "page");
  return updated;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[contacts.ts:updateContact]", msg);
    return { error: msg };
  }

}


export async function deleteContact(contactId: string) {
  try {
    const session = await requireSuperAdmin();

  await database.contact.delete({ where: { id: contactId } });

  revalidatePath("/[orgSlug]/contacts", "page");
  return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[contacts.ts:deleteContact]", msg);
    return { error: msg };
  }

}

