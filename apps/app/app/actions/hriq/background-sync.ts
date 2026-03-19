"use server";

import { requireSession } from "@repo/auth/session";
import { database } from "@repo/database";

/**
 * Check for new pending hires since the given timestamp.
 * Returns new candidates detected by the RecruitCRM webhook.
 */
export async function checkNewPendingHires(since: string): Promise<{
  newCount: number;
  candidates: { firstName: string; lastName: string; position: string | null; createdAt: Date }[];
}> {
  const session = await requireSession();
  if (!["super_admin", "admin"].includes(session.orgRole)) {
    return { newCount: 0, candidates: [] };
  }

  const sinceDate = new Date(since);

  const newHires = await database.$queryRaw<
    Array<{ first_name: string; last_name: string; position: string | null; created_at: Date }>
  >`SELECT first_name, last_name, position, created_at
    FROM pending_hires
    WHERE status = 'pending' AND created_at > ${sinceDate}
    ORDER BY created_at DESC
    LIMIT 10`;

  return {
    newCount: newHires.length,
    candidates: newHires.map((h: any) => ({
      firstName: h.first_name,
      lastName: h.last_name,
      position: h.position,
      createdAt: h.created_at,
    })),
  };
}
