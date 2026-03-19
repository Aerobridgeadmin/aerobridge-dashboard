import { Skeleton } from "@repo/design-system/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0 animate-in fade-in duration-200">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl border bg-card" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-xl border bg-card" />
    </div>
  );
}
