'use client'
import { useState, useEffect, FormEvent } from 'react'
import Header from '@/components/Header'
import Modal, { FormField, FormInput, FormSelect, FormActions } from '@/components/Modal'
import EmptyState from '@/components/EmptyState'
import Toast from '@/components/Toast'
import { getQuizzes, getCourses, createQuiz, deleteRecord } from '@/lib/data'
import { Quiz, Course } from '@/lib/supabase'
import { Plus, Search, HelpCircle, Users, Loader2, ClipboardCheck, Trash2, PlayCircle } from 'lucide-react'
import Link from 'next/link'
import { RoleVisible } from '@/components/RoleGuard'

export default function QuizzesPage() {
  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ title: '', course_id: '', course_title: '', questions_count: 10, passing_score: 70 })
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const load = () => { Promise.all([getQuizzes(), getCourses()]).then(([q, c]) => { setQuizzes(q); setCourses(c); setLoading(false) }) }
  useEffect(() => { load() }, [])
  const filtered = quizzes.filter(q => q.title.toLowerCase().includes(search.toLowerCase()) || q.course_title?.toLowerCase().includes(search.toLowerCase()))

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault(); setSaving(true)
    try {
      const course = courses.find(c => c.id === form.course_id)
      await createQuiz({ ...form, course_title: course?.title || '' })
      setToast({ message: 'Quiz created', type: 'success' }); setShowModal(false); load()
    } catch (err: any) { setToast({ message: err.message, type: 'error' }) }
    setSaving(false)
  }

  return (
    <div className="min-h-screen bg-surface-50">
      <Header title="Quizzes" subtitle="Evaluate learner knowledge and track performance" />
      <div className="p-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" /><input type="text" placeholder="Search quizzes..." value={search} onChange={e => setSearch(e.target.value)} className="h-10 w-72 rounded-lg border border-surface-200 bg-white pl-9 pr-4 text-sm outline-none transition-all placeholder:text-surface-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-50" /></div>
          <RoleVisible roles={["admin", "instructor"]}><button onClick={() => { setForm({ title: '', course_id: '', course_title: '', questions_count: 10, passing_score: 70 }); setShowModal(true) }} className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-brand-600 hover:shadow-md active:scale-[0.98]"><Plus className="h-4 w-4" /> Create Quiz</button></RoleVisible>
        </div>
        {loading ? <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-brand-500" /></div>
        : filtered.length === 0 && !search ? <EmptyState icon={ClipboardCheck} title="No quizzes yet" description="Create quizzes to assess student knowledge." actionLabel="Create Quiz" onAction={() => setShowModal(true)} />
        : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((quiz, i) => (
            <div key={quiz.id} className="card group animate-slide-up p-6" style={{ animationDelay: `${i * 60}ms`, animationFillMode: 'both' }}>
              <div className="flex items-start justify-between">
                <div><h3 className="text-base font-semibold text-surface-900">{quiz.title}</h3><p className="mt-1 text-xs text-surface-500">{quiz.course_title}</p></div>
                <button onClick={() => { if (confirm(`Delete quiz "${quiz.title}"?`)) deleteRecord('quizzes', quiz.id).then(load) }} className="rounded-lg p-2 text-surface-400 opacity-0 transition-all hover:bg-red-50 hover:text-cta-500 group-hover:opacity-100"><Trash2 className="h-4 w-4" /></button>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-4">
                <div className="rounded-lg bg-surface-50 p-3"><div className="flex items-center gap-1.5 text-surface-400"><HelpCircle className="h-3.5 w-3.5" /><span className="text-[10px] uppercase tracking-wider">Questions</span></div><p className="mt-1 text-xl font-bold text-surface-900">{quiz.questions_count}</p></div>
                <div className="rounded-lg bg-surface-50 p-3"><div className="flex items-center gap-1.5 text-surface-400"><Users className="h-3.5 w-3.5" /><span className="text-[10px] uppercase tracking-wider">Attempts</span></div><p className="mt-1 text-xl font-bold text-surface-900">{quiz.attempts}</p></div>
              </div>
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs"><span className="text-surface-500">Avg Score</span><span className={`font-semibold ${quiz.avg_score >= quiz.passing_score ? 'text-success-500' : 'text-cta-500'}`}>{quiz.avg_score}%</span></div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-100"><div className="relative h-full overflow-hidden rounded-full"><div className={`h-full rounded-full transition-all duration-700 ${quiz.avg_score >= quiz.passing_score ? 'bg-success-500' : 'bg-cta-500'}`} style={{ width: `${quiz.avg_score}%` }}></div><div className="absolute top-0 h-full w-0.5 bg-surface-900/30" style={{ left: `${quiz.passing_score}%` }}></div></div></div>
                <p className="mt-1 text-[10px] text-surface-400">Passing score: {quiz.passing_score}%</p>
              </div>
              <Link href={`/quizzes/${quiz.id}`} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-50 py-2.5 text-xs font-semibold text-brand-600 transition-all hover:bg-brand-100">
                <PlayCircle className="h-3.5 w-3.5" /> Take Quiz
              </Link>
            </div>
          ))}
        </div>
        )}
      </div>
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Create Quiz">
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Quiz Title" required><FormInput required placeholder="e.g. Module 1 Assessment" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></FormField>
          <FormField label="Course"><FormSelect value={form.course_id} onChange={e => { const c = courses.find(x => x.id === e.target.value); setForm({ ...form, course_id: e.target.value, course_title: c?.title || '' }) }}><option value="">Select course...</option>{courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</FormSelect></FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Number of Questions"><FormInput type="number" min={1} value={form.questions_count} onChange={e => setForm({ ...form, questions_count: Number(e.target.value) })} /></FormField>
            <FormField label="Passing Score (%)"><FormInput type="number" min={0} max={100} value={form.passing_score} onChange={e => setForm({ ...form, passing_score: Number(e.target.value) })} /></FormField>
          </div>
          <FormActions onCancel={() => setShowModal(false)} loading={saving} submitLabel="Create Quiz" />
        </form>
      </Modal>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
