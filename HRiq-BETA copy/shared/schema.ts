import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Resumes table - stores uploaded resumes with extracted text for caching
export const resumes = pgTable("resumes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fileName: text("file_name").notNull(),
  fileHash: text("file_hash").notNull().unique(),
  extractedText: text("extracted_text").notNull(),
  candidateName: text("candidate_name"),
  email: text("email"),  // Email from CRM (authoritative source)
  phone: text("phone"),  // Phone from CRM (authoritative source)
  dataMismatch: boolean("data_mismatch").default(false),  // True if CRM name doesn't match resume parsed name
  keywords: text("keywords").array(),
  skillCategories: text("skill_categories").array(),  // Sales, Customer Service, Marketing, etc.
  parsedContent: jsonb("parsed_content"),  // AI-parsed structured resume content
  currentRole: text("current_role"),  // Most recent job title
  currentCompany: text("current_company"),  // Most recent employer
  yearsExperience: integer("years_experience"),  // Total years of work experience
  educationLevel: text("education_level"),  // Highest education (High School, Associate, Bachelor, Master, PhD)
  certificationsCount: integer("certifications_count"),  // Number of certifications
  workType: text("work_type"),  // "full-time", "part-time", "both"
  gender: text("gender"),  // "male", "female", "unknown" - from CRM or AI-inferred
  region: text("region"),
  country: text("country"),  // Country of residence
  languages: text("languages").array(),  // Languages spoken
  expectedHourlyRate: text("expected_hourly_rate"),  // Normalized hourly rate (e.g., "8-12", "10")
  expectedHourlyRateRaw: text("expected_hourly_rate_raw"),  // Original CRM value before AI normalization
  isBlocked: boolean("is_blocked").default(false),  // Permanently block from scoring
  voiceRecordingUrl: text("voice_recording_url"),  // Link to voice recording (Vocaroo, Speakpipe, etc.)
  photoUrl: text("photo_url"),  // URL to candidate photo extracted from resume
  stage: text("stage"),  // Pipeline stage (Phase 1, Phase 2, Phase 3, Failed, etc.)
  applicationDate: timestamp("application_date"),  // When candidate applied
  interviewDate: timestamp("interview_date"),  // Scheduled interview date from CRM
  recruitCrmId: text("recruit_crm_id"),  // RecruitCRM candidate ID for linking to CRM profile
  recruitCrmSlug: text("recruit_crm_slug"),  // RecruitCRM candidate slug for web URL
  recruitCrmUpdatedAt: timestamp("recruit_crm_updated_at"),  // Last updated_at from RecruitCRM (for incremental sync)
  resumeFileLink: text("resume_file_link"),  // Cached file_link URL from RecruitCRM
  parsingStatus: text("parsing_status").default("pending"),  // "pending", "ready", "failed"
  parsingError: text("parsing_error"),  // Error message if parsing failed
  notes: jsonb("notes").default([]),  // Notes from RecruitCRM: [{ id, content, label, createdAt, createdBy }]
  notesSyncedAt: timestamp("notes_synced_at"),  // When notes were last synced from RecruitCRM
  lastSyncedAt: timestamp("last_synced_at"),  // When this resume was last synced from RecruitCRM
  activeJobCount: integer("active_job_count"),  // Number of active jobs candidate is assigned to
  activeJobNames: text("active_job_names").array(),  // Names of active jobs
  lastContactedAt: timestamp("last_contacted_at"),  // When candidate was last contacted
  lastContactedByEmail: text("last_contacted_by_email"),  // Email of recruiter who last contacted
  lastContactedByName: text("last_contacted_by_name"),  // Name of recruiter who last contacted
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

// Job descriptions table - stores job descriptions for reuse
export const jobDescriptions = pgTable("job_descriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title"),
  content: text("content").notNull(),
  contentHash: text("content_hash").notNull(),
  // RecruitCRM fields
  recruitCrmId: text("recruit_crm_id"),
  recruitCrmSlug: text("recruit_crm_slug"),  // For direct CRM links
  recruitCrmStatus: text("recruit_crm_status"), // open, closed, on-hold, etc.
  companyName: text("company_name"),  // Client/company hiring for
  location: text("location"),  // Job location
  jobType: text("job_type"),  // full-time, part-time, contract, etc.
  salaryMin: integer("salary_min"),  // Minimum salary
  salaryMax: integer("salary_max"),  // Maximum salary
  salaryCurrency: text("salary_currency"),  // USD, EUR, etc.
  salaryPeriod: text("salary_period"),  // hourly, monthly, yearly
  ownerName: text("owner_name"),  // Recruiter/owner of the job
  ownerEmail: text("owner_email"),
  candidateCount: integer("candidate_count"),  // Number of candidates assigned
  openDate: timestamp("open_date"),  // When job was opened
  closedDate: timestamp("closed_date"),  // When job was closed
  notes: jsonb("notes").default([]),  // Notes from RecruitCRM: [{ id, content, label, createdAt, createdBy }]
  notesSyncedAt: timestamp("notes_synced_at"),  // When notes were last synced from RecruitCRM
  lastSyncedAt: timestamp("last_synced_at"),  // When last synced from CRM
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Resume scores table - stores AI-generated scores for resume-JD pairs
export const resumeScores = pgTable("resume_scores", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  resumeId: varchar("resume_id").notNull().references(() => resumes.id),
  jobDescriptionId: varchar("job_description_id").references(() => jobDescriptions.id),
  referenceHash: text("reference_hash"),
  totalScore: integer("total_score").notNull(),
  roleScore: integer("role_score"),
  toolsScore: integer("tools_score"),
  industryScore: integer("industry_score"),
  similarityScore: integer("similarity_score"),
  contextScore: integer("context_score"),
  comment: text("comment"),
  isFavorite: boolean("is_favorite").default(false),
  scoredAt: timestamp("scored_at").defaultNow().notNull(),
});

// Scoring sessions table - groups results together
export const scoringSessions = pgTable("scoring_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  recruiterName: text("recruiter_name"),
  workType: text("work_type"),
  region: text("region"),
  mode: text("mode").notNull(),
  jobDescriptionId: varchar("job_description_id").references(() => jobDescriptions.id),
  promptText: text("prompt_text"),  // User's ideal candidate description for prompt mode
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Session results junction table
export const sessionResults = pgTable("session_results", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => scoringSessions.id),
  resumeScoreId: varchar("resume_score_id").notNull().references(() => resumeScores.id),
  displayOrder: integer("display_order").notNull(),
});

// Job assignments - tracks candidate status per job
export const jobAssignments = pgTable("job_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobDescriptionId: varchar("job_description_id").notNull().references(() => jobDescriptions.id),
  resumeId: varchar("resume_id").notNull().references(() => resumes.id),
  status: text("status").notNull().default("applied"), // applied, assigned, interviewing, shortlisted, placed, removed
  crmStage: text("crm_stage"), // Original stage name from RecruitCRM hiring pipeline
  notes: text("notes"),
  placedAt: timestamp("placed_at"),
  removedAt: timestamp("removed_at"),
  wasRemoved: boolean("was_removed").default(false), // True if candidate was previously removed and re-added
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Sync logs - tracks RecruitCRM sync history for monitoring
export const syncLogs = pgTable("sync_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  syncType: text("sync_type").notNull(), // "auto", "manual", "webhook"
  status: text("status").notNull(), // "success", "failed", "partial"
  startedAt: timestamp("started_at").notNull(),
  completedAt: timestamp("completed_at"),
  durationMs: integer("duration_ms"),
  expectedCount: integer("expected_count"), // Total from API
  fetchedCount: integer("fetched_count"), // Actually fetched
  importedCount: integer("imported_count"),
  updatedCount: integer("updated_count"),
  removedCount: integer("removed_count"),
  skippedCount: integer("skipped_count"),
  errorCount: integer("error_count"),
  errorMessages: text("error_messages").array(),
  dbCountBefore: integer("db_count_before"), // Database count before sync
  dbCountAfter: integer("db_count_after"), // Database count after sync
});

// Sync log details - tracks individual candidates that were removed/skipped during sync
export const syncLogDetails = pgTable("sync_log_details", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  syncLogId: varchar("sync_log_id").notNull().references(() => syncLogs.id, { onDelete: 'cascade' }),
  action: text("action").notNull(), // "removed", "skipped", "imported", "updated", "error"
  reason: text("reason").notNull(), // e.g., "Left Phase 3", "No CRM update since last sync", "No resume file"
  candidateName: text("candidate_name"),
  candidateEmail: text("candidate_email"),
  recruitCrmId: text("recruit_crm_id"),
  resumeId: varchar("resume_id"), // Our internal resume ID if available
  metadata: jsonb("metadata"), // Additional context like timestamps, file names, etc.
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Sync jobs - tracks resumable sync progress for long-running syncs
export const syncJobs = pgTable("sync_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  status: text("status").notNull().default("pending"), // "pending", "running", "paused", "completed", "failed"
  stages: text("stages").array().notNull(), // Stages to sync (e.g., ["Failed Interview", "Phase 3: Passed"])
  currentStageIndex: integer("current_stage_index").default(0), // Which stage we're currently on
  reliabilityMode: boolean("reliability_mode").default(false),
  limit: integer("limit"), // Optional limit per stage
  
  // Progress tracking
  totalCandidates: integer("total_candidates").default(0), // Total candidates across all stages
  processedCandidates: integer("processed_candidates").default(0), // Candidates processed so far
  importedCount: integer("imported_count").default(0),
  updatedCount: integer("updated_count").default(0),
  skippedCount: integer("skipped_count").default(0),
  errorCount: integer("error_count").default(0),
  
  // Checkpoint data for resume capability
  checkpoint: jsonb("checkpoint"), // { stageProgress: { [stage]: { processedSlugs: [], lastPage: number } } }
  
  // Timing
  startedAt: timestamp("started_at").defaultNow().notNull(),
  pausedAt: timestamp("paused_at"),
  completedAt: timestamp("completed_at"),
  lastActivityAt: timestamp("last_activity_at").defaultNow(),
  
  // Error tracking
  lastError: text("last_error"),
});

// Error logs - tracks application errors for debugging
export const errorLogs = pgTable("error_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  level: text("level").notNull(), // "error", "warn", "info"
  category: text("category").notNull(), // "api", "sync", "parsing", "ai", "database", "auth", "webhook", "system"
  message: text("message").notNull(),
  stack: text("stack"), // Stack trace if available
  context: jsonb("context"), // Additional context (request info, resume ID, etc.)
  endpoint: text("endpoint"), // API endpoint if applicable
  userId: text("user_id"), // User ID if logged in
  requestId: text("request_id"), // Request tracking ID
  resolved: boolean("resolved").default(false), // Mark as resolved when fixed
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: text("resolved_by"),
  notes: text("notes"), // Admin notes about the error
  occurrences: integer("occurrences").default(1), // Count of similar errors
  firstSeenAt: timestamp("first_seen_at").defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
});

// Integration health metrics - tracks API call metrics for each integration
export const integrationMetrics = pgTable("integration_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  integration: text("integration").notNull(), // "calendly", "google_calendar", "recruitcrm"
  hour: timestamp("hour").notNull(), // Bucketed by hour for aggregation
  totalCalls: integer("total_calls").default(0).notNull(),
  successCount: integer("success_count").default(0).notNull(),
  errorCount: integer("error_count").default(0).notNull(),
  rateLimitHits: integer("rate_limit_hits").default(0).notNull(),
  timeoutCount: integer("timeout_count").default(0).notNull(),
  authErrorCount: integer("auth_error_count").default(0).notNull(),
  avgLatencyMs: integer("avg_latency_ms"),
  p95LatencyMs: integer("p95_latency_ms"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Integration incidents - tracks current state and issues for each integration
export const integrationIncidents = pgTable("integration_incidents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  integration: text("integration").notNull(), // "calendly", "google_calendar", "recruitcrm"
  status: text("status").notNull().default("healthy"), // "healthy", "degraded", "down"
  circuitState: text("circuit_state").notNull().default("closed"), // "closed", "open", "half_open"
  errorType: text("error_type"), // "auth", "rate_limit", "timeout", "server_error", "network"
  errorMessage: text("error_message"),
  consecutiveFailures: integer("consecutive_failures").default(0).notNull(),
  lastSuccessAt: timestamp("last_success_at"),
  lastFailureAt: timestamp("last_failure_at"),
  circuitOpenedAt: timestamp("circuit_opened_at"),
  nextRetryAt: timestamp("next_retry_at"),
  rateLimitRemaining: integer("rate_limit_remaining"),
  rateLimitResetAt: timestamp("rate_limit_reset_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertIntegrationMetricsSchema = createInsertSchema(integrationMetrics);
export type IntegrationMetrics = typeof integrationMetrics.$inferSelect;
export type InsertIntegrationMetrics = z.infer<typeof insertIntegrationMetricsSchema>;

export const insertIntegrationIncidentsSchema = createInsertSchema(integrationIncidents);
export type IntegrationIncidents = typeof integrationIncidents.$inferSelect;
export type InsertIntegrationIncidents = z.infer<typeof insertIntegrationIncidentsSchema>;

// Job status history - tracks all status changes for audit trail
export const jobStatusHistory = pgTable("job_status_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobDescriptionId: varchar("job_description_id").notNull().references(() => jobDescriptions.id, { onDelete: 'cascade' }),
  oldStatus: text("old_status"),
  newStatus: text("new_status").notNull(),
  source: text("source").notNull(), // "manual", "crm_sync", "drag_drop"
  syncedToCrm: boolean("synced_to_crm").default(false),
  changedBy: text("changed_by"), // User identifier if available
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Candidate stage history - tracks stage transitions for pipeline velocity analytics
export const candidateStageHistory = pgTable("candidate_stage_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  resumeId: varchar("resume_id").notNull().references(() => resumes.id, { onDelete: 'cascade' }),
  oldStage: text("old_stage"),
  newStage: text("new_stage").notNull(),
  source: text("source").notNull(), // "crm_sync", "manual"
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCandidateStageHistorySchema = createInsertSchema(candidateStageHistory);
export type CandidateStageHistory = typeof candidateStageHistory.$inferSelect;
export type InsertCandidateStageHistory = z.infer<typeof insertCandidateStageHistorySchema>;

// Jobs sync metadata - tracks last sync time for conflict detection
export const jobsSyncMetadata = pgTable("jobs_sync_metadata", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  lastSyncStartedAt: timestamp("last_sync_started_at"),
  lastSyncCompletedAt: timestamp("last_sync_completed_at"),
  lastSyncJobCount: integer("last_sync_job_count"),
  lastSyncErrors: integer("last_sync_errors").default(0),
  syncStatus: text("sync_status").default("idle"), // "idle", "running", "failed"
});

// Job status cache - persisted mapping of status labels to CRM IDs
export const jobStatusCache = pgTable("job_status_cache", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  normalizedLabel: text("normalized_label").notNull().unique(), // e.g., "on-hold", "interview-scheduled"
  crmStatusId: integer("crm_status_id").notNull(), // RecruitCRM numeric status ID
  originalLabel: text("original_label"), // Original label before normalization
  lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(), // When this status was last seen in CRM data
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// CRM sync retry queue - tracks failed sync operations for retry
export const crmSyncRetryQueue = pgTable("crm_sync_retry_queue", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  operationType: text("operation_type").notNull(), // "job_status_update", "candidate_update", etc.
  entityType: text("entity_type").notNull(), // "job", "candidate"
  entityId: varchar("entity_id").notNull(), // Local DB ID of the entity
  crmSlug: text("crm_slug"), // RecruitCRM slug for the entity
  payload: jsonb("payload").notNull(), // The data to sync (e.g., { status: "on-hold", statusId: 2 })
  errorMessage: text("error_message"), // Last error message
  retryCount: integer("retry_count").default(0).notNull(),
  maxRetries: integer("max_retries").default(3).notNull(),
  status: text("status").default("pending").notNull(), // "pending", "retrying", "succeeded", "failed", "abandoned"
  nextRetryAt: timestamp("next_retry_at"), // Exponential backoff
  lastAttemptAt: timestamp("last_attempt_at"),
  succeededAt: timestamp("succeeded_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Zod schemas for insert operations
export const insertResumeSchema = createInsertSchema(resumes).omit({
  id: true,
});

export const insertJobDescriptionSchema = createInsertSchema(jobDescriptions).omit({
  id: true,
  createdAt: true,
});

export const insertResumeScoreSchema = createInsertSchema(resumeScores).omit({
  id: true,
  scoredAt: true,
});

export const insertScoringSessionSchema = createInsertSchema(scoringSessions).omit({
  id: true,
  createdAt: true,
});

export const insertSessionResultSchema = createInsertSchema(sessionResults).omit({
  id: true,
});

export const insertJobAssignmentSchema = createInsertSchema(jobAssignments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSyncLogSchema = createInsertSchema(syncLogs).omit({
  id: true,
});

export const insertSyncLogDetailSchema = createInsertSchema(syncLogDetails).omit({
  id: true,
  createdAt: true,
});

export const insertErrorLogSchema = createInsertSchema(errorLogs).omit({
  id: true,
  firstSeenAt: true,
  lastSeenAt: true,
});

export const insertSyncJobSchema = createInsertSchema(syncJobs).omit({
  id: true,
  startedAt: true,
  lastActivityAt: true,
});

export const insertJobStatusCacheSchema = createInsertSchema(jobStatusCache).omit({
  id: true,
  createdAt: true,
  lastSeenAt: true,
});

export const insertCrmSyncRetrySchema = createInsertSchema(crmSyncRetryQueue).omit({
  id: true,
  createdAt: true,
});

// Types
export type Resume = typeof resumes.$inferSelect;
export type InsertResume = z.infer<typeof insertResumeSchema>;

export type JobDescription = typeof jobDescriptions.$inferSelect;
export type InsertJobDescription = z.infer<typeof insertJobDescriptionSchema>;

export type ResumeScore = typeof resumeScores.$inferSelect;
export type InsertResumeScore = z.infer<typeof insertResumeScoreSchema>;

export type ScoringSession = typeof scoringSessions.$inferSelect;
export type InsertScoringSession = z.infer<typeof insertScoringSessionSchema>;

export type SessionResult = typeof sessionResults.$inferSelect;
export type InsertSessionResult = z.infer<typeof insertSessionResultSchema>;

export type JobAssignment = typeof jobAssignments.$inferSelect;
export type InsertJobAssignment = z.infer<typeof insertJobAssignmentSchema>;

export type SyncLog = typeof syncLogs.$inferSelect;
export type InsertSyncLog = z.infer<typeof insertSyncLogSchema>;

export type SyncLogDetail = typeof syncLogDetails.$inferSelect;
export type InsertSyncLogDetail = z.infer<typeof insertSyncLogDetailSchema>;

export type ErrorLog = typeof errorLogs.$inferSelect;
export type InsertErrorLog = z.infer<typeof insertErrorLogSchema>;

export type SyncJob = typeof syncJobs.$inferSelect;
export type InsertSyncJob = z.infer<typeof insertSyncJobSchema>;

export type JobStatusCacheEntry = typeof jobStatusCache.$inferSelect;
export type InsertJobStatusCacheEntry = z.infer<typeof insertJobStatusCacheSchema>;

export type CrmSyncRetryEntry = typeof crmSyncRetryQueue.$inferSelect;
export type InsertCrmSyncRetryEntry = z.infer<typeof insertCrmSyncRetrySchema>;

// API request/response types
export const scoreRequestSchema = z.object({
  jobDescription: z.string().optional(),
  referenceResumeIds: z.array(z.string()).optional(),
  promptText: z.string().optional(),  // Free-text description of ideal candidate for prompt mode
  resumeTexts: z.array(z.object({
    fileName: z.string(),
    fileHash: z.string(),
    text: z.string(),
    resumeId: z.string().optional(), // For server-side text lookup when text is empty
  })),
  recruiterName: z.string().optional(),
  workType: z.string().optional(),  // Optional for prompt mode
  region: z.string().optional(),  // Optional for prompt mode
  mode: z.enum(["jd", "resume", "prompt"]),  // Added prompt mode
  // Date filters for scoring only resumes within a date range
  applicationDateFrom: z.string().optional(),
  applicationDateTo: z.string().optional(),
  uploadedAtFrom: z.string().optional(),
  uploadedAtTo: z.string().optional(),
  // Force re-scoring (skip cache) - useful when you want fresh AI analysis
  forceRescore: z.boolean().optional(),
  // Must-have requirements - candidates without these will be filtered out
  mustHaves: z.string().optional(),
});

export type ScoreRequest = z.infer<typeof scoreRequestSchema>;

export const scoreResultSchema = z.object({
  resumeId: z.string(),
  fileName: z.string(),
  candidateName: z.string(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  skillCategories: z.array(z.string()).nullable().optional(),
  voiceRecordingUrl: z.string().nullable().optional(),
  photoUrl: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  languages: z.array(z.string()).nullable().optional(),
  expectedHourlyRate: z.string().nullable().optional(),
  expectedHourlyRateRaw: z.string().nullable().optional(),
  workType: z.string().nullable().optional(),
  gender: z.string().nullable().optional(),
  stage: z.string().nullable().optional(),
  recruitCrmId: z.string().nullable().optional(),
  recruitCrmSlug: z.string().nullable().optional(),
  applicationDate: z.union([z.string(), z.date()]).nullable().optional(),
  currentRole: z.string().nullable().optional(),
  currentCompany: z.string().nullable().optional(),
  yearsExperience: z.number().nullable().optional(),
  educationLevel: z.string().nullable().optional(),
  certificationsCount: z.number().nullable().optional(),
  totalScore: z.number(),
  roleScore: z.number().optional(),
  toolsScore: z.number().optional(),
  industryScore: z.number().optional(),
  similarityScore: z.number().optional(),
  contextScore: z.number().optional(),
  comment: z.union([
    z.string(),
    z.object({
      role_fit: z.string().optional(),
      titles: z.union([z.string(), z.array(z.string())]).optional(),
      job_titles: z.array(z.string()).optional(),
      tools: z.union([z.string(), z.array(z.string())]).optional(),
      tools_used: z.array(z.string()).optional(),
      missing: z.union([z.string(), z.array(z.string())]).optional(),
      missing_tools: z.array(z.string()).optional(),
      industry: z.string().optional(),
      industry_match: z.string().optional(),
      tasks_good: z.string().optional(),
      tasks_gap: z.string().optional(),
      summary: z.string().optional(),
      next_steps: z.string().optional(),
      score_breakdown: z.object({
        title: z.string(),
        tasks: z.string(),
        tools: z.string(),
        industry: z.string(),
      }).optional(),
    })
  ]),
  isFavorite: z.boolean(),
  cached: z.boolean(),
});

export type ScoreResult = z.infer<typeof scoreResultSchema>;

// Users table for authentication
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),  // null until user creates their account
  role: text("role").notNull().default("standard"),  // "admin" or "standard"
  isActive: boolean("is_active").notNull().default(false),  // true once password is set
  displayName: text("display_name"),  // User's display name from Google profile
  profilePicture: text("profile_picture"),  // URL to Google profile picture
  lastLoginAt: timestamp("last_login_at"),  // Track last login time
  loginCount: integer("login_count").default(0),  // Track total logins
  invitedByUserId: varchar("invited_by_user_id"),  // Who invited this user
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Approved emails - admin adds emails here before users can create accounts
export const approvedEmails = pgTable("approved_emails", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  role: text("role").notNull().default("standard"),  // "admin" or "standard" - role assigned when user signs up
  addedByUserId: varchar("added_by_user_id"),  // Admin who approved this email
  inviteSentAt: timestamp("invite_sent_at"),  // When email invite was sent
  addedAt: timestamp("added_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const insertApprovedEmailSchema = createInsertSchema(approvedEmails).omit({
  id: true,
  addedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type ApprovedEmail = typeof approvedEmails.$inferSelect;
export type InsertApprovedEmail = z.infer<typeof insertApprovedEmailSchema>;

// Client interviews - stores booked client interviews from Calendly or manual entry
export const clientInterviews = pgTable("client_interviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobDescriptionId: varchar("job_description_id").references(() => jobDescriptions.id),
  jobSlug: text("job_slug"),  // Job slug from Calendly event for matching
  
  // Interview details
  title: text("title"),  // Event title
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  meetingUrl: text("meeting_url"),  // Zoom/Meet link
  meetingLocation: text("meeting_location"),  // Physical location if any
  
  // Hiring manager info (from Calendly event owner)
  hiringManagerName: text("hiring_manager_name"),
  hiringManagerEmail: text("hiring_manager_email"),
  
  // Client info (from Calendly invitee - the person who booked)
  clientName: text("client_name"),
  clientEmail: text("client_email"),
  positionTitle: text("position_title"),  // Job/position title from Calendly booking form
  
  // Source tracking
  source: text("source").notNull().default("manual"),  // "calendly", "google_calendar", "manual"
  calendlyEventId: text("calendly_event_id"),  // Calendly event URI for deduplication
  googleCalendarEventId: text("google_calendar_event_id"),  // Google event ID if synced
  
  // VA interview status
  vaInterviewCreated: boolean("va_interview_created").default(false),
  vaInterviewId: varchar("va_interview_id"),  // Reference to created VA interview
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Email templates - customizable email templates for various purposes
export const emailTemplates = pgTable("email_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),  // Template identifier (e.g., "va_interview_invite", "reminder_24h")
  label: text("label").notNull(),  // Human-readable label
  subject: text("subject").notNull(),  // Email subject line
  body: text("body").notNull(),  // Email body (supports placeholders like {{candidate_name}})
  description: text("description"),  // Description of when this template is used
  isDefault: boolean("is_default").default(false),  // Whether this is the system default
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// VA interviews - auto-created interviews for candidates
export const vaInterviews = pgTable("va_interviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientInterviewId: varchar("client_interview_id").notNull().references(() => clientInterviews.id),
  jobDescriptionId: varchar("job_description_id").references(() => jobDescriptions.id),
  
  // Interview timing (15 min before client interview, same end time)
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  
  // Meeting details (copied from client interview)
  meetingUrl: text("meeting_url"),
  meetingLocation: text("meeting_location"),
  notes: text("notes"),  // Custom notes for VAs
  title: text("title"),  // Event title (synced from Google Calendar)
  
  // Custom sender for calendar invites (if different from hiring manager)
  senderEmail: text("sender_email"),  // Email to use for sending calendar invites
  
  // Google Calendar event (created via API or linked from external)
  googleCalendarEventId: text("google_calendar_event_id"),
  
  // External event linkage - when VA interview was created outside the system
  // and linked by detecting matching calendar event
  linkedFromExternal: boolean("linked_from_external").default(false),
  externalEventLinkedAt: timestamp("external_event_linked_at"),
  
  // Bidirectional sync tracking
  lastSyncedFromCalendar: timestamp("last_synced_from_calendar"),
  calendarEventUpdatedAt: timestamp("calendar_event_updated_at"),  // Google Calendar's event.updated timestamp
  
  // Status
  status: text("status").notNull().default("pending"),  // "pending", "created", "sent", "failed"
  errorMessage: text("error_message"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// VA interview attendees - candidates invited to VA interviews
export const vaInterviewAttendees = pgTable("va_interview_attendees", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  vaInterviewId: varchar("va_interview_id").notNull().references(() => vaInterviews.id),
  resumeId: varchar("resume_id").references(() => resumes.id),  // Can be null for email-only attendees
  
  // Candidate info (denormalized for quick access)
  candidateName: text("candidate_name"),
  candidateEmail: text("candidate_email"),
  candidatePhone: text("candidate_phone"),
  
  // Approval status - must be approved before invite can be sent
  approvedForInvite: boolean("approved_for_invite").default(false),
  approvedAt: timestamp("approved_at"),
  
  // How the attendee was added
  addedSource: text("added_source").default("manual"),  // "manual", "job_assignment" - tracks if auto-added from job
  
  // Invite status
  inviteStatus: text("invite_status").notNull().default("pending"),  // "pending", "sent", "accepted", "declined"
  inviteSentAt: timestamp("invite_sent_at"),
  
  // Google Calendar RSVP status (synced from calendar)
  rsvpStatus: text("rsvp_status"),  // "needsAction", "accepted", "declined", "tentative"
  rsvpUpdatedAt: timestamp("rsvp_updated_at"),
  
  // Attendance status (for no-show tracking)
  attendanceStatus: text("attendance_status"),  // "attended", "no_show", "late", "rescheduled", "excused", null (not yet marked)
  attendanceMarkedAt: timestamp("attendance_marked_at"),
  attendanceMarkedBy: text("attendance_marked_by"),  // Email of user who marked attendance
  attendanceNotes: text("attendance_notes"),  // Optional notes about attendance
  
  // Reminder tracking
  reminder24hSentAt: timestamp("reminder_24h_sent_at"),
  reminder1hSentAt: timestamp("reminder_1h_sent_at"),
  
  // WhatsApp reminder tracking
  whatsappSentAt: timestamp("whatsapp_sent_at"),
  whatsappTemplateId: integer("whatsapp_template_id"),
  whatsappSentByName: text("whatsapp_sent_by_name"),
  
  // Double booking detection
  isDoubleBooked: boolean("is_double_booked").default(false),
  
  // Auto-removal tracking (for disqualified/blacklisted candidates)
  autoRemovedAt: timestamp("auto_removed_at"),
  autoRemovalReason: text("auto_removal_reason"),  // "disqualified_stage", "blacklisted_name"
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// VA interview waitlist - candidates on standby for interviews
export const vaInterviewWaitlist = pgTable("va_interview_waitlist", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobDescriptionId: varchar("job_description_id").notNull().references(() => jobDescriptions.id),
  resumeId: varchar("resume_id").notNull().references(() => resumes.id),
  
  // Candidate info (denormalized for quick access)
  candidateName: text("candidate_name"),
  candidateEmail: text("candidate_email"),
  
  // Priority and status
  priority: integer("priority").default(0),  // Higher number = higher priority
  status: text("status").notNull().default("waiting"),  // "waiting", "invited", "removed"
  notes: text("notes"),
  
  // When added and by whom
  addedAt: timestamp("added_at").defaultNow().notNull(),
  addedBy: text("added_by"),
  
  // If invited, track which interview
  invitedToInterviewId: varchar("invited_to_interview_id").references(() => vaInterviews.id),
  invitedAt: timestamp("invited_at"),
});

export const insertClientInterviewSchema = createInsertSchema(clientInterviews).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertVaInterviewSchema = createInsertSchema(vaInterviews).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertVaInterviewAttendeeSchema = createInsertSchema(vaInterviewAttendees).omit({
  id: true,
  createdAt: true,
});

export const insertVaInterviewWaitlistSchema = createInsertSchema(vaInterviewWaitlist).omit({
  id: true,
  addedAt: true,
});

export type ClientInterview = typeof clientInterviews.$inferSelect;
export type InsertClientInterview = z.infer<typeof insertClientInterviewSchema>;
export type VaInterview = typeof vaInterviews.$inferSelect;
export type InsertVaInterview = z.infer<typeof insertVaInterviewSchema>;
export type VaInterviewAttendee = typeof vaInterviewAttendees.$inferSelect;
export type InsertVaInterviewAttendee = z.infer<typeof insertVaInterviewAttendeeSchema>;
export type VaInterviewWaitlistEntry = typeof vaInterviewWaitlist.$inferSelect;
export type InsertVaInterviewWaitlistEntry = z.infer<typeof insertVaInterviewWaitlistSchema>;

export const insertEmailTemplateSchema = createInsertSchema(emailTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type InsertEmailTemplate = z.infer<typeof insertEmailTemplateSchema>;

// =============================================================================
// HRIQ - Enterprise Employee Management System (EEMS)
// =============================================================================

// Employment status enum values
export const EMPLOYMENT_STATUSES = [
  "pre_hire",
  "onboarding_scheduled",
  "onboarding_in_progress",
  "active",
  "leave",
  "termination_scheduled",
  "offboarding_in_progress",
  "offboarded"
] as const;

// Employment type enum values
export const EMPLOYMENT_TYPES = [
  "full_time",
  "part_time",
  "contractor",
  "intern"
] as const;

// Task type enum values
export const HRIQ_TASK_TYPES = [
  "hr",
  "it",
  "manager",
  "employee",
  "finance",
  "security"
] as const;

// Task status enum values
export const HRIQ_TASK_STATUSES = [
  "pending",
  "in_progress",
  "completed",
  "blocked"
] as const;

// Access provisioning status enum values
export const ACCESS_STATUSES = [
  "pending",
  "active",
  "revoked"
] as const;

// HRIQ Roles for RBAC
export const HRIQ_ROLES = [
  "hr_admin",
  "manager",
  "it_admin",
  "finance",
  "employee"
] as const;

// HRIQ Employees - Master employee record
export const hriqEmployees = pgTable("hriq_employees", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Core identity
  employeeNumber: text("employee_number").notNull().unique(), // System-generated, immutable
  legalFirstName: text("legal_first_name").notNull(),
  legalLastName: text("legal_last_name").notNull(),
  preferredName: text("preferred_name"),
  personalEmail: text("personal_email"),
  workEmail: text("work_email").unique(),
  phoneNumber: text("phone_number"),
  
  // Employment details
  employmentType: text("employment_type").notNull(), // full_time, part_time, contractor, intern
  department: text("department"),
  role: text("role"), // Job title
  managerId: varchar("manager_id"), // Self-reference to another employee
  location: text("location"),
  timezone: text("timezone"),
  
  // Payment & compensation
  paymentPlatform: text("payment_platform"), // e.g., "Wise", "PayPal", "Direct Deposit", "Payoneer"
  paymentAccountInfo: text("payment_account_info"), // Encrypted or masked account identifier
  hourlyRate: text("hourly_rate"), // Compensation rate
  currency: text("currency").default("USD"),
  
  // Personal info
  dateOfBirth: timestamp("date_of_birth"),
  streetAddress: text("street_address"),
  city: text("city"),
  stateProvince: text("state_province"),
  postalCode: text("postal_code"),
  country: text("country"),
  mobileNumber: text("mobile_number"),
  homePhone: text("home_phone"),
  
  // Bank/Payment details
  bankName: text("bank_name"),
  bankAccountNumber: text("bank_account_number"),
  bankAccountName: text("bank_account_name"),
  bankSwiftCode: text("bank_swift_code"),
  bankAddress: text("bank_address"),
  
  // Emergency contact
  emergencyContactName: text("emergency_contact_name"),
  emergencyContactPhone: text("emergency_contact_phone"),
  emergencyContactRelation: text("emergency_contact_relation"),
  
  // Time tracking
  dailyHoursTarget: text("daily_hours_target").default("7.25"), // 7h 15m = 7.25 hours
  timeDoctorEmail: text("time_doctor_email"), // For Time Doctor integration
  
  // Dates
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  
  // Status tracking
  employmentStatus: text("employment_status").notNull().default("pre_hire"),
  onboardingStatus: text("onboarding_status").notNull().default("not_started"), // not_started, in_progress, completed
  offboardingStatus: text("offboarding_status").notNull().default("not_started"), // not_started, in_progress, completed
  
  // HRIQ role for RBAC
  hriqRole: text("hriq_role").default("employee"), // hr_admin, manager, it_admin, finance, employee
  
  // Linked user account (for self-service)
  linkedUserId: varchar("linked_user_id").references(() => users.id),
  
  // RecruitCRM link - connect employee to their CRM candidate record
  recruitCrmId: text("recruit_crm_id"), // RecruitCRM candidate ID
  recruitCrmSlug: text("recruit_crm_slug"), // For direct CRM links
  recruitCrmSyncedAt: timestamp("recruit_crm_synced_at"), // Last sync from CRM
  
  // Record metadata
  isLocked: boolean("is_locked").default(false), // Locked after offboarding
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdByUserId: varchar("created_by_user_id").references(() => users.id),
});

// HRIQ Tasks - Workflow tasks for onboarding/offboarding
export const hriqTasks = pgTable("hriq_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Task relationship
  employeeId: varchar("employee_id").notNull().references(() => hriqEmployees.id, { onDelete: 'cascade' }),
  
  // Task details
  taskType: text("task_type").notNull(), // hr, it, manager, employee, finance, security
  title: text("title").notNull(),
  description: text("description"),
  
  // Assignment and ownership
  ownerRole: text("owner_role"), // Role-based assignment (hr_admin, it_admin, etc.)
  assignedToUserId: varchar("assigned_to_user_id").references(() => users.id),
  
  // Scheduling
  dueDate: timestamp("due_date"),
  
  // Status tracking
  status: text("status").notNull().default("pending"), // pending, in_progress, completed, blocked
  isBlocking: boolean("is_blocking").default(false), // Blocks status transitions if incomplete
  
  // Completion tracking
  completedAt: timestamp("completed_at"),
  completedByUserId: varchar("completed_by_user_id").references(() => users.id),
  
  // Workflow phase
  phase: text("phase"), // pre_onboarding, employee_onboarding, it_provisioning, go_live, pre_offboarding, access_revocation, recovery, closure
  
  // Metadata
  notes: text("notes"),
  metadata: jsonb("metadata"), // Additional context
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// HRIQ Access Provisioning - Track system access for employees
export const hriqAccessProvisioning = pgTable("hriq_access_provisioning", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  employeeId: varchar("employee_id").notNull().references(() => hriqEmployees.id, { onDelete: 'cascade' }),
  
  // System details
  systemName: text("system_name").notNull(), // e.g., "Email", "Slack", "HR Portal", "VPN"
  systemCategory: text("system_category"), // identity, communication, internal, external
  accessLevel: text("access_level"), // e.g., "admin", "user", "readonly"
  
  // Provisioning details
  status: text("status").notNull().default("pending"), // pending, active, revoked
  provisionedAt: timestamp("provisioned_at"),
  provisionedByUserId: varchar("provisioned_by_user_id").references(() => users.id),
  deprovisionedAt: timestamp("deprovisioned_at"),
  deprovisionedByUserId: varchar("deprovisioned_by_user_id").references(() => users.id),
  
  // Priority for revocation ordering
  revocationPriority: integer("revocation_priority").default(100), // Lower = revoke first (1=identity, 2=email, etc.)
  
  // Metadata
  notes: text("notes"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// HRIQ Manager Notes - Feedback and notes from managers
export const hriqManagerNotes = pgTable("hriq_manager_notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  employeeId: varchar("employee_id").notNull().references(() => hriqEmployees.id, { onDelete: 'cascade' }),
  authorUserId: varchar("author_user_id").references(() => users.id),
  authorName: text("author_name"),
  
  // Note content
  noteType: text("note_type").notNull().default("general"), // general, performance, feedback, warning, commendation
  content: text("content").notNull(),
  isPrivate: boolean("is_private").default(false), // Private notes only visible to HR/admin
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// HRIQ Payments - Payment history and tracking
export const hriqPayments = pgTable("hriq_payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  employeeId: varchar("employee_id").notNull().references(() => hriqEmployees.id, { onDelete: 'cascade' }),
  
  // Payment details
  paymentType: text("payment_type").notNull().default("salary"), // salary, bonus, reimbursement, commission, adjustment
  amount: text("amount").notNull(), // Stored as string for precision
  currency: text("currency").default("USD"),
  
  // Pay period
  periodStart: timestamp("period_start"),
  periodEnd: timestamp("period_end"),
  
  // Payment execution
  paymentDate: timestamp("payment_date"), // Scheduled or actual payment date
  paymentMethod: text("payment_method"), // wise, paypal, payoneer, direct_deposit
  transactionId: text("transaction_id"), // External reference from payment platform
  
  // Status
  status: text("status").notNull().default("pending"), // pending, processing, completed, failed, cancelled
  
  // Hours/rates for calculations
  hoursWorked: text("hours_worked"),
  hourlyRate: text("hourly_rate"),
  
  // Notes and metadata
  description: text("description"),
  notes: text("notes"),
  
  // Audit
  processedByUserId: varchar("processed_by_user_id").references(() => users.id),
  processedByName: text("processed_by_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// HRIQ Documents - Employee documents (tax forms, contracts, IDs)
export const hriqDocuments = pgTable("hriq_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  employeeId: varchar("employee_id").notNull().references(() => hriqEmployees.id, { onDelete: 'cascade' }),
  
  // Document details
  documentType: text("document_type").notNull(), // w9, i9, contract, tax_form, id_document, resume, offer_letter, nda, other
  documentName: text("document_name").notNull(),
  description: text("description"),
  
  // File storage
  fileUrl: text("file_url"), // URL or path to the stored file
  fileName: text("file_name"),
  fileSize: integer("file_size"), // In bytes
  mimeType: text("mime_type"),
  
  // Validity
  issuedDate: timestamp("issued_date"),
  expiryDate: timestamp("expiry_date"),
  isExpired: boolean("is_expired").default(false),
  
  // Status and verification
  status: text("status").default("pending"), // pending, verified, rejected, expired
  verifiedByUserId: varchar("verified_by_user_id").references(() => users.id),
  verifiedAt: timestamp("verified_at"),
  
  // Confidentiality
  isConfidential: boolean("is_confidential").default(false), // Only HR/Admin can view
  
  // Audit
  uploadedByUserId: varchar("uploaded_by_user_id").references(() => users.id),
  uploadedByName: text("uploaded_by_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// HRIQ Announcements - Company-wide announcements
export const hriqAnnouncements = pgTable("hriq_announcements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  title: text("title").notNull(),
  content: text("content").notNull(),
  priority: text("priority").default("normal"), // low, normal, high, urgent
  
  // Targeting
  targetDepartment: text("target_department"), // null = all departments
  targetRole: text("target_role"), // null = all roles
  
  // Scheduling
  publishedAt: timestamp("published_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
  
  // Author
  authorUserId: varchar("author_user_id").references(() => users.id),
  authorName: text("author_name"),
  
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// HRIQ Audit Log - Immutable audit trail
export const hriqAuditLog = pgTable("hriq_audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // When
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  
  // Who
  actorType: text("actor_type").notNull(), // "user" or "system"
  actorUserId: varchar("actor_user_id").references(() => users.id),
  actorDescription: text("actor_description"), // e.g., "System: Auto-escalation"
  
  // What
  action: text("action").notNull(), // e.g., "employee.created", "task.completed", "access.revoked"
  
  // On what
  objectType: text("object_type").notNull(), // "employee", "task", "access"
  objectId: varchar("object_id").notNull(),
  
  // Change details
  oldValue: jsonb("old_value"),
  newValue: jsonb("new_value"),
  
  // Context
  reason: text("reason"), // Why this action was taken
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
});

// HRIQ Workflow Templates - Define standard onboarding/offboarding task templates
export const hriqWorkflowTemplates = pgTable("hriq_workflow_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  name: text("name").notNull(), // e.g., "Standard Onboarding", "Contractor Onboarding"
  workflowType: text("workflow_type").notNull(), // "onboarding" or "offboarding"
  employmentType: text("employment_type"), // null = all, or specific type
  department: text("department"), // null = all, or specific department
  
  isActive: boolean("is_active").default(true),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// HRIQ Task Templates - Individual task definitions within workflow templates
export const hriqTaskTemplates = pgTable("hriq_task_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  workflowTemplateId: varchar("workflow_template_id").notNull().references(() => hriqWorkflowTemplates.id, { onDelete: 'cascade' }),
  
  // Task definition
  taskType: text("task_type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  ownerRole: text("owner_role").notNull(), // Who should own this task
  
  // Phase and ordering
  phase: text("phase").notNull(),
  sortOrder: integer("sort_order").default(0),
  
  // Task behavior
  isBlocking: boolean("is_blocking").default(false),
  dueDaysFromStart: integer("due_days_from_start"), // Days from workflow start to due date
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// HRIQ Onboarding Sessions - Tracks the overall onboarding process for an employee
export const hriqOnboardingSessions = pgTable("hriq_onboarding_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  employeeId: varchar("employee_id").notNull().references(() => hriqEmployees.id, { onDelete: 'cascade' }),
  recruitCrmCandidateId: text("recruitcrm_candidate_id"), // Link to CRM candidate
  
  // Status tracking
  status: text("status").notNull().default("not_started"), // not_started, in_progress, completed, cancelled
  currentStep: text("current_step").default("zoom_invite"), // zoom_invite, forms_sent, forms_completed, documents_uploaded, completed
  
  // Progress metrics (0-100)
  overallProgress: integer("overall_progress").default(0),
  
  // Zoom meeting details
  zoomMeetingLink: text("zoom_meeting_link"),
  zoomMeetingId: text("zoom_meeting_id"),
  zoomMeetingDate: timestamp("zoom_meeting_date"),
  zoomInviteSent: boolean("zoom_invite_sent").default(false),
  zoomInviteSentAt: timestamp("zoom_invite_sent_at"),
  zoomInviteAccepted: boolean("zoom_invite_accepted").default(false),
  zoomInviteAcceptedAt: timestamp("zoom_invite_accepted_at"),
  zoomAttended: boolean("zoom_attended").default(false),
  zoomAttendedAt: timestamp("zoom_attended_at"),
  
  // JotForm tracking
  jotformLinks: text("jotform_links"), // JSON array of form links
  jotformsSent: boolean("jotforms_sent").default(false),
  jotformsSentAt: timestamp("jotforms_sent_at"),
  jotformsSentData: text("jotforms_sent_data"), // JSON array of {formId, formName, sentAt, prefillUrl}
  jotformsCompleted: boolean("jotforms_completed").default(false),
  jotformsCompletedAt: timestamp("jotforms_completed_at"),
  
  // Document collection
  documentsRequired: text("documents_required"), // JSON array of required doc types
  documentsUploaded: boolean("documents_uploaded").default(false),
  documentsUploadedAt: timestamp("documents_uploaded_at"),
  
  // Timestamps
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  startedByUserId: varchar("started_by_user_id").references(() => users.id),
  startedByName: text("started_by_name"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// HRIQ Onboarding Steps - Individual checklist items for onboarding
export const hriqOnboardingSteps = pgTable("hriq_onboarding_steps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  sessionId: varchar("session_id").notNull().references(() => hriqOnboardingSessions.id, { onDelete: 'cascade' }),
  
  // Step details
  stepType: text("step_type").notNull(), // zoom_invite, zoom_attendance, jotform, document, custom
  stepName: text("step_name").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").default(0),
  
  // Status
  status: text("status").notNull().default("pending"), // pending, in_progress, completed, skipped
  isRequired: boolean("is_required").default(true),
  
  // For JotForm steps
  formUrl: text("form_url"),
  formSubmissionId: text("form_submission_id"),
  
  // For document steps
  documentType: text("document_type"),
  documentId: varchar("document_id"),
  
  // Completion tracking
  completedAt: timestamp("completed_at"),
  completedByUserId: varchar("completed_by_user_id").references(() => users.id),
  completedByName: text("completed_by_name"),
  
  // Notes
  notes: text("notes"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// HRIQ JotForm Templates - Pre-configured JotForm links for onboarding
export const hriqJotformTemplates = pgTable("hriq_jotform_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  name: text("name").notNull(), // e.g., "W-9 Form", "I-9 Form", "Direct Deposit Form"
  description: text("description"),
  formUrl: text("form_url").notNull(),
  formType: text("form_type").notNull(), // tax, banking, personal_info, policy_acknowledgment, other
  
  isRequired: boolean("is_required").default(true),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Insert schemas
export const insertHriqEmployeeSchema = createInsertSchema(hriqEmployees).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertHriqTaskSchema = createInsertSchema(hriqTasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertHriqAccessProvisioningSchema = createInsertSchema(hriqAccessProvisioning).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertHriqAuditLogSchema = createInsertSchema(hriqAuditLog).omit({
  id: true,
  timestamp: true,
});

export const insertHriqWorkflowTemplateSchema = createInsertSchema(hriqWorkflowTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertHriqTaskTemplateSchema = createInsertSchema(hriqTaskTemplates).omit({
  id: true,
  createdAt: true,
});

// Types
export type HriqEmployee = typeof hriqEmployees.$inferSelect;
export type InsertHriqEmployee = z.infer<typeof insertHriqEmployeeSchema>;
export type HriqTask = typeof hriqTasks.$inferSelect;
export type InsertHriqTask = z.infer<typeof insertHriqTaskSchema>;
export type HriqAccessProvisioning = typeof hriqAccessProvisioning.$inferSelect;
export type InsertHriqAccessProvisioning = z.infer<typeof insertHriqAccessProvisioningSchema>;
export type HriqAuditLog = typeof hriqAuditLog.$inferSelect;
export type InsertHriqAuditLog = z.infer<typeof insertHriqAuditLogSchema>;
export type HriqWorkflowTemplate = typeof hriqWorkflowTemplates.$inferSelect;
export type InsertHriqWorkflowTemplate = z.infer<typeof insertHriqWorkflowTemplateSchema>;
export type HriqTaskTemplate = typeof hriqTaskTemplates.$inferSelect;
export type InsertHriqTaskTemplate = z.infer<typeof insertHriqTaskTemplateSchema>;

// Onboarding types
export const insertHriqOnboardingSessionSchema = createInsertSchema(hriqOnboardingSessions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertHriqOnboardingStepSchema = createInsertSchema(hriqOnboardingSteps).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertHriqJotformTemplateSchema = createInsertSchema(hriqJotformTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type HriqOnboardingSession = typeof hriqOnboardingSessions.$inferSelect;
export type InsertHriqOnboardingSession = z.infer<typeof insertHriqOnboardingSessionSchema>;
export type HriqOnboardingStep = typeof hriqOnboardingSteps.$inferSelect;
export type InsertHriqOnboardingStep = z.infer<typeof insertHriqOnboardingStepSchema>;
export type HriqJotformTemplate = typeof hriqJotformTemplates.$inferSelect;
export type InsertHriqJotformTemplate = z.infer<typeof insertHriqJotformTemplateSchema>;

export type EmploymentStatus = typeof EMPLOYMENT_STATUSES[number];
export type EmploymentType = typeof EMPLOYMENT_TYPES[number];
export type HriqTaskType = typeof HRIQ_TASK_TYPES[number];
export type HriqTaskStatus = typeof HRIQ_TASK_STATUSES[number];
export type AccessStatus = typeof ACCESS_STATUSES[number];
export type HriqRole = typeof HRIQ_ROLES[number];

// Manager Notes and Announcements types
export type HriqManagerNote = typeof hriqManagerNotes.$inferSelect;
export type HriqAnnouncement = typeof hriqAnnouncements.$inferSelect;

// Payment types
export const insertHriqPaymentSchema = createInsertSchema(hriqPayments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type HriqPayment = typeof hriqPayments.$inferSelect;
export type InsertHriqPayment = z.infer<typeof insertHriqPaymentSchema>;

// Document types
export const insertHriqDocumentSchema = createInsertSchema(hriqDocuments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type HriqDocument = typeof hriqDocuments.$inferSelect;
export type InsertHriqDocument = z.infer<typeof insertHriqDocumentSchema>;

// Payment type options
export const PAYMENT_TYPES = ["salary", "bonus", "reimbursement", "commission", "adjustment"] as const;
export const PAYMENT_STATUSES = ["pending", "processing", "completed", "failed", "cancelled"] as const;
export const PAYMENT_METHODS = ["wise", "paypal", "payoneer", "direct_deposit"] as const;

// Document type options
export const DOCUMENT_TYPES = ["w9", "i9", "contract", "tax_form", "id_document", "resume", "offer_letter", "nda", "other"] as const;
export const DOCUMENT_STATUSES = ["pending", "verified", "rejected", "expired"] as const;
