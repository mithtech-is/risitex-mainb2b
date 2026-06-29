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

export const fontFamily = {
  display: [
    "GT Sectra",
    "Tiempos Headline",
    "Iowan Old Style",
    "Charter",
    "Georgia",
    "serif",
  ],
  sans: [
    "Inter",
    "Söhne",
    "Geist",
    "system-ui",
    "-apple-system",
    "Segoe UI",
    "Roboto",
    "Helvetica Neue",
    "Arial",
    "sans-serif",
  ],
  mono: [
    "JetBrains Mono",
    "Söhne Mono",
    "IBM Plex Mono",
    "ui-monospace",
    "SFMono-Regular",
    "Menlo",
    "Consolas",
    "monospace",
  ],
} as const;

export type TypographyStyle = {
  fontFamily: "display" | "sans" | "mono";
  fontSize: string;
  lineHeight: string;
  letterSpacing: string;
  fontWeight: 400 | 500 | 600;
  textTransform?: "uppercase";
};

export const textStyles = {
  "display-2xl": {
    fontFamily: "display",
    fontSize: "clamp(3.5rem, 4vw + 1rem, 5rem)",
    lineHeight: "1.05",
    letterSpacing: "-0.03em",
    fontWeight: 400,
  },
  "display-xl": {
    fontFamily: "display",
    fontSize: "clamp(2.75rem, 3vw + 1rem, 3.75rem)",
    lineHeight: "1.07",
    letterSpacing: "-0.025em",
    fontWeight: 400,
  },
  "display-lg": {
    fontFamily: "display",
    fontSize: "clamp(2.25rem, 2vw + 1rem, 2.75rem)",
    lineHeight: "1.09",
    letterSpacing: "-0.02em",
    fontWeight: 400,
  },
  "heading-xl": {
    fontFamily: "sans",
    fontSize: "2rem",
    lineHeight: "1.25",
    letterSpacing: "-0.02em",
    fontWeight: 600,
  },
  "heading-lg": {
    fontFamily: "sans",
    fontSize: "1.5rem",
    lineHeight: "1.33",
    letterSpacing: "-0.015em",
    fontWeight: 600,
  },
  "heading-md": {
    fontFamily: "sans",
    fontSize: "1.25rem",
    lineHeight: "1.4",
    letterSpacing: "-0.01em",
    fontWeight: 600,
  },
  "heading-sm": {
    fontFamily: "sans",
    fontSize: "1.125rem",
    lineHeight: "1.44",
    letterSpacing: "-0.005em",
    fontWeight: 600,
  },
  "body-lg": {
    fontFamily: "sans",
    fontSize: "1rem",
    lineHeight: "1.625",
    letterSpacing: "0",
    fontWeight: 400,
  },
  "body-md": {
    fontFamily: "sans",
    fontSize: "0.875rem",
    lineHeight: "1.57",
    letterSpacing: "0",
    fontWeight: 400,
  },
  "body-sm": {
    fontFamily: "sans",
    fontSize: "0.8125rem",
    lineHeight: "1.54",
    letterSpacing: "0",
    fontWeight: 400,
  },
  caption: {
    fontFamily: "sans",
    fontSize: "0.75rem",
    lineHeight: "1.5",
    letterSpacing: "0.01em",
    fontWeight: 500,
  },
  micro: {
    fontFamily: "sans",
    fontSize: "0.6875rem",
    lineHeight: "1.45",
    letterSpacing: "0.02em",
    fontWeight: 600,
    textTransform: "uppercase",
  },
  "mono-md": {
    fontFamily: "mono",
    fontSize: "0.875rem",
    lineHeight: "1.57",
    letterSpacing: "0",
    fontWeight: 500,
  },
  "mono-sm": {
    fontFamily: "mono",
    fontSize: "0.8125rem",
    lineHeight: "1.54",
    letterSpacing: "0",
    fontWeight: 500,
  },
} as const satisfies Record<string, TypographyStyle>;

export type TextStyleToken = keyof typeof textStyles;
