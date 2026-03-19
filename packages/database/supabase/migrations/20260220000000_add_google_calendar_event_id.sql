ALTER TABLE "hriq_onboarding_sessions"
ADD COLUMN IF NOT EXISTS "google_calendar_event_id" TEXT;
