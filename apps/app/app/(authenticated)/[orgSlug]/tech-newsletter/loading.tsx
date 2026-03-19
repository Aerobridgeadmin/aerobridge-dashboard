export default function Loading() {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="flex items-center gap-3 text-muted-foreground">
        <img src="/logo.png" alt="Loading" width={28} height={28} className="animate-spin-slow rounded-md" />
        <span className="text-sm">Loading...</span>
      </div>
    </div>
  );
}
