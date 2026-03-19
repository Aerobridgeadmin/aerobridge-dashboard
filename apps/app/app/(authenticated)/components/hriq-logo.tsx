"use client";

import { useEffect, useState } from "react";

/**
 * Animated HRIQ logo – letters drop in one-by-one from above with a sleek,
 * modern feel. Uses pure CSS keyframes via inline <style> to avoid any
 * external dependency.
 */
export function HriqLogo() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Small delay so the animation triggers after the page paints
    const id = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const letters = ["H", "R", "I", "Q"];

  return (
    <>
      {/* Scoped keyframes */}
      <style>{`
        @keyframes hriq-drop {
          0% {
            opacity: 0;
            transform: translateY(-48px) scale(0.85);
            filter: blur(6px);
          }
          60% {
            opacity: 1;
            transform: translateY(4px) scale(1.02);
            filter: blur(0px);
          }
          80% {
            transform: translateY(-2px) scale(0.99);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
            filter: blur(0px);
          }
        }

        @keyframes hriq-line-grow {
          0% { transform: scaleX(0); opacity: 0; }
          100% { transform: scaleX(1); opacity: 1; }
        }

        @keyframes hriq-subtitle-fade {
          0% { opacity: 0; transform: translateY(6px); }
          100% { opacity: 1; transform: translateY(0); }
        }

        @keyframes hriq-glow {
          0%, 100% { text-shadow: 0 0 20px rgba(255,255,255,0.0); }
          50% { text-shadow: 0 0 30px rgba(255,255,255,0.08); }
        }
      `}</style>

      <div className="flex flex-col items-center justify-center py-2 select-none">
        {/* Letter container */}
        <div className="flex items-baseline gap-3 sm:gap-5">
          {letters.map((letter, i) => (
            <span
              key={letter}
              className="text-6xl sm:text-7xl md:text-8xl font-black"
              style={{
                opacity: show ? 1 : 0,
                animation: show
                  ? `hriq-drop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 0.1}s both, hriq-glow 4s ease-in-out ${0.8 + i * 0.1}s infinite`
                  : "none",
                background:
                  letter === "Q"
                    ? "linear-gradient(135deg, #00B0BB 0%, #00BBBB 30%, #18E299 65%, #00DB65 100%)"
                    : "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.55) 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                fontFamily:
                  "'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
                letterSpacing: "0.12em",
              }}
            >
              {letter}
            </span>
          ))}
        </div>

        {/* Accent line */}
        <div
          className="mt-1.5 h-[2px] w-28 sm:w-36 rounded-full"
          style={{
            background: "linear-gradient(90deg, transparent, #00B0BB, #00DB65, transparent)",
            opacity: show ? 1 : 0,
            animation: show
              ? "hriq-line-grow 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.55s both"
              : "none",
            transformOrigin: "center",
          }}
        />

        {/* Tagline */}
        <span
          className="mt-1 text-[11px] font-medium tracking-[0.25em] text-muted-foreground/50"
          style={{
            opacity: show ? 1 : 0,
            animation: show
              ? "hriq-subtitle-fade 0.4s ease-out 0.75s both"
              : "none",
          }}
        >
          by Remote Leverage
        </span>
      </div>
    </>
  );
}
