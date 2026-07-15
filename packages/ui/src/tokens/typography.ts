/**
 * Typography tokens — three faces and a 14-step type scale.
 *
 * Families list the recommended primary plus fallbacks so the system degrades
 * gracefully when the foundry face isn't loaded. The scale is fluid where the
 * blueprint specifies clamp().
 *
 * Each style packs size + line-height + tracking + weight. Numeric features
 * (tabular, lining) are applied via OpenType features in styles.css globally;
 * components that need proportional figures opt out with `font-variant-numeric:
 * proportional-nums`.
 */

/**
 * One typeface, three tokens.
 *
 * The product renders entirely in **Space Grotesk**. `display` / `sans` / `mono`
 * are kept as distinct tokens so existing `font-display` and `font-mono`
 * usages keep resolving, but they intentionally point at the same family —
 * there is no second face anywhere on the site.
 *
 * `mono` is not monospaced: a mono face was only ever here to align digits, and
 * `font-variant-numeric: tabular-nums` (applied globally in styles.css) does
 * that in Space Grotesk without a second download.
 *
 * ⚠ TWO SOURCES OF TRUTH — CHANGE BOTH OR NEITHER TAKES EFFECT.
 * `text-*` utilities resolve `var(--font-*)` from styles.css, but the
 * `font-display` / `font-sans` / `font-mono` utilities are built from THIS
 * array (see tailwind/preset.ts ~L232) and bypass the variables entirely. They
 * disagreed once and every heading silently rendered in Georgia. Also
 * `rm -rf apps/storefront/.next` after editing — the preset is a JS import and
 * Tailwind will not re-evaluate it on a plain dev restart.
 */
const SPACE_GROTESK_STACK = [
  "Space Grotesk",
  "system-ui",
  "-apple-system",
  "Segoe UI",
  "Roboto",
  "Helvetica Neue",
  "Arial",
  "sans-serif",
] as const;

export const fontFamily = {
  display: SPACE_GROTESK_STACK,
  sans: SPACE_GROTESK_STACK,
  mono: SPACE_GROTESK_STACK,
} as const;

export type TypographyStyle = {
  fontFamily: "display" | "sans" | "mono";
  fontSize: string;
  lineHeight: string;
  letterSpacing: string;
  fontWeight: 400 | 500 | 600;
  textTransform?: "uppercase";
};

/*
 * The scale was raised one full step in 2026-07 because the site read as too
 * small to customers. The old baseline was `body-md` = 14px — a dashboard
 * density, applied site-wide via <body> — with `body-lg` = 16px, i.e. what most
 * sites call normal was our "large", and everything above and below inherited
 * that deficit. `micro` at 11px was carrying section labels on the homepage.
 *
 * Body now starts at 16px and every step moved up with it. Sizes are in rem so
 * they honour the reader's browser setting; line-heights are unitless and
 * scale with the size, so they were left alone.
 *
 * These tokens are consumed by EVERY surface — marketing, catalogue, checkout,
 * invoices, dashboard. Before shrinking one to make a dense table fit, fix the
 * table: the scale is the contract.
 */
export const textStyles = {
  "display-2xl": {
    fontFamily: "display",
    fontSize: "clamp(4rem, 5vw + 1rem, 6.5rem)",
    lineHeight: "1.02",
    letterSpacing: "-0.035em",
    fontWeight: 400,
  },
  "display-xl": {
    fontFamily: "display",
    fontSize: "clamp(3.25rem, 3.5vw + 1rem, 4.75rem)",
    lineHeight: "1.05",
    letterSpacing: "-0.03em",
    fontWeight: 400,
  },
  "display-lg": {
    fontFamily: "display",
    fontSize: "clamp(2.75rem, 2.5vw + 1rem, 3.5rem)",
    lineHeight: "1.07",
    letterSpacing: "-0.025em",
    fontWeight: 400,
  },
  "heading-xl": {
    fontFamily: "sans",
    fontSize: "2.5rem",
    lineHeight: "1.2",
    letterSpacing: "-0.022em",
    fontWeight: 600,
  },
  "heading-lg": {
    fontFamily: "sans",
    fontSize: "1.875rem",
    lineHeight: "1.28",
    letterSpacing: "-0.018em",
    fontWeight: 600,
  },
  "heading-md": {
    fontFamily: "sans",
    fontSize: "1.5rem",
    lineHeight: "1.35",
    letterSpacing: "-0.012em",
    fontWeight: 600,
  },
  "heading-sm": {
    fontFamily: "sans",
    fontSize: "1.25rem",
    lineHeight: "1.4",
    letterSpacing: "-0.008em",
    fontWeight: 600,
  },
  "body-lg": {
    fontFamily: "sans",
    fontSize: "1.1875rem",
    lineHeight: "1.6",
    letterSpacing: "0",
    fontWeight: 400,
  },
  "body-md": {
    fontFamily: "sans",
    fontSize: "1rem",
    lineHeight: "1.6",
    letterSpacing: "0",
    fontWeight: 400,
  },
  "body-sm": {
    fontFamily: "sans",
    fontSize: "0.9375rem",
    lineHeight: "1.55",
    letterSpacing: "0",
    fontWeight: 400,
  },
  caption: {
    fontFamily: "sans",
    fontSize: "0.875rem",
    lineHeight: "1.5",
    letterSpacing: "0.01em",
    fontWeight: 500,
  },
  micro: {
    fontFamily: "sans",
    fontSize: "0.8125rem",
    lineHeight: "1.45",
    letterSpacing: "0.02em",
    fontWeight: 600,
    textTransform: "uppercase",
  },
  "mono-md": {
    fontFamily: "mono",
    fontSize: "1rem",
    lineHeight: "1.6",
    letterSpacing: "0",
    fontWeight: 500,
  },
  "mono-sm": {
    fontFamily: "mono",
    fontSize: "0.9375rem",
    lineHeight: "1.55",
    letterSpacing: "0",
    fontWeight: 500,
  },
} as const satisfies Record<string, TypographyStyle>;

export type TextStyleToken = keyof typeof textStyles;
