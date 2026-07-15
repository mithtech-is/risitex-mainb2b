"use client";

import * as React from "react";

/**
 * Cursor-revealed weave — the signature background motion.
 *
 * A warp/weft grid that is invisible until the pointer passes, then surfaces
 * faintly and trails it with an eased lag (like cloth catching the light under
 * a hand). Textile-native rather than generic particles.
 *
 * Drop inside any `relative` section; it fills the parent and never takes
 * pointer events. Honours prefers-reduced-motion (renders nothing), and only
 * runs its rAF loop while the pointer is actually moving.
 *
 * NB the mask uses CSS vars set from JS — Tailwind can't express a
 * cursor-positioned mask, so the paint is inline on purpose.
 */
export function WeaveCursor({
  /** Reveal radius in px. */
  radius = 200,
  /** Grid pitch in px. */
  pitch = 13,
  className = "",
}: {
  radius?: number;
  pitch?: number;
  className?: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [on, setOn] = React.useState(false);

  React.useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    setOn(true);
    const el = ref.current;
    const host = el?.parentElement;
    if (!el || !host) return;

    let tx = -900, ty = -900, cx = -900, cy = -900, raf = 0;
    const loop = () => {
      cx += (tx - cx) * 0.12;
      cy += (ty - cy) * 0.12;
      el.style.setProperty("--mx", `${cx}px`);
      el.style.setProperty("--my", `${cy}px`);
      raf =
        Math.abs(tx - cx) > 0.5 || Math.abs(ty - cy) > 0.5
          ? requestAnimationFrame(loop)
          : 0;
    };
    const move = (e: MouseEvent) => {
      const r = host.getBoundingClientRect();
      tx = e.clientX - r.left;
      ty = e.clientY - r.top;
      if (!raf) raf = requestAnimationFrame(loop);
    };
    const leave = () => {
      tx = -900;
      ty = -900;
      if (!raf) raf = requestAnimationFrame(loop);
    };

    host.addEventListener("mousemove", move);
    host.addEventListener("mouseleave", leave);
    return () => {
      host.removeEventListener("mousemove", move);
      host.removeEventListener("mouseleave", leave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  if (!on) return null;

  const mask = `radial-gradient(${radius}px circle at var(--mx, -900px) var(--my, -900px), #000 0%, rgba(0,0,0,0.3) 48%, transparent 74%)`;

  return (
    <div
      ref={ref}
      aria-hidden
      className={`pointer-events-none absolute inset-0 z-0 opacity-[0.7] ${className}`}
      style={{
        backgroundImage: `repeating-linear-gradient(90deg, var(--text-primary) 0 1px, transparent 1px ${pitch}px), repeating-linear-gradient(0deg, var(--text-primary) 0 1px, transparent 1px ${pitch}px)`,
        WebkitMaskImage: mask,
        maskImage: mask,
      }}
    />
  );
}
