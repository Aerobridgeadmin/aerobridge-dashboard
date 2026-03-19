-- Add Veriff KYC verification fields to org_profiles
-- Tracks client organization identity verification status

ALTER TABLE org_profiles
  ADD COLUMN IF NOT EXISTS kyc_status        TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS kyc_provider      TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS veriff_session_id TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS veriff_decision   JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS kyc_verified_at   TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS kyc_verified_name TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS kyc_document_type TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS kyc_document_country TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS kyc_rejection_reason TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS kyc_session_url   TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS kyc_initiated_at  TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS kyc_initiated_by  TEXT DEFAULT NULL;

-- Index for webhook lookup by veriff session ID
CREATE INDEX IF NOT EXISTS idx_org_profiles_veriff_session
  ON org_profiles (veriff_session_id)
  WHERE veriff_session_id IS NOT NULL;

-- Index for filtering orgs by KYC status
CREATE INDEX IF NOT EXISTS idx_org_profiles_kyc_status
  ON org_profiles (kyc_status);

COMMENT ON COLUMN org_profiles.kyc_status IS 'pending | created | started | submitted | approved | declined | resubmission_requested | expired';
COMMENT ON COLUMN org_profiles.kyc_provider IS 'veriff | stripe_identity | manual';
COMMENT ON COLUMN org_profiles.veriff_session_id IS 'Veriff verification session ID';
COMMENT ON COLUMN org_profiles.veriff_decision IS 'Full Veriff decision payload (JSON) for audit trail';
COMMENT ON COLUMN org_profiles.kyc_session_url IS 'Veriff verification URL sent to the client admin';
