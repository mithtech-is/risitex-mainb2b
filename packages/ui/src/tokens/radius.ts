/**
 * Border radius scale — 7 steps + full.
 *
 * Components communicate identity through radius: tables = none, inputs = sm,
 * buttons = md, cards = lg, modals = xl, hero = 2xl, pills = full.
 *
 * Nested radii must satisfy outer = inner + padding (see §9).
 */

export const radius = {
  none: "0px",
  xs: "4px",
  sm: "6px",
  md: "8px",
  lg: "12px",
  xl: "16px",
  "2xl": "24px",
  full: "9999px",
} as const;

export type RadiusToken = keyof typeof radius;
