"use server";

import { getSessionContext } from "@repo/auth/session";
import { database } from "@repo/database";

export const searchUsers = async (
  query: string
): Promise<
  | {
      data: string[];
    }
  | {
      error: unknown;
    }
> => {
  try {
    const session = await getSessionContext();

    if (!session?.userId) {
      throw new Error("Not logged in");
    }

    if (!session.orgId) {
      throw new Error("No organization selected");
    }

    // Only super_admin, admin, client, and manager roles can search users
    if (!["super_admin", "admin", "manager"].includes(session.orgRole ?? "")) {
      throw new Error("You do not have permission to search users");
    }

    // Get organization members from database
    const members = await database.organizationMember.findMany({
      where: {
        organizationId: session.orgId,
      },
    });

    const data = members.map((member: any) => member.userId);

    return { data };
  } catch (error) {
    return { error };
  }
};
