CREATE INDEX CONCURRENTLY IF NOT EXISTS "hriq_employees_onboarding_status_idx"
  ON "hriq_employees" ("onboarding_status");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "hriq_employees_personal_email_idx"
  ON "hriq_employees" ("personal_email");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "hriq_employees_work_email_idx"
  ON "hriq_employees" ("work_email");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "hriq_documents_status_idx"
  ON "hriq_documents" ("status");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "hriq_announcements_is_active_idx"
  ON "hriq_announcements" ("is_active");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "hriq_onboarding_steps_step_type_idx"
  ON "hriq_onboarding_steps" ("step_type");
