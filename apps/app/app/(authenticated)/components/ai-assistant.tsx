// @ts-nocheck
"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";

function DogIcon({ className }) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="none">
      <circle cx="50" cy="54" r="28" fill="white" />
      <ellipse cx="28" cy="32" rx="12" ry="18" fill="#f97316" transform="rotate(-15, 28, 32)" />
      <ellipse cx="29" cy="34" rx="7" ry="12" fill="#fdba74" transform="rotate(-15, 29, 34)" />
      <ellipse cx="72" cy="32" rx="12" ry="18" fill="#f97316" transform="rotate(15, 72, 32)" />
      <ellipse cx="71" cy="34" rx="7" ry="12" fill="#fdba74" transform="rotate(15, 71, 34)" />
      <circle cx="50" cy="54" r="26" fill="white" />
      <circle cx="40" cy="50" r="4" fill="#1e1b4b" />
      <circle cx="60" cy="50" r="4" fill="#1e1b4b" />
      <circle cx="41.5" cy="48.5" r="1.5" fill="white" />
      <circle cx="61.5" cy="48.5" r="1.5" fill="white" />
      <ellipse cx="50" cy="60" rx="5" ry="3.5" fill="#1e1b4b" />
      <path d="M50 63.5 C50 63.5 44 68 42 66" stroke="#1e1b4b" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <path d="M50 63.5 C50 63.5 56 68 58 66" stroke="#1e1b4b" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <ellipse cx="50" cy="67" rx="3" ry="4" fill="#f87171" />
      <circle cx="34" cy="58" r="4" fill="#fdba74" opacity="0.5" />
      <circle cx="66" cy="58" r="4" fill="#fdba74" opacity="0.5" />
    </svg>
  );
}

// ─── Tool name → human-readable label ─────────────────────────────────────
const TOOL_LABELS = {
  searchEmployees: "Searching contractors",
  getEmployeeDetail: "Loading profile",
  getEmployeeTimesheets: "Checking timesheets",
  getEmployeePayments: "Checking payments",
  getEmployeeDocuments: "Loading documents",
  getStats: "Pulling stats",
  getTimesheetInfo: "Checking timesheets",
  getOnboardingPipeline: "Loading pipeline",
  getTimeOffRequests: "Checking time off",
  getExpenseReports: "Loading expenses",
  getPayRunInfo: "Loading pay run",
  getPayments: "Checking payments",
  getOrganizations: "Loading orgs",
  getAuditLog: "Reading audit log",
  getLoginActivity: "Checking login activity",
  runReadOnlyQuery: "Running query",
  resetPassword: "Resetting password",
  deactivateAccount: "Deactivating account",
  reactivateAccount: "Reactivating account",
  updateEmployeeField: "Updating record",
  clearPaymentGate: "Clearing payment gate",
  changeEmployeeRole: "Changing role",
  markPaymentPaid: "Marking paid",
  initiateOffboarding: "Starting offboarding",
  approveTimesheet: "Approving timesheet",
  rejectTimesheet: "Rejecting timesheet",
  approveTimeOff: "Approving time off",
  rejectTimeOff: "Rejecting time off",
  unapproveTimesheet: "Unapproving timesheet",
  lockTimesheetPeriod: "Locking period",
  unlockTimesheetPeriod: "Unlocking period",
  approveExpenseReport: "Approving expense",
};

// ─── Skeleton shimmer for "thinking" state ────────────────────────────────
function SkeletonBubble() {
  return (
    <div className="flex justify-start items-end gap-2">
      <div className="max-w-[85%] rounded-xl rounded-bl-sm bg-muted px-3.5 py-2.5 space-y-2 overflow-hidden">
        <div className="ai-skeleton h-3 w-48 rounded" />
        <div className="ai-skeleton h-3 w-36 rounded" />
        <div className="ai-skeleton h-3 w-52 rounded" />
      </div>
    </div>
  );
}

// ─── Tool call chip ───────────────────────────────────────────────────────
function ToolChip({ toolName, isActive }) {
  const label = TOOL_LABELS[toolName] || toolName;
  return (
    <div className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all duration-300 ${
      isActive
        ? "bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/20"
        : "bg-muted text-muted-foreground border border-transparent"
    }`}>
      {isActive ? (
        <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeDashoffset="8" strokeLinecap="round" />
        </svg>
      ) : (
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
      {label}
    </div>
  );
}

// ─── Markdown-lite renderer ───────────────────────────────────────────────
function RenderText({ text }) {
  if (!text) return null;
  // Split into lines, handle **bold**, bullet lists, and code
  const lines = text.split("\n");
  const elements = [];
  let i = 0;
  for (const line of lines) {
    i++;
    if (!line.trim()) { elements.push(<div key={i} className="h-1.5" />); continue; }
    // Bold
    const formatted = line.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    // Inline code
    const withCode = formatted.replace(/`([^`]+)`/g, '<code class="rounded bg-background/80 px-1 py-0.5 text-[12px] font-mono">$1</code>');
    // Bullet points
    if (/^[-•]\s/.test(line.trim())) {
      elements.push(
        <div key={i} className="flex gap-1.5 pl-1">
          <span className="text-muted-foreground mt-[1px]">•</span>
          <span dangerouslySetInnerHTML={{ __html: withCode.replace(/^[-•]\s*/, "") }} />
        </div>
      );
    } else {
      elements.push(<div key={i} dangerouslySetInnerHTML={{ __html: withCode }} />);
    }
  }
  return <div className="space-y-0.5">{elements}</div>;
}

// ─── Single message bubble ────────────────────────────────────────────────
function MessageBubble({ message, isLatest, isStreaming }) {
  const isUser = message.role === "user";
  const parts = message.parts || [];

  // Extract text and tool-use parts
  const textParts = parts.filter((p) => p.type === "text" && p.text?.trim());
  const toolParts = parts.filter((p) => p.type === "tool-invocation");
  const text = textParts.map((p) => p.text).join("") || "";
  const hasText = text.trim().length > 0;

  // Determine which tools are still running
  const activeTools = toolParts.filter((t) => t.state === "call" || t.state === "partial-call");
  const completedTools = toolParts.filter((t) => t.state === "result");

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-xl rounded-br-sm bg-primary text-primary-foreground px-3.5 py-2.5 text-sm leading-relaxed">
          {text || "..."}
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] space-y-2">
        {/* Tool call chips */}
        {toolParts.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {toolParts.map((t, idx) => (
              <ToolChip
                key={`${t.toolName}-${idx}`}
                toolName={t.toolName}
                isActive={t.state === "call" || t.state === "partial-call"}
              />
            ))}
          </div>
        )}

        {/* Text content */}
        {hasText && (
          <div className={`rounded-xl rounded-bl-sm bg-muted px-3.5 py-2.5 text-sm leading-relaxed transition-opacity duration-150 ${
            isStreaming && isLatest ? "ai-streaming" : ""
          }`}>
            <RenderText text={text} />
          </div>
        )}

        {/* If tools are running but no text yet, show skeleton */}
        {!hasText && activeTools.length > 0 && isLatest && (
          <div className="rounded-xl rounded-bl-sm bg-muted px-3.5 py-2.5 space-y-2 overflow-hidden">
            <div className="ai-skeleton h-3 w-48 rounded" />
            <div className="ai-skeleton h-3 w-36 rounded" />
          </div>
        )}
      </div>
    </div>
  );
}

const WELCOME_MESSAGE = {
  id: "welcome",
  role: "assistant",
  parts: [{ type: "text", text: "Hey! I'm the RL Assistant. I can look up contractors, manage timesheets, reset passwords, run payroll queries, and more. What do you need?" }],
};

const QUICK_ACTIONS = [
  "How many active contractors?",
  "Who hasn't submitted timesheets?",
  "Show onboarding pipeline",
  "Show pending time off",
  "Show recent audit log",
];

export function AiAssistant() {
  const [open, setOpen] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const [input, setInput] = useState("");
  const [chatError, setChatError] = useState(null);

  const { messages, sendMessage, setMessages, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/ai/chat" }),
    messages: [WELCOME_MESSAGE],
    onError: (err) => {
      console.error("[AI Chat]", err);
      setChatError(err.message || "Something went wrong");
    },
    onFinish: () => setChatError(null),
  });

  const isLoading = status === "submitted" || status === "streaming";
  const isStreaming = status === "streaming";

  // Smooth scroll on new content
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages, isLoading]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setOpen((p) => !p); }
      if (e.key === "Escape" && open) setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const handleClear = useCallback(() => {
    setMessages([WELCOME_MESSAGE]);
    setChatError(null);
  }, [setMessages]);

  const handleSubmit = useCallback((e) => {
    e?.preventDefault?.();
    if (!input.trim() || isLoading) return;
    setChatError(null);
    sendMessage({ text: input.trim() });
    setInput("");
  }, [input, isLoading, sendMessage]);

  const handleQuick = useCallback((q) => {
    setChatError(null);
    sendMessage({ text: q });
  }, [sendMessage]);

  // Check if last message is from user and we're in "submitted" (waiting for first byte)
  const showSkeleton = status === "submitted" && messages.length > 0 && messages[messages.length - 1]?.role === "user";

  return (
    <>
      {/* ─── Global styles for skeleton + streaming ─── */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes ai-shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .ai-skeleton {
          background: linear-gradient(
            90deg,
            color-mix(in oklch, var(--muted-foreground) 8%, transparent) 25%,
            color-mix(in oklch, var(--muted-foreground) 22%, transparent) 50%,
            color-mix(in oklch, var(--muted-foreground) 8%, transparent) 75%
          );
          background-size: 200% 100%;
          animation: ai-shimmer 1.5s ease-in-out infinite;
        }
        .ai-streaming > div:last-child > div:last-child::after {
          content: "▋";
          animation: ai-blink 0.8s steps(2) infinite;
          color: color-mix(in oklch, var(--muted-foreground) 60%, transparent);
          font-weight: 300;
          margin-left: 1px;
        }
        @keyframes ai-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}} />

      {/* ─── Floating button ─── */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-purple-600 text-white shadow-lg shadow-orange-500/20 hover:shadow-xl hover:shadow-orange-500/30 transition-all hover:scale-105 active:scale-95"
          title="RL Assistant (⌘K)"
        >
          <DogIcon className="h-9 w-9" />
        </button>
      )}

      {/* ─── Chat panel ─── */}
      {open && (
        <div className="fixed bottom-5 right-5 z-50 flex w-[420px] max-h-[600px] flex-col rounded-2xl border border-border bg-card shadow-2xl animate-in slide-in-from-bottom-4 fade-in duration-200">
          {/* Header */}
          <div className="flex items-center justify-between rounded-t-2xl border-b px-4 py-3 bg-gradient-to-r from-orange-500/10 to-purple-500/10">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-purple-600 p-0.5">
                <DogIcon className="h-6 w-6" />
              </div>
              <div>
                <div className="text-sm font-semibold">RL Assistant</div>
                <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                  {isLoading ? (
                    <>
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-orange-500" />
                      </span>
                      <span className="text-orange-600 dark:text-orange-400">Working...</span>
                    </>
                  ) : (
                    "Powered by Claude"
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={handleClear} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors" title="Clear chat">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" /></svg>
              </button>
              <button onClick={() => setOpen(false)} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors" title="Close (Esc)">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[300px] max-h-[440px] scroll-smooth">
            {messages.map((m, idx) => (
              <MessageBubble
                key={m.id}
                message={m}
                isLatest={idx === messages.length - 1}
                isStreaming={isStreaming}
              />
            ))}
            {showSkeleton && <SkeletonBubble />}
          </div>

          {/* Quick actions */}
          {messages.length <= 1 && (
            <div className="px-4 pb-2 flex flex-wrap gap-1.5">
              {QUICK_ACTIONS.map((q) => (
                <button key={q} onClick={() => handleQuick(q)} className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Error */}
          {chatError && (
            <div className="mx-4 mb-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400 flex items-center gap-2">
              <svg className="h-3.5 w-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {chatError}
            </div>
          )}

          {/* Input */}
          <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t px-3 py-3">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isLoading ? "Waiting for response..." : "Ask anything — reset passwords, timesheets, payroll..."}
              disabled={isLoading}
              className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 transition-all"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-30 transition-all active:scale-95"
            >
              {isLoading ? (
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeDashoffset="8" strokeLinecap="round" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" /></svg>
              )}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
