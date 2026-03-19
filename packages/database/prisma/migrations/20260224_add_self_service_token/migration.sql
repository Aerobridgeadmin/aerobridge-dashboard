-- Add self_service_token column to hriq_employees
-- This replaces the use of employee ID as a public access token (IDOR fix)
ALTER TABLE "hriq_employees" ADD COLUMN "self_service_token" TEXT;

-- Create unique index
CREATE UNIQUE INDEX "hriq_employees_self_service_token_key" ON "hriq_employees"("self_service_token");

-- Backfill existing employees with secure random tokens
UPDATE "hriq_employees"
SET "self_service_token" = encode(gen_random_bytes(32), 'hex')
WHERE "self_service_token" IS NULL;
