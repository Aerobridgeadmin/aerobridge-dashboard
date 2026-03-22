'use client'

import { AlertTriangle, Loader2 } from 'lucide-react'
import Modal from './Modal'

interface ConfirmModalProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmLabel?: string
  variant?: 'danger' | 'warning'
  loading?: boolean
}

const variantStyles = {
  danger: {
    circle: 'bg-danger-50 text-danger-500',
    button: 'bg-danger-600 text-white hover:bg-danger-500 focus-visible:ring-danger-500',
  },
  warning: {
    circle: 'bg-warning-50 text-warning-600',
    button: 'bg-warning-600 text-white hover:bg-warning-500 focus-visible:ring-warning-500',
  },
}

export default function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Delete',
  variant = 'danger',
  loading = false,
}: ConfirmModalProps) {
  const styles = variantStyles[variant]

  return (
    <Modal open={open} onClose={onClose} title={title} width="max-w-md">
      <div className="flex flex-col items-center text-center">
        <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-full ${styles.circle}`}>
          <AlertTriangle className="h-6 w-6" aria-hidden />
        </div>
        <p className="text-sm leading-relaxed text-surface-600">{message}</p>
        <div className="mt-6 flex w-full items-center justify-end gap-3 border-t border-surface-100 pt-5">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg border border-surface-200 px-4 py-2 text-sm font-medium text-surface-600 transition-colors hover:bg-surface-50 disabled:pointer-events-none disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`flex items-center justify-center gap-2 rounded-lg px-5 py-2 text-sm font-medium shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 ${styles.button}`}
          >
            {loading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden /> : null}
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}
