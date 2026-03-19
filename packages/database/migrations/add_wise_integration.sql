-- Wise Integration: Add Wise recipient tracking to employees
-- This links HRIQ contractors to their Wise recipient accounts for automated payouts

-- Add Wise recipient fields to employees
ALTER TABLE hriq_employees
  ADD COLUMN IF NOT EXISTS wise_recipient_id INTEGER,
  ADD COLUMN IF NOT EXISTS wise_recipient_currency TEXT,
  ADD COLUMN IF NOT EXISTS wise_recipient_type TEXT,
  ADD COLUMN IF NOT EXISTS wise_recipient_synced_at TIMESTAMPTZ;

-- Add Wise transfer tracking to payments
ALTER TABLE hriq_payments
  ADD COLUMN IF NOT EXISTS wise_transfer_id INTEGER,
  ADD COLUMN IF NOT EXISTS wise_quote_id TEXT,
  ADD COLUMN IF NOT EXISTS wise_transfer_status TEXT,
  ADD COLUMN IF NOT EXISTS wise_source_amount DECIMAL(12, 2),
  ADD COLUMN IF NOT EXISTS wise_target_amount DECIMAL(12, 2),
  ADD COLUMN IF NOT EXISTS wise_target_currency TEXT,
  ADD COLUMN IF NOT EXISTS wise_exchange_rate DECIMAL(16, 6),
  ADD COLUMN IF NOT EXISTS wise_fee DECIMAL(12, 2),
  ADD COLUMN IF NOT EXISTS wise_estimated_delivery TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS wise_funded_at TIMESTAMPTZ;

-- Index for looking up payments by Wise transfer ID
CREATE INDEX IF NOT EXISTS idx_payments_wise_transfer_id ON hriq_payments (wise_transfer_id) WHERE wise_transfer_id IS NOT NULL;

-- Index for looking up employees by Wise recipient
CREATE INDEX IF NOT EXISTS idx_employees_wise_recipient ON hriq_employees (wise_recipient_id) WHERE wise_recipient_id IS NOT NULL;

COMMENT ON COLUMN hriq_employees.wise_recipient_id IS 'Wise recipient account ID for automated payouts';
COMMENT ON COLUMN hriq_payments.wise_transfer_id IS 'Wise transfer ID when payment is processed via Wise API';
