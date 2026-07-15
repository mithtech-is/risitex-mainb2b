"use client";

import * as React from "react";
import Link from "next/link";
import { motion, useScroll, useTransform, useSpring } from "framer-motion";
import { useReducedMotion } from "./motion";

/**
 * Hero — a three-panel photographic triptych under one headline.
 *
 * Why a triptych and not one full-bleed photograph: every source image we have
 * is portrait. Stretching a 2:3 frame across a 16:9 viewport with object-cover
 * throws away ~60% of the picture and lands on a meaningless mid-body crop.
 * Three portrait panels fill the same viewport while each frame is shown at
 * roughly its native ratio — and it puts three photographs on screen at once,
 * which is the whole point of an image-led page.
 *
 * Panels rise staggered on load, then part at different rates on scroll.
 * Collapses to the single lead panel below `md`.
 */

const PANELS = [
  { src: "/demo/products/photo-04.jpg", alt: "RISITEX cut-and-sew innerwear", depth: 0.14, lead: true },
  { src: "/demo/products/photo-09.jpg", alt: "Loom-state cotton, undyed", depth: 0.3 },
  { src: "/demo/products/photo-12.jpg", alt: "Indigo denim, stitch detail", depth: 0.2 },
];

function Panel({
  src,
  alt,
  depth,
  progress,
  index,
  reduced,
}: {
  src: string;
  alt: string;
  depth: number;
  progress: ReturnType<typeof useScroll>["scrollYProgress"];
  index: number;
  reduced: boolean;
}) {
  const y = useTransform(progress, [0, 1], ["0%", `${depth * 100}%`]);
  return (
    <motion.div
      className="relative h-full flex-1 overflow-hidden"
      initial={reduced ? false : { y: "18%", opacity: 0 }}
      animate={reduced ? undefined : { y: "0%", opacity: 1 }}
      transition={{
        duration: 1.25,
        delay: reduced ? 0 : 1.05 + index * 0.12,
        ease: [0.2, 0.8, 0.2, 1],
      }}
    >
      <motion.div style={reduced ? undefined : { y }} className="absolute inset-0 h-[132%] -top-[16%]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="h-full w-full object-cover" />
      </motion.div>
    </motion.div>
  );
}

export function Hero() {
  const ref = React.useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const eased = useSpring(scrollYProgress, { stiffness: 130, damping: 30, mass: 0.4 });

  // Type lifts faster than the photography and dims as it goes.
  const typeY = useTransform(eased, [0, 1], ["0%", "-46%"]);
  const typeOpacity = useTransform(eased, [0, 0.72], [1, 0]);

  const rise = (delay: number) =>
    reduced
      ? {}
      : {
          initial: { y: "110%" },
          animate: { y: "0%" },
          transition: { duration: 1, delay, ease: [0.2, 0.8, 0.2, 1] as const },
        };

  return (
    <section
      ref={ref}
      className="relative h-[100svh] min-h-[560px] w-full overflow-hidden border-b border-border-subtle bg-surface-inverse"
    >
      {/* Photography */}
      <div className="absolute inset-0 z-0 flex gap-px">
        {PANELS.map((p, i) => (
          <div key={p.src} className={p.lead ? "flex h-full flex-1" : "hidden h-full flex-1 md:flex"}>
            <Panel {...p} progress={eased} index={i} reduced={reduced} />
          </div>
        ))}
      </div>

      {/* Scrim — bottom-weighted so the photographs stay legible up top. */}
      <div
        aria-hidden
        className="absolute inset-0 z-0"
        style={{
          background:
            "linear-gradient(0deg, rgba(10,10,9,0.9) 0%, rgba(10,10,9,0.5) 34%, rgba(10,10,9,0.12) 62%, rgba(10,10,9,0.3) 100%)",
        }}
      />

      {/* Type */}
      <motion.div
        style={reduced ? undefined : { y: typeY, opacity: typeOpacity }}
        className="relative z-10 flex h-full flex-col justify-end pb-12 md:pb-16"
      >
        <div className="mx-auto w-full max-w-[1200px] px-5 sm:px-6 lg:px-8 xl:px-10 2xl:px-16 xl:max-w-[1360px] 2xl:max-w-[1440px]">
          <div className="overflow-hidden">
            <motion.p
              className="font-mono text-micro uppercase tracking-[0.28em] text-surface-background opacity-70"
              {...rise(1.15)}
            >
              Est. 2019 · Bangalore, Karnataka
            </motion.p>
          </div>

          <h1 className="mt-5 font-display text-[clamp(2.75rem,10.5vw,10rem)] leading-[0.85] tracking-[-0.045em] text-surface-background">
            <span className="block overflow-hidden">
              <motion.span className="block" {...rise(1.25)}>
                Manufactured
              </motion.span>
            </span>
            <span className="block overflow-hidden">
              <motion.span className="block" {...rise(1.35)}>
                in <em className="italic text-[#7A93D6]">India.</em>
              </motion.span>
            </span>
          </h1>

          <div className="mt-8 flex flex-wrap items-end justify-between gap-8 border-t border-[rgba(247,247,242,0.22)] pt-6">
            <motion.p
              className="max-w-[42ch] text-body-lg leading-relaxed text-surface-background opacity-80"
              initial={reduced ? false : { opacity: 0, y: 16 }}
              animate={reduced ? undefined : { opacity: 0.8, y: 0 }}
              transition={{ duration: 0.8, delay: 1.5, ease: [0.2, 0.8, 0.2, 1] }}
            >
              Knitwear, denim and innerwear cut to order for the trade.
              Factory-direct, GST invoiced, from 240 pieces.
            </motion.p>

            <motion.div
              className="flex flex-wrap items-center gap-8"
              initial={reduced ? false : { opacity: 0, y: 16 }}
              animate={reduced ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 1.6, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <Link
                href="/wholesale/catalogue"
                className="group inline-flex items-center gap-2 border-b border-surface-background pb-1 font-mono text-micro uppercase tracking-[0.18em] text-surface-background transition-colors duration-base hover:border-[#7A93D6] hover:text-[#7A93D6]"
              >
                Explore the range
                <span aria-hidden className="transition-transform duration-base group-hover:translate-x-1">
                  →
                </span>
              </Link>
            </motion.div>
          </div>
        </div>
      </motion.div>

      {/* Scroll cue */}
      <motion.div
        aria-hidden
        className="absolute bottom-5 right-5 z-10 hidden items-center gap-3 md:right-8 md:flex"
        initial={reduced ? false : { opacity: 0 }}
        animate={reduced ? undefined : { opacity: 1 }}
        transition={{ duration: 0.8, delay: 1.9 }}
        style={reduced ? undefined : { opacity: typeOpacity }}
      >
        <span className="font-mono text-micro uppercase tracking-[0.24em] text-surface-background opacity-60">
          Scroll
        </span>
        <span className="relative block h-10 w-px overflow-hidden bg-[rgba(247,247,242,0.3)]">
          <motion.span
            className="absolute inset-x-0 top-0 block h-4 bg-[#7A93D6]"
            animate={reduced ? undefined : { y: ["-100%", "250%"] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          />
        </span>
      </motion.div>
    </section>
  );
}
