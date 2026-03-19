"use client";

import { GamesHub } from "./games-hub";

/**
 * Team Games widget — wraps the full GamesHub in a compact, scrollable view
 * that works inside the 380×440 draggable widget window.
 */
export function TeamGamesApp() {
  return (
    <div className="h-full overflow-y-auto overflow-x-hidden [&_.max-w-lg]:max-w-full [&_.max-w-2xl]:max-w-full [&_.max-w-3xl]:max-w-full [&_.max-w-md]:max-w-full" style={{ fontSize: "0.92em" }}>
      <style>{`
        /* Compact overrides for widget mode */
        .widget-games-root .grid { gap: 0.5rem !important; }
        .widget-games-root [style*="height: 420px"] { height: 320px !important; }
        .widget-games-root [style*="height: 420"] { height: 320px !important; }
      `}</style>
      <div className="widget-games-root">
        <GamesHub />
      </div>
    </div>
  );
}
