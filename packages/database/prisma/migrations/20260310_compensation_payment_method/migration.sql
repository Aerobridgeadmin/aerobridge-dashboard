-- Add compensation type and payment method fields
ALTER TABLE "hriq_employees"
  ADD COLUMN IF NOT EXISTS "compensation_type" TEXT NOT NULL DEFAULT 'hourly',
  ADD COLUMN IF NOT EXISTS "monthly_salary" DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "preferred_payment_method" TEXT,
  ADD COLUMN IF NOT EXISTS "payment_method_verified" BOOLEAN NOT NULL DEFAULT false;
