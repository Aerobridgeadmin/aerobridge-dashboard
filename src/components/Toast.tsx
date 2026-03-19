'use client'
import { useEffect, useState } from 'react'
import { CheckCircle, XCircle, X } from 'lucide-react'

interface ToastProps {
  message: string
  type: 'success' | 'error'
  onClose: () => void
}

export default function Toast({ message, type, onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3500)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div className="fixed bottom-6 right-6 z-[60] animate-slide-up">
      <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 shadow-elevated ${type === 'success' ? 'border-success-500/20 bg-white text-success-500' : 'border-cta-500/20 bg-white text-cta-500'}`}>
        {type === 'success' ? <CheckCircle className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
        <span className="text-sm font-medium text-surface-800">{message}</span>
        <button onClick={onClose} className="ml-2 text-surface-400 hover:text-surface-600"><X className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  )
}
