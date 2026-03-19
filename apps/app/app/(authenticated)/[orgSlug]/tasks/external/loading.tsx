export default function Loading() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div className="flex items-center gap-3">
        <img src="/logo.png" alt="Loading" width={28} height={28} className="animate-spin-slow rounded-md" />
        <div className="h-5 w-52 animate-pulse rounded bg-muted" />
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-20 animate-pulse rounded-xl border bg-card" />)}
      </div>
      <div className="h-10 w-full animate-pulse rounded-lg bg-muted" />
      <div className="h-64 animate-pulse rounded-xl border bg-card" />
      <div className="h-48 animate-pulse rounded-xl border bg-card" />
    </div>
  );
}
