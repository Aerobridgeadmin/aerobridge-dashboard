export default function PipelineLoading() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div className="h-8 w-64 rounded-lg bg-muted animate-pulse" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border bg-card p-5 space-y-3">
            <div className="h-5 w-40 rounded bg-muted animate-pulse" />
            <div className="space-y-2">
              {[1, 2, 3].map((j) => (
                <div key={j} className="h-12 rounded-lg bg-muted/50 animate-pulse" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
