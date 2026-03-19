"use client";

import { useEffect } from "react";

function isChunkLoadError(error: Error): boolean {
  const msg = error.message || "";
  return (
    msg.includes("Failed to load chunk") ||
    msg.includes("Loading chunk") ||
    msg.includes("ChunkLoadError") ||
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("MIME type") ||
    (msg.includes("from module") && msg.includes("_next/static/chunks"))
  );
}

/**
 * Force a hard reload that bypasses the browser cache.
 * Regular reload() can serve stale chunks from cache after a deploy.
 */
function hardReload() {
  if (typeof window === "undefined") return;
  // Navigate to same path with a cache-bust param to force fresh HTML
  const url = new URL(window.location.href);
  url.searchParams.set("_r", Date.now().toString());
  window.location.replace(url.toString());
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isChunk = isChunkLoadError(error);

  useEffect(() => {
    // Auto-reload once on chunk errors (stale deployment)
    if (isChunk && typeof window !== "undefined") {
      const key = "__chunk_error_reload";
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, "1");
        hardReload();
      } else {
        // Already tried auto-reload — clear flag so next navigation works
        sessionStorage.removeItem(key);
      }
    }
  }, [isChunk]);

  return (
    <html lang="en">
      <head>
        <style>{`
          @media (prefers-color-scheme: light) {
            body { background: #f9fafb !important; color: #111827 !important; }
            .ge-sub { color: #6b7280 !important; }
            .ge-btn { background: #ffffff !important; color: #111827 !important; border-color: #d1d5db !important; }
            .ge-btn:hover { background: #f3f4f6 !important; }
            .ge-icon { color: #ef4444 !important; }
          }
          @media (prefers-color-scheme: dark) {
            body { background: #0a0a0a !important; color: #f9fafb !important; }
            .ge-sub { color: #9ca3af !important; }
            .ge-btn { background: #1f2937 !important; color: #f9fafb !important; border-color: #374151 !important; }
            .ge-btn:hover { background: #374151 !important; }
            .ge-icon { color: #f87171 !important; }
          }
        `}</style>
      </head>
      <body style={{ margin: 0, fontFamily: "Inter, system-ui, -apple-system, sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 32 }}>
          <div style={{ textAlign: "center", maxWidth: 440 }}>
            <div className="ge-icon" style={{ fontSize: 48, marginBottom: 16 }}>{"\u26A0"}</div>
            <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
              {isChunk ? "App Updated" : "Something went wrong"}
            </h1>
            <p className="ge-sub" style={{ fontSize: 14, marginBottom: 24, lineHeight: 1.5 }}>
              {isChunk
                ? "A new version of HRIQ was deployed. Click below to load the latest version."
                : "An unexpected error occurred. Please try again."}
            </p>
            <button
              type="button"
              onClick={() => {
                if (isChunk) {
                  hardReload();
                } else {
                  reset();
                }
              }}
              className="ge-btn"
              style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid", cursor: "pointer", fontSize: 14, fontWeight: 600, transition: "background 0.15s" }}
            >
              {isChunk ? "Reload Now" : "Try again"}
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
