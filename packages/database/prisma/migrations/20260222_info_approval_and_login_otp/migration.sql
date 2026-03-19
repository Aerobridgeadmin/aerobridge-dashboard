-- Add contractor info approval status
ALTER TABLE "hriq_employees" ADD COLUMN IF NOT EXISTS "info_approval_status" TEXT;

-- Create login verification table for email OTP
CREATE TABLE IF NOT EXISTS "login_verifications" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_verifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "login_verifications_email_code_idx" ON "login_verifications"("email", "code");
