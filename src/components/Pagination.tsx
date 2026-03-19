'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface PaginationProps {
  currentPage: number
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
}

export default function Pagination({ currentPage, totalItems, pageSize, onPageChange }: PaginationProps) {
  const totalPages = Math.ceil(totalItems / pageSize)
  if (totalPages <= 1) return null

  const start = (currentPage - 1) * pageSize + 1
  const end = Math.min(currentPage * pageSize, totalItems)

  const pages: (number | 'ellipsis')[] = []
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
      pages.push(i)
    } else if (pages[pages.length - 1] !== 'ellipsis') {
      pages.push('ellipsis')
    }
  }

  return (
    <div className="flex items-center justify-between border-t border-surface-100 px-1 pt-4 mt-6">
      <p className="text-xs text-surface-500">
        Showing <span className="font-medium text-surface-700">{start}</span> to{' '}
        <span className="font-medium text-surface-700">{end}</span> of{' '}
        <span className="font-medium text-surface-700">{totalItems}</span>
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-surface-200 text-surface-500 transition-colors hover:bg-surface-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {pages.map((p, i) =>
          p === 'ellipsis' ? (
            <span key={`e-${i}`} className="px-1 text-surface-400">...</span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={`flex h-8 min-w-[32px] items-center justify-center rounded-lg px-2 text-xs font-medium transition-colors ${
                p === currentPage
                  ? 'bg-brand-500 text-white'
                  : 'border border-surface-200 text-surface-600 hover:bg-surface-50'
              }`}
            >
              {p}
            </button>
          )
        )}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-surface-200 text-surface-500 transition-colors hover:bg-surface-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

export function usePagination<T>(items: T[], pageSize = 12) {
  const [page, setPage] = useState(1)
  const totalItems = items.length
  const totalPages = Math.ceil(totalItems / pageSize)
  const safePage = Math.min(page, Math.max(1, totalPages))
  const paginatedItems = items.slice((safePage - 1) * pageSize, safePage * pageSize)
  return { page: safePage, setPage, paginatedItems, totalItems, pageSize }
}
