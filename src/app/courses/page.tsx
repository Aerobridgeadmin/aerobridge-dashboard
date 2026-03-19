'use client'

import { useState, useEffect, FormEvent } from 'react'
import Header from '@/components/Header'
import Modal, { FormField, FormInput, FormTextarea, FormSelect, FormActions } from '@/components/Modal'
import EmptyState from '@/components/EmptyState'
import Toast from '@/components/Toast'
import { getCourses, createCourse, updateCourse, deleteRecord, logActivity } from '@/lib/data'
import { Course } from '@/lib/supabase'
import { Plus, BookOpen, Users, Layers2, Search, Loader2, Edit2, Trash2, MoreVertical, Eye, EyeOff } from 'lucide-react'
import { RoleVisible } from '@/components/RoleGuard'

const categoryColors: Record<string, string> = {
  Operations: 'badge-blue',
  Navigation: 'badge-green',
  Certification: 'badge-amber',
  Technical: 'bg-violet-50 text-violet-700',
  Safety: 'badge-rose',
  General: 'bg-sky-50 text-sky-light',
}
const categories = ['Operations', 'Navigation', 'Certification', 'Technical', 'Safety', 'General']

const defaultForm = { title: '', description: '', instructor: '', category: 'General', published: false, chapters_count: 0, lessons_count: 0 }

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingCourse, setEditingCourse] = useState<Course | null>(null)
  const [form, setForm] = useState(defaultForm)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [menuOpen, setMenuOpen] = useState<string | null>(null)

  const load = () => { getCourses().then(d => { setCourses(d); setLoading(false) }) }
  useEffect(() => { load() }, [])

  const filtered = courses.filter(c =>
    c.title.toLowerCase().includes(search.toLowerCase()) ||
    c.instructor.toLowerCase().includes(search.toLowerCase()) ||
    c.category.toLowerCase().includes(search.toLowerCase())
  )

  const openCreate = () => { setEditingCourse(null); setForm(defaultForm); setShowModal(true) }
  const openEdit = (c: Course) => {
    setEditingCourse(c)
    setForm({ title: c.title, description: c.description || '', instructor: c.instructor, category: c.category, published: c.published, chapters_count: c.chapters_count, lessons_count: c.lessons_count })
    setShowModal(true)
    setMenuOpen(null)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (editingCourse) {
        await updateCourse(editingCourse.id, form)
        setToast({ message: 'Course updated successfully', type: 'success' })
      } else {
        await createCourse(form)
        await logActivity('enrollment', `New course "${form.title}" was created`)
        setToast({ message: 'Course created successfully', type: 'success' })
      }
      setShowModal(false)
      load()
    } catch (err: any) {
      setToast({ message: err.message || 'Something went wrong', type: 'error' })
    }
    setSaving(false)
  }

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return
    try {
      await deleteRecord('courses', id)
      setToast({ message: 'Course deleted', type: 'success' })
      load()
    } catch (err: any) {
      setToast({ message: err.message || 'Failed to delete', type: 'error' })
    }
    setMenuOpen(null)
  }

  const togglePublish = async (c: Course) => {
    try {
      await updateCourse(c.id, { published: !c.published } as any)
      setToast({ message: c.published ? 'Course unpublished' : 'Course published', type: 'success' })
      load()
    } catch (err: any) {
      setToast({ message: err.message || 'Failed', type: 'error' })
    }
    setMenuOpen(null)
  }

  return (
    <div className="min-h-screen bg-surface-50">
      <Header title="Courses" subtitle="Manage your learning content" />

      <div className="p-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
            <input type="text" placeholder="Search courses..." value={search} onChange={e => setSearch(e.target.value)} className="h-10 w-72 rounded-lg border border-surface-200 bg-white pl-9 pr-4 text-sm outline-none transition-all placeholder:text-surface-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-50" />
          </div>
          <RoleVisible roles={['admin', 'instructor']}>
            <button onClick={openCreate} className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-brand-600 hover:shadow-md active:scale-[0.98]">
              <Plus className="h-4 w-4" /> New Course
            </button>
          </RoleVisible>
        </div>

        {loading ? (
          <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-brand-500" /></div>
        ) : filtered.length === 0 && !search ? (
          <EmptyState icon={BookOpen} title="No courses yet" description="Create your first course to start building your curriculum." actionLabel="Create Course" onAction={openCreate} />
        ) : filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-surface-500">No courses match "{search}"</p>
        ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((course, i) => (
            <div key={course.id} className="card group animate-slide-up overflow-hidden" style={{ animationDelay: `${i * 60}ms`, animationFillMode: 'both' }}>
              <div className="relative h-36 bg-gradient-to-br from-brand-500 via-brand-600 to-brand-700 p-5">
                <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2220%22%20height%3D%2220%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Ccircle%20cx%3D%221%22%20cy%3D%221%22%20r%3D%221%22%20fill%3D%22rgba(255%2C255%2C255%2C0.08)%22%2F%3E%3C%2Fsvg%3E')]"></div>
                <div className="relative z-10">
                  <span className={`badge ${categoryColors[course.category] || 'badge-blue'} !bg-white/20 !text-white backdrop-blur-sm`}>{course.category}</span>
                  <h3 className="mt-3 text-xl font-bold leading-tight text-white">{course.title}</h3>
                </div>
                {!course.published && (
                  <div className="absolute right-3 top-3 rounded-full bg-surface-900/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white backdrop-blur-sm">Draft</div>
                )}
                {/* Action menu */}
                <RoleVisible roles={['admin', 'instructor']}>
                <div className="absolute right-3 bottom-3 z-20">
                  <button onClick={() => setMenuOpen(menuOpen === course.id ? null : course.id)} className="rounded-lg bg-white/15 p-1.5 text-white/70 backdrop-blur-sm transition-all hover:bg-white/25 hover:text-white">
                    <MoreVertical className="h-4 w-4" />
                  </button>
                  {menuOpen === course.id && (
                    <div className="absolute right-0 top-9 w-40 rounded-lg border border-surface-200 bg-white py-1 shadow-elevated">
                      <button onClick={() => openEdit(course)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-surface-700 hover:bg-surface-50">
                        <Edit2 className="h-3.5 w-3.5" /> Edit Course
                      </button>
                      <button onClick={() => togglePublish(course)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-surface-700 hover:bg-surface-50">
                        {course.published ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        {course.published ? 'Unpublish' : 'Publish'}
                      </button>
                      <button onClick={() => handleDelete(course.id, course.title)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-cta-500 hover:bg-red-50">
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    </div>
                  )}
                </div>
                </RoleVisible>
              </div>
              <div className="p-5">
                <p className="line-clamp-2 text-xs leading-relaxed text-surface-500">{course.description}</p>
                <div className="mt-4 flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-100 text-[10px] font-semibold text-surface-600">
                    {course.instructor.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                  <span className="text-xs font-medium text-surface-600">{course.instructor}</span>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-surface-100 pt-4">
                  <div className="flex items-center gap-4 text-xs text-surface-500">
                    <span className="flex items-center gap-1"><Layers2 className="h-3.5 w-3.5" />{course.chapters_count} chapters</span>
                    <span className="flex items-center gap-1"><BookOpen className="h-3.5 w-3.5" />{course.lessons_count} lessons</span>
                  </div>
                  <span className="flex items-center gap-1 text-xs font-semibold text-surface-700">
                    <Users className="h-3.5 w-3.5 text-brand-500" />{course.enrolled_count}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editingCourse ? 'Edit Course' : 'Create New Course'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Course Title" required>
            <FormInput required placeholder="e.g. Drone Operations Fundamentals" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
          </FormField>
          <FormField label="Description">
            <FormTextarea rows={3} placeholder="Brief description of the course..." value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Instructor" required>
              <FormInput required placeholder="Instructor name" value={form.instructor} onChange={e => setForm({ ...form, instructor: e.target.value })} />
            </FormField>
            <FormField label="Category" required>
              <FormSelect value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </FormSelect>
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Chapters">
              <FormInput type="number" min={0} value={form.chapters_count} onChange={e => setForm({ ...form, chapters_count: Number(e.target.value) })} />
            </FormField>
            <FormField label="Lessons">
              <FormInput type="number" min={0} value={form.lessons_count} onChange={e => setForm({ ...form, lessons_count: Number(e.target.value) })} />
            </FormField>
          </div>
          <label className="flex items-center gap-2.5 pt-1">
            <input type="checkbox" checked={form.published} onChange={e => setForm({ ...form, published: e.target.checked })} className="h-4 w-4 rounded border-surface-300 text-brand-500 focus:ring-brand-500" />
            <span className="text-sm font-medium text-surface-700">Publish immediately</span>
          </label>
          <FormActions onCancel={() => setShowModal(false)} loading={saving} submitLabel={editingCourse ? 'Update Course' : 'Create Course'} />
        </form>
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
