"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";

//  Types 

type ToastVariant = "info" | "success" | "warning" | "update";

type Toast = {
  id: string;
  variant: ToastVariant;
  title: string;
  message: string;
  icon?: string;
  durationMs: number;
  createdAt: number;
};

type ToastContextValue = {
  addToast: (opts: {
    title: string;
    message: string;
    variant?: ToastVariant;
    icon?: string;
    durationMs?: number;
  }) => void;
};

//  Context 

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

//  Provider 

let toastCounter = 0;

export function ToastProvider({ children }: { children?: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback(
    ({
      title,
      message,
      variant = "info",
      icon,
      durationMs = 5000,
    }: {
      title: string;
      message: string;
      variant?: ToastVariant;
      icon?: string;
      durationMs?: number;
    }) => {
      const id = `toast-${++toastCounter}-${Date.now()}`;
      setToasts((prev: Toast[]) => [...prev, { id, variant, title, message, icon, durationMs, createdAt: Date.now() }]);
    },
    []
  );

  const dismiss = useCallback((id: string) => {
    setToasts((prev: Toast[]) => prev.filter((t: Toast) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

//  Toast Container (top-right slide-out) 

function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="fixed top-4 right-4 z-[90] flex flex-col gap-2 pointer-events-none" style={{ maxWidth: 380 }}>
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

//  Individual Toast 

const VARIANT_STYLES: Record<ToastVariant, { bg: string; iconBg: string; iconColor: string; defaultIcon: string }> = {
  info: {
    bg: "border-blue-200 dark:border-blue-800",
    iconBg: "bg-blue-100 dark:bg-blue-900/40",
    iconColor: "text-blue-600 dark:text-blue-400",
    defaultIcon: "",
  },
  success: {
    bg: "border-green-200 dark:border-green-800",
    iconBg: "bg-green-100 dark:bg-green-900/40",
    iconColor: "text-green-600 dark:text-green-400",
    defaultIcon: "",
  },
  warning: {
    bg: "border-orange-200 dark:border-orange-800",
    iconBg: "bg-orange-100 dark:bg-orange-900/40",
    iconColor: "text-orange-600 dark:text-orange-400",
    defaultIcon: "!",
  },
  update: {
    bg: "border-purple-200 dark:border-purple-800",
    iconBg: "bg-purple-100 dark:bg-purple-900/40",
    iconColor: "text-purple-600 dark:text-purple-400",
    defaultIcon: "i",
  },
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void; key?: React.Key }) {
  const [exiting, setExiting] = useState(false);
  const style = VARIANT_STYLES[toast.variant];

  useEffect(() => {
    const timeout = setTimeout(() => setExiting(true), toast.durationMs);
    return () => clearTimeout(timeout);
  }, [toast.durationMs]);

  useEffect(() => {
    if (exiting) {
      const timeout = setTimeout(() => onDismiss(toast.id), 300);
      return () => clearTimeout(timeout);
    }
  }, [exiting, onDismiss, toast.id]);

  return (
    <div
      className={`pointer-events-auto flex items-start gap-3 rounded-xl border bg-card p-4 shadow-lg transition-all duration-300 ${style.bg} ${
        exiting ? "translate-x-[110%] opacity-0" : "translate-x-0 opacity-100 animate-in slide-in-from-right duration-300"
      }`}
    >
      <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-sm ${style.iconBg}`}>
        {toast.icon ?? style.defaultIcon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold">{toast.title}</div>
        <div className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{toast.message}</div>
      </div>
      <button
        onClick={() => setExiting(true)}
        className="flex-shrink-0 text-muted-foreground hover:text-foreground"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
