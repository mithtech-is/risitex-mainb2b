/**
 * Motion tokens — durations + easings.
 *
 * Motion is a witness, not a performer. Defaults below are tuned against the
 * blueprint §10. Spring presets target Framer Motion's spring API.
 */

export const duration = {
  instant: "80ms",
  fast: "140ms",
  base: "200ms",
  slow: "320ms",
  storytelling: "480ms",
} as const;

export const ease = {
  standard: "cubic-bezier(0.2, 0, 0, 1)",
  enter: "cubic-bezier(0, 0, 0, 1)",
  exit: "cubic-bezier(0.4, 0, 1, 1)",
  linear: "linear",
} as const;

/**
 * Spring presets for Framer Motion. Consumers spread these into the
 * `transition` prop where a spring is appropriate (toggles, swatches, drawers).
 */
export const spring = {
  soft: { type: "spring" as const, stiffness: 320, damping: 30, mass: 0.8 },
  tight: { type: "spring" as const, stiffness: 400, damping: 36, mass: 0.7 },
} as const;

export type DurationToken = keyof typeof duration;
export type EaseToken = keyof typeof ease;
export type SpringToken = keyof typeof spring;
