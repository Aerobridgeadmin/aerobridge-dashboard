'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import Toast from '@/components/Toast'
import { getExamCategories, getExamProgress } from '@/lib/data'
import { ExamCategory, ExamTopic, ExamProgress } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import {
  Search,
  BookOpen,
  Plane,
  Globe,
  Shield,
  Clock,
  Target,
  ArrowRight,
  Loader2,
  GraduationCap,
  CheckCircle2,
  Filter,
  Gauge,
  Briefcase,
  Building2,
  Radio,
  Languages,
  Scale,
  CloudSun,
  Brain,
  Compass,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

type AuthorityFilter = 'all' | 'FAA' | 'ICAO'

type ExamProgressRow = ExamProgress & { user_id: string }

const examIcons: Record<string, LucideIcon> = {
  BookOpen,
  Plane,
  Globe,
  Shield,
  Clock,
  Target,
  Gauge,
  Briefcase,
  Building2,
  Radio,
  Languages,
  Scale,
  CloudSun,
  Brain,
  Compass,
}

const accentBarMap: Record<string, string> = {
  blue: 'bg-blue-500',
  indigo: 'bg-indigo-500',
  emerald: 'bg-emerald-500',
  violet: 'bg-violet-500',
  amber: 'bg-amber-500',
  sky: 'bg-sky-500',
  slate: 'bg-slate-500',
  cyan: 'bg-cyan-500',
  rose: 'bg-rose-500',
  teal: 'bg-teal-500',
}

function normalizeTopics(topics: ExamCategory['topics']): ExamTopic[] {
  if (!topics) return []
  if (Array.isArray(topics)) return topics as ExamTopic[]
  if (typeof topics === 'string') {
    try {
      const parsed = JSON.parse(topics)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

function difficultyBadgeClass(d: ExamCategory['difficulty']): string {
  switch (d) {
    case 'beginner':
      return 'badge badge-green'
    case 'intermediate':
      return 'badge badge-blue'
    case 'advanced':
      return 'badge badge-amber'
    case 'expert':
      return 'badge badge-rose'
    default:
      return 'badge badge-blue'
  }
}

function authorityBadgeClass(authority: ExamCategory['authority']): string {
  if (authority === 'FAA') return 'badge badge-blue'
  if (authority === 'ICAO') return 'badge badge-green'
  return 'badge badge-amber'
}

function CategoryIcon({ name }: { name: string }) {
  const Icon = examIcons[name] ?? BookOpen
  return <Icon className="h-5 w-5 text-brand-500" aria-hidden />
}

function ExamCategoryCard({
  category,
  progress,
  expanded,
  onToggleTopics,
  staggerIndex,
}: {
  category: ExamCategory
  progress: ExamProgressRow | undefined
  expanded: boolean
  onToggleTopics: () => void
  staggerIndex: number
}) {
  const topics = normalizeTopics(category.topics)
  const accent = accentBarMap[category.color] ?? 'bg-brand-500'
  const p = progress

  return (
    <div
      className="card group animate-slide-up overflow-hidden"
      style={{ animationDelay: `${staggerIndex * 60}ms`, animationFillMode: 'both' }}
    >
      <div className={`h-1.5 w-full ${accent}`} aria-hidden />
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-500/10">
              <CategoryIcon name={category.icon} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold text-surface-900">{category.name}</h3>
                <span className={authorityBadgeClass(category.authority)}>{category.authority}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-surface-500">{category.description}</p>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium text-surface-500">
          <span className="inline-flex items-center gap-1">
            <BookOpen className="h-3.5 w-3.5 text-surface-400" />
            {category.question_count} questions
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5 text-surface-400" />
            {category.time_limit_minutes} min
          </span>
          <span className="inline-flex items-center gap-1">
            <Target className="h-3.5 w-3.5 text-surface-400" />
            {category.passing_score}% pass
          </span>
        </div>

        <div className="mt-3">
          <span className={difficultyBadgeClass(category.difficulty)}>{category.difficulty}</span>
        </div>

        {topics.length > 0 && (
          <div className="mt-4 border-t border-surface-100 pt-3">
            <button
              type="button"
              onClick={onToggleTopics}
              className="flex w-full items-center justify-between text-left text-sm font-medium text-brand-600 transition-colors hover:text-brand-700"
            >
              <span>
                Topics ({topics.length}){expanded ? '' : ' — tap to expand'}
              </span>
              <span className="text-surface-400">{expanded ? '−' : '+'}</span>
            </button>
            {expanded && (
              <ul className="mt-2 space-y-1.5 text-sm text-surface-600">
                {topics.map(t => (
                  <li key={t.id} className="flex gap-2 border-l-2 border-brand-200 pl-2">
                    <span className="font-mono text-xs text-surface-400">{t.code}</span>
                    <span>{t.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {p && (
          <div className="mt-4 rounded-lg bg-surface-50 p-3">
            <div className="flex items-center justify-between text-xs font-medium text-surface-600">
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-success-500" />
                Best score
              </span>
              <span className="text-surface-900">{p.best_score}%</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-200">
              <div
                className="h-full rounded-full bg-brand-500 transition-all"
                style={{ width: `${Math.min(100, p.best_score)}%` }}
              />
            </div>
          </div>
        )}

        <Link
          href={`/courses/exam-prep/${category.id}`}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-brand-600 hover:shadow-md active:scale-[0.98]"
        >
          Start Studying
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  )
}

export default function ExamPrepHubPage() {
  const { user } = useAuth()
  const [categories, setCategories] = useState<ExamCategory[]>([])
  const [progress, setProgress] = useState<ExamProgressRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<AuthorityFilter>('all')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const progressByCategory = useMemo(() => {
    const m = new Map<string, ExamProgressRow>()
    for (const row of progress) {
      m.set(row.category_id, row)
    }
    return m
  }, [progress])

  const tabFiltered = useMemo(() => {
    if (tab === 'all') return categories
    if (tab === 'FAA') return categories.filter(c => c.authority === 'FAA')
    return categories.filter(c => c.authority === 'ICAO' || c.authority === 'EASA')
  }, [categories, tab])

  const searchFiltered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return tabFiltered
    return tabFiltered.filter(
      c =>
        c.name.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q)
    )
  }, [tabFiltered, search])

  const faaList = useMemo(() => searchFiltered.filter(c => c.authority === 'FAA'), [searchFiltered])
  const icaoList = useMemo(
    () => searchFiltered.filter(c => c.authority === 'ICAO' || c.authority === 'EASA'),
    [searchFiltered]
  )

  const totalExams = tabFiltered.length
  const questionsInBank = tabFiltered.reduce((sum, c) => sum + (c.question_count || 0), 0)

  const passRate = useMemo(() => {
    const relevant = progress.filter(p => tabFiltered.some(c => c.id === p.category_id))
    if (relevant.length === 0) return null
    const passed = relevant.filter(p => p.passed).length
    return Math.round((passed / relevant.length) * 100)
  }, [progress, tabFiltered])

  const toggleTopics = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const cats = await getExamCategories()
        let prog: ExamProgressRow[] = []
        if (user?.id) {
          const raw = await getExamProgress(user.id)
          prog = (raw ?? []) as ExamProgressRow[]
        }
        if (!cancelled) {
          setCategories(cats)
          setProgress(prog)
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Failed to load exam prep data'
        if (!cancelled) setToast({ message, type: 'error' })
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  const showFaaSection = tab === 'all' || tab === 'FAA'
  const showIcaoSection = tab === 'all' || tab === 'ICAO'

  return (
    <div className="min-h-screen bg-surface-50">
      <Header
        title="Exam Prep"
        subtitle="FAA, ICAO & EASA certification test preparation"
      />

      <div className="p-8">
        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          <div
            className="card animate-slide-up p-5"
            style={{ animationDelay: '0ms', animationFillMode: 'both' }}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-surface-500">
                  Total exams
                </p>
                <p className="mt-2 text-3xl font-extrabold text-surface-800">{totalExams}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/10">
                <GraduationCap className="h-5 w-5 text-brand-500" />
              </div>
            </div>
            <p className="mt-1 text-xs text-surface-500">Available for your selected authority filter</p>
          </div>
          <div
            className="card animate-slide-up p-5"
            style={{ animationDelay: '60ms', animationFillMode: 'both' }}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-surface-500">
                  Questions in bank
                </p>
                <p className="mt-2 text-3xl font-extrabold text-surface-800">{questionsInBank}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/10">
                <BookOpen className="h-5 w-5 text-brand-500" />
              </div>
            </div>
            <p className="mt-1 text-xs text-surface-500">Across filtered exam categories</p>
          </div>
          <div
            className="card animate-slide-up p-5"
            style={{ animationDelay: '120ms', animationFillMode: 'both' }}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-surface-500">
                  Your pass rate
                </p>
                <p className="mt-2 text-3xl font-extrabold text-surface-800">
                  {passRate === null ? '—' : `${passRate}%`}
                </p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/10">
                <Target className="h-5 w-5 text-brand-500" />
              </div>
            </div>
            <p className="mt-1 text-xs text-surface-500">Categories with at least one passing attempt</p>
          </div>
        </div>

        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
            <input
              type="text"
              placeholder="Search exams by name, code, or description..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-10 w-full rounded-lg border border-surface-200 bg-white pl-9 pr-4 text-sm outline-none transition-all placeholder:text-surface-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-50"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-surface-500">
              <Filter className="h-4 w-4" />
              Authority
            </span>
            <div className="flex rounded-lg border border-surface-200 bg-white p-0.5 shadow-sm">
              {(['all', 'FAA', 'ICAO'] as const).map(key => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    tab === key
                      ? 'bg-brand-500 text-white shadow-sm'
                      : 'text-surface-600 hover:bg-surface-50'
                  }`}
                >
                  {key === 'all' ? 'All' : key}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
          </div>
        ) : (
          <>
            {showFaaSection && (
              <section className="mb-12">
                <div className="mb-6 flex flex-wrap items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-500/10">
                    <Shield className="h-6 w-6 text-brand-500" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-surface-900">FAA Knowledge Tests</h2>
                    <p className="mt-1 max-w-3xl text-sm text-surface-500">
                      Official FAA Airman Certification Standards (ACS) based practice tests for all pilot
                      certificate levels.
                    </p>
                  </div>
                </div>
                {faaList.length === 0 ? (
                  <p className="py-8 text-center text-sm text-surface-500">
                    No FAA exams match your filters.
                  </p>
                ) : (
                  <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                    {faaList.map((cat, i) => (
                      <ExamCategoryCard
                        key={cat.id}
                        category={cat}
                        progress={progressByCategory.get(cat.id)}
                        expanded={expandedIds.has(cat.id)}
                        onToggleTopics={() => toggleTopics(cat.id)}
                        staggerIndex={i}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}

            {showIcaoSection && (
              <section>
                <div className="mb-6 flex flex-wrap items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
                    <Globe className="h-6 w-6 text-emerald-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-surface-900">ICAO Theory Exams</h2>
                    <p className="mt-1 max-w-3xl text-sm text-surface-500">
                      ICAO/EASA ATPL theory exam preparation covering all 14 mandatory subjects.
                    </p>
                  </div>
                </div>
                {icaoList.length === 0 ? (
                  <p className="py-8 text-center text-sm text-surface-500">
                    No ICAO/EASA exams match your filters.
                  </p>
                ) : (
                  <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                    {icaoList.map((cat, i) => (
                      <ExamCategoryCard
                        key={cat.id}
                        category={cat}
                        progress={progressByCategory.get(cat.id)}
                        expanded={expandedIds.has(cat.id)}
                        onToggleTopics={() => toggleTopics(cat.id)}
                        staggerIndex={faaList.length + i}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  )
}
