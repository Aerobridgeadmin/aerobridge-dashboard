-- ============================================
-- AeroBridge Dashboard — Supabase Migration
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================

-- 1. COURSES
CREATE TABLE IF NOT EXISTS courses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  published BOOLEAN DEFAULT false,
  instructor TEXT NOT NULL,
  category TEXT NOT NULL,
  chapters_count INTEGER DEFAULT 0,
  lessons_count INTEGER DEFAULT 0,
  enrolled_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. STUDENTS
CREATE TABLE IF NOT EXISTS students (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  avatar_url TEXT,
  enrolled_courses INTEGER DEFAULT 0,
  completed_courses INTEGER DEFAULT 0,
  progress NUMERIC DEFAULT 0,
  joined_at TIMESTAMPTZ DEFAULT now()
);

-- 3. BATCHES
CREATE TABLE IF NOT EXISTS batches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
  course_title TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  student_count INTEGER DEFAULT 0,
  max_students INTEGER DEFAULT 30,
  status TEXT CHECK (status IN ('upcoming', 'active', 'completed')) DEFAULT 'upcoming'
);

-- 4. QUIZZES
CREATE TABLE IF NOT EXISTS quizzes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
  course_title TEXT,
  questions_count INTEGER DEFAULT 0,
  avg_score NUMERIC DEFAULT 0,
  attempts INTEGER DEFAULT 0,
  passing_score INTEGER DEFAULT 70
);

-- 5. CERTIFICATES
CREATE TABLE IF NOT EXISTS certificates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_name TEXT NOT NULL,
  course_title TEXT NOT NULL,
  issued_at TIMESTAMPTZ DEFAULT now(),
  certificate_id TEXT UNIQUE NOT NULL
);

-- 6. ACTIVITY FEED
CREATE TABLE IF NOT EXISTS activity_feed (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT CHECK (type IN ('enrollment', 'completion', 'quiz', 'certificate', 'batch')) NOT NULL,
  text TEXT NOT NULL,
  time TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- ROW LEVEL SECURITY — enable public read
-- ============================================
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_feed ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read courses" ON courses FOR SELECT USING (true);
CREATE POLICY "Public read students" ON students FOR SELECT USING (true);
CREATE POLICY "Public read batches" ON batches FOR SELECT USING (true);
CREATE POLICY "Public read quizzes" ON quizzes FOR SELECT USING (true);
CREATE POLICY "Public read certificates" ON certificates FOR SELECT USING (true);
CREATE POLICY "Public read activity_feed" ON activity_feed FOR SELECT USING (true);

-- ============================================
-- SEED DATA
-- ============================================

-- Courses
INSERT INTO courses (id, title, description, published, instructor, category, chapters_count, lessons_count, enrolled_count, created_at, updated_at) VALUES
  ('a1b2c3d4-0001-4000-8000-000000000001', 'Introduction to Drone Operations', 'Learn the fundamentals of UAV flight, regulations, and safety protocols for professional drone operations.', true, 'Capt. Ravi Menon', 'Operations', 8, 32, 485, '2025-09-15', '2026-01-20'),
  ('a1b2c3d4-0002-4000-8000-000000000002', 'Advanced Flight Planning & Navigation', 'Master route planning, airspace classification, and NOTAM interpretation for complex missions.', true, 'Dr. Priya Sharma', 'Navigation', 6, 24, 312, '2025-10-01', '2026-02-05'),
  ('a1b2c3d4-0003-4000-8000-000000000003', 'DGCA Remote Pilot Certification', 'Comprehensive preparation for the DGCA Remote Pilot License examination and certification.', true, 'Wg Cdr. Anil Kapoor (Retd)', 'Certification', 12, 48, 728, '2025-08-20', '2026-02-18'),
  ('a1b2c3d4-0004-4000-8000-000000000004', 'Aerial Survey & Mapping', 'Techniques for photogrammetry, LiDAR operations, and GIS data processing from drone surveys.', true, 'Dr. Priya Sharma', 'Technical', 10, 40, 256, '2025-11-10', '2026-01-30'),
  ('a1b2c3d4-0005-4000-8000-000000000005', 'Drone Maintenance & Repair', 'Hands-on training for UAV maintenance, troubleshooting, and field repair procedures.', false, 'Rajesh Kumar', 'Technical', 7, 28, 0, '2026-01-05', '2026-02-20'),
  ('a1b2c3d4-0006-4000-8000-000000000006', 'Emergency Procedures & Risk Management', 'Safety protocols, emergency landing procedures, and operational risk assessment frameworks.', true, 'Capt. Ravi Menon', 'Safety', 5, 20, 189, '2025-12-01', '2026-02-10');

-- Students
INSERT INTO students (name, email, enrolled_courses, completed_courses, progress, joined_at) VALUES
  ('Aarav Patel', 'aarav.p@email.com', 3, 2, 85, '2025-09-20'),
  ('Sneha Reddy', 'sneha.r@email.com', 2, 1, 72, '2025-10-05'),
  ('Vikram Singh', 'vikram.s@email.com', 4, 3, 91, '2025-08-15'),
  ('Ananya Gupta', 'ananya.g@email.com', 1, 0, 34, '2026-01-10'),
  ('Rohit Deshmukh', 'rohit.d@email.com', 2, 2, 100, '2025-09-01'),
  ('Meera Nair', 'meera.n@email.com', 3, 1, 58, '2025-11-20'),
  ('Karthik Iyer', 'karthik.i@email.com', 2, 1, 67, '2025-12-15'),
  ('Divya Joshi', 'divya.j@email.com', 1, 1, 100, '2026-01-22');

-- Batches
INSERT INTO batches (title, course_id, course_title, start_date, end_date, student_count, max_students, status) VALUES
  ('Batch Alpha — Q1 2026', 'a1b2c3d4-0003-4000-8000-000000000003', 'DGCA Remote Pilot Certification', '2026-01-15', '2026-03-15', 28, 30, 'active'),
  ('Batch Bravo — Drone Ops', 'a1b2c3d4-0001-4000-8000-000000000001', 'Introduction to Drone Operations', '2026-02-01', '2026-03-30', 22, 25, 'active'),
  ('Batch Charlie — Navigation', 'a1b2c3d4-0002-4000-8000-000000000002', 'Advanced Flight Planning & Navigation', '2026-03-10', '2026-05-10', 8, 20, 'upcoming'),
  ('Batch Delta — Survey Q4', 'a1b2c3d4-0004-4000-8000-000000000004', 'Aerial Survey & Mapping', '2025-10-01', '2025-12-15', 25, 25, 'completed'),
  ('Batch Echo — Safety', 'a1b2c3d4-0006-4000-8000-000000000006', 'Emergency Procedures & Risk Management', '2026-02-15', '2026-04-15', 18, 20, 'active');

-- Quizzes
INSERT INTO quizzes (title, course_id, course_title, questions_count, avg_score, attempts, passing_score) VALUES
  ('Airspace Classification Quiz', 'a1b2c3d4-0002-4000-8000-000000000002', 'Advanced Flight Planning & Navigation', 20, 76, 245, 70),
  ('DGCA Mock Exam — Module A', 'a1b2c3d4-0003-4000-8000-000000000003', 'DGCA Remote Pilot Certification', 50, 68, 512, 60),
  ('Safety Protocols Assessment', 'a1b2c3d4-0006-4000-8000-000000000006', 'Emergency Procedures & Risk Management', 15, 82, 167, 75),
  ('Pre-Flight Checklist Knowledge', 'a1b2c3d4-0001-4000-8000-000000000001', 'Introduction to Drone Operations', 25, 88, 398, 70),
  ('GIS & Mapping Fundamentals', 'a1b2c3d4-0004-4000-8000-000000000004', 'Aerial Survey & Mapping', 30, 71, 189, 65);

-- Certificates
INSERT INTO certificates (student_name, course_title, issued_at, certificate_id) VALUES
  ('Vikram Singh', 'DGCA Remote Pilot Certification', '2026-02-15', 'AERO-2026-0891'),
  ('Rohit Deshmukh', 'Introduction to Drone Operations', '2026-02-10', 'AERO-2026-0887'),
  ('Aarav Patel', 'Advanced Flight Planning & Navigation', '2026-01-28', 'AERO-2026-0854'),
  ('Divya Joshi', 'Emergency Procedures & Risk Management', '2026-02-20', 'AERO-2026-0903'),
  ('Rohit Deshmukh', 'DGCA Remote Pilot Certification', '2026-01-15', 'AERO-2026-0812'),
  ('Sneha Reddy', 'Introduction to Drone Operations', '2026-02-18', 'AERO-2026-0898');

-- Activity feed
INSERT INTO activity_feed (type, text, time) VALUES
  ('enrollment', 'Ananya Gupta enrolled in DGCA Remote Pilot Certification', '2 hours ago'),
  ('completion', 'Divya Joshi completed Emergency Procedures & Risk Management', '5 hours ago'),
  ('quiz', 'Vikram Singh scored 92% on DGCA Mock Exam — Module A', '8 hours ago'),
  ('certificate', 'Certificate issued to Divya Joshi for Emergency Procedures', '1 day ago'),
  ('batch', 'Batch Charlie — Navigation is now open for enrollment', '1 day ago'),
  ('enrollment', 'Karthik Iyer enrolled in Aerial Survey & Mapping', '2 days ago');

-- ============================================
-- DASHBOARD STATS VIEW (computed)
-- ============================================
CREATE OR REPLACE VIEW dashboard_stats AS
SELECT
  (SELECT COUNT(*) FROM students) AS "totalStudents",
  (SELECT COUNT(*) FROM courses) AS "totalCourses",
  (SELECT COUNT(*) FROM batches WHERE status = 'active') AS "activeBatches",
  (SELECT COUNT(*) FROM certificates) AS "certificatesIssued",
  (SELECT COUNT(*) FROM students WHERE joined_at > now() - INTERVAL '30 days') AS "recentEnrollments",
  COALESCE((SELECT ROUND(AVG(progress)::numeric, 1) FROM students), 0) AS "completionRate";
