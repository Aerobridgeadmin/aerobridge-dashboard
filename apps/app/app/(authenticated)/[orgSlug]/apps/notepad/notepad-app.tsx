"use client";

import { useState, useCallback, useRef, useEffect } from "react";

type Note = { id: string; title: string; content: string; updatedAt: number };

function genId() { return Math.random().toString(36).slice(2, 10); }

export function NotepadApp() {
  const [notes, setNotes] = useState<Note[]>(() => [
    { id: genId(), title: "Untitled", content: "", updatedAt: Date.now() },
  ]);
  const [activeId, setActiveId] = useState(notes[0].id);
  const [wordCount, setWordCount] = useState(0);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const active = notes.find((n) => n.id === activeId) ?? notes[0];

  const updateNote = useCallback((field: "title" | "content", value: string) => {
    setNotes((prev) =>
      prev.map((n) => (n.id === activeId ? { ...n, [field]: value, updatedAt: Date.now() } : n))
    );
    if (field === "content") {
      const words = value.trim().split(/\s+/).filter(Boolean).length;
      setWordCount(words);
    }
  }, [activeId]);

  const addNote = () => {
    const n: Note = { id: genId(), title: "Untitled", content: "", updatedAt: Date.now() };
    setNotes((prev) => [...prev, n]);
    setActiveId(n.id);
  };

  const deleteNote = (id: string) => {
    if (notes.length <= 1) return;
    setNotes((prev) => {
      const next = prev.filter((n) => n.id !== id);
      if (activeId === id) setActiveId(next[0].id);
      return next;
    });
  };

  const downloadNote = () => {
    const blob = new Blob([active.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${active.title || "note"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    const words = active.content.trim().split(/\s+/).filter(Boolean).length;
    setWordCount(words);
  }, [activeId]); // eslint-disable-line

  return (
    <div className="flex flex-1 flex-col p-4 gap-3">
      {/* Tab bar */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {notes.map((n) => (
          <button
            key={n.id}
            onClick={() => setActiveId(n.id)}
            className={`group flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              n.id === activeId
                ? "bg-primary text-primary-foreground"
                : "bg-muted/50 text-muted-foreground hover:bg-muted"
            }`}
          >
            <span className="max-w-[120px] truncate">{n.title || "Untitled"}</span>
            {notes.length > 1 && (
              <span
                onClick={(e) => { e.stopPropagation(); deleteNote(n.id); }}
                className="ml-1 rounded-full p-0.5 opacity-0 group-hover:opacity-100 hover:bg-white/20 transition-opacity cursor-pointer"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </span>
            )}
          </button>
        ))}
        <button
          onClick={addNote}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-dashed text-muted-foreground hover:bg-muted transition-colors"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
        </button>
      </div>

      {/* Title */}
      <input
        type="text"
        value={active.title}
        onChange={(e) => updateNote("title", e.target.value)}
        placeholder="Note title…"
        className="text-lg font-semibold bg-transparent border-none outline-none placeholder:text-muted-foreground/40"
      />

      {/* Editor */}
      <textarea
        ref={textRef}
        value={active.content}
        onChange={(e) => updateNote("content", e.target.value)}
        placeholder="Start typing your note…"
        className="flex-1 min-h-[400px] resize-none rounded-xl border bg-card p-4 text-sm leading-relaxed font-mono placeholder:text-muted-foreground/30 focus:ring-1 focus:ring-primary focus:border-primary focus:outline-none"
        spellCheck
      />

      {/* Status bar */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground px-1">
        <div className="flex items-center gap-4">
          <span>{wordCount} word{wordCount !== 1 ? "s" : ""}</span>
          <span>{active.content.length} char{active.content.length !== 1 ? "s" : ""}</span>
          <span>{active.content.split("\n").length} line{active.content.split("\n").length !== 1 ? "s" : ""}</span>
        </div>
        <div className="flex items-center gap-2">
          <span>Last edit: {new Date(active.updatedAt).toLocaleTimeString()}</span>
          <button onClick={downloadNote} className="rounded border px-2 py-0.5 text-[10px] hover:bg-muted transition-colors">
            Download .txt
          </button>
        </div>
      </div>
    </div>
  );
}
