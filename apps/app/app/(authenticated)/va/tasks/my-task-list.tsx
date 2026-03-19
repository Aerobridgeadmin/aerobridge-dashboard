"use client";

import { completeTask } from "@/app/actions/hriq/tasks";
import type { Task } from "@repo/database";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function MyTaskList({ tasks }: { tasks: Task[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const pending = tasks.filter((t) => t.status !== "completed");
  const completed = tasks.filter((t) => t.status === "completed");

  const handleComplete = (taskId: string) => {
    startTransition(async () => {
      await completeTask(taskId);
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Open Tasks ({pending.length})</h2>
        <div className="mt-3 space-y-2">
          {pending.map((task) => (
            <div key={task.id} className="flex items-center justify-between rounded-xl border bg-card p-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{task.title}</span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs capitalize">{task.taskType}</span>
                </div>
                {task.description && <p className="mt-1 text-sm text-muted-foreground">{task.description}</p>}
                {task.dueDate && (
                  <p className={`mt-1 text-xs ${new Date(task.dueDate) < new Date() ? "text-red-600" : "text-muted-foreground"}`}>
                    Due: {new Date(task.dueDate).toLocaleDateString()}
                  </p>
                )}
              </div>
              <button type="button" onClick={() => handleComplete(task.id)} disabled={isPending} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                Complete
              </button>
            </div>
          ))}
          {pending.length === 0 && <div className="py-6 text-center text-muted-foreground">All tasks complete!</div>}
        </div>
      </div>

      {completed.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-muted-foreground">Completed ({completed.length})</h2>
          <div className="mt-2 space-y-1">
            {completed.map((task) => (
              <div key={task.id} className="flex items-center justify-between rounded-lg border p-3 opacity-60">
                <span className="text-sm line-through">{task.title}</span>
                <span className="text-xs text-muted-foreground">{task.completedAt ? new Date(task.completedAt).toLocaleDateString() : ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
