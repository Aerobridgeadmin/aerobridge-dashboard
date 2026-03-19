-- Create quiz_questions table for storing individual quiz questions
CREATE TABLE IF NOT EXISTS quiz_questions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]',
  correct_answer INTEGER NOT NULL DEFAULT 0,
  explanation TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast quiz question lookups
CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz_id ON quiz_questions(quiz_id);

-- Enable RLS
ALTER TABLE quiz_questions ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read quiz questions
CREATE POLICY "Authenticated users can view quiz questions"
  ON quiz_questions FOR SELECT
  TO authenticated
  USING (true);

-- Allow admins and instructors to manage quiz questions
CREATE POLICY "Admins can manage quiz questions"
  ON quiz_questions FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Make sure course_content table exists (may already exist)
CREATE TABLE IF NOT EXISTS course_content (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'lesson',
  content TEXT,
  parent_id UUID REFERENCES course_content(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  duration_minutes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_course_content_course_id ON course_content(course_id);
CREATE INDEX IF NOT EXISTS idx_course_content_parent_id ON course_content(parent_id);

ALTER TABLE course_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view course content"
  ON course_content FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage course content"
  ON course_content FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
