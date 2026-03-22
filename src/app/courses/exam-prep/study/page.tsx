'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import Tabs from '@/components/Tabs'
import { Badge } from '@/components/Badge'
import { getExamCategories } from '@/lib/data'
import type { ExamCategory, ExamTopic } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import {
  BookMarked,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  GraduationCap,
  Loader2,
} from 'lucide-react'

type AuthorityTab = 'all' | 'FAA' | 'ICAO'

type TopicStudyGuide = {
  keyConcepts: string[]
  formulas?: string[]
  references: string[]
}

const STUDY_BY_TOPIC_ID: Record<string, TopicStudyGuide> = {
  'par-regs': {
    keyConcepts: [
      'Passenger currency: within the preceding 90 days, three takeoffs and three landings in the same category, class, and type (if a type rating is required).',
      'Night passenger carrying: three full-stop takeoffs and full-stop landings during night (1 hour after sunset to 1 hour before sunrise) in the same 90-day window.',
      'Flight review (BFR): required at least every 24 calendar months per §61.56 to act as PIC.',
    ],
    formulas: [
      'VFR weather minimums — Class B: 3 SM, clear of clouds. Class C & D: 3 SM, 500 ft below / 1,000 ft above / 2,000 ft horizontal from clouds.',
      'Class E below 10,000 ft MSL: same as C/D (3 SM, 500/1,000/2,000). Class G day: 1 SM, clear of clouds (higher minimums apply at night).',
      'Mnemonic ARROW — Airworthiness certificate, Registration, Radio station license (if required), Operating limitations (POH/AFM), Weight & balance data.',
    ],
    references: ['14 CFR §61.57', '14 CFR §61.56', '14 CFR §91.155', '14 CFR §91.203'],
  },
  'par-aero': {
    keyConcepts: [
      'Four forces: lift opposes weight; thrust opposes drag. In steady level flight they balance in pairs.',
      'Angle of attack (AOA) is the angle between the wing chord line and the relative wind — not the same as pitch attitude.',
      'Load factor in level turns increases with bank angle: approximately 1.15 G at 30°, 1.41 G at 45°, and 2 G at 60°.',
    ],
    formulas: [
      'Stall speed rises with load factor: Vs_new ≈ Vs × √(load factor). Higher G means a higher indicated stall speed.',
    ],
    references: ['FAA Pilot’s Handbook of Aeronautical Knowledge', 'FAA Airplane Flying Handbook'],
  },
  'par-wx': {
    keyConcepts: [
      'Standard atmosphere (ISA) at sea level: 15 °C and 29.92 inHg; approximate lapse rate ~2 °C per 1,000 ft in the troposphere.',
      'Rough cloud-base estimate (AGL): (temperature − dewpoint) ÷ 4.4 × 1,000 ft — useful for convective cumulus formation.',
      'METAR groups (typical order): station identifier, date/time, wind, visibility, present weather, clouds, temperature/dewpoint, altimeter.',
    ],
    references: ['FAA Aviation Weather Handbook', 'AC 00-6'],
  },
  '050-atm': {
    keyConcepts: [
      'ICAO ISA: 15 °C at MSL, tropopause at 36,090 ft with temperature −56.5 °C; mean lapse rate 6.5 °C per km below the tropopause.',
      'Dry adiabatic lapse rate (DALR): about 3 °C per 1,000 ft for unsaturated rising/sinking parcels.',
      'Saturated adiabatic lapse rate (SALR): roughly 1.5 °C per 1,000 ft (varies with moisture content).',
    ],
    references: ['ICAO Doc 7488 — Manual of the ICAO Standard Atmosphere', 'ICAO Annex 3'],
  },
  '050-wind': {
    keyConcepts: [
      'Jet stream: narrow band of strong winds in the upper troposphere; for exam and planning purposes a core speed of at least about 60 kt is often used as a practical minimum threshold.',
    ],
    references: ['ICAO Annex 3', 'WMO / aviation meteorology references'],
  },
  '040-phys': {
    keyConcepts: [
      'Time of useful consciousness (approximate): FL250 about 3–5 min, FL300 about 1–2 min, FL350 about 30–60 s, FL400 about 15–20 s without supplemental oxygen.',
      'IMSAFE — Illness, Medication, Stress, Alcohol, Fatigue, Eating: a self-assessment checklist before flight.',
    ],
    references: ['ICAO Doc 8984 — Human Factors Training Manual', 'FAA Aeromedical Factors (PHAK)'],
  },
  '040-crm': {
    keyConcepts: [
      'CRM model pillars: Communication, Situational awareness, Decision making, Teamwork, and Workload management — integrated to support safe operations.',
    ],
    references: ['ICAO Doc 9683 — Human Factors Training Manual', 'AC 120-51 (crew resource management)'],
  },
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

const PLACEHOLDER_GUIDE =
  'Detailed study guide coming soon. Review the reference materials and practice with the quiz below.'

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

function sortTopics(topics: ExamTopic[]): ExamTopic[] {
  return [...topics].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
}

function authorityBadgeVariant(authority: ExamCategory['authority']) {
  if (authority === 'FAA') return 'blue' as const
  if (authority === 'ICAO') return 'teal' as const
  return 'amber' as const
}

function getStudyGuide(topicId: string): TopicStudyGuide | null {
  return STUDY_BY_TOPIC_ID[topicId] ?? null
}

export default function ExamPrepStudyPage() {
  const { user } = useAuth()
  const [categories, setCategories] = useState<ExamCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<AuthorityTab>('all')
  const [openTopicIds, setOpenTopicIds] = useState<Set<string>>(new Set())

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
        const cats = await getExamCategories()
        if (!cancelled) setCategories(cats)
      } catch {
        if (!cancelled) setCategories([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  const filtered = useMemo(() => {
    if (tab === 'all') return categories
    if (tab === 'FAA') return categories.filter(c => c.authority === 'FAA')
    return categories.filter(c => c.authority === 'ICAO' || c.authority === 'EASA')
  }, [categories, tab])

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

        <div className="mb-8">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-surface-500">Filter by authority</p>
          <Tabs
            tabs={tabItems}
            activeTab={tab}
            onChange={id => setTab(id as AuthorityTab)}
          />
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
                            const guide = getStudyGuide(topic.id)
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
                                    <div className="space-y-4">
                                      <div>
                                        <p className="text-[11px] font-bold uppercase tracking-wider text-brand-600">
                                          Key concepts
                                        </p>
                                        {guide ? (
                                          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-surface-700">
                                            {guide.keyConcepts.map(line => (
                                              <li key={line}>{line}</li>
                                            ))}
                                          </ul>
                                        ) : (
                                          <p className="mt-2 text-sm leading-relaxed text-surface-600">
                                            {PLACEHOLDER_GUIDE}
                                          </p>
                                        )}
                                      </div>

                                      {guide?.formulas && guide.formulas.length > 0 ? (
                                        <div>
                                          <p className="text-[11px] font-bold uppercase tracking-wider text-surface-500">
                                            Formulas & mnemonics
                                          </p>
                                          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-surface-700">
                                            {guide.formulas.map(line => (
                                              <li key={line}>{line}</li>
                                            ))}
                                          </ul>
                                        </div>
                                      ) : null}

                                      {guide?.references && guide.references.length > 0 ? (
                                        <div>
                                          <p className="text-[11px] font-bold uppercase tracking-wider text-surface-500">
                                            Official references
                                          </p>
                                          <ul className="mt-2 space-y-1 text-sm text-surface-600">
                                            {guide.references.map(ref => (
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
