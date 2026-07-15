"use client";

import * as React from "react";
import Image from "next/image";
import Lenis from "lenis";
import { motion, useScroll, useSpring, useTransform } from "framer-motion";

/**
 * Homepage motion kit — the "Cut From The Same Cloth" direction.
 *
 * What actually makes the reference sites (mith.tech, awwwards fashion work)
 * feel expensive, in order of impact: smooth scroll, then reveals that WIPE
 * rather than fade, then a cursor that responds to what it is over. It is not
 * 3D — mith.tech has no WebGL and no custom cursor at all; it is black, one
 * characterful face, and motion tied to scroll. Build in that order.
 *
 * HARD RULES (both have shipped bugs here):
 *   - NEVER a colour alpha modifier (`bg-x/90`) — semantic colours are plain
 *     `var(--…)` with no <alpha-value>, so Tailwind emits NOTHING and the
 *     element is transparent. Use `opacity-*`, or an explicit rgba().
 *   - Spacing scale is REPLACED: 0 px 0.5 1 2 3 4 5 6 8 10 12 16 20 24 32 only.
 *     Anything else emits nothing — use an arbitrary [Npx].
 */

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * "Is this on screen yet?" — measured, not observed.
 *
 * Deliberately NOT IntersectionObserver. IO clips a target's rect by its
 * ancestors' `overflow`, which deadlocks any reveal whose start state moves the
 * element outside its own clip: it never intersects, so it never animates, so
 * it never comes back. It also reports nothing until the page paints. This
 * reads geometry directly, checks once on mount (so above-the-fold content
 * shows immediately, with no observer round-trip) and then on scroll.
 *
 * `margin` is a fraction of viewport height — how far up from the bottom edge
 * the element must come before it counts as in view.
 */
export function useInViewSafe(ref: React.RefObject<HTMLElement>, margin = 0.08) {
  const [inView, setInView] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let done = false;
    const check = () => {
      if (done) return;
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * (1 - margin) && r.bottom > 0) {
        done = true;
        setInView(true);
        window.removeEventListener("scroll", check);
        window.removeEventListener("resize", check);
      }
    };
    check();
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, [ref, margin]);
  return inView;
}

/**
 * Is the page currently dark? Resolved the same way @risitex/ui/styles.css
 * does — explicit `data-theme` wins, otherwise the system preference — and
 * re-read on both, so it survives the theme toggle without a reload.
 * Needed because `plus-lighter` cannot darken and `multiply` cannot lighten:
 * a cursor glow has to swap blend modes with the theme or it vanishes.
 */
export function useIsDark() {
  const [dark, setDark] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const read = () => {
      const attr = document.documentElement.getAttribute("data-theme");
      setDark(attr === "dark" || (attr !== "light" && mq.matches));
    };
    read();
    mq.addEventListener("change", read);
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    return () => {
      mq.removeEventListener("change", read);
      mo.disconnect();
    };
  }, []);
  return dark;
}

export function useReducedMotion() {
  const [r, setR] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setR(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return r;
}

/**
 * Lenis smooth scroll. This is the single biggest "premium" lever — the weight
 * and glide the user keeps describing as 3D. Mounted once, near the root.
 */
export function SmoothScroll() {
  React.useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ duration: 1.1, wheelMultiplier: 1, touchMultiplier: 1.6 });
    let raf = 0;
    const loop = (t: number) => {
      lenis.raf(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
    };
  }, []);
  return null;
}

/**
 * Custom cursor — a ring that swells and labels itself over interactive things.
 *
 * `mix-blend-mode: difference` means it inverts against whatever is under it,
 * so one element reads on black photography and on cream alike. Add
 * `data-cursor="View"` to any element to set the label.
 * Desktop + fine-pointer only; there is no hover on touch.
 */
export function Cursor() {
  const [on, setOn] = React.useState(false);
  const [label, setLabel] = React.useState<string | null>(null);
  const [down, setDown] = React.useState(false);
  const dark = useIsDark();
  const dot = React.useRef<HTMLDivElement>(null);
  const glow = React.useRef<HTMLDivElement>(null);
  const pos = React.useRef({ x: -100, y: -100 });
  const glowPos = React.useRef({ x: -100, y: -100 });
  const target = React.useRef({ x: -100, y: -100 });

  React.useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setOn(true);

    const move = (e: PointerEvent) => {
      target.current.x = e.clientX;
      target.current.y = e.clientY;
      const el = (e.target as HTMLElement)?.closest?.("[data-cursor],a,button");
      if (!el) return setLabel(null);
      const custom = el.getAttribute?.("data-cursor");
      setLabel(custom ?? "");
    };
    const dn = () => setDown(true);
    const up = () => setDown(false);

    let raf = 0;
    const loop = () => {
      // Ring tracks tightly; the glow lags well behind it. The difference in
      // lag is what makes it read as a trail of light rather than a sticker.
      pos.current.x += (target.current.x - pos.current.x) * 0.18;
      pos.current.y += (target.current.y - pos.current.y) * 0.18;
      glowPos.current.x += (target.current.x - glowPos.current.x) * 0.055;
      glowPos.current.y += (target.current.y - glowPos.current.y) * 0.055;
      if (dot.current) {
        dot.current.style.transform = `translate3d(${pos.current.x}px, ${pos.current.y}px, 0) translate(-50%, -50%)`;
      }
      if (glow.current) {
        glow.current.style.transform = `translate3d(${glowPos.current.x}px, ${glowPos.current.y}px, 0) translate(-50%, -50%)`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerdown", dn);
    window.addEventListener("pointerup", up);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", dn);
      window.removeEventListener("pointerup", up);
    };
  }, []);

  if (!on) return null;
  const active = label !== null;
  const size = label ? 76 : active ? 44 : 14;

  return (
    <>
      {/*
       * The glow. `plus-lighter` ADDS light, so it genuinely glows on the ink
       * spine instead of sitting on it as a grey disc — and because it only
       * ever adds, it fades out harmlessly over the pale trade sections rather
       * than smearing them.
       *
       * THEME-AWARE, and it has to be. `plus-lighter` only ADDS light, so on a
       * pale background a white glow is mathematically invisible — there is no
       * headroom left to brighten. Light mode therefore switches to
       * `multiply` with a cool grey, which darkens instead: the same gesture,
       * inverted, so the glow reads on paper exactly as it does on ink.
       *
       * Dark: white-hot core, cool indigo falloff. Real light is white at the
       * centre and takes a cast at the edge; a flat single-hue disc reads as a
       * sticker. NB the palette is monochrome — `--brand-accent` is #222222,
       * NOT the indigo semantic.ts claims — so this hardcodes its own tint.
       */}
      <div
        ref={glow}
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 z-[80] hidden h-[460px] w-[460px] rounded-full lg:block"
        style={{
          mixBlendMode: dark ? "plus-lighter" : "multiply",
          background: dark
            ? "radial-gradient(circle, rgba(255,255,255,0.13) 0%, rgba(190,205,240,0.10) 18%, rgba(122,147,214,0.07) 40%, rgba(122,147,214,0.02) 62%, rgba(122,147,214,0) 74%)"
            : "radial-gradient(circle, rgba(96,108,138,0.20) 0%, rgba(110,120,148,0.13) 22%, rgba(130,138,160,0.06) 46%, rgba(150,155,170,0.02) 64%, rgba(255,255,255,0) 74%)",
          transition: "opacity 400ms linear",
          opacity: label ? 1 : 0.8,
        }}
      />
      <div
        ref={dot}
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 z-[90] hidden lg:block"
        style={{ mixBlendMode: "difference" }}
      >
        <div
          className="flex items-center justify-center rounded-full border border-[#f7f7f2] transition-all duration-300 ease-out"
          style={{
            width: size,
            height: size,
            background: label ? "#f7f7f2" : "transparent",
            transform: `scale(${down ? 0.82 : 1})`,
          }}
        >
          {label ? (
            <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#0a0a09]">
              {label}
            </span>
          ) : null}
        </div>
      </div>
    </>
  );
}

/** Rise + fade on entry. The workhorse. */
export function Reveal({
  children,
  delay = 0,
  y = 28,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const ref = React.useRef<HTMLDivElement>(null);
  const inView = useInViewSafe(ref);
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={reduced ? false : { opacity: 0, y }}
      animate={reduced || inView ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: 0.9, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Headline that rises line-by-line out of a clip.
 * This is the type move that separates "designed" from "faded in".
 *
 * CRITICAL: the observer watches the STATIONARY wrapper, never the moving line.
 * `whileInView` on the line itself deadlocks — it starts translated 110% down,
 * which puts it entirely outside its `overflow-hidden` parent, and
 * IntersectionObserver clips a target's rect by its ancestors' overflow. So it
 * reports "not intersecting", the reveal never fires, and the headline stays
 * hidden forever: out of view because it's hidden, hidden because it's out of
 * view. It shipped exactly that way — every headline on the page was invisible
 * while still occupying its full height, which read as huge random gaps.
 */
export function Lines({
  children,
  className = "",
  delay = 0,
}: {
  children: string[];
  className?: string;
  delay?: number;
}) {
  const reduced = useReducedMotion();
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInViewSafe(ref);
  const show = reduced || inView;

  return (
    <span ref={ref} className={`block ${className}`}>
      {children.map((line, i) => (
        /*
         * pb/-mb in em: the clip box must be TALLER than the line box or it
         * eats descenders. These headings run leading-[0.86]–[0.98], so the
         * line box is shorter than the glyphs and `overflow-hidden` sliced the
         * tails off every y, p, g, q and j on the page. The padding grows the
         * clip downward; the equal negative margin removes it again from
         * layout, so spacing is untouched. em, so it tracks the font size.
         */
        <span key={i} className="block overflow-hidden pb-[0.2em] -mb-[0.2em]">
          <motion.span
            className="block"
            initial={reduced ? false : { y: "110%" }}
            animate={show ? { y: "0%" } : undefined}
            transition={{ duration: 1, delay: delay + i * 0.09, ease: EASE }}
          >
            {line}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

/**
 * Image that WIPES open as it enters, and drifts on scroll.
 * A fade says "content loaded"; a wipe says someone designed this.
 */
export function RevealImage({
  src,
  alt,
  className = "",
  parallax = 0.14,
  priority = false,
}: {
  src: string;
  alt: string;
  className?: string;
  parallax?: number;
  priority?: boolean;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const eased = useSpring(scrollYProgress, { stiffness: 110, damping: 30, mass: 0.4 });
  const y = useTransform(eased, [0, 1], [`${-parallax * 50}%`, `${parallax * 50}%`]);
  const inView = useInViewSafe(ref);

  return (
    <div ref={ref} className={`relative overflow-hidden ${className}`}>
      <motion.div
        className="absolute inset-0"
        initial={reduced ? false : { clipPath: "inset(100% 0% 0% 0%)" }}
        animate={reduced || inView ? { clipPath: "inset(0% 0% 0% 0%)" } : undefined}
        transition={{ duration: 1.2, ease: EASE }}
      >
        <motion.div style={reduced ? undefined : { y }} className="absolute inset-0 h-[128%] -top-[14%]">
          {/* next/image, not <img>: these are 150–665KB JPEGs and the page shows
              24 of them. This serves WebP at the size actually rendered — the
              raw tags were shipping ~2.1MB of full-resolution photography. */}
          <Image
            src={src}
            alt={alt}
            fill
            priority={priority}
            sizes="100vw"
            className="object-cover"
          />
        </motion.div>
      </motion.div>
    </div>
  );
}

/** Button that leans toward the cursor. Small touch, reads expensive. */
export function Magnetic({ children }: { children: React.ReactNode }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();

  React.useEffect(() => {
    if (reduced) return;
    const el = ref.current;
    if (!el) return;
    const move = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      const x = e.clientX - (r.left + r.width / 2);
      const y = e.clientY - (r.top + r.height / 2);
      el.style.transform = `translate(${x * 0.28}px, ${y * 0.34}px)`;
    };
    const leave = () => (el.style.transform = "translate(0,0)");
    const host = el.parentElement;
    host?.addEventListener("mousemove", move);
    host?.addEventListener("mouseleave", leave);
    return () => {
      host?.removeEventListener("mousemove", move);
      host?.removeEventListener("mouseleave", leave);
    };
  }, [reduced]);

  return (
    <span ref={ref} className="inline-block transition-transform duration-300 ease-out">
      {children}
    </span>
  );
}
