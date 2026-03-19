CREATE TABLE "approved_emails" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "approved_emails_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "candidate_stage_history" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resume_id" varchar NOT NULL,
	"old_stage" text,
	"new_stage" text NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_interviews" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_description_id" varchar,
	"job_slug" text,
	"title" text,
	"start_time" timestamp NOT NULL,
	"end_time" timestamp NOT NULL,
	"meeting_url" text,
	"meeting_location" text,
	"hiring_manager_name" text,
	"hiring_manager_email" text,
	"client_name" text,
	"client_email" text,
	"position_title" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"calendly_event_id" text,
	"google_calendar_event_id" text,
	"va_interview_created" boolean DEFAULT false,
	"va_interview_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_sync_retry_queue" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operation_type" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" varchar NOT NULL,
	"crm_slug" text,
	"payload" jsonb NOT NULL,
	"error_message" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"max_retries" integer DEFAULT 3 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"next_retry_at" timestamp,
	"last_attempt_at" timestamp,
	"succeeded_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"label" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "error_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"level" text NOT NULL,
	"category" text NOT NULL,
	"message" text NOT NULL,
	"stack" text,
	"context" jsonb,
	"endpoint" text,
	"user_id" text,
	"request_id" text,
	"resolved" boolean DEFAULT false,
	"resolved_at" timestamp,
	"resolved_by" text,
	"notes" text,
	"occurrences" integer DEFAULT 1,
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_assignments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_description_id" varchar NOT NULL,
	"resume_id" varchar NOT NULL,
	"status" text DEFAULT 'applied' NOT NULL,
	"crm_stage" text,
	"notes" text,
	"placed_at" timestamp,
	"removed_at" timestamp,
	"was_removed" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_descriptions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text,
	"content" text NOT NULL,
	"content_hash" text NOT NULL,
	"recruit_crm_id" text,
	"recruit_crm_slug" text,
	"recruit_crm_status" text,
	"company_name" text,
	"location" text,
	"job_type" text,
	"salary_min" integer,
	"salary_max" integer,
	"salary_currency" text,
	"salary_period" text,
	"owner_name" text,
	"owner_email" text,
	"candidate_count" integer,
	"open_date" timestamp,
	"closed_date" timestamp,
	"notes" jsonb DEFAULT '[]'::jsonb,
	"notes_synced_at" timestamp,
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_status_cache" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"normalized_label" text NOT NULL,
	"crm_status_id" integer NOT NULL,
	"original_label" text,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "job_status_cache_normalized_label_unique" UNIQUE("normalized_label")
);
--> statement-breakpoint
CREATE TABLE "job_status_history" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_description_id" varchar NOT NULL,
	"old_status" text,
	"new_status" text NOT NULL,
	"source" text NOT NULL,
	"synced_to_crm" boolean DEFAULT false,
	"changed_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs_sync_metadata" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"last_sync_started_at" timestamp,
	"last_sync_completed_at" timestamp,
	"last_sync_job_count" integer,
	"last_sync_errors" integer DEFAULT 0,
	"sync_status" text DEFAULT 'idle'
);
--> statement-breakpoint
CREATE TABLE "resume_scores" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resume_id" varchar NOT NULL,
	"job_description_id" varchar,
	"reference_hash" text,
	"total_score" integer NOT NULL,
	"role_score" integer,
	"tools_score" integer,
	"industry_score" integer,
	"similarity_score" integer,
	"context_score" integer,
	"comment" text,
	"is_favorite" boolean DEFAULT false,
	"scored_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resumes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_name" text NOT NULL,
	"file_hash" text NOT NULL,
	"extracted_text" text NOT NULL,
	"candidate_name" text,
	"email" text,
	"phone" text,
	"data_mismatch" boolean DEFAULT false,
	"keywords" text[],
	"skill_categories" text[],
	"parsed_content" jsonb,
	"current_role" text,
	"current_company" text,
	"years_experience" integer,
	"education_level" text,
	"certifications_count" integer,
	"work_type" text,
	"gender" text,
	"region" text,
	"country" text,
	"languages" text[],
	"expected_hourly_rate" text,
	"expected_hourly_rate_raw" text,
	"is_blocked" boolean DEFAULT false,
	"voice_recording_url" text,
	"photo_url" text,
	"stage" text,
	"application_date" timestamp,
	"interview_date" timestamp,
	"recruit_crm_id" text,
	"recruit_crm_slug" text,
	"recruit_crm_updated_at" timestamp,
	"resume_file_link" text,
	"parsing_status" text DEFAULT 'pending',
	"parsing_error" text,
	"notes" jsonb DEFAULT '[]'::jsonb,
	"notes_synced_at" timestamp,
	"last_synced_at" timestamp,
	"active_job_count" integer,
	"active_job_names" text[],
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "resumes_file_hash_unique" UNIQUE("file_hash")
);
--> statement-breakpoint
CREATE TABLE "scoring_sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recruiter_name" text,
	"work_type" text,
	"region" text,
	"mode" text NOT NULL,
	"job_description_id" varchar,
	"prompt_text" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_results" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar NOT NULL,
	"resume_score_id" varchar NOT NULL,
	"display_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_jobs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"stages" text[] NOT NULL,
	"current_stage_index" integer DEFAULT 0,
	"reliability_mode" boolean DEFAULT false,
	"limit" integer,
	"total_candidates" integer DEFAULT 0,
	"processed_candidates" integer DEFAULT 0,
	"imported_count" integer DEFAULT 0,
	"updated_count" integer DEFAULT 0,
	"skipped_count" integer DEFAULT 0,
	"error_count" integer DEFAULT 0,
	"checkpoint" jsonb,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"paused_at" timestamp,
	"completed_at" timestamp,
	"last_activity_at" timestamp DEFAULT now(),
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "sync_log_details" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sync_log_id" varchar NOT NULL,
	"action" text NOT NULL,
	"reason" text NOT NULL,
	"candidate_name" text,
	"candidate_email" text,
	"recruit_crm_id" text,
	"resume_id" varchar,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sync_type" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp NOT NULL,
	"completed_at" timestamp,
	"duration_ms" integer,
	"expected_count" integer,
	"fetched_count" integer,
	"imported_count" integer,
	"updated_count" integer,
	"removed_count" integer,
	"skipped_count" integer,
	"error_count" integer,
	"error_messages" text[],
	"db_count_before" integer,
	"db_count_after" integer
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"role" text DEFAULT 'standard' NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"display_name" text,
	"profile_picture" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "va_interview_attendees" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"va_interview_id" varchar NOT NULL,
	"resume_id" varchar,
	"candidate_name" text,
	"candidate_email" text,
	"approved_for_invite" boolean DEFAULT false,
	"approved_at" timestamp,
	"added_source" text DEFAULT 'manual',
	"invite_status" text DEFAULT 'pending' NOT NULL,
	"invite_sent_at" timestamp,
	"rsvp_status" text,
	"rsvp_updated_at" timestamp,
	"attendance_status" text,
	"attendance_marked_at" timestamp,
	"reminder_24h_sent_at" timestamp,
	"reminder_1h_sent_at" timestamp,
	"is_double_booked" boolean DEFAULT false,
	"auto_removed_at" timestamp,
	"auto_removal_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "va_interview_waitlist" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_description_id" varchar NOT NULL,
	"resume_id" varchar NOT NULL,
	"candidate_name" text,
	"candidate_email" text,
	"priority" integer DEFAULT 0,
	"status" text DEFAULT 'waiting' NOT NULL,
	"notes" text,
	"added_at" timestamp DEFAULT now() NOT NULL,
	"added_by" text,
	"invited_to_interview_id" varchar,
	"invited_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "va_interviews" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_interview_id" varchar NOT NULL,
	"job_description_id" varchar,
	"start_time" timestamp NOT NULL,
	"end_time" timestamp NOT NULL,
	"meeting_url" text,
	"meeting_location" text,
	"notes" text,
	"title" text,
	"sender_email" text,
	"google_calendar_event_id" text,
	"linked_from_external" boolean DEFAULT false,
	"external_event_linked_at" timestamp,
	"last_synced_from_calendar" timestamp,
	"calendar_event_updated_at" timestamp,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "candidate_stage_history" ADD CONSTRAINT "candidate_stage_history_resume_id_resumes_id_fk" FOREIGN KEY ("resume_id") REFERENCES "public"."resumes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_interviews" ADD CONSTRAINT "client_interviews_job_description_id_job_descriptions_id_fk" FOREIGN KEY ("job_description_id") REFERENCES "public"."job_descriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_assignments" ADD CONSTRAINT "job_assignments_job_description_id_job_descriptions_id_fk" FOREIGN KEY ("job_description_id") REFERENCES "public"."job_descriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_assignments" ADD CONSTRAINT "job_assignments_resume_id_resumes_id_fk" FOREIGN KEY ("resume_id") REFERENCES "public"."resumes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_status_history" ADD CONSTRAINT "job_status_history_job_description_id_job_descriptions_id_fk" FOREIGN KEY ("job_description_id") REFERENCES "public"."job_descriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_scores" ADD CONSTRAINT "resume_scores_resume_id_resumes_id_fk" FOREIGN KEY ("resume_id") REFERENCES "public"."resumes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_scores" ADD CONSTRAINT "resume_scores_job_description_id_job_descriptions_id_fk" FOREIGN KEY ("job_description_id") REFERENCES "public"."job_descriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_sessions" ADD CONSTRAINT "scoring_sessions_job_description_id_job_descriptions_id_fk" FOREIGN KEY ("job_description_id") REFERENCES "public"."job_descriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_results" ADD CONSTRAINT "session_results_session_id_scoring_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."scoring_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_results" ADD CONSTRAINT "session_results_resume_score_id_resume_scores_id_fk" FOREIGN KEY ("resume_score_id") REFERENCES "public"."resume_scores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_log_details" ADD CONSTRAINT "sync_log_details_sync_log_id_sync_logs_id_fk" FOREIGN KEY ("sync_log_id") REFERENCES "public"."sync_logs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "va_interview_attendees" ADD CONSTRAINT "va_interview_attendees_va_interview_id_va_interviews_id_fk" FOREIGN KEY ("va_interview_id") REFERENCES "public"."va_interviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "va_interview_attendees" ADD CONSTRAINT "va_interview_attendees_resume_id_resumes_id_fk" FOREIGN KEY ("resume_id") REFERENCES "public"."resumes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "va_interview_waitlist" ADD CONSTRAINT "va_interview_waitlist_job_description_id_job_descriptions_id_fk" FOREIGN KEY ("job_description_id") REFERENCES "public"."job_descriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "va_interview_waitlist" ADD CONSTRAINT "va_interview_waitlist_resume_id_resumes_id_fk" FOREIGN KEY ("resume_id") REFERENCES "public"."resumes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "va_interview_waitlist" ADD CONSTRAINT "va_interview_waitlist_invited_to_interview_id_va_interviews_id_fk" FOREIGN KEY ("invited_to_interview_id") REFERENCES "public"."va_interviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "va_interviews" ADD CONSTRAINT "va_interviews_client_interview_id_client_interviews_id_fk" FOREIGN KEY ("client_interview_id") REFERENCES "public"."client_interviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "va_interviews" ADD CONSTRAINT "va_interviews_job_description_id_job_descriptions_id_fk" FOREIGN KEY ("job_description_id") REFERENCES "public"."job_descriptions"("id") ON DELETE no action ON UPDATE no action;