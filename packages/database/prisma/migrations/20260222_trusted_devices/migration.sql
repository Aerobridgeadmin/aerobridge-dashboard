-- Trusted devices for OTP-skip on repeat logins (30-day trust window)
CREATE TABLE IF NOT EXISTS "trusted_devices" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "user_agent" TEXT,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "trusted_devices_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "trusted_devices_email_idx" ON "trusted_devices"("email");
CREATE INDEX IF NOT EXISTS "trusted_devices_token_hash_idx" ON "trusted_devices"("token_hash");

-- Disable RLS (Prisma service role access only)
ALTER TABLE "trusted_devices" DISABLE ROW LEVEL SECURITY;
