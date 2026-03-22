'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import Tabs from '@/components/Tabs'
import { Badge } from '@/components/Badge'
import { getExamCategories, getAllStudyMaterials } from '@/lib/data'
import type { ExamCategory, ExamTopic, StudyMaterial } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import {
  BookMarked,
  BookOpen,
  Brain,
  Calculator,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  ExternalLink,
  GraduationCap,
  Lightbulb,
  Loader2,
} from 'lucide-react'

type AuthorityTab = 'all' | 'FAA' | 'ICAO'

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
      return Array.isArray(parsed) ? (parsed as ExamTopic[]) : []
    } catch {
      return []
    }
  }
  return []
}

function sortTopics(topics: ExamTopic[]): ExamTopic[] {
  return [...topics].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
}

function authorityBadgeVariant(authority: ExamCategory['authority']) {
  if (authority === 'FAA') return 'blue' as const
  if (authority === 'ICAO') return 'teal' as const
  return 'amber' as const
}

function materialLookupKey(categoryId: string, topicId: string) {
  return `${categoryId}:${topicId}`
}

function coerceStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function normalizeStudyMaterial(row: StudyMaterial): StudyMaterial {
  return {
    ...row,
    key_concepts: coerceStringArray(row.key_concepts),
    formulas: coerceStringArray(row.formulas),
    mnemonics: coerceStringArray(row.mnemonics),
    references: coerceStringArray(row.references),
    tips: coerceStringArray(row.tips),
  }
}

export default function ExamPrepStudyPage() {
  const { user } = useAuth()
  const [categories, setCategories] = useState<ExamCategory[]>([])
  const [studyMaterials, setStudyMaterials] = useState<StudyMaterial[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<AuthorityTab>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [openTopicIds, setOpenTopicIds] = useState<Set<string>>(new Set())

  const topicMaterialMap = useMemo(() => {
    const map = new Map<string, StudyMaterial>()
    for (const m of studyMaterials) {
      map.set(materialLookupKey(m.category_id, m.topic_id), normalizeStudyMaterial(m))
    }
    return map
  }, [studyMaterials])

  const toggleTopic = useCallback((topicId: string) => {
    setOpenTopicIds(prev => {
      const next = new Set(prev)
      if (next.has(topicId)) next.delete(topicId)
      else next.add(topicId)
      return next
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const [cats, materials] = await Promise.all([getExamCategories(), getAllStudyMaterials()])
        if (!cancelled) {
          setCategories(cats)
          setStudyMaterials(materials)
        }
      } catch {
        if (!cancelled) {
          setCategories([])
          setStudyMaterials([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  const byAuthority = useMemo(() => {
    if (tab === 'all') return categories
    if (tab === 'FAA') return categories.filter(c => c.authority === 'FAA')
    return categories.filter(c => c.authority === 'ICAO' || c.authority === 'EASA')
  }, [categories, tab])

  const searchLower = searchQuery.trim().toLowerCase()

  const filtered = useMemo(() => {
    if (!searchLower) return byAuthority
    return byAuthority.filter(cat => {
      const topics = sortTopics(normalizeTopics(cat.topics))
      const inMeta =
        cat.name.toLowerCase().includes(searchLower) ||
        (cat.description ?? '').toLowerCase().includes(searchLower) ||
        (cat.code ?? '').toLowerCase().includes(searchLower)
      const inTopics = topics.some(
        t =>
          t.name.toLowerCase().includes(searchLower) ||
          (t.description ?? '').toLowerCase().includes(searchLower) ||
          (t.code ?? '').toLowerCase().includes(searchLower)
      )
      return inMeta || inTopics
    })
  }, [byAuthority, searchLower])

  const faaCount = useMemo(() => categories.filter(c => c.authority === 'FAA').length, [categories])
  const icaoCount = useMemo(
    () => categories.filter(c => c.authority === 'ICAO' || c.authority === 'EASA').length,
    [categories]
  )

  const tabItems = useMemo(
    () => [
      { id: 'all' as const, label: 'All', count: categories.length },
      { id: 'FAA' as const, label: 'FAA', count: faaCount },
      { id: 'ICAO' as const, label: 'ICAO', count: icaoCount },
    ],
    [categories.length, faaCount, icaoCount]
  )

  return (
    <div className="min-h-screen bg-surface-50">
      <Header
        title="Study Materials"
        subtitle="Structured course content for FAA & ICAO certification preparation"
      />

      <div className="p-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-500/10">
              <BookMarked className="h-6 w-6 text-brand-500" aria-hidden />
            </div>
            <div>
              <p className="text-sm font-semibold text-surface-800">How this hub works</p>
              <p className="mt-1 max-w-2xl text-sm text-surface-500">
                Your instructor assigns exam-prep courses. Work through each topic below, then use Practice Quiz to
                check understanding, or Take Full Exam when you are ready for a complete attempt.
              </p>
            </div>
          </div>
        </div>

        <div className="mb-6">
          <label htmlFor="study-search" className="sr-only">
            Search courses
          </label>
          <input
            id="study-search"
            type="search"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search courses and topics…"
            className="w-full max-w-md rounded-xl border border-surface-200 bg-white px-4 py-2.5 text-sm text-surface-800 shadow-sm outline-none ring-brand-500/0 transition-shadow placeholder:text-surface-400 focus:border-brand-300 focus:ring-2 focus:ring-brand-500/20"
          />
        </div>

        <div className="mb-8">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-surface-500">Filter by authority</p>
          <Tabs tabs={tabItems} activeTab={tab} onChange={id => setTab(id as AuthorityTab)} />
        </div>

        {loading ? (
          <div className="flex justify-center p-16">
            <Loader2 className="h-8 w-8 animate-spin text-brand-500" aria-label="Loading study materials" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="card animate-slide-up p-10 text-center text-sm text-surface-500">
            No published courses match this filter.
          </div>
        ) : (
          <div className="grid gap-8 lg:grid-cols-1 xl:grid-cols-2">
            {filtered.map((category, i) => {
              const topics = sortTopics(normalizeTopics(category.topics))
              const bar = accentBarMap[category.color] ?? 'bg-brand-500'
              return (
                <article
                  key={category.id}
                  className="card animate-slide-up overflow-hidden shadow-md"
                  style={{
                    animationDelay: `${i * 80}ms`,
                    animationFillMode: 'both',
                  }}
                >
                  <div className={`h-1.5 w-full ${bar}`} aria-hidden />
                  <div className="p-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-bold text-surface-900">{category.name}</h2>
                        <p className="mt-2 text-sm leading-relaxed text-surface-600">{category.description}</p>
                      </div>
                      <Badge variant={authorityBadgeVariant(category.authority)} size="sm" dot>
                        {category.authority}
                      </Badge>
                    </div>

                    <div className="mt-6 border-t border-surface-100 pt-5">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-500">Course topics</h3>
                      <ul className="mt-4 space-y-2">
                        {topics.length === 0 ? (
                          <li className="rounded-lg border border-dashed border-surface-200 bg-surface-50/80 px-4 py-6 text-center text-sm text-surface-500">
                            Topics for this course will appear here once configured.
                          </li>
                        ) : (
                          topics.map(topic => {
                            const open = openTopicIds.has(topic.id)
                            const material = topicMaterialMap.get(materialLookupKey(category.id, topic.id))
                            const md = material?.content_markdown?.trim()

                            return (
                              <li
                                key={topic.id}
                                className="overflow-hidden rounded-xl border border-surface-200 bg-white shadow-sm"
                              >
                                <button
                                  type="button"
                                  onClick={() => toggleTopic(topic.id)}
                                  className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-50"
                                  aria-expanded={open}
                                >
                                  <span className="mt-0.5 text-surface-400">
                                    {open ? (
                                      <ChevronUp className="h-5 w-5 shrink-0" aria-hidden />
                                    ) : (
                                      <ChevronDown className="h-5 w-5 shrink-0" aria-hidden />
                                    )}
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="flex flex-wrap items-center gap-2">
                                      <span className="font-semibold text-surface-800">{topic.name}</span>
                                      {topic.code ? (
                                        <Badge variant="slate" size="sm">
                                          {topic.code}
                                        </Badge>
                                      ) : null}
                                      {typeof topic.question_count === 'number' ? (
                                        <span className="text-xs text-surface-500">
                                          {topic.question_count} questions in bank
                                        </span>
                                      ) : null}
                                    </span>
                                    {topic.description ? (
                                      <span className="mt-1 block text-sm text-surface-500">{topic.description}</span>
                                    ) : null}
                                  </span>
                                </button>

                                {open ? (
                                  <div className="border-t border-surface-100 bg-surface-50/60 px-4 py-4 sm:px-6">
                                    {material ? (
                                      <div className="space-y-4">
                                        {md ? (
                                          <div className="rounded-lg border border-surface-200 bg-white px-3 py-3">
                                            <p className="text-[11px] font-bold uppercase tracking-wider text-surface-500">
                                              Study notes
                                            </p>
                                            <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-surface-700">
                                              {md}
                                            </div>
                                          </div>
                                        ) : null}

                                        <div>
                                          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-brand-600">
                                            <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                            Key concepts
                                          </p>
                                          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-surface-700">
                                            {material.key_concepts.map(line => (
                                              <li key={line}>{line}</li>
                                            ))}
                                          </ul>
                                        </div>

                                        {material.formulas.length > 0 ? (
                                          <div>
                                            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-surface-500">
                                              <Calculator className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                              Formulas & rules
                                            </p>
                                            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-surface-700">
                                              {material.formulas.map(line => (
                                                <li key={line}>{line}</li>
                                              ))}
                                            </ul>
                                          </div>
                                        ) : null}

                                        {material.mnemonics.length > 0 ? (
                                          <div>
                                            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-surface-500">
                                              <Brain className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                              Mnemonics
                                            </p>
                                            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-surface-700">
                                              {material.mnemonics.map(line => (
                                                <li key={line}>{line}</li>
                                              ))}
                                            </ul>
                                          </div>
                                        ) : null}

                                        {material.tips.length > 0 ? (
                                          <div>
                                            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-surface-500">
                                              <Lightbulb className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                              Study tips
                                            </p>
                                            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-surface-700">
                                              {material.tips.map(line => (
                                                <li key={line}>{line}</li>
                                              ))}
                                            </ul>
                                          </div>
                                        ) : null}

                                        {material.references.length > 0 ? (
                                          <div>
                                            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-surface-500">
                                              <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                              References
                                            </p>
                                            <ul className="mt-2 space-y-1 text-sm text-surface-600">
                                              {material.references.map(ref => (
                                                <li key={ref} className="flex gap-2">
                                                  <span className="text-brand-500" aria-hidden>
                                                    ·
                                                  </span>
                                                  <span>{ref}</span>
                                                </li>
                                              ))}
                                            </ul>
                                          </div>
                                        ) : null}

                                        <div className="flex flex-wrap gap-2 pt-1">
                                          <Link
                                            href={`/courses/exam-prep/${category.id}?topic=${encodeURIComponent(topic.id)}`}
                                            className="inline-flex items-center gap-2 rounded-lg border border-brand-200 bg-white px-4 py-2 text-sm font-semibold text-brand-700 shadow-sm transition-all hover:border-brand-300 hover:bg-brand-50"
                                          >
                                            <ClipboardList className="h-4 w-4 shrink-0" aria-hidden />
                                            Practice Quiz
                                          </Link>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="space-y-4">
                                        <p className="text-sm text-surface-600">Study guide coming soon.</p>
                                        <div className="flex flex-wrap gap-2 pt-1">
                                          <Link
                                            href={`/courses/exam-prep/${category.id}?topic=${encodeURIComponent(topic.id)}`}
                                            className="inline-flex items-center gap-2 rounded-lg border border-brand-200 bg-white px-4 py-2 text-sm font-semibold text-brand-700 shadow-sm transition-all hover:border-brand-300 hover:bg-brand-50"
                                          >
                                            <ClipboardList className="h-4 w-4 shrink-0" aria-hidden />
                                            Practice Quiz
                                          </Link>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ) : null}
                              </li>
                            )
                          })
                        )}
                      </ul>
                    </div>

                    <div className="mt-6 border-t border-surface-100 pt-5">
                      <Link
                        href={`/courses/exam-prep/${category.id}`}
                        className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-brand-600 hover:shadow-md active:scale-[0.98]"
                      >
                        <GraduationCap className="h-4 w-4 shrink-0" aria-hidden />
                        Take Full Exam
                      </Link>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
