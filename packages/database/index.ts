import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client";

const globalForPrisma = (globalThis as unknown) as { prisma: PrismaClient };

// Prefer pooler URL for serverless (Vercel) — falls back to direct connection
const connectionString = process.env.DATABASE_POOL_URL ?? process.env.DATABASE_URL ?? "";
const adapter = new PrismaPg({ connectionString });

const baseClient = globalForPrisma.prisma || new PrismaClient({ adapter });

// Safety net: cap all findMany queries to 500 rows when no explicit take is set.
// This prevents unbounded queries from spiking memory in serverless functions.
export const database = baseClient.$extends({
  query: {
    $allModels: {
      async findMany({ args, query }) {
        if (args.take === undefined) {
          args.take = 500;
        }
        return query(args);
      },
    },
  },
}) as unknown as typeof baseClient;

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = baseClient;
}

// biome-ignore lint/performance/noBarrelFile: re-exporting
export * from "./generated/client";
