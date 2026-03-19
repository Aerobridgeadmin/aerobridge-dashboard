-- Add bonus/commission support to timesheet submissions
ALTER TABLE "timesheet_submissions"
  ADD COLUMN IF NOT EXISTS "bonuses" JSONB,
  ADD COLUMN IF NOT EXISTS "bonus_total" DECIMAL(10, 2) NOT NULL DEFAULT 0;
