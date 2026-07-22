"use client";

import * as React from "react";
import Image from "next/image";
import { useInViewSafe, useReducedMotion } from "@/components/site/fx";

/**
 * The "Cocoon" motion kit.
 *
 * Reverse-engineered from cocooncarpets.com, which the user holds up as the
 * standard for "classy, elegant, calm — and not boring". The surprise finding
 * when I probed it live: it is a stock Shopify Dawn theme. No GSAP, no Lenis,
 * no WebGL, no custom cursor. Its entire premium feel comes from five cheap,
 * SLOW effects, and that is the whole point — the restraint IS the elegance:
 *
 *   1. `animate--ambient`   a 30s infinite orbit on hero art (never still)
 *   2. `animate--zoom-in`   images that scale up slowly, over ~1.2s
 *   3. `data-cascade`       staggered fade-ups, ~0.5s, on scroll into view
 *   4. `hover-3d-lift`      cards that rise and tilt fractionally under cursor
 *   5. `animate--fixed`     background images pinned while content scrolls past
 *
 * (3) already exists as <Reveal> in fx.tsx and is not duplicated here. This
 * file adds the other four plus the rail, and nothing else.
 *
 * HARD RULES inherited from fx.tsx — both have shipped bugs in this app:
 *   - NEVER a colour alpha modifier (`bg-x/90`). Semantic colours are plain
 *     `var(--…)` with no <alpha-value>, so Tailwind emits NOTHING and the
 *     element renders transparent. Use `opacity-*` or an explicit rgba().
 *   - The spacing scale is REPLACED: 0 px 0.5 1 2 3 4 5 6 8 10 12 16 20 24 32
 *     only. Anything else emits nothing — use an arbitrary [Npx].
 */

/* ─────────────────────────────────────────────────────────────────────────
 * AmbientImage — the hero treatment.
 *
 * Cocoon's `animateAmbient` is an orbit, not a pan: the image rotates a full
 * turn while counter-rotating by the same amount, so it never actually appears
 * to spin — it drifts in a slow circle. `scale(1.2)` is load-bearing: the
 * translate would otherwise expose the frame edge. Over 30 seconds it reads as
 * "alive" without ever being noticeable, which is exactly the register the
 * whole page is pitched at.
 *
 * Wrapped in its own `overflow-hidden` frame rather than animating the <img>
 * in place, because `next/image` with `fill` positions absolutely and a
 * transform on it would fight the parallax translate used elsewhere.
 * ───────────────────────────────────────────────────────────────────────── */
export function AmbientImage({
  src,
  alt,
  className = "",
  priority = false,
  sizes = "100vw",
}: {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
  sizes?: string;
}) {
  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div className="rx-ambient absolute inset-0">
        <Image src={src} alt={alt} fill priority={priority} sizes={sizes} className="object-cover" />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * HeroSlideshow — the reference's rotating hero.
 *
 * Pacing is measured off that site, not invented: its slides cross-fade with
 * `opacity 2s`. Two seconds is very slow for a transition and that is exactly
 * why it reads as expensive — the picture dissolves rather than switches. Each
 * slide then holds for `interval` before the next dissolve begins.
 *
 * It CROSS-FADES rather than sliding. A slide implies a filmstrip and draws
 * the eye horizontally; a dissolve keeps the composition still, which is what
 * lets the ambient orbit underneath stay the only movement you notice.
 *
 * ⚠ THE TIMER IS A setInterval, NOT requestAnimationFrame, AND THAT IS
 * LOAD-BEARING. rAF is frozen in a background tab, so an rAF-driven carousel
 * silently stops and — worse — any state gated on an animation completing
 * never resolves. Timers still fire (throttled) while hidden. We additionally
 * pause on `visibilitychange` so a backgrounded tab does not burn through
 * every slide and return showing an arbitrary one.
 *
 * Under reduced motion there is no autoplay at all: the first slide stays put
 * and the indicators still work as manual controls.
 * ───────────────────────────────────────────────────────────────────────── */
export function HeroSlideshow({
  slides,
  interval = 6000,
  fade = 2000,
}: {
  slides: { src: string; alt: string; label: string }[];
  interval?: number;
  fade?: number;
}) {
  const [i, setI] = React.useState(0);
  const reduced = useReducedMotion();
  const count = slides.length;

  React.useEffect(() => {
    if (reduced || count < 2) return;
    let id: number | undefined;
    const start = () => {
      if (id === undefined) id = window.setInterval(() => setI((n) => (n + 1) % count), interval);
    };
    const stop = () => {
      if (id !== undefined) {
        clearInterval(id);
        id = undefined;
      }
    };
    const onVis = () => (document.hidden ? stop() : start());
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [count, interval, reduced]);

  return (
    <>
      {slides.map((s, n) => {
        const active = n === i;
        return (
          <div
            key={s.src}
            aria-hidden={!active}
            className="absolute inset-0 overflow-hidden"
            style={{
              opacity: active ? 1 : 0,
              transition: `opacity ${reduced ? 0 : fade}ms linear`,
            }}
          >
            {/* The orbit runs only on the visible slide — four simultaneous
                infinite transforms is wasted compositing for frames nobody
                sees. */}
            <div className={`absolute inset-0 ${active && !reduced ? "rx-ambient" : ""}`}>
              <Image
                src={s.src}
                alt={n === 0 ? s.alt : ""}
                fill
                /*
                 * Slide 0 gets `priority` (preload + eager) because it is the
                 * LCP element. The rest get `loading="eager"` — NOT priority:
                 * they must be decoded before their turn or the first dissolve
                 * fades to a blank frame, but adding three more preload hints
                 * would compete with the LCP image for bandwidth. Eager fetches
                 * without the preload priority, which is exactly right here.
                 * Leaving them lazy is the subtle bug: they are `opacity: 0`
                 * yet in-viewport, so lazy loading resolves at an unpredictable
                 * moment rather than up front.
                 */
                priority={n === 0}
                loading={n === 0 ? undefined : "eager"}
                sizes="100vw"
                className="object-cover"
              />
            </div>
          </div>
        );
      })}

      {count > 1 ? (
        <div className="absolute bottom-8 right-4 z-20 flex items-center gap-4 md:right-6 lg:right-[50px]">
          <span className="text-[12px] uppercase tracking-[0.24em] text-white opacity-70">
            {slides[i]?.label}
          </span>
          <div className="flex items-center gap-2">
            {slides.map((s, n) => (
              <button
                key={s.src}
                type="button"
                onClick={() => setI(n)}
                aria-label={`Show ${s.label}`}
                aria-current={n === i}
                className="group relative h-[3px] w-10 overflow-hidden bg-[rgba(255,255,255,0.35)]"
              >
                {/*
                 * The fill is keyed on the active index so React remounts it
                 * and the animation restarts from 0 on every change. Without
                 * the key it would keep the previous run's progress. Duration
                 * matches the hold so the bar lands exactly as the fade begins.
                 */}
                <span
                  key={`${n}-${i}`}
                  className="absolute inset-y-0 left-0 block bg-white"
                  style={
                    n === i
                      ? reduced
                        ? { width: "100%" }
                        : { animation: `rx-bar ${interval}ms linear both` }
                      : { width: 0 }
                  }
                />
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * ZoomImage — Cocoon's `animate--zoom-in`.
 *
 * Rests slightly over-scaled and settles to 1 as it enters view, then scales
 * again on hover. Two separate scales on ONE element would overwrite each
 * other, so the entry scale lives on the wrapper and the hover scale on the
 * inner frame. Entry is 1.4s; hover is 1.2s. Both are deliberately slower than
 * feels right while you build it — that slowness is the "premium" the user is
 * describing, and every instinct to speed it up should be resisted.
 * ───────────────────────────────────────────────────────────────────────── */
export function ZoomImage({
  src,
  alt,
  className = "",
  sizes = "(min-width: 1024px) 25vw, 50vw",
  hover = true,
}: {
  src: string;
  alt: string;
  className?: string;
  sizes?: string;
  hover?: boolean;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const inView = useInViewSafe(ref, 0.06);
  const settled = reduced || inView;

  return (
    <div ref={ref} className={`relative overflow-hidden ${className}`}>
      {/* Durations live in inline styles, not `duration-[1400ms]` classes:
          Tailwind reports those as ambiguous (they match both transition- and
          animation-duration) and warns on every build. */}
      <div
        className="absolute inset-0 transition-transform"
        style={{
          transitionDuration: "1400ms",
          transitionTimingFunction: "cubic-bezier(0.22,1,0.36,1)",
          transform: settled ? "scale(1)" : "scale(1.18)",
        }}
      >
        <div
          className={`absolute inset-0 transition-transform ease-out ${
            hover ? "group-hover:scale-[1.07]" : ""
          }`}
          style={{ transitionDuration: "1200ms" }}
        >
          <Image src={src} alt={alt} fill sizes={sizes} className="object-cover" />
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * FixedImage — Cocoon's `animate--fixed`.
 *
 * The image is pinned to the viewport while its frame scrolls over it, so the
 * content appears to slide across a still photograph. `background-attachment:
 * fixed` is the one-line version of this and it is broken on iOS Safari, which
 * silently falls back to `scroll` and kills the effect on half the traffic
 * this site gets. A fixed-position child inside an `overflow-hidden` +
 * `clip-path` frame behaves identically and works everywhere.
 *
 * ⚠ `clip-path: inset(0)` on the frame is REQUIRED, not decoration: it
 * establishes a containing block for the fixed child, which is what keeps the
 * image clipped to the section instead of covering the entire page.
 * ───────────────────────────────────────────────────────────────────────── */
export function FixedImage({
  src,
  alt,
  className = "",
  priority = false,
}: {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
}) {
  return (
    <div className={`relative overflow-hidden [clip-path:inset(0)] ${className}`}>
      <div className="fixed inset-0 h-screen w-full">
        <Image src={src} alt={alt} fill priority={priority} sizes="100vw" className="object-cover" />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * StackHeading — Cocoon's single most recognisable typographic device.
 *
 * Every section on that site is titled with a small word stacked above a large
 * one: FEATURED / COLLABORATIONS, SHOP BY / STYLE, DESIGN / PHILOSOPHY,
 * CUSTOMER / TESTIMONIALS, OUR / BLOGS. Uppercase, letterspaced, tight leading.
 * It is what makes an otherwise plain page read as designed, and it costs
 * nothing — no new typeface required, which matters here because swapping the
 * font means editing packages/ui and nuking .next (see the typography notes).
 *
 * Both lines animate as a <Lines>-style clip reveal, staggered, so the big word
 * arrives just after the small one.
 * ───────────────────────────────────────────────────────────────────────── */
export function StackHeading({
  top,
  bottom,
  align = "left",
  className = "",
  tone = "ink",
  size = "section",
}: {
  top: string;
  bottom: string;
  align?: "left" | "center";
  className?: string;
  /**
   * "ink"    — on the page ground.
   * "invert" — white, for the DARK panels and photographs.
   * "panel"  — for the LIGHT (greige) panel, where white would only reach
   *            2.5:1. Resolves through --c-on-light-panel so it can still flip
   *            with the theme; a hardcoded black would be invisible when that
   *            panel darkens in dark mode.
   */
  tone?: "ink" | "invert" | "panel";
  /** "hero" keeps the same 1:2 ratio and 200/700 weights, scaled up. */
  size?: "section" | "hero";
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const inView = useInViewSafe(ref, 0.05);
  const show = reduced || inView;
  const colour =
    tone === "invert"
      ? "text-white"
      : tone === "panel"
        ? "text-[var(--c-on-light-panel)]"
        : "text-[var(--c-ink)]";

  /*
   * MEASURED OFF THE REFERENCE, not eyeballed — the first version of this got
   * all three variables wrong and read as badly spaced:
   *
   *   top line     24px / weight 200 / line-height 0.8 / letter-spacing NORMAL
   *   bottom line  48px / weight 700 / line-height 0.8 / letter-spacing NORMAL
   *
   * Exactly a 1:2 size ratio, and the contrast is carried entirely by WEIGHT
   * (200 against 700), not by tracking. Adding letter-spacing to uppercase at
   * this scale — which is the instinctive move, and what I did first — is
   * precisely what makes it look scattered instead of composed. Keep it at 0.
   *
   * ⚠ WE USE line-height 0.92, NOT THEIR 0.8, AND THAT IS DELIBERATE.
   * Theirs is only safe because every heading on that site is ONE SHORT WORD
   * that can never wrap (STYLE, PRET, PHILOSOPHY). Ours wrap. Measured at
   * 390px: "Crafted properly." broke onto two lines spaced 32px apart at a
   * 40px font size, while the capitals are ~29px tall — a 3px gap, which is
   * exactly the "words overlapping" the user reported. Any line-height below
   * ~0.75 guarantees collision on a wrap; 0.92 clears by ~0.2em and the
   * two-line stack still reads tight. `text-wrap: balance` stops a wrapped
   * heading dropping a single orphan word onto the second line.
   *
   * 200 is unavailable: Space Grotesk's variable range starts at 300, so the
   * top line uses `font-light`. The ratio and the tracking matter more.
   *
   * pb/-mb in em: the clip box must be TALLER than the line box or it eats
   * descenders. At leading-[0.8] the line box is far shorter than the glyphs,
   * so overflow-hidden would slice the tail off every y, p, g and q.
   */
  /*
   * `last` controls whether the clip's padding is cancelled again.
   *
   * The pb is mandatory: at leading-[0.8] the line box is far shorter than the
   * glyphs, so overflow-hidden would slice the tail off every y, p, g and q.
   * BETWEEN lines the equal -mb removes that padding from layout so the pair
   * still stacks tightly. On the LAST line it must NOT be cancelled — doing so
   * lets the descenders render into space the box no longer claims, and at
   * hero size that bled ~14px into the paragraph below it. Measured: the hero
   * headline and its intro paragraph genuinely overlapped.
   */
  const line = (text: string, delay: number, size: string, weight: string, last = false) => (
    <span className={`block overflow-hidden pb-[0.22em] ${last ? "" : "-mb-[0.22em]"}`}>
      <span
        className={`block ${size} ${weight} uppercase leading-[0.92] tracking-normal [text-wrap:balance] transition-transform`}
        style={{
          transitionDuration: "1100ms",
          transitionTimingFunction: "cubic-bezier(0.22,1,0.36,1)",
          transitionDelay: `${delay}ms`,
          transform: show ? "translateY(0)" : "translateY(110%)",
        }}
      >
        {text}
      </span>
    </span>
  );

  return (
    <div
      ref={ref}
      className={`${colour} ${align === "center" ? "text-center" : ""} ${className}`}
    >
      {line(
        top,
        0,
        size === "hero" ? "text-[clamp(1.25rem,2.2vw,2.1rem)]" : "text-[clamp(1.05rem,1.6vw,1.5rem)]",
        "font-light",
      )}
      {line(
        bottom,
        120,
        size === "hero" ? "text-[clamp(2.5rem,4.4vw,4.2rem)]" : "text-[clamp(2.1rem,3.2vw,3rem)]",
        "font-bold",
        true,
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Rail — the collections carousel.
 *
 * Native scroll-snap rather than a carousel library: it is keyboard-accessible
 * and touch-native for free, and it degrades to an ordinary swipe list on
 * mobile with no JS at all. The arrows page by one card width, measured from
 * the first child rather than assumed, so the card size can change in the
 * markup without touching this.
 *
 * Arrows hide themselves when there is nothing to scroll to — a dead arrow on
 * a two-card rail is the kind of detail that makes a page feel unfinished.
 * ───────────────────────────────────────────────────────────────────────── */
export function Rail({
  children,
  tone = "ink",
}: {
  children: React.ReactNode;
  /**
   * "invert" when the rail sits on a dark panel.
   *
   * Not cosmetic: the ink arrows measured 1.44:1 against the forest panel —
   * present in the DOM, invisible to the eye. A control that cannot be seen is
   * a broken control, so this has to be passed wherever the background is dark.
   */
  tone?: "ink" | "invert";
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [edge, setEdge] = React.useState<{ start: boolean; end: boolean }>({
    start: true,
    end: false,
  });

  const sync = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // 2px slack: sub-pixel scroll widths mean scrollLeft never exactly equals
    // the maximum, so an exact comparison leaves the end arrow permanently lit.
    setEdge({
      start: el.scrollLeft <= 2,
      end: el.scrollLeft >= el.scrollWidth - el.clientWidth - 2,
    });
  }, []);

  React.useEffect(() => {
    sync();
    const el = ref.current;
    if (!el) return;
    el.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    return () => {
      el.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
    };
  }, [sync]);

  const page = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const card = el.firstElementChild as HTMLElement | null;
    const step = card ? card.getBoundingClientRect().width + 24 : el.clientWidth * 0.8;
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  const scrollable = !(edge.start && edge.end);

  return (
    <div className="relative">
      <div
        ref={ref}
        className="rx-noscroll flex snap-x snap-mandatory gap-6 overflow-x-auto scroll-smooth pb-2"
      >
        {children}
      </div>

      {scrollable ? (
        <div className="mt-8 flex items-center gap-3">
          {([-1, 1] as const).map((dir) => {
            const disabled = dir === -1 ? edge.start : edge.end;
            return (
              <button
                key={dir}
                type="button"
                onClick={() => page(dir)}
                disabled={disabled}
                aria-label={dir === -1 ? "Previous" : "Next"}
                className={`flex h-12 w-12 items-center justify-center rounded-full border transition-all duration-500 ease-out disabled:pointer-events-none disabled:opacity-25 ${
                  tone === "invert"
                    ? "border-[rgba(255,255,255,0.45)] text-white hover:border-white hover:bg-white hover:text-[var(--c-ink)]"
                    : "border-[var(--c-line)] text-[var(--c-ink)] hover:border-[var(--c-ink)] hover:bg-[var(--c-ink)] hover:text-white"
                }`}
              >
                <span aria-hidden className="text-[18px] leading-none">
                  {dir === -1 ? "←" : "→"}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * PanelTabs — the reference's "SHOP BY STYLE" control.
 *
 * Three labels in a row above a rule, the active one underlined in white,
 * swapping the body copy beneath. Deliberately tiny: no library, no routing,
 * no animation beyond a cross-fade, because on that site it is a quiet
 * control that never competes with the photograph beside it.
 *
 * Rendered on a coloured panel, so every colour here is on-panel white.
 * ───────────────────────────────────────────────────────────────────────── */
export function PanelTabs({
  items,
  tone = "ink",
}: {
  items: { name: string; body: string; href: string; cta: string }[];
  /**
   * "invert" only when this sits on a DARK panel.
   *
   * Defaults to "ink" because the panel it lives on is now a white card. The
   * first build hardcoded white here, and when the panel went light the whole
   * control measured 1:1 — the tabs, the copy and the underline were all still
   * on the page and completely invisible. A shared component that hardcodes
   * one tone is a bug waiting for the background to change.
   */
  tone?: "ink" | "invert";
}) {
  const [i, setI] = React.useState(0);
  const active = items[i] ?? items[0];
  if (!active) return null;

  const inv = tone === "invert";
  const rule = inv ? "border-[rgba(255,255,255,0.28)]" : "border-[var(--c-line)]";
  const label = inv ? "text-white" : "text-[var(--c-ink)]";
  const bar = inv ? "bg-white" : "bg-[var(--c-accent)]";
  const body = inv ? "text-white" : "text-[var(--c-ink-soft)]";
  const btn = inv
    ? "bg-white text-[var(--c-ink)] hover:opacity-85"
    : "bg-[var(--c-dark)] text-white hover:bg-[var(--c-dark-soft)]";

  return (
    <div>
      <div className={`flex flex-wrap gap-x-12 gap-y-3 border-b ${rule}`}>
        {items.map((s, n) => (
          <button
            key={s.name}
            type="button"
            onClick={() => setI(n)}
            aria-pressed={n === i}
            className={`relative -mb-px pb-4 text-[13px] uppercase tracking-[0.12em] ${label} transition-opacity duration-500 hover:opacity-100`}
            /* 0.72, not 0.6: at 0.6 the inactive labels dropped under 4.5:1
               against the card. Inactive still reads as inactive. */
            style={{ opacity: n === i ? 1 : 0.72 }}
          >
            {s.name}
            <span
              aria-hidden
              className={`absolute inset-x-0 bottom-0 h-px origin-left ${bar} transition-transform duration-500 ease-out`}
              style={{ transform: `scaleX(${n === i ? 1 : 0})` }}
            />
          </button>
        ))}
      </div>

      {/* key= restarts the fade so switching tabs reads as a change, not a
          silent text swap. */}
      <p
        key={active.name}
        className={`mt-8 max-w-[46ch] text-[16px] leading-[1.7] ${body}`}
        style={{ animation: "rx-fade-up 0.7s cubic-bezier(0.22,1,0.36,1) both" }}
      >
        {active.body}
      </p>

      <a
        href={active.href}
        className={`mt-10 inline-flex items-center gap-3 px-8 py-4 text-[13px] uppercase tracking-[0.16em] transition-all duration-500 ${btn}`}
      >
        {active.cta}
      </a>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * PhotoMarquee — the Instagram strip, always in motion.
 *
 * A CONTINUOUS loop rather than a paged carousel. The row is rendered twice
 * and translated by exactly -50%, so the moment the first copy leaves the
 * frame the second is in its place and the seam is invisible. That is why the
 * duplicate is mandatory, and why the shift must be 50% and not a pixel value:
 * any other distance jumps.
 *
 * Chosen over arrows-and-dots because this is a social strip, not a product
 * carousel — there is no "page" a visitor needs to get back to, so paging
 * controls would be furniture. Continuous drift also never sits still, which
 * is what "keep it moving" asks for.
 *
 * Pauses on hover so a visitor can actually aim at a tile — a link that slides
 * out from under the cursor is a broken link. Under reduced motion it does not
 * animate at all and becomes a normal horizontally-scrollable row.
 *
 * `Image` directly rather than ZoomImage: ZoomImage settles on an in-view
 * check, and inside a permanently-translating row that measurement is never
 * meaningfully stable.
 * ───────────────────────────────────────────────────────────────────────── */
export function PhotoMarquee({
  images,
  href,
  label,
  seconds = 60,
}: {
  images: string[];
  href: string;
  label: string;
  seconds?: number;
}) {
  const reduced = useReducedMotion();

  const row = (dup: number) => (
    <div className="flex shrink-0 items-center gap-[10px]" aria-hidden={dup === 1}>
      {images.map((src, i) => (
        <a
          key={`${dup}-${i}-${src}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          /* Only the first copy is reachable; the clone is decorative, so it
             is hidden from assistive tech AND removed from the tab order. */
          tabIndex={dup === 1 ? -1 : undefined}
          aria-label={dup === 1 ? undefined : label}
          /* aspect-[4/5] = Instagram's portrait post ratio. The tile sources
             are all portrait, so this crops them barely at all and every tile
             frames its subject the same way — the even look the square tiles
             couldn't give with mixed-orientation sources. */
          className="group relative block aspect-[4/5] w-[46vw] shrink-0 overflow-hidden rounded-[16px] sm:w-[230px] lg:w-[264px]"
        >
          <Image
            src={src}
            alt=""
            fill
            sizes="(min-width: 1024px) 280px, (min-width: 640px) 240px, 46vw"
            className="object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-[1.06]"
          />
        </a>
      ))}
    </div>
  );

  return (
    <div className="rx-marquee-hover overflow-hidden">
      <div
        className={`flex w-max gap-[10px] ${reduced ? "" : "rx-slide"}`}
        style={reduced ? undefined : { animationDuration: `${seconds}s` }}
      >
        {row(0)}
        {row(1)}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * CountUp — for the capability figures.
 *
 * Counts only once, when the number reaches the viewport, and lands on the
 * exact target rather than easing asymptotically toward it (a stat that
 * settles on 119,998 is worse than no animation at all).
 *
 * Uses the same measured in-view check as everything else here — NOT
 * IntersectionObserver, which deadlocks inside the clipped frames this page is
 * built from. Under reduced motion it renders the final value immediately.
 * ───────────────────────────────────────────────────────────────────────── */
export function CountUp({
  to,
  prefix = "",
  suffix = "",
  duration = 1600,
  year = false,
}: {
  to: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  /**
   * A YEAR is not a quantity. Without this it rendered "2,019" — grouped with a
   * thousands separator AND counting up 0→2019 like an odometer, which is the
   * clearest tell that a stats block is fake. When `year`, the value is printed
   * verbatim (no grouping, no animation): just "2019".
   */
  year?: boolean;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();
  const inView = useInViewSafe(ref as React.RefObject<HTMLElement>, 0.05);
  const [n, setN] = React.useState(year ? to : 0);

  React.useEffect(() => {
    if (year) return; // years never count
    if (reduced) return setN(to);
    if (!inView) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      // easeOutCubic — fast out of the gate, gentle arrival.
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduced, to, duration, year]);

  return (
    <span ref={ref} className="numerics-tabular">
      {prefix}
      {year ? String(to) : n.toLocaleString("en-IN")}
      {suffix}
    </span>
  );
}
