import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local'
  )
}

const _global = globalThis as unknown as {
  __supabase?: ReturnType<typeof createBrowserClient>
}

function getClient() {
  if (_global.__supabase) return _global.__supabase
  const client = createBrowserClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      detectSessionInUrl: true,
    },
  })
  if (typeof window !== 'undefined') _global.__supabase = client
  return client
}

export const supabase = getClient()

export interface Course {
  id: string; title: string; description: string; image_url?: string; published: boolean
  instructor: string; category: string; chapters_count: number; lessons_count: number
  enrolled_count: number; created_at: string; updated_at: string
}

export interface Student {
  id: string; name: string; email: string; avatar_url?: string
  enrolled_courses: number; completed_courses: number; progress: number; joined_at: string
}

export interface Batch {
  id: string; title: string; course_id: string; course_title: string
  start_date: string; end_date: string; student_count: number; max_students: number
  status: 'upcoming' | 'active' | 'completed'
}

export interface Quiz {
  id: string; title: string; course_id: string; course_title: string
  questions_count: number; avg_score: number; attempts: number; passing_score: number
}

export interface Certificate {
  id: string; student_name: string; course_title: string; issued_at: string; certificate_id: string
}

export interface LiveClass {
  id: string; title: string; batch_id?: string; batch_title?: string; instructor: string
  meeting_link?: string; start_time: string; duration_minutes: number
  status: 'scheduled' | 'live' | 'completed' | 'cancelled'; attendees: number; max_attendees: number
}

export interface Assignment {
  id: string; title: string; course_id?: string; course_title?: string; description?: string
  due_date?: string; submissions_count: number; max_score: number
  status: 'draft' | 'active' | 'closed'
}

export interface Employee {
  id: string; name: string; email: string; role: string; department: string
  status: 'active' | 'on_leave' | 'inactive'; join_date: string; phone?: string; avatar_url?: string
}

export interface Attendance {
  id: string; employee_id?: string; employee_name: string; date: string
  check_in?: string; check_out?: string
  status: 'present' | 'absent' | 'late' | 'half_day' | 'remote'; hours_worked: number
}

export interface ScheduleEvent {
  id: string; title: string; type: 'class' | 'meeting' | 'deadline' | 'event' | 'review'
  start_time: string; end_time?: string; location?: string; description?: string
  attendees_count: number; color: string
}

export interface Enrollment {
  id: string; student_id: string; course_id: string; progress: number
  status: 'active' | 'completed' | 'dropped'; enrolled_at: string; completed_at?: string
}

export interface CourseContent {
  id: string; course_id: string; title: string
  type: 'chapter' | 'lesson' | 'video' | 'document' | 'quiz'
  content?: string; parent_id?: string; sort_order: number; duration_minutes: number
  created_at: string
}

export interface Announcement {
  id: string; title: string; content: string; course_id?: string; author: string
  priority: 'low' | 'normal' | 'high' | 'urgent'; pinned: boolean; created_at: string
}

export interface Discussion {
  id: string; course_id?: string; title: string; content: string; author: string
  replies_count: number; is_resolved: boolean; created_at: string
}

export interface DashboardStats {
  totalStudents: number; totalCourses: number; activeBatches: number
  certificatesIssued: number; recentEnrollments: number; completionRate: number
  activeStaff: number; upcomingClasses: number; activeAssignments: number
  totalLeads?: number; upcomingConsultations?: number; convertedLeads?: number
}

// ── Aviation-specific types ──

export interface CertificationType {
  id: string; name: string; authority: string; category: string
  validity_months: number | null; description?: string; requirements?: string
}

export interface UserCertification {
  id: string; user_id: string; certification_type_id: string
  certificate_number?: string; issued_date: string; expiry_date?: string
  status: 'active' | 'expiring_soon' | 'expired' | 'revoked' | 'pending'
  issuing_authority?: string; notes?: string; document_url?: string
  created_at: string; certification_types?: CertificationType
}

export interface FlightLogEntry {
  id: string; user_id: string; date: string
  aircraft_type?: string; aircraft_registration?: string
  departure_location?: string; arrival_location?: string
  flight_type: string; total_time: number
  pic_time: number; sic_time: number; dual_time: number; solo_time: number
  instrument_time: number; night_time: number; cross_country_time: number
  simulator_time: number; landings_day: number; landings_night: number
  approaches: number; instructor_name?: string; instructor_endorsement: boolean
  remarks?: string; course_id?: string; created_at: string
}

export interface FlightLogSummary {
  user_id: string; total_flights: number; total_hours: number
  pic_hours: number; dual_hours: number; solo_hours: number
  instrument_hours: number; night_hours: number; xc_hours: number
  sim_hours: number; total_day_landings: number; total_night_landings: number
  landings_last_90_days: number
}

export interface LearningPath {
  id: string; title: string; description?: string; category: string
  target_role?: string; estimated_hours: number; course_count: number
  published: boolean; created_by?: string; created_at: string
}

export interface LearningPathCourse {
  id: string; learning_path_id: string; course_id: string
  sort_order: number; is_required: boolean; prerequisite_course_id?: string
  courses?: Course
}

export interface QuizQuestion {
  id: string; quiz_id: string; question_text: string
  options: string[]; correct_answer: number; explanation?: string
  sort_order: number; created_at: string
}

export interface QuizAttempt {
  id: string; quiz_id: string; user_id: string; score: number
  passed: boolean; answers: Record<string, number>
  started_at: string; completed_at?: string
}

export interface EmailTemplate {
  id: string; template_key: string; name: string; subject: string
  html_body: string; description?: string; variables: string[]
  is_active: boolean; updated_at: string; created_at: string
}

export interface EmailSetting {
  id: string; setting_key: string; setting_value: string; updated_at: string
}

export interface Badge {
  id: string; name: string; description?: string; icon: string; color: string
  requirement_type: string; requirement_value: number
}

export interface LeaderboardEntry {
  user_id: string; full_name: string; role: string; avatar_url?: string
  total_points: number; badge_count: number; rank: number
}

export interface Lead {
  id: string; name: string; email: string; phone?: string
  interest?: string; message?: string; notes?: string
  consultation_date?: string; meet_link?: string
  status: 'new' | 'scheduled' | 'completed' | 'no_show' | 'converted' | 'cancelled'
  source?: string; utm_source?: string; utm_campaign?: string
  created_at: string
}

// ── Exam Prep types ──

export type ExamAuthority = 'FAA' | 'ICAO' | 'EASA'

export interface ExamCategory {
  id: string
  authority: ExamAuthority
  code: string
  name: string
  description: string
  question_count: number
  time_limit_minutes: number
  passing_score: number
  icon: string
  color: string
  topics: ExamTopic[]
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'expert'
  sort_order: number
  published: boolean
  created_at: string
}

export interface ExamTopic {
  id: string
  category_id: string
  code: string
  name: string
  description: string
  question_count: number
  sort_order: number
}

export interface ExamQuestion {
  id: string
  category_id: string
  topic_id?: string
  question_text: string
  options: string[]
  correct_answer: number
  explanation: string
  reference?: string
  difficulty: 'easy' | 'medium' | 'hard'
  sort_order: number
  created_at: string
}

export interface ExamAttempt {
  id: string
  user_id: string
  category_id: string
  score: number
  total_questions: number
  correct_answers: number
  passed: boolean
  time_spent_seconds: number
  answers: Record<string, number>
  started_at: string
  completed_at?: string
}

export interface ExamProgress {
  category_id: string
  category_name: string
  authority: ExamAuthority
  attempts: number
  best_score: number
  last_score: number
  last_attempt_at: string
  passed: boolean
}

export interface StudyMaterial {
  id: string
  category_id: string
  topic_id: string
  key_concepts: string[]
  formulas: string[]
  mnemonics: string[]
  references: string[]
  tips: string[]
  content_markdown: string
  sort_order: number
  created_at: string
}
