"use client";

import { createAnnouncement } from "@/app/actions/hriq/onboarding";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function AnnouncementActions() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    startTransition(async () => {
      try {
        await createAnnouncement({
          title: fd.get("title") as string,
          content: fd.get("content") as string,
          priority: (fd.get("priority") as string) || "normal",
          targetDepartment: (fd.get("targetDepartment") as string) || undefined,
        });
        setOpen(false);
        setError(null);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create");
      }
    });
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
        New Announcement
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-xl border bg-card p-6 shadow-lg">
        <h2 className="text-lg font-semibold">New Announcement</h2>
        {error && <div className="mt-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="text-sm font-medium">Title *</label>
            <input name="title" required className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium">Content *</label>
            <textarea name="content" required rows={4} className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Priority</label>
              <select name="priority" defaultValue="normal" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Target Department</label>
              <input name="targetDepartment" placeholder="All departments" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setOpen(false)} className="h-9 rounded-md border px-4 text-sm font-medium hover:bg-accent">Cancel</button>
            <button type="submit" disabled={isPending} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {isPending ? "Creating..." : "Publish"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
