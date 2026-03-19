-- Add ACH bank account fields to organizations
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "qb_bank_account_token" TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "qb_bank_account_last4" TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "ach_authorized_at" TIMESTAMPTZ;

-- Create ACH collections table
CREATE TABLE IF NOT EXISTS "hriq_ach_collections" (
    "id"               TEXT NOT NULL,
    "organization_id"  TEXT NOT NULL,
    "pay_period"       TEXT NOT NULL,
    "amount"           TEXT NOT NULL,
    "scheduled_date"   TIMESTAMPTZ NOT NULL,
    "payout_date"      TIMESTAMPTZ NOT NULL,
    "status"           TEXT NOT NULL DEFAULT 'SCHEDULED',
    "qb_charge_id"     TEXT,
    "qb_invoice_id"    TEXT,
    "retry_count"      INTEGER NOT NULL DEFAULT 0,
    "failure_reason"   TEXT,
    "collected_at"     TIMESTAMPTZ,
    "idempotency_key"  TEXT NOT NULL DEFAULT '',
    "created_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "hriq_ach_collections_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "hriq_ach_collections_org_period_key" UNIQUE ("organization_id", "pay_period"),
    CONSTRAINT "hriq_ach_collections_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "hriq_ach_collections_status_scheduled_date_idx"
    ON "hriq_ach_collections"("status", "scheduled_date");

CREATE INDEX IF NOT EXISTS "hriq_ach_collections_organization_id_idx"
    ON "hriq_ach_collections"("organization_id");
