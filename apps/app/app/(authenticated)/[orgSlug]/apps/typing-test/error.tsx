"use client";
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="text-center">
        <p className="text-sm text-muted-foreground">Something went wrong loading this app.</p>
        <button onClick={reset} className="mt-3 h-8 rounded-md bg-primary px-4 text-xs font-medium text-primary-foreground hover:bg-primary/90">Try again</button>
      </div>
    </div>
  );
}
