-- Performance indices for frequently queried fields
-- These indices improve query performance for common operations

-- Resume lookup indices
CREATE INDEX IF NOT EXISTS idx_resumes_email ON resumes(email);
CREATE INDEX IF NOT EXISTS idx_resumes_recruit_crm_id ON resumes(recruit_crm_id);
CREATE INDEX IF NOT EXISTS idx_resumes_recruit_crm_slug ON resumes(recruit_crm_slug);
CREATE INDEX IF NOT EXISTS idx_resumes_stage ON resumes(stage);
CREATE INDEX IF NOT EXISTS idx_resumes_region ON resumes(region);
CREATE INDEX IF NOT EXISTS idx_resumes_work_type ON resumes(work_type);
CREATE INDEX IF NOT EXISTS idx_resumes_is_blocked ON resumes(is_blocked);
CREATE INDEX IF NOT EXISTS idx_resumes_parsing_status ON resumes(parsing_status);
CREATE INDEX IF NOT EXISTS idx_resumes_uploaded_at ON resumes(uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_resumes_application_date ON resumes(application_date DESC);
CREATE INDEX IF NOT EXISTS idx_resumes_last_synced_at ON resumes(last_synced_at DESC);

-- Composite indices for common filter combinations
CREATE INDEX IF NOT EXISTS idx_resumes_stage_region ON resumes(stage, region);
CREATE INDEX IF NOT EXISTS idx_resumes_work_type_region ON resumes(work_type, region);
CREATE INDEX IF NOT EXISTS idx_resumes_stage_work_type ON resumes(stage, work_type);

-- Job description indices
CREATE INDEX IF NOT EXISTS idx_job_descriptions_recruit_crm_id ON job_descriptions(recruit_crm_id);
CREATE INDEX IF NOT EXISTS idx_job_descriptions_recruit_crm_slug ON job_descriptions(recruit_crm_slug);
CREATE INDEX IF NOT EXISTS idx_job_descriptions_recruit_crm_status ON job_descriptions(recruit_crm_status);
CREATE INDEX IF NOT EXISTS idx_job_descriptions_created_at ON job_descriptions(created_at DESC);

-- Job assignment indices
CREATE INDEX IF NOT EXISTS idx_job_assignments_job_description_id ON job_assignments(job_description_id);
CREATE INDEX IF NOT EXISTS idx_job_assignments_resume_id ON job_assignments(resume_id);
CREATE INDEX IF NOT EXISTS idx_job_assignments_status ON job_assignments(status);
CREATE INDEX IF NOT EXISTS idx_job_assignments_composite ON job_assignments(job_description_id, resume_id);
CREATE INDEX IF NOT EXISTS idx_job_assignments_job_status ON job_assignments(job_description_id, status);

-- Resume scores indices
CREATE INDEX IF NOT EXISTS idx_resume_scores_resume_id ON resume_scores(resume_id);
CREATE INDEX IF NOT EXISTS idx_resume_scores_job_description_id ON resume_scores(job_description_id);
CREATE INDEX IF NOT EXISTS idx_resume_scores_total_score ON resume_scores(total_score DESC);
CREATE INDEX IF NOT EXISTS idx_resume_scores_scored_at ON resume_scores(scored_at DESC);
CREATE INDEX IF NOT EXISTS idx_resume_scores_is_favorite ON resume_scores(is_favorite) WHERE is_favorite = true;

-- Sync logs indices
CREATE INDEX IF NOT EXISTS idx_sync_logs_sync_type ON sync_logs(sync_type);
CREATE INDEX IF NOT EXISTS idx_sync_logs_status ON sync_logs(status);
CREATE INDEX IF NOT EXISTS idx_sync_logs_started_at ON sync_logs(started_at DESC);

-- Sync jobs indices
CREATE INDEX IF NOT EXISTS idx_sync_jobs_status ON sync_jobs(status);
CREATE INDEX IF NOT EXISTS idx_sync_jobs_started_at ON sync_jobs(started_at DESC);

-- Error logs indices
CREATE INDEX IF NOT EXISTS idx_error_logs_category ON error_logs(category);
CREATE INDEX IF NOT EXISTS idx_error_logs_level ON error_logs(level);
CREATE INDEX IF NOT EXISTS idx_error_logs_resolved ON error_logs(resolved);
CREATE INDEX IF NOT EXISTS idx_error_logs_last_seen_at ON error_logs(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_unresolved ON error_logs(category, resolved) WHERE resolved = false;

-- User indices
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);

-- Integration metrics indices
CREATE INDEX IF NOT EXISTS idx_integration_metrics_integration ON integration_metrics(integration);
CREATE INDEX IF NOT EXISTS idx_integration_metrics_hour ON integration_metrics(hour DESC);

-- VA Interview indices
CREATE INDEX IF NOT EXISTS idx_va_interviews_client_interview_id ON va_interviews(client_interview_id);
CREATE INDEX IF NOT EXISTS idx_va_interviews_status ON va_interviews(status);
CREATE INDEX IF NOT EXISTS idx_va_interviews_start_time ON va_interviews(start_time);

-- Client interview indices
CREATE INDEX IF NOT EXISTS idx_client_interviews_resume_id ON client_interviews(resume_id);
CREATE INDEX IF NOT EXISTS idx_client_interviews_job_id ON client_interviews(job_id);
CREATE INDEX IF NOT EXISTS idx_client_interviews_start_time ON client_interviews(start_time);
CREATE INDEX IF NOT EXISTS idx_client_interviews_status ON client_interviews(status);
