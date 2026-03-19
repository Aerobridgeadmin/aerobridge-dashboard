import "server-only";
import { database } from "@repo/database";
import { createClient } from "./server";

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48)
    + "-" + Date.now().toString(36);
}

export const createOrganization = async (name: string, userId: string) => {
  const slug = generateSlug(name);

  const organization = await database.organization.create({
    data: {
      name,
      slug,
      members: {
        create: {
          userId,
          role: "admin",
        },
      },
    },
  });

  // Set as active organization
  const supabase = await createClient();
  await supabase.auth.updateUser({
    data: { activeOrganizationId: organization.id },
  });

  return organization;
};

export const getOrganizations = async (userId: string) => {
  return await database.organizationMember.findMany({
    where: { userId },
    include: {
      organization: true,
    },
  });
};

export const switchOrganization = async (organizationId: string) => {
  const supabase = await createClient();
  await supabase.auth.updateUser({
    data: { activeOrganizationId: organizationId },
  });
};

export const inviteToOrganization = async (
  organizationId: string,
  email: string,
  role: string = "member"
) => {
  const invitation = await database.organizationInvitation.create({
    data: {
      organizationId,
      email,
      role,
      invitedBy: "", // Will be set by caller
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    },
  });

  // TODO: Send invitation email via @repo/email

  return invitation;
};
