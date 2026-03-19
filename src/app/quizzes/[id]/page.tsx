'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Header from '@/components/Header'
import { supabase } from '@/lib/supabase'
import { Quiz, QuizQuestion } from '@/lib/supabase'
import {
  ArrowLeft, HelpCircle, CheckCircle2, XCircle, Loader2,
  ChevronRight, Trophy, RotateCcw, Clock, Target, AlertCircle,
} from 'lucide-react'
import Link from 'next/link'

type QuizState = 'intro' | 'taking' | 'results'

export default function QuizDetailPage() {
  const params = useParams()
  const router = useRouter()
  const quizId = params.id as string

  const [quiz, setQuiz] = useState<Quiz | null>(null)
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [state, setState] = useState<QuizState>('intro')
  const [currentQ, setCurrentQ] = useState(0)
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [showExplanation, setShowExplanation] = useState(false)
  const [score, setScore] = useState(0)
  const [startTime, setStartTime] = useState<Date | null>(null)
  const [endTime, setEndTime] = useState<Date | null>(null)

  useEffect(() => {
    async function load() {
      const [quizRes, questionsRes] = await Promise.all([
        supabase.from('quizzes').select('*').eq('id', quizId).single(),
        supabase.from('quiz_questions').select('*').eq('quiz_id', quizId).order('sort_order'),
      ])
      if (quizRes.data) setQuiz(quizRes.data)
      if (questionsRes.data) setQuestions(questionsRes.data)
      setLoading(false)
    }
    load()
  }, [quizId])

  const startQuiz = () => {
    setState('taking')
    setCurrentQ(0)
    setAnswers({})
    setShowExplanation(false)
    setScore(0)
    setStartTime(new Date())
    setEndTime(null)
  }

  const selectAnswer = (optionIndex: number) => {
    if (answers[currentQ] !== undefined) return
    setAnswers(prev => ({ ...prev, [currentQ]: optionIndex }))
    setShowExplanation(true)
  }

  const nextQuestion = () => {
    setShowExplanation(false)
    if (currentQ < questions.length - 1) {
      setCurrentQ(prev => prev + 1)
    } else {
      const correctCount = questions.reduce((count, q, i) => {
        return count + (answers[i] === q.correct_answer ? 1 : 0)
      }, 0)
      setScore(Math.round((correctCount / questions.length) * 100))
      setEndTime(new Date())
      setState('results')
    }
  }

  const getElapsedTime = () => {
    if (!startTime || !endTime) return '0:00'
    const diff = Math.round((endTime.getTime() - startTime.getTime()) / 1000)
    const mins = Math.floor(diff / 60)
    const secs = diff % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-50">
        <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
      </div>
    )
  }

  if (!quiz) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-surface-50">
        <p className="text-surface-500">Quiz not found</p>
        <button onClick={() => router.push('/quizzes')} className="mt-4 text-sm text-brand-500 hover:underline">Back to Quizzes</button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface-50">
      <Header title={quiz.title} subtitle={quiz.course_title} />

      <div className="p-8">
        <button onClick={() => router.push('/quizzes')} className="mb-6 flex items-center gap-1.5 text-sm text-surface-500 transition-colors hover:text-brand-500">
          <ArrowLeft className="h-4 w-4" /> Back to Quizzes
        </button>

        {/* INTRO STATE */}
        {state === 'intro' && (
          <div className="mx-auto max-w-2xl">
            <div className="card overflow-hidden">
              <div className="bg-gradient-to-br from-brand-500 to-brand-700 p-8 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
                  <HelpCircle className="h-8 w-8 text-white" />
                </div>
                <h1 className="mt-4 text-2xl font-bold text-white">{quiz.title}</h1>
                <p className="mt-2 text-sm text-white/80">{quiz.course_title}</p>
              </div>
              <div className="p-8">
                <div className="grid grid-cols-3 gap-6">
                  <div className="rounded-lg bg-surface-50 p-4 text-center">
                    <HelpCircle className="mx-auto h-5 w-5 text-surface-400" />
                    <p className="mt-2 text-xl font-bold text-surface-900">{questions.length}</p>
                    <p className="text-xs text-surface-500">Questions</p>
                  </div>
                  <div className="rounded-lg bg-surface-50 p-4 text-center">
                    <Target className="mx-auto h-5 w-5 text-surface-400" />
                    <p className="mt-2 text-xl font-bold text-surface-900">{quiz.passing_score}%</p>
                    <p className="text-xs text-surface-500">Passing Score</p>
                  </div>
                  <div className="rounded-lg bg-surface-50 p-4 text-center">
                    <Clock className="mx-auto h-5 w-5 text-surface-400" />
                    <p className="mt-2 text-xl font-bold text-surface-900">~{Math.max(5, questions.length * 2)}</p>
                    <p className="text-xs text-surface-500">Minutes</p>
                  </div>
                </div>

                {questions.length === 0 ? (
                  <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-center">
                    <AlertCircle className="mx-auto h-5 w-5 text-amber-600" />
                    <p className="mt-2 text-sm text-amber-700">No questions available for this quiz yet.</p>
                    <p className="mt-1 text-xs text-amber-600">Please seed the quiz questions from the admin panel.</p>
                  </div>
                ) : (
                  <button
                    onClick={startQuiz}
                    className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 py-3.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-brand-600 hover:shadow-md active:scale-[0.98]"
                  >
                    Start Quiz <ChevronRight className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAKING STATE */}
        {state === 'taking' && questions[currentQ] && (
          <div className="mx-auto max-w-2xl">
            {/* Progress */}
            <div className="mb-6">
              <div className="flex items-center justify-between text-sm">
                <span className="text-surface-600">Question {currentQ + 1} of {questions.length}</span>
                <span className="font-medium text-surface-900">{Math.round(((currentQ + 1) / questions.length) * 100)}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-200">
                <div
                  className="h-full rounded-full bg-brand-500 transition-all duration-500"
                  style={{ width: `${((currentQ + 1) / questions.length) * 100}%` }}
                />
              </div>
            </div>

            <div className="card overflow-hidden">
              <div className="border-b border-surface-200 bg-surface-50 px-6 py-4">
                <span className="inline-block rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-600">
                  Question {currentQ + 1}
                </span>
              </div>
              <div className="p-6">
                <h2 className="text-lg font-semibold text-surface-900">{questions[currentQ].question_text}</h2>

                <div className="mt-6 space-y-3">
                  {(questions[currentQ].options as string[]).map((option, oi) => {
                    const isSelected = answers[currentQ] === oi
                    const isCorrect = oi === questions[currentQ].correct_answer
                    const hasAnswered = answers[currentQ] !== undefined
                    let borderClass = 'border-surface-200 hover:border-brand-300 hover:bg-brand-50/30'
                    let bgClass = ''

                    if (hasAnswered) {
                      if (isCorrect) {
                        borderClass = 'border-green-300'
                        bgClass = 'bg-green-50'
                      } else if (isSelected && !isCorrect) {
                        borderClass = 'border-red-300'
                        bgClass = 'bg-red-50'
                      } else {
                        borderClass = 'border-surface-200 opacity-60'
                      }
                    }

                    return (
                      <button
                        key={oi}
                        onClick={() => selectAnswer(oi)}
                        disabled={hasAnswered}
                        className={`flex w-full items-center gap-3 rounded-xl border-2 px-5 py-4 text-left transition-all ${borderClass} ${bgClass} ${hasAnswered ? 'cursor-default' : 'cursor-pointer'}`}
                      >
                        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                          hasAnswered && isCorrect ? 'bg-green-500 text-white' :
                          hasAnswered && isSelected && !isCorrect ? 'bg-red-500 text-white' :
                          isSelected ? 'bg-brand-500 text-white' :
                          'bg-surface-100 text-surface-600'
                        }`}>
                          {hasAnswered && isCorrect ? <CheckCircle2 className="h-4 w-4" /> :
                           hasAnswered && isSelected && !isCorrect ? <XCircle className="h-4 w-4" /> :
                           String.fromCharCode(65 + oi)}
                        </div>
                        <span className={`text-sm ${hasAnswered && isCorrect ? 'font-semibold text-green-800' : hasAnswered && isSelected && !isCorrect ? 'text-red-700' : 'text-surface-700'}`}>
                          {option}
                        </span>
                      </button>
                    )
                  })}
                </div>

                {/* Explanation */}
                {showExplanation && questions[currentQ].explanation && (
                  <div className={`mt-6 animate-slide-up rounded-lg p-4 ${
                    answers[currentQ] === questions[currentQ].correct_answer ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'
                  }`}>
                    <div className="flex items-start gap-2">
                      {answers[currentQ] === questions[currentQ].correct_answer ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                      ) : (
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                      )}
                      <div>
                        <p className={`text-sm font-semibold ${answers[currentQ] === questions[currentQ].correct_answer ? 'text-green-800' : 'text-amber-800'}`}>
                          {answers[currentQ] === questions[currentQ].correct_answer ? 'Correct!' : 'Incorrect'}
                        </p>
                        <p className="mt-1 text-sm text-surface-600">{questions[currentQ].explanation}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Next Button */}
                {answers[currentQ] !== undefined && (
                  <button
                    onClick={nextQuestion}
                    className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 py-3 text-sm font-semibold text-white transition-all hover:bg-brand-600 active:scale-[0.98]"
                  >
                    {currentQ < questions.length - 1 ? 'Next Question' : 'See Results'}
                    <ChevronRight className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* RESULTS STATE */}
        {state === 'results' && (
          <div className="mx-auto max-w-2xl">
            <div className="card overflow-hidden">
              <div className={`p-8 text-center ${score >= quiz.passing_score ? 'bg-gradient-to-br from-green-500 to-emerald-600' : 'bg-gradient-to-br from-amber-500 to-orange-600'}`}>
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
                  {score >= quiz.passing_score ? (
                    <Trophy className="h-10 w-10 text-white" />
                  ) : (
                    <RotateCcw className="h-10 w-10 text-white" />
                  )}
                </div>
                <h1 className="mt-4 text-3xl font-bold text-white">
                  {score >= quiz.passing_score ? 'Congratulations!' : 'Keep Studying!'}
                </h1>
                <p className="mt-2 text-white/80">
                  {score >= quiz.passing_score
                    ? 'You passed the assessment.'
                    : `You need ${quiz.passing_score}% to pass. Review the material and try again.`}
                </p>
              </div>

              <div className="p-8">
                {/* Score Display */}
                <div className="grid grid-cols-3 gap-6">
                  <div className="rounded-lg bg-surface-50 p-4 text-center">
                    <p className={`text-3xl font-bold ${score >= quiz.passing_score ? 'text-green-600' : 'text-amber-600'}`}>
                      {score}%
                    </p>
                    <p className="text-xs text-surface-500">Your Score</p>
                  </div>
                  <div className="rounded-lg bg-surface-50 p-4 text-center">
                    <p className="text-3xl font-bold text-surface-900">
                      {questions.filter((q, i) => answers[i] === q.correct_answer).length}/{questions.length}
                    </p>
                    <p className="text-xs text-surface-500">Correct</p>
                  </div>
                  <div className="rounded-lg bg-surface-50 p-4 text-center">
                    <p className="text-3xl font-bold text-surface-900">{getElapsedTime()}</p>
                    <p className="text-xs text-surface-500">Time</p>
                  </div>
                </div>

                {/* Question Review */}
                <h3 className="mt-8 text-sm font-semibold text-surface-900">Question Review</h3>
                <div className="mt-4 space-y-3">
                  {questions.map((q, i) => {
                    const isCorrect = answers[i] === q.correct_answer
                    return (
                      <div key={i} className={`rounded-lg border p-4 ${isCorrect ? 'border-green-200 bg-green-50/50' : 'border-red-200 bg-red-50/50'}`}>
                        <div className="flex items-start gap-3">
                          <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${isCorrect ? 'bg-green-500' : 'bg-red-500'}`}>
                            {isCorrect ? <CheckCircle2 className="h-3 w-3 text-white" /> : <XCircle className="h-3 w-3 text-white" />}
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-surface-800">{q.question_text}</p>
                            {!isCorrect && (
                              <p className="mt-1 text-xs text-surface-500">
                                Your answer: <span className="text-red-600">{(q.options as string[])[answers[i]]}</span>
                                {' · '}Correct: <span className="font-medium text-green-700">{(q.options as string[])[q.correct_answer]}</span>
                              </p>
                            )}
                            {q.explanation && (
                              <p className="mt-1 text-xs text-surface-400">{q.explanation}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Actions */}
                <div className="mt-8 flex gap-4">
                  <button
                    onClick={startQuiz}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-brand-500 py-3 text-sm font-semibold text-white transition-all hover:bg-brand-600 active:scale-[0.98]"
                  >
                    <RotateCcw className="h-4 w-4" /> Retake Quiz
                  </button>
                  <Link
                    href="/quizzes"
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-surface-200 py-3 text-sm font-semibold text-surface-700 transition-all hover:bg-surface-50 active:scale-[0.98]"
                  >
                    All Quizzes
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
