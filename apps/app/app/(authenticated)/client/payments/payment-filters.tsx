"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function PaymentFilters({ currentStatus, currentSearch }: { currentStatus?: string; currentSearch?: string }) {
  const router = useRouter();
  const [search, setSearch] = useState(currentSearch ?? "");

  const applyFilters = (status?: string, q?: string) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (q) params.set("q", q);
    router.push(`/client/payments?${params.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <form onSubmit={(e) => { e.preventDefault(); applyFilters(currentStatus, search); }} className="flex-1">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by contractor name..."
          className="flex h-9 w-full max-w-sm rounded-md border border-input bg-background px-3 text-sm"
        />
      </form>
      <select
        value={currentStatus ?? ""}
        onChange={(e) => applyFilters(e.target.value || undefined, search || undefined)}
        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
      >
        <option value="">All Statuses</option>
        <option value="pending">Pending</option>
        <option value="processing">Processing</option>
        <option value="completed">Completed</option>
        <option value="failed">Failed</option>
      </select>
      {(currentStatus || currentSearch) && (
        <button onClick={() => { setSearch(""); applyFilters(); }} className="h-9 rounded-md border px-3 text-xs hover:bg-accent">
          Clear
        </button>
      )}
    </div>
  );
}
