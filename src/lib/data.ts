import { supabase, Course, Student, Batch, Quiz, Certificate, LiveClass, Assignment, Employee, Attendance, ScheduleEvent, Announcement, Discussion, DashboardStats, UserCertification, CertificationType, FlightLogEntry, LearningPath, CourseContent, QuizQuestion, EmailTemplate, EmailSetting, Lead } from './supabase'

// ── QUERY HELPER ──
async function query<T>(
  table: string,
  options?: { order?: string; ascending?: boolean; limit?: number; single?: boolean; filter?: { col: string; val: string } }
): Promise<T> {
  let q = supabase.from(table).select('*')
  if (options?.filter) q = q.eq(options.filter.col, options.filter.val)
  if (options?.order) q = q.order(options.order, { ascending: options.ascending ?? false })
  if (options?.limit) q = q.limit(options.limit)
  const result = options?.single ? await (q as any).single() : await q
  if (result.error) throw new Error(`Failed to fetch ${table}: ${result.error.message}`)
  return (result.data ?? (options?.single ? null : [])) as T
}

// ── READ ──
export async function getCourses(): Promise<Course[]> {
  return query('courses', { order: 'created_at' })
}
export async function getStudents(): Promise<Student[]> {
  return query('students', { order: 'joined_at' })
}
export async function getBatches(): Promise<Batch[]> {
  return query('batches', { order: 'start_date' })
}
export async function getQuizzes(): Promise<Quiz[]> {
  return query('quizzes', { order: 'title', ascending: true })
}
export async function getCertificates(): Promise<Certificate[]> {
  return query('certificates', { order: 'issued_at' })
}
export async function getLiveClasses(): Promise<LiveClass[]> {
  return query('live_classes', { order: 'start_time', ascending: true })
}
export async function getAssignments(): Promise<Assignment[]> {
  return query('assignments', { order: 'due_date', ascending: true })
}
export async function getEmployees(): Promise<Employee[]> {
  return query('employees', { order: 'name', ascending: true })
}
export async function getAttendance(): Promise<Attendance[]> {
  return query('attendance', { order: 'date' })
}
export async function getSchedule(): Promise<ScheduleEvent[]> {
  return query('schedule', { order: 'start_time', ascending: true })
}
export async function getAnnouncements(): Promise<Announcement[]> {
  return query('announcements', { order: 'created_at' })
}
export async function getDiscussions(): Promise<Discussion[]> {
  return query('discussions', { order: 'created_at' })
}
export async function getDashboardStats(): Promise<DashboardStats> {
  const { data, error } = await supabase.from('dashboard_stats').select('*').single()
  if (error) console.error('Dashboard stats fetch failed:', error.message)
  return data ?? { totalStudents:0,totalCourses:0,activeBatches:0,certificatesIssued:0,recentEnrollments:0,completionRate:0,activeStaff:0,upcomingClasses:0,activeAssignments:0 }
}
export async function getActivityFeed() {
  const { data, error } = await supabase.from('activity_feed').select('*').order('created_at', { ascending: false }).limit(6)
  if (error) console.error('Activity feed fetch failed:', error.message)
  return data ?? []
}

// ── CREATE ──
export async function createCourse(course: Partial<Course>) {
  const { data, error } = await supabase.from('courses').insert(course).select().single()
  if (error) throw error
  return data
}
export async function createStudent(student: Partial<Student>) {
  const { data, error } = await supabase.from('students').insert(student).select().single()
  if (error) throw error
  return data
}
export async function createBatch(batch: Partial<Batch>) {
  const { data, error } = await supabase.from('batches').insert(batch).select().single()
  if (error) throw error
  return data
}
export async function createQuiz(quiz: Partial<Quiz>) {
  const { data, error } = await supabase.from('quizzes').insert(quiz).select().single()
  if (error) throw error
  return data
}
export async function createCertificate(cert: Partial<Certificate>) {
  const { data, error } = await supabase.from('certificates').insert(cert).select().single()
  if (error) throw error
  return data
}
export async function createLiveClass(cls: Partial<LiveClass>) {
  const { data, error } = await supabase.from('live_classes').insert(cls).select().single()
  if (error) throw error
  return data
}
export async function createAssignment(assignment: Partial<Assignment>) {
  const { data, error } = await supabase.from('assignments').insert(assignment).select().single()
  if (error) throw error
  return data
}
export async function createEmployee(emp: Partial<Employee>) {
  const { data, error } = await supabase.from('employees').insert(emp).select().single()
  if (error) throw error
  return data
}
export async function createAttendance(record: Partial<Attendance>) {
  const { data, error } = await supabase.from('attendance').insert(record).select().single()
  if (error) throw error
  return data
}
export async function createScheduleEvent(event: Partial<ScheduleEvent>) {
  const { data, error } = await supabase.from('schedule').insert(event).select().single()
  if (error) throw error
  return data
}
export async function createAnnouncement(ann: Partial<Announcement>) {
  const { data, error } = await supabase.from('announcements').insert(ann).select().single()
  if (error) throw error
  return data
}
export async function createDiscussion(disc: Partial<Discussion>) {
  const { data, error } = await supabase.from('discussions').insert(disc).select().single()
  if (error) throw error
  return data
}

// ── UPDATE ──
export async function updateCourse(id: string, updates: Partial<Course>) {
  const { data, error } = await supabase.from('courses').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single()
  if (error) throw error
  return data
}

// ── DELETE ──
const DELETABLE_TABLES = [
  'courses', 'students', 'batches', 'quizzes', 'certificates',
  'live_classes', 'assignments', 'employees', 'attendance',
  'schedule', 'announcements', 'discussions', 'certification_types',
  'user_certifications', 'flight_log', 'learning_paths', 'leads',
] as const

export async function deleteRecord(table: string, id: string) {
  if (!DELETABLE_TABLES.includes(table as any)) {
    throw new Error(`Delete not allowed on table: ${table}`)
  }
  const { error } = await supabase.from(table).delete().eq('id', id)
  if (error) throw error
}

// ── AVIATION: CERTIFICATIONS ──
export async function getCertificationTypes() {
  const { data } = await supabase.from('certification_types').select('*').order('name')
  return data ?? []
}
export async function getUserCertifications(userId?: string) {
  let q = supabase.from('user_certifications').select('*, certification_types(*)').order('expiry_date', { ascending: true })
  if (userId) q = q.eq('user_id', userId)
  const { data } = await q
  return data ?? []
}
export async function createUserCertification(cert: Partial<UserCertification>) {
  const { data, error } = await supabase.from('user_certifications').insert(cert).select().single()
  if (error) throw error
  return data
}
export async function createCertificationType(ct: Partial<CertificationType>) {
  const { data, error } = await supabase.from('certification_types').insert(ct).select().single()
  if (error) throw error
  return data
}

// ── AVIATION: FLIGHT LOG ──
export async function getFlightLog(userId?: string) {
  let q = supabase.from('flight_log').select('*').order('date', { ascending: false })
  if (userId) q = q.eq('user_id', userId)
  const { data } = await q
  return data ?? []
}
export async function getFlightLogSummary(userId: string) {
  const { data } = await supabase.from('flight_log_summary').select('*').eq('user_id', userId).single()
  return data
}
export async function createFlightLogEntry(entry: Partial<FlightLogEntry>) {
  const { data, error } = await supabase.from('flight_log').insert(entry).select().single()
  if (error) throw error
  return data
}

// ── AVIATION: LEARNING PATHS ──
export async function getLearningPaths() {
  const { data } = await supabase.from('learning_paths').select('*').order('created_at', { ascending: false })
  return data ?? []
}
export async function getLearningPathCourses(pathId: string) {
  const { data } = await supabase.from('learning_path_courses').select('*, courses(*)').eq('learning_path_id', pathId).order('sort_order')
  return data ?? []
}
export async function createLearningPath(path: Partial<LearningPath>) {
  const { data, error } = await supabase.from('learning_paths').insert(path).select().single()
  if (error) throw error
  return data
}
export async function addCourseToPath(pathId: string, courseId: string, sortOrder: number) {
  const { error } = await supabase.from('learning_path_courses').insert({ learning_path_id: pathId, course_id: courseId, sort_order: sortOrder })
  if (error) throw error
}

// ── GAMIFICATION ──
export async function getLeaderboard() {
  const { data } = await supabase.from('leaderboard').select('*').order('rank').limit(20)
  return data ?? []
}
export async function awardPoints(userId: string, points: number, action: string, description: string) {
  const { error } = await supabase.from('user_points').insert({ user_id: userId, points, action, description })
  if (error) throw new Error(`Failed to award points: ${error.message}`)
}

// ── COURSE CONTENT ──
export async function getCourseContent(courseId: string): Promise<CourseContent[]> {
  const { data } = await supabase.from('course_content').select('*').eq('course_id', courseId).order('sort_order')
  return data ?? []
}
export async function createCourseContent(content: Partial<CourseContent>) {
  const { data, error } = await supabase.from('course_content').insert(content).select().single()
  if (error) throw error
  return data
}

// ── QUIZ QUESTIONS ──
export async function getQuizQuestions(quizId: string): Promise<QuizQuestion[]> {
  const { data } = await supabase.from('quiz_questions').select('*').eq('quiz_id', quizId).order('sort_order')
  return data ?? []
}
export async function createQuizQuestion(q: Partial<QuizQuestion>) {
  const { data, error } = await supabase.from('quiz_questions').insert(q).select().single()
  if (error) throw error
  return data
}


// ── EMAIL TEMPLATES ──
export async function getEmailTemplates(): Promise<EmailTemplate[]> {
  const { data } = await supabase.from('email_templates').select('*').order('template_key')
  return data ?? []
}
export async function updateEmailTemplate(id: string, updates: Partial<EmailTemplate>) {
  const { data, error } = await supabase.from('email_templates').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single()
  if (error) throw error
  return data
}
export async function getEmailSettings(): Promise<Record<string, string>> {
  const { data } = await supabase.from('email_settings').select('*')
  const settings: Record<string, string> = {}
  data?.forEach((s: EmailSetting) => { settings[s.setting_key] = s.setting_value })
  return settings
}
export async function updateEmailSetting(key: string, value: string) {
  const { error } = await supabase.from('email_settings').update({ setting_value: value, updated_at: new Date().toISOString() }).eq('setting_key', key)
  if (error) throw error
}

// ── LEADS ──
export async function getLeads(): Promise<Lead[]> {
  const { data, error } = await supabase.from('leads').select('*').order('created_at', { ascending: false })
  if (error) console.error('Leads fetch failed:', error.message)
  return data ?? []
}
export async function createLead(lead: Partial<Lead>) {
  const { data, error } = await supabase.from('leads').insert(lead).select().single()
  if (error) throw error
  return data
}
export async function updateLead(id: string, updates: Partial<Lead>) {
  const { data, error } = await supabase.from('leads').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single()
  if (error) throw error
  return data
}

// ── COMPLIANCE ──
export async function getComplianceOverview() {
  const { data } = await supabase.from('compliance_overview').select('*')
  return data ?? []
}

// ── MONTHLY STATS ──
export async function getMonthlyStats(): Promise<{ month: string; enrollments: number; completions: number }[]> {
  const { data } = await supabase.from('monthly_stats').select('*').order('month_key', { ascending: true })
  return data ?? []
}

// ── ACTIVITY FEED HELPER ──
export async function logActivity(type: string, text: string) {
  const { error } = await supabase.from('activity_feed').insert({ type, text, time: 'Just now' })
  if (error) console.error('Failed to log activity:', error.message)
}
