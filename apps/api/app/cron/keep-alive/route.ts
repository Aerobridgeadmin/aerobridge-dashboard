import { database } from "@repo/database";

export const GET = async () => {
  // Simple keep-alive: count organizations to verify DB connectivity
  const count = await database.organization.count();

  return new Response(`OK: ${count} orgs`, { status: 200 });
};
