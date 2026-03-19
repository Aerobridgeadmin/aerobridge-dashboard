'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Header from '@/components/Header'
import Toast from '@/components/Toast'
import { supabase } from '@/lib/supabase'
import { Course, CourseContent, Quiz } from '@/lib/supabase'
import {
  ArrowLeft, BookOpen, Layers2, Clock, Users, ChevronDown, ChevronRight,
  FileText, Video, HelpCircle, Loader2, GraduationCap, PlayCircle, CheckCircle2,
} from 'lucide-react'
import Link from 'next/link'

export default function CourseDetailPage() {
  const params = useParams()
  const router = useRouter()
  const courseId = params.id as string

  const [course, setCourse] = useState<Course | null>(null)
  const [content, setContent] = useState<CourseContent[]>([])
  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [activeLesson, setActiveLesson] = useState<CourseContent | null>(null)

  useEffect(() => {
    async function load() {
      const [courseRes, contentRes, quizzesRes] = await Promise.all([
        supabase.from('courses').select('*').eq('id', courseId).single(),
        supabase.from('course_content').select('*').eq('course_id', courseId).order('sort_order'),
        supabase.from('quizzes').select('*').eq('course_id', courseId),
      ])
      if (courseRes.data) setCourse(courseRes.data)
      if (contentRes.data) {
        setContent(contentRes.data)
        const chapters = contentRes.data.filter(c => c.type === 'chapter')
        if (chapters.length > 0) setExpandedChapters(new Set([chapters[0].id]))
      }
      if (quizzesRes.data) setQuizzes(quizzesRes.data)
      setLoading(false)
    }
    load()
  }, [courseId])

  const chapters = content.filter(c => c.type === 'chapter')
  const getChapterLessons = (chapterId: string) => content.filter(c => c.parent_id === chapterId)
  const toggleChapter = (id: string) => {
    setExpandedChapters(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const totalDuration = content
    .filter(c => c.type === 'lesson')
    .reduce((sum, c) => sum + (c.duration_minutes || 0), 0)

  const typeIcon = (type: string) => {
    switch (type) {
      case 'video': return <Video className="h-4 w-4 text-brand-500" />
      case 'quiz': return <HelpCircle className="h-4 w-4 text-amber-500" />
      case 'document': return <FileText className="h-4 w-4 text-violet-500" />
      default: return <BookOpen className="h-4 w-4 text-green-500" />
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-50">
        <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
      </div>
    )
  }

  if (!course) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-surface-50">
        <p className="text-surface-500">Course not found</p>
        <button onClick={() => router.push('/courses')} className="mt-4 text-sm text-brand-500 hover:underline">Back to Courses</button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface-50">
      <Header title={course.title} subtitle={course.description?.slice(0, 100) + '...'} />

      <div className="p-8">
        {/* Back button */}
        <button onClick={() => router.push('/courses')} className="mb-6 flex items-center gap-1.5 text-sm text-surface-500 transition-colors hover:text-brand-500">
          <ArrowLeft className="h-4 w-4" /> Back to Courses
        </button>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Main Content - Left Side */}
          <div className="lg:col-span-2 space-y-6">
            {/* Course Hero */}
            <div className="card overflow-hidden">
              <div className="relative bg-gradient-to-br from-brand-500 via-brand-600 to-brand-700 p-8">
                <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2220%22%20height%3D%2220%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Ccircle%20cx%3D%221%22%20cy%3D%221%22%20r%3D%221%22%20fill%3D%22rgba(255%2C255%2C255%2C0.08)%22%2F%3E%3C%2Fsvg%3E')]"></div>
                <div className="relative z-10">
                  <span className="inline-block rounded-full bg-white/20 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
                    {course.category}
                  </span>
                  <h1 className="mt-4 text-2xl font-bold text-white">{course.title}</h1>
                  <p className="mt-2 text-sm text-white/80">{course.description}</p>
                  <div className="mt-6 flex flex-wrap items-center gap-6">
                    <div className="flex items-center gap-2 text-white/90">
                      <GraduationCap className="h-4 w-4" />
                      <span className="text-sm">{course.instructor}</span>
                    </div>
                    <div className="flex items-center gap-2 text-white/90">
                      <Layers2 className="h-4 w-4" />
                      <span className="text-sm">{chapters.length} chapters</span>
                    </div>
                    <div className="flex items-center gap-2 text-white/90">
                      <BookOpen className="h-4 w-4" />
                      <span className="text-sm">{content.filter(c => c.type === 'lesson').length} lessons</span>
                    </div>
                    <div className="flex items-center gap-2 text-white/90">
                      <Clock className="h-4 w-4" />
                      <span className="text-sm">{Math.round(totalDuration / 60)}h {totalDuration % 60}m</span>
                    </div>
                    <div className="flex items-center gap-2 text-white/90">
                      <Users className="h-4 w-4" />
                      <span className="text-sm">{course.enrolled_count} enrolled</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Active Lesson Content */}
            {activeLesson && (
              <div className="card animate-slide-up p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs font-medium uppercase tracking-wider text-brand-500">Currently Viewing</span>
                    <h2 className="mt-1 text-lg font-semibold text-surface-900">{activeLesson.title}</h2>
                  </div>
                  <button
                    onClick={() => setActiveLesson(null)}
                    className="rounded-lg border border-surface-200 px-3 py-1.5 text-xs text-surface-500 transition-colors hover:bg-surface-50"
                  >
                    Close
                  </button>
                </div>
                <div className="mt-4 rounded-lg bg-surface-50 p-6">
                  <p className="leading-relaxed text-surface-700">{activeLesson.content}</p>
                  {activeLesson.duration_minutes > 0 && (
                    <div className="mt-4 flex items-center gap-2 text-xs text-surface-400">
                      <Clock className="h-3.5 w-3.5" />
                      <span>Estimated: {activeLesson.duration_minutes} minutes</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Course Content Accordion */}
            <div className="card overflow-hidden">
              <div className="border-b border-surface-200 px-6 py-4">
                <h2 className="text-base font-semibold text-surface-900">Course Content</h2>
              </div>
              {chapters.length === 0 ? (
                <div className="p-8 text-center text-sm text-surface-500">No content available for this course yet.</div>
              ) : (
                <div className="divide-y divide-surface-100">
                  {chapters.map((chapter, ci) => {
                    const lessons = getChapterLessons(chapter.id)
                    const isExpanded = expandedChapters.has(chapter.id)
                    const chapterDuration = lessons.reduce((sum, l) => sum + (l.duration_minutes || 0), 0)

                    return (
                      <div key={chapter.id}>
                        <button
                          onClick={() => toggleChapter(chapter.id)}
                          className="flex w-full items-center justify-between px-6 py-4 text-left transition-colors hover:bg-surface-50"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-600">
                              {ci + 1}
                            </div>
                            <div>
                              <h3 className="text-sm font-semibold text-surface-900">{chapter.title}</h3>
                              <p className="text-xs text-surface-400">{lessons.length} lessons · {chapterDuration} min</p>
                            </div>
                          </div>
                          {isExpanded ? <ChevronDown className="h-4 w-4 text-surface-400" /> : <ChevronRight className="h-4 w-4 text-surface-400" />}
                        </button>
                        {isExpanded && (
                          <div className="border-t border-surface-100 bg-surface-50/50">
                            {lessons.map((lesson, li) => (
                              <button
                                key={lesson.id}
                                onClick={() => setActiveLesson(lesson)}
                                className={`flex w-full items-center gap-3 px-6 py-3 text-left transition-colors hover:bg-surface-100 ${
                                  activeLesson?.id === lesson.id ? 'bg-brand-50 border-l-2 border-brand-500' : ''
                                }`}
                              >
                                <div className="flex h-6 w-6 items-center justify-center">
                                  {activeLesson?.id === lesson.id ? (
                                    <PlayCircle className="h-4 w-4 text-brand-500" />
                                  ) : (
                                    typeIcon(lesson.type)
                                  )}
                                </div>
                                <div className="flex-1">
                                  <p className="text-sm text-surface-700">{lesson.title}</p>
                                </div>
                                {lesson.duration_minutes > 0 && (
                                  <span className="text-[10px] text-surface-400">{lesson.duration_minutes} min</span>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar - Right Side */}
          <div className="space-y-6">
            {/* Quizzes */}
            <div className="card overflow-hidden">
              <div className="border-b border-surface-200 px-5 py-3.5">
                <h3 className="text-sm font-semibold text-surface-900">Assessments</h3>
              </div>
              {quizzes.length === 0 ? (
                <div className="p-5 text-center text-xs text-surface-400">No assessments available.</div>
              ) : (
                <div className="divide-y divide-surface-100">
                  {quizzes.map(quiz => (
                    <Link
                      key={quiz.id}
                      href={`/quizzes/${quiz.id}`}
                      className="flex items-center gap-3 px-5 py-4 transition-colors hover:bg-surface-50"
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50">
                        <HelpCircle className="h-4 w-4 text-amber-600" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-surface-800">{quiz.title}</p>
                        <p className="text-xs text-surface-400">
                          {quiz.questions_count} questions · Pass: {quiz.passing_score}%
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-surface-300" />
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Course Info */}
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-surface-900">Course Details</h3>
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-surface-500">Instructor</span>
                  <span className="font-medium text-surface-800">{course.instructor}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-surface-500">Category</span>
                  <span className="font-medium text-surface-800">{course.category}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-surface-500">Chapters</span>
                  <span className="font-medium text-surface-800">{chapters.length}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-surface-500">Lessons</span>
                  <span className="font-medium text-surface-800">{content.filter(c => c.type === 'lesson').length}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-surface-500">Duration</span>
                  <span className="font-medium text-surface-800">{Math.round(totalDuration / 60)}h {totalDuration % 60}m</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-surface-500">Enrolled</span>
                  <span className="font-medium text-surface-800">{course.enrolled_count} students</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-surface-500">Status</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${course.published ? 'bg-green-50 text-green-700' : 'bg-surface-100 text-surface-600'}`}>
                    {course.published ? 'Published' : 'Draft'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
