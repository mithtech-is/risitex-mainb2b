/**
 * Spacing scale — 4pt base, with one 1px hairline and one 2px half-step.
 *
 * Numeric keys match Tailwind's spacing keys where possible (1 = 4px, 2 = 8px,
 * …). Half-steps and px-hairline are accessed as string keys.
 *
 * Components must never use arbitrary spacing. If a value isn't here, add it
 * here first.
 */

export const spacing = {
  0: "0px",
  px: "1px",
  "0.5": "2px",
  1: "4px",
  2: "8px",
  3: "12px",
  4: "16px",
  5: "20px",
  6: "24px",
  8: "32px",
  10: "40px",
  12: "48px",
  16: "64px",
  20: "80px",
  24: "96px",
  32: "128px",
} as const;

export type SpacingToken = keyof typeof spacing;
