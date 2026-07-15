"use client";

import * as React from "react";
import Link from "next/link";
import { motion, useScroll, useSpring, useTransform } from "framer-motion";
import { useIsDesktop, useReducedMotion, Reveal, Words } from "./motion";

export type RangeItem = {
  href: string;
  label: string;
  spec: string;
  desc: string;
  image: string;
  hover: string;
};

/**
 * The Range — pinned horizontal scroll.
 *
 * Vertical scroll drives the rail sideways while the section is pinned. Travel
 * is measured rather than guessed at (a hard-coded `-70%` breaks the moment the
 * panel count or viewport changes), and the outer height is set to
 * `100vh + travel` so the mapping is 1:1 with the wheel — anything else feels
 * either sticky or slippery.
 *
 * Below `md`, and under prefers-reduced-motion, this degrades to a native
 * scroll-snap carousel: pinning a viewport-height section on a phone fights the
 * URL bar and traps the scroll.
 */
export function RangeRail({ items }: { items: RangeItem[] }) {
  const outerRef = React.useRef<HTMLDivElement>(null);
  const trackRef = React.useRef<HTMLDivElement>(null);
  const isDesktop = useIsDesktop();
  const reduced = useReducedMotion();
  const pinned = isDesktop && !reduced;

  const [travel, setTravel] = React.useState(0);

  React.useEffect(() => {
    if (!pinned) {
      setTravel(0);
      return;
    }
    const measure = () => {
      const track = trackRef.current;
      if (!track) return;
      setTravel(Math.max(0, track.scrollWidth - window.innerWidth));
    };
    measure();
    window.addEventListener("resize", measure);
    const ro = new ResizeObserver(measure);
    if (trackRef.current) ro.observe(trackRef.current);
    return () => {
      window.removeEventListener("resize", measure);
      ro.disconnect();
    };
  }, [pinned, items.length]);

  const { scrollYProgress } = useScroll({
    target: outerRef,
    offset: ["start start", "end end"],
  });
  const eased = useSpring(scrollYProgress, { stiffness: 140, damping: 28, mass: 0.35 });
  const x = useTransform(eased, [0, 1], [0, -travel]);
  const progress = useTransform(eased, [0, 1], ["0%", "100%"]);

  const panels = (
    <>
      {items.map((c, i) => (
        <Link
          key={c.label}
          href={c.href}
          className="group relative block h-full w-[78vw] shrink-0 snap-center overflow-hidden bg-surface-sunken md:w-[min(46vw,520px)]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={c.image}
            alt={c.label}
            loading={i < 2 ? "eager" : "lazy"}
            className="absolute inset-0 h-full w-full scale-[1.02] object-cover transition-all duration-700 ease-standard group-hover:scale-[1.06] group-hover:opacity-0"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={c.hover}
            alt=""
            aria-hidden
            loading="lazy"
            className="absolute inset-0 h-full w-full scale-[1.08] object-cover opacity-0 transition-all duration-700 ease-standard group-hover:scale-[1.02] group-hover:opacity-100"
          />
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(0deg, rgba(10,10,9,0.82) 0%, rgba(10,10,9,0.24) 42%, rgba(10,10,9,0) 68%)",
            }}
          />
          <div className="absolute inset-x-0 bottom-0 p-6 md:p-8">
            <div className="flex items-baseline justify-between gap-4">
              <h3 className="font-display text-heading-lg text-surface-background">{c.label}</h3>
              <span className="shrink-0 font-mono text-micro uppercase tracking-[0.18em] text-surface-background opacity-60">
                {c.spec}
              </span>
            </div>
            <p className="mt-2 text-body-sm text-surface-background opacity-70">{c.desc}</p>
            <span className="mt-5 inline-flex items-center gap-2 border-b border-[rgba(247,247,242,0.4)] pb-1 font-mono text-micro uppercase tracking-[0.18em] text-surface-background transition-colors duration-base group-hover:border-[#7A93D6] group-hover:text-[#7A93D6]">
              View range
              <span aria-hidden className="transition-transform duration-base group-hover:translate-x-1">
                →
              </span>
            </span>
          </div>
          <span className="absolute left-6 top-6 font-mono text-micro tracking-[0.2em] text-surface-background opacity-50 md:left-8 md:top-8">
            {String(i + 1).padStart(2, "0")}
          </span>
        </Link>
      ))}
    </>
  );

  const header = (
    <div className="mx-auto w-full max-w-[1200px] px-5 sm:px-6 lg:px-8 xl:px-10 2xl:px-16 xl:max-w-[1360px] 2xl:max-w-[1440px]">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <Reveal>
            <p className="font-mono text-micro uppercase tracking-[0.28em] text-text-muted">
              <span className="text-brand-accent">02</span>
              <span className="mx-2">/</span>
              The Range
            </p>
          </Reveal>
          <h2 className="mt-5 font-display text-[clamp(2.5rem,5.2vw,4.5rem)] leading-[0.98] tracking-[-0.035em] text-text-primary">
            <Words text="What we cut." delay={0.05} />
          </h2>
        </div>
        <Reveal delay={0.15}>
          <Link
            href="/wholesale/catalogue"
            className="group inline-flex items-center gap-2 border-b border-text-primary pb-1 font-mono text-micro uppercase tracking-[0.18em] text-text-primary transition-colors duration-base hover:border-brand-accent hover:text-brand-accent"
          >
            Full catalogue
            <span aria-hidden className="transition-transform duration-base group-hover:translate-x-1">
              →
            </span>
          </Link>
        </Reveal>
      </div>
    </div>
  );

  // Phone / reduced-motion: a plain snap carousel, no pinning.
  if (!pinned) {
    return (
      <section className="border-b border-border-subtle bg-surface-background py-20 md:py-24">
        {header}
        <div className="mt-12 flex h-[68vh] min-h-[420px] snap-x snap-mandatory gap-px overflow-x-auto bg-border-subtle pl-5 pr-5">
          {panels}
        </div>
      </section>
    );
  }

  return (
    <div
      ref={outerRef}
      className="relative border-b border-border-subtle bg-surface-background"
      style={{ height: `calc(100vh + ${travel}px)` }}
    >
      <div className="sticky top-0 flex h-screen flex-col justify-center overflow-hidden pt-16">
        {header}
        <div className="mt-10 overflow-hidden">
          <motion.div ref={trackRef} style={{ x }} className="flex h-[58vh] min-h-[380px] w-max gap-px bg-border-subtle pl-5 sm:pl-6 lg:pl-8 xl:pl-10 2xl:pl-16">
            {panels}
            {/* Tail spacer so the last panel can clear the right edge. */}
            <div aria-hidden className="h-full w-8 shrink-0 bg-surface-background" />
          </motion.div>
        </div>

        {/* Rail progress — the only affordance that this section scrolls sideways. */}
        <div className="mx-auto mt-8 w-full max-w-[1200px] px-5 sm:px-6 lg:px-8 xl:px-10 2xl:px-16 xl:max-w-[1360px] 2xl:max-w-[1440px]">
          <div className="flex items-center gap-5">
            <span className="font-mono text-micro uppercase tracking-[0.2em] text-text-muted">
              Drag / scroll
            </span>
            <div className="h-px flex-1 bg-border-subtle">
              <motion.div style={{ width: progress }} className="h-full bg-brand-accent" />
            </div>
            <span className="font-mono text-micro tracking-[0.2em] text-text-muted numerics-tabular">
              {String(items.length).padStart(2, "0")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
