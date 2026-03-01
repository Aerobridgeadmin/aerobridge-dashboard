import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Database types
export interface Course {
  id: string
  title: string
  description: string
  image_url?: string
  published: boolean
  instructor: string
  category: string
  chapters_count: number
  lessons_count: number
  enrolled_count: number
  created_at: string
  updated_at: string
}

export interface Student {
  id: string
  name: string
  email: string
  avatar_url?: string
  enrolled_courses: number
  completed_courses: number
  progress: number
  joined_at: string
}

export interface Batch {
  id: string
  title: string
  course_id: string
  course_title: string
  start_date: string
  end_date: string
  student_count: number
  max_students: number
  status: 'upcoming' | 'active' | 'completed'
}

export interface Quiz {
  id: string
  title: string
  course_id: string
  course_title: string
  questions_count: number
  avg_score: number
  attempts: number
  passing_score: number
}

export interface Certificate {
  id: string
  student_name: string
  course_title: string
  issued_at: string
  certificate_id: string
}

export interface DashboardStats {
  totalStudents: number
  totalCourses: number
  activeBatches: number
  certificatesIssued: number
  recentEnrollments: number
  completionRate: number
}
