import { supabase, Course, Student, Batch, Quiz, Certificate, LiveClass, Assignment, Employee, Attendance, ScheduleEvent, Announcement, Discussion, DashboardStats } from './supabase'

// ── READ ──
export async function getCourses(): Promise<Course[]> {
  const { data } = await supabase.from('courses').select('*').order('created_at', { ascending: false })
  return data ?? []
}
export async function getStudents(): Promise<Student[]> {
  const { data } = await supabase.from('students').select('*').order('joined_at', { ascending: false })
  return data ?? []
}
export async function getBatches(): Promise<Batch[]> {
  const { data } = await supabase.from('batches').select('*').order('start_date', { ascending: false })
  return data ?? []
}
export async function getQuizzes(): Promise<Quiz[]> {
  const { data } = await supabase.from('quizzes').select('*').order('title')
  return data ?? []
}
export async function getCertificates(): Promise<Certificate[]> {
  const { data } = await supabase.from('certificates').select('*').order('issued_at', { ascending: false })
  return data ?? []
}
export async function getLiveClasses(): Promise<LiveClass[]> {
  const { data } = await supabase.from('live_classes').select('*').order('start_time', { ascending: true })
  return data ?? []
}
export async function getAssignments(): Promise<Assignment[]> {
  const { data } = await supabase.from('assignments').select('*').order('due_date', { ascending: true })
  return data ?? []
}
export async function getEmployees(): Promise<Employee[]> {
  const { data } = await supabase.from('employees').select('*').order('name')
  return data ?? []
}
export async function getAttendance(): Promise<Attendance[]> {
  const { data } = await supabase.from('attendance').select('*').order('date', { ascending: false })
  return data ?? []
}
export async function getSchedule(): Promise<ScheduleEvent[]> {
  const { data } = await supabase.from('schedule').select('*').order('start_time', { ascending: true })
  return data ?? []
}
export async function getAnnouncements(): Promise<Announcement[]> {
  const { data } = await supabase.from('announcements').select('*').order('created_at', { ascending: false })
  return data ?? []
}
export async function getDiscussions(): Promise<Discussion[]> {
  const { data } = await supabase.from('discussions').select('*').order('created_at', { ascending: false })
  return data ?? []
}
export async function getDashboardStats(): Promise<DashboardStats> {
  const { data } = await supabase.from('dashboard_stats').select('*').single()
  return data ?? { totalStudents:0,totalCourses:0,activeBatches:0,certificatesIssued:0,recentEnrollments:0,completionRate:0,activeStaff:0,upcomingClasses:0,activeAssignments:0 }
}
export async function getActivityFeed() {
  const { data } = await supabase.from('activity_feed').select('*').order('created_at', { ascending: false }).limit(6)
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
export async function deleteRecord(table: string, id: string) {
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
export async function createUserCertification(cert: any) {
  const { data, error } = await supabase.from('user_certifications').insert(cert).select().single()
  if (error) throw error
  return data
}
export async function createCertificationType(ct: any) {
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
export async function createFlightLogEntry(entry: any) {
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
export async function createLearningPath(path: any) {
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
  await supabase.from('user_points').insert({ user_id: userId, points, action, description })
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
  await supabase.from('activity_feed').insert({ type, text, time: 'Just now' })
}
