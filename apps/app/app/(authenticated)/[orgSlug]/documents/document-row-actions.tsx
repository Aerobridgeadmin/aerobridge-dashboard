"use client";

import { deleteDocument } from "@/app/actions/hriq/documents";
import { useState, useTransition } from "react";
import { useErrorDialog } from "@/app/(authenticated)/components/error-dialog";

export function DocumentRowActions({
  documentId,
  fileUrl,
}: {
  documentId: string;
  fileUrl: string | null;
}) {
  const { showError } = useErrorDialog();
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleDelete = () => {
    startTransition(async () => {
      try {
        await deleteDocument(documentId);
      } catch (err) {
        showError({ title: "Delete Failed", message: err instanceof Error ? err.message : "Failed to delete document." });
      }
    });
  };

  return (
    <div className="flex items-center gap-2">
      {fileUrl ? (
        <a
          href={`/api/documents/view?id=${documentId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md border px-2.5 py-1 text-xs hover:bg-accent"
        >
          View
        </a>
      ) : (
        <span className="rounded-md border px-2.5 py-1 text-xs text-muted-foreground">
          No file
        </span>
      )}
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        disabled={isPending}
        className="rounded-md border border-red-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/30"
      >
        Delete
      </button>
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in duration-150">
          <div className="w-full max-w-sm rounded-xl border bg-card p-5 shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-200" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold">Delete Document</h3>
            <p className="mt-2 text-sm text-muted-foreground">Delete this document? This cannot be undone.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmOpen(false)} disabled={isPending} className="h-9 rounded-md border px-4 text-sm hover:bg-accent disabled:opacity-50">Cancel</button>
              <button
                type="button"
                onClick={() => {
                  setConfirmOpen(false);
                  handleDelete();
                }}
                disabled={isPending}
                className="h-9 rounded-md bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {isPending ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

