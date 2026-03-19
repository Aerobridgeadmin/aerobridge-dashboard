-- QuickBooks OAuth token storage
CREATE TABLE IF NOT EXISTS hriq_qb_tokens (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  access_token_expires_at TIMESTAMPTZ NOT NULL,
  refresh_token_expires_at TIMESTAMPTZ NOT NULL,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- QuickBooks sync tracking on payments
ALTER TABLE hriq_payments
  ADD COLUMN IF NOT EXISTS qb_bill_id TEXT,
  ADD COLUMN IF NOT EXISTS qb_bill_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS qb_vendor_id TEXT,
  ADD COLUMN IF NOT EXISTS qb_synced_at TIMESTAMPTZ;

-- QuickBooks vendor ID on employees
ALTER TABLE hriq_employees
  ADD COLUMN IF NOT EXISTS qb_vendor_id TEXT;

-- Index for unsynced payments
CREATE INDEX IF NOT EXISTS idx_payments_qb_unsynced
  ON hriq_payments (status)
  WHERE qb_synced_at IS NULL AND status = 'completed';
