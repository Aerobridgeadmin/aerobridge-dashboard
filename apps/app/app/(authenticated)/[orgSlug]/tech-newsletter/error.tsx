"use client";
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="rounded-xl border bg-card p-8 text-center max-w-md">
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <p className="mt-2 text-sm text-muted-foreground">{error.message || "An unexpected error occurred."}</p>
        <button onClick={reset} className="mt-4 h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">Try Again</button>
      </div>
    </div>
  );
}
