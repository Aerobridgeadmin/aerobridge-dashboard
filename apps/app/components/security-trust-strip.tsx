"use client";

/**
 * Security Trust Strip — clean "Protected by Snyk" indicator for client-facing pages.
 */

export function SecurityTrustStrip({ className }: { className?: string }) {
  return (
    <div className={className}>
      <a
        href="/security"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 text-[11px] text-white/40 hover:text-white/60 transition-colors"
      >
        <svg className="h-3.5 w-3.5 text-emerald-400/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
        <span>Protected by <strong className="text-white/50 font-semibold">Snyk</strong></span>
      </a>
    </div>
  );
}

export function SecurityTrustStripLight({ className }: { className?: string }) {
  return (
    <div className={className}>
      <a
        href="/security"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <svg className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
        <span>Protected by <strong className="font-semibold">Snyk</strong></span>
      </a>
    </div>
  );
}
