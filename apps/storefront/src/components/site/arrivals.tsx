"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { useReducedMotion } from "./fx";

export type Arrival = {
  href: string;
  name: string;
  cat: string;
  spec: string;
  moq: string;
  badge?: string;
  image: string;
  hover: string;
};

/**
 * "New arrivals" — tabbed product grid, per the user's Reformation reference.
 *
 * Cards carry the trade facts a buyer actually filters on (GSM/OZ, MOQ) where
 * a consumer store would put a price, because nothing here is sold by the unit.
 */
export function Arrivals({ items, cats }: { items: Arrival[]; cats: string[] }) {
  const [cat, setCat] = React.useState(cats[0] ?? "All");
  const reduced = useReducedMotion();
  const shown = cat === "All" ? items : items.filter((i) => i.cat === cat);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-8 border-b border-border-subtle pb-4">
        {cats.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            data-cursor=""
            className={`relative pb-2 text-caption uppercase tracking-[0.16em] transition-colors duration-base ${
              cat === c ? "text-text-primary" : "text-text-primary opacity-45 hover:opacity-80"
            }`}
          >
            {c}
            {cat === c ? (
              <motion.span
                layoutId="arrivals-tab"
                className="absolute inset-x-0 -bottom-[17px] h-px bg-text-primary"
              />
            ) : null}
          </button>
        ))}
      </div>

      <div className="mt-10 grid grid-cols-2 gap-x-5 gap-y-12 md:grid-cols-4 md:gap-x-6">
        <AnimatePresence mode="popLayout">
          {shown.map((p, i) => (
            <motion.div
              key={p.name}
              layout
              initial={reduced ? false : { opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? undefined : { opacity: 0, y: -12 }}
              transition={{ duration: 0.55, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
            >
              <Link href={p.href} data-cursor="View" className="group block">
                <div className="relative aspect-[3/4] overflow-hidden bg-surface-sunken">
                  {/* next/image + a real `sizes`: these tiles render ~240–330px
                      wide, so serving the 1500px original (as raw <img> did) was
                      ~6x the pixels needed, twice over — base AND hover. */}
                  <Image
                    src={p.image}
                    alt={p.name}
                    fill
                    sizes="(min-width: 768px) 25vw, 50vw"
                    className="object-cover transition-all duration-700 ease-standard group-hover:scale-[1.05] group-hover:opacity-0"
                  />
                  <Image
                    src={p.hover}
                    alt=""
                    aria-hidden
                    fill
                    sizes="(min-width: 768px) 25vw, 50vw"
                    className="scale-[1.06] object-cover opacity-0 transition-all duration-700 ease-standard group-hover:scale-100 group-hover:opacity-100"
                  />
                  {p.badge ? (
                    <span className="absolute left-3 top-3 bg-text-primary px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-surface-background">
                      {p.badge}
                    </span>
                  ) : null}
                  {/* Slide-up CTA — the reference's hover affordance. */}
                  <span className="absolute inset-x-0 bottom-0 translate-y-full bg-text-primary py-3 text-center text-[11px] uppercase tracking-[0.18em] text-surface-background transition-transform duration-500 ease-standard group-hover:translate-y-0">
                    Add to cart
                  </span>
                </div>
                <div className="mt-4 flex items-baseline justify-between gap-3">
                  <p className="text-body-sm text-text-primary">{p.name}</p>
                  <span className="shrink-0 text-micro uppercase tracking-[0.12em] text-text-primary opacity-50">
                    {p.spec}
                  </span>
                </div>
                <p className="mt-1 text-caption text-text-primary opacity-45">MOQ {p.moq}</p>
              </Link>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
