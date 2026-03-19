"use client";

import { useEffect, useRef } from "react";

/**
 * Lightweight animated star field background for all dashboards.
 * Uses a single canvas element — no Three.js, no heavy deps.
 *
 * Props:
 *  - title: large text overlay (e.g. org name)
 *  - subtitle: smaller text below
 *  - accentColor: gradient accent color (default teal)
 *  - height: CSS height (default "32vh")
 */
export function DashboardHero({
  title,
  subtitle,
  logoUrl,
  website,
  accentColor = "0,176,187",
  height = "32vh",
  children,
}: {
  title?: string;
  subtitle?: string;
  logoUrl?: string | null;
  website?: string | null;
  accentColor?: string;
  height?: string;
  children?: React.ReactNode;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let stars: { x: number; y: number; r: number; a: number; speed: number; twinkle: number }[] = [];

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio, 2);
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx.scale(dpr, dpr);
      initStars();
    };

    const initStars = () => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      const count = Math.min(Math.floor((w * h) / 800), 300);
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.2 + 0.3,
        a: Math.random() * 0.6 + 0.1,
        speed: Math.random() * 0.0008 + 0.0003,
        twinkle: Math.random() * Math.PI * 2,
      }));
    };

    let time = 0;
    const draw = () => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      ctx.clearRect(0, 0, w, h);
      time += 1;

      for (const s of stars) {
        s.twinkle += s.speed * 60;
        const flicker = 0.5 + 0.5 * Math.sin(s.twinkle);
        const alpha = s.a * flicker;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.fill();
      }

      animId = requestAnimationFrame(draw);
    };

    resize();
    draw();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{ height, minHeight: "220px" }}
    >
      {/* Gradient backdrop */}
      <div
        className="absolute inset-0 z-0"
        style={{
          background: `radial-gradient(ellipse at 50% 60%, rgba(${accentColor},0.15) 0%, rgba(${accentColor},0.06) 50%, transparent 80%)`,
        }}
      />

      {/* Star canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-[1] w-full h-full"
        style={{ pointerEvents: "none" }}
      />

      {/* Soft vignette */}
      <div
        className="absolute inset-0 z-[2] pointer-events-none"
        style={{
          background: "linear-gradient(to top, hsl(var(--background)) 0%, transparent 40%)",
        }}
      />

      {/* Overlay content */}
      <div className="absolute inset-0 z-[3] flex flex-col justify-end pointer-events-none">
        <div className="px-6 sm:px-8 pb-4">
          <div className="flex items-end gap-4">
            {logoUrl && (
              <img src={logoUrl} alt="" className="h-14 w-14 rounded-xl object-cover border-2 border-foreground/10 shadow-lg pointer-events-auto" />
            )}
            <div>
              {title && (
                <h1 className="text-4xl sm:text-5xl md:text-6xl font-black select-none text-foreground">
                  {title}
                </h1>
              )}
              <div className="flex items-center gap-3 mt-1">
                {subtitle && (
                  <p className="text-sm text-muted-foreground select-none">{subtitle}</p>
                )}
                {website && (
                  <a href={website.startsWith("http") ? website : `https://${website}`} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground/60 hover:text-muted-foreground underline underline-offset-2 pointer-events-auto transition-colors">{website.replace(/^https?:\/\//, "")}</a>
                )}
              </div>
            </div>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
