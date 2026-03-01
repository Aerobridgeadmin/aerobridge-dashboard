'use client'

import Header from '@/components/Header'
import { quizzes } from '@/lib/data'
import { Plus, Search, HelpCircle, Target, BarChart3, Users } from 'lucide-react'

export default function QuizzesPage() {
  return (
    <div className="min-h-screen bg-surface-50">
      <Header title="Quizzes" subtitle="Evaluate learner knowledge and track performance" />

      <div className="p-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
            <input
              type="text"
              placeholder="Search quizzes..."
              className="h-10 w-72 rounded-lg border border-surface-200 bg-white pl-9 pr-4 text-sm outline-none transition-all placeholder:text-surface-400 focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <button className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-brand-700 hover:shadow-md active:scale-[0.98]">
            <Plus className="h-4 w-4" />
            Create Quiz
          </button>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {quizzes.map((quiz, i) => (
            <div
              key={quiz.id}
              className="card animate-slide-up p-6"
              style={{ animationDelay: `${i * 60}ms`, animationFillMode: 'both' }}
            >
              <h3 className="text-base font-semibold text-surface-900">{quiz.title}</h3>
              <p className="mt-1 text-xs text-surface-500">{quiz.course_title}</p>

              <div className="mt-5 grid grid-cols-2 gap-4">
                <div className="rounded-lg bg-surface-50 p-3">
                  <div className="flex items-center gap-1.5 text-surface-400">
                    <HelpCircle className="h-3.5 w-3.5" />
                    <span className="text-[10px] uppercase tracking-wider">Questions</span>
                  </div>
                  <p className="mt-1 font-display text-xl text-surface-900">{quiz.questions_count}</p>
                </div>
                <div className="rounded-lg bg-surface-50 p-3">
                  <div className="flex items-center gap-1.5 text-surface-400">
                    <Users className="h-3.5 w-3.5" />
                    <span className="text-[10px] uppercase tracking-wider">Attempts</span>
                  </div>
                  <p className="mt-1 font-display text-xl text-surface-900">{quiz.attempts}</p>
                </div>
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-surface-500">Avg Score</span>
                  <span className={`font-semibold ${
                    quiz.avg_score >= quiz.passing_score ? 'text-emerald-600' : 'text-rose-600'
                  }`}>
                    {quiz.avg_score}%
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-100">
                  <div className="relative h-full overflow-hidden rounded-full">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        quiz.avg_score >= quiz.passing_score ? 'bg-emerald-500' : 'bg-rose-400'
                      }`}
                      style={{ width: `${quiz.avg_score}%` }}
                    ></div>
                    {/* Passing score marker */}
                    <div
                      className="absolute top-0 h-full w-0.5 bg-surface-900/30"
                      style={{ left: `${quiz.passing_score}%` }}
                    ></div>
                  </div>
                </div>
                <p className="mt-1 text-[10px] text-surface-400">Passing score: {quiz.passing_score}%</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
