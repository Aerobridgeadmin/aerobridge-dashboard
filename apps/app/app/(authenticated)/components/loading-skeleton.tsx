import Image from "next/image";

/**
 * Shared loading skeleton with the spinning Remote Leverage logo.
 * Usage: <LoadingSkeleton /> or <LoadingSkeleton variant="detail" />
 *
 * Variants:
 *  - "dashboard" (default): stat cards + chart placeholders
 *  - "table": header + table rows
 *  - "detail": single card with fields
 *  - "form": form-style skeleton
 *  - "minimal": just the spinning logo centered
 */
export type SkeletonVariant = "dashboard" | "table" | "detail" | "form" | "minimal";

export function LoadingSkeleton({ variant = "dashboard" }: { variant?: SkeletonVariant }) {
  return (
    <div className="flex flex-1 flex-col gap-6 p-4">
      {/* Spinning logo header */}
      <div className="flex items-center gap-3">
        <Image
          src="/logo.png"
          alt="Loading"
          width={28}
          height={28}
          className="animate-spin-slow rounded-md"
          priority
        />
        <div className="h-5 w-32 animate-pulse rounded bg-muted" />
      </div>

      {variant === "minimal" && (
        <div className="flex flex-1 items-center justify-center py-24">
          <Image
            src="/logo.png"
            alt="Loading"
            width={48}
            height={48}
            className="animate-spin-slow rounded-xl opacity-60"
            priority
          />
        </div>
      )}

      {variant === "dashboard" && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="rounded-xl border bg-card p-5">
                <div className="h-3 w-20 animate-pulse rounded bg-muted mb-3" />
                <div className="h-8 w-16 animate-pulse rounded bg-muted mb-2" />
                <div className="h-3 w-28 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="rounded-xl border bg-card p-5">
                <div className="h-4 w-32 animate-pulse rounded bg-muted mb-4" />
                <div className="h-48 animate-pulse rounded-lg bg-muted" />
              </div>
            ))}
          </div>
        </>
      )}

      {variant === "table" && (
        <div className="rounded-xl border bg-card">
          <div className="flex items-center gap-3 border-b p-4">
            <div className="h-8 w-48 animate-pulse rounded bg-muted" />
            <div className="ml-auto h-8 w-24 animate-pulse rounded bg-muted" />
          </div>
          {[...Array(8)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-b p-4 last:border-0">
              <div className="h-4 w-4 animate-pulse rounded bg-muted" />
              <div className="h-4 w-32 animate-pulse rounded bg-muted" />
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
              <div className="ml-auto h-4 w-16 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      )}

      {variant === "detail" && (
        <>
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 animate-pulse rounded-full bg-muted" />
            <div className="space-y-2">
              <div className="h-5 w-48 animate-pulse rounded bg-muted" />
              <div className="h-3 w-32 animate-pulse rounded bg-muted" />
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border bg-card p-5 space-y-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-40 animate-pulse rounded bg-muted" />
                </div>
              ))}
            </div>
            <div className="rounded-xl border bg-card p-5 space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-40 animate-pulse rounded bg-muted" />
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {variant === "form" && (
        <div className="rounded-xl border bg-card p-6 space-y-6 max-w-2xl">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 w-24 animate-pulse rounded bg-muted" />
              <div className="h-9 w-full animate-pulse rounded-md bg-muted" />
            </div>
          ))}
          <div className="h-9 w-32 animate-pulse rounded-md bg-muted" />
        </div>
      )}
    </div>
  );
}
