import type { Transition } from "framer-motion";

/**
 * Transition presets — the durations + easings from the blueprint, packaged
 * as Framer Motion transition objects.
 */

const standard: [number, number, number, number] = [0.2, 0, 0, 1];
const enter: [number, number, number, number] = [0, 0, 0, 1];
const exit: [number, number, number, number] = [0.4, 0, 1, 1];

export const t = {
  instant: { duration: 0.08, ease: standard } satisfies Transition,
  fast: { duration: 0.14, ease: standard } satisfies Transition,
  base: { duration: 0.2, ease: standard } satisfies Transition,
  slow: { duration: 0.32, ease: standard } satisfies Transition,
  enter: { duration: 0.2, ease: enter } satisfies Transition,
  exit: { duration: 0.14, ease: exit } satisfies Transition,
  springSoft: {
    type: "spring",
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  } satisfies Transition,
  springTight: {
    type: "spring",
    stiffness: 400,
    damping: 36,
    mass: 0.7,
  } satisfies Transition,
} as const;

export const easings = {
  standard,
  enter,
  exit,
} as const;
