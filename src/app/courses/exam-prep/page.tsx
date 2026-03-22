'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import Toast from '@/components/Toast'
import Tabs from '@/components/Tabs'
import { Badge, type BadgeVariant } from '@/components/Badge'
import { Button } from '@/components/Button'
import { SkeletonCard } from '@/components/Skeleton'
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
  GraduationCap,
  CheckCircle2,
  Gauge,
  Briefcase,
  Building2,
  Radio,
  Languages,
  Scale,
  CloudSun,
  Brain,
  Compass,
  Layers,
  BarChart3,
  Sparkles,
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

function difficultyBadgeVariant(d: ExamCategory['difficulty']): BadgeVariant {
  switch (d) {
    case 'beginner':
      return 'green'
    case 'intermediate':
      return 'blue'
    case 'advanced':
      return 'amber'
    case 'expert':
      return 'rose'
    default:
      return 'blue'
  }
}

function authorityBadgeVariant(authority: ExamCategory['authority']): BadgeVariant {
  if (authority === 'FAA') return 'blue'
  if (authority === 'ICAO') return 'green'
  return 'emerald'
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
  const topicCount = topics.length
  const attempted = Boolean(p && p.attempts > 0)
  const studyHref = `/courses/exam-prep/study?category=${encodeURIComponent(category.id)}`

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
                <Badge variant={authorityBadgeVariant(category.authority)} size="sm">
                  {category.authority}
                </Badge>
                <Badge variant={difficultyBadgeVariant(category.difficulty)} size="sm">
                  {category.difficulty}
                </Badge>
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-surface-500">{category.description}</p>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium text-surface-500">
          <span className="inline-flex items-center gap-1">
            <Layers className="h-3.5 w-3.5 text-surface-400" />
            {topicCount} {topicCount === 1 ? 'topic' : 'topics'}
          </span>
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

        {attempted && p && (
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

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-stretch">
          <Link
            href={`/courses/exam-prep/${category.id}`}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-brand-600 hover:shadow-md active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200 focus-visible:ring-offset-2"
          >
            Start Exam
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href={studyHref}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-surface-200 bg-white px-4 py-2.5 text-sm font-medium text-surface-800 shadow-sm transition-all hover:bg-surface-50 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-surface-200 focus-visible:ring-offset-2"
          >
            <BookOpen className="h-4 w-4 text-brand-500" />
            Study Guide
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function ExamPrepHubPage() {
  const router = useRouter()
  const { user } = useAuth()
  const catalogRef = useRef<HTMLElement>(null)
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

  const totalCategories = categories.length
  const totalQuestionsInCatalog = useMemo(
    () => categories.reduce((sum, c) => sum + (c.question_count || 0), 0),
    [categories]
  )

  const heroPassRate = useMemo(() => {
    const attempted = progress.filter(p => p.attempts > 0)
    if (attempted.length === 0) return null
    const passed = attempted.filter(p => p.passed).length
    return Math.round((passed / attempted.length) * 100)
  }, [progress])

  const continueLearning = useMemo(() => {
    return [...progress]
      .filter(p => p.attempts > 0)
      .sort((a, b) => new Date(b.last_attempt_at).getTime() - new Date(a.last_attempt_at).getTime())
      .slice(0, 6)
  }, [progress])

  const tabItems = useMemo(
    () => [
      { id: 'all' as const, label: 'All', count: categories.length },
      { id: 'FAA' as const, label: 'FAA', count: categories.filter(c => c.authority === 'FAA').length },
      {
        id: 'ICAO' as const,
        label: 'ICAO',
        count: categories.filter(c => c.authority === 'ICAO' || c.authority === 'EASA').length,
      },
    ],
    [categories]
  )

  const toggleTopics = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const scrollToCatalog = useCallback(() => {
    catalogRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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

      <section
        className="relative overflow-hidden bg-gradient-to-br from-brand-500 to-brand-700 px-6 py-12 text-white shadow-lg sm:px-8 sm:py-14"
        aria-labelledby="exam-prep-hero-title"
      >
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-white/10 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-black/10 blur-2xl"
          aria-hidden
        />
        <div className="relative mx-auto max-w-5xl">
          <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-white/90">
            <Sparkles className="h-4 w-4" aria-hidden />
            <span>Course catalog</span>
          </div>
          <h1 id="exam-prep-hero-title" className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
            Aviation Exam Preparation
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-white/90 sm:text-lg">
            Master FAA & ICAO certifications with structured courses, study materials, and practice exams
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl bg-white/10 px-4 py-3 ring-1 ring-white/20 backdrop-blur-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70">Categories</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{loading ? '—' : totalCategories}</p>
            </div>
            <div className="rounded-xl bg-white/10 px-4 py-3 ring-1 ring-white/20 backdrop-blur-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70">Questions</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{loading ? '—' : totalQuestionsInCatalog}</p>
            </div>
            <div className="rounded-xl bg-white/10 px-4 py-3 ring-1 ring-white/20 backdrop-blur-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70">Your pass rate</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">
                {!user?.id ? '—' : heroPassRate === null ? '—' : `${heroPassRate}%`}
              </p>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button
              type="button"
              size="lg"
              className="bg-white text-brand-700 shadow-md hover:bg-white/95 focus-visible:ring-white/50"
              onClick={scrollToCatalog}
            >
              Browse Courses
            </Button>
            <Button
              type="button"
              size="lg"
              variant="secondary"
              className="border-white/40 bg-white/10 text-white shadow-none ring-1 ring-white/30 hover:bg-white/20 focus-visible:ring-white/40"
              onClick={() => router.push('/courses/exam-prep/study')}
            >
              Study Materials
            </Button>
          </div>
        </div>
      </section>

      <div className="p-8">
        {user?.id && continueLearning.length > 0 && (
          <section className="mb-12" aria-labelledby="continue-learning-heading">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="continue-learning-heading" className="text-xl font-bold text-surface-900">
                  Continue learning
                </h2>
                <p className="mt-1 text-sm text-surface-500">Pick up where you left off</p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {continueLearning.map(row => (
                <div
                  key={row.category_id}
                  className="card flex flex-col justify-between p-5 transition-shadow hover:shadow-md"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-surface-900">{row.category_name}</h3>
                      <Badge variant={authorityBadgeVariant(row.authority)} size="sm">
                        {row.authority}
                      </Badge>
                    </div>
                    <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
                      <div className="rounded-lg bg-surface-50 px-2 py-2">
                        <dt className="text-[10px] font-semibold uppercase tracking-wide text-surface-500">
                          Last
                        </dt>
                        <dd className="mt-0.5 text-sm font-bold text-surface-900">{row.last_score}%</dd>
                      </div>
                      <div className="rounded-lg bg-surface-50 px-2 py-2">
                        <dt className="text-[10px] font-semibold uppercase tracking-wide text-surface-500">
                          Best
                        </dt>
                        <dd className="mt-0.5 text-sm font-bold text-surface-900">{row.best_score}%</dd>
                      </div>
                      <div className="rounded-lg bg-surface-50 px-2 py-2">
                        <dt className="text-[10px] font-semibold uppercase tracking-wide text-surface-500">
                          Attempts
                        </dt>
                        <dd className="mt-0.5 text-sm font-bold text-surface-900">{row.attempts}</dd>
                      </div>
                    </dl>
                  </div>
                  <Button
                    className="mt-4 w-full"
                    icon={ArrowRight}
                    onClick={() => router.push(`/courses/exam-prep/${row.category_id}`)}
                  >
                    Continue
                  </Button>
                </div>
              ))}
            </div>
          </section>
        )}

        <section id="exam-prep-catalog" ref={catalogRef} className="scroll-mt-6">
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
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
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <span className="text-sm font-medium text-surface-500">Authority</span>
              <Tabs tabs={tabItems} activeTab={tab} onChange={id => setTab(id as AuthorityFilter)} />
            </div>
          </div>

          {loading ? (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : (
            <>
              {showFaaSection && (
                <div className="mb-12">
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
                    <p className="py-8 text-center text-sm text-surface-500">No FAA exams match your filters.</p>
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
                </div>
              )}

              {showIcaoSection && (
                <div className="mb-12">
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
                </div>
              )}
            </>
          )}
        </section>

        <section
          className="mt-4 rounded-2xl border border-surface-100 bg-white p-8 shadow-card"
          aria-labelledby="how-it-works-heading"
        >
          <h2 id="how-it-works-heading" className="text-center text-xl font-bold text-surface-900">
            How it works
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-surface-500">
            From study guides to scored practice — built for instructors assigning prep and students earning
            certifications.
          </p>
          <ol className="mt-10 grid gap-8 md:grid-cols-3">
            <li className="relative flex flex-col items-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/10">
                <BookOpen className="h-7 w-7 text-brand-600" aria-hidden />
              </div>
              <span className="mt-4 text-xs font-bold uppercase tracking-wider text-brand-600">Step 1</span>
              <h3 className="mt-1 font-semibold text-surface-900">Study the material</h3>
              <p className="mt-2 text-sm text-surface-500">
                Review structured study guides for each topic
              </p>
            </li>
            <li className="relative flex flex-col items-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/10">
                <GraduationCap className="h-7 w-7 text-brand-600" aria-hidden />
              </div>
              <span className="mt-4 text-xs font-bold uppercase tracking-wider text-brand-600">Step 2</span>
              <h3 className="mt-1 font-semibold text-surface-900">Practice with quizzes</h3>
              <p className="mt-2 text-sm text-surface-500">
                Take topic-specific or full practice exams
              </p>
            </li>
            <li className="relative flex flex-col items-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/10">
                <BarChart3 className="h-7 w-7 text-brand-600" aria-hidden />
              </div>
              <span className="mt-4 text-xs font-bold uppercase tracking-wider text-brand-600">Step 3</span>
              <h3 className="mt-1 font-semibold text-surface-900">Track your progress</h3>
              <p className="mt-2 text-sm text-surface-500">
                Monitor scores, identify weak areas, and improve
              </p>
            </li>
          </ol>
        </section>
      </div>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  )
}
