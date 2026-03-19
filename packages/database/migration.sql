-- HRiq Platform Migration v2: Safe migration that preserves existing data
-- Run via: supabase db push

-- Step 0: Drop NEW tables that were partially created in earlier runs (they have FKs blocking ALTER)
DROP TABLE IF EXISTS "timesheet_submissions" CASCADE;
DROP TABLE IF EXISTS "timesheet_periods" CASCADE;
DROP TABLE IF EXISTS "contract_signing_requests" CASCADE;
DROP TABLE IF EXISTS "contract_templates" CASCADE;
DROP TABLE IF EXISTS "app_users" CASCADE;
DROP TABLE IF EXISTS "organization_invitations" CASCADE;
DROP TABLE IF EXISTS "organization_members" CASCADE;
DROP TABLE IF EXISTS "organizations" CASCADE;

-- Step 1: Drop OLD Drizzle-created foreign keys on hriq_ tables
ALTER TABLE "hriq_access_provisioning" DROP CONSTRAINT IF EXISTS "hriq_access_provisioning_deprovisioned_by_user_id_users_id_fk";
ALTER TABLE "hriq_access_provisioning" DROP CONSTRAINT IF EXISTS "hriq_access_provisioning_employee_id_hriq_employees_id_fk";
ALTER TABLE "hriq_access_provisioning" DROP CONSTRAINT IF EXISTS "hriq_access_provisioning_provisioned_by_user_id_users_id_fk";
ALTER TABLE "hriq_announcements" DROP CONSTRAINT IF EXISTS "hriq_announcements_author_user_id_users_id_fk";
ALTER TABLE "hriq_audit_log" DROP CONSTRAINT IF EXISTS "hriq_audit_log_actor_user_id_users_id_fk";
ALTER TABLE "hriq_batch_sessions" DROP CONSTRAINT IF EXISTS "hriq_batch_sessions_created_by_user_id_users_id_fk";
ALTER TABLE "hriq_documents" DROP CONSTRAINT IF EXISTS "hriq_documents_employee_id_hriq_employees_id_fk";
ALTER TABLE "hriq_documents" DROP CONSTRAINT IF EXISTS "hriq_documents_uploaded_by_user_id_users_id_fk";
ALTER TABLE "hriq_documents" DROP CONSTRAINT IF EXISTS "hriq_documents_verified_by_user_id_users_id_fk";
ALTER TABLE "hriq_employees" DROP CONSTRAINT IF EXISTS "hriq_employees_created_by_user_id_users_id_fk";
ALTER TABLE "hriq_employees" DROP CONSTRAINT IF EXISTS "hriq_employees_linked_user_id_users_id_fk";
ALTER TABLE "hriq_employees" DROP CONSTRAINT IF EXISTS "hriq_employees_manager_id_hriq_employees_id_fk";
ALTER TABLE "hriq_manager_notes" DROP CONSTRAINT IF EXISTS "hriq_manager_notes_author_user_id_users_id_fk";
ALTER TABLE "hriq_manager_notes" DROP CONSTRAINT IF EXISTS "hriq_manager_notes_employee_id_hriq_employees_id_fk";
ALTER TABLE "hriq_onboarding_sessions" DROP CONSTRAINT IF EXISTS "hriq_onboarding_sessions_batch_session_id_hriq_batch_sessions_i";
ALTER TABLE "hriq_onboarding_sessions" DROP CONSTRAINT IF EXISTS "hriq_onboarding_sessions_employee_id_hriq_employees_id_fk";
ALTER TABLE "hriq_onboarding_sessions" DROP CONSTRAINT IF EXISTS "hriq_onboarding_sessions_started_by_user_id_users_id_fk";
ALTER TABLE "hriq_onboarding_steps" DROP CONSTRAINT IF EXISTS "hriq_onboarding_steps_completed_by_user_id_users_id_fk";
ALTER TABLE "hriq_onboarding_steps" DROP CONSTRAINT IF EXISTS "hriq_onboarding_steps_session_id_hriq_onboarding_sessions_id_fk";
ALTER TABLE "hriq_payments" DROP CONSTRAINT IF EXISTS "hriq_payments_employee_id_hriq_employees_id_fk";
ALTER TABLE "hriq_payments" DROP CONSTRAINT IF EXISTS "hriq_payments_processed_by_user_id_users_id_fk";
ALTER TABLE "hriq_task_templates" DROP CONSTRAINT IF EXISTS "hriq_task_templates_workflow_template_id_hriq_workflow_template";
ALTER TABLE "hriq_tasks" DROP CONSTRAINT IF EXISTS "hriq_tasks_assigned_to_user_id_users_id_fk";
ALTER TABLE "hriq_tasks" DROP CONSTRAINT IF EXISTS "hriq_tasks_completed_by_user_id_users_id_fk";
ALTER TABLE "hriq_tasks" DROP CONSTRAINT IF EXISTS "hriq_tasks_employee_id_hriq_employees_id_fk";

-- Step 2: Drop old unique constraint
ALTER TABLE "approved_emails" DROP CONSTRAINT IF EXISTS "approved_emails_email_unique";

-- Step 3: ALTER existing tables
ALTER TABLE "approved_emails" DROP CONSTRAINT "approved_emails_pkey",
ADD COLUMN IF NOT EXISTS "organization_id" TEXT,
ALTER COLUMN "id" DROP DEFAULT, ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "role" SET DEFAULT 'member',
ALTER COLUMN "added_by_user_id" SET DATA TYPE TEXT,
ALTER COLUMN "invite_sent_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "added_at" SET DATA TYPE TIMESTAMP(3),
ADD CONSTRAINT "approved_emails_pkey" PRIMARY KEY ("id");

ALTER TABLE "hriq_employees" DROP CONSTRAINT "hriq_employees_pkey",
ADD COLUMN IF NOT EXISTS "organization_id" TEXT,
ALTER COLUMN "id" DROP DEFAULT, ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "manager_id" SET DATA TYPE TEXT,
ALTER COLUMN "currency" SET NOT NULL, ALTER COLUMN "date_of_birth" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "daily_hours_target" SET NOT NULL,
ALTER COLUMN "start_date" SET DATA TYPE TIMESTAMP(3), ALTER COLUMN "end_date" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "hriq_role" SET NOT NULL, ALTER COLUMN "linked_user_id" SET DATA TYPE TEXT,
ALTER COLUMN "recruit_crm_synced_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "is_locked" SET NOT NULL,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT, ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "created_by_user_id" SET DATA TYPE TEXT,
ADD CONSTRAINT "hriq_employees_pkey" PRIMARY KEY ("id");

ALTER TABLE "hriq_tasks" DROP CONSTRAINT "hriq_tasks_pkey",
ALTER COLUMN "id" DROP DEFAULT, ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "employee_id" SET DATA TYPE TEXT,
ALTER COLUMN "assigned_to_user_id" SET DATA TYPE TEXT,
ALTER COLUMN "due_date" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "is_blocking" SET NOT NULL,
ALTER COLUMN "completed_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "completed_by_user_id" SET DATA TYPE TEXT,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT, ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3),
ADD CONSTRAINT "hriq_tasks_pkey" PRIMARY KEY ("id");

ALTER TABLE "hriq_documents" DROP CONSTRAINT "hriq_documents_pkey",
ALTER COLUMN "id" DROP DEFAULT, ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "employee_id" SET DATA TYPE TEXT,
ALTER COLUMN "issued_date" SET DATA TYPE TIMESTAMP(3), ALTER COLUMN "expiry_date" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "is_expired" SET NOT NULL, ALTER COLUMN "status" SET NOT NULL,
ALTER COLUMN "verified_by_user_id" SET DATA TYPE TEXT, ALTER COLUMN "verified_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "is_confidential" SET NOT NULL, ALTER COLUMN "uploaded_by_user_id" SET DATA TYPE TEXT,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT, ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3),
ADD CONSTRAINT "hriq_documents_pkey" PRIMARY KEY ("id");

ALTER TABLE "hriq_payments" DROP CONSTRAINT "hriq_payments_pkey",
ALTER COLUMN "id" DROP DEFAULT, ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "employee_id" SET DATA TYPE TEXT, ALTER COLUMN "currency" SET NOT NULL,
ALTER COLUMN "period_start" SET DATA TYPE TIMESTAMP(3), ALTER COLUMN "period_end" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "payment_date" SET DATA TYPE TIMESTAMP(3), ALTER COLUMN "processed_by_user_id" SET DATA TYPE TEXT,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT, ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3),
ADD CONSTRAINT "hriq_payments_pkey" PRIMARY KEY ("id");

ALTER TABLE "hriq_access_provisioning" DROP CONSTRAINT "hriq_access_provisioning_pkey",
ALTER COLUMN "id" DROP DEFAULT, ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "employee_id" SET DATA TYPE TEXT,
ALTER COLUMN "provisioned_at" SET DATA TYPE TIMESTAMP(3), ALTER COLUMN "provisioned_by_user_id" SET DATA TYPE TEXT,
ALTER COLUMN "deprovisioned_at" SET DATA TYPE TIMESTAMP(3), ALTER COLUMN "deprovisioned_by_user_id" SET DATA TYPE TEXT,
ALTER COLUMN "revocation_priority" SET NOT NULL,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT, ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3),
ADD CONSTRAINT "hriq_access_provisioning_pkey" PRIMARY KEY ("id");

ALTER TABLE "hriq_manager_notes" DROP CONSTRAINT "hriq_manager_notes_pkey",
ALTER COLUMN "id" DROP DEFAULT, ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "employee_id" SET DATA TYPE TEXT, ALTER COLUMN "author_user_id" SET DATA TYPE TEXT,
ALTER COLUMN "is_private" SET NOT NULL,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT, ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3),
ADD CONSTRAINT "hriq_manager_notes_pkey" PRIMARY KEY ("id");

ALTER TABLE "hriq_announcements" DROP CONSTRAINT "hriq_announcements_pkey",
ADD COLUMN IF NOT EXISTS "organization_id" TEXT,
ALTER COLUMN "id" DROP DEFAULT, ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "priority" SET NOT NULL,
ALTER COLUMN "published_at" SET NOT NULL, ALTER COLUMN "published_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "expires_at" SET DATA TYPE TIMESTAMP(3), ALTER COLUMN "author_user_id" SET DATA TYPE TEXT,
ALTER COLUMN "is_active" SET NOT NULL, ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ADD CONSTRAINT "hriq_announcements_pkey" PRIMARY KEY ("id");

ALTER TABLE "hriq_audit_log" DROP CONSTRAINT "hriq_audit_log_pkey",
ADD COLUMN IF NOT EXISTS "organization_id" TEXT,
ALTER COLUMN "id" DROP DEFAULT, ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "timestamp" SET DATA TYPE TIMESTAMP(3), ALTER COLUMN "actor_user_id" SET DATA TYPE TEXT,
ALTER COLUMN "object_id" SET DATA TYPE TEXT,
ADD CONSTRAINT "hriq_audit_log_pkey" PRIMARY KEY ("id");

ALTER TABLE "hriq_batch_sessions" DROP CONSTRAINT "hriq_batch_sessions_pkey",
ADD COLUMN IF NOT EXISTS "organization_id" TEXT,
ALTER COLUMN "id" DROP DEFAULT, ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "zoom_meeting_date" SET DATA TYPE TIMESTAMP(3), ALTER COLUMN "zoom_duration" SET NOT NULL,
ALTER COLUMN "created_by_user_id" SET DATA TYPE TEXT,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT, ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3),
ADD CONSTRAINT "hriq_batch_sessions_pkey" PRIMARY KEY ("id");

ALTER TABLE "hriq_onboarding_sessions" DROP CONSTRAINT "hriq_onboarding_sessions_pkey",
ALTER COLUMN "id" DROP DEFAULT, ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "employee_id" SET DATA TYPE TEXT, ALTER COLUMN "batch_session_id" SET DATA TYPE TEXT,
ALTER COLUMN "current_step" SET NOT NULL, ALTER COLUMN "overall_progress" SET NOT NULL,
ALTER COLUMN "zoom_meeting_date" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "zoom_invite_sent" SET NOT NULL, ALTER COLUMN "zoom_invite_sent_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "zoom_invite_accepted" SET NOT NULL, ALTER COLUMN "zoom_invite_accepted_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "zoom_attended" SET NOT NULL, ALTER COLUMN "zoom_attended_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "jotforms_sent" SET NOT NULL, ALTER COLUMN "jotforms_sent_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "jotforms_completed" SET NOT NULL, ALTER COLUMN "jotforms_completed_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "documents_uploaded" SET NOT NULL, ALTER COLUMN "documents_uploaded_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "started_at" SET DATA TYPE TIMESTAMP(3), ALTER COLUMN "completed_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "started_by_user_id" SET DATA TYPE TEXT,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT, ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3),
ADD CONSTRAINT "hriq_onboarding_sessions_pkey" PRIMARY KEY ("id");

ALTER TABLE "hriq_onboarding_steps" DROP CONSTRAINT "hriq_onboarding_steps_pkey",
ALTER COLUMN "id" DROP DEFAULT, ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "session_id" SET DATA TYPE TEXT, ALTER COLUMN "sort_order" SET NOT NULL,
ALTER COLUMN "is_required" SET NOT NULL, ALTER COLUMN "document_id" SET DATA TYPE TEXT,
ALTER COLUMN "completed_at" SET DATA TYPE TIMESTAMP(3), ALTER COLUMN "completed_by_user_id" SET DATA TYPE TEXT,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT, ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3),
ADD CONSTRAINT "hriq_onboarding_steps_pkey" PRIMARY KEY ("id");

ALTER TABLE "hriq_workflow_templates" DROP CONSTRAINT "hriq_workflow_templates_pkey",
ADD COLUMN IF NOT EXISTS "organization_id" TEXT,
ALTER COLUMN "id" DROP DEFAULT, ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "is_active" SET NOT NULL,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT, ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3),
ADD CONSTRAINT "hriq_workflow_templates_pkey" PRIMARY KEY ("id");

ALTER TABLE "hriq_task_templates" DROP CONSTRAINT "hriq_task_templates_pkey",
ALTER COLUMN "id" DROP DEFAULT, ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "workflow_template_id" SET DATA TYPE TEXT,
ALTER COLUMN "sort_order" SET NOT NULL, ALTER COLUMN "is_blocking" SET NOT NULL,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ADD CONSTRAINT "hriq_task_templates_pkey" PRIMARY KEY ("id");

ALTER TABLE "hriq_jotform_templates" DROP CONSTRAINT "hriq_jotform_templates_pkey",
ADD COLUMN IF NOT EXISTS "organization_id" TEXT,
ALTER COLUMN "id" DROP DEFAULT, ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "is_required" SET NOT NULL, ALTER COLUMN "sort_order" SET NOT NULL,
ALTER COLUMN "is_active" SET NOT NULL,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT, ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3),
ADD CONSTRAINT "hriq_jotform_templates_pkey" PRIMARY KEY ("id");

-- Step 4: CREATE new tables
CREATE TABLE "organizations" ("id" TEXT NOT NULL, "name" TEXT NOT NULL, "slug" TEXT NOT NULL, "logo_url" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "organizations_pkey" PRIMARY KEY ("id"));
CREATE TABLE "organization_members" ("id" TEXT NOT NULL, "user_id" TEXT NOT NULL, "organization_id" TEXT NOT NULL, "role" TEXT NOT NULL DEFAULT 'member', "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id"));
CREATE TABLE "organization_invitations" ("id" TEXT NOT NULL, "organization_id" TEXT NOT NULL, "email" TEXT NOT NULL, "role" TEXT NOT NULL DEFAULT 'member', "invited_by" TEXT NOT NULL, "token" TEXT NOT NULL, "expires_at" TIMESTAMP(3) NOT NULL, "accepted_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "organization_invitations_pkey" PRIMARY KEY ("id"));
CREATE TABLE "app_users" ("id" TEXT NOT NULL, "supabase_user_id" TEXT NOT NULL, "email" TEXT NOT NULL, "display_name" TEXT, "profile_picture" TEXT, "is_active" BOOLEAN NOT NULL DEFAULT true, "last_login_at" TIMESTAMP(3), "login_count" INTEGER NOT NULL DEFAULT 0, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "app_users_pkey" PRIMARY KEY ("id"));
CREATE TABLE "contract_templates" ("id" TEXT NOT NULL, "organization_id" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT, "docuseal_template_id" TEXT, "category" TEXT NOT NULL DEFAULT 'general', "is_active" BOOLEAN NOT NULL DEFAULT true, "created_by_user_id" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "contract_templates_pkey" PRIMARY KEY ("id"));
CREATE TABLE "contract_signing_requests" ("id" TEXT NOT NULL, "employee_id" TEXT NOT NULL, "template_id" TEXT NOT NULL, "docuseal_submission_id" TEXT, "docuseal_submitter_slug" TEXT, "status" TEXT NOT NULL DEFAULT 'pending', "sent_at" TIMESTAMP(3), "viewed_at" TIMESTAMP(3), "signed_at" TIMESTAMP(3), "declined_at" TIMESTAMP(3), "expires_at" TIMESTAMP(3), "signed_document_url" TEXT, "signed_document_id" TEXT, "signer_email" TEXT, "signer_name" TEXT, "created_by_user_id" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "contract_signing_requests_pkey" PRIMARY KEY ("id"));
CREATE TABLE "timesheet_periods" ("id" TEXT NOT NULL, "organization_id" TEXT NOT NULL, "name" TEXT NOT NULL, "start_date" TIMESTAMP(3) NOT NULL, "end_date" TIMESTAMP(3) NOT NULL, "status" TEXT NOT NULL DEFAULT 'open', "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "timesheet_periods_pkey" PRIMARY KEY ("id"));
CREATE TABLE "timesheet_submissions" ("id" TEXT NOT NULL, "employee_id" TEXT NOT NULL, "period_id" TEXT NOT NULL, "monday_hours" DECIMAL(5,2) NOT NULL DEFAULT 0, "tuesday_hours" DECIMAL(5,2) NOT NULL DEFAULT 0, "wednesday_hours" DECIMAL(5,2) NOT NULL DEFAULT 0, "thursday_hours" DECIMAL(5,2) NOT NULL DEFAULT 0, "friday_hours" DECIMAL(5,2) NOT NULL DEFAULT 0, "saturday_hours" DECIMAL(5,2) NOT NULL DEFAULT 0, "sunday_hours" DECIMAL(5,2) NOT NULL DEFAULT 0, "total_hours" DECIMAL(6,2) NOT NULL DEFAULT 0, "notes" TEXT, "status" TEXT NOT NULL DEFAULT 'draft', "submitted_at" TIMESTAMP(3), "approved_at" TIMESTAMP(3), "rejected_at" TIMESTAMP(3), "auto_approve_at" TIMESTAMP(3), "approved_by_user_id" TEXT, "approved_by_name" TEXT, "rejection_reason" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "timesheet_submissions_pkey" PRIMARY KEY ("id"));

-- Step 5: CREATE indexes
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");
CREATE INDEX "organization_members_user_id_idx" ON "organization_members"("user_id");
CREATE INDEX "organization_members_organization_id_idx" ON "organization_members"("organization_id");
CREATE UNIQUE INDEX "organization_members_user_id_organization_id_key" ON "organization_members"("user_id", "organization_id");
CREATE UNIQUE INDEX "organization_invitations_token_key" ON "organization_invitations"("token");
CREATE INDEX "organization_invitations_email_idx" ON "organization_invitations"("email");
CREATE INDEX "organization_invitations_organization_id_idx" ON "organization_invitations"("organization_id");
CREATE UNIQUE INDEX "app_users_supabase_user_id_key" ON "app_users"("supabase_user_id");
CREATE UNIQUE INDEX "app_users_email_key" ON "app_users"("email");
CREATE INDEX "contract_templates_organization_id_idx" ON "contract_templates"("organization_id");
CREATE INDEX "contract_signing_requests_employee_id_idx" ON "contract_signing_requests"("employee_id");
CREATE INDEX "contract_signing_requests_template_id_idx" ON "contract_signing_requests"("template_id");
CREATE INDEX "contract_signing_requests_status_idx" ON "contract_signing_requests"("status");
CREATE INDEX "timesheet_periods_organization_id_idx" ON "timesheet_periods"("organization_id");
CREATE INDEX "timesheet_periods_start_date_end_date_idx" ON "timesheet_periods"("start_date", "end_date");
CREATE INDEX "timesheet_submissions_employee_id_idx" ON "timesheet_submissions"("employee_id");
CREATE INDEX "timesheet_submissions_period_id_idx" ON "timesheet_submissions"("period_id");
CREATE INDEX "timesheet_submissions_status_idx" ON "timesheet_submissions"("status");
CREATE UNIQUE INDEX "timesheet_submissions_employee_id_period_id_key" ON "timesheet_submissions"("employee_id", "period_id");
CREATE UNIQUE INDEX "approved_emails_email_organization_id_key" ON "approved_emails"("email", "organization_id");
CREATE INDEX IF NOT EXISTS "approved_emails_organization_id_idx" ON "approved_emails"("organization_id");
CREATE INDEX IF NOT EXISTS "hriq_access_provisioning_employee_id_idx" ON "hriq_access_provisioning"("employee_id");
CREATE INDEX IF NOT EXISTS "hriq_access_provisioning_status_idx" ON "hriq_access_provisioning"("status");
CREATE INDEX IF NOT EXISTS "hriq_announcements_organization_id_idx" ON "hriq_announcements"("organization_id");
CREATE INDEX IF NOT EXISTS "hriq_audit_log_organization_id_idx" ON "hriq_audit_log"("organization_id");
CREATE INDEX IF NOT EXISTS "hriq_audit_log_object_type_object_id_idx" ON "hriq_audit_log"("object_type", "object_id");
CREATE INDEX IF NOT EXISTS "hriq_audit_log_actor_user_id_idx" ON "hriq_audit_log"("actor_user_id");
CREATE INDEX IF NOT EXISTS "hriq_audit_log_timestamp_idx" ON "hriq_audit_log"("timestamp");
CREATE INDEX IF NOT EXISTS "hriq_batch_sessions_organization_id_idx" ON "hriq_batch_sessions"("organization_id");
CREATE INDEX IF NOT EXISTS "hriq_batch_sessions_status_idx" ON "hriq_batch_sessions"("status");
CREATE INDEX IF NOT EXISTS "hriq_documents_employee_id_idx" ON "hriq_documents"("employee_id");
CREATE INDEX IF NOT EXISTS "hriq_documents_document_type_idx" ON "hriq_documents"("document_type");
CREATE INDEX IF NOT EXISTS "hriq_employees_organization_id_idx" ON "hriq_employees"("organization_id");
CREATE INDEX IF NOT EXISTS "hriq_employees_employment_status_idx" ON "hriq_employees"("employment_status");
CREATE INDEX IF NOT EXISTS "hriq_employees_manager_id_idx" ON "hriq_employees"("manager_id");
CREATE INDEX IF NOT EXISTS "hriq_employees_linked_user_id_idx" ON "hriq_employees"("linked_user_id");
CREATE INDEX IF NOT EXISTS "hriq_jotform_templates_organization_id_idx" ON "hriq_jotform_templates"("organization_id");
CREATE INDEX IF NOT EXISTS "hriq_manager_notes_employee_id_idx" ON "hriq_manager_notes"("employee_id");
CREATE INDEX IF NOT EXISTS "hriq_onboarding_sessions_employee_id_idx" ON "hriq_onboarding_sessions"("employee_id");
CREATE INDEX IF NOT EXISTS "hriq_onboarding_sessions_batch_session_id_idx" ON "hriq_onboarding_sessions"("batch_session_id");
CREATE INDEX IF NOT EXISTS "hriq_onboarding_sessions_status_idx" ON "hriq_onboarding_sessions"("status");
CREATE INDEX IF NOT EXISTS "hriq_onboarding_steps_session_id_idx" ON "hriq_onboarding_steps"("session_id");
CREATE INDEX IF NOT EXISTS "hriq_payments_employee_id_idx" ON "hriq_payments"("employee_id");
CREATE INDEX IF NOT EXISTS "hriq_payments_status_idx" ON "hriq_payments"("status");
CREATE INDEX IF NOT EXISTS "hriq_task_templates_workflow_template_id_idx" ON "hriq_task_templates"("workflow_template_id");
CREATE INDEX IF NOT EXISTS "hriq_tasks_employee_id_idx" ON "hriq_tasks"("employee_id");
CREATE INDEX IF NOT EXISTS "hriq_tasks_status_idx" ON "hriq_tasks"("status");
CREATE INDEX IF NOT EXISTS "hriq_tasks_assigned_to_user_id_idx" ON "hriq_tasks"("assigned_to_user_id");
CREATE INDEX IF NOT EXISTS "hriq_workflow_templates_organization_id_idx" ON "hriq_workflow_templates"("organization_id");

-- Step 6: ADD foreign keys
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "approved_emails" ADD CONSTRAINT "approved_emails_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "hriq_employees" ADD CONSTRAINT "hriq_employees_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "hriq_employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "hriq_employees" ADD CONSTRAINT "hriq_employees_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hriq_tasks" ADD CONSTRAINT "hriq_tasks_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "hriq_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hriq_documents" ADD CONSTRAINT "hriq_documents_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "hriq_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hriq_payments" ADD CONSTRAINT "hriq_payments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "hriq_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hriq_access_provisioning" ADD CONSTRAINT "hriq_access_provisioning_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "hriq_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hriq_manager_notes" ADD CONSTRAINT "hriq_manager_notes_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "hriq_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hriq_announcements" ADD CONSTRAINT "hriq_announcements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hriq_audit_log" ADD CONSTRAINT "hriq_audit_log_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "hriq_batch_sessions" ADD CONSTRAINT "hriq_batch_sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hriq_onboarding_sessions" ADD CONSTRAINT "hriq_onboarding_sessions_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "hriq_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hriq_onboarding_sessions" ADD CONSTRAINT "hriq_onboarding_sessions_batch_session_id_fkey" FOREIGN KEY ("batch_session_id") REFERENCES "hriq_batch_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "hriq_onboarding_steps" ADD CONSTRAINT "hriq_onboarding_steps_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "hriq_onboarding_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hriq_workflow_templates" ADD CONSTRAINT "hriq_workflow_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hriq_task_templates" ADD CONSTRAINT "hriq_task_templates_workflow_template_id_fkey" FOREIGN KEY ("workflow_template_id") REFERENCES "hriq_workflow_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hriq_jotform_templates" ADD CONSTRAINT "hriq_jotform_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contract_templates" ADD CONSTRAINT "contract_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contract_signing_requests" ADD CONSTRAINT "contract_signing_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "hriq_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contract_signing_requests" ADD CONSTRAINT "contract_signing_requests_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "contract_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "timesheet_periods" ADD CONSTRAINT "timesheet_periods_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "timesheet_submissions" ADD CONSTRAINT "timesheet_submissions_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "hriq_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "timesheet_submissions" ADD CONSTRAINT "timesheet_submissions_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "timesheet_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 7: Rename indexes to Prisma convention
ALTER INDEX "hriq_employees_employee_number_unique" RENAME TO "hriq_employees_employee_number_key";
ALTER INDEX "hriq_employees_work_email_unique" RENAME TO "hriq_employees_work_email_key";

-- Step 8: Grant hriq_app access to new tables
GRANT ALL ON "organizations" TO hriq_app;
GRANT ALL ON "organization_members" TO hriq_app;
GRANT ALL ON "organization_invitations" TO hriq_app;
GRANT ALL ON "app_users" TO hriq_app;
GRANT ALL ON "contract_templates" TO hriq_app;
GRANT ALL ON "contract_signing_requests" TO hriq_app;
GRANT ALL ON "timesheet_periods" TO hriq_app;
GRANT ALL ON "timesheet_submissions" TO hriq_app;
