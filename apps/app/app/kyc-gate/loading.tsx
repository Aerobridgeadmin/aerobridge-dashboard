export default function KycGateLoading() {
  return (
    <div className="flex min-h-screen flex-col">
      <header
        className="w-full"
        style={{
          background: "linear-gradient(135deg, #f97316 0%, #9333ea 100%)",
        }}
      >
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-6 py-5">
          <div className="h-11 w-11 animate-pulse rounded-xl bg-white/20" />
          <div>
            <div className="h-5 w-32 animate-pulse rounded bg-white/20" />
            <div className="mt-1 h-3 w-24 animate-pulse rounded bg-white/10" />
          </div>
        </div>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 py-10">
        <div className="w-full max-w-xl">
          <div className="rounded-xl border bg-white p-8 text-center shadow-sm">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-orange-200 border-t-orange-500" />
            <div className="mx-auto h-5 w-48 animate-pulse rounded bg-gray-200" />
            <div className="mx-auto mt-3 h-3 w-64 animate-pulse rounded bg-gray-100" />
          </div>
        </div>
      </main>
    </div>
  );
}
