import { defineConfig } from "prisma/config";
import "dotenv/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Use DIRECT_URL for migrations (session mode, not pooled)
    // Fall back to DATABASE_URL for development
    url: process.env.DIRECT_URL || process.env.DATABASE_URL || "",
  },
});
