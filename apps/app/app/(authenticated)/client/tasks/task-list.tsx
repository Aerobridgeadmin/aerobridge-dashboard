"use client";

import { completeTask, createTask } from "@/app/actions/hriq/tasks";
import type { Task } from "@repo/database";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type TaskWithEmployee = Task & {
  employee: { id: string; legalFirstName: string; legalLastName: string; employeeNumber: string };
};

type Contractor = { id: string; legalFirstName: string; legalLastName: string; employeeNumber: string };

export function TaskList({ tasks, contractors }: { tasks: TaskWithEmployee[]; contractors: Contractor[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showCreate, setShowCreate] = useState(false);

  const handleComplete = (taskId: string) => {
    startTransition(async () => {
      await completeTask(taskId);
      router.refresh();
    });
  };

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await createTask({
        employeeId: fd.get("employeeId") as string,
        title: fd.get("title") as string,
        description: (fd.get("description") as string) || undefined,
        taskType: (fd.get("taskType") as string) || "custom",
        dueDate: (fd.get("dueDate") as string) || undefined,
      });
      setShowCreate(false);
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Pending Tasks ({tasks.length})</h2>
        <button onClick={() => setShowCreate(!showCreate)} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          {showCreate ? "Cancel" : "+ Create Task"}
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="rounded-xl border bg-card p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Contractor *</label>
              <select name="employeeId" required defaultValue="" className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="" disabled>Select contractor...</option>
                {contractors.map((c) => (
                  <option key={c.id} value={c.id}>{c.legalFirstName} {c.legalLastName} ({c.employeeNumber})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Task Type</label>
              <select name="taskType" defaultValue="custom" className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="custom">Custom</option>
                <option value="onboarding">Onboarding</option>
                <option value="document_collection">Document Collection</option>
                <option value="training">Training</option>
                <option value="review">Review</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Title *</label>
            <input name="title" required placeholder="Task title" className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Description</label>
              <input name="description" placeholder="Optional details" className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium">Due Date</label>
              <input name="dueDate" type="date" className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" />
            </div>
          </div>
          <button type="submit" disabled={isPending} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {isPending ? "Creating..." : "Create Task"}
          </button>
        </form>
      )}

      {tasks.map((task) => (
        <div key={task.id} className="flex items-center justify-between rounded-xl border bg-card p-4">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">{task.title}</span>
              <span className="rounded bg-muted px-1.5 py-0.5 text-xs capitalize">{task.taskType}</span>
              {task.isBlocking && <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700 dark:bg-red-900 dark:text-red-200">Blocking</span>}
            </div>
            <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <Link href={`/client/employees/${task.employee.id}`} className="hover:underline">
                {task.employee.legalFirstName} {task.employee.legalLastName}
              </Link>
              <span>&middot;</span>
              <span>{task.employee.employeeNumber}</span>
              {task.dueDate && (
                <>
                  <span>&middot;</span>
                  <span className={new Date(task.dueDate) < new Date() ? "text-red-600" : ""}>
                    Due: {new Date(task.dueDate).toLocaleDateString()}
                  </span>
                </>
              )}
            </div>
          </div>
          <button type="button" onClick={() => handleComplete(task.id)} disabled={isPending} className="ml-4 rounded-md bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-50">
            Complete
          </button>
        </div>
      ))}

      {tasks.length === 0 && !showCreate && (
        <div className="py-12 text-center text-muted-foreground">
          No pending tasks. All caught up! Click &quot;+ Create Task&quot; to assign one.
        </div>
      )}
    </div>
  );
}
