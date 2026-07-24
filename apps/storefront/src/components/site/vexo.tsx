"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import {
  motion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { useInViewSafe, useReducedMotion } from "@/components/site/fx";

/**
 * ══════════════════════════════════════════════════════════════════════════
 * VEXO MOTION KIT
 *
 * Rebuilt to match the Vexo eCommerce concept (Zeyox Studio, Dribbble
 * #25931151), which the user chose as the homepage reference. Its signature,
 * read frame-by-frame off the reference video:
 *
 *   1. A soft sage → white gradient stage, near-black type, warm taupe accents.
 *   2. Headlines that MIX a heavy grotesque with an italic serif on accent
 *      words ("gear up every SEASON every WORKOUT!"). That mix is the single
 *      most recognisable thing about it — see <MixedHeading>.
 *   3. CUT-OUT people (no background) that rise / scale into frame and overlap
 *      the type. Ours are produced with rembg from the RISITEX model shots and
 *      live in /public/demo/cutouts.
 *   4. GIANT faint watermark words behind every section that parallax as you
 *      scroll — <Watermark>.
 *   5. Small dark pill buttons + a circular arrow "tag" on every card.
 *
 * HARD RULES inherited from this app (each has shipped a bug here):
 *   - NEVER a Tailwind colour-alpha modifier (`bg-x/90`) on a var() colour —
 *     the semantic colours have no <alpha-value> so Tailwind emits NOTHING and
 *     the element renders transparent. Our --vx-* colours are the same: use an
 *     explicit rgba()/hex or `opacity-*`, never `/NN`.
 *   - The Tailwind spacing scale is REPLACED (0 px .5 1 2 3 4 5 6 8 10 12 16 20
 *     24 32). Any other key emits nothing, so non-scale spacing uses arbitrary
 *     [Npx] values or inline styles.
 *
 * Everything degrades under prefers-reduced-motion: figures and watermarks
 * render in their resting position, nothing autoplays.
 * ══════════════════════════════════════════════════════════════════════════
 */

const EASE = [0.22, 1, 0.36, 1] as const;

/* ─────────────────────────────────────────────────────────────────────────
 * MixedHeading — the reference's grotesque + italic-serif headline.
 *
 * Each line is an array of tokens; a token with `em` renders in the italic
 * serif (Instrument Serif), everything else in the heavy display grotesque
 * (Archivo). Lines rise out of a clip on scroll-in, staggered, exactly like
 * the app's existing StackHeading — the clip needs vertical padding or it eats
 * descenders, so pb/-mb in em is load-bearing, not decoration.
 * ───────────────────────────────────────────────────────────────────────── */
export type Tok = { t: string; em?: boolean };

export function MixedHeading({
  lines,
  className = "",
  align = "left",
  tone = "ink",
  delay = 0,
  as: Tag = "h2",
}: {
  lines: Tok[][];
  className?: string;
  align?: "left" | "center";
  tone?: "ink" | "invert";
  delay?: number;
  as?: "h1" | "h2";
}) {
  const reduced = useReducedMotion();
  const ref = React.useRef<HTMLDivElement>(null);
  const inView = useInViewSafe(ref as React.RefObject<HTMLElement>, 0.04);
  const show = reduced || inView;
  const colour = tone === "invert" ? "text-white" : "text-[var(--vx-ink)]";

  return (
    <Tag className={`m-0 ${className}`}>
      <span
        ref={ref}
        className={`block ${colour} ${align === "center" ? "text-center" : ""}`}
      >
        {lines.map((toks, li) => (
          <span
            key={li}
            className="block overflow-hidden pb-[0.12em] -mb-[0.12em] leading-[0.94]"
          >
            <motion.span
              className="block [text-wrap:balance]"
              initial={reduced ? false : { y: "115%" }}
              animate={show ? { y: "0%" } : undefined}
              transition={{ duration: 1, delay: delay + li * 0.1, ease: EASE }}
            >
              {toks.map((tk, ti) => (
                <React.Fragment key={ti}>
                  {tk.em ? (
                    <span className="vx-serif tracking-[-0.01em]">
                      {tk.t}
                    </span>
                  ) : (
                    <span className="vx-display font-extrabold tracking-[-0.02em]">
                      {tk.t}
                    </span>
                  )}
                  {ti < toks.length - 1 ? " " : null}
                </React.Fragment>
              ))}
            </motion.span>
          </span>
        ))}
      </span>
    </Tag>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Pill — the two button shapes the reference uses and no others: a solid
 * near-black pill and a hairline-outlined pill. Fully rounded, small caps,
 * a trailing arrow. Renders a Next <Link> for internal hrefs.
 * ───────────────────────────────────────────────────────────────────────── */
export function Pill({
  href,
  children,
  variant = "dark",
  size = "md",
  arrow = true,
  className = "",
  external = false,
}: {
  href: string;
  children: React.ReactNode;
  /**
   * dark / outline follow the theme (readable on the page ground in light AND
   * dark). solid / outline-invert are always light-on-dark — for use over the
   * hero photograph and on the dark closer panel, where the background does not
   * flip with the theme.
   */
  variant?: "dark" | "outline" | "solid" | "outline-invert";
  /** "lg" for hero-adjacent CTAs that must hold their own next to big imagery */
  size?: "md" | "lg";
  arrow?: boolean;
  className?: string;
  external?: boolean;
}) {
  const skin =
    variant === "solid"
      ? "bg-white text-[#0B0808] hover:bg-[var(--vx-mist)]"
      : variant === "outline-invert"
        ? "border border-[rgba(255,255,255,0.5)] text-white hover:bg-white hover:text-[#0B0808]"
        : variant === "outline"
          ? "border border-[var(--vx-ink)] text-[var(--vx-ink)] hover:bg-[var(--vx-ink)] hover:text-[var(--vx-bg)]"
          : "bg-[var(--vx-btn)] text-[var(--vx-btn-fg)] hover:bg-[var(--vx-btn-hover)]";
  const inner = (
    <>
      <span>{children}</span>
      {arrow ? (
        <span
          aria-hidden
          className="transition-transform duration-500 ease-out group-hover/pill:translate-x-1"
        >
          →
        </span>
      ) : null}
    </>
  );
  const dims =
    size === "lg"
      ? "gap-3 px-8 py-4 text-[14px]"
      : "gap-2 px-6 py-3 text-[12px]";
  const cls = `group/pill inline-flex items-center whitespace-nowrap rounded-full font-medium uppercase tracking-[0.14em] transition-all duration-500 ease-out ${dims} ${skin} ${className}`;
  return external ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
      {inner}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  );
}

/* Small circular arrow "tag" that sits on cards. */
export function ArrowTag({
  tone = "dark",
  className = "",
}: {
  tone?: "dark" | "light";
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`flex h-10 w-10 items-center justify-center rounded-full text-[15px] transition-transform duration-500 ease-out group-hover:-translate-y-0.5 group-hover:rotate-45 ${
        tone === "dark" ? "bg-[var(--vx-chip)] text-[var(--vx-chip-fg)]" : "bg-white text-[#0B0808]"
      } ${className}`}
    >
      ↗
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Watermark — the giant faint word behind a section, drifting on scroll.
 * Uses its own element as the scroll target, so drop it anywhere. Purely
 * decorative and aria-hidden; never carries meaning.
 * ───────────────────────────────────────────────────────────────────────── */
export function Watermark({
  text,
  className = "",
  drift = 4,
  opacity = 0.06,
}: {
  text: string;
  className?: string;
  /**
   * Horizontal parallax drift, in % of the element's (large) natural width.
   * Keep it SMALL: the word is fitted to ~82% of the container, leaving ~9% of
   * margin each side, and the drift must stay inside that margin or the word
   * clips. 4% of a ~1800px word ≈ 72px, well within the ~110px margin.
   */
  drift?: number;
  opacity?: number;
}) {
  const reduced = useReducedMotion();
  const ref = React.useRef<HTMLDivElement>(null);
  const spanRef = React.useRef<HTMLSpanElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const x = useTransform(scrollYProgress, [0, 1], [`${-drift}%`, `${drift}%`]);

  /*
   * FIT THE WHOLE WORD. A fixed vw font-size clips long words ("WHOLESALE",
   * "ESSENTIALS", "INNERWEAR") against the container's overflow-hidden. Instead
   * the word is set large, then measured and scaled DOWN uniformly so the full
   * word always fits ~94% of the container width — at every breakpoint, for any
   * word length. Uniform scale keeps the letterforms undistorted.
   */
  const [scale, setScale] = React.useState(1);
  React.useEffect(() => {
    let cancelled = false;
    const fit = () => {
      if (cancelled) return;
      const box = ref.current;
      const span = spanRef.current;
      if (!box || !span) return;
      // scrollWidth is the untransformed layout width (transform:scale does not
      // affect it), so it is always the natural width — measure, then scale down.
      const natural = span.scrollWidth || 1;
      const target = box.clientWidth * 0.82; // leave margin for the drift
      setScale(Math.min(1, target / natural));
    };
    fit();
    // CRITICAL: re-measure once the display webfont (Archivo) has loaded. The
    // first measurement happens with the fallback face, which is NARROWER, so
    // the scale comes out too large and the wide word (ESSENTIALS/WHOLESALE)
    // clips once Archivo swaps in. document.fonts.ready fixes exactly that.
    if (typeof document !== "undefined" && document.fonts?.ready) {
      document.fonts.ready.then(() => requestAnimationFrame(fit));
    }
    const t = window.setTimeout(fit, 400);
    window.addEventListener("resize", fit);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
      window.removeEventListener("resize", fit);
    };
    // re-fit when the word changes
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={ref}
      aria-hidden
      className={`pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden ${className}`}
    >
      <motion.span
        ref={spanRef}
        style={reduced ? { opacity, scale } : { x, opacity, scale }}
        className="vx-display block whitespace-nowrap font-extrabold uppercase leading-none tracking-[-0.03em] text-[var(--vx-ink)]"
      >
        {text}
      </motion.span>
    </div>
  );
}

/* Shared: a scroll-linked vertical parallax on any wrapped node. */
function useParallaxY(
  strength: number,
): [React.RefObject<HTMLDivElement>, MotionValue<string>] {
  const ref = React.useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const eased = useSpring(scrollYProgress, { stiffness: 90, damping: 30, mass: 0.5 });
  const y = useTransform(eased, [0, 1], [`${strength}%`, `${-strength}%`]);
  return [ref, y];
}

/* A single floating cut-out garment with its own parallax speed + idle bob. */
export function FloatingCutout({
  src,
  alt,
  strength = 18,
  className = "",
  bob = 0,
  width,
}: {
  src: string;
  alt: string;
  strength?: number;
  className?: string;
  bob?: number;
  width: number;
}) {
  const reduced = useReducedMotion();
  const [ref, y] = useParallaxY(strength);
  return (
    <motion.div
      ref={ref}
      className={`relative ${className}`}
      style={reduced ? undefined : { y }}
    >
      <motion.div
        animate={reduced || !bob ? undefined : { y: [0, -bob, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        style={{
          filter: "drop-shadow(0 40px 60px rgba(11,8,8,0.18))",
        }}
      >
        <Image
          src={src}
          alt={alt}
          width={width}
          height={Math.round(width * 1.4)}
          sizes={`${width}px`}
          className="h-auto w-full object-contain"
        />
      </motion.div>
    </motion.div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * HeroFigure — the cut-out that rises and scales into the hero on mount,
 * then drifts gently upward on scroll. `priority` because it is the LCP.
 * ───────────────────────────────────────────────────────────────────────── */
export function HeroFigure({
  src,
  alt,
  className = "",
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const ref = React.useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const driftY = useTransform(scrollYProgress, [0, 1], ["0%", "-12%"]);

  return (
    <div ref={ref} className={className}>
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 90, scale: 1.06 }}
        animate={
          reduced || mounted ? { opacity: 1, y: 0, scale: 1 } : undefined
        }
        transition={{ duration: 1.4, ease: EASE }}
        style={reduced ? undefined : { y: driftY }}
        className="relative h-full w-full"
      >
        <Image
          src={src}
          alt={alt}
          fill
          priority
          sizes="(min-width:1024px) 40vw, 80vw"
          className="object-contain object-bottom"
          style={{ filter: "drop-shadow(0 50px 70px rgba(11,8,8,0.22))" }}
        />
      </motion.div>
    </div>
  );
}

/* Small buyer-avatar cluster used as social proof in the hero. */
export function AvatarCluster({
  images,
  caption,
}: {
  images: string[];
  caption: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex -space-x-3">
        {images.map((src, i) => (
          <span
            key={i}
            className="relative h-10 w-10 overflow-hidden rounded-full border-2 border-[var(--vx-stage)]"
          >
            <Image src={src} alt="" fill sizes="40px" className="object-cover" />
          </span>
        ))}
      </div>
      <p className="max-w-[18ch] text-[12px] leading-[1.35] text-[var(--vx-ink-soft)]">
        {caption}
      </p>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * FeatureCard — one of the big image panels in the "top gear" feature row.
 * Photograph (not a cutout) with a wipe-open reveal, an overlaid heading and
 * a small tag button. Hover lifts and zooms.
 * ───────────────────────────────────────────────────────────────────────── */
export function FeatureCard({
  src,
  alt,
  eyebrow,
  title,
  href,
  cta,
  tall = false,
}: {
  src: string;
  alt: string;
  eyebrow: string;
  title: string;
  href: string;
  cta: string;
  tall?: boolean;
}) {
  const reduced = useReducedMotion();
  const ref = React.useRef<HTMLAnchorElement>(null);
  const inView = useInViewSafe(ref as React.RefObject<HTMLElement>, 0.06);
  const show = reduced || inView;
  return (
    <Link
      ref={ref}
      href={href}
      className={`group relative block overflow-hidden rounded-[26px] ${
        tall ? "aspect-[3/4] lg:aspect-auto lg:h-full" : "aspect-[4/5]"
      }`}
    >
      <motion.div
        className="absolute inset-0"
        initial={reduced ? false : { clipPath: "inset(100% 0 0 0)" }}
        animate={show ? { clipPath: "inset(0% 0 0 0)" } : undefined}
        transition={{ duration: 1.1, ease: EASE }}
      >
        <Image
          src={src}
          alt={alt}
          fill
          sizes="(min-width:1024px) 45vw, 100vw"
          className="object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-[1.05]"
        />
      </motion.div>
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(11,8,8,0.42) 0%, rgba(11,8,8,0.05) 34%, rgba(11,8,8,0.10) 64%, rgba(11,8,8,0.62) 100%)",
        }}
      />
      <div className="absolute inset-0 flex flex-col justify-between p-6 md:p-8">
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-white opacity-85">
          {eyebrow}
        </p>
        <div className="flex items-end justify-between gap-4">
          <h3 className="vx-display max-w-[14ch] text-[clamp(1.4rem,2.4vw,2.1rem)] font-extrabold uppercase leading-[0.95] tracking-[-0.02em] text-white">
            {title}
          </h3>
          <span className="flex shrink-0 items-center gap-2 rounded-full bg-white px-3 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-[#0B0808]">
            {cta}
            <span className="transition-transform duration-500 group-hover:translate-x-0.5">→</span>
          </span>
        </div>
      </div>
    </Link>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * ShowcaseFigure — the centered cut-out over a giant watermark word.
 * Scales up as it enters view.
 * ───────────────────────────────────────────────────────────────────────── */
export function ShowcaseFigure({
  src,
  alt,
  width = 420,
}: {
  src: string;
  alt: string;
  width?: number;
}) {
  const reduced = useReducedMotion();
  const ref = React.useRef<HTMLDivElement>(null);
  const inView = useInViewSafe(ref as React.RefObject<HTMLElement>, 0.12);
  const show = reduced || inView;
  return (
    <motion.div
      ref={ref}
      initial={reduced ? false : { opacity: 0, scale: 0.9, y: 40 }}
      animate={show ? { opacity: 1, scale: 1, y: 0 } : undefined}
      transition={{ duration: 1.2, ease: EASE }}
      className="relative mx-auto"
      style={{ width, maxWidth: "82vw" }}
    >
      <Image
        src={src}
        alt={alt}
        width={width}
        height={Math.round(width * 1.5)}
        sizes={`${width}px`}
        className="h-auto w-full object-contain"
        style={{ filter: "drop-shadow(0 50px 70px rgba(11,8,8,0.22))" }}
      />
    </motion.div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * ProductGrid — the reference's photography-forward grid, wired to the LIVE
 * Medusa catalogue. A card IS a photograph, with a small pill carrying the
 * product name + MOQ and an arrow tag. Staggered rise on scroll-in, hover
 * zoom + optional second-image swap.
 * ───────────────────────────────────────────────────────────────────────── */
export type GridItem = {
  href: string;
  name: string;
  cat: string;
  moq: string;
  image: string;
  hover?: string;
};

export function ProductGrid({ items }: { items: GridItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-[10px] lg:grid-cols-4">
      {items.map((it, i) => (
        <ProductCard key={it.href + i} item={it} index={i} />
      ))}
    </div>
  );
}

function ProductCard({ item, index }: { item: GridItem; index: number }) {
  const reduced = useReducedMotion();
  const ref = React.useRef<HTMLDivElement>(null);
  const inView = useInViewSafe(ref as React.RefObject<HTMLElement>, 0.04);
  const show = reduced || inView;
  const hover = item.hover && item.hover !== item.image ? item.hover : null;
  return (
    <motion.div
      ref={ref}
      initial={reduced ? false : { opacity: 0, y: 34 }}
      animate={show ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: 0.8, delay: (index % 4) * 0.07, ease: EASE }}
    >
      <Link
        href={item.href}
        className="group relative block aspect-[4/5] overflow-hidden rounded-[20px] bg-[var(--vx-card-2)]"
        data-cursor="View"
      >
        <Image
          src={item.image}
          alt={item.name}
          fill
          sizes="(min-width:1024px) 24vw, 48vw"
          className={`object-cover transition-transform duration-[1100ms] ease-out group-hover:scale-[1.06] ${
            hover ? "group-hover:opacity-0" : ""
          }`}
        />
        {hover ? (
          <Image
            src={hover}
            alt=""
            fill
            sizes="(min-width:1024px) 24vw, 48vw"
            className="object-cover opacity-0 transition-opacity duration-700 ease-out group-hover:opacity-100"
          />
        ) : null}
        {/* bottom pill: name + moq, with an arrow tag */}
        <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2 rounded-full bg-[var(--vx-pill)] py-2 pl-4 pr-2 backdrop-blur-sm">
          <span className="min-w-0">
            <span className="block truncate text-[12px] font-medium uppercase tracking-[0.02em] text-[var(--vx-ink)]">
              {item.name}
            </span>
            <span className="block text-[10px] uppercase tracking-[0.12em] text-[var(--vx-ink-soft)]">
              {item.moq}
            </span>
          </span>
          <span
            aria-hidden
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--vx-chip)] text-[13px] text-[var(--vx-chip-fg)] transition-transform duration-500 group-hover:rotate-45"
          >
            ↗
          </span>
        </div>
      </Link>
    </motion.div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * WatermarkMarquee — the reference's signature background type: a GIANT,
 * faint word train that slides continuously behind a section's content.
 * Same doubled-row/-50% loop as the Marquee, but huge, low-opacity, and
 * absolutely positioned to fill its section. Decorative only (aria-hidden);
 * static under reduced motion.
 * ───────────────────────────────────────────────────────────────────────── */
export function WatermarkMarquee({
  text,
  opacity = 0.06,
  seconds = 46,
  className = "",
}: {
  text: string;
  opacity?: number;
  /** one full loop duration — keep it SLOW; the reference glides, never races */
  seconds?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const row = (dup: number) => (
    <div className="flex shrink-0 items-center" aria-hidden={dup === 1}>
      {[0, 1].map((i) => (
        <span
          key={`${dup}-${i}`}
          className="vx-display whitespace-nowrap px-10 font-extrabold uppercase leading-none tracking-[-0.03em] text-[var(--vx-ink)]"
        >
          {text}
        </span>
      ))}
    </div>
  );
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 flex items-center overflow-hidden ${className}`}
      style={{ opacity }}
    >
      <div
        className={`flex w-max ${reduced ? "" : "rx-ticker"}`}
        style={reduced ? undefined : { animationDuration: `${seconds}s` }}
      >
        {row(0)}
        {row(1)}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Marquee — big text sliding left across the page (the reference's moving
 * headline band). The row is rendered twice and translated -50%, so the seam
 * is invisible; pauses/stops under reduced motion. Colours follow the theme.
 * ───────────────────────────────────────────────────────────────────────── */
export function Marquee({
  items,
  seconds = 26,
}: {
  items: string[];
  seconds?: number;
}) {
  const reduced = useReducedMotion();
  const row = (dup: number) => (
    <div className="flex shrink-0 items-center" aria-hidden={dup === 1}>
      {items.map((t, i) => (
        <span key={`${dup}-${i}`} className="flex items-center">
          {/* Smaller and MUTED on purpose: the band sits right above big ink
              section headings, and at heading size/colour the two read as one
              wall of text. Soft colour + smaller size = clear hierarchy. */}
          <span className="vx-display px-4 text-[clamp(0.95rem,2.6vw,2rem)] font-bold uppercase leading-none tracking-[-0.01em] text-[var(--vx-ink-soft)] md:px-8">
            {t}
          </span>
          <span aria-hidden className="text-[clamp(0.6rem,1.3vw,1.05rem)] text-[var(--vx-sage)]">
            ✦
          </span>
        </span>
      ))}
    </div>
  );
  return (
    <div className="overflow-hidden">
      <div
        className={`flex w-max items-center ${reduced ? "" : "rx-ticker"}`}
        style={reduced ? undefined : { animationDuration: `${seconds}s` }}
      >
        {row(0)}
        {row(1)}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * LookWord — one giant watermark word for the LookScroller, auto-scaled to
 * span the container edge-to-edge (whatever the word length). Measured after
 * the display webfont loads (font-race guard). Cross-fades with `active`.
 * ───────────────────────────────────────────────────────────────────────── */
function LookWord({
  word,
  active,
  shift,
}: {
  word: string;
  active: boolean;
  shift: number;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const [scale, setScale] = React.useState(1);
  React.useEffect(() => {
    let cancelled = false;
    const fit = () => {
      if (cancelled) return;
      const span = ref.current;
      const box = span?.parentElement;
      if (!span || !box) return;
      const natural = span.scrollWidth || 1;
      setScale((box.clientWidth * 0.96) / natural); // fill ~96% edge-to-edge
    };
    fit();
    if (typeof document !== "undefined" && document.fonts?.ready) {
      document.fonts.ready.then(() => requestAnimationFrame(fit));
    }
    const t = window.setTimeout(fit, 400);
    window.addEventListener("resize", fit);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
      window.removeEventListener("resize", fit);
    };
  }, [word]);

  return (
    <motion.span
      ref={ref}
      animate={{ opacity: active ? 0.07 : 0, x: active ? 0 : shift }}
      transition={{ duration: 0.8, ease: EASE }}
      style={{ scale }}
      className="vx-display absolute whitespace-nowrap text-[16vw] font-extrabold uppercase leading-none tracking-[-0.04em] text-[var(--vx-ink)]"
    >
      {word}
    </motion.span>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * LookScroller — the reference's single-look showcase that swaps figures as
 * you scroll, over a giant watermark word. Implemented as a tall section with
 * a sticky stage: scroll progress picks the active look; figures cross-fade
 * and the watermark word swaps with them.
 *
 * Robust by construction: no IntersectionObserver on moving nodes, no reliance
 * on a library carousel. Under reduced motion the stage is static on look 0
 * and the whole thing is just a tall poster.
 * ───────────────────────────────────────────────────────────────────────── */
export type Look = { src: string; alt: string; word: string; label: string; spec: string };

export function LookScroller({ looks }: { looks: Look[] }) {
  const reduced = useReducedMotion();
  const ref = React.useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });
  const [active, setActive] = React.useState(0);

  React.useEffect(() => {
    if (reduced) return;
    return scrollYProgress.on("change", (p) => {
      // Map 0..1 across the looks, clamped to the last index.
      const idx = Math.min(looks.length - 1, Math.floor(p * looks.length));
      setActive((prev) => (prev === idx ? prev : idx));
    });
  }, [scrollYProgress, looks.length, reduced]);

  const current = looks[active] ?? looks[0];
  if (!current) return null;

  return (
    // Tall track: one viewport of scroll per look gives each its moment.
    <div ref={ref} style={{ height: `${looks.length * 64}vh` }} className="relative">
      <div className="sticky top-0 flex h-screen items-center justify-center overflow-hidden">
        {/* watermark word for the active look */}
        <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
          {looks.map((l, i) => (
            <LookWord
              key={l.word}
              word={l.word}
              active={i === active}
              shift={i < active ? -60 : 60}
            />
          ))}
        </div>

        {/* the swapping figure */}
        <div className="relative flex h-[76vh] w-full items-end justify-center">
          {looks.map((l, i) => (
            <motion.div
              key={l.src}
              className="absolute bottom-0 flex h-full items-end justify-center"
              initial={false}
              animate={{
                opacity: i === active ? 1 : 0,
                y: i === active ? 0 : 30,
                scale: i === active ? 1 : 0.96,
              }}
              transition={{ duration: 0.7, ease: EASE }}
              style={{ pointerEvents: i === active ? "auto" : "none" }}
            >
              <Image
                src={l.src}
                alt={l.alt}
                width={520}
                height={780}
                sizes="(min-width:1024px) 480px, 80vw"
                className="h-full w-auto object-contain"
                style={{ filter: "drop-shadow(0 50px 70px rgba(11,8,8,0.22))" }}
              />
            </motion.div>
          ))}
        </div>

        {/* the active look's caption card */}
        <motion.div
          key={current.label}
          initial={reduced ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
          className="absolute inset-x-0 bottom-10 mx-auto flex max-w-[var(--vx-max)] items-end justify-between gap-4 px-4 md:px-6 lg:px-8"
        >
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--vx-ink-soft)]">
              {current.label}
            </p>
            <p className="mt-1 text-[14px] text-[var(--vx-ink)]">{current.spec}</p>
          </div>
          {/* progress dots */}
          <div className="flex items-center gap-2">
            {looks.map((l, i) => (
              <span
                key={l.src}
                className="h-[6px] rounded-full transition-all duration-500"
                style={{
                  width: i === active ? 28 : 8,
                  background: i === active ? "var(--vx-ink)" : "rgba(11,8,8,0.22)",
                }}
              />
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
