"use client";

import * as React from "react";

/**
 * Lightweight scroll-animation primitives — no external library, and safe by
 * design: content is rendered VISIBLE on the server. The reveal is a pure
 * progressive enhancement that only "arms" (hides, then fades in on scroll)
 * once the client has mounted — so with no JS, before hydration, or if
 * hydration ever fails, the content is simply shown. Above-the-fold elements
 * are never hidden. Only opacity/transform animate, so there is no layout
 * shift, and the text is always in the HTML for SEO.
 */

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

function usePrefersReducedMotion() {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return reduced;
}

export function Reveal({
  children,
  className,
  delay = 0,
  y = 18,
}: {
  children: React.ReactNode;
  className?: string;
  /** Stagger delay in ms. */
  delay?: number;
  /** Distance (px) the element slides up from. */
  y?: number;
}) {
  const reduced = usePrefersReducedMotion();
  const ref = React.useRef<HTMLDivElement>(null);
  // `armed` flips true only on the client, after mount. Until then everything
  // renders visible (SSR-safe). `shown` starts true so above-the-fold content
  // never flashes hidden.
  const [armed, setArmed] = React.useState(false);
  const [shown, setShown] = React.useState(true);

  React.useEffect(() => {
    const el = ref.current;
    if (!el || reduced) return;

    const vh = window.innerHeight || document.documentElement.clientHeight;
    const rect = el.getBoundingClientRect();
    const inViewNow = rect.top < vh && rect.bottom > 0;

    // Above the fold → leave it visible, no animation.
    if (inViewNow) return;
    // Below the fold → hide it (off-screen, so no visible flash) and reveal on
    // scroll. If IntersectionObserver is unavailable, it just stays visible.
    if (!("IntersectionObserver" in window)) return;

    setArmed(true);
    setShown(false);
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShown(true);
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduced]);

  const hidden = armed && !shown;
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: hidden ? 0 : 1,
        transform: hidden ? `translate3d(0, ${y}px, 0)` : "none",
        transition:
          reduced || !armed
            ? undefined
            : `opacity 700ms ${EASE} ${delay}ms, transform 700ms ${EASE} ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

export function Counter({
  to,
  suffix = "",
  prefix = "",
  duration = 1700,
  className,
}: {
  to: number;
  suffix?: string;
  prefix?: string;
  duration?: number;
  className?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const ref = React.useRef<HTMLSpanElement>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el || reduced) return;
    const fmt = (n: number) =>
      `${prefix}${Math.round(n).toLocaleString("en-IN")}${suffix}`;

    let raf = 0;
    const run = () => {
      const start = performance.now();
      el.textContent = fmt(0);
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        el.textContent = fmt(to * eased);
        if (t < 1) raf = requestAnimationFrame(tick);
        else el.textContent = fmt(to);
      };
      raf = requestAnimationFrame(tick);
    };

    const vh = window.innerHeight || document.documentElement.clientHeight;
    const rect = el.getBoundingClientRect();
    if (rect.top < vh && rect.bottom > 0) {
      run();
      return () => cancelAnimationFrame(raf);
    }
    if (!("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            run();
            io.disconnect();
            break;
          }
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [reduced, to, duration, prefix, suffix]);

  // Server / no-JS render shows the real final value (never a bare "0").
  return (
    <span ref={ref} className={className}>
      {prefix}
      {to.toLocaleString("en-IN")}
      {suffix}
    </span>
  );
}
