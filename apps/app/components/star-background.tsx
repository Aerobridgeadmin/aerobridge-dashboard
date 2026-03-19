"use client";

import { useEffect, useRef } from "react";

/**
 * Lightweight canvas-based star background matching the globe dashboard.
 * Uses pure 2D canvas instead of Three.js for pages that don't need the globe.
 *
 * Features:
 *  - 600 twinkling stars with varying sizes and warm-white tones
 *  - Subtle nebula glow (teal/green radial gradients)
 *  - Slow drift animation at ~30fps
 *  - Minimal CPU/GPU usage
 */
export function StarBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animFrame: number;
    let w = 0;
    let h = 0;

    // Responsive canvas sizing
    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    resize();
    window.addEventListener("resize", resize);

    // Generate stars
    const STAR_COUNT = 600;
    const stars = Array.from({ length: STAR_COUNT }, () => {
      const roll = Math.random();
      return {
        x: Math.random(),
        y: Math.random(),
        // 92% tiny, 8% bigger accent stars
        r: roll < 0.92 ? 0.3 + Math.random() * 0.6 : 1 + Math.random() * 1.5,
        baseOpacity: 0.15 + Math.random() * 0.55,
        // Twinkle speed offset
        phase: Math.random() * Math.PI * 2,
        speed: 0.3 + Math.random() * 0.8,
        // Warm-white color temperature variation
        temp: Math.random(),
      };
    });

    function draw(t: number) {
      ctx!.clearRect(0, 0, w, h);

      // Background fill
      ctx!.fillStyle = "#0a0c10";
      ctx!.fillRect(0, 0, w, h);

      // Nebula glows
      const g1 = ctx!.createRadialGradient(w * 0.3, h * 0.25, 0, w * 0.3, h * 0.25, w * 0.5);
      g1.addColorStop(0, "rgba(0,176,187,0.06)");
      g1.addColorStop(0.5, "rgba(0,176,187,0.02)");
      g1.addColorStop(1, "transparent");
      ctx!.fillStyle = g1;
      ctx!.fillRect(0, 0, w, h);

      const g2 = ctx!.createRadialGradient(w * 0.7, h * 0.65, 0, w * 0.7, h * 0.65, w * 0.4);
      g2.addColorStop(0, "rgba(0,219,101,0.04)");
      g2.addColorStop(0.5, "rgba(0,219,101,0.015)");
      g2.addColorStop(1, "transparent");
      ctx!.fillStyle = g2;
      ctx!.fillRect(0, 0, w, h);

      const g3 = ctx!.createRadialGradient(w * 0.5, h * 0.4, 0, w * 0.5, h * 0.4, w * 0.35);
      g3.addColorStop(0, "rgba(26,16,64,0.05)");
      g3.addColorStop(1, "transparent");
      ctx!.fillStyle = g3;
      ctx!.fillRect(0, 0, w, h);

      // Stars
      const sec = t * 0.001;

      for (const star of stars) {
        const twinkle = Math.sin(sec * star.speed + star.phase) * 0.35 + 0.65;
        const opacity = star.baseOpacity * twinkle;

        // Warm white with subtle temperature
        const r = Math.round(235 + star.temp * 20);
        const g = Math.round(228 + star.temp * 10);
        const b = Math.round(240 + star.temp * 15);

        ctx!.beginPath();
        ctx!.arc(star.x * w, star.y * h, star.r, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(${r},${g},${b},${opacity})`;
        ctx!.fill();

        // Glow for larger stars
        if (star.r > 1) {
          const glow = ctx!.createRadialGradient(
            star.x * w, star.y * h, 0,
            star.x * w, star.y * h, star.r * 3
          );
          glow.addColorStop(0, `rgba(${r},${g},${b},${opacity * 0.3})`);
          glow.addColorStop(1, "transparent");
          ctx!.beginPath();
          ctx!.arc(star.x * w, star.y * h, star.r * 3, 0, Math.PI * 2);
          ctx!.fillStyle = glow;
          ctx!.fill();
        }
      }

      animFrame = requestAnimationFrame(draw);
    }

    animFrame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animFrame);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 -z-10"
      style={{ width: "100vw", height: "100vh" }}
      aria-hidden="true"
    />
  );
}
