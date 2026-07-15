"use client";

import * as React from "react";
import { AnimatePresence, motion, useMotionValue, useTransform, animate } from "framer-motion";
import { useReducedMotion } from "./motion";

/** How long the curtain holds before it lifts, regardless of what the counter is doing. */
const HOLD_MS = 1600;

/**
 * Full-screen intro curtain — the page's opening move.
 *
 * Counts 0→100 against a hairline rule, then lifts as two panels to hand over
 * to the hero. Mounted on the homepage only, so a client-side route change
 * elsewhere never re-triggers it.
 *
 * Deliberately NOT gated on sessionStorage: an SSR'd curtain is painted before
 * React hydrates, so a "seen" check can only ever hide it *after* it has
 * already flashed. Showing it consistently reads as intent; showing it for one
 * frame reads as a bug. It is short and click-skippable instead.
 *
 * CRITICAL: dismissal is driven by a timer, never by the counter's onComplete.
 * Framer's animate() runs on requestAnimationFrame, and rAF is frozen while the
 * tab is backgrounded — so an animation-driven curtain never lifts if the page
 * loads unfocused, leaving the whole site locked behind it with body scroll
 * disabled. Timers still fire (throttled) in background tabs. The counter is
 * decoration; the timeout is the contract.
 */
export function IntroLoader() {
  const reduced = useReducedMotion();
  const [done, setDone] = React.useState(false);
  const [count, setCount] = React.useState(0);

  const mv = useMotionValue(0);
  const scaleX = useTransform(mv, [0, 100], [0, 1]);

  React.useEffect(() => {
    if (reduced) {
      setDone(true);
      return;
    }
    const timer = window.setTimeout(() => setDone(true), HOLD_MS);
    const unsub = mv.on("change", (v) => setCount(Math.round(v)));
    const controls = animate(mv, 100, { duration: HOLD_MS / 1000 - 0.1, ease: [0.65, 0, 0.35, 1] });
    return () => {
      window.clearTimeout(timer);
      controls.stop();
      unsub();
    };
  }, [mv, reduced]);

  // Hold the page still while the curtain is up. Restores on dismiss or unmount.
  React.useEffect(() => {
    if (reduced || done) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [done, reduced]);

  if (reduced) return null;

  return (
    <AnimatePresence>
      {!done ? (
        <motion.div
          className="fixed inset-0 z-[100] cursor-pointer"
          onClick={() => setDone(true)}
          aria-hidden
        >
          {/* Two panels that part on exit. */}
          <motion.div
            className="absolute inset-x-0 top-0 h-1/2 bg-surface-inverse"
            exit={{ y: "-100%" }}
            transition={{ duration: 0.9, ease: [0.76, 0, 0.24, 1] }}
          />
          <motion.div
            className="absolute inset-x-0 bottom-0 h-1/2 bg-surface-inverse"
            exit={{ y: "100%" }}
            transition={{ duration: 0.9, ease: [0.76, 0, 0.24, 1] }}
          />

          <motion.div
            className="relative flex h-full w-full flex-col items-center justify-center"
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            <div className="overflow-hidden">
              <motion.p
                className="font-display text-[clamp(2rem,7vw,4.5rem)] leading-none tracking-[0.24em] text-surface-background"
                initial={{ y: "110%" }}
                animate={{ y: "0%" }}
                transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }}
              >
                RISITEX
              </motion.p>
            </div>

            <div className="mt-8 h-px w-[min(60vw,420px)] overflow-hidden bg-[rgba(247,247,242,0.18)]">
              <motion.div className="h-full origin-left bg-[#7A93D6]" style={{ scaleX }} />
            </div>

            <p className="mt-6 font-mono text-micro uppercase tracking-[0.28em] text-surface-background opacity-50">
              Mill to merchant
            </p>
          </motion.div>

          <p className="absolute bottom-8 right-8 font-mono text-caption text-surface-background opacity-60 numerics-tabular">
            {String(count).padStart(3, "0")}
          </p>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
