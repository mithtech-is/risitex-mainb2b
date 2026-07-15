"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion, useMotionValue, useSpring } from "framer-motion";
import { useIsDesktop, useReducedMotion } from "./motion";

export type HoverRow = {
  n: string;
  title: string;
  desc: string;
  image: string;
  href?: string;
};

/**
 * Editorial list where hovering a row summons its photograph to the cursor.
 *
 * This is what keeps a long text section from reading as dead space: the copy
 * stays a clean typographic list, and the imagery arrives on intent instead of
 * being parked in a grid nobody looks at.
 *
 * The floating plate is desktop-only — there is no hover on touch, so phones
 * get a static thumbnail inline on each row instead of nothing.
 */
export function HoverRows({
  rows,
  className = "",
}: {
  rows: HoverRow[];
  className?: string;
}) {
  const hostRef = React.useRef<HTMLDivElement>(null);
  const isDesktop = useIsDesktop(1024);
  const reduced = useReducedMotion();
  const live = isDesktop && !reduced;

  const [active, setActive] = React.useState<number | null>(null);
  const activeRow = active === null ? undefined : rows[active];

  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const x = useSpring(mx, { stiffness: 260, damping: 28, mass: 0.6 });
  const y = useSpring(my, { stiffness: 260, damping: 28, mass: 0.6 });

  React.useEffect(() => {
    if (!live) return;
    const host = hostRef.current;
    if (!host) return;
    const move = (e: MouseEvent) => {
      const r = host.getBoundingClientRect();
      mx.set(e.clientX - r.left);
      my.set(e.clientY - r.top);
    };
    host.addEventListener("mousemove", move);
    return () => host.removeEventListener("mousemove", move);
  }, [live, mx, my]);

  return (
    <div ref={hostRef} className={`relative ${className}`}>
      {/* Floating plate — follows the pointer, swaps art per row. */}
      {live ? (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 z-20 hidden lg:block"
          style={{ x, y }}
        >
          <AnimatePresence>
            {activeRow ? (
              <motion.div
                key={active}
                className="relative -ml-[130px] -mt-[170px] h-[340px] w-[260px] overflow-hidden bg-surface-sunken"
                initial={{ opacity: 0, scale: 0.9, rotate: -3 }}
                animate={{ opacity: 1, scale: 1, rotate: -2 }}
                exit={{ opacity: 0, scale: 0.94, rotate: -4 }}
                transition={{ duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={activeRow.image}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </motion.div>
      ) : null}

      <div className="border-t border-border-subtle">
        {rows.map((r, i) => {
          const Row = r.href ? Link : "div";
          return (
            <Row
              // @ts-expect-error — href only exists on the Link branch.
              href={r.href}
              key={r.n}
              className="group relative block border-b border-border-subtle py-8 transition-colors duration-base hover:bg-surface-sunken"
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
            >
              <div className="relative z-10 mx-auto w-full max-w-[1200px] px-5 sm:px-6 lg:px-8 xl:px-10 2xl:px-16 xl:max-w-[1360px] 2xl:max-w-[1440px]">
                <div className="grid grid-cols-1 items-baseline gap-3 md:grid-cols-12 md:gap-6">
                  <span className="font-mono text-micro tracking-[0.2em] text-text-muted md:col-span-1">
                    {r.n}
                  </span>

                  {/* Touch fallback: the art still shows, just parked inline. */}
                  <div className="relative h-[180px] w-full overflow-hidden bg-surface-sunken md:col-span-3 lg:hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={r.image} alt="" loading="lazy" className="h-full w-full object-cover" />
                  </div>

                  <h3 className="font-display text-heading-md text-text-primary transition-transform duration-slow ease-standard group-hover:translate-x-2 group-hover:text-brand-accent md:col-span-4 lg:col-span-3">
                    {r.title}
                  </h3>
                  <p className="text-body-md leading-relaxed text-text-secondary md:col-span-7 lg:col-span-8">
                    {r.desc}
                  </p>
                </div>
              </div>
            </Row>
          );
        })}
      </div>
    </div>
  );
}
