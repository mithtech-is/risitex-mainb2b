"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useReducedMotion } from "./fx";

export type Faq = { q: string; a: string };

/**
 * FAQ accordion — exclusive: opening one closes the rest.
 *
 * Design notes, because the first pass read badly:
 *   - FULL WIDTH. It was a 4/8 grid, which parked the heading in a narrow
 *     column and left an enormous dead gap beside short questions. A Q&A list
 *     is a list; it wants the whole measure.
 *   - The question is the hit target and it is BIG (heading-md). A FAQ row that
 *     looks like body copy reads as a paragraph, not a control.
 *   - The open row lifts onto `surface-sunken` with an accent rule down its
 *     left edge, so "which one is open" is answered by shape, not by a tiny
 *     glyph. The answer indents under the question rather than aligning to the
 *     number, giving it a clear parent.
 *   - Rows are generously tall (py-8) with a real hover state, because dense
 *     hairline rows were what made it feel cheap.
 *
 * Not <details>: it cannot animate height, and it cannot be exclusive without
 * JS fighting its own toggle.
 */
export function FaqList({ items }: { items: Faq[] }) {
  const [open, setOpen] = React.useState<number | null>(0);
  const reduced = useReducedMotion();

  return (
    <div className="border-t border-border-subtle">
      {items.map((f, i) => {
        const isOpen = open === i;
        return (
          <div
            key={f.q}
            className={`group relative border-b border-border-subtle transition-colors duration-slow ${
              isOpen ? "bg-surface-sunken" : "hover:bg-surface-sunken"
            }`}
          >
            {/* Left accent rail — grows on open. Shape, not a glyph. */}
            <span
              aria-hidden
              className={`absolute left-0 top-0 h-full w-[3px] origin-top bg-brand-accent transition-transform duration-500 ease-standard ${
                isOpen ? "scale-y-100" : "scale-y-0"
              }`}
            />

            <h3>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : i)}
                aria-expanded={isOpen}
                aria-controls={`faq-panel-${i}`}
                data-cursor=""
                className="flex w-full items-center gap-6 px-5 py-8 text-left md:gap-10 md:px-8"
              >
                <span
                  className={`shrink-0 text-caption tracking-[0.2em] transition-colors duration-base numerics-tabular ${
                    isOpen ? "text-brand-accent" : "text-text-muted"
                  }`}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>

                <span className="flex-1 text-heading-sm leading-snug text-text-primary transition-transform duration-slow ease-standard group-hover:translate-x-1">
                  {f.q}
                </span>

                {/* Circular +/− — a real control, sized like one. */}
                <span
                  aria-hidden
                  className={`relative grid h-10 w-10 shrink-0 place-items-center rounded-full border transition-all duration-500 ease-standard ${
                    isOpen
                      ? "rotate-90 border-brand-accent bg-brand-accent"
                      : "border-border-strong group-hover:border-text-primary"
                  }`}
                >
                  <span
                    className={`absolute h-px w-4 transition-colors duration-300 ${
                      isOpen ? "bg-text-on-accent" : "bg-text-primary"
                    }`}
                  />
                  <span
                    className={`absolute h-4 w-px transition-all duration-500 ${
                      isOpen ? "scale-y-0 bg-text-on-accent" : "bg-text-primary"
                    }`}
                  />
                </span>
              </button>
            </h3>

            <AnimatePresence initial={false}>
              {isOpen ? (
                <motion.div
                  id={`faq-panel-${i}`}
                  key="panel"
                  initial={reduced ? false : { height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={reduced ? undefined : { height: 0, opacity: 0 }}
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <p className="max-w-[68ch] pb-8 pl-[52px] pr-5 text-body-md leading-relaxed text-text-secondary md:pl-[76px] md:pr-8">
                    {f.a}
                  </p>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
