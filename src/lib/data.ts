import { Course, Student, Batch, Quiz, Certificate, DashboardStats } from './supabase'

export const stats: DashboardStats = {
  totalStudents: 2847,
  totalCourses: 42,
  activeBatches: 12,
  certificatesIssued: 1893,
  recentEnrollments: 156,
  completionRate: 78.5,
}

export const revenueData = [
  { month: 'Sep', enrollments: 180, completions: 120 },
  { month: 'Oct', enrollments: 220, completions: 165 },
  { month: 'Nov', enrollments: 195, completions: 142 },
  { month: 'Dec', enrollments: 250, completions: 188 },
  { month: 'Jan', enrollments: 310, completions: 230 },
  { month: 'Feb', enrollments: 285, completions: 210 },
]

export const courses: Course[] = [
  {
    id: '1',
    title: 'Introduction to Drone Operations',
    description: 'Learn the fundamentals of UAV flight, regulations, and safety protocols for professional drone operations.',
    published: true,
    instructor: 'Capt. Ravi Menon',
    category: 'Operations',
    chapters_count: 8,
    lessons_count: 32,
    enrolled_count: 485,
    created_at: '2025-09-15',
    updated_at: '2026-01-20',
  },
  {
    id: '2',
    title: 'Advanced Flight Planning & Navigation',
    description: 'Master route planning, airspace classification, and NOTAM interpretation for complex missions.',
    published: true,
    instructor: 'Dr. Priya Sharma',
    category: 'Navigation',
    chapters_count: 6,
    lessons_count: 24,
    enrolled_count: 312,
    created_at: '2025-10-01',
    updated_at: '2026-02-05',
  },
  {
    id: '3',
    title: 'DGCA Remote Pilot Certification',
    description: 'Comprehensive preparation for the DGCA Remote Pilot License examination and certification.',
    published: true,
    instructor: 'Wg Cdr. Anil Kapoor (Retd)',
    category: 'Certification',
    chapters_count: 12,
    lessons_count: 48,
    enrolled_count: 728,
    created_at: '2025-08-20',
    updated_at: '2026-02-18',
  },
  {
    id: '4',
    title: 'Aerial Survey & Mapping',
    description: 'Techniques for photogrammetry, LiDAR operations, and GIS data processing from drone surveys.',
    published: true,
    instructor: 'Dr. Priya Sharma',
    category: 'Technical',
    chapters_count: 10,
    lessons_count: 40,
    enrolled_count: 256,
    created_at: '2025-11-10',
    updated_at: '2026-01-30',
  },
  {
    id: '5',
    title: 'Drone Maintenance & Repair',
    description: 'Hands-on training for UAV maintenance, troubleshooting, and field repair procedures.',
    published: false,
    instructor: 'Rajesh Kumar',
    category: 'Technical',
    chapters_count: 7,
    lessons_count: 28,
    enrolled_count: 0,
    created_at: '2026-01-05',
    updated_at: '2026-02-20',
  },
  {
    id: '6',
    title: 'Emergency Procedures & Risk Management',
    description: 'Safety protocols, emergency landing procedures, and operational risk assessment frameworks.',
    published: true,
    instructor: 'Capt. Ravi Menon',
    category: 'Safety',
    chapters_count: 5,
    lessons_count: 20,
    enrolled_count: 189,
    created_at: '2025-12-01',
    updated_at: '2026-02-10',
  },
]

export const students: Student[] = [
  { id: '1', name: 'Aarav Patel', email: 'aarav.p@email.com', enrolled_courses: 3, completed_courses: 2, progress: 85, joined_at: '2025-09-20' },
  { id: '2', name: 'Sneha Reddy', email: 'sneha.r@email.com', enrolled_courses: 2, completed_courses: 1, progress: 72, joined_at: '2025-10-05' },
  { id: '3', name: 'Vikram Singh', email: 'vikram.s@email.com', enrolled_courses: 4, completed_courses: 3, progress: 91, joined_at: '2025-08-15' },
  { id: '4', name: 'Ananya Gupta', email: 'ananya.g@email.com', enrolled_courses: 1, completed_courses: 0, progress: 34, joined_at: '2026-01-10' },
  { id: '5', name: 'Rohit Deshmukh', email: 'rohit.d@email.com', enrolled_courses: 2, completed_courses: 2, progress: 100, joined_at: '2025-09-01' },
  { id: '6', name: 'Meera Nair', email: 'meera.n@email.com', enrolled_courses: 3, completed_courses: 1, progress: 58, joined_at: '2025-11-20' },
  { id: '7', name: 'Karthik Iyer', email: 'karthik.i@email.com', enrolled_courses: 2, completed_courses: 1, progress: 67, joined_at: '2025-12-15' },
  { id: '8', name: 'Divya Joshi', email: 'divya.j@email.com', enrolled_courses: 1, completed_courses: 1, progress: 100, joined_at: '2026-01-22' },
]

export const batches: Batch[] = [
  { id: '1', title: 'Batch Alpha — Q1 2026', course_id: '3', course_title: 'DGCA Remote Pilot Certification', start_date: '2026-01-15', end_date: '2026-03-15', student_count: 28, max_students: 30, status: 'active' },
  { id: '2', title: 'Batch Bravo — Drone Ops', course_id: '1', course_title: 'Introduction to Drone Operations', start_date: '2026-02-01', end_date: '2026-03-30', student_count: 22, max_students: 25, status: 'active' },
  { id: '3', title: 'Batch Charlie — Navigation', course_id: '2', course_title: 'Advanced Flight Planning & Navigation', start_date: '2026-03-10', end_date: '2026-05-10', student_count: 8, max_students: 20, status: 'upcoming' },
  { id: '4', title: 'Batch Delta — Survey Q4', course_id: '4', course_title: 'Aerial Survey & Mapping', start_date: '2025-10-01', end_date: '2025-12-15', student_count: 25, max_students: 25, status: 'completed' },
  { id: '5', title: 'Batch Echo — Safety', course_id: '6', course_title: 'Emergency Procedures & Risk Management', start_date: '2026-02-15', end_date: '2026-04-15', student_count: 18, max_students: 20, status: 'active' },
]

export const quizzes: Quiz[] = [
  { id: '1', title: 'Airspace Classification Quiz', course_id: '2', course_title: 'Advanced Flight Planning & Navigation', questions_count: 20, avg_score: 76, attempts: 245, passing_score: 70 },
  { id: '2', title: 'DGCA Mock Exam — Module A', course_id: '3', course_title: 'DGCA Remote Pilot Certification', questions_count: 50, avg_score: 68, attempts: 512, passing_score: 60 },
  { id: '3', title: 'Safety Protocols Assessment', course_id: '6', course_title: 'Emergency Procedures & Risk Management', questions_count: 15, avg_score: 82, attempts: 167, passing_score: 75 },
  { id: '4', title: 'Pre-Flight Checklist Knowledge', course_id: '1', course_title: 'Introduction to Drone Operations', questions_count: 25, avg_score: 88, attempts: 398, passing_score: 70 },
  { id: '5', title: 'GIS & Mapping Fundamentals', course_id: '4', course_title: 'Aerial Survey & Mapping', questions_count: 30, avg_score: 71, attempts: 189, passing_score: 65 },
]

export const certificates: Certificate[] = [
  { id: '1', student_name: 'Vikram Singh', course_title: 'DGCA Remote Pilot Certification', issued_at: '2026-02-15', certificate_id: 'AERO-2026-0891' },
  { id: '2', student_name: 'Rohit Deshmukh', course_title: 'Introduction to Drone Operations', issued_at: '2026-02-10', certificate_id: 'AERO-2026-0887' },
  { id: '3', student_name: 'Aarav Patel', course_title: 'Advanced Flight Planning & Navigation', issued_at: '2026-01-28', certificate_id: 'AERO-2026-0854' },
  { id: '4', student_name: 'Divya Joshi', course_title: 'Emergency Procedures & Risk Management', issued_at: '2026-02-20', certificate_id: 'AERO-2026-0903' },
  { id: '5', student_name: 'Rohit Deshmukh', course_title: 'DGCA Remote Pilot Certification', issued_at: '2026-01-15', certificate_id: 'AERO-2026-0812' },
  { id: '6', student_name: 'Sneha Reddy', course_title: 'Introduction to Drone Operations', issued_at: '2026-02-18', certificate_id: 'AERO-2026-0898' },
]

export const activityFeed = [
  { type: 'enrollment', text: 'Ananya Gupta enrolled in DGCA Remote Pilot Certification', time: '2 hours ago' },
  { type: 'completion', text: 'Divya Joshi completed Emergency Procedures & Risk Management', time: '5 hours ago' },
  { type: 'quiz', text: 'Vikram Singh scored 92% on DGCA Mock Exam — Module A', time: '8 hours ago' },
  { type: 'certificate', text: 'Certificate issued to Divya Joshi for Emergency Procedures', time: '1 day ago' },
  { type: 'batch', text: 'Batch Charlie — Navigation is now open for enrollment', time: '1 day ago' },
  { type: 'enrollment', text: 'Karthik Iyer enrolled in Aerial Survey & Mapping', time: '2 days ago' },
]
