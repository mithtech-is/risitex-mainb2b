"use client";

import * as React from "react";
import {
  motion,
  useInView,
  useMotionValue,
  useScroll,
  useSpring,
  useTransform,
  animate,
  type MotionValue,
} from "framer-motion";

/**
 * Shared scroll/reveal primitives for the editorial pages.
 *
 * Framer Motion is the sanctioned motion library here — `tokens/motion.ts`
 * ships spring presets that explicitly target its API — and it is already a
 * declared dependency, so nothing new is installed to use these.
 *
 * HARD RULES for every file in this folder (both have bitten us in prod):
 *   - NEVER use a colour alpha modifier (`bg-x/90`). Semantic colours are plain
 *     `var(--…)` with no <alpha-value>, so Tailwind emits NOTHING and the
 *     element renders fully transparent. Use a standalone `opacity-*` utility,
 *     or an explicit rgba() in an inline style.
 *   - Spacing keys are a REPLACED scale: 0 px 0.5 1 2 3 4 5 6 8 10 12 16 20 24
 *     32 only. Anything else (7, 14, 44, 1.5, 3.5…) emits nothing. Use an
 *     arbitrary [Npx] when off-scale.
 */

const EASE_OUT = [0.2, 0.8, 0.2, 1] as const;

/** True once mounted on a viewport at least `min` wide. Guards desktop-only pinning. */
export function useIsDesktop(min = 768) {
  const [is, setIs] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${min}px)`);
    const sync = () => setIs(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [min]);
  return is;
}

/** True when the user has asked for reduced motion. All effects must respect it. */
export function useReducedMotion() {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return reduced;
}

/**
 * Rise-and-fade on first entry. The workhorse — every section heading and
 * paragraph uses it, staggered by `delay`.
 */
export function Reveal({
  children,
  delay = 0,
  y = 24,
  className = "",
  as = "div",
}: {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  as?: "div" | "span" | "li";
}) {
  const reduced = useReducedMotion();
  const M = motion[as];
  return (
    <M
      className={className}
      initial={reduced ? false : { opacity: 0, y }}
      whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-12% 0px -12% 0px" }}
      transition={{ duration: 0.75, delay, ease: EASE_OUT }}
    >
      {children}
    </M>
  );
}

/**
 * Per-word headline reveal — words rise out of a clipped line.
 *
 * This is the signature type move: it reads as deliberate rather than as a
 * generic fade, and it is what makes a large display headline feel authored.
 */
export function Words({
  text,
  className = "",
  wordClassName = "",
  delay = 0,
  stagger = 0.075,
}: {
  text: string;
  className?: string;
  wordClassName?: string;
  delay?: number;
  stagger?: number;
}) {
  const reduced = useReducedMotion();
  const words = text.split(" ");
  if (reduced) return <span className={className}>{text}</span>;
  return (
    <span className={className}>
      {words.map((w, i) => (
        <span key={`${w}-${i}`} className="inline-block overflow-hidden align-bottom">
          <motion.span
            className={`inline-block ${wordClassName}`}
            initial={{ y: "110%" }}
            whileInView={{ y: "0%" }}
            viewport={{ once: true, margin: "-10% 0px" }}
            transition={{ duration: 0.9, delay: delay + i * stagger, ease: EASE_OUT }}
          >
            {w}
            {i < words.length - 1 ? " " : ""}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

/**
 * Scroll-linked parallax for a full-bleed photograph.
 *
 * `strength` is how far the image travels across the whole pass, as a share of
 * the container height. The child image must be oversized (scale-110-ish) or the
 * travel will expose an edge.
 */
export function useParallax(
  ref: React.RefObject<HTMLElement>,
  strength = 0.18,
): MotionValue<string> {
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const eased = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.4 });
  const pct = strength * 100;
  return useTransform(eased, [0, 1], [`${-pct / 2}%`, `${pct / 2}%`]);
}

/** Counts to `to` when scrolled into view. Used for the mill statistics. */
export function CountUp({
  to,
  decimals = 0,
  suffix = "",
  className = "",
}: {
  to: number;
  decimals?: number;
  suffix?: string;
  className?: string;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-20% 0px" });
  const reduced = useReducedMotion();
  const mv = useMotionValue(0);
  const [shown, setShown] = React.useState("0");

  React.useEffect(() => {
    const fmt = (v: number) =>
      v.toLocaleString("en-IN", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
    if (reduced) {
      setShown(fmt(to));
      return;
    }
    if (!inView) return;
    const unsub = mv.on("change", (v) => setShown(fmt(v)));
    const controls = animate(mv, to, { duration: 1.6, ease: EASE_OUT });
    return () => {
      controls.stop();
      unsub();
    };
  }, [inView, to, decimals, mv, reduced]);

  return (
    <span ref={ref} className={className}>
      {shown}
      {suffix}
    </span>
  );
}

/**
 * Full-bleed photographic chapter panel — the page's main image-led device.
 *
 * The photograph fills the viewport and drifts under a scrim while the copy
 * holds. Scrims are inline rgba() on purpose: a Tailwind colour/opacity
 * modifier would emit no CSS (see the header note).
 */
export function ChapterPanel({
  image,
  alt,
  index,
  title,
  body,
  meta,
  align = "left",
  priority = false,
  children,
}: {
  image: string;
  alt: string;
  index: string;
  title: string;
  body: string;
  meta?: { k: string; v: string }[];
  align?: "left" | "right";
  priority?: boolean;
  children?: React.ReactNode;
}) {
  const ref = React.useRef<HTMLElement>(null);
  const y = useParallax(ref, 0.22);

  return (
    <section
      ref={ref}
      className="relative flex h-[92vh] min-h-[560px] w-full items-end overflow-hidden border-b border-border-subtle bg-surface-inverse"
    >
      <motion.div style={{ y }} className="absolute inset-0 z-0 h-[126%] -top-[13%]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          className="h-full w-full object-cover"
        />
      </motion.div>

      {/* Scrim — anchored to whichever side the copy sits on. */}
      <div
        aria-hidden
        className="absolute inset-0 z-0"
        style={{
          background:
            align === "left"
              ? "linear-gradient(78deg, rgba(10,10,9,0.86) 0%, rgba(10,10,9,0.54) 38%, rgba(10,10,9,0.06) 72%, rgba(10,10,9,0) 100%)"
              : "linear-gradient(282deg, rgba(10,10,9,0.86) 0%, rgba(10,10,9,0.54) 38%, rgba(10,10,9,0.06) 72%, rgba(10,10,9,0) 100%)",
        }}
      />
      {/* Floor gradient so the bottom rule and index never float on a highlight. */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 z-0 h-[40%]"
        style={{ background: "linear-gradient(0deg, rgba(10,10,9,0.72) 0%, rgba(10,10,9,0) 100%)" }}
      />

      <div className="relative z-10 w-full pb-16 md:pb-20">
        <div className="mx-auto w-full max-w-[1200px] px-5 sm:px-6 lg:px-8 xl:px-10 2xl:px-16 xl:max-w-[1360px] 2xl:max-w-[1440px]">
          <div className={align === "right" ? "flex justify-end" : ""}>
            <div className="max-w-[46ch]">
              <Reveal>
                <p className="font-mono text-micro uppercase tracking-[0.28em] text-surface-background opacity-70">
                  <span className="text-[#7A93D6]">{index}</span>
                  <span className="mx-2">/</span>
                  Chapter
                </p>
              </Reveal>
              <h2 className="mt-5 font-display text-[clamp(2.5rem,5.2vw,4.5rem)] leading-[0.98] tracking-[-0.035em] text-surface-background">
                <Words text={title} delay={0.05} />
              </h2>
              <Reveal delay={0.2}>
                <p className="mt-6 text-body-lg leading-relaxed text-surface-background opacity-80">
                  {body}
                </p>
              </Reveal>
              {meta ? (
                <Reveal delay={0.3}>
                  <dl className="mt-10 flex flex-wrap gap-x-12 gap-y-5">
                    {meta.map((m) => (
                      <div key={m.k}>
                        <dt className="font-mono text-micro uppercase tracking-[0.2em] text-surface-background opacity-50">
                          {m.k}
                        </dt>
                        <dd className="mt-2 font-mono text-body-lg text-surface-background numerics-tabular">
                          {m.v}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </Reveal>
              ) : null}
              {children}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
