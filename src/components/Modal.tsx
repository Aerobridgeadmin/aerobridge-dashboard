'use client'
import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  width?: string
}

export default function Modal({ open, onClose, title, children, width = 'max-w-lg' }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null
  return (
    <div ref={overlayRef} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={e => { if (e.target === overlayRef.current) onClose() }}>
      <div className={`${width} w-full mx-4 animate-slide-up rounded-xl bg-white shadow-elevated`}>
        <div className="flex items-center justify-between border-b border-surface-100 px-6 py-4">
          <h3 className="text-base font-bold text-surface-800">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-surface-400 transition-colors hover:bg-surface-100 hover:text-surface-600"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  )
}

// Reusable form field components
export function FormField({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-surface-600">
        {label} {required && <span className="text-cta-500">*</span>}
      </label>
      {children}
    </div>
  )
}

export function FormInput({ ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className="h-10 w-full rounded-lg border border-surface-200 bg-white px-3 text-sm text-surface-800 outline-none transition-all placeholder:text-surface-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-50" />
}

export function FormTextarea({ ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className="w-full rounded-lg border border-surface-200 bg-white px-3 py-2.5 text-sm text-surface-800 outline-none transition-all placeholder:text-surface-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-50" />
}

export function FormSelect({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className="h-10 w-full rounded-lg border border-surface-200 bg-white px-3 text-sm text-surface-800 outline-none transition-all focus:border-brand-500 focus:ring-2 focus:ring-brand-50">{children}</select>
}

export function FormActions({ onCancel, loading, submitLabel = 'Save' }: { onCancel: () => void; loading?: boolean; submitLabel?: string }) {
  return (
    <div className="mt-6 flex items-center justify-end gap-3">
      <button type="button" onClick={onCancel} className="rounded-lg border border-surface-200 px-4 py-2 text-sm font-medium text-surface-600 transition-colors hover:bg-surface-50">Cancel</button>
      <button type="submit" disabled={loading} className="flex items-center gap-2 rounded-lg bg-brand-500 px-5 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-brand-600 disabled:opacity-50">
        {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"></span> : null}
        {submitLabel}
      </button>
    </div>
  )
}
