'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import { getExamCategory, getExamQuestions, createExamAttempt } from '@/lib/data'
import { ExamCategory, ExamQuestion, ExamTopic } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import {
  ArrowLeft,
  HelpCircle,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronRight,
  Trophy,
  RotateCcw,
  Clock,
  Target,
  AlertCircle,
  BookOpen,
  Filter,
  Shuffle,
  Flag,
} from 'lucide-react'

type ExamFlowState = 'intro' | 'config' | 'taking' | 'results'

type QuestionCountOption = 10 | 25 | 50 | 'all'
type DifficultyFilter = 'all' | 'easy' | 'medium' | 'hard'

const CATEGORY_GRADIENT: Record<string, string> = {
  blue: 'from-blue-500 to-blue-700',
  indigo: 'from-indigo-500 to-indigo-700',
  purple: 'from-purple-500 to-purple-700',
  cyan: 'from-cyan-500 to-cyan-700',
  emerald: 'from-emerald-500 to-emerald-700',
  amber: 'from-amber-500 to-amber-700',
  rose: 'from-rose-500 to-rose-700',
  slate: 'from-slate-500 to-slate-700',
  sky: 'from-sky-500 to-sky-700',
  violet: 'from-violet-500 to-violet-700',
}

function normalizeTopics(category: ExamCategory | null): ExamTopic[] {
  if (!category?.topics) return []
  const t = category.topics
  return Array.isArray(t) ? (t as ExamTopic[]) : []
}

function categoryGradient(color: string): string {
  return CATEGORY_GRADIENT[color] ?? 'from-brand-500 to-brand-700'
}

function formatDifficultyLabel(d: ExamCategory['difficulty']): string {
  const map: Record<ExamCategory['difficulty'], string> = {
    beginner: 'Beginner',
    intermediate: 'Intermediate',
    advanced: 'Advanced',
    expert: 'Expert',
  }
  return map[d] ?? d
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function formatMmSs(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds)
  const mins = Math.floor(s / 60)
  const secs = s % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export default function ExamPrepTakePage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const examId = params.examId as string

  const [category, setCategory] = useState<ExamCategory | null>(null)
  const [allQuestions, setAllQuestions] = useState<ExamQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [state, setState] = useState<ExamFlowState>('intro')

  const [selectedQuestions, setSelectedQuestions] = useState<ExamQuestion[]>([])
  const [currentQ, setCurrentQ] = useState(0)
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [showExplanation, setShowExplanation] = useState(false)
  const [flagged, setFlagged] = useState<Set<number>>(() => new Set())

  const [questionCountOption, setQuestionCountOption] = useState<QuestionCountOption>(25)
  const [useAllTopics, setUseAllTopics] = useState(true)
  const [selectedTopicIds, setSelectedTopicIds] = useState<Set<string>>(new Set())
  const [difficultyFilter, setDifficultyFilter] = useState<DifficultyFilter>('all')
  const [shuffleOn, setShuffleOn] = useState(true)
  const [timerEnabled, setTimerEnabled] = useState(true)

  const [examStartTime, setExamStartTime] = useState<Date | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [resultMeta, setResultMeta] = useState<{
    score: number
    correctCount: number
    elapsedSeconds: number
  } | null>(null)
  const [isCompleting, setIsCompleting] = useState(false)

  const topics = useMemo(() => normalizeTopics(category), [category])

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [cat, qs] = await Promise.all([
        getExamCategory(examId),
        getExamQuestions(examId),
      ])
      setCategory(cat)
      setAllQuestions(qs)
      const t = cat ? normalizeTopics(cat) : []
      setSelectedTopicIds(new Set(t.map((x) => x.id)))
      setLoading(false)
    }
    load()
  }, [examId])

  useEffect(() => {
    if (state !== 'taking' || !timerEnabled || !examStartTime) return
    const id = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - examStartTime.getTime()) / 1000))
    }, 1000)
    return () => window.clearInterval(id)
  }, [state, timerEnabled, examStartTime])

  const toggleTopic = (topicId: string) => {
    setUseAllTopics(false)
    setSelectedTopicIds((prev) => {
      const next = new Set(prev)
      if (next.has(topicId)) next.delete(topicId)
      else next.add(topicId)
      return next
    })
  }

  const selectAllTopics = () => {
    setUseAllTopics(true)
    setSelectedTopicIds(new Set(topics.map((t) => t.id)))
  }

  const buildSessionQuestions = useCallback((): ExamQuestion[] => {
    let pool = [...allQuestions]

    if (difficultyFilter !== 'all') {
      pool = pool.filter((q) => q.difficulty === difficultyFilter)
    }

    if (!useAllTopics) {
      pool = pool.filter((q) => {
        if (!q.topic_id) return true
        return selectedTopicIds.has(q.topic_id)
      })
    }

    if (shuffleOn) pool = shuffleArray(pool)

    const cap =
      questionCountOption === 'all'
        ? pool.length
        : Math.min(questionCountOption, pool.length)

    return pool.slice(0, cap)
  }, [
    allQuestions,
    difficultyFilter,
    useAllTopics,
    selectedTopicIds,
    shuffleOn,
    questionCountOption,
  ])

  const goToConfig = () => setState('config')

  const startExam = () => {
    const session = buildSessionQuestions()
    if (session.length === 0) return

    setSelectedQuestions(session)
    setCurrentQ(0)
    setAnswers({})
    setShowExplanation(false)
    setFlagged(new Set())
    setResultMeta(null)
    setIsCompleting(false)
    const start = new Date()
    setExamStartTime(start)
    setElapsedSeconds(0)
    setState('taking')
  }

  const selectAnswer = (optionIndex: number) => {
    if (answers[currentQ] !== undefined) return
    setAnswers((prev) => ({ ...prev, [currentQ]: optionIndex }))
    setShowExplanation(true)
  }

  const toggleFlag = () => {
    setFlagged((prev) => {
      const next = new Set(prev)
      if (next.has(currentQ)) next.delete(currentQ)
      else next.add(currentQ)
      return next
    })
  }

  const finalizeExam = async () => {
    const correctCount = selectedQuestions.reduce(
      (count, q, i) => count + (answers[i] === q.correct_answer ? 1 : 0),
      0,
    )
    const total = selectedQuestions.length
    const score = total > 0 ? Math.round((correctCount / total) * 100) : 0
    const elapsed = examStartTime
      ? Math.floor((Date.now() - examStartTime.getTime()) / 1000)
      : 0

    const answersMap: Record<string, number> = {}
    selectedQuestions.forEach((q, i) => {
      if (answers[i] !== undefined) answersMap[q.id] = answers[i]
    })

    setResultMeta({ score, correctCount, elapsedSeconds: elapsed })
    setState('results')

    if (user?.id && category) {
      try {
        await createExamAttempt({
          user_id: user.id,
          category_id: examId,
          score,
          total_questions: selectedQuestions.length,
          correct_answers: correctCount,
          passed: score >= category.passing_score,
          time_spent_seconds: elapsed,
          answers: answersMap,
          started_at: examStartTime!.toISOString(),
          completed_at: new Date().toISOString(),
        })
      } catch (e) {
        console.error('Failed to save exam attempt:', e)
      }
    }
  }

  const nextQuestion = async () => {
    if (answers[currentQ] === undefined) return
    if (currentQ < selectedQuestions.length - 1) {
      setShowExplanation(false)
      setCurrentQ((prev) => prev + 1)
      return
    }
    if (isCompleting) return
    setIsCompleting(true)
    await finalizeExam()
    setIsCompleting(false)
  }

  const topicBreakdownResults = useMemo(() => {
    const rows: { id: string; name: string; correct: number; total: number }[] = []
    const byTopic = new Map<string, { name: string; correct: number; total: number }>()

    const topicName = (topicId?: string) => {
      if (!topicId) return 'General'
      return topics.find((t) => t.id === topicId)?.name ?? 'General'
    }

    selectedQuestions.forEach((q, i) => {
      const key = q.topic_id ?? '_general'
      const name = topicName(q.topic_id)
      if (!byTopic.has(key)) {
        byTopic.set(key, { name, correct: 0, total: 0 })
      }
      const row = byTopic.get(key)!
      row.total += 1
      if (answers[i] === q.correct_answer) row.correct += 1
    })

    byTopic.forEach((v, id) => {
      rows.push({ id, name: v.name, correct: v.correct, total: v.total })
    })
    return rows.sort((a, b) => a.name.localeCompare(b.name))
  }, [selectedQuestions, answers, topics])

  const sessionPoolPreviewCount = useMemo(() => {
    let pool = [...allQuestions]
    if (difficultyFilter !== 'all') {
      pool = pool.filter((q) => q.difficulty === difficultyFilter)
    }
    if (!useAllTopics) {
      pool = pool.filter((q) => {
        if (!q.topic_id) return true
        return selectedTopicIds.has(q.topic_id)
      })
    }
    return pool.length
  }, [allQuestions, difficultyFilter, useAllTopics, selectedTopicIds])

  const canStart =
    sessionPoolPreviewCount > 0 &&
    (useAllTopics || selectedTopicIds.size > 0 || allQuestions.some((q) => !q.topic_id))

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-50">
        <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
      </div>
    )
  }

  if (!category) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-surface-50">
        <p className="text-surface-500">Exam not found</p>
        <Link
          href="/courses/exam-prep"
          className="mt-4 text-sm text-brand-500 hover:underline"
        >
          Back to Exam Prep
        </Link>
      </div>
    )
  }

  const grad = categoryGradient(category.color)
  const passing = (resultMeta?.score ?? 0) >= category.passing_score
  const displayScore = resultMeta?.score ?? 0
  const displayCorrect = resultMeta?.correctCount ?? 0
  const displayElapsed = resultMeta?.elapsedSeconds ?? 0

  return (
    <div className="min-h-screen bg-surface-50">
      <Header title={category.name} subtitle={`${category.authority} exam prep`} />

      <div className="p-8">
        <button
          type="button"
          onClick={() => router.push('/courses/exam-prep')}
          className="mb-6 flex items-center gap-1.5 text-sm text-surface-500 transition-colors hover:text-brand-500"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Exam Prep
        </button>

        {/* Empty bank */}
        {allQuestions.length === 0 && (
          <div className="mx-auto max-w-2xl animate-slide-up">
            <div className="card overflow-hidden border-2 border-amber-200 bg-amber-50/80 p-8 text-center">
              <BookOpen className="mx-auto h-12 w-12 text-amber-600" />
              <h1 className="mt-4 text-xl font-bold text-surface-900">
                This exam is being prepared
              </h1>
              <p className="mt-2 text-sm text-surface-600">
                We&apos;re still loading official-style questions for{' '}
                <span className="font-semibold text-surface-900">{category.name}</span>. Check back
                soon — the topics below outline what will be covered.
              </p>
              {topics.length > 0 && (
                <ul className="mt-6 space-y-2 text-left">
                  {topics.map((t) => (
                    <li
                      key={t.id}
                      className="flex items-center justify-between rounded-lg border border-amber-200/80 bg-white/60 px-4 py-2 text-sm"
                    >
                      <span className="font-medium text-surface-800">{t.name}</span>
                      <span className="text-surface-500">{t.question_count} qs</span>
                    </li>
                  ))}
                </ul>
              )}
              <Link
                href="/courses/exam-prep"
                className="mt-8 inline-flex items-center gap-2 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-brand-600"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Exam Prep
              </Link>
            </div>
          </div>
        )}

        {allQuestions.length > 0 && state === 'intro' && (
          <div className="mx-auto max-w-2xl animate-slide-up">
            <div className="card overflow-hidden">
              <div className={`bg-gradient-to-br ${grad} p-8 text-center`}>
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
                  <BookOpen className="h-8 w-8 text-white" />
                </div>
                <h1 className="mt-4 text-2xl font-bold text-white">{category.name}</h1>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                  <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
                    {category.authority}
                  </span>
                  <span className="rounded-full bg-white/15 px-3 py-1 text-xs text-white/90">
                    {category.code}
                  </span>
                </div>
                {category.description ? (
                  <p className="mx-auto mt-4 max-w-xl text-sm text-white/85">{category.description}</p>
                ) : null}
              </div>
              <div className="p-8">
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div className="rounded-lg bg-surface-50 p-4 text-center">
                    <HelpCircle className="mx-auto h-5 w-5 text-surface-400" />
                    <p className="mt-2 text-xl font-bold text-surface-900">{allQuestions.length}</p>
                    <p className="text-xs text-surface-500">Questions</p>
                  </div>
                  <div className="rounded-lg bg-surface-50 p-4 text-center">
                    <Clock className="mx-auto h-5 w-5 text-surface-400" />
                    <p className="mt-2 text-xl font-bold text-surface-900">
                      {category.time_limit_minutes}
                    </p>
                    <p className="text-xs text-surface-500">Time limit (min)</p>
                  </div>
                  <div className="rounded-lg bg-surface-50 p-4 text-center">
                    <Target className="mx-auto h-5 w-5 text-surface-400" />
                    <p className="mt-2 text-xl font-bold text-surface-900">
                      {category.passing_score}%
                    </p>
                    <p className="text-xs text-surface-500">Passing score</p>
                  </div>
                  <div className="rounded-lg bg-surface-50 p-4 text-center">
                    <Filter className="mx-auto h-5 w-5 text-surface-400" />
                    <p className="mt-2 text-xl font-bold capitalize text-surface-900">
                      {formatDifficultyLabel(category.difficulty)}
                    </p>
                    <p className="text-xs text-surface-500">Difficulty</p>
                  </div>
                </div>

                {topics.length > 0 && (
                  <div className="mt-8">
                    <h3 className="text-sm font-semibold text-surface-900">Topic breakdown</h3>
                    <ul className="mt-3 space-y-2">
                      {topics.map((t) => (
                        <li
                          key={t.id}
                          className="flex items-center justify-between rounded-lg border border-surface-200 bg-surface-50 px-4 py-2.5 text-sm"
                        >
                          <span className="font-medium text-surface-800">{t.name}</span>
                          <span className="text-surface-500">{t.question_count} questions</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <button
                  type="button"
                  onClick={goToConfig}
                  className="mt-8 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 py-3.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-brand-600 hover:shadow-md active:scale-[0.98]"
                >
                  Configure &amp; Start <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {allQuestions.length > 0 && state === 'config' && (
          <div className="mx-auto max-w-2xl animate-slide-up">
            <div className="card overflow-hidden">
              <div className={`bg-gradient-to-br ${grad} px-8 py-6`}>
                <h2 className="text-lg font-bold text-white">Practice session</h2>
                <p className="mt-1 text-sm text-white/80">{category.name}</p>
              </div>
              <div className="space-y-8 p-8">
                <div>
                  <p className="text-sm font-semibold text-surface-900">Number of questions</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {([10, 25, 50, 'all'] as QuestionCountOption[]).map((n) => (
                      <button
                        key={String(n)}
                        type="button"
                        onClick={() => setQuestionCountOption(n)}
                        className={`rounded-lg border-2 px-4 py-2 text-sm font-medium transition-all ${
                          questionCountOption === n
                            ? 'border-brand-500 bg-brand-50 text-brand-700'
                            : 'border-surface-200 text-surface-600 hover:border-brand-200'
                        }`}
                      >
                        {n === 'all' ? 'All' : n}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-surface-500" />
                    <p className="text-sm font-semibold text-surface-900">Topics</p>
                  </div>
                  <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-lg border border-surface-200 bg-surface-50 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={useAllTopics}
                      onChange={(e) => {
                        if (e.target.checked) selectAllTopics()
                        else setUseAllTopics(false)
                      }}
                      className="h-4 w-4 rounded border-surface-300 text-brand-500 focus:ring-brand-500"
                    />
                    <span className="text-sm font-medium text-surface-800">All topics</span>
                  </label>
                  {topics.length > 0 && (
                    <ul className="mt-3 space-y-2">
                      {topics.map((t) => (
                        <li key={t.id}>
                          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-surface-200 px-4 py-2.5 transition-colors hover:bg-surface-50">
                            <input
                              type="checkbox"
                              checked={useAllTopics || selectedTopicIds.has(t.id)}
                              onChange={() => {
                                if (useAllTopics) {
                                  setUseAllTopics(false)
                                  setSelectedTopicIds(new Set(topics.map((x) => x.id)))
                                }
                                toggleTopic(t.id)
                              }}
                              className="h-4 w-4 rounded border-surface-300 text-brand-500 focus:ring-brand-500"
                            />
                            <span className="flex-1 text-sm text-surface-800">{t.name}</span>
                            <span className="text-xs text-surface-500">{t.question_count}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-surface-500" />
                    <p className="text-sm font-semibold text-surface-900">Difficulty</p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(['all', 'easy', 'medium', 'hard'] as DifficultyFilter[]).map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDifficultyFilter(d)}
                        className={`rounded-lg border-2 px-4 py-2 text-sm font-medium capitalize transition-all ${
                          difficultyFilter === d
                            ? 'border-brand-500 bg-brand-50 text-brand-700'
                            : 'border-surface-200 text-surface-600 hover:border-brand-200'
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <label className="flex cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={shuffleOn}
                      onChange={(e) => setShuffleOn(e.target.checked)}
                      className="h-4 w-4 rounded border-surface-300 text-brand-500 focus:ring-brand-500"
                    />
                    <Shuffle className="h-4 w-4 text-surface-500" />
                    <span className="text-sm font-medium text-surface-800">Shuffle questions</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={timerEnabled}
                      onChange={(e) => setTimerEnabled(e.target.checked)}
                      className="h-4 w-4 rounded border-surface-300 text-brand-500 focus:ring-brand-500"
                    />
                    <Clock className="h-4 w-4 text-surface-500" />
                    <span className="text-sm font-medium text-surface-800">Show timer</span>
                  </label>
                </div>

                {sessionPoolPreviewCount === 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    <AlertCircle className="mb-1 inline h-4 w-4" /> No questions match your filters.
                    Adjust topics or difficulty.
                  </div>
                )}

                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => setState('intro')}
                    className="flex flex-1 items-center justify-center rounded-lg border border-surface-200 py-3 text-sm font-semibold text-surface-700 transition-all hover:bg-surface-50"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={!canStart || sessionPoolPreviewCount === 0}
                    onClick={startExam}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-brand-500 py-3 text-sm font-semibold text-white transition-all hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Start Exam <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {allQuestions.length > 0 && state === 'taking' && selectedQuestions[currentQ] && (
          <div className="mx-auto max-w-2xl">
            <div className="mb-6">
              <div className="flex items-center justify-between text-sm">
                <span className="text-surface-600">
                  Question {currentQ + 1} of {selectedQuestions.length}
                </span>
                <div className="flex items-center gap-4">
                  {timerEnabled && (
                    <span className="flex items-center gap-1.5 font-mono font-medium text-surface-900">
                      <Clock className="h-4 w-4 text-surface-500" />
                      {formatMmSs(elapsedSeconds)}
                    </span>
                  )}
                  <span className="font-medium text-surface-900">
                    {Math.round(((currentQ + 1) / selectedQuestions.length) * 100)}%
                  </span>
                </div>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-200">
                <div
                  className="h-full rounded-full bg-brand-500 transition-all duration-500"
                  style={{
                    width: `${((currentQ + 1) / selectedQuestions.length) * 100}%`,
                  }}
                />
              </div>
            </div>

            <div className="card overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-200 bg-surface-50 px-6 py-4">
                <span className="inline-block rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-600">
                  Question {currentQ + 1}
                </span>
                <button
                  type="button"
                  onClick={toggleFlag}
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                    flagged.has(currentQ)
                      ? 'border-cta-500 bg-cta-500/10 text-cta-500'
                      : 'border-surface-200 text-surface-600 hover:border-surface-300'
                  }`}
                >
                  <Flag className="h-3.5 w-3.5" />
                  {flagged.has(currentQ) ? 'Flagged' : 'Flag for review'}
                </button>
              </div>
              <div className="p-6">
                <h2 className="text-lg font-semibold text-surface-900">
                  {selectedQuestions[currentQ].question_text}
                </h2>

                <div className="mt-6 space-y-3">
                  {(selectedQuestions[currentQ].options as string[]).map((option, oi) => {
                    const isSelected = answers[currentQ] === oi
                    const isCorrect = oi === selectedQuestions[currentQ].correct_answer
                    const hasAnswered = answers[currentQ] !== undefined
                    let borderClass = 'border-surface-200 hover:border-brand-300 hover:bg-brand-50/30'
                    let bgClass = ''

                    if (hasAnswered) {
                      if (isCorrect) {
                        borderClass = 'border-success-500/60'
                        bgClass = 'bg-success-50'
                      } else if (isSelected && !isCorrect) {
                        borderClass = 'border-cta-500/50'
                        bgClass = 'bg-danger-50'
                      } else {
                        borderClass = 'border-surface-200 opacity-60'
                      }
                    }

                    return (
                      <button
                        key={oi}
                        type="button"
                        onClick={() => selectAnswer(oi)}
                        disabled={hasAnswered}
                        className={`flex w-full items-center gap-3 rounded-xl border-2 px-5 py-4 text-left transition-all ${borderClass} ${bgClass} ${hasAnswered ? 'cursor-default' : 'cursor-pointer'}`}
                      >
                        <div
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                            hasAnswered && isCorrect
                              ? 'bg-success-500 text-white'
                              : hasAnswered && isSelected && !isCorrect
                                ? 'bg-cta-500 text-white'
                                : isSelected
                                  ? 'bg-brand-500 text-white'
                                  : 'bg-surface-100 text-surface-600'
                          }`}
                        >
                          {hasAnswered && isCorrect ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : hasAnswered && isSelected && !isCorrect ? (
                            <XCircle className="h-4 w-4" />
                          ) : (
                            String.fromCharCode(65 + oi)
                          )}
                        </div>
                        <span
                          className={`text-sm ${
                            hasAnswered && isCorrect
                              ? 'font-semibold text-success-600'
                              : hasAnswered && isSelected && !isCorrect
                                ? 'text-cta-600'
                                : 'text-surface-700'
                          }`}
                        >
                          {option}
                        </span>
                      </button>
                    )
                  })}
                </div>

                {showExplanation && (
                  <div
                    className={`mt-6 animate-slide-up rounded-lg border p-4 ${
                      answers[currentQ] === selectedQuestions[currentQ].correct_answer
                        ? 'border-success-200 bg-success-50'
                        : 'border-warning-200 bg-warning-50'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {answers[currentQ] === selectedQuestions[currentQ].correct_answer ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-500" />
                      ) : (
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning-600" />
                      )}
                      <div>
                        <p
                          className={`text-sm font-semibold ${
                            answers[currentQ] === selectedQuestions[currentQ].correct_answer
                              ? 'text-success-600'
                              : 'text-warning-800'
                          }`}
                        >
                          {answers[currentQ] === selectedQuestions[currentQ].correct_answer
                            ? 'Correct!'
                            : 'Incorrect'}
                        </p>
                        {selectedQuestions[currentQ].explanation ? (
                          <p className="mt-1 text-sm text-surface-600">
                            {selectedQuestions[currentQ].explanation}
                          </p>
                        ) : null}
                        {selectedQuestions[currentQ].reference ? (
                          <p className="mt-2 text-xs text-surface-500">
                            <span className="font-semibold text-surface-700">Reference:</span>{' '}
                            {selectedQuestions[currentQ].reference}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )}

                {answers[currentQ] !== undefined && (
                  <button
                    type="button"
                    onClick={() => nextQuestion()}
                    disabled={isCompleting}
                    className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 py-3 text-sm font-semibold text-white transition-all hover:bg-brand-600 active:scale-[0.98] disabled:opacity-60"
                  >
                    {isCompleting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Saving…
                      </>
                    ) : currentQ < selectedQuestions.length - 1 ? (
                      <>
                        Next Question <ChevronRight className="h-4 w-4" />
                      </>
                    ) : (
                      <>
                        See Results <ChevronRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {allQuestions.length > 0 && state === 'results' && resultMeta && (
          <div className="mx-auto max-w-2xl animate-slide-up">
            <div className="card overflow-hidden">
              <div
                className={`p-8 text-center ${
                  passing
                    ? 'bg-gradient-to-br from-success-500 to-emerald-600'
                    : 'bg-gradient-to-br from-cta-500 to-cta-700'
                }`}
              >
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
                  {passing ? (
                    <Trophy className="h-10 w-10 text-white" />
                  ) : (
                    <RotateCcw className="h-10 w-10 text-white" />
                  )}
                </div>
                <h1 className="mt-4 text-3xl font-bold text-white">
                  {passing ? 'Congratulations!' : 'Keep studying'}
                </h1>
                <p className="mt-2 text-white/85">
                  {passing
                    ? 'You met the passing score for this session.'
                    : `You need ${category.passing_score}% to pass. Review weak topics and try again.`}
                </p>
              </div>

              <div className="p-8">
                <div className="text-center">
                  <p
                    className={`text-5xl font-bold ${passing ? 'text-success-500' : 'text-cta-500'}`}
                  >
                    {displayScore}%
                  </p>
                  <p className="mt-1 text-sm text-surface-500">Your score</p>
                </div>

                <div className="mt-8 grid grid-cols-3 gap-4">
                  <div className="rounded-lg bg-surface-50 p-4 text-center">
                    <p className="text-2xl font-bold text-surface-900">
                      {displayCorrect}/{selectedQuestions.length}
                    </p>
                    <p className="text-xs text-surface-500">Correct</p>
                  </div>
                  <div className="rounded-lg bg-surface-50 p-4 text-center">
                    <p className="text-2xl font-bold text-surface-900">
                      {formatMmSs(displayElapsed)}
                    </p>
                    <p className="text-xs text-surface-500">Time</p>
                  </div>
                  <div className="rounded-lg bg-surface-50 p-4 text-center">
                    <p className="text-2xl font-bold text-surface-900">{category.passing_score}%</p>
                    <p className="text-xs text-surface-500">Passing</p>
                  </div>
                </div>

                {topicBreakdownResults.length > 0 && (
                  <div className="mt-10">
                    <h3 className="text-sm font-semibold text-surface-900">Score by topic</h3>
                    <ul className="mt-4 space-y-2">
                      {topicBreakdownResults.map((row) => {
                        const pct = row.total ? Math.round((row.correct / row.total) * 100) : 0
                        return (
                          <li
                            key={row.id}
                            className="flex items-center justify-between rounded-lg border border-surface-200 bg-surface-50 px-4 py-3 text-sm"
                          >
                            <span className="font-medium text-surface-800">{row.name}</span>
                            <span className="text-surface-600">
                              {row.correct}/{row.total}{' '}
                              <span className="font-semibold text-surface-900">({pct}%)</span>
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )}

                <h3 className="mt-10 text-sm font-semibold text-surface-900">Question review</h3>
                <div className="mt-4 space-y-3">
                  {selectedQuestions.map((q, i) => {
                    const isCorrect = answers[i] === q.correct_answer
                    const opts = q.options as string[]
                    return (
                      <div
                        key={q.id}
                        className={`rounded-lg border p-4 ${
                          isCorrect
                            ? 'border-success-200 bg-success-50/50'
                            : 'border-danger-200 bg-danger-50/50'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                              isCorrect ? 'bg-success-500' : 'bg-cta-500'
                            }`}
                          >
                            {isCorrect ? (
                              <CheckCircle2 className="h-3 w-3 text-white" />
                            ) : (
                              <XCircle className="h-3 w-3 text-white" />
                            )}
                          </div>
                          <div className="flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-medium text-surface-800">{q.question_text}</p>
                              {flagged.has(i) && (
                                <span className="rounded-full bg-cta-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-cta-600">
                                  Flagged
                                </span>
                              )}
                            </div>
                            {!isCorrect && answers[i] !== undefined && (
                              <p className="mt-1 text-xs text-surface-500">
                                Your answer:{' '}
                                <span className="text-cta-600">{opts[answers[i]]}</span>
                                {' · '}Correct:{' '}
                                <span className="font-medium text-success-600">
                                  {opts[q.correct_answer]}
                                </span>
                              </p>
                            )}
                            {q.explanation && (
                              <p className="mt-1 text-xs text-surface-500">{q.explanation}</p>
                            )}
                            {q.reference && (
                              <p className="mt-1 text-xs text-surface-400">
                                Ref: {q.reference}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => {
                      setState('config')
                      setResultMeta(null)
                    }}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-brand-500 py-3 text-sm font-semibold text-white transition-all hover:bg-brand-600 active:scale-[0.98]"
                  >
                    <RotateCcw className="h-4 w-4" /> Retake
                  </button>
                  <Link
                    href="/courses/exam-prep"
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-surface-200 py-3 text-sm font-semibold text-surface-700 transition-all hover:bg-surface-50 active:scale-[0.98]"
                  >
                    Back to Exam Prep
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
