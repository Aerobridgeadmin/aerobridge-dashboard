import { supabase, Course, Student, Batch, Quiz, Certificate, DashboardStats } from './supabase'

// Fetch functions — pull live from Supabase
export async function getCourses(): Promise<Course[]> {
  const { data, error } = await supabase
    .from('courses')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) { console.error('Error fetching courses:', error); return [] }
  return data ?? []
}

export async function getStudents(): Promise<Student[]> {
  const { data, error } = await supabase
    .from('students')
    .select('*')
    .order('joined_at', { ascending: false })
  if (error) { console.error('Error fetching students:', error); return [] }
  return data ?? []
}

export async function getBatches(): Promise<Batch[]> {
  const { data, error } = await supabase
    .from('batches')
    .select('*')
    .order('start_date', { ascending: false })
  if (error) { console.error('Error fetching batches:', error); return [] }
  return data ?? []
}

export async function getQuizzes(): Promise<Quiz[]> {
  const { data, error } = await supabase
    .from('quizzes')
    .select('*')
    .order('title')
  if (error) { console.error('Error fetching quizzes:', error); return [] }
  return data ?? []
}

export async function getCertificates(): Promise<Certificate[]> {
  const { data, error } = await supabase
    .from('certificates')
    .select('*')
    .order('issued_at', { ascending: false })
  if (error) { console.error('Error fetching certificates:', error); return [] }
  return data ?? []
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const { data, error } = await supabase
    .from('dashboard_stats')
    .select('*')
    .single()
  if (error || !data) {
    console.error('Error fetching stats:', error)
    return {
      totalStudents: 0,
      totalCourses: 0,
      activeBatches: 0,
      certificatesIssued: 0,
      recentEnrollments: 0,
      completionRate: 0,
    }
  }
  return data as DashboardStats
}

export async function getActivityFeed() {
  const { data, error } = await supabase
    .from('activity_feed')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(6)
  if (error) { console.error('Error fetching activity:', error); return [] }
  return data ?? []
}

export const revenueData = [
  { month: 'Sep', enrollments: 180, completions: 120 },
  { month: 'Oct', enrollments: 220, completions: 165 },
  { month: 'Nov', enrollments: 195, completions: 142 },
  { month: 'Dec', enrollments: 250, completions: 188 },
  { month: 'Jan', enrollments: 310, completions: 230 },
  { month: 'Feb', enrollments: 285, completions: 210 },
]
