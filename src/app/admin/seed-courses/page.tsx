'use client'

import { useState } from 'react'
import Header from '@/components/Header'
import Toast from '@/components/Toast'
import { supabase } from '@/lib/supabase'
import { AES_COURSES, SeedCourse } from '@/lib/aes-seed-data'
import { Loader2, Rocket, CheckCircle2, AlertCircle, Database, BookOpen, HelpCircle, Layers2, Trash2 } from 'lucide-react'

interface SeedLog { message: string; type: 'info' | 'success' | 'error' }

export default function SeedCoursesPage() {
  const [seeding, setSeeding] = useState(false)
  const [logs, setLogs] = useState<SeedLog[]>([])
  const [progress, setProgress] = useState(0)
  const [total, setTotal] = useState(0)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [done, setDone] = useState(false)

  const log = (message: string, type: SeedLog['type'] = 'info') => {
    setLogs(prev => [...prev, { message, type }])
  }

  const seedCourses = async () => {
    setSeeding(true)
    setLogs([])
    setDone(false)
    const coursesToSeed = AES_COURSES
    setTotal(coursesToSeed.length)

    log(`Starting seed of ${coursesToSeed.length} AES courses...`)

    let successCount = 0
    let errorCount = 0

    for (let i = 0; i < coursesToSeed.length; i++) {
      const course = coursesToSeed[i]
      setProgress(i + 1)

      try {
        const chaptersCount = course.chapters.length
        const lessonsCount = course.chapters.reduce((sum, ch) => sum + ch.lessons.length, 0)

        const { data: courseData, error: courseError } = await supabase.from('courses').insert({
          title: `${course.code} - ${course.title}`,
          description: course.description,
          instructor: course.instructor,
          category: course.category,
          published: true,
          chapters_count: chaptersCount,
          lessons_count: lessonsCount,
          enrolled_count: Math.floor(Math.random() * 40) + 5,
        }).select().single()

        if (courseError) {
          log(`Failed to create course ${course.code}: ${courseError.message}`, 'error')
          errorCount++
          continue
        }

        const courseId = courseData.id
        let sortOrder = 0

        for (const chapter of course.chapters) {
          const { data: chapterData, error: chError } = await supabase.from('course_content').insert({
            course_id: courseId,
            title: chapter.title,
            type: 'chapter',
            sort_order: sortOrder++,
            duration_minutes: 0,
          }).select().single()

          if (chError) {
            log(`  Warning: Failed to create chapter "${chapter.title}": ${chError.message}`, 'error')
            continue
          }

          for (const lesson of chapter.lessons) {
            const { error: lError } = await supabase.from('course_content').insert({
              course_id: courseId,
              title: lesson.title,
              type: 'lesson',
              content: lesson.content,
              parent_id: chapterData?.id,
              sort_order: sortOrder++,
              duration_minutes: lesson.duration,
            })
            if (lError) {
              log(`  Warning: Failed to create lesson "${lesson.title}": ${lError.message}`, 'error')
            }
          }
        }

        const questionsCount = course.quiz.questions.length
        const { data: quizData, error: quizError } = await supabase.from('quizzes').insert({
          title: course.quiz.title,
          course_id: courseId,
          course_title: `${course.code} - ${course.title}`,
          questions_count: questionsCount,
          passing_score: course.quiz.passing_score,
          avg_score: 0,
          attempts: 0,
        }).select().single()

        if (quizError) {
          log(`  Warning: Failed to create quiz for ${course.code}: ${quizError.message}`, 'error')
        } else if (quizData) {
          for (let qi = 0; qi < course.quiz.questions.length; qi++) {
            const question = course.quiz.questions[qi]
            const { error: qqError } = await supabase.from('quiz_questions').insert({
              quiz_id: quizData.id,
              question_text: question.question,
              options: question.options,
              correct_answer: question.correct,
              explanation: question.explanation,
              sort_order: qi,
            })
            if (qqError) {
              log(`  Warning: Failed to create question: ${qqError.message}`, 'error')
            }
          }
        }

        log(`Created ${course.code} - ${course.title} (${chaptersCount} chapters, ${lessonsCount} lessons, ${questionsCount} quiz questions)`, 'success')
        successCount++
      } catch (err: any) {
        log(`Error seeding ${course.code}: ${err.message}`, 'error')
        errorCount++
      }
    }

    log(`\nSeed complete: ${successCount} courses created, ${errorCount} errors.`, successCount > 0 ? 'success' : 'error')
    setDone(true)
    setSeeding(false)
    setToast({ message: `Seeded ${successCount} courses successfully`, type: successCount > 0 ? 'success' : 'error' })
  }

  const clearAllData = async () => {
    if (!confirm('This will DELETE all courses, quizzes, quiz questions, and course content. Are you sure?')) return
    if (!confirm('This is irreversible. Type-confirm by clicking OK again.')) return

    setSeeding(true)
    setLogs([])
    log('Clearing all course-related data...')

    try {
      await supabase.from('quiz_questions').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      log('Cleared quiz_questions', 'success')
    } catch { log('quiz_questions table may not exist yet', 'info') }

    try {
      await supabase.from('course_content').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      log('Cleared course_content', 'success')
    } catch { log('course_content clear issue', 'error') }

    try {
      await supabase.from('quizzes').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      log('Cleared quizzes', 'success')
    } catch { log('quizzes clear issue', 'error') }

    try {
      await supabase.from('courses').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      log('Cleared courses', 'success')
    } catch { log('courses clear issue', 'error') }

    log('All data cleared.', 'success')
    setSeeding(false)
    setToast({ message: 'All course data cleared', type: 'success' })
  }

  return (
    <div className="min-h-screen bg-surface-50">
      <Header title="Seed AES Courses" subtitle="Populate the database with MSU Denver Aviation & Aerospace Science catalog" />

      <div className="p-8">
        {/* Stats Overview */}
        <div className="mb-8 grid grid-cols-1 gap-5 md:grid-cols-4">
          <div className="card p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50">
                <BookOpen className="h-5 w-5 text-brand-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-surface-900">{AES_COURSES.length}</p>
                <p className="text-xs text-surface-500">Total Courses</p>
              </div>
            </div>
          </div>
          <div className="card p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50">
                <Layers2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-surface-900">
                  {AES_COURSES.reduce((sum, c) => sum + c.chapters.length, 0)}
                </p>
                <p className="text-xs text-surface-500">Total Chapters</p>
              </div>
            </div>
          </div>
          <div className="card p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-50">
                <Database className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-surface-900">
                  {AES_COURSES.reduce((sum, c) => sum + c.chapters.reduce((s, ch) => s + ch.lessons.length, 0), 0)}
                </p>
                <p className="text-xs text-surface-500">Total Lessons</p>
              </div>
            </div>
          </div>
          <div className="card p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50">
                <HelpCircle className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-surface-900">
                  {AES_COURSES.reduce((sum, c) => sum + c.quiz.questions.length, 0)}
                </p>
                <p className="text-xs text-surface-500">Quiz Questions</p>
              </div>
            </div>
          </div>
        </div>

        {/* Course Preview */}
        <div className="mb-8">
          <h2 className="mb-4 text-lg font-semibold text-surface-900">Course Catalog Preview</h2>
          <div className="card max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface-50">
                <tr className="border-b border-surface-200">
                  <th className="px-4 py-3 text-left font-medium text-surface-600">Code</th>
                  <th className="px-4 py-3 text-left font-medium text-surface-600">Title</th>
                  <th className="px-4 py-3 text-left font-medium text-surface-600">Category</th>
                  <th className="px-4 py-3 text-center font-medium text-surface-600">Credits</th>
                  <th className="px-4 py-3 text-center font-medium text-surface-600">Chapters</th>
                  <th className="px-4 py-3 text-center font-medium text-surface-600">Lessons</th>
                  <th className="px-4 py-3 text-center font-medium text-surface-600">Questions</th>
                </tr>
              </thead>
              <tbody>
                {AES_COURSES.map(course => (
                  <tr key={course.code} className="border-b border-surface-100 hover:bg-surface-50/50">
                    <td className="px-4 py-2.5 font-mono text-xs font-medium text-brand-600">{course.code}</td>
                    <td className="px-4 py-2.5 text-surface-800">{course.title}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        course.category === 'Technical' ? 'bg-violet-50 text-violet-700' :
                        course.category === 'Operations' ? 'bg-blue-50 text-blue-700' :
                        course.category === 'Navigation' ? 'bg-green-50 text-green-700' :
                        course.category === 'Certification' ? 'bg-amber-50 text-amber-700' :
                        course.category === 'Safety' ? 'bg-rose-50 text-rose-700' :
                        'bg-sky-50 text-sky-700'
                      }`}>{course.category}</span>
                    </td>
                    <td className="px-4 py-2.5 text-center text-surface-600">{course.credits}</td>
                    <td className="px-4 py-2.5 text-center text-surface-600">{course.chapters.length}</td>
                    <td className="px-4 py-2.5 text-center text-surface-600">
                      {course.chapters.reduce((s, ch) => s + ch.lessons.length, 0)}
                    </td>
                    <td className="px-4 py-2.5 text-center text-surface-600">{course.quiz.questions.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Actions */}
        <div className="mb-8 flex gap-4">
          <button
            onClick={seedCourses}
            disabled={seeding}
            className="flex items-center gap-2 rounded-lg bg-brand-500 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-brand-600 hover:shadow-md active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
            {seeding ? 'Seeding...' : 'Seed All Courses'}
          </button>
          <button
            onClick={clearAllData}
            disabled={seeding}
            className="flex items-center gap-2 rounded-lg border border-red-200 bg-white px-6 py-3 text-sm font-semibold text-red-600 transition-all hover:bg-red-50 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 className="h-4 w-4" />
            Clear All Course Data
          </button>
        </div>

        {/* Progress */}
        {(seeding || done) && total > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between text-sm">
              <span className="text-surface-600">Progress</span>
              <span className="font-medium text-surface-900">{progress} / {total}</span>
            </div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-surface-100">
              <div
                className="h-full rounded-full bg-brand-500 transition-all duration-500"
                style={{ width: `${(progress / total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Log Output */}
        {logs.length > 0 && (
          <div className="card overflow-hidden">
            <div className="border-b border-surface-200 bg-surface-800 px-4 py-2.5">
              <h3 className="text-sm font-medium text-white">Seed Log</h3>
            </div>
            <div className="max-h-96 overflow-y-auto bg-surface-900 p-4 font-mono text-xs leading-relaxed">
              {logs.map((entry, i) => (
                <div key={i} className="flex items-start gap-2 py-0.5">
                  {entry.type === 'success' && <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-green-400" />}
                  {entry.type === 'error' && <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-red-400" />}
                  {entry.type === 'info' && <span className="mt-0.5 h-3 w-3 shrink-0 text-blue-400">›</span>}
                  <span className={
                    entry.type === 'success' ? 'text-green-300' :
                    entry.type === 'error' ? 'text-red-300' : 'text-surface-300'
                  }>{entry.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
