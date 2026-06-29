/**
 * RISITEX Tailwind preset.
 *
 * Consuming apps:
 *   // tailwind.config.ts
 *   import risitexPreset from "@risitex/ui/tailwind/preset";
 *   export default {
 *     presets: [risitexPreset],
 *     content: ["./src/** / *.{ts,tsx,html}"],
 *   };
 *
 * Design contract:
 *  - Semantic colors resolve through CSS variables declared in styles.css.
 *    Mode-aware: the same `bg-surface-raised` flips between light and dark.
 *  - Primitive scales (ink, paper, indigo, sage, ochre, madder, slateCool)
 *    are also exposed for cases where mode-fixed colors are needed
 *    (e.g., status pills inside a print stylesheet, marketing pages).
 *  - Spacing, radius, shadows, motion all replaced from defaults.
 *  - Typography tokens land as `text-display-xl`, `text-heading-lg`,
 *    `text-body-md`, etc., applied via a small inline plugin.
 *  - Breakpoints match the blueprint's grid section.
 */

import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";
import tailwindcssAnimate from "tailwindcss-animate";

import {
  ink,
  paper,
  indigo,
  sage,
  ochre,
  madder,
  slateCool,
} from "../tokens/colors";
import { spacing } from "../tokens/spacing";
import { radius } from "../tokens/radius";
import { duration, ease } from "../tokens/motion";
import { textStyles, fontFamily, type TypographyStyle } from "../tokens/typography";

/* ---------------------------------------------------------------------------
 * Semantic color names → CSS variables
 * ------------------------------------------------------------------------- */
const semanticColors = {
  surface: {
    background: "var(--surface-background)",
    raised: "var(--surface-raised)",
    sunken: "var(--surface-sunken)",
    overlay: "var(--surface-overlay)",
    inverse: "var(--surface-inverse)",
  },
  text: {
    primary: "var(--text-primary)",
    secondary: "var(--text-secondary)",
    muted: "var(--text-muted)",
    disabled: "var(--text-disabled)",
    "on-accent": "var(--text-on-accent)",
    "on-inverse": "var(--text-on-inverse)",
  },
  border: {
    DEFAULT: "var(--border-subtle)",
    subtle: "var(--border-subtle)",
    strong: "var(--border-strong)",
    focus: "var(--border-focus)",
    inverse: "var(--border-inverse)",
  },
  action: {
    "primary-bg": "var(--action-primary-bg)",
    "primary-bg-hover": "var(--action-primary-bg-hover)",
    "primary-bg-active": "var(--action-primary-bg-active)",
    "primary-text": "var(--action-primary-text)",
    "secondary-bg": "var(--action-secondary-bg)",
    "secondary-bg-hover": "var(--action-secondary-bg-hover)",
    "secondary-text": "var(--action-secondary-text)",
    "danger-bg": "var(--action-danger-bg)",
    "danger-bg-hover": "var(--action-danger-bg-hover)",
    "danger-text": "var(--action-danger-text)",
  },
  feedback: {
    "success-bg": "var(--feedback-success-bg)",
    "success-text": "var(--feedback-success-text)",
    "success-border": "var(--feedback-success-border)",
    "warning-bg": "var(--feedback-warning-bg)",
    "warning-text": "var(--feedback-warning-text)",
    "warning-border": "var(--feedback-warning-border)",
    "danger-bg": "var(--feedback-danger-bg)",
    "danger-text": "var(--feedback-danger-text)",
    "danger-border": "var(--feedback-danger-border)",
    "info-bg": "var(--feedback-info-bg)",
    "info-text": "var(--feedback-info-text)",
    "info-border": "var(--feedback-info-border)",
  },
  brand: {
    accent: "var(--brand-accent)",
    "accent-muted": "var(--brand-accent-muted)",
    "accent-surface": "var(--brand-accent-surface)",
  },
  "image-plate": "var(--image-plate)",
};

/* ---------------------------------------------------------------------------
 * Typography plugin — packs size+lh+tracking+weight per token
 * ------------------------------------------------------------------------- */
const typographyPlugin = plugin(({ addUtilities, theme: _theme }) => {
  const familyMap = {
    display: "var(--font-display)",
    sans: "var(--font-sans)",
    mono: "var(--font-mono)",
  };

  const utilities: Record<string, Record<string, string>> = {};

  for (const [name, raw] of Object.entries(textStyles)) {
    const style = raw as TypographyStyle;
    const base: Record<string, string> = {
      fontFamily: familyMap[style.fontFamily],
      fontSize: style.fontSize,
      lineHeight: style.lineHeight,
      letterSpacing: style.letterSpacing,
      fontWeight: String(style.fontWeight),
    };
    if (style.textTransform === "uppercase") {
      base.textTransform = "uppercase";
    }
    utilities[`.text-${name}`] = base;
  }

  addUtilities(utilities);
});

/* ---------------------------------------------------------------------------
 * Numerics helpers
 * ------------------------------------------------------------------------- */
const numericsPlugin = plugin(({ addUtilities }) => {
  addUtilities({
    ".numerics-tabular": {
      fontVariantNumeric: "tabular-nums lining-nums",
    },
    ".numerics-proportional": {
      fontVariantNumeric: "proportional-nums lining-nums",
    },
  });
});

/* ---------------------------------------------------------------------------
 * Focus ring helper — paired with the CSS-variable halo
 * ------------------------------------------------------------------------- */
const focusRingPlugin = plugin(({ addUtilities }) => {
  addUtilities({
    ".ring-focus": {
      outline: "2px solid var(--border-focus)",
      outlineOffset: "2px",
      boxShadow: "var(--focus-ring-halo)",
    },
  });
});

/* ---------------------------------------------------------------------------
 * Preset
 * ------------------------------------------------------------------------- */
const preset = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: [],
  theme: {
    /* Disable Tailwind defaults that conflict with the design system. */
    spacing,
    borderRadius: radius,

    /* Replace default screens with RISITEX breakpoints. */
    screens: {
      xs: "376px",
      sm: "640px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
      "2xl": "1536px",
    },

    /* Container widths from the grid section. */
    container: {
      center: true,
      padding: {
        DEFAULT: "20px",
        sm: "24px",
        lg: "32px",
        xl: "40px",
        "2xl": "56px",
      },
      screens: {
        sm: "640px",
        md: "768px",
        lg: "1200px",
        xl: "1360px",
        "2xl": "1440px",
      },
    },

    /* Box shadow scale — replaces defaults entirely. */
    boxShadow: {
      none: "none",
      flat: "var(--shadow-flat)",
      rest: "var(--shadow-rest)",
      raised: "var(--shadow-raised)",
      popover: "var(--shadow-popover)",
      modal: "var(--shadow-modal)",
      toast: "var(--shadow-toast)",
      "inset-well": "var(--shadow-inset-well)",
      "focus-halo": "var(--focus-ring-halo)",
    },

    /* Drop the default DropShadow scale entirely — we don't drop-shadow. */
    dropShadow: { none: "0 0 #0000" },

    /* Motion. */
    transitionDuration: {
      0: "0ms",
      instant: duration.instant,
      fast: duration.fast,
      base: duration.base,
      slow: duration.slow,
    },
    transitionTimingFunction: {
      DEFAULT: ease.standard,
      standard: ease.standard,
      enter: ease.enter,
      exit: ease.exit,
      linear: ease.linear,
    },

    /* Font families. */
    fontFamily: {
      display: fontFamily.display as unknown as string[],
      sans: fontFamily.sans as unknown as string[],
      mono: fontFamily.mono as unknown as string[],
    },

    extend: {
      colors: {
        /* Primitive scales — for mode-fixed needs (print, marketing). */
        ink,
        paper,
        indigo,
        sage,
        ochre,
        madder,
        "slate-cool": slateCool,

        /* Semantic colors (CSS variable–backed). */
        surface: semanticColors.surface,
        text: semanticColors.text,
        border: semanticColors.border,
        action: semanticColors.action,
        feedback: semanticColors.feedback,
        brand: semanticColors.brand,
        "image-plate": semanticColors["image-plate"],
      },

      /* Keyframes & animation tokens. */
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-down": {
          "0%": { opacity: "0", transform: "translateY(-8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "slide-right": {
          "0%": { transform: "translateX(100%)" },
          "100%": { transform: "translateX(0)" },
        },
        "slide-up": {
          "0%": { transform: "translateY(100%)" },
          "100%": { transform: "translateY(0)" },
        },
      },
      animation: {
        shimmer: "shimmer 1400ms linear infinite",
        "fade-up": `fade-up ${duration.fast} ${ease.standard}`,
        "fade-down": `fade-down ${duration.fast} ${ease.standard}`,
        "scale-in": `scale-in ${duration.base} ${ease.standard}`,
        "slide-right": `slide-right ${duration.base} ${ease.enter}`,
        "slide-up": `slide-up ${duration.base} ${ease.enter}`,
      },

      /* Custom blur scale for modal backdrops. */
      backdropBlur: {
        modal: "8px",
      },

      /* Z-index ladder. */
      zIndex: {
        base: "0",
        dropdown: "1000",
        sticky: "1020",
        banner: "1030",
        overlay: "1040",
        modal: "1050",
        popover: "1060",
        toast: "1070",
        tooltip: "1080",
      },

      /* Opacity stops we actually use. */
      opacity: {
        0: "0",
        4: "0.04",
        8: "0.08",
        12: "0.12",
        16: "0.16",
        24: "0.24",
        40: "0.4",
        56: "0.56",
        70: "0.7",
        100: "1",
      },

      /* Ring color defaults align with focus. */
      ringColor: {
        DEFAULT: "var(--border-focus)",
        focus: "var(--border-focus)",
      },
      ringOffsetColor: {
        DEFAULT: "var(--surface-background)",
      },
    },
  },

  /*
   * Plugins. Note: we deliberately do NOT depend on tailwindcss-animate so the
   * preset has zero external plugins beyond what Tailwind ships with.
   */
  plugins: [
    typographyPlugin,
    numericsPlugin,
    focusRingPlugin,
    tailwindcssAnimate,
  ],
} satisfies Config;

export default preset;
